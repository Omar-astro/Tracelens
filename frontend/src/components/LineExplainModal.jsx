import React from 'react';
import { LINE_EXPLANATIONS } from '../data/pipelineData';

export default function LineExplainModal({
  lineNumber,
  codeLine,
  onClose,
  onApplyFix
}) {
  if (!lineNumber) return null;

  const explanationData = LINE_EXPLANATIONS[lineNumber] || {
    line: codeLine,
    context: 'Execution Line',
    explanation: `Executed line ${lineNumber} in sandboxed runtime. Active registers and runtime local variables evaluated without critical methodology assertion failures.`
  };

  const isLeakageLine = lineNumber === 9 || lineNumber === 11 || (codeLine && codeLine.includes('StandardScaler().fit_transform'));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-surface-container-lowest/80 backdrop-blur-sm">
      <div className="w-full max-w-xl bg-surface-container-low rounded-xl shadow-2xl border border-surface-variant/40 overflow-hidden text-on-surface transform transition-all animate-in fade-in zoom-in-95">
        {/* Header */}
        <div className="px-space-lg py-space-md bg-surface-container flex items-center justify-between border-b border-surface-variant/30">
          <div className="flex items-center gap-space-sm">
            <div className="w-8 h-8 rounded-lg bg-tertiary-container/20 flex items-center justify-center text-tertiary">
              <span className="material-symbols-outlined text-[20px]">auto_fix_high</span>
            </div>
            <div>
              <h3 className="font-headline-sm text-headline-sm text-on-surface">Bob AI Contextual Line Explanation</h3>
              <span className="font-label-xs text-label-xs text-outline font-mono">
                Line {lineNumber} • {explanationData.context}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded hover:bg-surface-container-high text-outline hover:text-on-surface transition-colors"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>

        {/* Content */}
        <div className="p-space-lg flex flex-col gap-space-md">
          {/* Code Snippet Box */}
          <div className="bg-surface-container-lowest p-space-sm rounded font-mono text-code-sm border border-surface-variant/30 text-primary">
            <span className="text-outline mr-3 select-none">{lineNumber}</span>
            <span>{codeLine || explanationData.line}</span>
          </div>

          {/* Explanation Text */}
          <div className="flex flex-col gap-1">
            <span className="font-label-xs text-label-xs uppercase tracking-wider text-outline font-mono">
              Grounded Execution Analysis
            </span>
            <p className="font-body-md text-body-md text-on-surface leading-relaxed">
              {explanationData.explanation}
            </p>
          </div>

          {/* Special Data Leakage Callout */}
          {isLeakageLine && (
            <div className="bg-error-container/15 p-space-sm rounded border border-error/30 flex flex-col gap-2">
              <div className="flex items-center gap-1.5 text-error font-label-md font-mono font-bold">
                <span className="material-symbols-outlined text-[16px]">crisis_alert</span>
                <span>METHODOLOGY FLAW IDENTIFIED</span>
              </div>
              <p className="font-body-sm text-body-sm text-on-surface">
                Standard assistants like generic Copilot only verify syntax correctness (which passes). TraceLens detects that the mathematical operation introduces test contamination before split.
              </p>
              {onApplyFix && (
                <button
                  type="button"
                  onClick={() => {
                    onApplyFix();
                    onClose();
                  }}
                  className="mt-1 self-start px-3 py-1 rounded bg-secondary-container hover:bg-secondary text-on-secondary font-label-md text-label-md transition-all shadow-sm flex items-center gap-1"
                >
                  <span className="material-symbols-outlined text-[15px]">task_alt</span>
                  <span>Apply Suggested Fix Now</span>
                </button>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-space-lg py-space-sm bg-surface-container flex items-center justify-between border-t border-surface-variant/30 text-label-xs font-mono text-outline">
          <span>Grounded in AST + sys.settrace runtime context</span>
          <button
            type="button"
            onClick={onClose}
            className="px-space-md py-1 rounded bg-surface-container-high hover:bg-surface-variant text-on-surface transition-colors"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}
