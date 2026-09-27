import React from 'react';
import confetti from 'canvas-confetti';

/**
 * BobRemediationModal — Stage 14: Bob AI ModelLens Remediation Confirmation & Diff Modal.
 *
 * Displays Bob's AI refactoring of the user's code:
 * - Bob's explanation of the fix
 * - Flagged offending snippet vs Bob's corrected pattern
 * - Actions: "Apply & Re-run Trace" (with confetti) or "Apply to Editor Only"
 */
export default function BobRemediationModal({
  isOpen,
  onClose,
  patchResult,
  issue,
  onApplyAndRetrace,
  onApplyOnly,
}) {
  if (!isOpen || !patchResult) return null;

  const handleApplyAndRetrace = () => {
    try {
      confetti({
        particleCount: 90,
        spread: 80,
        origin: { y: 0.6 },
      });
    } catch {
      // ignore
    }
    onApplyAndRetrace(patchResult.patched_code);
    onClose();
  };

  const handleApplyOnly = () => {
    onApplyOnly(patchResult.patched_code);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-5 py-4 bg-slate-950/70 border-b border-slate-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-400 to-indigo-600 flex items-center justify-center text-slate-950 font-bold shadow-md shadow-cyan-500/20">
              <span className="text-base">⚡</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-slate-100 font-mono">
                  Bob AI — Code Remediation Patch
                </h3>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono uppercase bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 font-semibold">
                  Zero Contamination
                </span>
              </div>
              <p className="text-[11px] text-slate-400 font-mono">
                {issue?.title || 'ModelLens Methodology Refactor'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 text-lg p-1.5 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
            title="Dismiss"
          >
            ✕
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 flex flex-col gap-4 overflow-y-auto min-h-0">
          {/* Bob AI Explanation Card */}
          <div className="p-3.5 rounded-lg bg-cyan-950/30 border border-cyan-500/30 flex items-start gap-3">
            <span className="text-cyan-400 text-base leading-none mt-0.5">🤖</span>
            <div className="flex flex-col gap-1">
              <div className="text-[10px] font-mono uppercase tracking-wider text-cyan-400 font-bold">
                Bob AI Refactor Note
              </div>
              <p className="text-xs text-slate-200 leading-relaxed font-sans">
                {patchResult.explanation}
              </p>
            </div>
          </div>

          {/* Code Diff Overview */}
          <div className="flex flex-col gap-2">
            <span className="text-[11px] font-mono text-slate-400 font-semibold uppercase tracking-wider">
              Proposed Changes
            </span>

            {/* Before (Offending snippet) */}
            {issue?.offending_code && (
              <div className="rounded-lg border border-red-900/50 bg-red-950/20 overflow-hidden">
                <div className="px-3 py-1 bg-red-950/40 border-b border-red-900/40 flex items-center justify-between text-[10px] font-mono text-red-400">
                  <span>- Flagged Pattern (Line {issue.line_number})</span>
                  <span className="text-[9px] uppercase font-bold text-red-300">Hazard</span>
                </div>
                <pre className="p-2.5 text-[11px] font-mono text-red-200 overflow-x-auto whitespace-pre">
                  {issue.offending_code}
                </pre>
              </div>
            )}

            {/* After (Remediated snippet) */}
            {issue?.remediation_code && (
              <div className="rounded-lg border border-emerald-900/50 bg-emerald-950/20 overflow-hidden">
                <div className="px-3 py-1 bg-emerald-950/40 border-b border-emerald-900/40 flex items-center justify-between text-[10px] font-mono text-emerald-400">
                  <span>+ Applied Correct Pattern</span>
                  <span className="text-[9px] uppercase font-bold text-emerald-300">Verified</span>
                </div>
                <pre className="p-2.5 text-[11px] font-mono text-emerald-200 overflow-x-auto whitespace-pre">
                  {issue.remediation_code}
                </pre>
              </div>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-3.5 bg-slate-950/80 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg text-xs font-mono text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors cursor-pointer"
          >
            Cancel
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleApplyOnly}
              className="px-3 py-1.5 rounded-lg text-xs font-mono font-medium text-slate-300 hover:text-slate-100 bg-slate-800 hover:bg-slate-700/80 border border-slate-700/60 transition-colors cursor-pointer"
            >
              Apply to Editor Only
            </button>

            <button
              type="button"
              onClick={handleApplyAndRetrace}
              className="px-4 py-1.5 rounded-lg text-xs font-mono font-bold text-slate-950 bg-gradient-to-r from-cyan-400 via-sky-400 to-indigo-400 hover:from-cyan-300 hover:to-indigo-300 shadow-md shadow-cyan-500/20 flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <span>⚡</span>
              <span>Apply &amp; Re-run Trace</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
