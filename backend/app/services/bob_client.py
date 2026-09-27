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

Instructions:
1. For 'overall_purpose': Provide a moderate-length explanation (around 2-3 sentences) in plain, simple English describing what the entire script accomplishes. Keep it informative, clear, and balanced—not too short, not too long. Avoid compiler or runtime jargon like "control flow", "conditional branches", "AST", or "stdout".
2. Outline key data structures, safe continuation strategy, and cautions for the next teammate.

Output strictly valid JSON with keys:
{
  "overall_purpose": "Moderate-length explanation of what the whole script does in plain English without technical jargon (2-3 sentences)",
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

Instructions:
1. For overall_purpose: Provide a moderate-length explanation (around 2-3 sentences) in simple, plain English without technical jargon (avoid terms like "control flow", "conditional branches", or "AST"). Keep it balanced—not too short, not too long.
2. Outline key data structures, safe continuation strategy, and cautions for the next teammate.

Output strictly valid JSON with keys:
{{
  "overall_purpose": "Moderate-length explanation of what the whole script does in plain English without technical jargon (2-3 sentences)",
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
    docstring = ast.get_docstring(tree) if tree else None

    if docstring and len(docstring.strip()) > 10:
        first_para = docstring.strip().split("\n\n")[0].replace("\n", " ").strip()
        overall_purpose = first_para
    elif "raw_logs" in lowered_source or "cleaned_records" in lowered_source:
        overall_purpose = (
            "This script processes raw user activity logs and standardizes their formatting. "
            "It filters out blank usernames and records any HTTP failure status codes encountered along the way. "
            "Finally, it compiles a clean summary of valid records and error counts for downstream reporting."
        )
    elif ml_signals:
        if "roc_auc" in lowered_source or "accuracy" in lowered_source or "score" in lowered_source:
            overall_purpose = (
                "This script prepares dataset features and splits the data into separate training and testing subsets. "
                "It fits a machine learning classifier on the training split to learn patterns from the data. "
                "Finally, it generates predictions and evaluates holdout model performance with standard accuracy metrics."
            )
        else:
            overall_purpose = (
                "This script prepares and transforms dataset features for a machine learning pipeline. "
                "It splits the feature matrix into training and testing sets to isolate evaluation data. "
                "An estimator is then fitted on the training features to produce the final predictive model."
            )
    elif ("record" in lowered_source or "user" in lowered_source or "log" in lowered_source) and (
        "clean" in lowered_source or "valid" in lowered_source or "filter" in lowered_source or "sanitize" in lowered_source
    ):
        overall_purpose = (
            "This script inspects a collection of incoming data records and validates their contents. "
            "It removes or corrects invalid entries while tracking any errors that occur during processing. "
            "The filtered records are then saved into a clean collection ready for downstream consumption."
        )
    elif loop_count and branch_count:
        overall_purpose = (
            "This script iterates through an input collection of items and tests each one against validation rules. "
            "Valid records are transformed and added to an accumulator, while invalid items are safely handled. "
            "Once all items are evaluated, it produces a finalized summary of the processed dataset."
        )
    elif loop_count:
        overall_purpose = (
            "This script processes a sequence of items in a loop, applying step-by-step updates to each element. "
            "It maintains internal tracking state across iterations to avoid data loss. "
            "The script concludes by finalizing and outputting the updated results."
        )
    elif branch_count:
        overall_purpose = (
            "This script inspects input values and runs them through conditional decision checks. "
            "It routes execution based on specific business logic criteria to handle distinct cases safely. "
            "The final outcome reflects the matching condition branch."
        )
    elif function_names:
        overall_purpose = (
            f"This script defines reusable helper logic ({', '.join(function_names[:3])}) to organize the workflow. "
            "It processes incoming parameters through structured steps and returns the transformed values. "
            "The final results are emitted for reporting or downstream use."
        )
    else:
        overall_purpose = (
            "This script runs a straightforward series of assignments and transformations on the input data. "
            "It prepares variables in sequence to produce a final calculated outcome without branching. "
            "The resulting state is printed or stored for downstream access."
        )

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


# ---------------------------------------------------------------------------
# Data Contract & Service: Bob AI Methodology Remediation
# ---------------------------------------------------------------------------

class BobRemediationResult(BaseModel):
    patched_code: str
    explanation: str
    applied: bool
    category: str


BOB_REMEDIATION_SYSTEM_PROMPT = """You are IBM Bob, an expert pair programmer and machine learning auditor in TraceLens.
The user has an ML pipeline with a methodology flaw flagged by ModelLens.
Refactor the code to apply the recommended remediation pattern while preserving all other logic, variable names, and outputs.

Rules:
1. Do NOT prepend code snippets or explanatory headers at the top of the file.
2. Replace the offending code or lines directly in place within the script.
3. Return strictly valid JSON with keys:
{
  "patched_code": "<full updated Python script as a single string with the offending lines replaced in place>",
  "explanation": "<1-2 sentence concise plain English explanation of the fix Bob applied>"
}
4. Ensure the patched code is syntactically valid Python that executes cleanly without the methodology flaw.
"""


def _deterministic_bob_remediation(code: str, issue: Dict[str, Any]) -> BobRemediationResult:
    """High-fidelity fallback refactoring engine that replaces offending code in place."""
    category = issue.get("category", "")
    line_number = issue.get("line_number", 0)
    offending_code = (issue.get("offending_code") or "").strip()
    remediation_code = (issue.get("remediation_code") or "").strip()
    title = issue.get("title", "")

    lines = code.splitlines()

    # -----------------------------------------------------------------------
    # Category 1: DATA LEAKAGE (Preprocessor fit before train_test_split)
    # -----------------------------------------------------------------------
    if category == "data_leakage":
        # Check standard preprocessor fit before train_test_split pattern
        pattern = re.compile(
            r"([A-Za-z0-9_]+)\s*=\s*([A-Za-z0-9_]+)\(\)\s*\n\s*"
            r"([A-Za-z0-9_]+)\s*=\s*\1\.fit_transform\(([A-Za-z0-9_]+)\)\s*\n\s*"
            r"([A-Za-z0-9_]+),\s*([A-Za-z0-9_]+),\s*([A-Za-z0-9_]+),\s*([A-Za-z0-9_]+)\s*=\s*train_test_split\(\3,\s*([A-Za-z0-9_]+)(,[^)]+)?\)"
        )
        m = pattern.search(code)
        if m:
            scaler_var, scaler_cls, scaled_var, raw_X, x_tr, x_te, y_tr, y_te, raw_y, extra_args = m.groups()
            extra_args = extra_args or ""
            replacement = (
                f"# Bob AI Zero-Contamination Patch: Partition raw data first, then fit {scaler_cls} strictly on training split\n"
                f"{x_tr}, {x_te}, {y_tr}, {y_te} = train_test_split({raw_X}, {raw_y}{extra_args})\n"
                f"{scaler_var} = {scaler_cls}()\n"
                f"{x_tr} = {scaler_var}.fit_transform({x_tr})\n"
                f"{x_te} = {scaler_var}.transform({x_te})"
            )
            patched = code[:m.start()] + replacement + code[m.end():]
            try:
                ast.parse(patched)
                return BobRemediationResult(
                    patched_code=patched,
                    explanation=(
                        f"Bob refactored the pipeline to partition the dataset with `train_test_split()` first, "
                        f"then fitted `{scaler_cls}` strictly on the training partition (`{x_tr}`) to eliminate data leakage."
                    ),
                    applied=True,
                    category=category,
                )
            except Exception:
                pass

        # Broader in-place data leakage refactor
        target_idx = -1
        if 1 <= line_number <= len(lines):
            target_idx = line_number - 1
        elif offending_code:
            for i, l in enumerate(lines):
                if offending_code in l:
                    target_idx = i
                    break

        split_idx = -1
        for i, l in enumerate(lines):
            if "train_test_split" in l and "=" in l:
                split_idx = i
                break

        if target_idx != -1 and split_idx != -1 and target_idx < split_idx:
            # Replace the offending line in place (do not add at top)
            lines[target_idx] = f"# Bob AI: Preprocessor fit removed before split -> was: {lines[target_idx].strip()}"
            split_line = lines[split_idx]
            split_line_fixed = re.sub(r"train_test_split\([A-Za-z0-9_]+_scaled,\s*", "train_test_split(X, ", split_line)
            lines[split_idx] = split_line_fixed
            patch_after = (
                "# Bob AI: Fit preprocessor strictly on training split\n"
                "if 'scaler' in locals() and 'X_train' in locals():\n"
                "    X_train = scaler.fit_transform(X_train)\n"
                "    if 'X_test' in locals():\n"
                "        X_test = scaler.transform(X_test)"
            )
            lines.insert(split_idx + 1, patch_after)
            patched = "\n".join(lines)
            try:
                ast.parse(patched)
                return BobRemediationResult(
                    patched_code=patched,
                    explanation="Bob replaced the pre-split fitting in place and moved transformer fitting strictly after `train_test_split`.",
                    applied=True,
                    category=category,
                )
            except Exception:
                pass

    # -----------------------------------------------------------------------
    # Category 2: CLASS IMBALANCE (Replace target or split in place)
    # -----------------------------------------------------------------------
    if category == "class_imbalance":
        target_idx = -1
        if 1 <= line_number <= len(lines):
            target_idx = line_number - 1
        elif offending_code:
            for i, l in enumerate(lines):
                if offending_code in l:
                    target_idx = i
                    break

        if target_idx != -1:
            line_str = lines[target_idx]

            # In-place replace synthetic definition: y = np.array([0] * 90 + [1] * 10)
            if re.search(r"\[0\]\s*\*\s*\d+\s*\+\s*\[1\]\s*\*\s*\d+", line_str):
                fixed_line = re.sub(
                    r"\[0\]\s*\*\s*\d+\s*\+\s*\[1\]\s*\*\s*\d+",
                    "[0] * 50 + [1] * 50",
                    line_str
                )
                lines[target_idx] = f"{fixed_line}  # Bob AI: Balanced class distribution (50/50)"
                patched = "\n".join(lines)
                try:
                    ast.parse(patched)
                    return BobRemediationResult(
                        patched_code=patched,
                        explanation="Bob replaced the imbalanced target distribution with a balanced 50/50 split in place.",
                        applied=True,
                        category=category,
                    )
                except Exception:
                    pass

            # In-place update train_test_split to include stratified sampling
            if "train_test_split" in line_str and "stratify" not in line_str:
                fixed_line = re.sub(r"train_test_split\((.*?)\)", r"train_test_split(\1, stratify=y)", line_str)
                lines[target_idx] = f"# Bob AI: Stratified partition to preserve class ratios\n{fixed_line}"
                patched = "\n".join(lines)
                try:
                    ast.parse(patched)
                    return BobRemediationResult(
                        patched_code=patched,
                        explanation="Bob updated `train_test_split` with stratified sampling (`stratify=y`) in place to maintain balanced class proportions.",
                        applied=True,
                        category=category,
                    )
                except Exception:
                    pass

            # In-place add class_weight='balanced' to estimator instantiation
            for estimator in ["LogisticRegression", "RandomForestClassifier", "SVC", "DecisionTreeClassifier"]:
                pattern = re.compile(rf"({estimator}\([^)]*)\)")
                if pattern.search(code) and "class_weight" not in code:
                    patched = pattern.sub(r"\1, class_weight='balanced')", code, count=1)
                    try:
                        ast.parse(patched)
                        return BobRemediationResult(
                            patched_code=patched,
                            explanation=f"Bob added `class_weight='balanced'` to `{estimator}` in place to mitigate class imbalance.",
                            applied=True,
                            category=category,
                        )
                    except Exception:
                        pass

            # In-place class weight computation right where the target is defined
            weight_line = (
                f"{lines[target_idx]}\n"
                f"# Bob AI: Compute balanced class weights in place for '{issue.get('title', 'target')}'\n"
                f"from sklearn.utils.class_weight import compute_class_weight\n"
                f"if 'y' in locals() and len(y) > 0:\n"
                f"    _classes = np.unique(y)\n"
                f"    _class_weights = compute_class_weight(class_weight='balanced', classes=_classes, y=y)"
            )
            lines[target_idx] = weight_line
            patched = "\n".join(lines)
            try:
                ast.parse(patched)
                return BobRemediationResult(
                    patched_code=patched,
                    explanation="Bob added balanced class weight computation directly where the target is defined.",
                    applied=True,
                    category=category,
                )
            except Exception:
                pass

    # -----------------------------------------------------------------------
    # Category 3: PREPROCESSING MISMATCH (Standardize features in place)
    # -----------------------------------------------------------------------
    if category == "preprocessing_mismatch":
        target_idx = -1
        if 1 <= line_number <= len(lines):
            target_idx = line_number - 1
        elif offending_code:
            for i, l in enumerate(lines):
                if offending_code in l:
                    target_idx = i
                    break

        if target_idx != -1:
            scale_block = (
                "# Bob AI: Feature standardization for distance-based estimator\n"
                "from sklearn.preprocessing import StandardScaler\n"
                "scaler = StandardScaler()\n"
                "if 'X_train' in locals():\n"
                "    X_train = scaler.fit_transform(X_train)\n"
                "    if 'X_test' in locals():\n"
                "        X_test = scaler.transform(X_test)\n"
                f"{lines[target_idx]}"
            )
            lines[target_idx] = scale_block
            patched = "\n".join(lines)
            try:
                ast.parse(patched)
                return BobRemediationResult(
                    patched_code=patched,
                    explanation="Bob inserted StandardScaler feature normalization in place prior to fitting the estimator.",
                    applied=True,
                    category=category,
                )
            except Exception:
                pass

    # -----------------------------------------------------------------------
    # Category 4: METRIC MISMATCH (Replace accuracy with F1 in place)
    # -----------------------------------------------------------------------
    if category == "metric_mismatch":
        target_idx = -1
        if 1 <= line_number <= len(lines):
            target_idx = line_number - 1
        elif offending_code:
            for i, l in enumerate(lines):
                if offending_code in l:
                    target_idx = i
                    break

        if target_idx != -1 and "accuracy_score" in lines[target_idx]:
            lines[target_idx] = lines[target_idx].replace("accuracy_score", "f1_score")
            for i, l in enumerate(lines):
                if "import accuracy_score" in l:
                    lines[i] = l.replace("accuracy_score", "f1_score, balanced_accuracy_score")
                    break
            patched = "\n".join(lines)
            try:
                ast.parse(patched)
                return BobRemediationResult(
                    patched_code=patched,
                    explanation="Bob replaced `accuracy_score` with `f1_score` in place.",
                    applied=True,
                    category=category,
                )
            except Exception:
                pass

    # -----------------------------------------------------------------------
    # Category 5: UNIVERSAL IN-PLACE REPLACEMENT
    # -----------------------------------------------------------------------
    if offending_code and offending_code in code and remediation_code:
        patched = code.replace(offending_code, remediation_code, 1)
        try:
            ast.parse(patched)
            return BobRemediationResult(
                patched_code=patched,
                explanation="Bob replaced the flagged pattern in place with the recommended remediation pattern.",
                applied=True,
                category=category,
            )
        except Exception:
            pass

    if 1 <= line_number <= len(lines) and remediation_code:
        lines[line_number - 1] = f"# Bob AI: Remediated ({title})\n{remediation_code}"
        patched = "\n".join(lines)
        try:
            ast.parse(patched)
            return BobRemediationResult(
                patched_code=patched,
                explanation=f"Bob replaced line {line_number} in place with the recommended pattern.",
                applied=True,
                category=category,
            )
        except Exception:
            pass

    return BobRemediationResult(
        patched_code=code,
        explanation="Bob analyzed the issue but could not safely apply an automated refactor without manual review.",
        applied=False,
        category=category,
    )



def apply_bob_remediation(code: str, issue: Dict[str, Any]) -> BobRemediationResult:
    """
    Applies the recommended ML methodology remediation pattern to user code using IBM Bob.
    Attempts live LLM completion when configured, falling back to a deterministic
    high-fidelity refactoring engine.
    """
    category = issue.get("category", "")
    line_number = issue.get("line_number", 0)
    offending_code = issue.get("offending_code", "")
    remediation_code = issue.get("remediation_code", "")
    title = issue.get("title", "")
    message = issue.get("message", "")

    api_key = os.getenv("IBM_CLOUD_API_KEY") or os.getenv("BOB_API_KEY")
    api_url = os.getenv("BOB_API_URL") or os.getenv("WATSONX_URL")

    # 1. Try IBM Bob / watsonx if credentials exist
    if api_key and api_key != "your_api_key_here_DO_NOT_COMMIT":
        user_prompt = f"""Target Python Source Code:
```python
{code}
```

Audit Issue Detected:
- Category: {category}
- Title: {title}
- Flagged Line: {line_number}
- Offending Snippet: {offending_code}
- Issue Details: {message}

Recommended Remediation Pattern:
```python
{remediation_code}
```

Instructions:
Refactor the full script to apply this recommended pattern and fix the methodology flaw.
Return strictly valid JSON with keys "patched_code" and "explanation"."""

        try:
            endpoint = api_url or "https://api.bob.ibm.com/v1/chat/completions"
            headers = {
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            }
            payload = {
                "model": os.getenv("BOB_MODEL_ID", "ibm/granite-3-8b-instruct"),
                "messages": [
                    {"role": "system", "content": BOB_REMEDIATION_SYSTEM_PROMPT},
                    {"role": "user", "content": user_prompt},
                ],
                "temperature": 0.1,
                "max_tokens": 1500,
            }
            with httpx.Client(timeout=8.0) as client:
                resp = client.post(endpoint, json=payload, headers=headers)
                if resp.status_code == 200:
                    data = resp.json()
                    content = ""
                    if "choices" in data and len(data["choices"]) > 0:
                        content = data["choices"][0].get("message", {}).get("content", "")
                    elif "results" in data and len(data["results"]) > 0:
                        content = data["results"][0].get("generated_text", "")

                    if content:
                        clean_str = content.strip()
                        if "```json" in clean_str:
                            clean_str = clean_str.split("```json", 1)[1].split("```", 1)[0].strip()
                        elif "```" in clean_str:
                            clean_str = clean_str.split("```", 1)[1].split("```", 1)[0].strip()

                        match = re.search(r"\{.*\}", clean_str, re.DOTALL)
                        if match:
                            parsed = json.loads(match.group(0))
                            candidate_code = parsed.get("patched_code", "")
                            explanation = parsed.get("explanation", "")
                            if candidate_code:
                                ast.parse(candidate_code)
                                return BobRemediationResult(
                                    patched_code=candidate_code,
                                    explanation=explanation or f"Bob refactored the pipeline to resolve {title}.",
                                    applied=True,
                                    category=category,
                                )
        except Exception:
            pass

    # 2. Resilient Deterministic Fallback Refactorer
    return _deterministic_bob_remediation(code, issue)


# ---------------------------------------------------------------------------
# Data Contract & Service: Bob AI Multi-Line & Block Explainer
# ---------------------------------------------------------------------------

class BlockExplanation(BaseModel):
    start_line: int
    end_line: int
    block_type: str
    intent_summary: str
    detailed_explanation: str
    teammate_logic_note: str
    variables_involved: List[str] = Field(default_factory=list)
    safe_to_extend: bool = True
    continuation_tip: Optional[str] = None


BOB_BLOCK_SYSTEM_PROMPT = """You are an expert software engineer and AI pair programmer in TraceLens.
The user has selected a multi-line block of Python code (e.g. for loop, while loop, if condition, function, or custom block)
inherited from a teammate. Explain the holistic intent, design, data mutations, and safe extension guidance for this block.

Output strictly valid JSON with keys:
{
  "intent_summary": "1-2 sentence high-level summary of what this entire block achieves",
  "detailed_explanation": "2-3 sentence mechanical breakdown of loop/branch flow and data mutations",
  "teammate_logic_note": "Explanation of teammate design pattern, rationale, or invariant in this block",
  "variables_involved": ["list", "of", "variables"],
  "safe_to_extend": true,
  "continuation_tip": "Concrete advice for where to safely add or hook new logic relative to this block"
}"""


def generate_fallback_block_explanation(
    code: str,
    start_line: int,
    end_line: int,
    block_type: Optional[str] = None,
    all_variables: Optional[Dict[str, Any]] = None,
) -> BlockExplanation:
    lines = code.splitlines()
    selected_lines = lines[max(0, start_line - 1) : min(len(lines), end_line)]
    selected_code = "\n".join(selected_lines).strip()

    vars_found = []
    try:
        tree = ast.parse(selected_code)
        for node in ast.walk(tree):
            if isinstance(node, ast.Name):
                if node.id not in ("print", "len", "range", "str", "int", "float", "list", "dict", "True", "False", "None"):
                    if node.id not in vars_found:
                        vars_found.append(node.id)
    except Exception:
        try:
            tree = ast.parse("def _dummy():\n" + "\n".join("    " + l for l in selected_lines))
            for node in ast.walk(tree):
                if isinstance(node, ast.Name):
                    if node.id not in ("_dummy", "print", "len", "range", "str", "int", "float", "list", "dict", "True", "False", "None"):
                        if node.id not in vars_found:
                            vars_found.append(node.id)
        except Exception:
            pass

    first_line = selected_lines[0].strip() if selected_lines else ""
    detected_type = block_type
    if not detected_type or detected_type == "custom":
        if first_line.startswith("for "):
            detected_type = "for"
        elif first_line.startswith("while "):
            detected_type = "while"
        elif first_line.startswith("if "):
            detected_type = "if"
        elif first_line.startswith("def "):
            detected_type = "function"
        elif first_line.startswith("try:"):
            detected_type = "try"
        elif first_line.startswith("with "):
            detected_type = "with"
        elif first_line.startswith("class "):
            detected_type = "class"
        else:
            detected_type = "block"

    vars_preview = ", ".join(f"`{v}`" for v in vars_found[:4]) if vars_found else "local registers"

    if detected_type == "for":
        intent = f"Iterates sequentially to process and transform items across lines {start_line}–{end_line}."
        detailed = f"Executes the loop body for each record, updating accumulators ({vars_preview}) and filtering invalid values."
        note = "Teammate used a standard for-loop to iterate without mutating the source sequence."
        tip = f"Safe to inject custom filtering inside the loop body or aggregation logic immediately after line {end_line}."
    elif detected_type == "while":
        intent = f"Continues iterating while boundary conditions remain valid across lines {start_line}–{end_line}."
        detailed = f"Repeatedly checks guard conditions, mutating {vars_preview} until convergence or termination."
        note = "Teammate structured this as a while-loop to handle dynamic step limits without fixed collections."
        tip = f"Ensure loop variants decrease monotonically to prevent non-terminating loops."
    elif detected_type == "if":
        intent = f"Conditional branching logic evaluating predicates and filtering records across lines {start_line}–{end_line}."
        detailed = f"Guards execution based on evaluated expressions involving {vars_preview}."
        note = "Defensive programming pattern to bypass corrupted or empty records before downstream transformation."
        tip = f"Add new conditions as additional `elif` branches or wrap with additional validation checks."
    elif detected_type == "function":
        intent = f"Encapsulated function component reusable across the pipeline (lines {start_line}–{end_line})."
        detailed = f"Receives parameters and computes results, managing local scope variables {vars_preview}."
        note = "Teammate abstracted this routine to promote reusability and isolate scope."
        tip = f"Preserve function signature and return contracts for existing downstream callers."
    elif detected_type == "try":
        intent = f"Exception-handling boundary protecting against runtime errors (lines {start_line}–{end_line})."
        detailed = "Safely wraps risky operations, providing a deterministic recovery path."
        note = "Ensures pipeline resilience by intercepting errors without crashing the process."
        tip = f"Catch specific exception types rather than bare `except:` to avoid masking critical bugs."
    elif detected_type == "with":
        intent = f"Context manager block managing resource acquisition and deterministic cleanup (lines {start_line}–{end_line})."
        detailed = f"Ensures resources used by {vars_preview} are safely released even if exceptions occur."
        note = "Follows Python RAII pattern to prevent memory leaks and unclosed handles."
        tip = f"Perform all resource-dependent operations strictly inside the with-block."
    else:
        intent = f"Sequential pipeline execution block operating on {vars_preview} (lines {start_line}–{end_line})."
        detailed = f"Transforms state across {len(selected_lines)} continuous lines, mutating local variables in memory."
        note = "Structured sequentially to prepare structured inputs for subsequent processing stages."
        tip = f"Safe to extend after line {end_line} once all intermediate structures are fully materialized."

    return BlockExplanation(
        start_line=start_line,
        end_line=end_line,
        block_type=detected_type,
        intent_summary=intent,
        detailed_explanation=detailed,
        teammate_logic_note=note,
        variables_involved=vars_found,
        safe_to_extend=True,
        continuation_tip=tip,
    )


def explain_block_in_context(
    code: str,
    start_line: int,
    end_line: int,
    block_type: Optional[str] = None,
    selected_code: Optional[str] = None,
    all_variables: Optional[Dict[str, Any]] = None,
    filename: str = "<tracelens_user_code>",
) -> BlockExplanation:
    """
    Explains a multi-line code block using IBM Bob / watsonx or deterministic fallback.
    """
    lines = code.splitlines()
    snippet = selected_code or "\n".join(lines[max(0, start_line - 1) : min(len(lines), end_line)])

    api_key = os.getenv("IBM_CLOUD_API_KEY") or os.getenv("BOB_API_KEY")
    api_url = os.getenv("BOB_API_URL") or os.getenv("WATSONX_URL")

    if api_key and api_key != "your_api_key_here_DO_NOT_COMMIT":
        user_prompt = f"""Target Script: {filename}
Selected Lines: {start_line} through {end_line} ({block_type or 'code block'})

Selected Code Block:
```python
{snippet}
```

Instructions:
Explain this multi-line block strictly matching the JSON schema."""

        try:
            endpoint = api_url or "https://api.bob.ibm.com/v1/chat/completions"
            headers = {
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            }
            payload = {
                "model": os.getenv("BOB_MODEL_ID", "ibm/granite-3-8b-instruct"),
                "messages": [
                    {"role": "system", "content": BOB_BLOCK_SYSTEM_PROMPT},
                    {"role": "user", "content": user_prompt},
                ],
                "temperature": 0.2,
                "max_tokens": 800,
            }
            with httpx.Client(timeout=8.0) as client:
                resp = client.post(endpoint, json=payload, headers=headers)
                if resp.status_code == 200:
                    data = resp.json()
                    content = ""
                    if "choices" in data and len(data["choices"]) > 0:
                        content = data["choices"][0].get("message", {}).get("content", "")
                    elif "results" in data and len(data["results"]) > 0:
                        content = data["results"][0].get("generated_text", "")

                    if content:
                        clean_str = content.strip()
                        if "```json" in clean_str:
                            clean_str = clean_str.split("```json", 1)[1].split("```", 1)[0].strip()
                        elif "```" in clean_str:
                            clean_str = clean_str.split("```", 1)[1].split("```", 1)[0].strip()

                        match = re.search(r"\{.*\}", clean_str, re.DOTALL)
                        if match:
                            parsed = json.loads(match.group(0))
                            return BlockExplanation(
                                start_line=start_line,
                                end_line=end_line,
                                block_type=block_type or parsed.get("block_type", "block"),
                                intent_summary=str(parsed.get("intent_summary", "")),
                                detailed_explanation=str(parsed.get("detailed_explanation", "")),
                                teammate_logic_note=str(parsed.get("teammate_logic_note", "")),
                                variables_involved=list(parsed.get("variables_involved", [])),
                                safe_to_extend=bool(parsed.get("safe_to_extend", True)),
                                continuation_tip=parsed.get("continuation_tip"),
                            )
        except Exception:
            pass

    return generate_fallback_block_explanation(
        code=code,
        start_line=start_line,
        end_line=end_line,
        block_type=block_type,
        all_variables=all_variables,
    )


