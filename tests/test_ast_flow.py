"""
tests/test_ast_flow.py — Test suite for Stage 3 AST Control-Flow Pre-Pass.

Verifies:
- build_flow_index against Appendix C.1 (teammate_pipeline.py)
- For loops (simple, tuple unpacking, nested unpacking, starred unpacking)
- While loops (simple condition, multi-variable condition, while True)
- Loops with else blocks (correct body_end_line and contains_lines)
- Branch statements (if, if/else, if/elif/else, nested branches)
- Multiline conditions
- Functions, methods, and classes containing loops/branches
- Code with comprehensions (comprehensions should not be indexed as For/If statements)
- Edge cases (empty code, comments only, syntax errors)
- Purity and zero FastAPI / network / I/O side effects
"""

import ast
import sys
from pathlib import Path
import pytest

# Ensure repo root and backend directory are in sys.path
ROOT_DIR = Path(__file__).resolve().parent.parent
BACKEND_DIR = ROOT_DIR / "backend"
for p in (str(ROOT_DIR), str(BACKEND_DIR)):
    if p not in sys.path:
        sys.path.insert(0, p)

try:
    from backend.app.services.ast_flow import (
        BranchInfo,
        FlowIndex,
        LoopInfo,
        build_flow_index,
    )
except ImportError:
    from app.services.ast_flow import (
        BranchInfo,
        FlowIndex,
        LoopInfo,
        build_flow_index,
    )


# ---------------------------------------------------------------------------
# Appendix C.1 Teammate Pipeline Sample
# ---------------------------------------------------------------------------

TEAMMATE_PIPELINE_CODE = '''# teammate_pipeline.py — Inherited from "Alex" (Teammate)
raw_logs = [
    {"user": " alice ", "action": "login", "status": 200},
    {"user": "bob", "action": "upload", "status": 500},
    {"user": "", "action": "ping", "status": 200},
    {"user": "charlie", "action": "logout", "status": 200}
]

cleaned_records = []
error_count = 0

# Teammate loop: sanitize user records and count 500 errors
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

# [SAFE INSERTION POINT: here]
summary = {
    "total_valid": len(cleaned_records),
    "total_errors": error_count
}
print("Summary:", summary)
'''


class TestAppendixCSample:
    """Stage 3 Definition of Done test cases on Appendix C.1."""

    def test_teammate_pipeline_loop(self):
        flow = build_flow_index(TEAMMATE_PIPELINE_CODE)
        assert isinstance(flow, FlowIndex)
        assert len(flow.loops) == 1

        # In TEAMMATE_PIPELINE_CODE, line 13 is `for record in raw_logs:`
        loop_header = 13
        assert loop_header in flow.loops
        loop = flow.loops[loop_header]

        assert loop.loop_type == "for"
        assert loop.iterator_target == "record"
        assert loop.header_line == loop_header
        assert loop.body_start_line == 14
        assert loop.body_end_line == 22
        assert loop.contains_lines == list(range(14, 23))

    def test_teammate_pipeline_branches(self):
        flow = build_flow_index(TEAMMATE_PIPELINE_CODE)
        assert len(flow.branches) == 2

        # Outer if: `if len(name) > 0:` at line 15
        assert 15 in flow.branches
        outer_branch = flow.branches[15]
        assert outer_branch.header_line == 15
        assert outer_branch.condition_code == "len(name) > 0"
        assert outer_branch.body_start_line == 16
        assert outer_branch.body_end_line == 22
        assert outer_branch.orelse_start_line is None
        assert outer_branch.orelse_end_line is None

        # Inner if: `if record["status"] >= 400:` at line 16
        assert 16 in flow.branches
        inner_branch = flow.branches[16]
        assert inner_branch.header_line == 16
        assert inner_branch.condition_code in ('record["status"] >= 400', "record['status'] >= 400")
        assert inner_branch.body_start_line == 17
        assert inner_branch.body_end_line == 17
        assert inner_branch.orelse_start_line is None
        assert inner_branch.orelse_end_line is None


