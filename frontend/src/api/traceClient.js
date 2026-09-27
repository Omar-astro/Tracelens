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

/**
 * Upload a dataset file (.csv, .parquet, .json, etc.) up to 100MB.
 *
 * @param {File} file
 * @returns {Promise<{filename: string, size_bytes: number, size_mb: number, expires_in_minutes: number, message: string}>}
 */
export async function uploadDataset(file) {
  if (!file) {
    throw new TraceApiError("No file selected for upload.", 400);
  }

  const MAX_BYTES = 100 * 1024 * 1024; // 100 MB
  if (file.size > MAX_BYTES) {
    throw new TraceApiError(
      `File size (${(file.size / (1024 * 1024)).toFixed(1)} MB) exceeds 100 MB limit.`,
      413
    );
  }

  const formData = new FormData();
  formData.append("file", file);

  let response;
  try {
    response = await fetch(`${API_BASE_URL}/api/upload-dataset`, {
      method: "POST",
      body: formData,
    });
  } catch {
    throw new TraceApiError(
      `Network error: could not reach backend at ${API_BASE_URL}.`,
      null
    );
  }

  if (!response.ok) {
    let detail = `Upload failed with status ${response.status}`;
    try {
      const errJson = await response.json();
      if (errJson?.detail) detail = String(errJson.detail);
    } catch {
      // ignore
    }
    throw new TraceApiError(detail, response.status);
  }

  return await response.json();
}

/**
 * Retrieve active uploaded datasets and their remaining lifetime.
 */
export async function getDatasets() {
  try {
    const res = await fetch(`${API_BASE_URL}/api/datasets`);
    if (!res.ok) return { datasets: [] };
    return await res.json();
  } catch {
    return { datasets: [] };
  }
}

/**
 * Delete an uploaded dataset by filename.
 */
export async function deleteDataset(filename) {
  try {
    const res = await fetch(`${API_BASE_URL}/api/datasets/${encodeURIComponent(filename)}`, {
      method: "DELETE",
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Clear all uploaded datasets.
 */
export async function clearDatasets() {
  try {
    const res = await fetch(`${API_BASE_URL}/api/datasets/clear`, {
      method: "POST",
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Request Bob AI to refactor code and apply an ML methodology remediation pattern.
 *
 * Calls POST /api/bob-apply-remediation.
 * Returns { patched_code: string, explanation: string, applied: boolean, category: string }.
 *
 * @param {string} code Current Python source code
 * @param {object} issue The ModelLens MLAuditIssue object
 * @returns {Promise<{patched_code: string, explanation: string, applied: boolean, category: string}>}
 */
export async function applyBobRemediation(code, issue) {
  if (typeof code !== "string" || !code.trim()) {
    throw new TraceApiError("Invalid code provided for Bob remediation.", 400);
  }
  return await postJson("/api/bob-apply-remediation", {
    code,
    issue: issue || {},
  });
}

/**
 * Request an AI-powered explanation for a multi-line code block (or arbitrary selected lines).
 * Calls POST /api/explain-block.
 *
 * @param {object} params
 * @param {string} params.code
 * @param {number} params.start_line
 * @param {number} params.end_line
 * @param {string} [params.block_type]
 * @param {string} [params.selected_code]
 * @param {object} [params.all_variables]
 * @param {string} [params.filename]
 * @returns {Promise<any>} BlockExplanation
 */
export async function explainBlock({
  code,
  start_line,
  end_line,
  block_type = "block",
  selected_code = null,
  all_variables = {},
  filename = "<tracelens_user_code>",
}) {
  if (typeof code !== "string" || !start_line || !end_line) {
    throw new TraceApiError("Invalid parameters provided to explainBlock", 400);
  }
  return await postJson("/api/explain-block", {
    code,
    start_line,
    end_line,
    block_type,
    selected_code,
    all_variables,
    filename,
  });
}

/**
 * Retrieve the current dependency installation status from the backend.
 * @returns {Promise<{is_installing: boolean, packages: string[], current_package: string|null, completed: string[], progress_pct: number, status_message: string}>}
 */
export async function getInstallStatus() {
  try {
    const res = await fetch(`${API_BASE_URL}/api/install-status`);
    if (!res.ok) return { is_installing: false, progress_pct: 0, packages: [], status_message: "" };
    return await res.json();
  } catch {
    return { is_installing: false, progress_pct: 0, packages: [], status_message: "" };
  }
}

/**
 * Check which imported libraries in the code are not installed in the backend environment.
 * @param {string} code
 * @returns {Promise<{missing: string[], count: number}>}
 */
export async function checkDependencies(code) {
  try {
    return await postJson("/api/check-dependencies", { code });
  } catch {
    return { missing: [], count: 0 };
  }
}
