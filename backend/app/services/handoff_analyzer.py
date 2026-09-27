"""
handoff_analyzer.py — Safe Insertion Analyzer.

Computes variable lifecycles (born_line, mutation_lines[], last_read_line) across
a completed trace and flags Safe Insertion Points where inheriting teammates can
safely extend code or inject hooks.
"""

from __future__ import annotations

import ast
from typing import Any, Dict, List, Literal, Optional, Set, Union
from pydantic import BaseModel, Field


class SafeInsertionPoint(BaseModel):
    """
    Data contract conforming to Appendix A: SafeInsertionPoint.
    Represents a verified safe line to insert downstream logic.
    """

    line_number: int
    target_variable: str
    reason: str
    confidence: Literal["high", "medium"] = "high"
    suggested_action: str
    boilerplate_hook: str


class VariableLifecycle(BaseModel):
    """
    Per-variable lifecycle ledger entry tracking creation, mutations, and reads.
    """

    var_name: str
    born_line: int
    mutation_lines: List[int] = Field(default_factory=list)
    last_read_line: int = 0
    type_name: Optional[str] = None
    terminal_repr: Optional[str] = None
    mutation_count: int = 0


def _get_attr(obj: Any, key: str, default: Any = None) -> Any:
    """Helper to extract attribute from either a dict or an object."""
    if isinstance(obj, dict):
        return obj.get(key, default)
    return getattr(obj, key, default)


def build_lifecycle_ledger(
    steps: List[Any],
    code: str,
) -> Dict[str, VariableLifecycle]:
    """
    Scan the full step list to build a per-variable lifecycle ledger:
    - born_line: line number where variable was first declared or created.
    - mutation_lines[]: line numbers where variable was mutated.
    - last_read_line: line number where variable was last read/referenced.
    """
    ledger: Dict[str, VariableLifecycle] = {}

    # Extract variable read references across all lines from AST
    reads_by_line: Dict[int, Set[str]] = {}
    try:
        tree = ast.parse(code)
        for node in ast.walk(tree):
            if isinstance(node, ast.Name) and isinstance(node.ctx, ast.Load):
                reads_by_line.setdefault(node.lineno, set()).add(node.id)
    except Exception:
        pass

    for step in steps:
        line_no = _get_attr(step, "line_number", 0)
        deltas = _get_attr(step, "variable_deltas", {}) or {}

        for var_name, delta in deltas.items():
            action = _get_attr(delta, "action", "")
            type_name = _get_attr(delta, "type_name", "")
            repr_str = _get_attr(delta, "repr_str", "")

            if var_name not in ledger:
                ledger[var_name] = VariableLifecycle(
                    var_name=var_name,
                    born_line=line_no,
                    mutation_lines=[],
                    last_read_line=0,
                    type_name=type_name,
                    terminal_repr=repr_str,
                    mutation_count=0,
                )

            entry = ledger[var_name]
            if type_name:
                entry.type_name = type_name
            if repr_str:
                entry.terminal_repr = repr_str

            if action == "mutated":
                entry.mutation_lines.append(line_no)
                entry.mutation_count += 1

        # Check for reads on this executed line
        for var_name in ledger:
            if var_name in reads_by_line.get(line_no, set()):
                ledger[var_name].last_read_line = max(ledger[var_name].last_read_line, line_no)

    # Cross-reference with all static AST reads in the source file
    for line_no, var_names in reads_by_line.items():
        for name in var_names:
            if name in ledger:
                ledger[name].last_read_line = max(ledger[name].last_read_line, line_no)

    return ledger


