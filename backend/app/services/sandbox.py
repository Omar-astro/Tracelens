"""Stage 4 Part 2 - execution sandbox for untrusted user code.

Runs a pasted Python script inside a spawned subprocess with a hard wall-clock
timeout, a restricted builtin namespace, and bounded stdout capture. The parent
never executes user code and never propagates a user-code exception, so a
malformed or hostile script can only ever come back as a `SandboxResult`.

The tracer is injected as a `"module.path:callable"` string ref rather than an
object: a `spawn` boundary cannot carry a closure or an unpicklable factory, and
Stage 4.1's deterministic tracer can therefore be dropped in later without
touching this file. See `run_in_sandbox` for the factory contract.

TODO(stage-4-tracer): `builtin_line_tracer` below is a line-event-only stand-in
so this module is independently testable. Stage 4.1 replaces it with the real
delta engine and swaps the default `DEFAULT_TRACER_REF` at the call site.
"""

from __future__ import annotations

import builtins as _real_builtins
import importlib
import io
import json
import multiprocessing
import os
import shutil
import sys
import tempfile
import time
from dataclasses import asdict, dataclass, field
from typing import Any, Callable, Dict, List, Optional

try:
    import resource as _resource
except ImportError:  # POSIX only; Windows has no resource module.
    _resource = None

# --------------------------------------------------------------------------
# Constants
# --------------------------------------------------------------------------

#: The `co_filename` handed to `compile()`. The spec's tracer filter compares
#: against this exact string, so it must stay in sync with Stage 4.1.
TRACELENS_FILENAME = "<tracelens_user_code>"

SANDBOX_TIMEOUT_SECONDS = 8.0
MAX_STEPS_DEFAULT = 300
MEMORY_LIMIT_MB = 256
STDOUT_LIMIT_CHARS = 64 * 1024
PREVIEW_ITEMS = 3

#: Modules the *traced program* may not import. This does not restrict the
#: tracer: `sandbox.py` imports `os`/`sys` at module scope and the trace
#: callback resolves names in this module's globals, never in the exec globals.
BLOCKED_NAMES = frozenset({"os", "sys", "subprocess", "socket"})

#: Builtins removed outright. `open` is a builtin rather than a module, so it is
#: deleted instead of being handled by the import guard.
BLOCKED_BUILTINS = frozenset({"open"})

DEFAULT_TRACER_REF = f"{__name__}:builtin_line_tracer"

#: How often the child checkpoints its partial trace to disk. A run killed at
#: the wall-clock timeout never reaches its final write, so without this an
#: infinite loop would come back with no steps and no captured stdout at all.
CHECKPOINT_EVERY_STEPS = 50

STATUS_OK = "ok"
STATUS_TIMEOUT = "timeout"
STATUS_ERROR = "error"

ERR_TIMEOUT = "timeout"
ERR_MAX_STEPS = "max_steps_exceeded"
ERR_SYNTAX = "syntax_error"
ERR_RUNTIME = "runtime_error"
ERR_BLOCKED_IMPORT = "blocked_import"
ERR_KILLED = "killed"
ERR_INTERNAL = "internal_error"

_real_import = _real_builtins.__import__


class MaxStepsReached(BaseException):
    """Raised inside the trace hook to unwind the traced program at the cap.

    Derives from `BaseException` so that a user ``except Exception`` around the
    hot loop cannot swallow the cap. A user ``except BaseException`` still can -
    the parent's wall-clock timeout is the backstop for that.
    """


# --------------------------------------------------------------------------
# Result type
# --------------------------------------------------------------------------


@dataclass
class SandboxResult:
    """Everything the parent managed to learn about one sandboxed run."""

    status: str = STATUS_OK
    steps: List[Dict[str, Any]] = field(default_factory=list)
    stdout: str = ""
    error: Optional[str] = None
    error_code: Optional[str] = None
    max_steps_reached: bool = False
    stdout_truncated: bool = False
    duration_ms: int = 0

    @property
    def ok(self) -> bool:
        return self.status == STATUS_OK

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


# --------------------------------------------------------------------------
# Tracer seam
# --------------------------------------------------------------------------


