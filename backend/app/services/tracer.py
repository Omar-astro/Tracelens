"""
tracer.py — Stage 4: Deterministic Tracer

Exposes one public function:
    trace_execution(code: str, flow_index: Optional[FlowIndex] = None, max_steps: int = 300) -> List[dict]

Each dict matches the TraceStep data contract from Appendix A.
"""

import sys
import io
import copy
from typing import Optional, List, Any, Callable, Dict

# ---------------------------------------------------------------------------
# Bring in Stage 3's FlowIndex (optional import — tracer still works standalone)
# ---------------------------------------------------------------------------
try:
    from backend.app.services.ast_flow import build_flow_index
except ImportError:
    try:
        from app.services.ast_flow import build_flow_index
    except ImportError:
        try:
            from ast_flow import build_flow_index
        except ImportError:
            build_flow_index = None   # type: ignore

# ---------------------------------------------------------------------------
# Internal sentinel exception — used to halt execution when step cap is hit
# ---------------------------------------------------------------------------
class StepLimitReached(Exception):
    """Raised inside the trace hook to terminate runaway code at max_steps."""


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
FAKE_FILENAME = "<tracelens_user_code>"
_REPR_MAX = 500   # max chars for repr_str / all_variables values

# ---------------------------------------------------------------------------
# JSON-safe serializer
# ---------------------------------------------------------------------------

def _safe_repr(value: Any) -> str:
    """Return a compact, JSON-safe string representation of *value*.

    Handles sets, tuples, custom classes, NumPy scalars/arrays, and Pandas
    DataFrames without raising TypeError. Truncated to _REPR_MAX characters.
    """
    try:
        # NumPy array
        np = sys.modules.get("numpy")
        if np is not None:
            if isinstance(value, np.ndarray):
                return str(value.tolist())[:_REPR_MAX]
            if isinstance(value, (np.integer, np.floating, np.bool_)):
                return repr(value.item())[:_REPR_MAX]

        # Pandas DataFrame / Series
        pd = sys.modules.get("pandas")
        if pd is not None:
            if isinstance(value, pd.DataFrame):
                return f"DataFrame({value.shape})"[:_REPR_MAX]
            if isinstance(value, pd.Series):
                return f"Series(len={len(value)})"[:_REPR_MAX]

        # sets and frozensets — not JSON-native
        if isinstance(value, (set, frozenset)):
            return repr(sorted(value, key=str))[:_REPR_MAX]

        return repr(value)[:_REPR_MAX]

    except Exception:
        try:
            return str(value)[:_REPR_MAX]
        except Exception:
            return "<unrepresentable>"


def _safe_value(value: Any) -> Any:
    """Return a JSON-serialisable scalar/container for *value*."""
    try:
        import json
        json.dumps(value)   # fast path: already serialisable
        return value
    except (TypeError, ValueError, OverflowError):
        return _safe_repr(value)


def _variable_metadata(value: Any) -> Optional[dict]:
    """Extract optional metadata (length, shape, columns, null_count)."""
    meta: dict = {}

    try:
        np = sys.modules.get("numpy")
        pd = sys.modules.get("pandas")

        if pd is not None and isinstance(value, pd.DataFrame):
            meta["shape"] = list(value.shape)
            meta["columns"] = list(value.columns.astype(str))
            meta["null_count"] = int(value.isnull().sum().sum())
            return meta

        if pd is not None and isinstance(value, pd.Series):
            meta["length"] = len(value)
            meta["null_count"] = int(value.isnull().sum())
            return meta

        if np is not None and isinstance(value, np.ndarray):
            meta["shape"] = list(value.shape)
            return meta

        if isinstance(value, (list, tuple, dict, set, frozenset, str, bytes, bytearray)):
            meta["length"] = len(value)
            return meta

    except Exception:
        pass

    return meta if meta else None


