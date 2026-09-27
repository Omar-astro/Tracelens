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
 */
export default function TerminalOutputPane({
  traceSteps = [],
  currentStepIndex = 0,
  currentStep = null,
}) {
  const terminalEndRef = useRef(null);
  const [copied, setCopied] = useState(false);

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

  // Auto-scroll to bottom of the terminal log when new output arrives
  useEffect(() => {
    if (terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [emittedOutputs.length, currentStepIndex]);

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

  const currentStepEmitted = currentStep?.stdout_emitted;

  return (
    <div className="bg-slate-950/80 rounded-lg border border-slate-800 flex flex-col shadow-md overflow-hidden">
      {/* Terminal Title Bar */}
      <div className="flex items-center justify-between px-3 py-2 bg-slate-900/90 border-b border-slate-800/80 select-none">
        <div className="flex items-center gap-2">
          {/* macOS-style window controls */}
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500/70 border border-red-600/60 inline-block" />
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500/70 border border-amber-600/60 inline-block" />
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/70 border border-emerald-600/60 inline-block" />
          </div>

          <div className="flex items-center gap-1.5 ml-1">
            <span className="font-mono text-xs font-bold text-slate-300 flex items-center gap-1">
              <span className="text-emerald-400 font-black">&gt;_</span>
              <span>Terminal Output</span>
            </span>
            <span className="text-[10px] font-mono text-slate-500 font-semibold bg-slate-800/60 px-1.5 py-0.2 rounded border border-slate-700/40">
              stdout
            </span>
          </div>

          {/* Active step emission indicator */}
          {currentStepEmitted && (
            <span className="text-[9px] font-mono text-emerald-300 bg-emerald-500/10 border border-emerald-500/25 px-1.5 py-0.5 rounded flex items-center gap-1 animate-pulse">
              <span>●</span>
              <span>Line {currentStep?.line_number} output</span>
            </span>
          )}
        </div>

        {/* Right tools: count + copy */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono text-slate-400">
            {emittedOutputs.length} / {totalEmittedInTrace} prints
          </span>

          {emittedOutputs.length > 0 && (
            <button
              type="button"
              onClick={handleCopy}
              className="text-[10px] font-mono text-slate-400 hover:text-slate-200 bg-slate-800/60 hover:bg-slate-700/60 border border-slate-700/40 px-1.5 py-0.5 rounded transition-colors cursor-pointer"
              title="Copy terminal stdout to clipboard"
            >
              {copied ? '✓ Copied' : 'Copy'}
            </button>
          )}
        </div>
      </div>

      {/* Terminal Screen Area */}
      <div className="p-2.5 font-mono text-xs max-h-44 overflow-y-auto space-y-1 bg-black/60 scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-transparent">
        {/* Terminal greeting / prompt */}
        <div className="text-slate-600 text-[11px] select-none pb-1">
          $ python <span className="text-slate-500">teammate_pipeline.py</span>
        </div>

        {emittedOutputs.length === 0 ? (
          <div className="text-slate-600 text-[11px] italic py-1">
            [No output yet at Step #{currentStep?.step_id ?? 0} · scrub or play to steps with print()]
          </div>
        ) : (
          emittedOutputs.map((item, idx) => (
            <div
              key={`${item.stepIndex}_${idx}`}
              className={`flex items-start gap-2 py-0.5 px-1.5 rounded transition-all ${
                item.isCurrent
                  ? 'bg-emerald-500/15 text-emerald-200 font-semibold border-l-2 border-emerald-400 ring-1 ring-emerald-500/20'
                  : 'text-emerald-400/90 hover:bg-slate-900/40'
              }`}
            >
              <span className="text-[10px] text-slate-500 select-none shrink-0 w-7 text-right font-mono">
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
    </div>
  );
}
