"""
trace.py — Execution Tracing & Safe Insertion Endpoint.

Execution tracing pipeline:
1. Ingestion and source code normalization.
2. AST control-flow pre-pass (ast_flow.py) to validate syntax and index loop/branch headers.
3. Sandboxed deterministic execution tracer (sandbox.py + tracer.py) under strict resource
   limits, timeouts, and restricted builtins.
4. Schema-compliant response conforming field-for-field to TraceStep contract.
5. Safe Insertion Analyzer (handoff_analyzer.py) computing variable lifecycles and safe hooks.
"""

from typing import Any, Dict, List, Literal, Optional
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field, model_serializer

try:
    from backend.app.services.ast_flow import build_flow_index
    from backend.app.services.sandbox import (
        trace_in_sandbox,
        STATUS_OK,
        STATUS_TIMEOUT,
        STATUS_ERROR,
        ERR_TIMEOUT,
        ERR_MAX_STEPS,
        ERR_SYNTAX,
        ERR_BLOCKED_IMPORT,
    )
    from backend.app.services.handoff_analyzer import (
        SafeInsertionPoint,
        find_safe_insertion_points,
    )
    from backend.app.services.ml_diagnostics import (
        MLAuditIssue,
        run_ml_diagnostics,
    )
    from backend.app.services.package_installer import (
        prepare_environment_for_code,
        get_install_status,
        get_missing_libraries,
    )
except ImportError:
    from app.services.ast_flow import build_flow_index
    from app.services.sandbox import (
        trace_in_sandbox,
        STATUS_OK,
        STATUS_TIMEOUT,
        STATUS_ERROR,
        ERR_TIMEOUT,
        ERR_MAX_STEPS,
        ERR_SYNTAX,
        ERR_BLOCKED_IMPORT,
    )
    from app.services.handoff_analyzer import (
        SafeInsertionPoint,
        find_safe_insertion_points,
    )
    from app.services.ml_diagnostics import (
        MLAuditIssue,
        run_ml_diagnostics,
    )
    from app.services.package_installer import (
        prepare_environment_for_code,
        get_install_status,
        get_missing_libraries,
    )

router = APIRouter(prefix="/api", tags=["Trace"])

# ---------------------------------------------------------------------------
# Pydantic Models — Data Contracts (Appendix A)
# ---------------------------------------------------------------------------

EventType = Literal[
    "line",
    "call",
    "return",
    "loop_entry",
    "loop_iteration",
    "loop_exit",
    "branch_decision",
    "exception",
]


class VariableMetadata(BaseModel):
    length: Optional[int] = None
    shape: Optional[List[int]] = None
    columns: Optional[List[str]] = None
    null_count: Optional[int] = None


class VariableDelta(BaseModel):
    action: Literal["created", "mutated", "unchanged", "deleted"]
    var_name: str
    type_name: str
    old_value: Optional[Any] = None
    new_value: Optional[Any] = None
    repr_str: str
    metadata: Optional[VariableMetadata] = None


class LoopFlowContext(BaseModel):
    loop_id: str
    loop_type: Literal["for", "while"]
    header_line: int
    current_iteration: int
    total_iterations: Optional[int] = None
    iterator_target: Optional[str] = None
    iterator_value: Optional[Any] = None
    is_exit_step: bool


class BranchFlowContext(BaseModel):
    branch_id: str
    header_line: int
    condition_code: str
    evaluated_truth: bool
    taken_line: int
    skipped_range: Optional[List[int]] = None


class TraceStep(BaseModel):
    step_id: int
    line_number: int
    code_line: str
    event_type: EventType
    loop_context: Optional[LoopFlowContext] = None
    branch_context: Optional[BranchFlowContext] = None
    variable_deltas: Dict[str, VariableDelta] = Field(default_factory=dict)
    all_variables: Dict[str, str] = Field(default_factory=dict)
    stdout_emitted: Optional[str] = None


class TraceRequest(BaseModel):
    mode: Literal["logic_lens", "model_lens"] = "logic_lens"
    filename: Optional[str] = "<tracelens_user_code>"
    code: str
    max_steps: Optional[int] = None


class TraceResponse(BaseModel):
    steps: List[TraceStep]
    safe_insertion_points: List[SafeInsertionPoint] = Field(default_factory=list)
    ml_audit_issues: Optional[List[MLAuditIssue]] = Field(default=None)

    @model_serializer(mode="wrap")
    def _serialize(self, handler):
        res = handler(self)
        if self.ml_audit_issues is None:
            res.pop("ml_audit_issues", None)
        return res

    def __iter__(self):
        return iter(self.steps)

    def __getitem__(self, item):
        return self.steps[item]

    def __len__(self):
        return len(self.steps)