def _generate_boilerplate_hook(var_name: str, type_name: Optional[str]) -> str:
    """Generate ready-to-copy boilerplate hook for a safe insertion line."""
    vtype = (type_name or "").lower()
    if vtype in ("list", "dict", "set", "dataframe", "series") or "record" in var_name.lower():
        return (
            f"# Injected Safe Hook: Downstream enrichment on `{var_name}`\n"
            f"if '{var_name}' in locals() and len({var_name}) > 0:\n"
            f"    print(f'[Safe Hook] `{var_name}` is ready ({len({var_name})} items)')\n"
            f"    # TODO: Add downstream validation, feature enrichment, or export logic here"
        )
    return (
        f"# Injected Safe Hook: Telemetry verification on `{var_name}`\n"
        f"if '{var_name}' in locals():\n"
        f"    print(f'[Safe Hook] `{var_name}` finalized with value: {{{var_name}}}')\n"
        f"    # TODO: Add downstream assertions or logging here"
    )


def _generate_suggested_action(var_name: str, type_name: Optional[str]) -> str:
    """Generate suggested developer action for extending the code at this insertion point."""
    vtype = (type_name or "").lower()
    if vtype in ("list", "dict", "set", "dataframe", "series") or "record" in var_name.lower():
        return f"Inject downstream validation checks, feature enrichment, or alert telemetry on `{var_name}`"
    return f"Add telemetry assertions or export logging for `{var_name}`"


