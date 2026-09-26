"""
bob_client.py — Stage 11: IBM Bob Client & Line-by-Line Contextual Explainer.

Implements line-by-line intent explanations using IBM Bob API (or watsonx.ai foundation models)
per Appendix B.1 and Appendix A (StepExplanation).
Provides a resilient offline fallback engine when credentials or network are unavailable.
"""

import json
import os
import re
from typing import Any, Dict, Optional
import httpx
from pydantic import BaseModel, Field

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass


# ---------------------------------------------------------------------------
# Data Contract: StepExplanation (Appendix A)
# ---------------------------------------------------------------------------

class StepExplanation(BaseModel):
    step_id: int
    line_number: int
    intent_summary: str
    detailed_explanation: str
    teammate_logic_note: str
    safe_to_extend: bool
    continuation_tip: Optional[str] = None


# ---------------------------------------------------------------------------
# Prompt Templates (Appendix B.1)
# ---------------------------------------------------------------------------

BOB_SYSTEM_PROMPT = """You are an expert software engineer acting as a pair programming assistant. The user has
inherited a Python script from a teammate and is stepping through it line by line. Explain
the intent of the current line based on measured runtime execution state.

Instructions:
1. Explain what the teammate was achieving on this specific line.
2. Note why this logic was structured this way.
3. State whether it is safe to modify or hook into this line, and provide a tip for
   extending it.

Output strictly valid JSON with keys:
{
  "intent_summary": "One sentence summary of intent",
  "detailed_explanation": "2-3 sentence mechanical and logical breakdown",
  "teammate_logic_note": "Explanation of teammate design pattern or decision",
  "safe_to_extend": true,
  "continuation_tip": "Concrete advice for where to inject new logic"
}"""


def build_b1_prompt(
    filename: str,
    line_number: int,
    code_line: str,
    variable_deltas: Dict[str, Any],
    all_variables: Dict[str, Any],
) -> str:
    """Format the Appendix B.1 contextual intent prompt."""
    deltas_str = json.dumps(variable_deltas, default=str)
    all_vars_str = json.dumps(all_variables, default=str)

    return f"""Input Context:
- File Name: {filename}
- Current Line Number: {line_number}
- Code Line: {code_line}
- Variables Mutated This Step: {deltas_str}
- Local Memory Snapshot: {all_vars_str}

Instructions:
1. Explain what the teammate was achieving on this specific line.
2. Note why this logic was structured this way.
3. State whether it is safe to modify or hook into this line, and provide a tip for
   extending it.

Output strictly valid JSON with keys:
{{
  "intent_summary": "One sentence summary of intent",
  "detailed_explanation": "2-3 sentence mechanical and logical breakdown",
  "teammate_logic_note": "Explanation of teammate design pattern or decision",
  "safe_to_extend": true,
  "continuation_tip": "Concrete advice for where to inject new logic"
}}"""


# ---------------------------------------------------------------------------
# Offline Heuristic Fallback Engine
# ---------------------------------------------------------------------------

def generate_fallback_explanation(
    step_id: int,
    line_number: int,
    code_line: str,
    variable_deltas: Optional[Dict[str, Any]] = None,
    all_variables: Optional[Dict[str, Any]] = None,
) -> StepExplanation:
    """
    Produce a deterministic, schema-compliant StepExplanation when Bob API is offline
    or no credentials are configured.
    """
    deltas = variable_deltas or {}
    variables = all_variables or {}
    stripped = code_line.strip()

    if stripped.startswith("for ") or stripped.startswith("while "):
        intent = "Iterates across sequence collection to inspect and process each element."
        detail = (
            f"Line {line_number} evaluates the iteration target and advances the loop cursor. "
            f"Active variables in memory: {list(variables.keys())[:5]}."
        )
        note = "Uses standard iteration pattern to process records sequentially without indexing overhead."
        safe = False
        tip = "Avoid mutating the loop iterable directly within the loop body to maintain predictable iteration bounds."

    elif stripped.startswith("if ") or stripped.startswith("elif "):
        intent = f"Evaluates conditional branch '{stripped}' against active runtime variables."
        detail = (
            f"Line {line_number} tests predicate to route control flow. "
            f"Evaluated with current scope containing {len(variables)} variables."
        )
        note = "Guards against invalid record formats and isolates edge-case handling logic."
        safe = True
        tip = "You can safely add supplemental conditions using 'and' / 'or' or insert an 'elif' branch here."

    elif ".append(" in stripped:
        mutated_target = list(deltas.keys())[0] if deltas else "collection"
        intent = f"Appends transformed record into '{mutated_target}' accumulator."
        detail = (
            f"Mutates list '{mutated_target}' in-place on line {line_number}. "
            f"Current deltas: {list(deltas.keys())}."
        )
        note = "Accumulator pattern used to cleanly isolate valid records from unprocessed input logs."
        safe = True
        tip = "This is a safe extension point: add additional record validation or field enrichment before appending."

    elif "+=" in stripped or "-=" in stripped:
        var = list(deltas.keys())[0] if deltas else "counter"
        intent = f"Updates arithmetic counter '{var}'."
        detail = f"Modifies numeric state for '{var}' based on condition evaluation on line {line_number}."
        note = "Maintains running tally of anomalies or processed items for downstream reporting."
        safe = True
        tip = "Safe to hook metrics aggregation or alerting if threshold values are reached."

    elif "=" in stripped and not stripped.startswith("=="):
        assigned_vars = list(deltas.keys()) if deltas else [stripped.split("=")[0].strip()]
        var_name = assigned_vars[0] if assigned_vars else "variable"
        intent = f"Sanitizes or initializes state for '{var_name}'."
        detail = f"Evaluates right-hand expression on line {line_number} and binds result to '{var_name}'."
        note = "Normalizes input attributes to ensure downstream operations receive consistent types."
        safe = True
        tip = f"Safe to hook additional validation on '{var_name}' immediately following this assignment."

    elif stripped.startswith("print(") or stripped.startswith("logging."):
        intent = "Outputs diagnostic execution state to standard output/logs."
        detail = f"Line {line_number} emits formatted values for developer observability."
        note = "Provides runtime telemetry before script termination."
        safe = True
        tip = "Safe to replace or extend with structured JSON logging or external reporting hooks."

    else:
        intent = f"Executes '{stripped[:40]}...' in current execution frame."
        detail = f"Line {line_number} executed cleanly with {len(variables)} variables active in frame scope."
        note = "Procedural logic step in the teammate's workflow pipeline."
        safe = True
        tip = "Safe to hook assertions or pre-condition guards prior to executing this line."

    return StepExplanation(
        step_id=step_id,
        line_number=line_number,
        intent_summary=intent,
        detailed_explanation=detail,
        teammate_logic_note=note,
        safe_to_extend=safe,
        continuation_tip=tip,
    )


