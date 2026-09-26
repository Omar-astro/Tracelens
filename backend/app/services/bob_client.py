"""
bob_client.py — Stage 11: IBM Bob Client & Line-by-Line Contextual Explainer.
Stage 14: Appendix B.2 Teammate Handoff Summary.

Implements line-by-line intent explanations using IBM Bob API (or watsonx.ai foundation models)
per Appendix B.1 and Appendix A (StepExplanation), plus the end-of-trace handoff guide
per Appendix B.2 and Appendix A (HandoffSummary).
Provides a resilient offline fallback engine when credentials or network are unavailable.
"""

import ast
import json
import os
import re
from typing import Any, Dict, List, Optional
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


# ---------------------------------------------------------------------------
# Data Contract: HandoffSummary (Appendix A) — Stage 14
# ---------------------------------------------------------------------------

class HandoffSummary(BaseModel):
    """
    Data contract conforming to Appendix A: HandoffSummary.
    End-of-trace guide for the next developer taking over the script.
    """

    overall_purpose: str
    key_data_structures: List[Dict[str, str]] = Field(default_factory=list)
    safe_continuation_strategy: str
    cautions_for_teammate: List[str] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Prompt Template (Appendix B.2) — Stage 14
# ---------------------------------------------------------------------------

BOB_HANDOFF_SYSTEM_PROMPT = """You are a senior technical lead reviewing a completed execution trace of a teammate's
script. Produce a handoff guide so the next developer can continue the work without
introducing bugs.

Output strictly valid JSON with keys:
{
  "overall_purpose": "High-level summary of script workflow",
  "key_data_structures": [
    {"name": "var_name", "role": "what it holds", "final_state_summary": "size and contents"}
  ],
  "safe_continuation_strategy": "Step-by-step guidance on how the developer should extend this script",
  "cautions_for_teammate": ["List of pitfalls or invariants to maintain"]
}"""


def build_b2_prompt(
    code: str,
    safe_insertion_points: Optional[List[Dict[str, Any]]] = None,
    terminal_variables: Optional[Dict[str, Any]] = None,
) -> str:
    """Format the Appendix B.2 teammate handoff summary prompt."""
    points = safe_insertion_points or []
    variables = terminal_variables or {}

    points_str = json.dumps(points, default=str)
    variables_str = json.dumps(variables, default=str)

    return f"""Input Context:
- Full Script:
{code}

- Detected Safe Insertion Points: {points_str}
- Final Variable States: {variables_str}

Output strictly valid JSON with keys:
{{
  "overall_purpose": "High-level summary of script workflow",
  "key_data_structures": [
    {{"name": "var_name", "role": "what it holds", "final_state_summary": "size and contents"}}
  ],
  "safe_continuation_strategy": "Step-by-step guidance on how the developer should extend this script",
  "cautions_for_teammate": ["List of pitfalls or invariants to maintain"]
}}"""


# ---------------------------------------------------------------------------
# Offline Heuristic Fallback Engine — Appendix B.2 (Stage 14)
# ---------------------------------------------------------------------------

def _describe_data_structure(name: str, value_repr: str) -> str:
    """
    Build a short 'size and contents' description from a variable's repr string.
    Deterministic and offline-safe — never raises.
    """
    if value_repr is None:
        return "unavailable"
    text = str(value_repr).strip()
    if not text:
        return "empty"

    # Containers: describe length and a truncated preview.
    if (text.startswith("[") and text.endswith("]")) or (
        text.startswith("{") and text.endswith("}")
    ):
        try:
            container = ast.literal_eval(text)
        except Exception:
            container = None
        if isinstance(container, (list, tuple, set)):
            preview = ", ".join(repr(v) for v in list(container)[:3])
            more = "" if len(container) <= 3 else ", ..."
            return f"{type(container).__name__} of {len(container)} [{preview}{more}]"
        if isinstance(container, dict):
            keys = list(container.keys())[:4]
            return f"dict with {len(container)} keys: {', '.join(str(k) for k in keys)}"

    lowered = name.lower()
    if lowered in ("x", "xtrain", "xtest", "x_scaled", "features"):
        return f"feature matrix, shape {text}"
    if lowered in ("y", "ytrain", "ytest", "target", "labels"):
        return f"target vector, shape {text}"
    if isinstance(text, str) and text.isdigit():
        return f"integer counter, final value {text}"
    return f"{text[:120]}{'...' if len(text) > 120 else ''}"