def _snapshot_value(val: Any) -> Any:
    """Return a safe snapshot of *val* for in-place mutation diffing."""
    if val is None or isinstance(val, (int, float, str, bool, bytes)):
        return val
    if isinstance(val, list):
        try:
            return [copy.copy(item) if isinstance(item, (dict, list, set)) else item for item in val]
        except Exception:
            return list(val)
    if isinstance(val, dict):
        try:
            return {k: (copy.copy(v) if isinstance(v, (dict, list, set)) else v) for k, v in val.items()}
        except Exception:
            return dict(val)
    if isinstance(val, set):
        return set(val)
    if isinstance(val, tuple):
        return val
    try:
        np = sys.modules.get("numpy")
        if np is not None and isinstance(val, np.ndarray):
            return val.copy()
        pd = sys.modules.get("pandas")
        if pd is not None and isinstance(val, (pd.DataFrame, pd.Series)):
            return val.copy()
    except Exception:
        pass
    return _safe_repr(val)


# ---------------------------------------------------------------------------
# Variable diffing
# ---------------------------------------------------------------------------

def _iter_target_vars(iterator_target: str) -> list:
    """Split a LoopInfo.iterator_target string into individual variable names.

    e.g. "i"       -> ["i"]
         "a, b"    -> ["a", "b"]
         ""        -> []
    """
    if not iterator_target:
        return []
    return [v.strip() for v in iterator_target.split(",") if v.strip()]


def _diff_locals(
    prev: dict,
    curr: dict,
    excluded_vars: set | None = None,
) -> dict:
    """Produce variable_deltas dict keyed by var_name.

    Only includes variables that actually changed: "created", "mutated", or "deleted".
    "unchanged" variables are intentionally excluded — they are already captured in
    all_variables and their inclusion only bloats the payload.

    Parameters
    ----------
    excluded_vars : set of variable names that should be treated as "deleted"
        even if they are still present in *curr* (used to model loop-scope exit).
    """
    if excluded_vars is None:
        excluded_vars = set()

    deltas: dict = {}

    # Force-emit "deleted" entries for loop variables that have gone out of scope.
    for key in excluded_vars:
        if key in prev:
            deltas[key] = {
                "action": "deleted",
                "var_name": key,
                "type_name": type(prev[key]).__name__,
                "old_value": _safe_value(prev[key]),
                "new_value": None,
                "repr_str": _safe_repr(prev[key]),
                "metadata": _variable_metadata(prev[key]),
            }

    # Build a view of curr that excludes loop-scoped variables.
    curr_visible = {k: v for k, v in curr.items() if k not in excluded_vars}

    all_keys = set(prev.keys()) | set(curr_visible.keys())
    all_keys -= excluded_vars  # already handled above
    for key in all_keys:
        in_prev = key in prev
        in_curr = key in curr_visible

        if not in_prev and in_curr:
            action = "created"
            old_val = None
            new_val = curr_visible[key]
        elif in_prev and not in_curr:
            action = "deleted"
            old_val = prev[key]
            new_val = None
        else:
            old_val = prev[key]
            new_val = curr_visible[key]
            # Try equality; fall back to repr comparison for NumPy/pandas etc.
            try:
                np = sys.modules.get("numpy")
                pd = sys.modules.get("pandas")
                if np is not None and isinstance(new_val, np.ndarray):
                    changed = not np.array_equal(old_val, new_val)
                elif pd is not None and isinstance(new_val, (pd.DataFrame, pd.Series)):
                    changed = _safe_repr(old_val) != _safe_repr(new_val)
                else:
                    result = old_val != new_val
                    # Guard against objects (e.g. pandas) that return a
                    # non-scalar from __ne__ — fall back to repr comparison.
                    if not isinstance(result, bool):
                        changed = _safe_repr(old_val) != _safe_repr(new_val)
                    else:
                        changed = result
            except Exception:
                changed = _safe_repr(old_val) != _safe_repr(new_val)

            if not changed:
                continue  # skip unchanged variables entirely

            action = "mutated"

        deltas[key] = {
            "action": action,
            "var_name": key,
            "type_name": type(curr_visible[key]).__name__ if in_curr else type(prev[key]).__name__,
            "old_value": _safe_value(old_val),
            "new_value": _safe_value(new_val),
            "repr_str": _safe_repr(curr_visible[key] if in_curr else prev[key]),
            "metadata": _variable_metadata(curr_visible[key] if in_curr else prev[key]),
        }

    return deltas