@dataclass
class TraceContext:
    """Handed to every tracer factory. Stage 4.1 extends or ignores as needed.

    Note the convention: a ``line`` event fires *before* its line executes, so a
    locals snapshot taken inside the hook reflects the effect of the *previous*
    line. Stage 4.1's delta engine has to pick a side of that boundary; the
    hook below deliberately records no locals to avoid prejudging it.
    """

    code: str
    source_lines: List[str]
    filename: str
    max_steps: int
    steps: List[Dict[str, Any]] = field(default_factory=list)
    count: int = 0
    max_steps_reached: bool = False
    checkpoint: Optional[Callable[[], None]] = None

    def code_line(self, lineno: int) -> str:
        if 0 < lineno <= len(self.source_lines):
            return self.source_lines[lineno - 1].strip()
        return ""

    def emit(self, step: Dict[str, Any]) -> None:
        if self.count >= self.max_steps:
            self.max_steps_reached = True
            raise MaxStepsReached()
        step["step_id"] = self.count + 1
        self.steps.append(step)
        self.count += 1
        if self.checkpoint is not None and self.count % CHECKPOINT_EVERY_STEPS == 0:
            # A checkpoint must never be able to break the traced program.
            try:
                self.checkpoint()
            except Exception:  # noqa: BLE001
                pass


#: Factory contract: ``factory(ctx) -> global_trace_function``. The returned
#: callable receives every frame event and returns the per-frame local tracer
#: (or ``None`` to skip a frame). The worker installs it with ``sys.settrace``.
TracerFactory = Callable[[TraceContext], Callable]


def builtin_line_tracer(ctx: TraceContext) -> Callable:
    """Line-event-only tracer. Placeholder for Stage 4.1.

    Two-level `sys.settrace` split: the *global* function is asked once per new
    frame and is where the `co_filename` filter lives, so library and stdlib
    frames are never traced; the *local* function then sees every event inside
    a frame that passed the filter, and must return itself to stay hooked.
    """

    def local_tracer(frame: Any, event: str, arg: Any) -> Callable:
        if event == "line":
            lineno = frame.f_lineno
            # An empty or comment-only module fires one event at line 0, which
            # is not a real line and would reach the frontend as bogus data.
            if lineno > 0:
                ctx.emit(
                    {
                        "line_number": lineno,
                        "code_line": ctx.code_line(lineno),
                        "event_type": "line",
                    }
                )
        return local_tracer

    def global_tracer(frame: Any, event: str, arg: Any) -> Optional[Callable]:
        if event == "call" and frame.f_code.co_filename == ctx.filename:
            return local_tracer
        return None

    return global_tracer


def _resolve_tracer(tracer_ref: str) -> TracerFactory:
    """Turn ``"module.path:callable"`` into a callable, inside the child."""
    module_name, sep, attr = tracer_ref.partition(":")
    if not sep or not module_name or not attr:
        raise ValueError(f"Invalid tracer ref {tracer_ref!r}; expected 'module.path:callable'")
    factory = getattr(importlib.import_module(module_name), attr)
    if not callable(factory):
        raise TypeError(f"Tracer factory {tracer_ref!r} is not callable")
    return factory


# --------------------------------------------------------------------------
# Restricted namespace
# --------------------------------------------------------------------------


def _guarded_import(name: str, globals=None, locals=None, fromlist=(), level: int = 0):
    """Stand-in for `__import__` that refuses the sandboxed module list.

    Matches on the *root* dotted component, so `import os.path` and
    `from subprocess import run` are both caught while unrelated names that
    merely start with the same letters (`oset`, `sysconfig`) still import.
    """
    if level > 0:
        raise ImportError("Relative imports are not available in the TraceLens sandbox")
    root = name.split(".")[0] if name else ""
    if root in BLOCKED_NAMES:
        raise ImportError(f"Import of '{name}' is blocked by the TraceLens sandbox")
    return _real_import(name, globals, locals, fromlist, level)


def _build_restricted_builtins() -> Dict[str, Any]:
    restricted = {k: v for k, v in vars(_real_builtins).items() if k not in BLOCKED_BUILTINS}
    restricted["__import__"] = _guarded_import
    return restricted