# ---------------------------------------------------------------------------
# Main Bob Explainer Function
# ---------------------------------------------------------------------------

def explain_step_in_context(
    step_id: int,
    line_number: int,
    code_line: str,
    filename: str = "<tracelens_user_code>",
    variable_deltas: Optional[Dict[str, Any]] = None,
    all_variables: Optional[Dict[str, Any]] = None,
) -> StepExplanation:
    """
    Sends Appendix B.1 prompt to IBM Bob / watsonx API and parses the strict JSON response.
    Falls back gracefully to the heuristic generator if offline or credentials are missing.
    """
    deltas = variable_deltas or {}
    variables = all_variables or {}

    api_key = os.getenv("IBM_CLOUD_API_KEY") or os.getenv("BOB_API_KEY")
    api_url = os.getenv("BOB_API_URL") or os.getenv("WATSONX_URL")

    # If no credentials configured, immediately return the high-fidelity fallback
    if not api_key or api_key == "your_api_key_here_DO_NOT_COMMIT":
        return generate_fallback_explanation(
            step_id=step_id,
            line_number=line_number,
            code_line=code_line,
            variable_deltas=deltas,
            all_variables=variables,
        )

    # Format the prompt
    user_prompt = build_b1_prompt(
        filename=filename,
        line_number=line_number,
        code_line=code_line,
        variable_deltas=deltas,
        all_variables=variables,
    )

    try:
        # Determine endpoint URL
        endpoint = api_url or "https://api.bob.ibm.com/v1/chat/completions"
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        }
        payload = {
            "model": os.getenv("BOB_MODEL_ID", "ibm/granite-3-8b-instruct"),
            "messages": [
                {"role": "system", "content": BOB_SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt},
            ],
            "temperature": 0.2,
            "max_tokens": 512,
        }

        # Make synchronous request with strict 5s timeout
        with httpx.Client(timeout=5.0) as client:
            resp = client.post(endpoint, json=payload, headers=headers)
            if resp.status_code == 200:
                data = resp.json()
                content = ""
                if "choices" in data and len(data["choices"]) > 0:
                    content = data["choices"][0].get("message", {}).get("content", "")
                elif "results" in data and len(data["results"]) > 0:
                    content = data["results"][0].get("generated_text", "")

                if content:
                    # Strip code fences if present (```json ... ```)
                    json_str = content.strip()
                    if "```json" in json_str:
                        json_str = json_str.split("```json", 1)[1].split("```", 1)[0]
                    elif "```" in json_str:
                        json_str = json_str.split("```", 1)[1].split("```", 1)[0]

                    match = re.search(r"\{.*\}", json_str, re.DOTALL)
                    if match:
                        parsed = json.loads(match.group(0))
                        return StepExplanation(
                            step_id=step_id,
                            line_number=line_number,
                            intent_summary=str(parsed.get("intent_summary", "Line execution intent.")),
                            detailed_explanation=str(parsed.get("detailed_explanation", "")),
                            teammate_logic_note=str(parsed.get("teammate_logic_note", "")),
                            safe_to_extend=bool(parsed.get("safe_to_extend", True)),
                            continuation_tip=str(parsed.get("continuation_tip", "")) if parsed.get("continuation_tip") else None,
                        )
    except Exception:
        # Never crash the API on external network / parsing errors; fall back cleanly
        pass

    return generate_fallback_explanation(
        step_id=step_id,
        line_number=line_number,
        code_line=code_line,
        variable_deltas=deltas,
        all_variables=variables,
    )


# TODO(stage-14): Implement Appendix B.2 teammate handoff summary prompt
