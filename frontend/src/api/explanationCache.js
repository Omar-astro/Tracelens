/**
 * explanationCache.js — In-memory caching with 20-minute TTL for IBM Bob explanations.
 *
 * Keyed by step_id or block_key so that scrubbing back and forth does not trigger redundant API calls.
 * Automatically expires items after 20 minutes, or when explicitly cleared on returning to Intake.
 */

const DEFAULT_TTL_MS = 20 * 60 * 1000; // 20 minutes

export class TTLCache extends Map {
  constructor(ttlMs = DEFAULT_TTL_MS) {
    super();
    this.ttlMs = ttlMs;
    this.timestamps = new Map();
  }

  set(key, value) {
    this.timestamps.set(key, Date.now());
    return super.set(key, value);
  }

  get(key) {
    if (!super.has(key)) return undefined;
    const ts = this.timestamps.get(key) || 0;
    if (Date.now() - ts > this.ttlMs) {
      this.delete(key);
      return undefined;
    }
    return super.get(key);
  }

  has(key) {
    if (!super.has(key)) return false;
    const ts = this.timestamps.get(key) || 0;
    if (Date.now() - ts > this.ttlMs) {
      this.delete(key);
      return false;
    }
    return true;
  }

  delete(key) {
    this.timestamps.delete(key);
    return super.delete(key);
  }

  clear() {
    this.timestamps.clear();
    return super.clear();
  }
}

export const explanationCache = new TTLCache();
export const pendingRequests = new Map();

export const blockExplanationCache = new TTLCache();
export const pendingBlockRequests = new Map();

/**
 * Clear the step explanation cache (e.g. when tracing a new session or returning to Intake).
 */
export function clearExplanationCache() {
  explanationCache.clear();
  pendingRequests.clear();
  blockExplanationCache.clear();
  pendingBlockRequests.clear();
}