def _build_namespace() -> Dict[str, Any]:
    """Globals for the traced program.

    `sys` is never bound here and the injected `__builtins__` has a guarded
    `__import__`, so the program cannot reach it. The tracer and the worker are
    unaffected because they resolve names in *this module's* globals.
    """
    return {
        "__name__": "__tracelens_user__",
        "__builtins__": _build_restricted_builtins(),
        "__file__": TRACELENS_FILENAME,
        "__doc__": None,
        "__loader__": None,
        "__spec__": None,
    }


# --------------------------------------------------------------------------
# Bounded stdout
# --------------------------------------------------------------------------


class _BoundedStdout(io.StringIO):
    """StringIO that stops accumulating past `limit_chars` and records the fact.

    Guards against a `print`-flood payload; without it a tight
    `while True: print(...)` grows the pipe/memory without bound.
    """

    def __init__(self, limit_chars: int) -> None:
        super().__init__()
        self._limit = limit_chars
        self._written = 0
        self.truncated = False

    def write(self, s: str) -> int:
        if not isinstance(s, str):
            s = str(s)
        original_len = len(s)
        room = self._limit - self._written
        if room <= 0:
            self.truncated = True
            return original_len
        if len(s) > room:
            s = s[:room]
            self.truncated = True
        self._written += len(s)
        super().write(s)
        return original_len


# --------------------------------------------------------------------------
# Resource limits (POSIX only)
# --------------------------------------------------------------------------


def _apply_resource_limits(cpu_seconds: int, memory_limit_mb: Optional[int]) -> None:
    """Best-effort OS-enforced ceilings. No-op on Windows.

    These are set in the child before any user code runs, which is the whole
    point: a Python-level `try/except` cannot catch SIGKILL from RLIMIT_CPU, and
    an allocation bomb trips RLIMIT_AS before the wall-clock timeout does.
    """
    if _resource is None:
        return
    try:
        _resource.setrlimit(_resource.RLIMIT_CPU, (cpu_seconds, cpu_seconds))
    except (ValueError, OSError):
        pass
    if memory_limit_mb:
        try:
            byte_limit = memory_limit_mb * 1024 * 1024
            _resource.setrlimit(_resource.RLIMIT_AS, (byte_limit, byte_limit))
        except (ValueError, OSError):
            pass


# --------------------------------------------------------------------------
# Child process
# --------------------------------------------------------------------------


def _write_payload(result_path: str, payload: Dict[str, Any]) -> None:
    """Atomically publish a payload, so the parent never reads a partial file.

    os.replace is atomic on both POSIX and Windows; a plain write is not, and the
    parent may poll this path while the child is mid-write.

    `default=repr` and the broad `except` are load-bearing. Steps carry values out
    of the traced program's locals, so once Stage 4.1 starts recording real
    objects in `variable_deltas`, a single DataFrame or custom instance would
    make `json.dump` raise TypeError inside the worker's `finally` block - the
    child would die with no payload at all and the parent would report a
    misleading resource-limit error, losing the entire trace. This is a safety
    net, not the real fix: Stage 4.3's serializer is what should make these
    values JSON-native in the first place.
    """
    scratch = f"{result_path}.part"
    try:
        with open(scratch, "w", encoding="utf-8") as handle:
            json.dump(payload, handle, default=repr)
        os.replace(scratch, result_path)
    except Exception:  # noqa: BLE001 - never let reporting break tracing
        pass