# ---------------------------------------------------------------------------
# Loop Tests
# ---------------------------------------------------------------------------

class TestLoops:
    """Comprehensive tests for loop indexing."""

    def test_simple_for_loop(self):
        code = "for u in users:\n    print(u)\n"
        flow = build_flow_index(code)
        assert 1 in flow.loops
        loop = flow.loops[1]
        assert loop.loop_type == "for"
        assert loop.iterator_target == "u"
        assert loop.body_start_line == 2
        assert loop.body_end_line == 2
        assert loop.contains_lines == [2]

    def test_tuple_unpacking_target(self):
        code = "for k, v in d.items():\n    total += v\n"
        flow = build_flow_index(code)
        assert 1 in flow.loops
        loop = flow.loops[1]
        assert loop.iterator_target == "k, v"

    def test_nested_tuple_unpacking_preserves_order(self):
        code = "for (a, b), c in data:\n    pass\n"
        flow = build_flow_index(code)
        assert 1 in flow.loops
        loop = flow.loops[1]
        assert loop.iterator_target == "a, b, c"

    def test_nested_tuple_unpacking_complex(self):
        code = "for a, (b, (c, d)) in data:\n    pass\n"
        flow = build_flow_index(code)
        assert 1 in flow.loops
        loop = flow.loops[1]
        assert loop.iterator_target == "a, b, c, d"

    def test_starred_target(self):
        code = "for first, *rest in sequences:\n    pass\n"
        flow = build_flow_index(code)
        assert 1 in flow.loops
        loop = flow.loops[1]
        assert loop.iterator_target == "first, rest"

    def test_while_loop_with_variables(self):
        code = "while count < 10:\n    count += 1\n"
        flow = build_flow_index(code)
        assert 1 in flow.loops
        loop = flow.loops[1]
        assert loop.loop_type == "while"
        assert loop.iterator_target == "count"
        assert loop.body_start_line == 2
        assert loop.body_end_line == 2

    def test_while_loop_multiple_variables_deduplicated(self):
        code = "while i < n and i > 0 and j < m:\n    i += 1\n"
        flow = build_flow_index(code)
        assert 1 in flow.loops
        loop = flow.loops[1]
        assert loop.loop_type == "while"
        # 'i' should not be duplicated as 'i, i'
        assert loop.iterator_target == "i, n, j, m"

    def test_while_true_loop(self):
        code = "while True:\n    break\n"
        flow = build_flow_index(code)
        assert 1 in flow.loops
        loop = flow.loops[1]
        assert loop.loop_type == "while"
        assert loop.iterator_target == ""

    def test_for_loop_with_else_block(self):
        code = (
            "for x in items:\n"
            "    if x == target:\n"
            "        break\n"
            "else:\n"
            "    print('not found')\n"
        )
        flow = build_flow_index(code)
        assert 1 in flow.loops
        loop = flow.loops[1]
        # Body end must be line 3, NOT line 5 (which is the else block)
        assert loop.body_start_line == 2
        assert loop.body_end_line == 3
        assert loop.contains_lines == [2, 3]

    def test_while_loop_with_else_block(self):
        code = (
            "while x > 0:\n"
            "    x -= 1\n"
            "else:\n"
            "    x = -1\n"
        )
        flow = build_flow_index(code)
        assert 1 in flow.loops
        loop = flow.loops[1]
        assert loop.body_start_line == 2
        assert loop.body_end_line == 2
        assert loop.contains_lines == [2]

    def test_nested_loops(self):
        code = (
            "for i in range(3):\n"
            "    for j in range(3):\n"
            "        print(i, j)\n"
        )
        flow = build_flow_index(code)
        assert 1 in flow.loops
        assert 2 in flow.loops
        outer = flow.loops[1]
        inner = flow.loops[2]
        assert outer.iterator_target == "i"
        assert inner.iterator_target == "j"
        assert outer.body_start_line == 2
        assert outer.body_end_line == 3
        assert inner.body_start_line == 3
        assert inner.body_end_line == 3