# ---------------------------------------------------------------------------
# Loop / branch context builders
# ---------------------------------------------------------------------------

def _build_loop_context(loop_info, iteration: int, curr_locals: dict) -> dict:
    """Build a LoopFlowContext dict from a LoopInfo + current iteration count."""
    target = loop_info.iterator_target
    iter_value = None
    if target and "," not in target:          # single-var target
        iter_value = _safe_value(curr_locals.get(target))

    return {
        "loop_id": loop_info.loop_id,
        "loop_type": loop_info.loop_type,
        "header_line": loop_info.header_line,
        "current_iteration": iteration,
        "total_iterations": None,             # not knowable statically
        "iterator_target": target or None,
        "iterator_value": iter_value,
        "is_exit_step": False,
    }


def _build_branch_context(branch_info, evaluated_truth: bool) -> dict:
    """Build a BranchFlowContext dict from a BranchInfo + runtime truth value."""
    if evaluated_truth:
        taken_line = branch_info.body_start_line or branch_info.header_line
        skipped = (
            (branch_info.orelse_start_line, branch_info.orelse_end_line)
            if branch_info.orelse_start_line is not None
            else None
        )
    else:
        # Bug 3 fix: when false, taken_line must be OUTSIDE the if-body.
        # If there is an else/elif block, jump there; otherwise jump to the
        # first line after the entire construct (construct_end_line + 1).
        if branch_info.orelse_start_line is not None:
            taken_line = branch_info.orelse_start_line
        elif branch_info.construct_end_line is not None:
            taken_line = branch_info.construct_end_line + 1
        else:
            taken_line = branch_info.header_line + 1
        skipped = (
            (branch_info.body_start_line, branch_info.body_end_line)
            if branch_info.body_start_line is not None
            else None
        )

    return {
        "branch_id": branch_info.branch_id,
        "header_line": branch_info.header_line,
        "condition_code": branch_info.condition_code,
        "evaluated_truth": evaluated_truth,
        "taken_line": taken_line,
        "skipped_range": list(skipped) if skipped else None,
    }


# ---------------------------------------------------------------------------
# Branch truth evaluator (best-effort)
# ---------------------------------------------------------------------------

