import React from 'react';

export default function LeakageInspectorView({
  hasLeakage,
  onApplyFix
}) {
  return (
    <div className="flex flex-col bg-surface-container-lowest rounded-lg p-space-lg shadow-lg border border-surface-variant/30 min-h-[540px] gap-space-lg">
      <div className="flex items-center justify-between pb-space-md border-b border-surface-variant/20">
        <div className="flex items-center gap-space-sm">
          <span className="material-symbols-outlined text-[20px] text-error">security</span>
          <div>
            <h2 className="font-headline-sm text-headline-sm text-on-surface">Data Leakage Forensic Inspector</h2>
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              Cross-boundary state contamination analysis and distribution moment tracking.
            </p>
          </div>
        </div>

        <span className={`px-space-sm py-1 rounded font-label-xs text-label-xs font-mono font-bold flex items-center gap-1.5 ${
          hasLeakage 
            ? 'bg-error-container text-on-error-container border border-error/30' 
            : 'bg-secondary-container text-on-secondary-container border border-secondary/30'
        }`}>
          <span className="material-symbols-outlined text-[14px]">
            {hasLeakage ? 'crisis_alert' : 'verified'}
          </span>
          {hasLeakage ? 'STATUS: LEAKAGE DETECTED' : 'STATUS: ZERO CONTAMINATION'}
        </span>
      </div>

      {/* Forensic Breakdown Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-space-lg">
        {/* Card 1: Vector Contamination Matrix */}
        <div className="bg-surface-container-low p-space-md rounded-lg border border-surface-variant/30 flex flex-col gap-space-sm">
          <div className="flex items-center justify-between border-b border-surface-variant/20 pb-2">
            <span className="font-label-md text-label-md text-primary font-mono">1. Empirical Moment Comparison</span>
            <span className="text-outline font-label-xs font-mono">Feature: total_charges</span>
          </div>

          <div className="grid grid-cols-2 gap-space-sm text-center font-mono my-2">
            <div className="bg-surface-container p-space-sm rounded border border-error/20">
              <span className="text-outline text-label-xs block mb-1">Global Polluted μ</span>
              <span className="text-error font-headline-sm font-bold">$2,283.45</span>
              <span className="text-[10px] text-outline block mt-1">(Includes Test Fold)</span>
            </div>

            <div className="bg-surface-container p-space-sm rounded border border-secondary/20">
              <span className="text-outline text-label-xs block mb-1">Isolated Train μ*</span>
              <span className="text-secondary font-headline-sm font-bold">$2,142.10</span>
              <span className="text-[10px] text-outline block mt-1">(Ground Truth Train Split)</span>
            </div>
          </div>

          <p className="font-body-sm text-body-sm text-on-surface-variant leading-relaxed">
            Because <code className="text-error font-mono font-semibold">StandardScaler.fit_transform(X)</code> was called before <code className="text-primary font-mono font-semibold">train_test_split()</code>, 200 holdout observations altered the scaling divisor and mean. During evaluation, the model recognizes scaled test features as familiar distributions, generating deceptive confidence.
          </p>
        </div>

        {/* Card 2: Methodology Impact */}
        <div className="bg-surface-container-low p-space-md rounded-lg border border-surface-variant/30 flex flex-col gap-space-sm">
          <div className="flex items-center justify-between border-b border-surface-variant/20 pb-2">
            <span className="font-label-md text-label-md text-primary font-mono">2. Validation Inflation Analysis</span>
            <span className="text-outline font-label-xs font-mono">Metric: ROC-AUC</span>
          </div>

          <div className="flex flex-col gap-2 my-2 font-mono">
            <div className="flex items-center justify-between bg-surface-container p-2 rounded">
              <span className="text-on-surface text-body-sm">Reported Holdout ROC-AUC:</span>
              <span className="text-error font-bold">0.9412 (+8.4% Artificial)</span>
            </div>

            <div className="flex items-center justify-between bg-surface-container p-2 rounded">
              <span className="text-on-surface text-body-sm">Uncontaminated Generalization AUC:</span>
              <span className="text-secondary font-bold">0.8572 (True Production Power)</span>
            </div>
          </div>

          <p className="font-body-sm text-body-sm text-on-surface-variant leading-relaxed">
            In production deployment on unseen data streams, this model would experience an instantaneous performance drop from 0.94 to ~0.85. TraceLens flags this at the exact AST node and runtime tick.
          </p>
        </div>
      </div>

      {/* Call to action */}
      {hasLeakage && (
        <div className="bg-surface-container-low p-space-md rounded-lg border border-secondary/30 flex flex-col sm:flex-row items-center justify-between gap-space-md mt-auto">
          <div>
            <h4 className="font-headline-sm text-headline-sm text-secondary">Ready to sanitize this pipeline?</h4>
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              Apply Bob AI's zero-contamination fix to split before feature scaling.
            </p>
          </div>
          <button
            type="button"
            onClick={onApplyFix}
            className="px-space-lg py-2 rounded bg-secondary-container hover:bg-secondary text-on-secondary font-label-md text-label-md transition-all shadow-md shrink-0 flex items-center gap-1.5"
          >
            <span className="material-symbols-outlined text-[16px]">task_alt</span>
            <span>Apply Zero-Contamination Patch</span>
          </button>
        </div>
      )}
    </div>
  );
}
