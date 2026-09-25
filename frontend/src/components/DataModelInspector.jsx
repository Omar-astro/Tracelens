import React from 'react';

export default function DataModelInspector({
  currentStep,
  isRemediated = false
}) {
  const targetDist = currentStep?.targetDistribution || {
    total: 1000,
    class0: { label: 'Class 0 (Retained)', count: 920, pct: 92.0 },
    class1: { label: 'Class 1 (Churn)', count: 80, pct: 8.0 },
    ratio: '11.5 : 1',
    holdoutPositives: '~16'
  };

  const xVar = currentStep?.variables?.X || currentStep?.variables?.X_train || {
    type: 'DataFrame',
    shape: [1000, 24],
    nulls: 0,
    dtypes: '24x float64'
  };

  return (
    <div className="bg-surface-container-low rounded-lg p-space-md shadow-md flex flex-col gap-space-md border border-surface-variant/30">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-surface-variant/20 pb-2">
        <div className="flex items-center gap-space-xs">
          <span className="material-symbols-outlined text-[18px] text-primary">data_object</span>
          <h3 className="font-headline-sm text-headline-sm text-on-surface">Data & Model Inspector</h3>
        </div>
        <span className="px-space-xs py-0.5 rounded bg-surface-container-high text-outline font-label-xs text-label-xs font-mono">
          SNAP @ STEP {currentStep?.stepId || 14}
        </span>
      </div>

      {/* Tensor & Variable Chips */}
      <div className="flex flex-col gap-space-xs">
        {/* Variable X Chip */}
        <div className="bg-surface-container rounded p-space-sm border border-outline-variant/20">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-space-xs">
              <span className="px-1.5 py-0.5 rounded bg-surface-container-high font-code-sm text-code-sm text-primary font-bold font-mono">
                X
              </span>
              <span className="font-label-xs text-label-xs text-outline font-mono">
                {xVar.type || 'pandas.DataFrame'}
              </span>
            </div>
            <span className="font-code-sm text-code-sm text-secondary font-mono">
              Shape: ({xVar.shape ? xVar.shape.join(', ') : '1000, 24'})
            </span>
          </div>

          <div className="grid grid-cols-3 gap-1 text-center font-label-xs text-label-xs text-on-surface-variant my-1">
            <div className="bg-surface-container-high p-1 rounded font-mono">
              <span className="block text-outline text-[9px]">Memory</span>
              <span className="font-semibold text-on-surface">{currentStep?.memory || '192.4 KB'}</span>
            </div>
            <div className="bg-surface-container-high p-1 rounded font-mono">
              <span className="block text-outline text-[9px]">Nulls</span>
              <span className="font-semibold text-secondary">0 (0.0%)</span>
            </div>
            <div className="bg-surface-container-high p-1 rounded font-mono">
              <span className="block text-outline text-[9px]">Dtypes</span>
              <span className="font-semibold text-on-surface">24x float64</span>
            </div>
          </div>

          {/* Shape Flow Sparkline matching Stitch */}
          <div className="mt-2 flex items-center justify-between text-outline font-label-xs text-label-xs font-mono">
            <span>Dimension Flow</span>
            <span className="text-primary font-code-sm text-code-sm">
              {currentStep?.dimensionFlow || '(1000, 28) → (1000, 24)'}
            </span>
          </div>

          <div className="w-full h-8 mt-1">
            <svg className="w-full h-full" preserveAspectRatio="none" viewBox="0 0 200 32">
              <path
                className="text-outline"
                d="M0,24 L40,24 L80,18 L120,18 L160,10 L200,10"
                fill="none"
                stroke="currentColor"
                strokeDasharray="2 2"
                strokeWidth="1.5"
              />
              <path
                className="text-secondary"
                d="M0,24 L40,24 L80,18 L120,18"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              />
              <circle className="fill-secondary" cx="0" cy="24" r="2.5" />
              <circle className="fill-secondary" cx="40" cy="24" r="2.5" />
              <circle className="fill-secondary" cx="80" cy="18" r="2.5" />
              <circle className="fill-primary animate-pulse" cx="120" cy="18" r="3.5" />
            </svg>
          </div>
        </div>

        {/* Variable y (Target Distribution) */}
        <div className="bg-surface-container rounded p-space-sm flex flex-col gap-space-xs border border-outline-variant/20">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-space-xs">
              <span className="px-1.5 py-0.5 rounded bg-surface-container-high font-code-sm text-code-sm text-tertiary font-bold font-mono">
                y
              </span>
              <span className="font-label-xs text-label-xs text-outline font-mono">
                Target Distribution (churn)
              </span>
            </div>

            <span className="px-space-xs py-0.5 rounded bg-tertiary-container text-on-tertiary-container font-label-xs text-label-xs font-semibold font-mono">
              ALERT: IMBALANCED
            </span>
          </div>

          {/* Custom Interactive Visual Bar Chart */}
          <div className="w-full flex flex-col gap-1 mt-1">
            <div className="w-full h-4 bg-surface-container-high rounded-full overflow-hidden flex shadow-inner">
              <div
                className="h-full bg-primary/70 hover:bg-primary transition-all cursor-pointer"
                style={{ width: `${targetDist.class0.pct}%` }}
                title={`Class 0: ${targetDist.class0.count} samples (${targetDist.class0.pct}%)`}
              />
              <div
                className="h-full bg-tertiary hover:bg-tertiary-fixed transition-all cursor-pointer"
                style={{ width: `${targetDist.class1.pct}%` }}
                title={`Class 1: ${targetDist.class1.count} samples (${targetDist.class1.pct}%)`}
              />
            </div>

            <div className="flex items-center justify-between font-label-xs text-label-xs mt-1">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-primary/70" />
                <span className="text-on-surface">
                  Class 0 (Retained):{' '}
                  <strong className="text-primary font-semibold font-mono">
                    {targetDist.class0.count} ({targetDist.class0.pct}%)
                  </strong>
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-tertiary" />
                <span className="text-on-surface">
                  Class 1 (Churn):{' '}
                  <strong className="text-tertiary font-semibold font-mono">
                    {targetDist.class1.count} ({targetDist.class1.pct}%)
                  </strong>
                </span>
              </div>
            </div>
          </div>

          {/* Imbalance Warning Banner */}
          <div className="bg-tertiary-container/15 p-space-xs rounded flex items-center gap-space-xs text-on-surface border border-tertiary/20">
            <span className="material-symbols-outlined text-[15px] text-tertiary shrink-0">info</span>
            <p className="font-body-sm text-body-sm">
              Severe Imbalance Ratio (<strong className="text-tertiary font-mono">{targetDist.ratio}</strong>). Holdout set will only contain {targetDist.holdoutPositives} positive instances at test_size=0.2.
            </p>
          </div>
        </div>

        {/* Active Estimator Inspection */}
        <div className="bg-surface-container rounded p-space-sm border border-outline-variant/20">
          <span className="font-label-xs text-label-xs text-outline uppercase tracking-wider block mb-1 font-mono">
            Active Estimator Definition
          </span>
          <div className="font-code-md text-code-md text-on-surface mb-2 font-mono">
            LogisticRegression(<span className="text-primary">C=1.0</span>, <span className="text-primary">solver='lbfgs'</span>, <span className="text-primary">max_iter=100</span>)
          </div>
          <div className="flex flex-wrap gap-1">
            <span className="px-space-xs py-0.5 rounded bg-surface-container-high text-outline font-label-xs text-label-xs font-mono">
              penalty: 'l2'
            </span>
            <span className={`px-space-xs py-0.5 rounded font-label-xs text-label-xs font-mono ${
              isRemediated 
                ? 'bg-secondary-container/20 text-secondary border border-secondary/30' 
                : 'bg-error-container/20 text-error border border-error/30'
            }`}>
              class_weight: {isRemediated ? "'balanced' [OPTIMIZED]" : 'None [FLAGGED]'}
            </span>
            <span className="px-space-xs py-0.5 rounded bg-surface-container-high text-outline font-label-xs text-label-xs font-mono">
              dual: False
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