def _eval_branch_truth(branch_info, frame_locals: dict, frame_globals: dict) -> Optional[bool]:
    """Safely evaluate the branch condition against the live frame namespace."""
    try:
        result = eval(branch_info.condition_code, frame_globals, frame_locals)  # noqa: S307
        return bool(result)
    except Exception:
        return None


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def trace_execution(
    code: str,
    flow_index=None,    # Optional[FlowIndex]
    max_steps: int = 300,
    use_sandbox: bool = False,
    timeout: float = 8.0,
) -> List[dict]:
    """Execute *code* under sys.settrace and return a list of TraceStep dicts.

    Parameters
    ----------
    code        : Python source code string to execute.
    flow_index  : Optional FlowIndex from ast_flow.build_flow_index().
                  If None and build_flow_index is available, it is built automatically.
    max_steps   : Maximum number of 'line' events to record (default 300).
    use_sandbox : If True, runs inside the safety subprocess sandbox.
    timeout     : Hard timeout in seconds when running under the sandbox (default 8.0).

    Returns
    -------
    List of TraceStep-shaped dicts (see Appendix A).
    """
    if use_sandbox:
        try:
            from backend.app.services.sandbox import trace_in_sandbox
        except ImportError:
            try:
                from app.services.sandbox import trace_in_sandbox
            except ImportError:
                from sandbox import trace_in_sandbox
        res = trace_in_sandbox(code, timeout=timeout, max_steps=max_steps)
        return res.steps

    # Auto-build flow index if caller didn't supply one
    if flow_index is None and build_flow_index is not None:
        try:
            flow_index = build_flow_index(code)
        except SyntaxError:
            flow_index = None

    source_lines = code.splitlines()

    steps: List[dict] = []
    # snapshot of locals *before* the current line runs — used for diffing
    prev_locals: dict = {}
    step_counter = [0]                  # list so the closure can mutate it

    # Per-loop iteration counters  {loop_id -> int}
    loop_iterations: dict = {}
    # step_id of the most recent header step for each loop {loop_id -> step_id}
    # Used to retroactively mark the exit step via the 'return' event.
    loop_last_header_step: dict = {}
    # loop_id of the loop active in the PREVIOUS step (for scope-exit detection)
    prev_loop_id: list = [None]

    # Stdout interception
    captured_stdout = io.StringIO()
    stdout_cursor = [0]                 # character position already consumed

    def _flush_stdout() -> Optional[str]:
        """Return any stdout written since the last call, or None."""
        captured_stdout.seek(0)
        all_output = captured_stdout.read()
        new_text = all_output[stdout_cursor[0]:]
        stdout_cursor[0] = len(all_output)
        return new_text if new_text else None

    def local_tracer(frame, event, _arg):
        # Bug 4 fix: on 'return' from the traced frame, the loop has just
        # exhausted. The last header step recorded is the actual exit step —
        # retroactively patch it.
        if event == "return" and flow_index is not None:
            for lid, header_step_id in loop_last_header_step.items():
                # Only patch if this step hasn't been patched yet
                if header_step_id < len(steps):
                    s = steps[header_step_id]
                    if s.get("event_type") == "loop_iteration":
                        s["event_type"] = "loop_exit"
                        if s.get("loop_context"):
                            s["loop_context"]["is_exit_step"] = True
                            # Decrement so current_iteration reflects real count
                            s["loop_context"]["current_iteration"] = max(
                                s["loop_context"]["current_iteration"] - 1, 0
                            )
                            loop_iterations[lid] = max(loop_iterations.get(lid, 1) - 1, 0)
            return local_tracer

        if event != "line":
            return local_tracer

        if step_counter[0] >= max_steps:
            sys.settrace(None)
            raise StepLimitReached(f"Reached max_steps={max_steps}")

        lineno = frame.f_lineno
        text = (
            source_lines[lineno - 1].strip()
            if 0 < lineno <= len(source_lines)
            else ""
        )

        # ---- Backfill previous step before building this one ---------------
        # sys.settrace fires 'line' BEFORE the line executes, so the locals
        # and stdout we see now are the result of the *previous* line.
        # Patch the last recorded step with the post-execution state.
        raw_locals = {
            k: v for k, v in frame.f_locals.items() if not k.startswith("__")
        }

        # Compute which variables to hide from the previous step's snapshot:
        #
        # 1. exited_vars — iterator targets of a loop that was active last step
        #    but is NOT active now (loop just finished).  Python keeps them in
        #    frame.f_locals after the loop ends, so we must exclude them.
        #
        # 2. entering_vars — iterator targets of a NEW loop whose header is the
        #    CURRENT line.  sys.settrace fires the 'line' event BEFORE execution,
        #    so the iterator variable already holds its first value in f_locals
        #    even though the previous step hasn't finished yet.  Hiding these
        #    vars from the previous step's backfill prevents them leaking in.
        hidden_vars: set = set()
        curr_loop_info_for_lineno = flow_index.get_loop_for_line(lineno) if flow_index is not None else None
        curr_lid = curr_loop_info_for_lineno.loop_id if curr_loop_info_for_lineno is not None else None

        if flow_index is not None and prev_loop_id[0] is not None and curr_lid != prev_loop_id[0]:
            # A loop exited — hide its iterator targets.
            for loop_info_candidate in flow_index.loops.values():
                if loop_info_candidate.loop_id == prev_loop_id[0]:
                    hidden_vars |= set(_iter_target_vars(loop_info_candidate.iterator_target))
                    break

        if (
            flow_index is not None
            and curr_loop_info_for_lineno is not None
            and lineno == curr_loop_info_for_lineno.header_line
            and curr_lid != prev_loop_id[0]
        ):
            # Entering a new loop — hide its iterator targets from the *previous*
            # step's backfill (they haven't logically appeared yet).
            hidden_vars |= set(_iter_target_vars(curr_loop_info_for_lineno.iterator_target))

        # visible_locals is raw_locals minus any hidden variables.
        visible_locals = {k: v for k, v in raw_locals.items() if k not in hidden_vars}
        exited_vars = hidden_vars  # alias — _diff_locals uses this name

        if steps:
            last = steps[-1]
            post_deltas = _diff_locals(prev_locals, raw_locals, excluded_vars=exited_vars)
            last["variable_deltas"] = post_deltas
            last["all_variables"] = {k: _safe_repr(v) for k, v in visible_locals.items()}
            stdout_chunk = _flush_stdout()
            if stdout_chunk:
                last["stdout_emitted"] = (last["stdout_emitted"] or "") + stdout_chunk

        # prev_locals uses visible_locals so that exited variables are not carried
        # forward into the next step's diff (avoids spurious "deleted" on step N+2).
        prev_locals.clear()
        prev_locals.update({k: _snapshot_value(v) for k, v in visible_locals.items()})

        # ---- loop context --------------------------------------------------
        loop_ctx = None
        is_exit = False
        if flow_index is not None:
            loop_info = flow_index.get_loop_for_line(lineno)
            # Track which loop is active so the NEXT step's backfill can detect exits.
            prev_loop_id[0] = loop_info.loop_id if loop_info is not None else None
            if loop_info is not None:
                lid = loop_info.loop_id
                if lineno == loop_info.header_line:
                    # Increment for every real header visit. The exit step is
                    # detected retroactively via 'return' event (see local_tracer
                    # return-event handling below).
                    loop_iterations[lid] = loop_iterations.get(lid, 0) + 1
                    # Track this step's index so return-event can patch it
                    loop_last_header_step[lid] = step_counter[0]

                loop_ctx = _build_loop_context(
                    loop_info,
                    loop_iterations.get(lid, 1),
                    raw_locals,
                )
                if is_exit:
                    loop_ctx["is_exit_step"] = True

        # ---- branch context ------------------------------------------------
        branch_ctx = None
        if flow_index is not None:
            branch_info = flow_index.get_branch_for_line(lineno)
            if branch_info is not None:
                truth = _eval_branch_truth(branch_info, raw_locals, frame.f_globals)
                if truth is not None:
                    branch_ctx = _build_branch_context(branch_info, truth)

        # ---- determine event_type -----------------------------------------
        if loop_ctx is not None:
            if is_exit:
                event_type = "loop_exit"
            elif lineno == loop_ctx["header_line"]:
                event_type = "loop_iteration"
            else:
                event_type = "line"
        elif branch_ctx is not None:
            event_type = "branch_decision"
        else:
            event_type = "line"

        # This step's deltas/stdout are placeholders — they will be backfilled
        # at the start of the NEXT line event.
        steps.append({
            "step_id": step_counter[0],
            "line_number": lineno,
            "code_line": text,
            "event_type": event_type,
            "loop_context": loop_ctx,
            "branch_context": branch_ctx,
            "variable_deltas": {},          # backfilled on next event
            "all_variables": {k: _safe_repr(v) for k, v in prev_locals.items()},
            "stdout_emitted": None,         # backfilled on next event
        })

        step_counter[0] += 1
        return local_tracer

    def global_tracer(frame, event, _arg):
        if event == "call" and frame.f_code.co_filename == FAKE_FILENAME:
            return local_tracer
        return None

    compiled = compile(code, FAKE_FILENAME, "exec")
    namespace: dict = {"__name__": "__tracelens__"}

    old_tracer = sys.gettrace()
    old_stdout = sys.stdout
    sys.stdout = captured_stdout
    sys.settrace(global_tracer)
    try:
        exec(compiled, namespace)  # noqa: S102
    except StepLimitReached:
        pass  # clean termination — steps list is already populated up to max_steps
    finally:
        sys.settrace(old_tracer)
        sys.stdout = old_stdout
        # Backfill the very last step: execution is done so these are final values
        if steps:
            last = steps[-1]
            final_locals = {k: v for k, v in namespace.items() if not k.startswith("__")}
            last["variable_deltas"] = _diff_locals(prev_locals, final_locals)
            last["all_variables"] = {k: _safe_repr(v) for k, v in final_locals.items()}
            final_out = _flush_stdout()
            if final_out:
                last["stdout_emitted"] = (last["stdout_emitted"] or "") + final_out

    return steps


