import React, { useState } from 'react';

export default function CodeAuditor({
  code,
  currentStep,
  hasLeakage,
  onExplainLine,
  onOpenRemediationDiff,
  selectedLineNumber,
  onSelectLine
}) {
  const [copied, setCopied] = useState(false);
  const [breakpoints, setBreakpoints] = useState({ 9: true, 14: true });

  const lines = code.split('\n');

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const toggleBreakpoint = (lineNum) => {
    setBreakpoints(prev => ({
      ...prev,
      [lineNum]: !prev[lineNum]
    }));
  };

  return (
    <div className="flex flex-col bg-surface-container-lowest rounded-lg overflow-hidden shadow-lg border border-surface-variant/30">
      {/* Editor Cell Header Bar */}
      <div className="bg-surface-container-low px-space-md py-space-sm flex items-center justify-between flex-wrap gap-space-xs border-b border-surface-variant/30">
        <div className="flex items-center gap-space-sm">
          <div className="flex items-center gap-1.5 px-space-sm py-1 bg-surface-container rounded text-primary font-headline-sm text-headline-sm border border-outline-variant/30">
            <span className="material-symbols-outlined text-[16px]">terminal</span>
            <span>train.ipynb</span>
            <span className="text-outline font-code-sm text-code-sm ml-1">Cell [3] • In [14]</span>
          </div>

          <span className="hidden md:inline-flex items-center gap-1 text-secondary font-label-xs text-label-xs bg-surface-container px-space-xs py-0.5 rounded border border-secondary/20">
            <span className="w-1.5 h-1.5 rounded-full bg-secondary" />
            <span>Python 3.11 (sandbox-isolated)</span>
          </span>
        </div>

        <div className="flex items-center gap-space-xs">
          <span className="font-code-sm text-code-sm text-outline px-space-xs py-0.5 bg-surface-container rounded font-mono">
            {currentStep?.latency || '142ms'}
          </span>

          <button
            type="button"
            onClick={handleCopy}
            className="p-1 hover:bg-surface-container-high rounded text-on-surface-variant hover:text-on-surface transition-colors"
            title="Copy Cell Source"
          >
            <span className="material-symbols-outlined text-[16px]">
              {copied ? 'check' : 'content_copy'}
            </span>
          </button>

          <button
            type="button"
            onClick={() => toggleBreakpoint(currentStep?.lineNumber || 14)}
            className="p-1 hover:bg-surface-container-high rounded text-on-surface-variant hover:text-error transition-colors"
            title="Toggle Breakpoint"
          >
            <span className="material-symbols-outlined text-[16px]">radio_button_checked</span>
          </button>
        </div>
      </div>

      {/* Code Editor Canvas */}
      <div className="overflow-x-auto p-space-sm font-code-md text-code-md leading-relaxed select-text bg-surface-container-lowest">
        {lines.map((rawLine, index) => {
          const lineNum = index + 1;
          const isLeakageLine = hasLeakage && (rawLine.includes('scaler.fit_transform(X)') || lineNum === 11 || (hasLeakage && rawLine.includes('X_scaled = scaler.fit_transform')));
          const isActiveStepLine = (currentStep?.lineNumber === lineNum) || (lineNum === 16 && currentStep?.stepId === 14);
          const hasBreakpoint = breakpoints[lineNum];
          const isSelected = selectedLineNumber === lineNum;

          // Syntax formatting helpers
          const isComment = rawLine.trim().startsWith('#');

          if (isLeakageLine) {
            return (
              <div
                key={lineNum}
                id="code-line-leakage"
                className="flex flex-col bg-error-container/15 rounded my-1 p-1 border-l-2 border-error"
              >
                <div 
                  className="flex items-start cursor-pointer hover:bg-error-container/20 rounded py-0.5"
                  onClick={() => {
                    onSelectLine(lineNum);
                    onExplainLine(lineNum, rawLine);
                  }}
                >
                  <span className="w-9 text-right pr-3 select-none text-error font-code-sm text-code-sm font-bold flex items-center justify-end gap-1">
                    {hasBreakpoint && <span className="w-2 h-2 rounded-full bg-error" />}
                    {lineNum}
                  </span>
                  <p className="text-on-surface font-semibold font-mono flex-1">
                    {rawLine}
                  </p>
                  <span className="text-[10px] text-error font-mono uppercase bg-error/20 px-1 rounded mr-2">
                    Click to Explain
                  </span>
                </div>

                {/* Inline Callout Card matching Stitch */}
                <div className="mt-space-xs ml-9 p-space-sm bg-surface-container-high rounded shadow-md border border-error/30">
                  <div className="flex items-center justify-between gap-space-xs flex-wrap mb-1">
                    <span className="px-space-xs py-0.5 rounded bg-error-container text-on-error-container font-label-xs text-label-xs font-bold flex items-center gap-1">
                      <span className="material-symbols-outlined text-[13px]">warning</span>
                      HIGH SEVERITY: DATA LEAKAGE DETECTED
                    </span>
                    <span className="font-code-sm text-code-sm text-outline font-mono">
                      Assertion #AL-09: GLOBAL_MOMENT_POLLUTION
                    </span>
                  </div>

                  <p className="font-body-sm text-body-sm text-on-surface mb-space-sm">
                    <code className="text-error font-code-sm text-code-sm font-mono bg-surface-container px-1 py-0.5 rounded">
                      StandardScaler.fit_transform()
                    </code>{' '}
                    was executed prior to{' '}
                    <code className="text-primary font-code-sm text-code-sm font-mono bg-surface-container px-1 py-0.5 rounded">
                      train_test_split()
                    </code>{' '}
                    at Step 14. Empirical distribution parameters (μ, σ) derived from the holdout validation set were incorporated into feature transforms, corrupting model validity.
                  </p>

                  <div className="flex items-center gap-space-sm flex-wrap">
                    <button
                      type="button"
                      onClick={() => onExplainLine(lineNum, rawLine)}
                      className="flex items-center gap-1 bg-tertiary-container text-on-tertiary-container hover:bg-tertiary transition-colors px-space-sm py-1 rounded font-label-md text-label-md shadow-sm"
                    >
                      <span className="material-symbols-outlined text-[15px]">auto_fix_high</span>
                      <span>Explain with Bob AI</span>
                    </button>

                    <button
                      type="button"
                      onClick={onOpenRemediationDiff}
                      className="flex items-center gap-1 bg-surface-container text-on-surface hover:bg-surface-variant transition-colors px-space-sm py-1 rounded font-label-md text-label-md border border-outline-variant/40"
                    >
                      <span className="material-symbols-outlined text-[15px]">difference</span>
                      <span>Quick Remediation Diff</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          }

          if (isActiveStepLine) {
            return (
              <div
                key={lineNum}
                className="flex flex-col bg-primary-container/20 rounded p-1 my-1 shadow-md border-l-2 border-primary"
              >
                <div 
                  className="flex items-start cursor-pointer"
                  onClick={() => {
                    onSelectLine(lineNum);
                    onExplainLine(lineNum, rawLine);
                  }}
                >
                  <span className="w-9 text-right pr-3 select-none text-primary font-code-sm text-code-sm font-bold flex items-center justify-end gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary animate-ping" />
                    {lineNum}
                  </span>
                  <p className="text-on-surface font-semibold font-mono flex-1">
                    {rawLine}
                  </p>
                  <span className="text-[10px] text-primary font-mono uppercase bg-primary-container/30 px-1 rounded mr-2">
                    ACTIVE STEP
                  </span>
                </div>

                <div className="mt-1 ml-9 flex items-center gap-space-xs font-label-xs text-label-xs text-primary">
                  <span className="material-symbols-outlined text-[13px]">play_circle</span>
                  <span>
                    Current Execution Step ({currentStep?.stepId || 14}/42) • Trace pointer suspended here. Click right panel to audit tensor registers.
                  </span>
                </div>
              </div>
            );
          }

          // Standard line
          return (
            <div
              key={lineNum}
              onClick={() => {
                onSelectLine(lineNum);
                onExplainLine(lineNum, rawLine);
              }}
              className={`flex items-start px-space-xs py-0.5 rounded cursor-pointer transition-colors ${
                isSelected
                  ? 'bg-surface-container-high border-l-2 border-secondary'
                  : 'hover:bg-surface-container/50'
              }`}
            >
              <span className="w-9 text-right pr-3 select-none text-outline font-code-sm text-code-sm font-mono flex items-center justify-end gap-1">
                {hasBreakpoint && <span className="w-1.5 h-1.5 rounded-full bg-error" />}
                {lineNum}
              </span>

              <p className={`font-mono text-code-md flex-1 ${
                isComment 
                  ? 'text-outline italic' 
                  : rawLine.startsWith('import ') || rawLine.startsWith('from ')
                    ? 'text-on-surface-variant'
                    : 'text-on-surface'
              }`}>
                {rawLine}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
