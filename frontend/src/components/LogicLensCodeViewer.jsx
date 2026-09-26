import React, { useState } from 'react';

export default function LogicLensCodeViewer({
  code,
  currentStep,
  steps = [],
  selectedLineNumber,
  onSelectLine,
  onJumpToStep,
  onOpenSafeHookDrawer
}) {
  const [copied, setCopied] = useState(false);
  const lines = code.split('\n');

  const activeLine = currentStep?.line_number;
  const skippedRange = currentStep?.branch_context?.skipped_range;

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex flex-col bg-surface-container-lowest rounded-lg overflow-hidden shadow-lg border border-surface-variant/30 h-full">
      {/* Code Header Bar */}
      <div className="bg-surface-container-low px-space-md py-space-sm flex items-center justify-between flex-wrap gap-space-xs border-b border-surface-variant/30">
        <div className="flex items-center gap-space-sm">
          <div className="flex items-center gap-1.5 px-space-sm py-1 bg-surface-container rounded text-primary font-headline-sm text-headline-sm border border-outline-variant/30">
            <span className="material-symbols-outlined text-[16px]">terminal</span>
            <span>teammate_pipeline.py</span>
            <span className="text-outline font-code-sm text-code-sm ml-1">(Alex&apos;s Script)</span>
          </div>

          <span className="inline-flex items-center gap-1 text-secondary font-label-xs text-label-xs bg-surface-container px-space-xs py-0.5 rounded border border-secondary/20">
            <span className="w-1.5 h-1.5 rounded-full bg-secondary" />
            <span>sys.settrace Sandbox</span>
          </span>
        </div>

        <div className="flex items-center gap-space-xs">
          <span className="font-code-sm text-code-sm text-outline px-space-xs py-0.5 bg-surface-container rounded font-mono">
            {lines.length} lines
          </span>

          <button
            type="button"
            onClick={handleCopy}
            className="p-1 hover:bg-surface-container-high rounded text-on-surface-variant hover:text-on-surface transition-colors"
            title="Copy Source"
          >
            <span className="material-symbols-outlined text-[16px]">
              {copied ? 'check' : 'content_copy'}
            </span>
          </button>
        </div>
      </div>

      {/* Code Body Canvas */}
      <div className="overflow-x-auto p-space-sm font-code-md text-code-md leading-relaxed select-text bg-surface-container-lowest flex-1 font-mono">
        {lines.map((rawLine, idx) => {
          const lineNum = idx + 1;
          const isActive = activeLine === lineNum;
          const isSelected = selectedLineNumber === lineNum;
          const isSafeHookLine = lineNum === 25;
          const isComment = rawLine.trim().startsWith('#');

          // Check if line is within currently skipped branch range
          const isSkippedLine = skippedRange && lineNum >= skippedRange[0] && lineNum <= skippedRange[1];

          // Jump to first step at this line when clicked
          const handleLineClick = () => {
            onSelectLine(lineNum);
            if (onJumpToStep && steps.length > 0) {
              const idx = steps.findIndex(s => s.line_number === lineNum);
              if (idx !== -1) onJumpToStep(idx);
            }
          };

          // Safe Hook Line Highlight
          if (isSafeHookLine) {
            return (
              <div
                key={lineNum}
                id={`code-line-${lineNum}`}
                className="my-1.5 rounded bg-secondary-container/15 border-l-4 border-secondary p-1 flex flex-col gap-1 transition-all"
              >
                <div
                  className="flex items-center justify-between cursor-pointer"
                  onClick={() => {
                    handleLineClick();
                    onOpenSafeHookDrawer();
                  }}
                >
                  <div className="flex items-center gap-2">
                    <span className="w-8 text-right pr-2 select-none text-secondary font-bold text-code-sm">
                      {lineNum}
                    </span>
                    <span className="px-2 py-0.5 rounded bg-secondary text-on-secondary font-label-xs text-label-xs font-bold flex items-center gap-1 shadow-sm">
                      <span className="material-symbols-outlined text-[13px]">star</span>
                      <span>[★ SAFE INSERTION POINT: Line 25]</span>
                    </span>
                  </div>

                  <span className="text-[11px] text-secondary underline mr-2 hover:text-secondary-fixed">
                    Click to Inspect Hook Template
                  </span>
                </div>

                <div className="ml-10 text-[11px] text-outline italic">
                  # Alex finished sanitizing records. Safe to inject Slack alerts or database write here!
                </div>
              </div>
            );
          }

          // Active Step Line Highlight
          if (isActive) {
            return (
              <div
                key={lineNum}
                id={`code-line-${lineNum}`}
                className="my-0.5 rounded bg-primary-container/20 border-l-4 border-primary px-1 py-1 flex items-start cursor-pointer shadow-md transition-all hover:bg-slate-800/50"
                onClick={handleLineClick}
              >
                <div className="w-8 text-right pr-2 select-none text-primary font-bold flex items-center justify-end gap-1">
                  <span className="material-symbols-outlined text-[13px] text-primary animate-pulse">
                    play_arrow
                  </span>
                  <span>{lineNum}</span>
                </div>

                <p className="flex-1 text-on-surface font-semibold pl-1 font-mono">
                  {rawLine}
                </p>

                <span className="text-[10px] text-primary uppercase bg-primary/20 px-1.5 py-0.5 rounded mr-1 font-mono shrink-0">
                  STEP #{currentStep?.step_id}
                </span>
              </div>
            );
          }

          // Normal / Skipped Line
          return (
            <div
              key={lineNum}
              id={`code-line-${lineNum}`}
              onClick={handleLineClick}
              className={`flex items-start px-1 py-0.5 rounded cursor-pointer transition-colors hover:bg-slate-800/50 ${
                isSelected
                  ? 'bg-surface-container-high border-l-2 border-secondary'
                  : ''
              } ${isSkippedLine ? 'opacity-40 line-through text-outline' : ''}`}
            >
              <span className="w-8 text-right pr-2 select-none text-outline font-code-sm text-code-sm">
                {lineNum}
              </span>

              <p className={`flex-1 pl-1 font-mono ${
                isComment
                  ? 'text-outline italic'
                  : rawLine.includes('for ') || rawLine.includes('if ')
                    ? 'text-primary font-semibold'
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
