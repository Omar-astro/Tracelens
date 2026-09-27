import React, { useMemo, useRef, useEffect, useState } from 'react';

/**
 * TerminalOutputPane — Displays real-time terminal stdout under the Loop Visualizer.
 *
 * Shows standard output (stdout) produced by `print(...)` statements up to the current
 * execution step, allowing users to watch stdout lines appear deterministically
 * alongside loop iterations.
 *
 * Props:
 *   traceSteps        : TraceStep[]
 *   currentStepIndex  : number
 *   currentStep       : TraceStep
 *   fileName          : string
 */
export default function TerminalOutputPane({
  traceSteps = [],
  currentStepIndex = 0,
  currentStep = null,
  fileName = 'teammate_pipeline.py',
}) {
  const terminalEndRef = useRef(null);
  const activeLineRef = useRef(null);
  const [copied, setCopied] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);

  // Check if any step in the entire trace produces terminal stdout
  const totalEmittedInTrace = useMemo(() => {
    if (!traceSteps || traceSteps.length === 0) return 0;
    return traceSteps.filter((s) => Boolean(s?.stdout_emitted)).length;
  }, [traceSteps]);

  // Collect all outputs emitted from step 0 up to currentStepIndex
  const emittedOutputs = useMemo(() => {
    if (!traceSteps || traceSteps.length === 0) return [];
    const list = [];
    for (let i = 0; i <= currentStepIndex && i < traceSteps.length; i++) {
      const step = traceSteps[i];
      if (step && step.stdout_emitted) {
        list.push({
          stepIndex: i,
          stepId: step.step_id,
          lineNumber: step.line_number,
          codeLine: step.code_line,
          output: step.stdout_emitted,
          isCurrent: i === currentStepIndex,
        });
      }
    }
    return list;
  }, [traceSteps, currentStepIndex]);

  // Auto-scroll to active line or bottom of terminal log when new output arrives
  useEffect(() => {
    if (isCollapsed) return;
    if (activeLineRef.current) {
      activeLineRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } else if (terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [emittedOutputs.length, currentStepIndex, isCollapsed]);

  // Copy full stdout up to current step
  const handleCopy = () => {
    const text = emittedOutputs.map((o) => o.output).join('');
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  // If no step in the script produces terminal stdout, do not take up vertical space
  if (totalEmittedInTrace === 0) {
    return null;
  }

  const currentStepEmitted = Boolean(currentStep?.stdout_emitted);

  return (
    <div
      className={`bg-slate-950 rounded-lg border shadow-md flex flex-col shrink-0 transition-all duration-200 overflow-hidden ${
        currentStepEmitted
          ? 'border-emerald-500/70 shadow-[0_0_16px_rgba(16,185,129,0.2)] ring-1 ring-emerald-500/40'
          : 'border-slate-800'
      }`}
    >
      {/* Terminal Title Bar */}
      <div className="flex items-center justify-between px-3 py-2 bg-slate-900/90 border-b border-slate-800/80 select-none">
        <div className="flex items-center gap-2">
          {/* macOS-style window controls */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setIsCollapsed(!isCollapsed)}
              className="w-2.5 h-2.5 rounded-full bg-red-500/80 hover:bg-red-400 border border-red-600 inline-block transition-transform hover:scale-110 cursor-pointer"
              title={isCollapsed ? 'Expand Terminal' : 'Collapse Terminal'}
              aria-label="Toggle terminal collapse"
            />
            <button
              type="button"
              onClick={() => {
                if (isMaximized) setIsMaximized(false);
                else setIsCollapsed(true);
              }}
              className="w-2.5 h-2.5 rounded-full bg-amber-500/80 hover:bg-amber-400 border border-amber-600 inline-block transition-transform hover:scale-110 cursor-pointer"
              title="Minimize Terminal"
              aria-label="Minimize terminal"
            />
            <button
              type="button"
              onClick={() => {
                setIsCollapsed(false);
                setIsMaximized(!isMaximized);
              }}
              className="w-2.5 h-2.5 rounded-full bg-emerald-500/80 hover:bg-emerald-400 border border-emerald-600 inline-block transition-transform hover:scale-110 cursor-pointer"
              title={isMaximized ? 'Restore Default Height' : 'Maximize Terminal'}
              aria-label="Toggle maximize terminal"
            />
          </div>

          <div
            className="flex items-center gap-1.5 ml-1 cursor-pointer"
            onClick={() => setIsCollapsed(!isCollapsed)}
            title="Click to toggle Terminal visibility"
          >
            <span className="font-mono text-xs font-bold text-slate-200 flex items-center gap-1">
              <span className="text-emerald-400 font-black">&gt;_</span>
              <span>Terminal Output</span>
            </span>
            <span className="text-[10px] font-mono text-slate-400 font-semibold bg-slate-800 px-1.5 py-0.5 rounded border border-slate-700/60">
              stdout
            </span>
          </div>

          {/* Active step emission indicator */}
          {currentStepEmitted && (
            <span className="text-[10px] font-mono text-emerald-300 bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 rounded flex items-center gap-1.5 animate-pulse font-semibold">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              <span>Line {currentStep?.line_number} emitted output</span>
            </span>
          )}
        </div>

        {/* Right tools: count + copy + expand/collapse toggle */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono text-slate-400 font-medium">
            {emittedOutputs.length} / {totalEmittedInTrace} prints
          </span>

          {emittedOutputs.length > 0 && !isCollapsed && (
            <button
              type="button"
              onClick={handleCopy}
              className="text-[10px] font-mono text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 px-2 py-0.5 rounded transition-colors cursor-pointer"
              title="Copy terminal stdout to clipboard"
            >
              {copied ? '✓ Copied' : 'Copy'}
            </button>
          )}

          {/* Explicit maximize toggle */}
          {!isCollapsed && (
            <button
              type="button"
              onClick={() => setIsMaximized(!isMaximized)}
              className="text-[10px] font-mono text-slate-400 hover:text-slate-200 px-1.5 py-0.5 rounded bg-slate-800/80 hover:bg-slate-700 border border-slate-700/60 transition-colors cursor-pointer"
              title={isMaximized ? 'Restore default size' : 'Expand full terminal view'}
            >
              {isMaximized ? '⤡ Restore' : '⤢ Expand'}
            </button>
          )}

          {/* Collapse/expand toggle */}
          <button
            type="button"
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="text-[10px] font-mono text-slate-400 hover:text-slate-200 px-1.5 py-0.5 rounded bg-slate-800/80 hover:bg-slate-700 border border-slate-700/60 transition-colors cursor-pointer"
            title={isCollapsed ? 'Show terminal output' : 'Collapse terminal'}
          >
            {isCollapsed ? '▼ Show' : '▲ Hide'}
          </button>
        </div>
      </div>

      {/* Terminal Screen Area */}
      {!isCollapsed && (
        <div
          className={`p-2.5 font-mono text-xs overflow-y-auto space-y-1 bg-black/75 scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-transparent ${
            isMaximized ? 'min-h-[260px] max-h-96' : 'min-h-[140px] max-h-56'
          }`}
        >
          {/* Terminal greeting / prompt */}
          <div className="text-slate-600 text-[11px] select-none pb-1 flex items-center justify-between border-b border-slate-800/50 mb-1">
            <span>
              $ python <span className="text-slate-400 font-semibold">{fileName || 'script.py'}</span>
            </span>
            <span className="text-[10px] text-slate-600 font-mono">sandboxed stdout stream</span>
          </div>

          {emittedOutputs.length === 0 ? (
            <div className="text-slate-500 text-[11px] italic py-2 flex items-center gap-1.5">
              <span className="text-slate-600 font-mono">&gt;</span>
              <span>[No output emitted yet at Step #{currentStep?.step_id ?? 0} · scrub or play to steps with print()]</span>
            </div>
          ) : (
            emittedOutputs.map((item, idx) => (
              <div
                key={`${item.stepIndex}_${idx}`}
                ref={item.isCurrent ? activeLineRef : null}
                className={`flex items-start gap-2 py-1 px-2 rounded transition-all ${
                  item.isCurrent
                    ? 'bg-emerald-500/20 text-emerald-100 font-semibold border-l-2 border-emerald-400 ring-1 ring-emerald-500/30'
                    : 'text-emerald-400/90 hover:bg-slate-900/60'
                }`}
              >
                <span className="text-[10px] text-slate-500 select-none shrink-0 w-8 text-right font-mono">
                  s#{item.stepId}
                </span>
                <span className="text-slate-700 select-none">│</span>
                <span className="whitespace-pre-wrap break-all flex-1 font-mono leading-relaxed">
                  {item.output.endsWith('\n') ? item.output.slice(0, -1) : item.output}
                </span>
              </div>
            ))
          )}

          <div ref={terminalEndRef} />
        </div>
      )}
    </div>
  );
}
