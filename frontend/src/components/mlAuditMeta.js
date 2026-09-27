/**
 * mlAuditMeta.js — Shared ModelLens audit presentation metadata.
 *
 * Kept separate from the components so severity colours, ordering, and hazard
 * stripe fills have a single source of truth across MLAuditBanner,
 * MLRemediationPanel, and CodeViewer. Also keeps those files component-only so
 * Vite fast refresh works (see the `only-export-components` oxlint rule).
 */

// Severity ordering — highest first.
export const SEVERITY_ORDER = ['critical', 'warning', 'info'];

export const SEVERITY_META = {
  critical: {
    label: 'Critical',
    chip: 'bg-red-500/20 text-red-200 border-red-400/50',
    dot: 'bg-red-400',
    text: 'text-red-300',
    border: 'border-red-500/40',
  },
  warning: {
    label: 'Warning',
    chip: 'bg-amber-500/20 text-amber-200 border-amber-400/50',
    dot: 'bg-amber-400',
    text: 'text-amber-300',
    border: 'border-amber-500/40',
  },
  info: {
    label: 'Info',
    chip: 'bg-sky-500/20 text-sky-200 border-sky-400/50',
    dot: 'bg-sky-400',
    text: 'text-sky-300',
    border: 'border-sky-500/40',
  },
};

export const CATEGORY_LABELS = {
  data_leakage: 'Data Leakage',
  class_imbalance: 'Class Imbalance',
  preprocessing_mismatch: 'Preprocessing Mismatch',
  metric_mismatch: 'Metric Mismatch',
};

// Hazard stripe fill per severity — diagonal hazard stripes.
export const HAZARD_FILL = {
  critical: 'repeating-linear-gradient(45deg, #f87171 0px, #f87171 3px, #7f1d1d 3px, #7f1d1d 7px)',
  warning: 'repeating-linear-gradient(45deg, #fbbf24 0px, #fbbf24 3px, #78350f 3px, #78350f 7px)',
  info: 'repeating-linear-gradient(45deg, #38bdf8 0px, #38bdf8 3px, #0c4a6e 3px, #0c4a6e 7px)',
};

// Row tint per severity, applied behind the active/skipped line states.
export const HAZARD_ROW_TINT = {
  critical: 'bg-red-950/25 border-l-2 border-red-500/60',
  warning: 'bg-amber-950/20 border-l-2 border-amber-500/50',
  info: 'bg-sky-950/20 border-l-2 border-sky-500/50',
};

const SEVERITY_RANK = { critical: 3, warning: 2, info: 1 };

/**
 * Normalise an arbitrary severity string to a known key.
 * @param {string} severity
 * @returns {string} one of SEVERITY_ORDER
 */
export function normalizeSeverity(severity) {
  return SEVERITY_META[severity] ? severity : 'info';
}

/**
 * Highest-severity-wins for a set of issues on one line.
 * @param {object[]} issues
 * @returns {string|null} severity key, or null for an empty list
 */
export function worstSeverity(issues) {
  let best = null;
  for (const issue of issues) {
    const rank = SEVERITY_RANK[issue.severity] ?? 0;
    if (!best || rank > (SEVERITY_RANK[best] ?? 0)) best = issue.severity;
  }
  return best;
}

/**
 * Group issues by severity, preserving SEVERITY_ORDER and dropping empty groups.
 * @param {object[]} issues
 * @returns {{severity: string, issues: object[]}[]}
 */
export function groupBySeverity(issues) {
  const buckets = new Map(SEVERITY_ORDER.map((s) => [s, []]));
  for (const issue of issues) {
    buckets.get(normalizeSeverity(issue.severity)).push(issue);
  }
  return SEVERITY_ORDER.map((severity) => ({
    severity,
    issues: buckets.get(severity),
  })).filter((group) => group.issues.length > 0);
}
