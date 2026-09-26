import React from 'react';

export default function BranchVisualizer({ currentStep }) {
  const branchContext = currentStep?.branch_context;

  if (!branchContext) {
    return (
      <div className="bg-surface-container-low rounded-lg p-space-md border border-surface-variant/30 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-space-xs text-outline">
          <span className="material-symbols-outlined text-[18px]">alt_route</span>
          <span className="font-headline-sm text-headline-sm">Branch Decision Evaluator</span>
        </div>
        <span className="text-outline font-label-xs text-label-xs font-mono">
          Sequential execution (No active branch condition on Line {currentStep?.line_number || '-'})
        </span>
      </div>
    );
  }

  const {
    condition_code,
    evaluated_truth,
    taken_line,
    skipped_range,
    reason
  } = branchContext;

  return (
    <div className={`rounded-lg p-space-md border shadow-md flex flex-col gap-space-xs transition-all ${
      evaluated_truth 
        ? 'bg-secondary-container/10 border-secondary/40' 
        : 'bg-error-container/10 border-error/40'
    }`}>
      {/* Header */}
      <div className="flex items-center justify-between border-b border-surface-variant/20 pb-2">
        <div className="flex items-center gap-space-xs">
          <span className={`material-symbols-outlined text-[18px] ${
            evaluated_truth ? 'text-secondary' : 'text-error'
          }`}>
            alt_route
          </span>
          <h3 className="font-headline-sm text-headline-sm text-on-surface">
            Branch Decision Evaluator
          </h3>
          <span className="font-code-sm text-code-sm text-outline font-mono">
            `Line {branchContext.header_line}`
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <span className={`px-2 py-0.5 rounded font-label-xs text-label-xs font-mono font-bold flex items-center gap-1 ${
            evaluated_truth
              ? 'bg-secondary text-on-secondary shadow-sm'
              : 'bg-error text-on-error shadow-sm'
          }`}>
            <span className="material-symbols-outlined text-[13px]">
              {evaluated_truth ? 'check_circle' : 'cancel'}
            </span>
            {evaluated_truth ? 'TRUE / BRANCH TAKEN' : 'FALSE / BRANCH SKIPPED'}
          </span>
        </div>
      </div>

      {/* Condition & Expression Breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-space-sm items-center bg-surface-container-lowest p-space-sm rounded border border-surface-variant/30 font-mono">
        <div className="md:col-span-6 flex flex-col gap-0.5">
          <span className="text-[10px] text-outline uppercase tracking-wider">
            AST CONDITIONAL EXPRESSION
          </span>
          <div className="font-code-md text-code-md text-primary bg-surface-container px-2 py-1 rounded border border-outline-variant/30">
            {condition_code}
          </div>
        </div>

        <div className="md:col-span-6 flex flex-col gap-0.5">
          <span className="text-[10px] text-outline uppercase tracking-wider">
            DETERMINISTIC EVALUATION OUTCOME
          </span>
          <div className="font-code-sm text-code-sm text-on-surface bg-surface-container px-2 py-1 rounded border border-outline-variant/30">
            {reason}
          </div>
        </div>
      </div>

      {/* Execution Path Guidance */}
      <div className="flex items-center justify-between text-body-sm font-label-xs text-label-xs pt-1">
        <div className="flex items-center gap-1 text-on-surface">
          <span className="material-symbols-outlined text-[14px] text-primary">arrow_forward</span>
          <span>Flow enters: <strong className="text-primary font-mono font-semibold">Line {taken_line}</strong></span>
        </div>

        {skipped_range && (
          <div className="flex items-center gap-1 text-error font-mono">
            <span className="material-symbols-outlined text-[14px]">block</span>
            <span>Bypassed lines: <strong className="underline">Lines {skipped_range[0]}..{skipped_range[1]}</strong></span>
          </div>
        )}
      </div>
    </div>
  );
}
