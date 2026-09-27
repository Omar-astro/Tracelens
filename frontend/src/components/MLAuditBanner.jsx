import React, { useMemo } from 'react';
import { SEVERITY_META, CATEGORY_LABELS, groupBySeverity } from './mlAuditMeta';

/**
 * MLAuditBanner — Sticky ModelLens Risk Banner.
 *
 * Renders only in "model_lens" mode. Shows the total issue count, a
 * clickable per-severity breakdown that filters the issue list, and a category
 * legend. Provides an emerald all-clear state when the audit found nothing.
 *
 * Purely presentational — it holds no state beyond the active severity filter,
 * which it owns and surfaces upward via onSelectIssue.
 *
 * Severity colours and ordering live in ./mlAuditMeta.js.
 */
export default function MLAuditBanner({ mode = 'logic_lens', issues = [], onSelectIssue }) {
  const [activeSeverity, setActiveSeverity] = React.useState(null);
  // Reset the filter when a different issue set arrives. Adjusting state during
  // render (rather than in an effect) avoids a cascading second render.
  const [seenIssues, setSeenIssues] = React.useState(issues);
  if (seenIssues !== issues) {
    setSeenIssues(issues);
    setActiveSeverity(null);
  }

  const grouped = useMemo(() => groupBySeverity(issues), [issues]);
  const total = issues.length;

  // Never render in LogicLens mode.
  if (mode !== 'model_lens') return null;

  const handleChipClick = (severity) => {
    const next = activeSeverity === severity ? null : severity;
    setActiveSeverity(next);
    const target = next
      ? issues.find((i) => i.severity === severity)
      : issues[0];
    if (target && onSelectIssue) onSelectIssue(target);
  };

  // ── All clear ────────────────────────────────────────────────────────────
  if (total === 0) {
    return (
      <div className="shrink-0 flex items-center gap-3 px-4 py-2 bg-emerald-950/40 border-b border-emerald-500/30">
        <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
        <span className="text-xs font-mono font-semibold text-emerald-300">
          ModelLens Audit
        </span>
        <span className="text-xs text-emerald-200/80">
          No methodology issues detected across the traced execution.
        </span>
      </div>
    );
  }

  const criticalCount = issues.filter((i) => i.severity === 'critical').length;
  const activeGroup = activeSeverity ? grouped.find((g) => g.severity === activeSeverity) : null;

  return (
    <div className="shrink-0 bg-rose-950/40 border-b border-rose-500/30 px-4 py-2">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {/* Hazard glyph + headline */}
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-rose-400 font-bold text-sm leading-none" aria-hidden="true">
            ⚠
          </span>
          <span className="text-xs font-mono font-bold uppercase tracking-wider text-rose-200">
            ModelLens Risk
          </span>
          <span className="px-2 py-0.5 rounded-md bg-rose-500/20 border border-rose-400/50 text-rose-100 text-xs font-mono font-bold">
            {total} issue{total !== 1 ? 's' : ''}
          </span>
        </div>

        {/* Severity chips — click to jump to the first issue of that severity */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {grouped.map(({ severity, issues: bucket }) => {
            const meta = SEVERITY_META[severity];
            const isActive = activeSeverity === severity;
            return (
              <button
                key={severity}
                type="button"
                onClick={() => handleChipClick(severity)}
                title={`${bucket.length} ${meta.label.toLowerCase()} issue(s) — click to show remediation`}
                className={`px-2 py-0.5 rounded-md border text-[11px] font-mono font-semibold transition-all cursor-pointer inline-flex items-center gap-1.5 ${
                  meta.chip
                } ${isActive ? 'ring-1 ring-white/40 scale-105' : 'opacity-80 hover:opacity-100'}`}
                aria-pressed={isActive}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} aria-hidden="true" />
                <span>{meta.label}</span>
                <span className="font-bold">{bucket.length}</span>
              </button>
            );
          })}
        </div>

        {/* Legend */}
        <div className="hidden xl:flex items-center gap-3 text-[10px] font-mono text-slate-400 ml-auto">
          {Object.entries(CATEGORY_LABELS).map(([key, label]) => {
            const count = issues.filter((i) => i.category === key).length;
            if (count === 0) return null;
            return (
              <span key={key} className="inline-flex items-center gap-1">
                <span className="text-slate-500">◈</span>
                {label}
                <span className="text-slate-300 font-bold">{count}</span>
              </span>
            );
          })}
        </div>
      </div>

      {/* Filtered context line */}
      {activeGroup && (
        <div className="mt-1.5 pt-1.5 border-t border-rose-500/20 text-[11px] font-mono text-rose-200/90 flex items-center gap-2">
          <span className={`w-1.5 h-1.5 rounded-full ${SEVERITY_META[activeGroup.severity].dot}`} />
          <span className="font-semibold uppercase tracking-wider">
            {SEVERITY_META[activeGroup.severity].label}
          </span>
          <span className="text-rose-300/80">
            {activeGroup.issues[0]?.title}
            {activeGroup.issues.length > 1 && (
              <span className="text-rose-300/50">
                {' '}
                (+{activeGroup.issues.length - 1} more — remediation panel lists them all)
              </span>
            )}
          </span>
          {criticalCount > 0 && activeGroup.severity !== 'critical' && (
            <span className="ml-auto text-red-300/70">
              {criticalCount} critical issue{criticalCount !== 1 ? 's' : ''} in this trace
            </span>
          )}
        </div>
      )}
    </div>
  );
}