# ---------------------------------------------------------------------------
# Tracer factory for sandbox.py integration
# ---------------------------------------------------------------------------

def build_tracer(ctx: Any) -> Callable:
    """Factory creating a sys.settrace hook from a sandbox TraceContext.

    Adheres to sandbox.py TracerFactory contract: (ctx: TraceContext) -> global_tracer.
    Emits schema-compliant TraceStep dicts through ctx.emit().
    """
    flow = None
    if build_flow_index is not None:
        try:
            flow = build_flow_index(ctx.code)
        except Exception:
            flow = None

    prev_locals: dict = {}
    loop_iterations: dict = {}
    loop_last_header_step: dict = {}
    prev_loop_id: list = [None]
    stdout_cursor = [0]

    def _flush_stdout() -> Optional[str]:
        try:
            out = sys.stdout.getvalue()
            new_text = out[stdout_cursor[0]:]
            stdout_cursor[0] = len(out)
            return new_text if new_text else None
        except Exception:
            return None

    def local_tracer(frame, event, _arg):
        if event == "return":
            if flow is not None:
                for lid, header_idx in loop_last_header_step.items():
                    if 0 <= header_idx < len(ctx.steps):
                        s = ctx.steps[header_idx]
                        if s.get("event_type") == "loop_iteration":
                            s["event_type"] = "loop_exit"
                            if s.get("loop_context"):
                                s["loop_context"]["is_exit_step"] = True
                                s["loop_context"]["current_iteration"] = max(
                                    s["loop_context"]["current_iteration"] - 1, 0
                                )
                                loop_iterations[lid] = max(loop_iterations.get(lid, 1) - 1, 0)
            if ctx.steps:
                last = ctx.steps[-1]
                final_locals = {k: v for k, v in frame.f_locals.items() if not k.startswith("__")}
                last["variable_deltas"] = _diff_locals(prev_locals, final_locals)
                last["all_variables"] = {k: _safe_repr(v) for k, v in final_locals.items()}
                out_chunk = _flush_stdout()
                if out_chunk:
                    last["stdout_emitted"] = (last["stdout_emitted"] or "") + out_chunk
            return local_tracer

        if event == "exception":
            if ctx.steps:
                last = ctx.steps[-1]
                curr_locals = {k: v for k, v in frame.f_locals.items() if not k.startswith("__")}
                last["variable_deltas"] = _diff_locals(prev_locals, curr_locals)
                last["all_variables"] = {k: _safe_repr(v) for k, v in curr_locals.items()}
                out_chunk = _flush_stdout()
                if out_chunk:
                    last["stdout_emitted"] = (last["stdout_emitted"] or "") + out_chunk
            return local_tracer

        if event != "line":
            return local_tracer

        lineno = frame.f_lineno
        text = ctx.code_line(lineno)

        raw_locals = {k: v for k, v in frame.f_locals.items() if not k.startswith("__")}

        hidden_vars: set = set()
        curr_loop_info_for_lineno = flow.get_loop_for_line(lineno) if flow is not None else None
        curr_lid = curr_loop_info_for_lineno.loop_id if curr_loop_info_for_lineno is not None else None

        if flow is not None and prev_loop_id[0] is not None and curr_lid != prev_loop_id[0]:
            for loop_info_candidate in flow.loops.values():
                if loop_info_candidate.loop_id == prev_loop_id[0]:
                    hidden_vars |= set(_iter_target_vars(loop_info_candidate.iterator_target))
                    break

        if (
            flow is not None
            and curr_loop_info_for_lineno is not None
            and lineno == curr_loop_info_for_lineno.header_line
            and curr_lid != prev_loop_id[0]
        ):
            hidden_vars |= set(_iter_target_vars(curr_loop_info_for_lineno.iterator_target))

        visible_locals = {k: v for k, v in raw_locals.items() if k not in hidden_vars}
        exited_vars = hidden_vars

        if ctx.steps:
            last = ctx.steps[-1]
            last["variable_deltas"] = _diff_locals(prev_locals, raw_locals, excluded_vars=exited_vars)
            last["all_variables"] = {k: _safe_repr(v) for k, v in visible_locals.items()}
            out_chunk = _flush_stdout()
            if out_chunk:
                last["stdout_emitted"] = (last["stdout_emitted"] or "") + out_chunk

        prev_locals.clear()
        prev_locals.update({k: _snapshot_value(v) for k, v in visible_locals.items()})

        loop_ctx = None
        if flow is not None:
            loop_info = flow.get_loop_for_line(lineno)
            prev_loop_id[0] = loop_info.loop_id if loop_info is not None else None
            if loop_info is not None:
                lid = loop_info.loop_id
                if lineno == loop_info.header_line:
                    loop_iterations[lid] = loop_iterations.get(lid, 0) + 1
                    loop_last_header_step[lid] = len(ctx.steps)
                loop_ctx = _build_loop_context(
                    loop_info,
                    loop_iterations.get(lid, 1),
                    raw_locals,
                )

        branch_ctx = None
        if flow is not None:
            branch_info = flow.get_branch_for_line(lineno)
            if branch_info is not None:
                truth = _eval_branch_truth(branch_info, raw_locals, frame.f_globals)
                if truth is not None:
                    branch_ctx = _build_branch_context(branch_info, truth)

        if loop_ctx is not None:
            if lineno == loop_ctx["header_line"]:
                event_type = "loop_iteration"
            else:
                event_type = "line"
        elif branch_ctx is not None:
            event_type = "branch_decision"
        else:
            event_type = "line"

        step = {
            "line_number": lineno,
            "code_line": text,
            "event_type": event_type,
            "loop_context": loop_ctx,
            "branch_context": branch_ctx,
            "variable_deltas": {},
            "all_variables": {k: _safe_repr(v) for k, v in visible_locals.items()},
            "stdout_emitted": None,
        }

        ctx.emit(step)
        return local_tracer

    def global_tracer(frame, event, _arg):
        if event == "call" and frame.f_code.co_filename == ctx.filename:
            return local_tracer
        return None

    return global_tracer


# ---------------------------------------------------------------------------
# Smoke test — run directly: python tracer.py
# Prints the exact JSON payload that would be sent to the frontend.
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import json

    _pipeline_code = """\
x = 10
for i in [1, 2]:
    if i == 2:
        print("Bingo!")
"""

    steps = trace_execution(_pipeline_code)

    # This is the exact dict structure the frontend / sandbox would receive.
    payload = {
        "status": "ok",
        "step_count": len(steps),
        "steps": steps,
    }

    print(json.dumps(payload, indent=2, default=str))
