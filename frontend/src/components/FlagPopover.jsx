import React from 'react';

export default function FlagPopover({
  issue,
  lineNumber,
  onExplainWithBob,
  onOpenRemediationDiff,
  onDismiss
}) {
  if (!issue) return null;

  const isLeakage = issue.type === 'data_leakage';

  return (
    <div className="absolute left-12 top-full mt-1 z-30 w-96 bg-surface-container-high rounded-lg shadow-2xl border border-error/40 p-3 text-on-surface animate-in fade-in zoom-in-95">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 mb-1.5 pb-1 border-b border-surface-variant/30">
        <span className="px-1.5 py-0.5 rounded bg-error-container text-on-error-container font-label-xs text-[10px] font-bold font-mono flex items-center gap-1">
          <span className="material-symbols-outlined text-[12px]">crisis_alert</span>
          Line {lineNumber}: {issue.title || 'HIGH SEVERITY: DATA LEAKAGE DETECTED'}
        </span>
        <button
          type="button"
          onClick={onDismiss}
          className="text-outline hover:text-on-surface transition-colors p-0.5 rounded hover:bg-surface-container"
        >
          <span className="material-symbols-outlined text-[14px]">close</span>
        </button>
      </div>

      {/* Assertion ID */}
      <div className="font-code-sm text-[11px] text-outline font-mono mb-1">
        Assertion #{issue.assertionId || 'AL-09: GLOBAL_MOMENT_POLLUTION'}
      </div>

      {/* Description */}
      <p className="font-body-sm text-body-sm text-on-surface leading-snug mb-2.5">
        {issue.message}
      </p>

      {/* Action Buttons */}
      <div className="flex items-center gap-2 pt-1 border-t border-surface-variant/20">
        <button
          type="button"
          onClick={onExplainWithBob}
          className="flex-1 flex items-center justify-center gap-1 bg-tertiary-container hover:bg-tertiary text-on-tertiary-container transition-colors px-2 py-1 rounded font-label-md text-label-md shadow-sm font-mono"
        >
          <span className="material-symbols-outlined text-[14px]">auto_fix_high</span>
          <span>Explain with Bob AI</span>
        </button>

        {isLeakage && (
          <button
            type="button"
            onClick={onOpenRemediationDiff}
            className="flex items-center gap-1 bg-surface-container hover:bg-surface-variant text-on-surface transition-colors px-2 py-1 rounded font-label-md text-label-md border border-outline-variant/40 font-mono"
          >
            <span className="material-symbols-outlined text-[14px]">difference</span>
            <span>Diff</span>
          </button>
        )}
      </div>
    </div>
  );
}