def _infer_role(name: str, value_repr: str) -> str:
    """Infer what a variable holds from its name and repr. Never raises."""
    lowered = name.lower()
    text = str(value_repr or "").strip()

    if lowered in ("x", "xtrain", "xtest", "x_scaled", "x_scaled_train", "x_scaled_test", "features"):
        return "Feature matrix consumed by the estimator"
    if lowered in ("y", "ytrain", "ytest", "target", "labels"):
        return "Target / label vector aligned row-for-row with the feature matrix"
    if text.startswith("[") and text.endswith("]"):
        return "Accumulator list built during execution"
    if text.startswith("{") and text.endswith("}"):
        return "Mapping of keyed records produced by the pipeline"
    if text.lstrip("-").isdigit():
        return "Numeric counter tracking an aggregate"
    return "Intermediate value produced during execution"


def generate_fallback_handoff_summary(
    code: str,
    safe_insertion_points: Optional[List[Dict[str, Any]]] = None,
    terminal_variables: Optional[Dict[str, Any]] = None,
) -> HandoffSummary:
    """
    Produce a deterministic, schema-compliant HandoffSummary when the Bob API is
    offline or no credentials are configured.
    """
    source = code or ""
    points = safe_insertion_points or []
    variables = terminal_variables or {}

    # -- Parse the script for structural signals -----------------------------
    imports: List[str] = []
    function_names: List[str] = []
    printed: List[str] = []
    loop_count = 0
    branch_count = 0
    ml_signals: List[str] = []

    try:
        tree = ast.parse(source)
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                for alias in node.names:
                    imports.append(alias.name)
            elif isinstance(node, ast.ImportFrom) and node.module:
                imports.append(node.module)
            elif isinstance(node, ast.FunctionDef):
                function_names.append(node.name)
            elif isinstance(node, ast.For):
                loop_count += 1
            elif isinstance(node, ast.While):
                loop_count += 1
            elif isinstance(node, ast.If):
                branch_count += 1
    except Exception:
        tree = None

    for line in source.splitlines():
        stripped = line.strip()
        if stripped.startswith("print("):
            try:
                printed.append(stripped)
            except Exception:
                pass

    lowered_source = source.lower()
    for signal, needle in (
        ("model training / evaluation pipeline", "train_test_split"),
        ("feature preprocessing", "standardscaler"),
        ("feature preprocessing", "minmaxscaler"),
        ("estimator fitting", ".fit("),
        ("numeric computation", "numpy"),
        ("supervised learning", "randomforest"),
        ("supervised learning", "logisticregression"),
    ):
        if needle in lowered_source and signal not in ml_signals:
            ml_signals.append(signal)

    # -- overall_purpose ------------------------------------------------------
    purpose_parts: List[str] = []
    if ml_signals:
        purpose_parts.append(
            f"A machine-learning workflow covering {', '.join(ml_signals)}."
        )
    else:
        purpose_parts.append("A procedural data-processing script.")

    if function_names:
        purpose_parts.append(f"It defines {len(function_names)} function(s): {', '.join(function_names)}.")
    if loop_count:
        purpose_parts.append(f"Control flow is dominated by {loop_count} loop(s)")
    if branch_count:
        purpose_parts.append(f"and {branch_count} conditional branch(es)")
    if loop_count or branch_count:
        purpose_parts[-1] = purpose_parts[-1] + "."
    if printed:
        purpose_parts.append(f"It reports its final state to stdout via {len(printed)} print statement(s).")
    if not function_names and not loop_count and not branch_count and not printed:
        purpose_parts.append("Execution is a straight-line sequence of assignments with no branching.")

    overall_purpose = " ".join(p for p in purpose_parts if p)

    # -- key_data_structures --------------------------------------------------
    key_data_structures: List[Dict[str, str]] = []
    for var_name, var_repr in variables.items():
        key_data_structures.append(
            {
                "name": str(var_name),
                "role": _infer_role(str(var_name), var_repr),
                "final_state_summary": _describe_data_structure(str(var_name), var_repr),
            }
        )
    if not key_data_structures:
        key_data_structures.append(
            {
                "name": "(none)",
                "role": "No terminal variables were captured at the end of the trace",
                "final_state_summary": "unavailable",
            }
        )

    # -- safe_continuation_strategy ------------------------------------------
    strategy_lines: List[str] = []
    if points:
        strategy_lines.append(
            f"The execution trace identified {len(points)} safe insertion point(s) "
            "where the script's state is stable and new logic will not corrupt existing data."
        )
        for pt in points[:3]:
            line_no = pt.get("line_number", "?")
            target = pt.get("target_variable", "the accumulator")
            reason = pt.get("reason", "")
            strategy_lines.append(
                f"Line {line_no} — hook in after this point: it operates on '{target}'. {reason}".strip()
            )
        if len(points) > 3:
            strategy_lines.append(f"{len(points) - 3} further point(s) are listed in the Safe Hooks drawer.")
    else:
        strategy_lines.append(
            "No safe insertion points were detected, so treat every line as load-bearing until proven otherwise."
        )

    strategy_lines.append(
        f"Add new logic only after the pipeline's final aggregation step, then re-run the trace to confirm "
        f"no existing variable changes shape. {len(key_data_structures)} terminal variable(s) must keep their "
        "current types and ordering for downstream consumers."
    )
    safe_continuation_strategy = " ".join(strategy_lines)

    # -- cautions_for_teammate -----------------------------------------------
    cautions: List[str] = []
    if branch_count:
        cautions.append(
            f"{branch_count} conditional branch(es) gate this pipeline. Skipping or reordering a branch "
            "silently changes which records reach the accumulators."
        )
    if loop_count:
        cautions.append(
            f"{loop_count} loop(s) mutate shared state. Do not mutate the iterable inside the loop body — "
            "that breaks the iteration bounds the teammate relied on."
        )
    if ml_signals:
        cautions.append(
            "This is an ML pipeline. Keep the split/fit ordering intact: any preprocessor fitted before "
            "train_test_split leaks evaluation-set statistics into training."
        )
    if len(key_data_structures) > 1:
        cautions.append(
            f"{len(key_data_structures)} terminal structures are coupled by index. Inserting or removing "
            "rows from one without mirroring it in the others will desynchronize the output."
        )
    cautions.append(
        "Any value surfaced in the trace is a truncated repr for display; read the source before asserting "
        "on exact lengths or contents."
    )
    if not cautions:
        cautions.append("No structural hazards were detected; preserve the existing execution order regardless.")

    return HandoffSummary(
        overall_purpose=overall_purpose,
        key_data_structures=key_data_structures,
        safe_continuation_strategy=safe_continuation_strategy,
        cautions_for_teammate=cautions,
    )