def _worker(
    code: str,
    filename: str,
    tracer_ref: str,
    max_steps: int,
    result_path: str,
    cpu_seconds: int,
    memory_limit_mb: Optional[int],
    stdout_limit: int,
) -> None:
    """Entry point of the spawned child. Must stay importable-by-reference.

    Under `spawn` the child re-imports this module, so nothing here may depend
    on state built in the parent, and every argument must be a plain primitive.
    """
    payload: Dict[str, Any] = {
        "status": STATUS_ERROR,
        "steps": [],
        "stdout": "",
        "error": None,
        "error_code": ERR_INTERNAL,
        "max_steps_reached": False,
        "stdout_truncated": False,
    }
    sink = _BoundedStdout(stdout_limit)
    previous_trace = None
    previous_stdout = None
    entered_exec = False
    try:
        # A tracer inherited from the parent (coverage, a debugger) would fight
        # the user's tracer for the same hook slot. Drop it first.
        sys.settrace(None)
        previous_trace = None
        _apply_resource_limits(cpu_seconds, memory_limit_mb)

        previous_stdout = sys.stdout
        sys.stdout = sink

        ctx = TraceContext(
            code=code,
            source_lines=code.splitlines(),
            filename=filename,
            max_steps=max_steps,
            checkpoint=lambda: _write_payload(
                result_path,
                {
                    "status": "running",
                    "steps": ctx.steps,
                    "stdout": sink.getvalue(),
                    "stdout_truncated": sink.truncated,
                    "max_steps_reached": False,
                },
            ),
        )
        compiled = compile(code, filename, "exec")
        sys.settrace(_resolve_tracer(tracer_ref)(ctx))
        entered_exec = True
        try:
            exec(compiled, _build_namespace())
        finally:
            # Runs on the way out of exec whether it finished or unwound, so
            # partial steps survive a failure. Each `except` below then has to
            # overwrite the optimistic status this block sets.
            sys.settrace(previous_trace)
            payload["steps"] = ctx.steps
            payload["max_steps_reached"] = ctx.max_steps_reached
            payload["status"] = STATUS_OK
            payload["error"] = None
            payload["error_code"] = None
    except MaxStepsReached:
        # Clean stop at the step cap: partial steps are still worth returning.
        payload["status"] = STATUS_ERROR
        payload["error"] = f"Step cap of {max_steps} reached; trace truncated."
        payload["error_code"] = ERR_MAX_STEPS
    except ImportError as exc:
        payload["status"] = STATUS_ERROR
        payload["error"] = f"{type(exc).__name__}: {exc}"
        # ModuleNotFoundError is an ImportError too: a typo must not be reported
        # as a policy block, so only our own message counts as blocked.
        payload["error_code"] = (
            ERR_BLOCKED_IMPORT if "TraceLens sandbox" in str(exc) else ERR_RUNTIME
        )
    except SyntaxError as exc:
        payload["status"] = STATUS_ERROR
        payload["error"] = f"SyntaxError: {exc}"
        payload["error_code"] = ERR_SYNTAX
    except BaseException as exc:  # noqa: BLE001 - the child must never die silently
        payload["status"] = STATUS_ERROR
        payload["error"] = f"{type(exc).__name__}: {exc}"
        # A failure before exec means our own setup or the tracer ref was wrong,
        # which is our bug, not the user's script.
        payload["error_code"] = ERR_RUNTIME if entered_exec else ERR_INTERNAL
    finally:
        if previous_stdout is not None:
            sys.stdout = previous_stdout
        payload["stdout"] = sink.getvalue()
        payload["stdout_truncated"] = sink.truncated
        _write_payload(result_path, payload)


# --------------------------------------------------------------------------
# Parent
# --------------------------------------------------------------------------


def _read_payload(result_path: str) -> Dict[str, Any]:
    """Best-effort read of the child's last published payload."""
    try:
        with open(result_path, "r", encoding="utf-8") as handle:
            payload = json.load(handle)
    except (OSError, ValueError):
        return {}
    return payload if isinstance(payload, dict) else {}


