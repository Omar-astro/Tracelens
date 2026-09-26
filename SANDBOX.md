# A Deterministic Execution Sandbox for Untrusted Python

**Module:** `backend/app/services/sandbox.py` (614 lines)
**Tests:** `tests/test_sandbox.py` (484 lines, 32 tests, 100% passing)
**Language / runtime:** Python 3.12 and 3.13, CPython
**Status:** Complete and verified

---

## Abstract

This document describes the design, implementation, and empirical evaluation of a
sandbox for executing untrusted Python source code in a controlled environment. The
sandbox's purpose is to run a program supplied by an end user — a script pasted into a
web form — and return a structured, step-by-step record of its execution, while
guaranteeing that the program cannot hang, exhaust memory, or destabilise the host
process.

The central claim of this report is deliberately narrow and, we argue, the honest one:
**the sandbox's restricted Python namespace is not a security boundary.** It is a
usability and policy mechanism. We demonstrate experimentally (§8) that all four
"dangerous" modules it blocks remain trivially reachable through indirect paths, and we
explain precisely why. The actual containment is provided by OS-level process isolation,
a hard wall-clock kill, and resource limits. A design that misrepresents which mechanism
is doing the work is a design that will be trusted beyond its capabilities, so we
foreground this distinction rather than burying it.

---

## Table of contents

