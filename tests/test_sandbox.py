"""Stage 4 Part 2 - sandbox verification.

Runs under pytest (`pytest tests/test_sandbox.py`) or standalone with no
third-party dependencies (`python tests/test_sandbox.py`), which is how it was
verified here since pytest is not installed in this environment.
"""

from __future__ import annotations

import os
import sys
import time

_TESTS_DIR = os.path.dirname(os.path.abspath(__file__))
_REPO_ROOT = os.path.dirname(_TESTS_DIR)
_BACKEND_DIR = os.path.join(_REPO_ROOT, "backend")
# The child process inherits sys.path through `spawn`, but only because these
# entries are present at Process.start() time. Stage 1 has not created any
# __init__.py, so `app` / `app.services` resolve as implicit namespace packages.
for _path in (_BACKEND_DIR, _TESTS_DIR):
    if _path not in sys.path:
        sys.path.insert(0, _path)

from app.services.sandbox import (  # noqa: E402
    SANDBOX_TIMEOUT_SECONDS,
    STATUS_ERROR,
    STATUS_OK,
    STATUS_TIMEOUT,
    SandboxResult,
    TraceContext,
    run_in_sandbox,
)

# Resolves to "__main__" under the standalone runner and to the pytest module
# name under pytest; both are importable from inside the spawned child.
CUSTOM_TRACER_REF = f"{__name__}:custom_tracer"

TEAMMATE_PIPELINE = '''
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
'''


# --------------------------------------------------------------------------
# A tracer factory defined here, to prove the Stage 4.1 injection seam
# --------------------------------------------------------------------------


def custom_tracer(ctx: TraceContext):
    """A second factory, resolved from a string ref inside the child."""

    def local_tracer(frame, event, arg):
        if event == "line":
            lineno = frame.f_lineno
            ctx.emit(
                {
                    "line_number": lineno,
                    "code_line": ctx.code_line(lineno),
                    "event_type": "line",
                    "injected_by": "custom_tracer",
                }
            )
        return local_tracer

    def global_tracer(frame, event, arg):
        if event == "call" and frame.f_code.co_filename == ctx.filename:
            return local_tracer
        return None

    return global_tracer


class Unserializable:
    """Stands in for a DataFrame / model / anything not JSON-native."""

    def __repr__(self) -> str:
        return "<Unserializable>"


def value_emitting_tracer(ctx: TraceContext):
    """Emits a real Python object per step, the way Stage 4.1 will.

    This is the shape that makes `_write_payload`'s `default=repr` load-bearing:
    without it the child dies in its `finally` block and the whole trace is lost.
    """

    def local_tracer(frame, event, arg):
        if event == "line":
            lineno = frame.f_lineno
            ctx.emit(
                {
                    "line_number": lineno,
                    "code_line": ctx.code_line(lineno),
                    "event_type": "line",
                    "variable_deltas": {
                        "frame": {
                            "action": "created",
                            "var_name": "frame",
                            "new_value": Unserializable(),
                        }
                    },
                }
            )
        return local_tracer

    def global_tracer(frame, event, arg):
        if event == "call" and frame.f_code.co_filename == ctx.filename:
            return local_tracer
        return None

    return global_tracer


# --------------------------------------------------------------------------
# Happy path
# --------------------------------------------------------------------------


def test_normal_script_runs_and_preserves_source_order():
    result = run_in_sandbox(TEAMMATE_PIPELINE, timeout=5.0)
    assert result.status == STATUS_OK, result.error
    assert result.error_code is None
    assert len(result.steps) > 0
    assert [s["step_id"] for s in result.steps] == list(range(1, len(result.steps) + 1))
    assert all(s["event_type"] == "line" for s in result.steps)


def test_loop_header_fires_one_more_time_than_there_are_iterations():
    # CPython re-evaluates the `for` header once more after the final iteration
    # to discover the iterator is exhausted, so a 4-record loop produces 5 header
    # line events. Stage 4.1's AST correlation is what turns these into the
    # "exactly 4 loop_iteration steps" the Definition of Done asks for - the
    # raw line-event count cannot distinguish the two.
    result = run_in_sandbox(TEAMMATE_PIPELINE, timeout=5.0)
    header = next(
        i + 1 for i, line in enumerate(TEAMMATE_PIPELINE.splitlines()) if "for record" in line
    )
    assert [s["line_number"] for s in result.steps].count(header) == 5


