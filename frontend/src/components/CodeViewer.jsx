import React, { useEffect, useRef } from 'react';

/**
 * CodeViewer — Stage 7: Read-only syntax viewer.
 *
 * - Highlights and auto-scrolls to the line matching currentStep.line_number.
 * - Left gutter column is reserved for decoration markers (populated in Stage 10).
 * - No editing; no Monaco dependency — pure React + Tailwind.
 */
export default function CodeViewer({ code, currentStep }) {
  const activeLine = currentStep?.line_number ?? null;
  const lines = code ? code.split('\n') : [];

  // Ref map: lineNumber → DOM element
  const lineRefs = useRef({});

  // Auto-scroll the active line into the centre of the code pane
  useEffect(() => {
    if (activeLine == null) return;
    const el = lineRefs.current[activeLine];
    if (el) {
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }, [activeLine]);

  return (
    <div className="flex flex-col h-full bg-slate-950 overflow-hidden">
      {/* Header */}
      <div className="shrink-0 flex items-center gap-2 px-3 py-1.5 bg-slate-900 border-b border-slate-800">
        <span className="text-xs font-mono text-slate-400">source</span>
        <span className="ml-auto text-xs font-mono text-slate-600">{lines.length} lines</span>
      </div>

      {/* Code body — scrollable */}
      <div className="flex-1 overflow-y-auto overflow-x-auto font-mono text-xs leading-6 select-text">
        {lines.map((rawLine, idx) => {
          const lineNum = idx + 1;
          const isActive = lineNum === activeLine;

          return (
            <div
              key={lineNum}
              ref={(el) => {
                if (el) lineRefs.current[lineNum] = el;
              }}
              className={`flex items-stretch min-w-max transition-colors duration-100 ${
                isActive
                  ? 'bg-cyan-500/10 border-l-2 border-cyan-400'
                  : 'border-l-2 border-transparent hover:bg-slate-800/40'
              }`}
            >
              {/* Gutter: line number (Stage 10 will add decoration markers here) */}
              <div
                className="shrink-0 w-10 text-right pr-2 py-0.5 select-none text-slate-600 bg-slate-900/50"
                aria-hidden="true"
              >
                {lineNum}
              </div>

              {/* Gutter decoration column — empty, reserved for Stage 10 */}
              {/* TODO(stage-10): render gutter marker icons here */}
              <div className="shrink-0 w-5" aria-hidden="true" />

              {/* Code text */}
              <pre
                className={`flex-1 py-0.5 pr-4 whitespace-pre ${
                  isActive ? 'text-cyan-100 font-semibold' : 'text-slate-300'
                }`}
              >
                {rawLine}
              </pre>

              {/* Active step badge (inline, right edge) */}
              {isActive && (
                <div className="shrink-0 flex items-center pr-2">
                  <span className="text-[10px] font-mono text-cyan-400 bg-cyan-500/20 border border-cyan-500/30 px-1.5 py-0.5 rounded">
                    ▶ step {currentStep.step_id}
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