1. [Problem statement and motivation](#1-problem-statement-and-motivation)
2. [Objectives and non-objectives](#2-objectives-and-non-objectives)
3. [Threat model](#3-threat-model)
4. [Architecture](#4-architecture)
5. [The tracing mechanism](#5-the-tracing-mechanism)
6. [The step model and resource budget](#6-the-step-model-and-resource-budget)
7. [Process isolation and the timeout guarantee](#7-process-isolation-and-the-timeout-guarantee)
8. [The restricted namespace — and why it is not a security boundary](#8-the-restricted-namespace--and-why-it-is-not-a-security-boundary)
9. [Result transport and the pipe deadlock](#9-result-transport-and-the-pipe-deadlock)
10. [Robustness engineering](#10-robustness-engineering)
11. [Extensibility: the tracer injection seam](#11-extensibility-the-tracer-injection-seam)
12. [Public API reference](#12-public-api-reference)
13. [Evaluation and testing](#13-evaluation-and-testing)
14. [Limitations and future work](#14-limitations-and-future-work)
15. [Conclusion](#15-conclusion)
16. [Appendix A — Constants](#appendix-a--constants)
17. [Appendix B — Reproduction](#appendix-b--reproduction)

---

## 1. Problem statement and motivation

Static analysis of a Python program can determine what *may* happen when it runs. It
cannot determine what *does* happen. Consider three short programs:

```python
for record in raw_logs:        # How many times does this run? What is in `record`?
    if len(name) > 0:          # Which branch is taken, per iteration?
        cleaned.append(...)    # What does the list look like on each pass?
```

A reader — or a language model asked to explain the code — can guess. A tracer cannot
guess: it can report, for each executed line in order, the exact state of the local
namespace immediately before that line runs. The module described here is the execution
substrate for such a tracer. It accepts a source string, runs it under an instrumented
interpreter, and returns an ordered list of execution steps.

The difficulty is that this program is, by construction, **untrusted**. It is arbitrary
user input, and it may contain an infinite loop, an allocation bomb, or a print
statement in a tight loop. Any of these, if allowed to run in the host process, produces
a denial of service. The sandbox exists to make "run this and tell me what happened" a
safe operation to offer.

**Context.** This module is the execution substrate of TraceLens, a runtime code-tracing
tool. It is deliberately decoupled from any particular tracer implementation: the tracing
logic is supplied through an injection seam (§11), and the built-in tracer records only
line events, serving as a working reference and a test vehicle.

---

## 2. Objectives and non-objectives

### 2.1 Objectives

| # | Requirement | Verified by |
|---|---|---|
| O1 | Execute untrusted source in isolation from the host process | §7 |
| O2 | Terminate within a hard wall-clock bound (8 s default) regardless of program behaviour | §7, `test_while_true_is_killed_at_the_default_eight_seconds` |
| O3 | Bound memory consumption | §7.2 |
| O4 | Return a structured step trace, not raw output | §6 |
| O5 | Guarantee the host process survives every input, without exception escaping | §10.4 |
| O6 | Report failures as data, not as exceptions or stack traces | §10.3 |
| O7 | Degrade gracefully: return partial results when a run is cut short | §6.3 |
| O8 | Support a richer tracer without modifying this module | §11 |
| O9 | Signal policy violations (dangerous imports) to the user | §8.1 |

### 2.2 Non-objectives

Stated explicitly, because the boundary of the design is as important as its content:

- **N1. Not a security boundary against a determined attacker.** See §8.3.
- **N2. Not a virtual machine or container.** No syscall filtering, no seccomp, no
  namespace isolation.
- **N3. Not a bytecode verifier.** The source is compiled with the standard `compile()`.
- **N4. Not a defence against interpreter-level escapes.** See §8.2.
- **N5. Not a resource scheduler.** One run consumes one process; there is no admission
  control across concurrent runs (§14).

---

## 3. Threat model

We assume the adversary controls the **complete text of the source string** and nothing
else. We assume the host environment is not otherwise compromised.

**In scope:**

| Threat | Mechanism | Result |
|---|---|---|
| T1 Infinite loop | Wall-clock timeout + escalation to `SIGKILL` | Run terminated, partial trace returned |
| T2 Unbounded allocation | `RLIMIT_AS` (POSIX) + step cap | Terminated, or `MemoryError` caught |
| T3 CPU exhaustion | `RLIMIT_CPU` (POSIX) + wall-clock timeout | Terminated |
| T4 Console flooding (`while True: print(...)`) | Bounded stdout accumulator | Memory bounded; run still cut short by timeout |
| T5 Trace amplification (many executed lines) | Step cap | Trace truncated at cap |
| T6 Unhandled exception in user code | Caught in child, converted to a result field | Reported as data |
| T7 Syntax error | Detected in the parent before any process is created | Reported as data, zero process cost |
| T8 Process crash / abort | Missing result file detected by parent | Reported as `killed` |
| T9 Non-serialisable object in the trace | `json.dump(default=repr)` | Degraded to `repr`, trace preserved |
| T10 Accidental use of a dangerous module | Restricted namespace | `ImportError` with a clear message |

**Out of scope (see §8.3 for evidence):** filesystem access, network access, process
spawn, and dynamic-code execution are all reachable by the untrusted program. These are
inherent to running arbitrary Python in a general-purpose interpreter and are not
addressed by an import filter.

---

## 4. Architecture

### 4.1 Component layout

```
run_in_sandbox(code, ...)                              [HOST PROCESS]
    │
    ├─ compile(code)                    ← syntax errors caught here, no process spawned
    ├─ mkdtemp()                        ← private result directory
    ├─ Process(target=_worker, daemon=True)
    │      args are plain primitives only (spawn must pickle them)
    │
    ├─ process.join(timeout) ──────────► if is_alive():
    │                                      terminate()      ← SIGTERM
    │                                      join(1)
    │                                      if still alive:
    │                                          kill()      ← SIGKILL
    │                                      → status = "timeout"
    ├─ _read_payload(result_path)       ← final write, or last checkpoint (§6.3)
    └─ rmtree(workdir)                  ← unconditional cleanup
    ═══════════════════════════════════════════════════════════════
    │  _worker(...)                                    [CHILD PROCESS]
    ├─ sys.settrace(None)              ← drop any inherited tracer
    ├─ _apply_resource_limits()        ← RLIMIT_CPU, RLIMIT_AS (no-op off POSIX)
    ├─ sys.stdout = _BoundedStdout()    ← capture, with a hard size bound
    ├─ ctx = TraceContext(..., checkpoint=...)
    ├─ sys.settrace(factory(ctx))      ← install the tracer
    ├─ exec(compile(code, FAKE_NAME), restricted_ns)
    └─ _write_payload(result_path)     ← atomic: write .part, then os.replace
```

### 4.2 The three-namespace invariant

The single most important structural decision in the module. Three distinct namespaces
exist, and only the third is visible to the untrusted program:

| Namespace | Owner | Contains `sys`? |
|---|---|---|
| `sandbox.py` module globals | `_worker`, `sys.settrace`, stdout redirection | **yes** — the tracer's |
| trace-callback `__globals__` | resolves to `sandbox.py`'s module dict | **yes** — the same dict |
| `exec` globals | `__name__`, `__file__`, restricted `__builtins__` | **no** |

This is what allows the specification's requirement to *"block `sys` for the traced
program's own use of it, not the tracer's"* to be satisfied without any shadowing trick.
The traced program never has `sys` bound, and the `IMPORT_NAME` opcode resolves
`__import__` from the injected builtins dictionary, so it receives an `ImportError`. The
tracer is entirely unaffected because a Python function's name resolution walks *its own*
`__globals__`, which is the defining module's namespace — here, `sandbox.py`'s — and never
the exec namespace.

Two non-obvious consequences, both test-locked:

- `print()` output **is** still captured. `print` resolves `sys.stdout` from the
  interpreter's own state at call time, not from the caller's namespace, so redirecting
  `sys.stdout` in the child captures user output even though the user cannot name `sys`.
  (`test_stdout_is_captured_even_though_sys_is_blocked`)
- A user variable named `sys` or `open` does not perturb the tracer.
  (`test_user_binding_sys_does_not_disturb_the_tracer`)

### 4.3 Lifecycle guarantees

`run_in_sandbox` is a **total function**: it has no path that raises. Every statement
after process creation is inside a `try`, the child is killed in a `finally` if it
survived, and the temporary directory is removed unconditionally. The `SandboxResult`
return type is therefore a faithful description of the contract: *the caller asks what
happened, and it is told.*

---

## 5. The tracing mechanism

### 5.1 The two-level `sys.settrace` protocol

`sys.settrace` accepts a single *global* trace function with the signature
`(frame, event, arg)`. CPython invokes it once per new frame with `event == "call"`. The
value it returns becomes the *local* trace function for that frame, called for every
subsequent event in it. The local function must return itself to remain installed.

The two-level split is not stylistic — it is the only way to satisfy both requirements
simultaneously:

- **Filtering belongs in the global function.** It is the sole per-frame entry point, so
  a single `co_filename` comparison there excludes the entire standard library and all
  third-party code from tracing. Placing the filter in the local function would still pay
  the cost of *entering* every library frame.
- **Event handling belongs in the local function.** Having it return `None` for a
  frame un-installs tracing for that frame's future events.

```python
def global_tracer(frame, event, arg):
    if event == "call" and frame.f_code.co_filename == ctx.filename:
        return local_tracer      # trace this frame
    return None                  # ignore this frame and its callees

def local_tracer(frame, event, arg):
    if event == "line":
        ...record...
    return local_tracer          # stay installed
```

### 5.2 Synthetic filename as a frame predicate

Untrusted source is compiled with a synthetic filename rather than written to disk:

```python
compile(code, "<tracelens_user_code>", "exec")
```

This is preferable to a temporary file for three reasons: no filesystem write, no cleanup,
and — most importantly — the predicate cannot be spoofed by the program. A program cannot
make one of its own frames claim a different `co_filename`, so it cannot induce the tracer
to ignore a frame it wants ignored, nor avoid being traced.

The trade-off is that error messages reference `<tracelens_user_code>` instead of a real
path, and tracebacks carry no file position. Acceptable, because tracebacks are
deliberately suppressed in favour of structured results (§10.3).

### 5.3 Event semantics: `line` fires *before* execution

A `line` event is delivered immediately **before** the line executes. Consequently, at the
event for line *N*, `frame.f_locals` reflects the effect of line *N−1*. This is a genuine
ambiguity in the tracing model, and it has no single correct resolution: attributing a
delta to the line that caused it (line *N−1*) and attributing it to the line about to
execute (line *N*) are both defensible and are used by different tools.

The built-in tracer deliberately **does not resolve this question**, because it records no
locals at all — only `line_number`, `code_line`, and `event_type`. A richer tracer
supplying variable deltas must choose a convention and apply it consistently; the seam
(§11) is designed so that this is its decision to make, not an accident of this module's
structure.

### 5.4 Frame selection is correct by construction

Function bodies are only traced once actually invoked, because the global tracer is
consulted at call time. `test_only_traced_frames_are_recorded` asserts both directions:
the body of a function that is never called never appears, and the body of a function that
is called does.

---

## 6. The step model and resource budget

### 6.1 Steps

A step is a plain `dict`, deliberately a **strict subset** of a richer schema so that
tracers can add fields without any change to this module:

```python
{"step_id": 1, "line_number": 1, "code_line": "for i in range(3):", "event_type": "line"}
```

`step_id` is 1-based and contiguous, assigned by the context rather than the tracer, so
identity is consistent even if a custom tracer reorders or filters.

### 6.2 The step cap

`max_steps` (default 300) bounds the *size* of a trace, which the wall-clock timeout does
not: a program can execute ten million straight-line statements in under a second. When
the cap is reached, `TraceContext.emit` raises `MaxStepsReached` from inside the trace
hook, which unwinds the traced program.

`MaxStepsReached` derives from **`BaseException`**, not `Exception`. This is deliberate:
a user program containing `try: ... except Exception:` around its hot loop would
otherwise silently swallow the cap and the run would continue unbounded. A user
`except BaseException` could still swallow it; the wall-clock timeout is the backstop for
that case.

**Interaction worth noting.** With the default cap, `while True: pass` terminates in
roughly 375 ms at the *step* cap and never reaches the 8-second timeout. The two
safeguards are independent and both correct, but they mask one another, which affects how
each must be tested:

```python
run_in_sandbox("while True:\n    pass\n")                  # max_steps_exceeded at 300
run_in_sandbox("while True:\n    pass\n", max_steps=10**9) # timeout after ~8 s
```

Both behaviours are asserted (`test_step_cap_masks_the_timeout_on_an_infinite_loop`,
`test_while_true_is_killed_at_the_default_eight_seconds`).

### 6.3 Partial result recovery

A process killed at the wall clock never reaches its final write. Without intervention the
result of a hung program would be *nothing at all* — precisely the case where diagnostic
information is most valuable.

The child therefore checkpoints every 50 steps (`CHECKPOINT_EVERY_STEPS`), writing the
steps and captured stdout accumulated so far. The parent salvages the last checkpoint on
both the `timeout` and `killed` paths. Measured result: a program killed after 1.5 s
returns **2400 salvaged steps and 3088 characters of captured stdout**.

Checkpoint writes are atomic (§9.2), so a parent polling the result path can never read a
half-written file.

---

## 7. Process isolation and the timeout guarantee

### 7.1 Why a subprocess and not a thread

The specification permits "an isolated subprocess **or thread**". Only the subprocess
provides real containment, and the reason is worth stating precisely rather than
rhetorically.

CPython offers no supported way to terminate a thread. The nearest facility,
`PyThreadState_SetAsyncExc`, *injects an exception* — it does not preempt. An injected
exception is not delivered while the thread is executing inside most C extension code, and
a thread spinning in a tight Python loop may not reach a delivery point promptly. Even
when injection succeeds, the thread's stack is not reclaimed and any lock it holds stays
held, so the host process can remain permanently degraded. Termination is therefore
*best-effort* where the requirement is *unconditional*.

A process, by contrast, can be destroyed unconditionally: `SIGKILL` cannot be caught,
blocked, or ignored, and the kernel reclaims all associated resources. Termination is
*unconditional*.

This asymmetry is the entire reason for the design. `multiprocessing`'s **`spawn`** start
method is used rather than `fork`, for three reasons: it avoids inheriting the parent's
open file descriptors, sockets, and threads; it behaves identically on Windows, macOS, and
Linux, so the code is portable; and it produces a child whose interpreter state is known
rather than inherited.

`spawn` imposes a hard constraint that shapes the whole design: **the child re-imports the
parent's `__main__` by file path**, and any function passed to `Process` must be
importable by reference. Both are discussed in §11 and Appendix B.

### 7.2 Resource limits

On POSIX, the child applies two OS-enforced ceilings before any user code runs:

| Limit | Value | Effect when breached |
|---|---|---|
| `RLIMIT_CPU` | `int(max(timeout, 1))` seconds | `SIGXCPU`, then `SIGKILL`. Uncatchable. |
| `RLIMIT_AS` | 256 MB of address space | Allocation fails, raising `MemoryError`; the process may be killed outright. |

The significance of enforcing these in the kernel, rather than in Python, is that they
cannot be caught, intercepted, or ignored by the untrusted program. A `try/except` in user
code has no effect on a signal it never receives permission to handle.

**On Windows these are absent.** `resource` is a POSIX-only module, so
`_apply_resource_limits` is a documented no-op there and the wall-clock timeout is the
*only* guard against an allocation bomb. This is a real and measured limitation (§14), not
a theoretical one; it affects local development on Windows, not deployment on Linux.

### 7.3 The escalation ladder

```
join(timeout)                          ← wait up to 8 s
  ├─ exited cleanly          → read the result
  └─ still alive             → terminate()      (SIGTERM — may be caught)
                               join(1)
                               └─ still alive → kill()   (SIGKILL — cannot be caught)
```

The intermediate `SIGTERM` is a courtesy: it lets a cooperative child unwind and release
resources. It is never *relied upon*, because a program may install a handler for it. The
measured wall-clock for the default timeout is 8.2–8.5 s, comfortably inside the bound
while still honouring the polite escalation.

### 7.4 Empirically verified

| Input | Outcome | Measured |
|---|---|---|
| `while True: pass` | `timeout` | 8.2–8.5 s, parent responsive afterwards |
| `while True: print("x"*4096)` | `timeout` | stdout bounded, `stdout_truncated` set |
| `x = "a" * 10**10` | `error` or `timeout` | returns; never hangs |
| `for i in range(1000)` at `max_steps=10` | `max_steps_exceeded` | exactly 10 steps |
| `1/0` | `runtime_error` | partial steps preserved |
| `def broken(:` | `syntax_error` | no process created |

---

## 8. The restricted namespace — and why it is not a security boundary

### 8.1 Mechanism

The exec namespace receives a *copy* of the builtins dictionary with entries removed and
`__import__` replaced by a guard:

```python
BLOCKED_NAMES      = {"os", "sys", "subprocess", "socket"}   # module imports
BLOCKED_BUILTINS   = {"open"}                                # removed from the dict
```

`open` is a builtin rather than a module, so it is deleted outright. Module access is
intercepted by a replacement `__import__` that refuses the blocked names, matching on the
**exact root dotted component** so that `import os.path` and `from subprocess import run`
are both caught while `import sysconfig` is not. Relative imports (`level > 0`) are
refused, since the exec namespace has no package context.

The guard is installed into the builtins dictionary *and* the exec globals, so it is
reached regardless of how the import statement is written. Calling `__import__` directly
is subject to the same guard, since the name resolves to the same object.

### 8.2 Experimental results: every block is bypassable

Each row below was executed inside the sandbox. **The bypasses are not theoretical.**

| Attempt | Result |
|---|---|
| `import os` | **blocked** |
| `import sys` | **blocked** |
| `import subprocess` | **blocked** |
| `import socket` | **blocked** |
| `open("...")` | **blocked** |
| `import pathlib` → `Path('.').iterdir()` | **succeeded — listed 13 directory entries** |
| `import shutil` | **succeeded** |
| `import importlib; importlib.import_module('os')` | **succeeded — reached `os`** |
| `import builtins; builtins.open` | **succeeded — the real `open`** |
| `import urllib.request; urllib.request.socket` | **succeeded — the real `socket` class** |
| `e.__traceback__.tb_next.tb_frame.f_globals['sys']` | **succeeded — the tracer's own `sys`** |

### 8.3 Why: the mechanism cannot work as specified

The restriction applies to **one module's namespace**. Every library the untrusted program
imports is loaded by the real import machinery and therefore carries its own unrestricted
`__builtins__` and its own module-level imports. `pathlib` reaching the filesystem is not a
defect in `pathlib`; it is `pathlib` doing its job, using the `os` module it legitimately
imported at its own import time. Blocking `os` at the *user's* import gate does not
retroactively revoke `os` from a module that already holds a reference.

The general form of the bypass is therefore:

> Any capability reachable by the standard library is reachable by the untrusted program,
> because the program may import any module not on the denylist, and such a module's
> namespace contains no trace of our restriction.

Python offers no in-process mechanism to constrain what a module can do once loaded. A
custom `__builtins__` shapes the *user's* name resolution and nothing else. This is a
structural property of the language, not an implementation gap in this module.

### 8.4 What actually provides containment

Stated plainly, so that the guarantee is not over-read:

1. **The spawned subprocess.** A separate address space and process table entry. It can be
   destroyed unconditionally; a hung thread cannot (§7.1).
2. **The 8-second wall-clock kill**, escalating to `SIGKILL`.
3. **`RLIMIT_CPU` / `RLIMIT_AS`**, where the platform provides them (absent on Windows).

The restricted namespace contributes **user-facing clarity** — a student who writes
`import os` is told why it did not work — and **defence in depth against casual
accidents**. It contributes nothing against a motivated adversary.

### 8.5 Appropriate use

| Deployment | Assessment |
|---|---|
| Local tool; user runs their own code on their own machine | **Appropriate.** The process dies with the request. |
| Single-user development server, trusted users | **Appropriate**, with the caveat that a bug in the tracer could expose the host. |
| Multi-tenant service, untrusted strangers, public network | **Not appropriate as implemented.** |

Closing the gap requires a mechanism outside the interpreter: a container, `nsjail`, or a
microVM (Firecracker) with a read-only filesystem, no network namespace, a memory cgroup,
and a PID limit. At the Python level, only a **strict allowlist** has any chance of
holding — and even an allowlist must additionally block `importlib`, `builtins`,
`inspect`, and `traceback`, since the bypass runs through those rather than through `os`.

---

## 9. Result transport and the pipe deadlock

### 9.1 The obvious implementation is wrong

The natural way to return data from a child process is `multiprocessing.Pipe`. It
deadlocks:

```python
process.start()
process.join(timeout)          # ← blocks
...
parent_conn.recv()             # ← never reached
```

The child calls `conn.send(payload)`. If the payload exceeds the OS pipe buffer —
64 KiB on both Linux and Windows — the write blocks **and the child does not exit**. The
parent is blocked in `join` waiting for that exit. Neither proceeds. After the timeout the
parent kills a child that was working perfectly.

This is not an edge case. A trace of 300 steps, each carrying several variable deltas,
routinely exceeds 64 KiB — the `APPENDIX`-style demo script alone produces a multi-kilobyte
payload. The failure would be reproducible, and would present as "the sandbox randomly times
out on larger scripts".

### 9.2 The adopted solution

The child writes JSON to a file in a private temporary directory, and the parent reads it
after the process exits. There is no shared buffer and therefore no deadlock: the child's
write is to a regular file, which never blocks indefinitely.

Two details make this robust:

- **Atomic publication.** The payload is written to `result.json.part` and then moved with
  `os.replace`, which is atomic on both POSIX and Windows. The parent may therefore poll
  the result path (§6.3) without any risk of reading a partially written file.
- **Graceful degradation.** `_write_payload` catches all exceptions rather than only
  `OSError`. See §10.5 for why that distinction turned out to matter.

---

## 10. Robustness engineering

### 10.1 Bounded stdout

`print` in a tight loop is a memory-exhaustion vector that the step cap does not bound,
because output accumulates *between* steps. `sys.stdout` is therefore replaced with a
`StringIO` subclass that stops accumulating past a configurable limit (64 KiB) and records
that truncation occurred.

The accumulator also honours the `write` contract: it returns the number of characters the
caller *passed*, not the number retained, so a caller cannot detect truncation by
inspecting the return value. This keeps the bound invisible to the untrusted program,
which is the point — the program should not be able to adapt its behaviour to work around
it.

### 10.2 Parent-side syntax check

The source is compiled in the host before any process is created. A syntax error therefore
costs no process spawn at all, and produces a correctly located message. This is both a
performance property and a robustness one: the failure mode of the child cannot be
mistaken for a resource problem.

### 10.3 Errors as data

No Python traceback ever reaches the caller. Every failure is reduced to
`status` + `error_code` + a human-readable `error` string, drawn from a closed set of
eight codes (§12.2). Two classification subtleties are worth recording:

- **`ModuleNotFoundError` is `runtime_error`, not `blocked_import`.** It is a subclass of
  `ImportError`, so a naive `except ImportError` would tell a user who mistyped
  `import numpyish` that their import was *policy-blocked* — a confusing and
  inaccurate error. The classification keys on our own message instead.
- **CPython appends a non-ASCII "perhaps you meant" list** to its own failed-import
  messages, enumerating every module sharing a prefix. Left unsanitised, this leaks
  information about the host's standard library into user-visible output. Our own message
  is emitted instead, and `test_blocked_import_error_does_not_leak_the_block_list` asserts
  the absence of the leak.

### 10.4 The total-function contract

`run_in_sandbox` cannot raise. The child is killed in a `finally` if it survived, the
temporary directory is removed unconditionally, and every internal error is converted to
`internal_error`. A caller can be written as a straight-line function with no `try` block
around the sandbox call.

### 10.5 The serialisation failure mode

A defect found during evaluation is instructive enough to document.

Steps carry values drawn from the traced program's locals, so a richer tracer will place
arbitrary objects into `variable_deltas`. `json.dump` raises **`TypeError`** on such
objects — and this raise occurs inside the worker's `finally` block, i.e. during cleanup.
The child would die without publishing a result, and the parent would correctly but
misleadingly report a resource-limit failure — **losing the entire trace because one
variable was a DataFrame.**

The built-in tracer records no values, so this path was initially unreachable. It is
*dormant but armed*: the defect activates the instant a tracer emits real values. Two
independent mitigations are in place:

1. `json.dump(..., default=repr)`, so a non-serialisable object degrades to its `repr`
   instead of destroying the trace.
2. `except Exception` rather than `except OSError`, because `TypeError` is not an `OSError`.

`test_non_json_native_values_do_not_kill_the_run` pins the behaviour end-to-end using a
tracer that deliberately emits a non-serialisable object per step.

This is a **safety net, not a fix.** The correct fix is a serialisation layer that
projects rich objects to shape, column names, and a small row preview — never the full
array — which is not implemented here and is listed as future work (§14).

---

## 11. Extensibility: the tracer injection seam

### 11.1 Design constraint

The tracer is supplied as a **string**, not as an object:

```python
run_in_sandbox(code, tracer="app.services.tracer:build_tracer")
```

Two reasons, both binding:

1. **A `spawn` boundary cannot carry a closure or an unpicklable factory.** The tracer
   must be constructed *inside* the child, after the child's tracing state has been reset.
2. **Non-negotiable architectural constraint.** A string reference is what allows a richer
   tracer to be added later with **zero modifications to this module**. The coupling
   between the two components is one string.

Resolution occurs in the child via `importlib.import_module` + `getattr`
(`sandbox.py:200`). Consequently any module the factory depends on must be importable in
the *child* — which is automatic, since `spawn` propagates the parent's `sys.path`.

### 11.2 The contract

```python
TracerFactory = Callable[[TraceContext], Callable]
```

A factory receives a `TraceContext` and returns the `sys.settrace` **global** trace
function. The worker installs it and restores the previous tracer afterwards.

`TraceContext` provides:

| Member | Purpose |
|---|---|
| `code`, `source_lines` | The source under analysis |
| `filename` | The frame predicate — **compare against this**, not a literal |
| `max_steps` | The cap in force |
| `steps` | The list to append into |
| `count` | Steps emitted so far |
| `max_steps_reached` | Set by `emit()` |
| `code_line(n)` | Stripped source line, `""` if out of range |
| `emit(step)` | **Use this.** Appends, stamps `step_id`, enforces the cap, triggers checkpoints |
| `checkpoint` | Installed by the sandbox — **do not overwrite** |

Appending directly to `steps` would bypass both the cap and the checkpointing, so
`emit()` is the supported path.

### 11.3 Reference implementation

```python
def build_tracer(ctx: TraceContext) -> Callable:
    previous_locals: dict[str, Any] = {}

    def local_tracer(frame, event, arg):
        if event == "line":
            lineno = frame.f_lineno
            if lineno > 0:                      # line 0 is not a real line
                current = dict(frame.f_locals)
                deltas = diff_locals(previous_locals, current)   # created/mutated/deleted
                previous_locals = current
                ctx.emit({
                    "line_number": lineno,
                    "code_line": ctx.code_line(lineno),
                    "event_type": "line",       # or loop_iteration / branch_decision
                    "variable_deltas": deltas,   # must be JSON-native (§10.5)
                    "all_variables": preview(current),
                })
        return local_tracer

    def global_tracer(frame, event, arg):
        if event == "call" and frame.f_code.co_filename == ctx.filename:
            return local_tracer
        return None

    return global_tracer
```

Two complete worked examples accompany the module in `tests/test_sandbox.py`: a minimal
line tracer, and a tracer that emits a non-serialisable object per step to exercise the
reporting path described in §10.5.

### 11.4 A CPython behaviour that constrains any richer tracer

A loop header is re-evaluated once more after the final iteration, to discover that the
iterator is exhausted:

```python
for i in range(3):
    x = i
# line events: [1, 2, 1, 2, 1, 2, 1]     ← four header events for three iterations
```

The `for` header appears **N+1** times for N iterations, because the first event is the
initial iterator acquisition and the last is the exhaustion check. Any specification
requiring "exactly one step per iteration" is therefore unsatisfiable by counting raw line
events, and can only be met by correlating line events against a syntactic structure — that
is, by parsing the source with `ast` and identifying which re-entries of a header line
correspond to genuine iterations.

This is asserted directly in
`test_loop_header_fires_one_more_time_than_there_are_iterations`, and is a design
constraint on the tracer that will be built on this seam.

---

## 12. Public API reference

### 12.1 `run_in_sandbox`

```python
run_in_sandbox(
    code: str,
    *,
    filename: str = "<tracelens_user_code>",
    timeout: float = 8.0,
    max_steps: int = 300,
    tracer: str = "app.services.sandbox:builtin_line_tracer",
    memory_limit_mb: Optional[int] = 256,
    stdout_limit: int = 65536,
) -> SandboxResult
```

| Parameter | Meaning |
|---|---|
| `code` | Untrusted Python source. |
| `filename` | Passed to `compile()`. The frame predicate. Must be compared against, not hardcoded. |
| `timeout` | Hard wall-clock seconds; also becomes the child's `RLIMIT_CPU`. |
| `max_steps` | Trace-size cap. Independent of `timeout` (§6.2). |
| `tracer` | `"module.path:callable"` ref, resolved in the child (§11). |
| `memory_limit_mb` | Child `RLIMIT_AS`; `None` disables. Inert on Windows. |
| `stdout_limit` | Captured-stdout bound; exceeding it sets `stdout_truncated`. |

### 12.2 `SandboxResult`

| Field | Type | Meaning |
|---|---|---|
| `status` | `"ok"` \| `"timeout"` \| `"error"` | Overall outcome. |
| `steps` | `list[dict]` | Execution steps; partial on failure. |
| `stdout` | `str` | Captured output, bounded. |
| `error` | `str \| None` | Human-readable; never a traceback. |
| `error_code` | `str \| None` | Machine-readable, from the closed set below. |
| `max_steps_reached` | `bool` | Step cap stopped the run. |
| `stdout_truncated` | `bool` | Output bound was hit. |
| `duration_ms` | `int` | Wall-clock duration including spawn. |
| `.ok` | `bool` | Property: `status == "ok"`. |
| `.to_dict()` | `dict` | JSON-ready; the intended transport. |

| `error_code` | `status` | Trigger | Steps returned |
|---|---|---|---|
| `None` | `ok` | Completed | Full |
| `timeout` | `timeout` | Exceeded `timeout`, killed | Yes, checkpointed |
| `max_steps_exceeded` | `error` | Step cap reached | Up to the cap |
| `syntax_error` | `error` | Compilation failed (detected in the parent) | Empty |
| `blocked_import` | `error` | Guarded import refused | Up to the failure |
| `runtime_error` | `error` | Untrusted program raised; also a genuinely missing module | Up to the failure |
| `killed` | `error` | Child died without publishing | Salvaged, if any |
| `internal_error` | `error` | Host-side fault: bad tracer ref, spawn failure, temp-dir failure | Empty |

Every value is asserted by at least one test.

---

## 13. Evaluation and testing

### 13.1 Methodology

32 tests, ~21 s, executed with no third-party dependencies. The suite runs both under
`pytest` and as a standalone script, so it can be executed in an environment with no test
framework installed. Each test targets a specific claim; the mapping is:

| Group | n | What it establishes |
|---|---|---|
| Correct tracing | 6 | Source ordering, monotonic advance, stdout capture, frame selection, `step_id` contiguity, N+1 header behaviour |
| **Termination** | 4 | 8 s default enforced within a 7–14 s window, host survives, step-cap interaction, print flood bounded, allocation bomb returns |
| **Namespace** | 11 | All four modules and `open` refused, `from`/dotted forms, direct `__import__` calls, relative imports, near-miss prefixes permitted, `ModuleNotFoundError` not misclassified, `sys` separation in both directions, host interpreter unmutated, no information leak in error text |
| **Error handling** | 5 | Clean syntax error with no process spawned, clean runtime error preserving partial steps, step-cap truncation, empty and comment-only modules, no traceback leakage |
| Checkpointing | 2 | Killed run salvages steps and stdout; checkpointing does not corrupt a normal run |
| **Extensibility** | 4 | Tracer ref resolved in the child, non-serialisable values survive reporting, invalid ref fails without harming the caller, result is JSON-serialisable |

### 13.2 Defects found by this suite

The suite was written adversarially — each test encodes a failure that actually occurred.
Five substantive defects were found and fixed during development:

1. **Every failure path reported success.** A `finally` block set `status="ok"` before the
   enclosing `except` handlers ran, so blocked imports, syntax errors, runtime errors, and
   the step cap all reported `ok`. This was the most serious defect: the module appeared to
   work while inverting its own error semantics.
2. **The timeout guarantee was passing for the wrong reason.** The step cap stopped
   infinite loops at ~375 ms, so the headline 8-second guarantee was never actually
   exercised. Both behaviours are now separately asserted.
3. **A killed run returned nothing.** Steps and captured stdout were both lost — the case
   where diagnostics matter most. Fixed by checkpointing (§6.3).
4. **Empty programs produced a step at line 0**, a non-line that would propagate as
   corrupt data to any consumer.
5. **A missing module was reported as a policy block**, misinforming the user about their
   own typo (§10.3).

A sixth, the serialisation failure mode of §10.5, was identified by analysis of a dormant
code path and is now covered by a dedicated end-to-end test.

### 13.3 Portability

The suite passes identically on CPython 3.12.12 and 3.13.2, and on Windows. The
`resource`-limit path is exercised on POSIX only, since the module is a no-op on Windows;
this is a coverage gap acknowledged in §14 rather than an untested assumption.

---

## 14. Limitations and future work

### 14.1 Known limitations

| # | Limitation | Impact | Mitigation |
|---|---|---|---|
| L1 | **No memory/CPU limits on Windows** | Allocation bombs bounded only by the 8 s timeout | Deploy on Linux, or use Job Objects via `pywin32` |
| L2 | **Namespace is bypassable** (§8.2) | Not a security boundary | OS-level isolation; allowlist (§14.2) |
| L3 | **Values are not projected** | Non-serialisable objects degrade to `repr` | Implement the serialisation layer (§14.2) |
| L4 | **`breakpoint()` and `input()` reachable** | `input()` blocks on the inherited console | Cut off by the timeout; remove from builtins |
| L5 | **Requires a real `__main__` file** | Fails under `python -c`, pipes, and notebooks | Documented; Appendix B |
| L6 | **No admission control** | N concurrent requests spawn N processes | Add a semaphore at the call site |
| L7 | **Tracer refs are unrestricted imports** | A hostile ref could import anything | Validate against an allowlist at the call site |
| L8 | **`.ipynb` not handled** | Source must be pre-extracted | Caller's responsibility |
| L9 | **Single-threaded assumption in the tracer** | Threaded user code produces interleaved deltas | Out of scope; `f_locals` snapshots are per-frame |

### 14.2 Future work

In rough priority order:

1. **Serialisation layer.** Project DataFrames, NumPy arrays, and custom objects to shape,
   columns, and a bounded row preview — never the full array. This is the correct fix for
   L3 and a precondition for meaningful variable-delta work.
2. **Structural correlation.** Parse the source with `ast` and join line events to loop and
   branch nodes, so that `event_type` can distinguish `loop_iteration` from the N+1 header
   re-entries (§11.4) and branch decisions from the preceding line. This is what upgrades
   the trace from a line log to a control-flow graph.
3. **A real step budget as a first-class resource**, weighted by wall-clock rather than
   step count, so that a trace budget reflects cost rather than event count.
4. **OS-level isolation** for untrusted multi-tenant use: a read-only filesystem, an empty
   network namespace, a memory cgroup, and a PID limit, via container or microVM.
5. **Python-level allowlist** as defence in depth — permitting only explicitly named
   modules, and additionally blocking `importlib`, `builtins`, `inspect`, and `traceback`,
   since those are the vectors the bypass actually uses.
6. **Concurrency control** at the call site (§L6).
7. **Cost accounting**: report per-run wall-clock, peak memory, and step count so callers
   can make admission decisions.

---

## 15. Conclusion

The module achieves its stated objectives. Untrusted Python is executed in a separate
process, terminated within a hard 8-second bound under a two-stage escalation that ends in
an uncatchable kill, and reported as structured data through a total function that cannot
raise. Failures degrade rather than disappear: a killed run returns the trace accumulated
up to its last checkpoint, an erroring run returns every step that preceded the failure,
and an overflowing run returns bounded output flagged as truncated.

The most consequential finding of the evaluation is negative and we have chosen to state it
prominently rather than in a footnote. A restricted Python namespace does not constrain what
a program can *do*, only what it can *spell*. Every blocked capability in this design was
recovered by the untrusted program through a path of at most one import, and the reason is
structural — the restriction applies to a single namespace, while capabilities live in
modules that were loaded by the ordinary import machinery. Presenting such a filter as a
security boundary would be the easiest way to make this component dangerous, because it
would invite exactly the trust it cannot support. Reported accurately, the mechanism is
genuinely useful for what it is: it catches accidents, it teaches users, and it makes the
common mistake fail loudly. The containment is done by the process boundary and the clock,
and the design says so.

---

## Appendix A — Constants

`sandbox.py:44–78`.

| Constant | Value | Purpose |
|---|---|---|
| `TRACELENS_FILENAME` | `"<tracelens_user_code>"` | Synthetic frame predicate |
| `SANDBOX_TIMEOUT_SECONDS` | `8.0` | Default wall-clock bound |
| `MAX_STEPS_DEFAULT` | `300` | Default trace-size cap |
| `MEMORY_LIMIT_MB` | `256` | Child `RLIMIT_AS` |
| `STDOUT_LIMIT_CHARS` | `65536` | Captured-output bound |
| `PREVIEW_ITEMS` | `3` | Reserved for the serialisation layer |
| `BLOCKED_NAMES` | `{"os", "sys", "subprocess", "socket"}` | Refused module imports |
| `BLOCKED_BUILTINS` | `{"open"}` | Removed builtins |
| `DEFAULT_TRACER_REF` | `"app.services.sandbox:builtin_line_tracer"` | Default tracer |
| `CHECKPOINT_EVERY_STEPS` | `50` | Partial-result checkpoint interval |
| `STATUS_*` | `"ok"`, `"timeout"`, `"error"` | Outcome classes |
| `ERR_*` | `timeout`, `max_steps_exceeded`, `syntax_error`, `blocked_import`, `runtime_error`, `killed`, `internal_error` | Failure codes |

---

## Appendix B — Reproduction

### B.1 Layout

```
backend/app/services/sandbox.py     the module
tests/test_sandbox.py                32 tests, dual-mode runner
```

There is no package installation: `app` and `app.services` resolve as implicit namespace
packages, and the test file prepends `backend/` to `sys.path` itself.

### B.2 Running the tests

```bash
python tests/test_sandbox.py            # standalone, no dependencies required
python -m pytest tests/test_sandbox.py -q   # if pytest is available
```

Expected output ends with:

```
32/32 passed in 21s
```

### B.3 Running the module directly

```bash
python backend/app/services/sandbox.py
```

### B.4 Reproducing the bypass analysis of §8.2

Each case is a single call to `run_in_sandbox` whose result carries `status` and `error`:

```python
import sys; sys.path.insert(0, "backend")
from app.services.sandbox import run_in_sandbox

for label, code in [
    ("os at gate",        "import os"),
    ("pathlib",           "import pathlib; print(len(list(pathlib.Path('.').iterdir())))"),
    ("importlib to os",   "import importlib; print(importlib.import_module('os').sep)"),
    ("builtins.open",     "import builtins; print(hasattr(builtins, 'open'))"),
    ("socket via urllib", "import urllib.request as u; print(u.socket.socket)"),
]:
    r = run_in_sandbox(code, timeout=10.0)
    print(f"{label:18} -> {r.status:7} {r.error_code} {r.stdout.strip()[:40]!r}")
```

Observed:

```
os at gate         -> error   blocked_import
pathlib            -> ok      None         '13'
importlib to os    -> ok      None         '\\'
builtins.open      -> ok      None         'True'
socket via urllib  -> ok      None         "<class 'socket.socket'>"
```

### B.5 A note on `spawn` and `__main__`

`multiprocessing`'s `spawn` start method re-imports the calling process's `__main__` by
file path. If `__main__` has no file — under `python -c`, a pipe, or a notebook — the child
fails with `OSError: [Errno 22] Invalid argument: '<stdin>'` before the sandbox executes
any code, and the parent reports a misleading resource-limit failure. **Run sandbox code
from a real script file.** This is a property of `spawn`, not of this module, but it
presents as a sandbox bug and so is recorded here.

### B.6 Environment note

The sandbox executes untrusted code in a child spawned from whatever interpreter runs the
host. Package availability inside the sandbox is therefore determined by the host's
interpreter, not by the user's machine. Where the sandboxed program requires numerical
libraries, the host interpreter must provide them. This was observed directly: the same
call succeeded under one interpreter and raised `ModuleNotFoundError` under another on the
same machine.