def test_loop_body_and_header_both_emit_one_event_per_iteration():
    result = run_in_sandbox("for i in range(3):\n    x = i\n", timeout=5.0)
    assert result.status == STATUS_OK, result.error
    assert [s["line_number"] for s in result.steps] == [1, 2, 1, 2, 1, 2, 1]


def test_straight_line_code_advances_monotonically():
    # The pipeline script legitimately revisits its loop header, so ordering is
    # only monotonic for code that never jumps backwards.
    result = run_in_sandbox("a = 1\nb = 2\nc = 3\nd = 4\n", timeout=5.0)
    assert result.status == STATUS_OK, result.error
    assert [s["line_number"] for s in result.steps] == [1, 2, 3, 4]
    assert [s["code_line"] for s in result.steps] == ["a = 1", "b = 2", "c = 3", "d = 4"]


def test_stdout_is_captured():
    result = run_in_sandbox('print("hello from user code")', timeout=5.0)
    assert result.status == STATUS_OK, result.error
    assert "hello from user code" in result.stdout
    assert not result.stdout_truncated


def test_only_traced_frames_are_recorded():
    # `never_called` is defined but never invoked, so its body must not appear.
    result = run_in_sandbox(
        "def never_called():\n    return 1\n\ndef called():\n    return 2\n\nx = called()\n",
        timeout=5.0,
    )
    assert result.status == STATUS_OK, result.error
    recorded = [s["line_number"] for s in result.steps]
    assert 2 not in recorded, "unexecuted function body must not appear"
    assert 5 in recorded, "executed function body must appear"
    assert 1 in recorded and 7 in recorded


# --------------------------------------------------------------------------
# Timeout (the Definition of Done item)
# --------------------------------------------------------------------------


# The 300-step cap normally fires long before the wall-clock timeout, so every
# test of the *timeout* has to lift the cap or it would never be reached.
UNLIMITED_STEPS = 10**9


def test_while_true_is_killed_at_the_default_eight_seconds():
    started = time.monotonic()
    result = run_in_sandbox("while True:\n    pass\n", max_steps=UNLIMITED_STEPS)
    elapsed = time.monotonic() - started
    assert result.status == STATUS_TIMEOUT, result.to_dict()
    assert result.error_code == "timeout"
    assert SANDBOX_TIMEOUT_SECONDS == 8.0
    assert 7.0 <= elapsed <= 14.0, f"expected ~8s, got {elapsed:.1f}s"
    # The parent is still alive and serving requests.
    assert run_in_sandbox("print('still alive')", timeout=5.0).status == STATUS_OK


def test_step_cap_masks_the_timeout_on_an_infinite_loop():
    # The interaction the previous test depends on: with the default cap an
    # infinite loop stops at 300 steps, not at 8 seconds.
    result = run_in_sandbox("while True:\n    pass\n", timeout=SANDBOX_TIMEOUT_SECONDS)
    assert result.status == STATUS_ERROR
    assert result.error_code == "max_steps_exceeded"
    assert len(result.steps) == 300


def test_print_flood_does_not_blow_up_memory():
    result = run_in_sandbox(
        'while True:\n    print("x" * 4096)\n',
        timeout=1.5,
        max_steps=UNLIMITED_STEPS,
        stdout_limit=4096,
    )
    assert result.status == STATUS_TIMEOUT, result.to_dict()
    assert result.stdout_truncated
    assert len(result.stdout) <= 4096


def test_allocation_bomb_returns_instead_of_hanging():
    # On POSIX RLIMIT_AS trips this first; on Windows there is no rlimit, so the
    # wall-clock timeout is the only guard and the MemoryError ends it sooner.
    result = run_in_sandbox('x = "a" * (10 ** 10)\n', timeout=2.0, max_steps=UNLIMITED_STEPS)
    assert result.status in (STATUS_OK, STATUS_TIMEOUT, STATUS_ERROR)


# --------------------------------------------------------------------------
# Restricted namespace
# --------------------------------------------------------------------------


def test_blocked_modules_are_refused():
    for module in ("os", "sys", "subprocess", "socket"):
        result = run_in_sandbox(f"import {module}\n", timeout=5.0)
        assert result.status == STATUS_ERROR, (module, result.to_dict())
        assert result.error_code == "blocked_import", (module, result.to_dict())
        assert module in result.error


