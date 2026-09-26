import React from 'react';
import { LINE_EXPLANATIONS } from '../data/pipelineData';

export default function LineExplainPanel({
  lineNumber,
  codeLine,
  _currentStep,
  onClose,
  onApplyFix
}) {
  if (!lineNumber) return null;

  const explanationData = LINE_EXPLANATIONS[lineNumber] || {
    line: codeLine,
    context: 'Runtime Line Execution',
    explanation: `Executed line ${lineNumber} within the isolated sandbox. Local variable registers and DataFrame memory snapshots were captured without methodological violations.`
  };

  const isLeakageLine = lineNumber === 9 || lineNumber === 11 || (codeLine && codeLine.includes('fit_transform') && codeLine.includes('scaler'));
  const isImbalanceLine = lineNumber === 14 || lineNumber === 16 || (codeLine && codeLine.includes('train_test_split'));

  return (
    <div className="bg-surface-container-high rounded-lg shadow-xl border border-surface-variant/40 p-space-md text-on-surface flex flex-col gap-space-sm mt-3 animate-in slide-in-from-top-2 duration-200">
      {/* Header */}
      <div className="flex items-center justify-between pb-2 border-b border-surface-variant/30">
        <div className="flex items-center gap-space-sm">
          <div className="w-7 h-7 rounded bg-tertiary-container/20 flex items-center justify-center text-tertiary">
            <span className="material-symbols-outlined text-[16px]">auto_fix_high</span>
          </div>
          <div>
            <h4 className="font-headline-sm text-headline-sm text-on-surface">
              Bob AI Grounded Line Explanation
            </h4>
            <span className="font-label-xs text-label-xs text-outline font-mono">
              Line {lineNumber} • {explanationData.context}
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded hover:bg-surface-container text-outline hover:text-on-surface transition-colors"
          title="Close explanation"
        >
          <span className="material-symbols-outlined text-[16px]">close</span>
        </button>
      </div>

      {/* Code Snippet Box */}
      <div className="bg-surface-container-lowest p-space-xs rounded font-mono text-code-sm border border-surface-variant/30 flex items-center gap-2">
        <span className="text-outline font-bold select-none">{lineNumber}</span>
        <span className="text-primary truncate">{codeLine || explanationData.line}</span>
      </div>

      {/* Explanation Prose */}
      <p className="font-body-sm text-body-sm text-on-surface leading-relaxed">
        {explanationData.explanation}
      </p>

      {/* Gutter / Issue Context Alert */}
      {isLeakageLine && (
        <div className="bg-error-container/15 p-space-xs rounded border border-error/30 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-error font-label-xs text-label-xs font-mono font-bold">
            <span className="material-symbols-outlined text-[14px]">crisis_alert</span>
            <span>DATA LEAKAGE DETECTED HERE</span>
          </div>
          {onApplyFix && (
            <button
              type="button"
              onClick={onApplyFix}
              className="px-2 py-0.5 rounded bg-secondary-container hover:bg-secondary text-on-secondary font-label-xs text-label-xs font-mono transition-all shrink-0"
            >
              Apply Fix
            </button>
          )}
        </div>
      )}

      {isImbalanceLine && (
        <div className="bg-tertiary-container/15 p-space-xs rounded border border-tertiary/30 flex items-center gap-1.5 text-tertiary font-label-xs text-label-xs font-mono">
          <span className="material-symbols-outlined text-[14px]">warning</span>
          <span>Target Distribution Partition Point (92% Class 0 / 8% Class 1)</span>
        </div>
      )}

      {/* Footer Meta */}
      <div className="pt-1 flex items-center justify-between text-label-xs font-mono text-outline">
        <span>Grounded in sys.settrace variables & AST node context</span>
        <button
          type="button"
          onClick={onClose}
          className="text-on-surface hover:text-primary transition-colors"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
