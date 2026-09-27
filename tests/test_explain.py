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
        HandoffSummary,
        generate_handoff_summary,
        generate_fallback_handoff_summary,
        build_b2_prompt,
        BobRemediationResult,
        apply_bob_remediation,
        BlockExplanation,
        explain_block_in_context,
    )
except ImportError:
    from app.main import app
    from app.services.bob_client import (
        StepExplanation,
        explain_step_in_context,
        generate_fallback_explanation,
        build_b1_prompt,
        HandoffSummary,
        generate_handoff_summary,
        generate_fallback_handoff_summary,
        build_b2_prompt,
        BobRemediationResult,
        apply_bob_remediation,
        BlockExplanation,
        explain_block_in_context,
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


# ---------------------------------------------------------------------------
# Stage 14: HandoffSummary Unit & Integration Tests (Appendix B.2)
# ---------------------------------------------------------------------------

def test_handoff_summary_schema():
    """Verify that HandoffSummary conforms to Appendix A/B.2."""
    summary = HandoffSummary(
        overall_purpose="Processes user logs.",
        key_data_structures=[{"name": "records", "role": "list of dicts", "final_state_summary": "4 items"}],
        safe_continuation_strategy="Extend after loop.",
        cautions_for_teammate=["Avoid modifying state."],
    )
    data = summary.model_dump()
    assert "overall_purpose" in data
    assert "key_data_structures" in data
    assert "safe_continuation_strategy" in data
    assert "cautions_for_teammate" in data


def test_build_b2_prompt():
    """Verify Appendix B.2 prompt includes code, safe points, and variable states."""
    prompt = build_b2_prompt(
        code="x = 1\ny = 2",
        safe_insertion_points=[{"line_number": 2, "target_variable": "y"}],
        terminal_variables={"x": "1", "y": "2"},
    )
    assert "x = 1" in prompt
    assert "Detected Safe Insertion Points:" in prompt
    assert "Final Variable States:" in prompt
    assert "Output strictly valid JSON with keys:" in prompt


def test_generate_fallback_handoff_summary():
    """Verify fallback handoff summary generates all required fields without crashing."""
    summary = generate_fallback_handoff_summary(
        code="cleaned = []\nfor r in raw:\n    cleaned.append(r)\nprint('Done')",
        safe_insertion_points=[{"line_number": 4, "target_variable": "cleaned", "reason": "Loop done"}],
        terminal_variables={"cleaned": "[]"},
    )
    assert isinstance(summary, HandoffSummary)
    assert summary.overall_purpose
    assert len(summary.key_data_structures) > 0
    assert summary.safe_continuation_strategy
    assert len(summary.cautions_for_teammate) > 0


def test_api_handoff_summary_endpoint():
    """Test POST /api/handoff-summary returns 200 with schema-valid response."""
    payload = {
        "code": "cleaned = []\nfor r in raw:\n    cleaned.append(r)",
        "safe_insertion_points": [{"line_number": 3, "target_variable": "cleaned", "reason": "Loop done"}],
        "terminal_variables": {"cleaned": "[]"},
    }
    response = client.post("/api/handoff-summary", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert "overall_purpose" in data
    assert "key_data_structures" in data
    assert "safe_continuation_strategy" in data
    assert "cautions_for_teammate" in data


def test_api_handoff_summary_empty_code():
    """Test POST /api/handoff-summary rejects empty code."""
    payload = {
        "code": "   ",
        "safe_insertion_points": [],
        "terminal_variables": {},
    }
    response = client.post("/api/handoff-summary", json=payload)
    assert response.status_code == 400
    assert "code must be a non-empty string" in response.json()["detail"]


def test_apply_bob_remediation_data_leakage():
    """Verify Bob refactoring eliminates data leakage on dsai sample."""
    sample_code = """import numpy as np
from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import train_test_split

X = np.random.randn(100, 4)
y = np.array([0] * 90 + [1] * 10)

scaler = StandardScaler()
X_scaled = scaler.fit_transform(X)

X_train, X_test, y_train, y_test = train_test_split(X_scaled, y, test_size=0.2)
"""
    issue = {
        "issue_id": "test-leakage",
        "category": "data_leakage",
        "line_number": 9,
        "offending_code": "scaler.fit_transform(X)",
        "remediation_code": "X_train, X_test, y_train, y_test = train_test_split(X, y)",
        "title": "Data Leakage: Preprocessor fit before train/test split",
    }
    res = apply_bob_remediation(sample_code, issue)
    assert isinstance(res, BobRemediationResult)
    assert res.applied is True
    assert "train_test_split(X, y" in res.patched_code
    assert "scaler.fit_transform(X_train)" in res.patched_code
    assert "Bob refactored" in res.explanation


def test_api_bob_apply_remediation_endpoint():
    """Test POST /api/bob-apply-remediation endpoint."""
    sample_code = "import numpy as np\nX = np.random.randn(10, 2)\n"
    issue = {
        "issue_id": "test-1",
        "category": "metric_mismatch",
        "line_number": 2,
        "offending_code": "",
        "remediation_code": "",
        "title": "Metric Mismatch",
    }
    resp = client.post("/api/bob-apply-remediation", json={"code": sample_code, "issue": issue})
    assert resp.status_code == 200
    data = resp.json()
    assert "patched_code" in data
    assert "explanation" in data
    assert "applied" in data


def test_explain_block_for_loop():
    """Verify fallback block explanation identifies loop structure and variables."""
    code = """raw = [1, 2, 3]
total = 0
for x in raw:
    total += x
print(total)
"""
    res = explain_block_in_context(code, start_line=3, end_line=4, block_type="for")
    assert isinstance(res, BlockExplanation)
    assert res.block_type == "for"
    assert res.start_line == 3
    assert res.end_line == 4
    assert "total" in res.variables_involved or "x" in res.variables_involved
    assert res.safe_to_extend is True
    assert res.teammate_logic_note != ""


def test_api_explain_block_endpoint():
    """Test POST /api/explain-block returns 200 with schema-valid response."""
    code = """for item in items:
    process(item)
"""
    payload = {
        "code": code,
        "start_line": 1,
        "end_line": 2,
        "block_type": "for",
    }
    resp = client.post("/api/explain-block", json=payload)
    assert resp.status_code == 200
    data = resp.json()
    assert data["start_line"] == 1
    assert data["end_line"] == 2
    assert "intent_summary" in data
    assert "teammate_logic_note" in data
    assert "variables_involved" in data


def test_api_explain_block_invalid_range():
    """Test POST /api/explain-block rejects invalid start/end line range."""
    payload = {
        "code": "print('hello')",
        "start_line": 5,
        "end_line": 2,
    }
    resp = client.post("/api/explain-block", json=payload)
    assert resp.status_code == 400
    assert "start_line must be >= 1 and end_line >= start_line" in resp.json()["detail"]


def test_explain_block_for_loop_with_branching():
    """Verify fallback block explanation accurately explains loops with if-else output branches."""
    code = '''for i in range(1, 10):
    if i == 5:
        print("NO!")
    else:
        print("yes!")'''
    res = explain_block_in_context(code, start_line=1, end_line=5, block_type="for")
    assert isinstance(res, BlockExplanation)
    assert "numbers 1 to 9" in res.teammate_logic_note
    assert "outputs 'yes!'" in res.teammate_logic_note
    assert "i == 5" in res.teammate_logic_note
    assert "outputs 'NO!'" in res.teammate_logic_note
    assert "1. Iterates `i` through numbers 1 to 9" in res.detailed_explanation
    assert "When `i == 5` is True: outputs 'NO!'" in res.detailed_explanation
def test_explain_block_for_loop_with_unconditional_and_if():
    """Verify fallback block explanation includes both unconditional statements (e.g. print yes) and conditional branches (e.g. print no)."""
    code = '''for i in range(1, 10):
    print("yes!")
    if i == 5:
        print("no")'''
    res = explain_block_in_context(code, start_line=1, end_line=4, block_type="for")
    assert isinstance(res, BlockExplanation)
    assert "numbers 1 to 9" in res.teammate_logic_note
    assert "outputs 'yes!'" in res.teammate_logic_note
    assert "i == 5" in res.teammate_logic_note
    assert "outputs 'no'" in res.teammate_logic_note
    assert "At every iteration: outputs 'yes!'" in res.detailed_explanation
    assert "When `i == 5` is True: outputs 'no'" in res.detailed_explanation