def test_from_form_and_dotted_form_are_refused():
    for snippet in ("from sys import path", "import os.path", "import subprocess.Popen"):
        result = run_in_sandbox(snippet + "\n", timeout=5.0)
        assert result.status == STATUS_ERROR, (snippet, result.to_dict())
        assert result.error_code == "blocked_import", (snippet, result.to_dict())


def test_open_is_refused():
    result = run_in_sandbox('open("/etc/passwd")\n', timeout=5.0)
    assert result.status == STATUS_ERROR, result.to_dict()
    assert "open" in result.error


def test_guarded_import_cannot_be_bypassed_by_calling_it_directly():
    for snippet in (
        '__import__("os")',
        '__import__("os.path", fromlist=("system",))',
        '__import__("socket")',
    ):
        result = run_in_sandbox(snippet + "\n", timeout=5.0)
        assert result.status == STATUS_ERROR, (snippet, result.to_dict())
        assert result.error_code == "blocked_import", (snippet, result.to_dict())
        assert "TraceLens sandbox" in result.error


def test_relative_imports_are_refused():
    result = run_in_sandbox("from . import sibling\n", timeout=5.0)
    assert result.status == STATUS_ERROR, result.to_dict()
    assert "Relative imports" in result.error


def test_unrelated_imports_still_work():
    # `sysconfig` shares a prefix with the blocked `sys`; matching on the exact
    # root component means it must still import.
    for snippet in ("import math", "import json", "import sysconfig"):
        result = run_in_sandbox(f"{snippet}\nprint('ok')\n", timeout=5.0)
        assert result.status == STATUS_OK, (snippet, result.to_dict())
        assert "ok" in result.stdout, (snippet, result.stdout)


def test_missing_module_is_not_reported_as_a_policy_block():
    result = run_in_sandbox("import numpyish\n", timeout=5.0)
    assert result.status == STATUS_ERROR
    assert result.error_code == "runtime_error"
    assert "blocked" not in result.error.lower()


def test_stdout_is_captured_even_though_sys_is_blocked():
    # print() resolves sys.stdout from the interpreter, not from the user
    # namespace, so the child-side redirect still sees user prints.
    result = run_in_sandbox('print("captured anyway")\n', timeout=5.0)
    assert result.status == STATUS_OK, result.error
    assert "captured anyway" in result.stdout


def test_user_binding_sys_does_not_disturb_the_tracer():
    # The user program owns the name `sys`; the tracer must be unaffected
    # because it resolves names in sandbox.py's module globals.
    result = run_in_sandbox('sys = 5\nopen = 6\nprint(sys + open)\n', timeout=5.0)
    assert result.status == STATUS_OK, result.error
    assert "11" in result.stdout
    assert len(result.steps) >= 3


def test_blocked_import_error_does_not_leak_the_block_list():
    result = run_in_sandbox("import os\n", timeout=5.0)
    assert result.status == STATUS_ERROR
    # CPython appends a "perhaps you meant" list of every stdlib module that
    # shares a prefix; it must not reach the response.
    lowered = result.error.lower()
    for leak in ("did you mean", "subprocess", "socket", "sysconfig"):
        assert leak not in lowered, f"error message leaked {leak!r}: {result.error}"


def test_sandbox_does_not_mutate_the_parent_interpreter():
    import subprocess  # noqa: PLC0415 - deliberately proves it is still importable here
    import socket  # noqa: PLC0415

    assert "os" in sys.modules
    assert callable(subprocess.run)
    assert socket.socket is not None
    assert "open" in dir(__builtins__) if not isinstance(__builtins__, dict) else "open" in __builtins__


# --------------------------------------------------------------------------
# Error surfacing
# --------------------------------------------------------------------------


def test_syntax_error_is_clean_and_does_not_spawn_a_child():
    result = run_in_sandbox("def broken(:\n    pass\n", timeout=5.0)
    assert result.status == STATUS_ERROR
    assert result.error_code == "syntax_error"
    assert "SyntaxError" in result.error
    assert "Traceback" not in result.error


def test_runtime_exception_is_clean_and_keeps_partial_steps():
    result = run_in_sandbox("a = 1\nb = 2\nc = 1 / 0\nd = 4\n", timeout=5.0)
    assert result.status == STATUS_ERROR
    assert result.error_code == "runtime_error"
    assert "ZeroDivisionError" in result.error
    assert "Traceback" not in result.error
    assert len(result.steps) >= 2, "steps before the failure must survive"


