"""
TraceLens API Router - Stage 1 Mock Endpoint.
"""

from typing import Any, Dict, List, Optional
from fastapi import APIRouter

router = APIRouter(prefix="/api", tags=["Trace"])

# 5-step mock array matching TraceStep shape from Appendix A
MOCK_TRACE_STEPS: List[Dict[str, Any]] = [
    {
        "step_id": 1,
        "line_number": 1,
        "code_line": "raw_logs = [{\"user\": \" alice \", \"action\": \"login\", \"status\": 200}]",
        "event_type": "line",
        "loop_context": None,
        "branch_context": None,
        "variable_deltas": {
            "raw_logs": {
                "action": "created",
                "var_name": "raw_logs",
                "type_name": "list",
                "old_value": None,
                "new_value": [{"user": " alice ", "action": "login", "status": 200}],
                "repr_str": "[{'user': ' alice ', 'action': 'login', 'status': 200}]",
                "metadata": {"length": 1},
            }
        },
        "all_variables": {
            "raw_logs": "[{'user': ' alice ', 'action': 'login', 'status': 200}]"
        },
        "stdout_emitted": None,
    },
    {
        "step_id": 2,
        "line_number": 8,
        "code_line": "cleaned_records = []",
        "event_type": "line",
        "loop_context": None,
        "branch_context": None,
        "variable_deltas": {
            "cleaned_records": {
                "action": "created",
                "var_name": "cleaned_records",
                "type_name": "list",
                "old_value": None,
                "new_value": [],
                "repr_str": "[]",
                "metadata": {"length": 0},
            }
        },
        "all_variables": {
            "raw_logs": "[{'user': ' alice ', 'action': 'login', 'status': 200}]",
            "cleaned_records": "[]",
        },
        "stdout_emitted": None,
    },
    {
        "step_id": 3,
        "line_number": 9,
        "code_line": "error_count = 0",
        "event_type": "line",
        "loop_context": None,
        "branch_context": None,
        "variable_deltas": {
            "error_count": {
                "action": "created",
                "var_name": "error_count",
                "type_name": "int",
                "old_value": None,
                "new_value": 0,
                "repr_str": "0",
                "metadata": None,
            }
        },
        "all_variables": {
            "raw_logs": "[{'user': ' alice ', 'action': 'login', 'status': 200}]",
            "cleaned_records": "[]",
            "error_count": "0",
        },
        "stdout_emitted": None,
    },
    {
        "step_id": 4,
        "line_number": 12,
        "code_line": "for record in raw_logs:",
        "event_type": "loop_iteration",
        "loop_context": {
            "loop_id": "loop_line_12",
            "loop_type": "for",
            "header_line": 12,
            "current_iteration": 1,
            "total_iterations": 1,
            "iterator_target": "record",
            "iterator_value": {"user": " alice ", "action": "login", "status": 200},
            "is_exit_step": False,
        },
        "branch_context": None,
        "variable_deltas": {
            "record": {
                "action": "created",
                "var_name": "record",
                "type_name": "dict",
                "old_value": None,
                "new_value": {"user": " alice ", "action": "login", "status": 200},
                "repr_str": "{'user': ' alice ', 'action': 'login', 'status': 200}",
                "metadata": None,
            }
        },
        "all_variables": {
            "raw_logs": "[{'user': ' alice ', 'action': 'login', 'status': 200}]",
            "cleaned_records": "[]",
            "error_count": "0",
            "record": "{'user': ' alice ', 'action': 'login', 'status': 200}",
        },
        "stdout_emitted": None,
    },
    {
        "step_id": 5,
        "line_number": 13,
        "code_line": "name = record[\"user\"].strip().capitalize()",
        "event_type": "line",
        "loop_context": None,
        "branch_context": None,
        "variable_deltas": {
            "name": {
                "action": "created",
                "var_name": "name",
                "type_name": "str",
                "old_value": None,
                "new_value": "Alice",
                "repr_str": "'Alice'",
                "metadata": {"length": 5},
            }
        },
        "all_variables": {
            "raw_logs": "[{'user': ' alice ', 'action': 'login', 'status': 200}]",
            "cleaned_records": "[]",
            "error_count": "0",
            "record": "{'user': ' alice ', 'action': 'login', 'status': 200}",
            "name": "'Alice'",
        },
        "stdout_emitted": None,
    },
]


@router.post("/trace")
def trace_code_mock(payload: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
    """
    Mock execution trace endpoint.
    Ignores input and returns a hardcoded 5-step trace array per Stage 1 specification.
    """
    # TODO(stage-5): Replace mock endpoint with real sandbox/tracer pipeline
    return MOCK_TRACE_STEPS
