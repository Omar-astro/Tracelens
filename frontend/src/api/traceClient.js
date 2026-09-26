/**
 * traceClient.js — Stage 6: Frontend↔Backend API client.
 *
 * Exports a single function: postTrace(code, mode)
 *   - Calls POST {API_BASE_URL}/api/trace
 *   - Returns parsed JSON (TraceStep[]) on success
 *   - Throws a TraceApiError (with .status and .message) on non-2xx or network failure
 */

// Vite injects VITE_* env vars at build time.
// In dev, falls back to localhost:8000.  In prod, set VITE_API_BASE_URL to the
// deployed Railway/Render backend URL.
const API_BASE_URL =
  import.meta.env?.VITE_API_BASE_URL?.replace(/\/$/, "") || "http://localhost:8000";

/**
 * Typed error thrown by postTrace on non-2xx HTTP responses or network failures.
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
 * Send code to the TraceLens backend for execution tracing.
 *
 * @param {string} code       Python source code to trace
 * @param {"logic_lens"|"model_lens"} [mode="logic_lens"]  Analysis mode
 * @param {number|undefined} [maxSteps]  Optional step cap (default handled by backend)
 * @returns {Promise<import("../types").TraceStep[]>}  Array of TraceStep objects
 * @throws {TraceApiError}
 */
export async function postTrace(code, mode = "logic_lens", maxSteps = undefined) {
  const body = {
    code,
    mode,
    ...(maxSteps !== undefined && { max_steps: maxSteps }),
  };

  let response;
  try {
    response = await fetch(`${API_BASE_URL}/api/trace`, {
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

  const data = await response.json();
  // Backend always returns { steps: [...], safe_insertion_points: [...] }
  // Return the full response object so callers can access both fields.
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

  const body = {
    step_id: stepContext.step_id,
    line_number: stepContext.line_number,
    code_line: stepContext.code_line ?? "",
    filename: stepContext.filename || "<tracelens_user_code>",
    variable_deltas: stepContext.variable_deltas ?? {},
    all_variables: stepContext.all_variables ?? {},
  };

  let response;
  try {
    response = await fetch(`${API_BASE_URL}/api/explain-step`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new TraceApiError(
      `Network error: could not reach the TraceLens backend (${API_BASE_URL}). ` +
      "Make sure the backend is running.",
      null
    );
  }

  if (!response.ok) {
    let detail = `Request failed with status ${response.status}`;
    try {
      const errorBody = await response.json();
      if (errorBody?.detail) {
        detail = String(errorBody.detail);
      }
    } catch {
      // ignore JSON parse failure
    }
    throw new TraceApiError(detail, response.status);
  }

  return await response.json();
}
