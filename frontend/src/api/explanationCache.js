/**
 * explanationCache.js — In-memory caching for IBM Bob step explanations (Stage 12).
 *
 * Keyed by step_id so that scrubbing back and forth does not trigger redundant API calls.
 */
export const explanationCache = new Map();
export const pendingRequests = new Map();

/**
 * Clear the step explanation cache (e.g. when tracing a new session).
 */
export function clearExplanationCache() {
  explanationCache.clear();
  pendingRequests.clear();
}