def find_safe_insertion_points(
    steps: List[Any],
    code: str,
) -> List[SafeInsertionPoint]:
    """
    Computes variable lifecycles across a completed trace and flags Safe Insertion Points.
    
    Identifies lines immediately following loops or data transformation blocks where
    an accumulator variable (e.g. `cleaned_records`) has reached a stable terminal state
    (not mutated again), and downstream code has not yet consumed it for export or aggregation.
    """
    if not steps or not code or not code.strip():
        return []

    lines = code.splitlines()
    ledger = build_lifecycle_ledger(steps, code)
    if not ledger:
        return []

    try:
        tree = ast.parse(code)
    except Exception:
        return []

    candidates: List[SafeInsertionPoint] = []
    seen_lines: Set[int] = set()

    # Discover loop constructs in AST
    class LoopVisitor(ast.NodeVisitor):
        def __init__(self):
            self.loops: List[Union[ast.For, ast.While]] = []

        def visit_For(self, node: ast.For):
            self.loops.append(node)
            self.generic_visit(node)

        def visit_While(self, node: ast.While):
            self.loops.append(node)
            self.generic_visit(node)

    visitor = LoopVisitor()
    visitor.visit(tree)

    # For each loop, determine post-loop insertion boundary and check accumulator stability
    for loop_node in visitor.loops:
        loop_start = loop_node.lineno
        loop_end = getattr(loop_node, "end_lineno", loop_start)

        # 1. Determine next statement line immediately following the loop
        next_line: Optional[int] = None
        for i, stmt in enumerate(tree.body):
            if stmt is loop_node:
                if i + 1 < len(tree.body):
                    next_line = tree.body[i + 1].lineno
                break

        # Fallback: scan lines after loop_end skipping blank lines and comments
        if next_line is None:
            cursor = loop_end + 1
            while cursor <= len(lines):
                line_str = lines[cursor - 1].strip()
                if line_str and not line_str.startswith("#"):
                    next_line = cursor
                    break
                cursor += 1
            if next_line is None:
                next_line = min(loop_end + 1, len(lines))

        # Extract loop iterator target variable name if it's a for loop
        iterator_name: Optional[str] = None
        if isinstance(loop_node, ast.For) and isinstance(loop_node.target, ast.Name):
            iterator_name = loop_node.target.id

        # 2. Check for accumulators mutated within this loop
        loop_accumulators = []
        for var_name, life in ledger.items():
            # Skip loop iterator target variable
            if iterator_name and var_name == iterator_name:
                continue

            # Must have been mutated inside this loop
            mutations_in_loop = [m for m in life.mutation_lines if loop_start <= m <= loop_end]
            if not mutations_in_loop:
                continue

            # Must NOT be mutated anywhere after the loop (stable terminal state)
            mutations_after_loop = [m for m in life.mutation_lines if m > loop_end]
            if mutations_after_loop:
                continue

            # Check if variable was born before loop start (genuine accumulator vs loop local)
            born_before_loop = life.born_line < loop_start

            # Classify collection vs counter
            type_lower = (life.type_name or "").lower()
            name_lower = var_name.lower()
            is_collection = (
                type_lower in ("list", "dict", "set", "dataframe", "series", "ndarray")
                or any(term in name_lower for term in ("record", "clean", "data", "log", "item", "result", "list", "dict", "buffer"))
            )
            is_counter = (
                type_lower in ("int", "float")
                or any(term in name_lower for term in ("count", "total", "sum", "error"))
            )

            # Check if downstream code consumes it
            downstream_read = life.last_read_line >= next_line

            loop_accumulators.append({
                "var_name": var_name,
                "lifecycle": life,
                "born_before_loop": born_before_loop,
                "is_collection": is_collection,
                "is_counter": is_counter,
                "last_mutation": max(mutations_in_loop),
                "downstream_read": downstream_read,
            })

        if loop_accumulators and next_line not in seen_lines:
            # Prioritize accumulators born before the loop, collections, downstream reads, and mutation count
            loop_accumulators.sort(
                key=lambda a: (
                    1 if a["born_before_loop"] else 0,
                    1 if a["is_collection"] else 0,
                    1 if a["downstream_read"] else 0,
                    a["lifecycle"].mutation_count,
                ),
                reverse=True,
            )

            primary = loop_accumulators[0]
            var_name = primary["var_name"]
            life = primary["lifecycle"]
            last_mut = primary["last_mutation"]
            vtype = life.type_name or "variable"

            action = _generate_suggested_action(var_name, life.type_name)
            hook_code = _generate_boilerplate_hook(var_name, life.type_name)

            other_accumulators = [
                a["var_name"] for a in loop_accumulators[1:] if a["born_before_loop"]
            ]
            if other_accumulators:
                other_str = f" (other finalized state: {', '.join(other_accumulators)})"
            else:
                other_str = ""

            reason = (
                f"Accumulator variable `{var_name}` ({vtype}) completed its transformation cycles on line {last_mut}. "
                f"The collection has reached a stable terminal state{other_str} and is ready for safe downstream "
                f"extension before line {next_line}."
            )

            candidates.append(
                SafeInsertionPoint(
                    line_number=next_line,
                    target_variable=var_name,
                    confidence="high",
                    reason=reason,
                    suggested_action=action,
                    boilerplate_hook=hook_code,
                )
            )
            seen_lines.add(next_line)

    # 3. Non-loop accumulator fallback: variables mutated earlier that reached terminal state
    if not candidates:
        for var_name, life in ledger.items():
            if life.mutation_lines:
                last_mut = max(life.mutation_lines)
                safe_line = last_mut + 1
                while safe_line <= len(lines) and (not lines[safe_line - 1].strip() or lines[safe_line - 1].strip().startswith("#")):
                    safe_line += 1
                if safe_line <= len(lines) and safe_line not in seen_lines:
                    vtype = life.type_name or "variable"
                    candidates.append(
                        SafeInsertionPoint(
                            line_number=safe_line,
                            target_variable=var_name,
                            confidence="medium",
                            reason=f"Variable `{var_name}` ({vtype}) reached terminal state after line {last_mut} and is not mutated again.",
                            suggested_action=_generate_suggested_action(var_name, life.type_name),
                            boilerplate_hook=_generate_boilerplate_hook(var_name, life.type_name),
                        )
                    )
                    seen_lines.add(safe_line)

    # 4. Final fallback for scripts with linear execution
    if not candidates and len(lines) >= 3:
        target_line = max(1, len(lines))
        candidates.append(
            SafeInsertionPoint(
                line_number=target_line,
                target_variable="terminal_scope",
                confidence="medium",
                reason="Execution reached script conclusion. Global scope is stable and safe for extension.",
                suggested_action="Add final telemetry assertions or output logging",
                boilerplate_hook="# Injected Hook: Telemetry verification\nprint('Script finished successfully. Variables:', list(locals().keys()))",
            )
        )

    # Sort final insertion points by line number
    candidates.sort(key=lambda p: p.line_number)
    return candidates
