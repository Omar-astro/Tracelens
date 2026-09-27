"""
ast_flow.py — AST Control-Flow Pre-Pass

Pure, standalone module.  No I/O, no side effects, no FastAPI dependency.

Exposes one public function:
    build_flow_index(code: str) -> FlowIndex
"""

import ast
from dataclasses import asdict, dataclass, field


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

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class BranchInfo:
    branch_id: str
    header_line: int
    condition_code: str
    body_start_line: int | None
    body_end_line: int | None
    orelse_start_line: int | None
    orelse_end_line: int | None
    next_branch_line: int | None = None     # line of immediate elif if present
    construct_end_line: int | None = None   # last line of the entire if/elif/else construct
    is_elif: bool = False                   # True if this node was an elif

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class FlowIndex:
    loops: dict = field(default_factory=dict)        # {line_no: LoopInfo}
    branches: dict = field(default_factory=dict)     # {line_no: BranchInfo}
    line_to_loop: dict = field(default_factory=dict) # {line_no: innermost LoopInfo}

    def get_loop_for_line(self, lineno: int) -> LoopInfo | None:
        """Return the innermost enclosing loop for the given line number, or None."""
        return self.line_to_loop.get(lineno)

    def get_enclosing_loops(self, lineno: int) -> list:
        """Return all enclosing loops for the given line, ordered outermost to innermost."""
        enclosing = [
            loop for loop in self.loops.values()
            if lineno in loop.contains_lines or lineno == loop.header_line
        ]
        return sorted(
            enclosing,
            key=lambda l: len(l.contains_lines) if l.contains_lines else 0,
            reverse=True
        )

    def get_branch_for_line(self, lineno: int) -> BranchInfo | None:
        """Return BranchInfo if this line is a branch header (if/elif)."""
        return self.branches.get(lineno)

    def to_dict(self) -> dict:
        """Serialize to dictionary matching Example.txt and API specification."""
        return {
            "loops": {str(k): v.to_dict() for k, v in self.loops.items()},
            "branches": {str(k): v.to_dict() for k, v in self.branches.items()},
        }


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _names_in_target(target_node) -> list:
    """Collect all Name.id values inside a For-loop target node in source order.

    Handles simple names, tuple-unpacking, and arbitrary nesting
    (e.g. `for (a, (b, c)) in x:`), preserving left-to-right syntactic order.
    """
    names = []

    def _extract(node):
        if isinstance(node, ast.Name):
            names.append(node.id)
        elif isinstance(node, (ast.Tuple, ast.List)):
            for elt in node.elts:
                _extract(elt)
        elif isinstance(node, ast.Starred):
            _extract(node.value)

    _extract(target_node)
    if not names:
        names = [n.id for n in ast.walk(target_node) if isinstance(n, ast.Name)]
    return list(dict.fromkeys(names))


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
    header (the `for`/`while`/`if` keyword line), sorted in ascending line order.
    Also builds `line_to_loop` for O(1) loop-context lookups during execution tracing.
    """
    tree = ast.parse(code)
    loops: dict = {}
    branches: dict = {}

    # Pre-index nodes that represent `elif` branches (an If inside another If's orelse)
    elif_node_ids = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.If) and len(node.orelse) == 1 and isinstance(node.orelse[0], ast.If):
            elif_node_ids.add(id(node.orelse[0]))

    for node in ast.walk(tree):

        # ------------------------------------------------------------------ #
        # Loop nodes (For, AsyncFor, While)
        # ------------------------------------------------------------------ #
        if isinstance(node, (ast.For, ast.AsyncFor, ast.While)):
            header = node.lineno
            body_start = node.body[0].lineno if node.body else header
            body_end = node.body[-1].end_lineno if node.body else header

            if isinstance(node, (ast.For, ast.AsyncFor)):
                loop_type = "for"
                target_vars = _names_in_target(node.target)
                iterator_target = ", ".join(target_vars)
            else:  # ast.While
                loop_type = "while"
                # Collect names the condition depends on in appearance order, deduplicated
                test_names = sorted(
                    [n for n in ast.walk(node.test) if isinstance(n, ast.Name)],
                    key=lambda n: (n.lineno, n.col_offset)
                )
                iterator_target = ", ".join(dict.fromkeys(n.id for n in test_names))

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
        # Branch nodes (If / Elif)
        # ------------------------------------------------------------------ #
        elif isinstance(node, ast.If):
            header = node.lineno
            condition_code = ast.get_source_segment(code, node.test)
            if not condition_code:
                try:
                    condition_code = ast.unparse(node.test)
                except Exception:
                    condition_code = ""
            body_start = node.body[0].lineno if node.body else header
            body_end = node.body[-1].end_lineno if node.body else header
            orelse_start, orelse_end = _orelse_range(node.orelse)

            has_elif = len(node.orelse) == 1 and isinstance(node.orelse[0], ast.If)
            next_branch_line = node.orelse[0].lineno if has_elif else None
            construct_end_line = node.end_lineno
            is_elif = id(node) in elif_node_ids

            branches[header] = BranchInfo(
                branch_id=f"branch_line_{header}",
                header_line=header,
                condition_code=condition_code,
                body_start_line=body_start,
                body_end_line=body_end,
                orelse_start_line=orelse_start,
                orelse_end_line=orelse_end,
                next_branch_line=next_branch_line,
                construct_end_line=construct_end_line,
                is_elif=is_elif,
            )

    sorted_loops = dict(sorted(loops.items(), key=lambda item: item[0]))
    sorted_branches = dict(sorted(branches.items(), key=lambda item: item[0]))

    # Build line_to_loop index: sort loops by span size descending so innermost loop wins
    sorted_by_span = sorted(
        sorted_loops.values(),
        key=lambda l: len(l.contains_lines) if l.contains_lines else 0,
        reverse=True
    )
    line_to_loop = {}
    for loop in sorted_by_span:
        line_to_loop[loop.header_line] = loop
        for line in loop.contains_lines:
            line_to_loop[line] = loop

    return FlowIndex(loops=sorted_loops, branches=sorted_branches, line_to_loop=line_to_loop)


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
