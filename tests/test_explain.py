"""
test_explain.py — Stage 11: Unit and Integration Tests for IBM Bob Client & /api/explain-step.

Verifies:
1. /api/explain-step returns valid JSON matching StepExplanation (Appendix A).
2. Endpoint and bob_client return usable fallback responses when no Bob API key is configured.
3. Fallback logic accurately handles loops, branches, assignments, and accumulators.
4. Endpoint gracefully handles invalid line numbers (HTTP 400).
5. Bob client parses JSON correctly even when wrapped in markdown code fences.
"""

import json
import os
import sys
from pathlib import Path
from unittest.mock import MagicMock, patch
import pytest
from fastapi.testclient import TestClient

ROOT_DIR = Path(__file__).resolve().parent.parent
BACKEND_DIR = ROOT_DIR / "backend"
for p in (str(ROOT_DIR), str(BACKEND_DIR)):
    if p not in sys.path:
        sys.path.insert(0, p)

try:
    from backend.app.main import app
    from backend.app.services.bob_client import (
        StepExplanation,
        explain_step_in_context,
        generate_fallback_explanation,
        build_b1_prompt,
    )
except ImportError:
    from app.main import app
    from app.services.bob_client import (
        StepExplanation,
        explain_step_in_context,
        generate_fallback_explanation,
        build_b1_prompt,
    )

client = TestClient(app)


# ---------------------------------------------------------------------------
# Unit Tests: Schema and Fallback Generation
# ---------------------------------------------------------------------------

def test_step_explanation_schema_instantiation():
    """Verify that StepExplanation can be instantiated and validated per Appendix A."""
    exp = StepExplanation(
        step_id=1,
        line_number=10,
        intent_summary="Initializes error counter.",
        detailed_explanation="Sets error_count to 0 before loop execution.",
        teammate_logic_note="Standard accumulator initialization.",
        safe_to_extend=True,
        continuation_tip="Safe to initialize other metric counters here.",
    )
    assert exp.step_id == 1
    assert exp.line_number == 10
    assert exp.safe_to_extend is True
    assert exp.continuation_tip is not None
    data = exp.model_dump()
    assert set(data.keys()) == {
        "step_id",
        "line_number",
        "intent_summary",
        "detailed_explanation",
        "teammate_logic_note",
        "safe_to_extend",
        "continuation_tip",
    }


def test_fallback_explanation_for_loop():
    """Verify fallback heuristics for loop headers."""
    exp = generate_fallback_explanation(
        step_id=2,
        line_number=13,
        code_line="for record in raw_logs:",
        variable_deltas={},
        all_variables={"raw_logs": "[...]"},
    )
    assert "Iterate" in exp.intent_summary or "loop" in exp.intent_summary.lower()
    assert exp.safe_to_extend is False
    assert exp.step_id == 2
    assert exp.line_number == 13


def test_fallback_explanation_for_conditional():
    """Verify fallback heuristics for conditional statements."""
    exp = generate_fallback_explanation(
        step_id=3,
        line_number=15,
        code_line="if len(name) > 0:",
        variable_deltas={},
        all_variables={"name": "Alice"},
    )
    assert "branch" in exp.intent_summary.lower() or "evaluates" in exp.intent_summary.lower()
    assert exp.safe_to_extend is True


def test_fallback_explanation_for_accumulator():
    """Verify fallback heuristics for .append() statements."""
    exp = generate_fallback_explanation(
        step_id=5,
        line_number=18,
        code_line="cleaned_records.append(record)",
        variable_deltas={"cleaned_records": {"action": "mutated"}},
        all_variables={"cleaned_records": "[]"},
    )
    assert "append" in exp.intent_summary.lower()
    assert exp.safe_to_extend is True
    assert "accumulator" in exp.teammate_logic_note.lower() or "append" in exp.intent_summary.lower()


def test_build_b1_prompt_contains_all_fields():
    """Verify Appendix B.1 prompt contains required input context."""
    prompt = build_b1_prompt(
        filename="teammate_pipeline.py",
        line_number=14,
        code_line="name = record['user'].strip().capitalize()",
        variable_deltas={"name": "Alice"},
        all_variables={"record": {"user": " alice "}},
    )
    assert "File Name: teammate_pipeline.py" in prompt
    assert "Current Line Number: 14" in prompt
    assert "name = record['user'].strip().capitalize()" in prompt
    assert "Variables Mutated This Step:" in prompt
    assert "Local Memory Snapshot:" in prompt
    assert "Output strictly valid JSON with keys:" in prompt


