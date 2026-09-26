/**
 * traceClient.js — Stage 6: Frontend↔Backend API client.
 * Stage 14: adds the Appendix B.2 handoff summary call.
 *
 * Exports:
 *   postTrace(code, mode, maxSteps)   -> POST /api/trace
 *   explainStep(stepContext)          -> POST /api/explain-step
 *   postHandoffSummary({ ... })       -> POST /api/handoff-summary
 *
 * All three throw a TraceApiError (with .status and .message) on non-2xx or
 * network failure.
 */

// Vite injects VITE_* env vars at build time.
// In dev, falls back to localhost:8000.  In prod, set VITE_API_BASE_URL to the
// deployed Railway/Render backend URL.
const API_BASE_URL =
  import.meta.env?.VITE_API_BASE_URL?.replace(/\/$/, "") || "http://localhost:8000";

/**
 * Typed error thrown by the API helpers on non-2xx HTTP responses or network failures.
 */
export class TraceApiError extends Error {
  /**
   * @param {string} message   Human-readable description
   * @param {number|null} status  HTTP status code, or null for network-level failures
   */
  constructor(message, status = null) {
    super(message);
    this.name = "TraceApiError";
    this.status = status;
  }
}

/**
 * Shared POST helper: JSON in, JSON out, uniform error handling.
 * Keeps the per-endpoint functions below focused on payload shape only.
 *
 * @param {string} path   Path relative to API_BASE_URL, e.g. "/api/trace"
 * @param {object} body   JSON-serializable request body
 * @returns {Promise<any>} Parsed JSON response
 * @throws {TraceApiError}
 */
async function postJson(path, body) {
  let response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    // fetch() itself threw — network down, CORS preflight failure, etc.
    throw new TraceApiError(
      `Network error: could not reach the TraceLens backend (${API_BASE_URL}). ` +
      "Make sure the backend is running.",
      null
    );
  }

  if (!response.ok) {
    // Attempt to extract the FastAPI detail message
    let detail = `Request failed with status ${response.status}`;
    try {
      const errorBody = await response.json();
      if (errorBody?.detail) {
        detail = String(errorBody.detail);
      }
    } catch {
      // ignore JSON parse failure — keep the generic message
    }
    throw new TraceApiError(detail, response.status);
  }

  return await response.json();
}

/**
 * Send code to the TraceLens backend for execution tracing.
 *
 * @param {string} code       Python source code to trace
 * @param {"logic_lens"|"model_lens"} [mode="logic_lens"]  Analysis mode
 * @param {number|undefined} [maxSteps]  Optional step cap (default handled by backend)
 * @returns {Promise<{steps: object[], safe_insertion_points: object[], ml_audit_issues?: object[]}>}
 *          `ml_audit_issues` is present only in "model_lens" mode.
 * @throws {TraceApiError}
 */
export async function postTrace(code, mode = "logic_lens", maxSteps = undefined) {
  const body = {
    code,
    mode,
    ...(maxSteps !== undefined && { max_steps: maxSteps }),
  };

  const data = await postJson("/api/trace", body);

  // Backend returns { steps, safe_insertion_points, ml_audit_issues? }.
  // Return the full response object so callers can access every field.
  if (data && Array.isArray(data.steps)) {
    return data;
  }
  // Fallback: bare array (legacy / unexpected shape)
  if (Array.isArray(data)) {
    return { steps: data, safe_insertion_points: [] };
  }
  return data;
}

/**
 * Request an AI-powered contextual line intent explanation for a single trace step (Stage 12).
 *
 * Calls POST {API_BASE_URL}/api/explain-step with the current step's execution context.
 * Returns parsed StepExplanation JSON per Appendix A.
 *
 * @param {object} stepContext  The current step context
 * @param {number} stepContext.step_id
 * @param {number} stepContext.line_number
 * @param {string} stepContext.code_line
 * @param {string} [stepContext.filename]
 * @param {object} [stepContext.variable_deltas]
 * @param {object} [stepContext.all_variables]
 * @returns {Promise<import("../types").StepExplanation>}
 * @throws {TraceApiError}
 */
export async function explainStep(stepContext) {
  if (!stepContext || typeof stepContext.step_id === "undefined") {
    throw new TraceApiError("Invalid step context provided to explainStep", 400);
  }

  return await postJson("/api/explain-step", {
    step_id: stepContext.step_id,
    line_number: stepContext.line_number,
    code_line: stepContext.code_line ?? "",
    filename: stepContext.filename || "<tracelens_user_code>",
    variable_deltas: stepContext.variable_deltas ?? {},
    all_variables: stepContext.all_variables ?? {},
  });
}

/**
 * Request the end-of-trace teammate handoff summary (Stage 14, Appendix B.2).
 *
 * Calls POST {API_BASE_URL}/api/handoff-summary once the trace is complete.
 * Returns a HandoffSummary per Appendix A: overall_purpose, key_data_structures,
 * safe_continuation_strategy, cautions_for_teammate.
 *
 * @param {object} params
 * @param {string} params.code                      Full traced source
 * @param {object[]} [params.safeInsertionPoints]   Stage 9 safe insertion points
 * @param {object} [params.terminalVariables]       Final frame variables from the last step
 * @returns {Promise<import("../types").HandoffSummary>}
 * @throws {TraceApiError}
 */
export async function postHandoffSummary({ code, safeInsertionPoints = [], terminalVariables = {} } = {}) {
  if (typeof code !== "string" || !code.trim()) {
    throw new TraceApiError("Invalid code provided to postHandoffSummary", 400);
  }

  return await postJson("/api/handoff-summary", {
    code,
    safe_insertion_points: Array.isArray(safeInsertionPoints) ? safeInsertionPoints : [],
    terminal_variables:
      terminalVariables && typeof terminalVariables === "object" ? terminalVariables : {},
  });
}