# ---------------------------------------------------------------------------
# Branch Tests
# ---------------------------------------------------------------------------

class TestBranches:
    """Comprehensive tests for branch indexing."""

    def test_simple_if(self):
        code = "if x > 0:\n    y = 1\n"
        flow = build_flow_index(code)
        assert 1 in flow.branches
        branch = flow.branches[1]
        assert branch.header_line == 1
        assert branch.condition_code == "x > 0"
        assert branch.body_start_line == 2
        assert branch.body_end_line == 2
        assert branch.orelse_start_line is None
        assert branch.orelse_end_line is None

    def test_if_else(self):
        code = (
            "if x > 0:\n"
            "    y = 1\n"
            "else:\n"
            "    y = -1\n"
            "    z = 0\n"
        )
        flow = build_flow_index(code)
        assert 1 in flow.branches
        branch = flow.branches[1]
        assert branch.condition_code == "x > 0"
        assert branch.body_start_line == 2
        assert branch.body_end_line == 2
        assert branch.orelse_start_line == 4
        assert branch.orelse_end_line == 5

    def test_if_elif_else(self):
        code = (
            "if x > 10:\n"
            "    y = 1\n"
            "elif x > 5:\n"
            "    y = 2\n"
            "else:\n"
            "    y = 3\n"
        )
        flow = build_flow_index(code)
        assert 1 in flow.branches
        assert 3 in flow.branches

        b1 = flow.branches[1]
        assert b1.header_line == 1
        assert b1.condition_code == "x > 10"
        assert b1.body_start_line == 2
        assert b1.body_end_line == 2

        b2 = flow.branches[3]
        assert b2.header_line == 3
        assert b2.condition_code == "x > 5"
        assert b2.body_start_line == 4
        assert b2.body_end_line == 4
        assert b2.orelse_start_line == 6
        assert b2.orelse_end_line == 6

    def test_multiline_condition(self):
        code = (
            "if (\n"
            "    x > 0\n"
            "    and y < 10\n"
            "):\n"
            "    pass\n"
        )
        flow = build_flow_index(code)
        assert 1 in flow.branches
        branch = flow.branches[1]
        assert "x > 0" in branch.condition_code
        assert "y < 10" in branch.condition_code
        assert branch.body_start_line == 5


# ---------------------------------------------------------------------------
# Scope, Structures, and Edge Cases
# ---------------------------------------------------------------------------

class TestEdgeCases:
    """Edge cases, comprehensions, empty inputs, and syntax errors."""

    def test_functions_and_classes(self):
        code = (
            "class MyService:\n"
            "    def run(self, items):\n"
            "        for item in items:\n"
            "            if item:\n"
            "                yield item\n"
        )
        flow = build_flow_index(code)
        assert 3 in flow.loops
        assert 4 in flow.branches
        assert flow.loops[3].iterator_target == "item"
        assert flow.branches[4].condition_code == "item"

    def test_list_comprehension_not_indexed_as_statement(self):
        code = "squares = [x * 2 for x in items if x > 0]\n"
        flow = build_flow_index(code)
        assert len(flow.loops) == 0
        assert len(flow.branches) == 0

    def test_empty_string(self):
        flow = build_flow_index("")
        assert flow.loops == {}
        assert flow.branches == {}

    def test_comments_and_whitespace_only(self):
        code = "# just a comment\n\n'''docstring'''\n"
        flow = build_flow_index(code)
        assert flow.loops == {}
        assert flow.branches == {}

    def test_syntax_error_bubbles_up(self):
        with pytest.raises(SyntaxError):
            build_flow_index("for x in:\n    pass\n")

    def test_dicts_are_sorted_by_line_number(self):
        code = (
            "if outer:\n"
            "    if inner:\n"
            "        pass\n"
            "if sibling:\n"
            "    pass\n"
        )
        flow = build_flow_index(code)
        branch_lines = list(flow.branches.keys())
        assert branch_lines == sorted(branch_lines)

    def test_purity_no_fastapi_dependency(self):
        import sys
        # Verify ast_flow does not import fastapi
        import backend.app.services.ast_flow as module
        imported_modules = dir(module)
        assert "fastapi" not in imported_modules
        assert "FastAPI" not in imported_modules


