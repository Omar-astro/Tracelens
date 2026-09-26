"""
tests/test_tracer.py — Test suite for Stage 4: Deterministic Tracer + Sandbox Integration.

Validates the Stage 4 Definition of Done:
1. A 4-iteration `for` loop produces exactly 4 loop-iteration steps with accurate
   target-variable mutation logging on each.
2. A deliberate `while True:` script is killed by the timeout and returns a clean
   error object instead of hanging or crashing the process.
3. Running the Appendix C `teammate_pipeline.py` sample produces a step list where
   `cleaned_records` and `error_count` show correct deltas at each relevant line.
4. Serializer handles non-JSON-native objects without crashing.
5. Security constraints (blocked modules/builtins) are respected under the sandbox.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path
import pytest

# Ensure repo root and backend directory are in sys.path
ROOT_DIR = Path(__file__).resolve().parent.parent
BACKEND_DIR = ROOT_DIR / "backend"
for p in (str(ROOT_DIR), str(BACKEND_DIR)):
    if p not in sys.path:
        sys.path.insert(0, p)

from backend.app.services.ast_flow import build_flow_index
from backend.app.services.tracer import trace_execution
from backend.app.services.sandbox import (
    trace_in_sandbox,
    STATUS_OK,
    STATUS_TIMEOUT,
    STATUS_ERROR,
    ERR_TIMEOUT,
    ERR_BLOCKED_IMPORT,
)


TEAMMATE_PIPELINE_CODE = '''raw_logs = [
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
'''


class TestStage4DefinitionOfDone:
    """Explicit tests for all items in Stage 4 Definition of Done."""

    def test_dod_item_1_four_iteration_for_loop(self):
        """A 4-iteration `for` loop script produces exactly 4 loop-iteration steps

        with accurate target-variable mutation logging on each.
        """
        code = "for i in range(4):\n    x = i * 2\n"
        res = trace_in_sandbox(code, timeout=5.0)
        assert res.status == STATUS_OK, res.error

        loop_iteration_steps = [s for s in res.steps if s.get("event_type") == "loop_iteration"]
        assert len(loop_iteration_steps) == 4, f"Expected exactly 4 loop_iteration steps, got {len(loop_iteration_steps)}"

        # Check iterations and target variable 'i'
        for idx, step in enumerate(loop_iteration_steps):
            loop_ctx = step.get("loop_context")
            assert loop_ctx is not None
            assert loop_ctx["loop_type"] == "for"
            assert loop_ctx["current_iteration"] == idx + 1
            assert loop_ctx["iterator_target"] == "i"
            assert not loop_ctx["is_exit_step"]

        # Loop exit step exists
        exit_steps = [s for s in res.steps if s.get("event_type") == "loop_exit"]
        assert len(exit_steps) == 1
        assert exit_steps[0]["loop_context"]["is_exit_step"] is True

    def test_dod_item_2_while_true_killed_by_timeout(self):
        """A deliberate `while True:` script is killed by the timeout and returns

        a clean error object instead of hanging or crashing the process.
        """
        code = "while True:\n    pass\n"
        # Test with a short timeout to keep test suite fast
        res = trace_in_sandbox(code, timeout=2.0, max_steps=10**9)
        assert res.status == STATUS_TIMEOUT
        assert res.error_code == ERR_TIMEOUT
        assert "time limit" in res.error.lower()
        # Verify the parent process is completely healthy
        recovery = trace_in_sandbox("a = 1 + 1", timeout=3.0)
        assert recovery.status == STATUS_OK
        assert recovery.steps[0]["variable_deltas"]["a"]["new_value"] == 2

    def test_dod_item_3_teammate_pipeline_deltas(self):
        """Running the Appendix C teammate_pipeline.py sample produces a step list

        where cleaned_records and error_count show correct deltas at each relevant line.
        """
        res = trace_in_sandbox(TEAMMATE_PIPELINE_CODE, timeout=5.0)
        assert res.status == STATUS_OK, res.error
        assert len(res.steps) > 0

        # Verify cleaned_records creation and mutation
        cleaned_created = [
            s for s in res.steps
            if "cleaned_records" in s.get("variable_deltas", {})
            and s["variable_deltas"]["cleaned_records"]["action"] == "created"
        ]
        assert len(cleaned_created) == 1

        cleaned_mutated = [
            s for s in res.steps
            if "cleaned_records" in s.get("variable_deltas", {})
            and s["variable_deltas"]["cleaned_records"]["action"] == "mutated"
        ]
        # In teammate_pipeline, 3 records have len(name) > 0 (alice, bob, charlie; empty is skipped)
        assert len(cleaned_mutated) == 3

        # Verify error_count creation and mutation
        error_created = [
            s for s in res.steps
            if "error_count" in s.get("variable_deltas", {})
            and s["variable_deltas"]["error_count"]["action"] == "created"
        ]
        assert len(error_created) == 1

        error_mutated = [
            s for s in res.steps
            if "error_count" in s.get("variable_deltas", {})
            and s["variable_deltas"]["error_count"]["action"] == "mutated"
        ]
        # Exactly 1 record has status >= 400 (bob has 500)
        assert len(error_mutated) == 1


class TestTracerSerializationAndSecurity:
    """Verification of serialization safety and sandbox isolation under the deterministic tracer."""

    def test_non_json_objects_serialized(self):
        code = '''
s = {1, 2, 3}
t = (4, 5, 6)
class MyObj:
    def __repr__(self):
        return "<CustomInstance>"
o = MyObj()
'''
        res = trace_in_sandbox(code, timeout=5.0)
        assert res.status == STATUS_OK, res.error
        last_step = res.steps[-1]
        assert "s" in last_step["all_variables"]
        assert "t" in last_step["all_variables"]
        assert "o" in last_step["all_variables"]
        assert "<CustomInstance>" in last_step["all_variables"]["o"]

    def test_sandbox_blocks_os_and_open(self):
        code_os = "import os\n"
        res_os = trace_in_sandbox(code_os, timeout=3.0)
        assert res_os.status == STATUS_ERROR
        assert res_os.error_code == ERR_BLOCKED_IMPORT

        code_open = "open('test.txt', 'w')\n"
        res_open = trace_in_sandbox(code_open, timeout=3.0)
        assert res_open.status == STATUS_ERROR

    def test_in_process_trace_execution_with_sandbox_flag(self):
        code = "y = 99\n"
        # In-process execution
        steps_direct = trace_execution(code, use_sandbox=False)
        assert len(steps_direct) >= 1
        assert steps_direct[0]["variable_deltas"]["y"]["new_value"] == 99

        # Sandboxed execution through trace_execution helper
        steps_sandboxed = trace_execution(code, use_sandbox=True)
        assert len(steps_sandboxed) >= 1
        assert steps_sandboxed[0]["variable_deltas"]["y"]["new_value"] == 99
