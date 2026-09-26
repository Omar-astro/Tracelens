code_given = """
def calculate_grade(score):
    if score >= 90:
        grade = "A"
    elif score >= 75:
        grade = "B"
    elif score >= 60:
        grade = "C"
    else:
        grade = "F"
    return grade

def evaluate_student(name, score):
    grade = calculate_grade(score)

    if grade == "F":
        status = "failed"
    else:
        status = "passed"

    if score == 100:
        remark = "Perfect score!"
    elif score >= 90:
        remark = "Excellent work."
    else:
        remark = "Keep it up."

    print(f"{name} scored {score} ({grade}) — {status}. {remark}")

evaluate_student("Alice", 95)
evaluate_student("Bob", 72)
evaluate_student("Charlie", 55)
i = 0
while True:
    i += 1
print(i)
"""

import sys
import multiprocessing

try:
    import resource  # POSIX only (Linux/macOS). Not available on Windows.
    _HAS_RESOURCE_MODULE = True
except ImportError:
    _HAS_RESOURCE_MODULE = False


def trace_execution(source_code: str):
    """
    Execute `source_code` and return a list of (line_number, source_text)
    tuples in the exact order those lines were executed.

    - Function bodies are skipped over until the function is actually
      called, then traced line-by-line, then control naturally returns
      to the caller.
    - Loop bodies show up once per iteration, since each iteration is a
      fresh 'line' event.
    """
    # A distinct fake filename lets us tell "code we compiled" apart from
    # everything else that might run under the same interpreter (stdlib
    # internals, this very function's own frames, etc). Without this
    # filter, sys.settrace would also try to trace itself.
    FAKE_FILENAME = "<traced_code>"
    source_lines = source_code.splitlines()
    executed = []

    def local_tracer(frame, event, arg):
        # Once a frame is being traced, this runs for every event inside
        # THAT frame (line, return, exception...). We only care about
        # 'line': it fires right before each line executes, so a loop
        # body naturally produces one call per iteration.
        if event == "line" and frame.f_code.co_filename == FAKE_FILENAME:
            lineno = frame.f_lineno
            text = source_lines[lineno - 1].strip() if 0 < lineno <= len(source_lines) else ""
            executed.append((lineno, text))
        # Must return itself (or another tracer) to keep tracing this
        # frame's future events -- returning None would stop tracing here.
        return local_tracer

    def global_tracer(frame, event, arg):
        # Called once per NEW frame, i.e. on every function call (including
        # the top-level module frame created by exec() itself). This is
        # the "should this frame be traced at all?" decision point --
        # it's how function bodies stay invisible until actually invoked,
        # and it's where we filter out unrelated code.
        if event == "call" and frame.f_code.co_filename == FAKE_FILENAME:
            return local_tracer  # yes: trace line-by-line inside this frame
        return None  # no: ignore this frame and anything it calls

    compiled = compile(source_code, FAKE_FILENAME, "exec")
    namespace = {"__name__": "__traced__"}

    old_tracer = sys.gettrace()  # be a good citizen: restore whatever was set before
    sys.settrace(global_tracer)
    try:
        exec(compiled, namespace)
    finally:
        sys.settrace(old_tracer)

    return executed


def _worker(source_code, conn):
    """
    Runs INSIDE the isolated child process spawned by safe_trace_execution.

    Before touching the untrusted source at all, it caps this process's own
    CPU time and memory. These limits are enforced by the OS, not by
    Python -- so a `while True: pass` can't "catch" its way around them
    the way it could dodge a Python-level try/except or a signal handler
    running on the same thread it's blocking.
    """
    try:
        if _HAS_RESOURCE_MODULE:
            # RLIMIT_CPU: hard ceiling on CPU-seconds. When hit, the kernel
            # sends this process SIGXCPU (then SIGKILL) -- it does not ask
            # permission and an infinite loop cannot ignore it.
            resource.setrlimit(resource.RLIMIT_CPU, (2, 2))
            # RLIMIT_AS: hard ceiling on total address space in bytes.
            # Stops memory-bomb payloads like `[0] * 10**15` from taking
            # down the machine before the timeout below even gets a chance.
            resource.setrlimit(resource.RLIMIT_AS, (200 * 1024 * 1024,) * 2)
        # else: no POSIX resource limits on this platform (e.g. Windows) --
        # the wall-clock timeout in safe_trace_execution is the only guard.

        result = trace_execution(source_code)
        conn.send(("ok", result))
    except Exception as e:
        # A SyntaxError, or any exception the traced code itself raised --
        # report it back to the parent instead of letting the child die
        # silently with nothing sent down the pipe.
        conn.send(("error", f"{type(e).__name__}: {e}"))
    finally:
        conn.close()


def safe_trace_execution(source_code: str, timeout: float = 3.0):
    """
    Like trace_execution(), but runs the untrusted code in a separate OS
    process with a hard wall-clock timeout, on top of the CPU/memory
    limits set inside _worker().

    This is the piece that actually stops an infinite loop (or a memory
    bomb) from freezing the caller: because the traced code runs in its
    own process, the parent can forcibly terminate it no matter what it's
    doing -- Python threads offer no equivalent (there's no way to force-
    kill a hung thread from outside it).

    Returns:
        (status, result) where status is one of:
          "ok"      -- result is the list of (line_number, source_text) tuples
          "timeout" -- the code exceeded `timeout` seconds wall-clock; result is None
          "error"   -- the code raised, or hit a resource limit; result is a message
    """
    parent_conn, child_conn = multiprocessing.Pipe()
    process = multiprocessing.Process(target=_worker, args=(source_code, child_conn))
    process.start()
    process.join(timeout)

    if process.is_alive():
        # Past the deadline and still running -- force it down. terminate()
        # sends SIGTERM first (lets it clean up); if it ignores that too,
        # kill() sends SIGKILL, which cannot be caught or ignored.
        process.terminate()
        process.join(1)
        if process.is_alive():
            process.kill()
            process.join()
        return ("timeout", None)

    if parent_conn.poll():
        return parent_conn.recv()

    # The process exited without sending anything down the pipe -- usually
    # means the OS killed it directly for hitting RLIMIT_CPU/RLIMIT_AS
    # before _worker's except block could even run.
    return ("error", "Process terminated unexpectedly (likely hit a resource limit)")


if __name__ == "__main__":
    print("--- normal code, direct call ---")
    for lineno, text in trace_execution(code_given):
        print(f"{lineno:>3}: {text}")

    print("\n--- infinite loop, via safe_trace_execution (2s timeout) ---")
    dangerous_code = "while True:\n    pass\n"
    status, result = safe_trace_execution(dangerous_code, timeout=2)
    print(f"status={status!r} result={result!r}")
    # Note: this call returns and the script keeps running -- the hung
    # child process was killed, it did not take the caller down with it.
    print("(parent process is still alive and responsive)")