# ---------------------------------------------------------------------------
# Stage 4 Readiness Tests
# ---------------------------------------------------------------------------

class TestStage4Readiness:
    """Verifies enhanced features specifically designed to power Stage 4 tracer."""

    def test_line_to_loop_innermost_mapping(self):
        code = (
            "for i in range(3):\n"     # line 1
            "    for j in range(3):\n" # line 2
            "        x = i + j\n"      # line 3
            "    y = i\n"              # line 4
        )
        flow = build_flow_index(code)
        # Line 1 is header of outer loop
        assert flow.get_loop_for_line(1).header_line == 1
        # Line 2 is header of inner loop
        assert flow.get_loop_for_line(2).header_line == 2
        # Line 3 is inside both, but innermost is loop 2
        assert flow.get_loop_for_line(3).header_line == 2
        # Line 4 is inside outer loop only
        assert flow.get_loop_for_line(4).header_line == 1
        # Line 5 (out of loop)
        assert flow.get_loop_for_line(5) is None

        # Verify get_enclosing_loops returns outer-to-inner hierarchy
        enclosing_at_3 = flow.get_enclosing_loops(3)
        assert len(enclosing_at_3) == 2
        assert enclosing_at_3[0].header_line == 1
        assert enclosing_at_3[1].header_line == 2

    def test_elif_chain_metadata(self):
        code = (
            "if x > 10:\n"     # line 1
            "    y = 1\n"      # line 2
            "elif x > 5:\n"    # line 3
            "    y = 2\n"      # line 4
            "elif x > 0:\n"    # line 5
            "    y = 3\n"      # line 6
            "else:\n"          # line 7
            "    y = 0\n"      # line 8
        )
        flow = build_flow_index(code)
        b1 = flow.branches[1]
        b2 = flow.branches[3]
        b3 = flow.branches[5]

        # b1: top-level if
        assert b1.is_elif is False
        assert b1.next_branch_line == 3
        assert b1.construct_end_line == 8
        assert b1.orelse_start_line is None

        # b2: first elif
        assert b2.is_elif is True
        assert b2.next_branch_line == 5
        assert b2.construct_end_line == 8
        assert b2.orelse_start_line is None

        # b3: last elif, followed by else
        assert b3.is_elif is True
        assert b3.next_branch_line is None
        assert b3.orelse_start_line == 8
        assert b3.orelse_end_line == 8
        assert b3.construct_end_line == 8

    def test_async_for_loop(self):
        code = (
            "async def fetch_all(stream):\n"
            "    async for item in stream:\n"
            "        process(item)\n"
        )
        flow = build_flow_index(code)
        assert 2 in flow.loops
        loop = flow.loops[2]
        assert loop.loop_type == "for"
        assert loop.iterator_target == "item"
        assert loop.body_start_line == 3
        assert loop.body_end_line == 3

    def test_to_dict_serialization(self):
        code = (
            "for x in items:\n"
            "    if x > 0:\n"
            "        pass\n"
        )
        flow = build_flow_index(code)
        d = flow.to_dict()
        assert "loops" in d
        assert "branches" in d
        # Keys should be stringified line numbers matching JSON requirements
        assert "1" in d["loops"]
        assert "2" in d["branches"]
        assert d["loops"]["1"]["loop_id"] == "loop_line_1"
        assert d["branches"]["2"]["branch_id"] == "branch_line_2"


if __name__ == "__main__":
    pytest.main(["-v", __file__])
