import React, { useState } from 'react';
import TimelineScrubber from './TimelineScrubber';
import CodeAuditor from './CodeAuditor';
import DataModelInspector from './DataModelInspector';
import BobAiAuditPanel from './BobAiAuditPanel';
import LineExplainPanel from './LineExplainPanel';
import FlagPopover from './FlagPopover';

export default function TracePlayer({
  code,
  traceSteps,
  currentStepIndex,
  onSelectStep,
  isPlaying,
  onTogglePlay,
  hasLeakage,
  isRemediated,
  onApplyFix,
  onRerunSandbox,
  selectedLineNumber,
  onSelectLine,
  _currentFileName
}) {
  const [explainingLine, setExplainingLine] = useState(null); // { lineNumber, codeLine }
  const [activeFlagPopover, setActiveFlagPopover] = useState(false);

  const currentStep = traceSteps[currentStepIndex] || traceSteps[0];

  const handleExplainLine = (lineNumber, codeLine) => {
    setExplainingLine({ lineNumber, codeLine });
  };

  return (
    <div className="flex flex-col w-full">
      {/* 1. Execution Timeline Scrubber Dock */}
      <TimelineScrubber
        steps={traceSteps}
        currentStepIndex={currentStepIndex}
        onSelectStep={onSelectStep}
        isPlaying={isPlaying}
        onTogglePlay={onTogglePlay}
        hasLeakage={hasLeakage}
      />

      {/* 2. Main Multi-Pane Workspace */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-gutter p-gutter">
        {/* LEFT PANE: Code & Cell Inspector (col-span-7) */}
        <div className="lg:col-span-7 relative flex flex-col gap-2">
          <CodeAuditor
            code={code}
            currentStep={currentStep}
            hasLeakage={hasLeakage}
            selectedLineNumber={selectedLineNumber}
            onSelectLine={onSelectLine}
            onExplainLine={handleExplainLine}
            onOpenRemediationDiff={() => {
              const el = document.getElementById('remediation-diff-card');
              if (el) el.scrollIntoView({ behavior: 'smooth' });
            }}
          />

          {/* Gutter Flag Popover if triggered */}
          {activeFlagPopover && currentStep?.issue && (
            <FlagPopover
              issue={currentStep.issue}
              lineNumber={currentStep.lineNumber}
              onExplainWithBob={() => handleExplainLine(currentStep.lineNumber, currentStep.codeLine)}
              onOpenRemediationDiff={() => {
                const el = document.getElementById('remediation-diff-card');
                if (el) el.scrollIntoView({ behavior: 'smooth' });
                setActiveFlagPopover(false);
              }}
              onDismiss={() => setActiveFlagPopover(false)}
            />
          )}

          {/* Inline / Docked Line Explanation Panel */}
          {explainingLine && (
            <LineExplainPanel
              lineNumber={explainingLine.lineNumber}
              codeLine={explainingLine.codeLine}
              currentStep={currentStep}
              onClose={() => setExplainingLine(null)}
              onApplyFix={hasLeakage ? onApplyFix : null}
            />
          )}
        </div>

        {/* RIGHT PANE: Visual State & AI Diagnostic Panel (col-span-5) */}
        <div className="lg:col-span-5 flex flex-col gap-gutter">
          <DataModelInspector
            currentStep={currentStep}
            isRemediated={isRemediated}
          />

          <BobAiAuditPanel
            hasLeakage={hasLeakage}
            onApplyFix={onApplyFix}
            onRerunSandbox={onRerunSandbox}
            isRemediated={isRemediated}
          />
        </div>
      </section>
    </div>
  );
}