def run_in_sandbox(
    code: str,
    *,
    filename: str = TRACELENS_FILENAME,
    timeout: float = SANDBOX_TIMEOUT_SECONDS,
    max_steps: int = MAX_STEPS_DEFAULT,
    tracer: str = DEFAULT_TRACER_REF,
    memory_limit_mb: Optional[int] = MEMORY_LIMIT_MB,
    stdout_limit: int = STDOUT_LIMIT_CHARS,
) -> SandboxResult:
    """Execute `code` in a spawned subprocess under a hard wall-clock timeout.

    `tracer` is a `"module.path:callable"` ref resolved *inside the child* to a
    `TracerFactory` - a callable taking a `TraceContext` and returning a
    `sys.settrace` global function. Stage 4.1 registers its own factory and
    passes e.g. `"app.services.tracer:build_tracer"`; this file needs no edit.

    Never raises: every failure mode is folded into a `SandboxResult`.
    """
    started = time.monotonic()

    def finish(result: SandboxResult) -> SandboxResult:
        result.duration_ms = int((time.monotonic() - started) * 1000)
        return result

    if not isinstance(code, str):
        return finish(
            SandboxResult(
                status=STATUS_ERROR,
                error="Code payload must be a string.",
                error_code=ERR_SYNTAX,
            )
        )

    # Compile in the parent first: a syntax error then costs no process spawn
    # and surfaces a clean, correctly located message instead of a child crash.
    try:
        compile(code, filename, "exec")
    except SyntaxError as exc:
        return finish(
            SandboxResult(
                status=STATUS_ERROR,
                error=f"SyntaxError: {exc.msg} (line {exc.lineno})",
                error_code=ERR_SYNTAX,
            )
        )
    except ValueError as exc:
        return finish(
            SandboxResult(status=STATUS_ERROR, error=str(exc), error_code=ERR_SYNTAX)
        )

    workdir = tempfile.mkdtemp(prefix="tracelens_sandbox_")
    result_path = os.path.join(workdir, "result.json")
    process = None
    try:
        context = multiprocessing.get_context("spawn")
        process = context.Process(
            target=_worker,
            args=(
                code,
                filename,
                tracer,
                int(max_steps),
                result_path,
                int(max(timeout, 1)),
                memory_limit_mb,
                int(stdout_limit),
            ),
            daemon=True,
        )
        process.start()
        process.join(timeout)

        if process.is_alive():
            # Past the deadline. terminate() lets the child unwind; kill() is
            # the SIGKILL-equivalent it cannot catch or ignore.
            process.terminate()
            process.join(1)
            if process.is_alive():
                process.kill()
                process.join()
            # The child never reached its final write, so salvage whatever the
            # last checkpoint captured - a timed-out run still shows the steps
            # and stdout that led up to the hang.
            partial = _read_payload(result_path)
            return finish(
                SandboxResult(
                    status=STATUS_TIMEOUT,
                    steps=partial.get("steps", []),
                    stdout=partial.get("stdout", ""),
                    error=f"Execution exceeded the {timeout:g}s time limit and was terminated.",
                    error_code=ERR_TIMEOUT,
                    stdout_truncated=bool(partial.get("stdout_truncated")),
                )
            )

        if not os.path.exists(result_path) or os.path.getsize(result_path) == 0:
            # Exited without writing: the OS killed it, almost certainly for
            # breaching RLIMIT_CPU/RLIMIT_AS before the except block could run.
            partial = _read_payload(result_path)
            return finish(
                SandboxResult(
                    status=STATUS_ERROR,
                    steps=partial.get("steps", []),
                    stdout=partial.get("stdout", ""),
                    error="Sandbox process terminated before reporting (likely a resource limit).",
                    error_code=ERR_KILLED,
                    stdout_truncated=bool(partial.get("stdout_truncated")),
                )
            )

        payload = _read_payload(result_path)
        if not payload:
            return finish(
                SandboxResult(
                    status=STATUS_ERROR,
                    error="Sandbox process produced no readable result.",
                    error_code=ERR_KILLED,
                )
            )
        return finish(
            SandboxResult(
                status=payload.get("status", STATUS_ERROR),
                steps=payload.get("steps", []),
                stdout=payload.get("stdout", ""),
                error=payload.get("error"),
                error_code=payload.get("error_code"),
                max_steps_reached=bool(payload.get("max_steps_reached")),
                stdout_truncated=bool(payload.get("stdout_truncated")),
            )
        )
    except Exception as exc:  # noqa: BLE001 - the server must survive anything
        # Anything reaching here came from our own setup (mkdtemp, Process
        # creation, reading the result), never from the user's script.
        return finish(
            SandboxResult(
                status=STATUS_ERROR,
                error=f"{type(exc).__name__}: {exc}",
                error_code=ERR_INTERNAL,
            )
        )
    finally:
        if process is not None and process.is_alive():
            process.kill()
            process.join()
        shutil.rmtree(workdir, ignore_errors=True)


def main() -> int:
    demo = "for i in range(4):\n    x = i * 2\n"
    result = run_in_sandbox(demo, timeout=5.0)
    print(json.dumps(result.to_dict(), indent=2)[:1200])
    return 0 if result.ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
