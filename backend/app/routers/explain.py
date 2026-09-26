"""
explain.py — Stage 11: /api/explain-step Endpoint.
Stage 14: /api/handoff-summary Endpoint.

Accepts single-step execution context, calls IBM Bob explainer service,
and returns schema-valid StepExplanation JSON per Appendix A.

Also exposes the Appendix B.2 end-of-trace teammate handoff summary.
"""

from typing import Any, Dict, List, Optional
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

try:
    from backend.app.services.bob_client import (
        HandoffSummary,
        StepExplanation,
        explain_step_in_context,
        generate_handoff_summary,
    )
except ImportError:
    from app.services.bob_client import (
        HandoffSummary,
        StepExplanation,
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
# Request Model for Teammate Handoff Summary (Stage 14)
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
# POST /api/handoff-summary Endpoint (Stage 14 — Appendix B.2)
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
