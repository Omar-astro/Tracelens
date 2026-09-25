import React, { useState } from 'react';
import confetti from 'canvas-confetti';

export default function BobAiAuditPanel({
  hasLeakage,
  onApplyFix,
  onRerunSandbox,
  isRemediated
}) {
  const [isApplying, setIsApplying] = useState(false);
  const [isRerunning, setIsRerunning] = useState(false);

  const handleApplyFix = () => {
    setIsApplying(true);
    try {
      confetti({
        particleCount: 80,
        spread: 70,
        origin: { y: 0.6 }
      });
    } catch {
      // ignore
    }

    setTimeout(() => {
      onApplyFix();
      setIsApplying(false);
    }, 800);
  };

  const handleRerun = () => {
    setIsRerunning(true);
    setTimeout(() => {
      onRerunSandbox();
      setIsRerunning(false);
    }, 1200);
  };

  return (
    <div
      id="remediation-diff-card"
      className="bg-surface-container-low rounded-lg p-space-md shadow-md flex flex-col gap-space-sm border border-surface-variant/30"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-surface-variant/20 pb-2">
        <div className="flex items-center gap-space-xs">
          <span className="material-symbols-outlined text-[18px] text-tertiary">auto_fix_high</span>
          <h3 className="font-headline-sm text-headline-sm text-on-surface">AI Execution Audit</h3>
        </div>
        <span className="px-space-xs py-0.5 rounded bg-tertiary-container text-on-tertiary-container font-label-xs text-label-xs font-semibold font-mono">
          BOB AI ENGINE
        </span>
      </div>

      {/* Audit Prose Grounded in Trace */}
      {hasLeakage ? (
        <p className="font-body-sm text-body-sm text-on-surface leading-relaxed">
          At step 14, <code className="text-primary font-code-sm text-code-sm font-mono bg-surface-container px-1 py-0.5 rounded">train_test_split()</code> partitions the dataset, but your preprocessor <code className="text-error font-code-sm text-code-sm font-mono bg-surface-container px-1 py-0.5 rounded">StandardScaler</code> on Line 9 has already computed global μ and σ across both splits. Your evaluation metric (ROC-AUC) will be artificially optimistic by{' '}
          <strong className="text-error font-semibold font-mono">~8.4%</strong>.
        </p>
      ) : (
        <div className="bg-secondary-container/15 p-space-sm rounded border border-secondary/30 flex items-center gap-2">
          <span className="material-symbols-outlined text-[18px] text-secondary">verified</span>
          <p className="font-body-sm text-body-sm text-secondary">
            <strong>Zero Contamination Guarantee Active.</strong> Holdout distribution parameters are completely isolated. Model evaluation metrics reflect genuine generalization performance.
          </p>
        </div>
      )}

      {/* Interactive Code Diff Block matching Stitch */}
      <div className="bg-surface-container-lowest rounded p-space-sm font-code-sm text-code-sm flex flex-col gap-1 overflow-x-auto shadow-inner border border-surface-variant/20 font-mono">
        <div className="text-outline font-label-xs text-label-xs pb-1 border-b border-surface-variant/30 flex justify-between">
          <span>PROPOSED REMEDIATION PATCH</span>
          <span className="text-secondary font-semibold">Zero Contamination Guarantee</span>
        </div>

        {/* Diff Deleted Line */}
        <div className={`flex items-center gap-space-xs px-space-xs py-0.5 rounded transition-colors ${
          isRemediated ? 'opacity-40 line-through' : 'bg-error-container/20 text-on-surface'
        }`}>
          <span className="text-error font-bold select-none">-</span>
          <span className="text-error select-none">Line 09:</span>
          <span className="text-outline line-through">scaler = StandardScaler(); X_scaled = scaler.fit_transform(X)</span>
        </div>

        {/* Diff Added Lines */}
        <div className="flex items-center gap-space-xs bg-secondary-container/20 text-on-surface px-space-xs py-0.5 rounded">
          <span className="text-secondary font-bold select-none">+</span>
          <span className="text-secondary select-none">Line 14:</span>
          <span className="text-on-surface">X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2)</span>
        </div>

        <div className="flex items-center gap-space-xs bg-secondary-container/20 text-on-surface px-space-xs py-0.5 rounded">
          <span className="text-secondary font-bold select-none">+</span>
          <span className="text-secondary select-none">Line 15:</span>
          <span className="text-on-surface">scaler = StandardScaler()</span>
        </div>

        <div className="flex items-center gap-space-xs bg-secondary-container/20 text-on-surface px-space-xs py-0.5 rounded">
          <span className="text-secondary font-bold select-none">+</span>
          <span className="text-secondary select-none">Line 16:</span>
          <span className="text-on-surface">X_train = scaler.fit_transform(X_train)</span>
        </div>

        <div className="flex items-center gap-space-xs bg-secondary-container/20 text-on-surface px-space-xs py-0.5 rounded">
          <span className="text-secondary font-bold select-none">+</span>
          <span className="text-secondary select-none">Line 17:</span>
          <span className="text-on-surface">X_test = scaler.transform(X_test)</span>
        </div>
      </div>

      {/* Remediation Actions */}
      <div className="flex items-center gap-space-sm pt-space-xs">
        <button
          type="button"
          disabled={!hasLeakage || isApplying}
          onClick={handleApplyFix}
          className={`flex-1 flex items-center justify-center gap-1 transition-all px-space-md py-1.5 rounded font-label-md text-label-md shadow-sm ${
            !hasLeakage
              ? 'bg-surface-container text-outline cursor-default'
              : isApplying
                ? 'bg-primary-container text-on-primary-container'
                : 'bg-secondary-container hover:bg-secondary text-on-secondary active:scale-98'
          }`}
        >
          <span className="material-symbols-outlined text-[16px]">
            {!hasLeakage ? 'done_all' : isApplying ? 'hourglass_empty' : 'task_alt'}
          </span>
          <span>
            {!hasLeakage 
              ? 'Remediation Applied' 
              : isApplying 
                ? 'Patch Applying...' 
                : 'Apply Fix to Cell [3]'}
          </span>
        </button>

        <button
          type="button"
          disabled={isRerunning}
          onClick={handleRerun}
          className="flex items-center gap-1 bg-surface-container hover:bg-surface-container-high text-on-surface transition-colors px-space-md py-1.5 rounded font-label-md text-label-md border border-outline-variant/30"
        >
          <span className={`material-symbols-outlined text-[16px] ${isRerunning ? 'animate-spin' : ''}`}>
            restart_alt
          </span>
          <span>{isRerunning ? 'Sandboxing...' : 'Re-run Sandbox'}</span>
        </button>
      </div>
    </div>
  );
}
