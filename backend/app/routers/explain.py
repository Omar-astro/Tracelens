"""
explain.py — Contextual Explanation & Handoff Summary Endpoints.

Accepts execution context, calls IBM Bob (Granite) explainer service,
and returns schema-valid explanations and teammate handoff summaries.
"""

from typing import Any, Dict, List, Optional
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

try:
    from backend.app.services.bob_client import (
        BlockExplanation,
        BobRemediationResult,
        HandoffSummary,
        StepExplanation,
        apply_bob_remediation,
        explain_block_in_context,
        explain_step_in_context,
        generate_handoff_summary,
    )
except ImportError:
    from app.services.bob_client import (
        BlockExplanation,
        BobRemediationResult,
        HandoffSummary,
        StepExplanation,
        apply_bob_remediation,
        explain_block_in_context,
        explain_step_in_context,
        generate_handoff_summary,
    )

router = APIRouter(prefix="/api", tags=["Explain"])


# ---------------------------------------------------------------------------
# Request Model for Single Step Explanation
# ---------------------------------------------------------------------------

class StepExplainRequest(BaseModel):
    step_id: int
    line_number: int
    code_line: str
    filename: Optional[str] = "<tracelens_user_code>"
    variable_deltas: Dict[str, Any] = Field(default_factory=dict)
    all_variables: Dict[str, Any] = Field(default_factory=dict)


# ---------------------------------------------------------------------------
# Request Model for Teammate Handoff Summary
# ---------------------------------------------------------------------------

class HandoffSummaryRequest(BaseModel):
    code: str
    safe_insertion_points: List[Dict[str, Any]] = Field(default_factory=list)
    terminal_variables: Dict[str, Any] = Field(default_factory=dict)


# ---------------------------------------------------------------------------
# POST /api/explain-step Endpoint
# ---------------------------------------------------------------------------

@router.post("/explain-step", response_model=StepExplanation)
def explain_step(payload: StepExplainRequest) -> StepExplanation:
    """
    Accepts execution context for a single step and returns an AI-powered line intent
    explanation and safe extension guidance from IBM Bob.
    """
    if payload.line_number < 1:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="line_number must be greater than or equal to 1.",
        )

    return explain_step_in_context(
        step_id=payload.step_id,
        line_number=payload.line_number,
        code_line=payload.code_line,
        filename=payload.filename or "<tracelens_user_code>",
        variable_deltas=payload.variable_deltas,
        all_variables=payload.all_variables,
    )


# ---------------------------------------------------------------------------
# POST /api/handoff-summary Endpoint
# ---------------------------------------------------------------------------

@router.post("/handoff-summary", response_model=HandoffSummary)
def handoff_summary(payload: HandoffSummaryRequest) -> HandoffSummary:
    """
    Accepts a completed trace's full source, safe insertion points, and terminal variable
    states; returns a schema-valid HandoffSummary JSON per Appendix A / Appendix B.2.
    """
    if not payload.code or not payload.code.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="code must be a non-empty string.",
        )

    return generate_handoff_summary(
        code=payload.code,
        safe_insertion_points=payload.safe_insertion_points,
        terminal_variables=payload.terminal_variables,
    )


# ---------------------------------------------------------------------------
# Request Model & POST /api/bob-apply-remediation Endpoint
# ---------------------------------------------------------------------------

class BobRemediationRequest(BaseModel):
    code: str
    issue: Dict[str, Any] = Field(default_factory=dict)


@router.post("/bob-apply-remediation", response_model=BobRemediationResult)
def bob_remediate(payload: BobRemediationRequest) -> BobRemediationResult:
    """
    Accepts source code and a ModelLens MLAuditIssue finding.
    Invokes Bob AI to refactor the code and apply the correct methodology pattern.
    """
    if not payload.code or not payload.code.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="code must be a non-empty string.",
        )
    return apply_bob_remediation(payload.code, payload.issue)


# ---------------------------------------------------------------------------
# Request Model & POST /api/explain-block Endpoint (Multi-line & Blocks)
# ---------------------------------------------------------------------------

class BlockExplainRequest(BaseModel):
    code: str
    start_line: int
    end_line: int
    block_type: Optional[str] = "custom"
    selected_code: Optional[str] = None
    all_variables: Optional[Dict[str, Any]] = None
    filename: Optional[str] = "<tracelens_user_code>"


@router.post("/explain-block", response_model=BlockExplanation)
def explain_block(payload: BlockExplainRequest) -> BlockExplanation:
    """
    Accepts a code snippet, line range, and block type.
    Invokes Bob AI to explain the multi-line block's intent, mechanics, variables, and extension safety.
    """
    if not payload.code or not payload.code.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="code must be a non-empty string.",
        )
    if payload.start_line < 1 or payload.end_line < payload.start_line:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="start_line must be >= 1 and end_line >= start_line.",
        )

    return explain_block_in_context(
        code=payload.code,
        start_line=payload.start_line,
        end_line=payload.end_line,
        block_type=payload.block_type,
        selected_code=payload.selected_code,
        all_variables=payload.all_variables,
        filename=payload.filename or "<tracelens_user_code>",
    )