# ---------------------------------------------------------------------------
# Main Bob Handoff Summary Function (Appendix B.2) — Stage 14
# ---------------------------------------------------------------------------

def generate_handoff_summary(
    code: str,
    safe_insertion_points: Optional[List[Dict[str, Any]]] = None,
    terminal_variables: Optional[Dict[str, Any]] = None,
) -> HandoffSummary:
    """
    Sends the Appendix B.2 prompt to IBM Bob / watsonx and parses the strict JSON response.
    Falls back gracefully to the heuristic generator if offline or credentials are missing.
    """
    points = safe_insertion_points or []
    variables = terminal_variables or {}

    api_key = os.getenv("IBM_CLOUD_API_KEY") or os.getenv("BOB_API_KEY")
    api_url = os.getenv("BOB_API_URL") or os.getenv("WATSONX_URL")

    # If no credentials configured, immediately return the high-fidelity fallback
    if not api_key or api_key == "your_api_key_here_DO_NOT_COMMIT":
        return generate_fallback_handoff_summary(
            code=code,
            safe_insertion_points=points,
            terminal_variables=variables,
        )

    user_prompt = build_b2_prompt(
        code=code,
        safe_insertion_points=points,
        terminal_variables=variables,
    )

    try:
        endpoint = api_url or "https://api.bob.ibm.com/v1/chat/completions"
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        }
        payload = {
            "model": os.getenv("BOB_MODEL_ID", "ibm/granite-3-8b-instruct"),
            "messages": [
                {"role": "system", "content": BOB_HANDOFF_SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt},
            ],
            "temperature": 0.2,
            # A handoff summary is long-form; give it more room than a single line.
            "max_tokens": 1024,
        }

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

                        raw_structures = parsed.get("key_data_structures") or []
                        structures: List[Dict[str, str]] = []
                        if isinstance(raw_structures, list):
                            for entry in raw_structures:
                                if isinstance(entry, dict):
                                    structures.append(
                                        {
                                            "name": str(entry.get("name", "")),
                                            "role": str(entry.get("role", "")),
                                            "final_state_summary": str(entry.get("final_state_summary", "")),
                                        }
                                    )

                        raw_cautions = parsed.get("cautions_for_teammate") or []
                        if isinstance(raw_cautions, str):
                            cautions = [raw_cautions]
                        elif isinstance(raw_cautions, list):
                            cautions = [str(c) for c in raw_cautions]
                        else:
                            cautions = []

                        return HandoffSummary(
                            overall_purpose=str(parsed.get("overall_purpose", "")),
                            key_data_structures=structures,
                            safe_continuation_strategy=str(parsed.get("safe_continuation_strategy", "")),
                            cautions_for_teammate=cautions,
                        )
    except Exception:
        # Never crash the API on external network / parsing errors; fall back cleanly
        pass

    return generate_fallback_handoff_summary(
        code=code,
        safe_insertion_points=points,
        terminal_variables=variables,
    )
