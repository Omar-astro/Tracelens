"""
ast_flow.py — Stage 3: AST Control-Flow Pre-Pass

Pure, standalone module.  No I/O, no side effects, no FastAPI dependency.

Exposes one public function:
    build_flow_index(code: str) -> FlowIndex
"""

import ast
from dataclasses import dataclass, field


# ---------------------------------------------------------------------------
# Data shapes
# ---------------------------------------------------------------------------

@dataclass
class LoopInfo:
    loop_id: str
    loop_type: str                  # "for" | "while"
    header_line: int
    iterator_target: str            # target variable(s) joined by ", "
    body_start_line: int | None
    body_end_line: int | None
    contains_lines: list


@dataclass
class BranchInfo:
    branch_id: str
    header_line: int
    condition_code: str
    body_start_line: int | None
    body_end_line: int | None
    orelse_start_line: int | None
    orelse_end_line: int | None


@dataclass
class FlowIndex:
    loops: dict = field(default_factory=dict)       # {line_no: LoopInfo}
    branches: dict = field(default_factory=dict)    # {line_no: BranchInfo}


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _names_in_target(target_node) -> list:
    """Collect all Name.id values inside a For-loop target node.

    Handles simple names, tuple-unpacking, and arbitrary nesting
    (e.g. `for (a, (b, c)) in x:`).
    """
    return [n.id for n in ast.walk(target_node) if isinstance(n, ast.Name)]


def _orelse_range(orelse: list):
    """Return (start_line, end_line) for an orelse block, or (None, None).

    An orelse that contains only a single If node is an elif — still valid.
    We skip it here so it surfaces as its own BranchInfo entry from the
    main ast.walk pass instead of being double-counted.
    """
    if not orelse:
        return None, None
    # elif sugar: orelse is [If(...)]. Let the walk handle it as a branch.
    if len(orelse) == 1 and isinstance(orelse[0], ast.If):
        return None, None
    start = orelse[0].lineno
    end = orelse[-1].end_lineno
    return start, end


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def build_flow_index(code: str) -> FlowIndex:
    """Parse *code* and return a FlowIndex with loop and branch lookup dicts.

    Both dicts are keyed by the integer line number of the construct's
    header (the `for`/`while`/`if` keyword line).
    """
    tree = ast.parse(code)
    loops: dict = {}
    branches: dict = {}

    for node in ast.walk(tree):

        # ------------------------------------------------------------------ #
        # Loop nodes
        # ------------------------------------------------------------------ #
        if isinstance(node, (ast.For, ast.While)):
            header = node.lineno
            body_start = node.body[0].lineno
            body_end = node.end_lineno

            if isinstance(node, ast.For):
                loop_type = "for"
                target_vars = _names_in_target(node.target)
                iterator_target = ", ".join(target_vars)
            else:  # ast.While
                loop_type = "while"
                # Collect names the condition depends on — more useful for
                # the Stage-4 tracer than an empty list.
                iterator_target = ", ".join(
                    n.id for n in ast.walk(node.test)
                    if isinstance(n, ast.Name)
                )

            loops[header] = LoopInfo(
                loop_id=f"loop_line_{header}",
                loop_type=loop_type,
                header_line=header,
                iterator_target=iterator_target,
                body_start_line=body_start,
                body_end_line=body_end,
                contains_lines=list(range(body_start, body_end + 1)),
            )

        # ------------------------------------------------------------------ #
        # Branch nodes
        # ------------------------------------------------------------------ #
        elif isinstance(node, ast.If):
            header = node.lineno
            condition_code = ast.get_source_segment(code, node.test) or ""
            body_start = node.body[0].lineno
            body_end = node.body[-1].end_lineno
            orelse_start, orelse_end = _orelse_range(node.orelse)

            branches[header] = BranchInfo(
                branch_id=f"branch_line_{header}",
                header_line=header,
                condition_code=condition_code,
                body_start_line=body_start,
                body_end_line=body_end,
                orelse_start_line=orelse_start,
                orelse_end_line=orelse_end,
            )

    return FlowIndex(loops=loops, branches=branches)


# ---------------------------------------------------------------------------
# Quick sanity check — run directly: python ast_flow.py
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import json

    _sample = """\
raw_logs = [
    {"user": " alice ", "action": "login", "status": 200},
    {"user": "bob", "action": "upload", "status": 500},
    {"user": "", "action": "ping", "status": 200},
    {"user": "charlie", "action": "logout", "status": 200}
]
cleaned_records = []
error_count = 0
for record in raw_logs:
    name = record["user"].strip().capitalize()
    if len(name) > 0:
        if record["status"] >= 400:
            error_count += 1
        cleaned_records.append({
            "user": name,
            "action": record["action"],
            "success": record["status"] < 400
        })
summary = {
    "total_valid": len(cleaned_records),
    "total_errors": error_count
}
print("Summary:", summary)
"""

    result = build_flow_index(_sample)

    def _asdict(obj):
        if isinstance(obj, (LoopInfo, BranchInfo)):
            return obj.__dict__
        return obj

    output = {
        "loops": {
            str(k): _asdict(v) for k, v in result.loops.items()
        },
        "branches": {
            str(k): _asdict(v) for k, v in result.branches.items()
        },
    }
    print(json.dumps(output, indent=2))