def test_max_steps_cap_truncates_cleanly():
    result = run_in_sandbox(
        "for i in range(1000):\n    x = i\n", timeout=5.0, max_steps=10
    )
    assert result.status == STATUS_ERROR
    assert result.error_code == "max_steps_exceeded"
    assert result.max_steps_reached
    assert len(result.steps) == 10


def test_empty_code_is_a_clean_no_op():
    result = run_in_sandbox("", timeout=5.0)
    assert result.status == STATUS_OK, result.to_dict()
    # An empty module still fires one line event, at line 0, which must be
    # dropped rather than shipped to the frontend as a bogus line.
    assert result.steps == []
    assert result.stdout == ""


def test_comment_only_code_produces_no_steps():
    result = run_in_sandbox("# nothing to see here\n", timeout=5.0)
    assert result.status == STATUS_OK
    assert result.steps == []


def test_timed_out_run_still_returns_its_partial_trace():
    # The child is killed before its final write, so the checkpoint file is the
    # only surviving record of what it had done.
    result = run_in_sandbox(
        "n = 0\nwhile True:\n    n += 1\n    print(n)\n",
        timeout=1.5,
        max_steps=UNLIMITED_STEPS,
    )
    assert result.status == STATUS_TIMEOUT
    assert len(result.steps) >= 50, "checkpointed steps should have been salvaged"
    assert result.steps[0]["line_number"] == 1
    assert result.stdout, "stdout captured before the kill should survive"


def test_checkpoint_does_not_corrupt_a_normal_run():
    # 3 line events per iteration (header + body) for 120 iterations, plus the
    # final header evaluation that detects exhaustion.
    result = run_in_sandbox(
        "for i in range(120):\n    x = i\n", timeout=5.0, max_steps=UNLIMITED_STEPS
    )
    assert result.status == STATUS_OK, result.to_dict()
    assert len(result.steps) == 241
    assert [s["step_id"] for s in result.steps] == list(range(1, 242))


# --------------------------------------------------------------------------
# Tracer injection seam
# --------------------------------------------------------------------------


def test_custom_tracer_ref_is_resolved_inside_the_child():
    result = run_in_sandbox("x = 1\ny = 2\n", timeout=5.0, tracer=CUSTOM_TRACER_REF)
    assert result.status == STATUS_OK, result.error
    assert len(result.steps) == 2
    assert all(s.get("injected_by") == "custom_tracer" for s in result.steps)


VALUE_TRACER_REF = f"{__name__}:value_emitting_tracer"


def test_non_json_native_values_do_not_kill_the_run():
    # Stage 4.1 will put real user objects into variable_deltas. json.dump raises
    # TypeError on those, and that raise happens inside the worker's `finally`,
    # so without default=repr the child would die with no payload and the parent
    # would blame a resource limit.
    result = run_in_sandbox(
        "a = 1\nb = 2\n", timeout=5.0, tracer=VALUE_TRACER_REF
    )
    assert result.status == STATUS_OK, result.to_dict()
    assert len(result.steps) == 2
    assert result.steps[0]["variable_deltas"]["frame"]["new_value"] == "<Unserializable>"


def test_invalid_tracer_ref_fails_without_taking_down_the_caller():
    result = run_in_sandbox("x = 1\n", timeout=5.0, tracer="not-a-valid-ref")
    assert result.status == STATUS_ERROR
    assert result.error_code == "internal_error"
    assert run_in_sandbox("print('recovered')", timeout=5.0).status == STATUS_OK


def test_result_is_json_serializable():
    import json  # noqa: PLC0415

    result = run_in_sandbox(TEAMMATE_PIPELINE, timeout=5.0)
    assert isinstance(result, SandboxResult)
    payload = json.loads(json.dumps(result.to_dict()))
    assert payload["status"] == STATUS_OK
    assert isinstance(payload["steps"], list)


def main() -> int:
    tests = [(name, fn) for name, fn in sorted(globals().items()) if name.startswith("test_")]
    failures = []
    started = time.monotonic()
    for name, fn in tests:
        case_started = time.monotonic()
        try:
            fn()
        except Exception as exc:  # noqa: BLE001
            failures.append((name, exc))
            print(f"FAIL  {name}  ({time.monotonic() - case_started:.1f}s)")
            print(f"      {type(exc).__name__}: {exc}")
        else:
            print(f"ok    {name}  ({time.monotonic() - case_started:.1f}s)")
    elapsed = time.monotonic() - started
    print(f"\n{len(tests) - len(failures)}/{len(tests)} passed in {elapsed:.1f}s")
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