# ---------------------------------------------------------------------------
# Endpoint Implementation
# ---------------------------------------------------------------------------


@router.post("/trace", response_model=TraceResponse)
def trace_code(payload: TraceRequest) -> TraceResponse:
    """Execute Python code in the sandbox, extract Safe Insertion Points, and return TraceResponse."""
    raw_code = payload.code
    if not isinstance(raw_code, str) or not raw_code.strip():
        return TraceResponse(
            steps=[],
            safe_insertion_points=[],
            ml_audit_issues=[] if payload.mode == "model_lens" else None,
        )

    # Strip and normalize incoming code
    code = raw_code.replace("\r\n", "\n").replace("\r", "\n").strip()

    # AST Control-Flow Pre-Pass: validate syntax and map structure
    try:
        _ = build_flow_index(code)
    except SyntaxError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"SyntaxError: {exc.msg} (line {exc.lineno})",
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"SyntaxError: {str(exc)}",
        )

    # Determine execution step cap:
    # If explicitly supplied, respect it.
    # Otherwise, default to 300; if an infinite loop pattern like `while True` is detected,
    # lift step cap so that the sandbox 30s wall-clock timeout acts as the definitive guard.
    if payload.max_steps is not None:
        effective_max_steps = payload.max_steps
    elif "while True" in code or "while 1" in code:
        effective_max_steps = 10**9
    else:
        effective_max_steps = 1000

    filename = payload.filename or "<tracelens_user_code>"

    # Prepare external libraries if missing: download & install outside sandbox timeout
    # NOTE: Library preparation executes BEFORE the sandbox starts, ensuring package download
    # time does NOT count against the 30-second execution timeout timer.
    try:
        prepare_environment_for_code(code)
    except Exception:
        pass

    # Run execution in the deterministic sandboxed environment
    res = trace_in_sandbox(code, max_steps=effective_max_steps)

    # Clean error handling
    if res.status == STATUS_TIMEOUT or res.error_code == ERR_TIMEOUT:
        raise HTTPException(
            status_code=status.HTTP_408_REQUEST_TIMEOUT,
            detail=res.error or "Execution exceeded the 30s time limit and was terminated.",
        )

    if res.error_code == ERR_MAX_STEPS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=res.error or f"Step cap of {effective_max_steps} reached; trace truncated.",
        )

    if res.error_code == ERR_SYNTAX:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=res.error or "SyntaxError in source code.",
        )

    if res.error_code == ERR_BLOCKED_IMPORT or (
        res.status == STATUS_ERROR
        and res.error
        and (
            "TraceLens sandbox" in res.error
            or "name 'open' is not defined" in res.error
            or "blocked" in res.error.lower()
        )
    ):
        error_detail = (
            "Security violation: filesystem 'open()' cannot be traced in the TraceLens sandbox. Please use the Upload Dataset tab and load files via pd.read_csv(...) instead."
            if (res.error and "open" in res.error)
            else (res.error or "Security violation: system modules ('os', 'sys', 'subprocess', 'socket') and filesystem 'open()' cannot be traced in the TraceLens sandbox.")
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=error_detail,
        )

    if res.status == STATUS_ERROR and not res.steps:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=res.error or "Execution error in sandbox.",
        )

    # Compute safe insertion points across completed trace
    # Disabled in model_lens mode per requirement
    safe_points = [] if payload.mode == "model_lens" else find_safe_insertion_points(res.steps, code)

    # ModelLens Diagnostics Engine pass when mode == "model_lens"
    ml_issues = None
    if payload.mode == "model_lens":
        ml_issues = run_ml_diagnostics(res.steps, code)

    return TraceResponse(
        steps=[TraceStep.model_validate(step) for step in res.steps],
        safe_insertion_points=safe_points,
        ml_audit_issues=ml_issues,
    )


class CheckDependenciesPayload(BaseModel):
    code: str


@router.get("/install-status", tags=["Dependencies"])
def get_dependency_install_status():
    """Retrieve live status and progress of missing package preparation/installation."""
    return get_install_status()


@router.post("/check-dependencies", tags=["Dependencies"])
def check_code_dependencies(payload: CheckDependenciesPayload):
    """Scan source code for third-party libraries not installed in current environment."""
    missing = get_missing_libraries(payload.code)
    return {
        "missing": missing,
        "count": len(missing),
    }