# ---------------------------------------------------------------------------
# Unit Tests: API Client & Parsing
# ---------------------------------------------------------------------------

def test_explain_step_without_api_key(monkeypatch):
    """Verify explain_step_in_context gracefully returns fallback when no key is set."""
    monkeypatch.delenv("IBM_CLOUD_API_KEY", raising=False)
    monkeypatch.delenv("BOB_API_KEY", raising=False)

    exp = explain_step_in_context(
        step_id=4,
        line_number=14,
        code_line="name = record['user'].strip().capitalize()",
        filename="teammate_pipeline.py",
        variable_deltas={"name": {"action": "created"}},
        all_variables={"name": "Alice"},
    )
    assert isinstance(exp, StepExplanation)
    assert exp.step_id == 4
    assert exp.line_number == 14
    assert len(exp.intent_summary) > 0


def test_explain_step_with_mocked_llm_response(monkeypatch):
    """Verify that Bob client correctly parses JSON output from an API response."""
    monkeypatch.setenv("IBM_CLOUD_API_KEY", "mock_key_12345")

    mock_llm_json = {
        "intent_summary": "Sanitizes and formats the user record name.",
        "detailed_explanation": "Trims whitespace and applies title casing to standardize the user string.",
        "teammate_logic_note": "Prevents downstream duplicate keys due to inconsistent formatting.",
        "safe_to_extend": True,
        "continuation_tip": "You can insert regex filtering here for special characters.",
    }

    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = {
        "choices": [
            {
                "message": {
                    "content": f"```json\n{json.dumps(mock_llm_json)}\n```"
                }
            }
        ]
    }

    with patch("httpx.Client.post", return_value=mock_response):
        exp = explain_step_in_context(
            step_id=4,
            line_number=14,
            code_line="name = record['user'].strip().capitalize()",
            filename="teammate_pipeline.py",
        )
        assert exp.intent_summary == "Sanitizes and formats the user record name."
        assert exp.safe_to_extend is True
        assert exp.continuation_tip == "You can insert regex filtering here for special characters."


def test_explain_step_with_llm_network_failure(monkeypatch):
    """Verify that if the network call throws an error, fallback is returned seamlessly."""
    monkeypatch.setenv("IBM_CLOUD_API_KEY", "mock_key_12345")

    with patch("httpx.Client.post", side_effect=Exception("Connection timed out")):
        exp = explain_step_in_context(
            step_id=4,
            line_number=14,
            code_line="name = record['user'].strip().capitalize()",
            filename="teammate_pipeline.py",
        )
        assert isinstance(exp, StepExplanation)
        assert exp.step_id == 4
        assert exp.line_number == 14


# ---------------------------------------------------------------------------
# Integration Tests: POST /api/explain-step
# ---------------------------------------------------------------------------

def test_api_explain_step_endpoint_200(monkeypatch):
    """Test POST /api/explain-step returns 200 and schema-valid response."""
    monkeypatch.delenv("IBM_CLOUD_API_KEY", raising=False)
    monkeypatch.delenv("BOB_API_KEY", raising=False)

    payload = {
        "step_id": 4,
        "line_number": 14,
        "code_line": "name = record[\"user\"].strip().capitalize()",
        "filename": "teammate_pipeline.py",
        "variable_deltas": {
            "name": {
                "action": "created",
                "type_name": "str",
                "repr_str": "'Alice'",
            }
        },
        "all_variables": {
            "record": "{\"user\": \" alice \", \"action\": \"login\"}",
            "name": "'Alice'",
        },
    }

    response = client.post("/api/explain-step", json=payload)
    assert response.status_code == 200
    data = response.json()

    # Field-for-field contract check (Appendix A)
    assert data["step_id"] == 4
    assert data["line_number"] == 14
    assert isinstance(data["intent_summary"], str)
    assert isinstance(data["detailed_explanation"], str)
    assert isinstance(data["teammate_logic_note"], str)
    assert isinstance(data["safe_to_extend"], bool)
    assert "continuation_tip" in data


def test_api_explain_step_invalid_line_number():
    """Test POST /api/explain-step rejects non-positive line numbers."""
    payload = {
        "step_id": 1,
        "line_number": 0,
        "code_line": "x = 1",
    }
    response = client.post("/api/explain-step", json=payload)
    assert response.status_code == 400
    assert "line_number must be greater than or equal to 1" in response.json()["detail"]
