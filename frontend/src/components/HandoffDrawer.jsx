import React, { useState } from 'react';

/**
 * HandoffDrawer — Stage 10: Gutter Markers + Handoff Drawer.
 *
 * Displays the backend-computed SafeInsertionPoint data for a selected gutter marker:
 *  - reason: why this line is a safe insertion point
 *  - suggested_action: what a teammate should do here
 *  - boilerplate_hook: ready-to-copy code snippet
 *
 * Receives the currently selected SafeInsertionPoint via `selectedPoint` prop.
 * When no marker is selected, shows a prompt to click a ★ gutter marker.
 */
export default function HandoffDrawer({
  selectedPoint,
  safeInsertionPoints = [],
  onSelectPoint = null,
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!selectedPoint?.boilerplate_hook) return;
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(selectedPoint.boilerplate_hook);
      } else {
        throw new Error('Clipboard API unavailable');
      }
    } catch {
      // Fallback for non-HTTPS or restricted permissions
      const textarea = document.createElement('textarea');
      textarea.value = selectedPoint.boilerplate_hook;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  // Empty state — no marker clicked yet
  if (!selectedPoint) {
    return (
      <div className="flex flex-col h-full p-4 gap-3">
        {/* Header */}
        <div className="shrink-0 flex items-center justify-between border-b border-slate-800 pb-2.5">
          <div className="flex items-center gap-2">
            <span className="text-amber-400 font-bold text-base leading-none">★</span>
            <span className="text-xs font-semibold text-slate-200 font-mono">Safe Hooks</span>
          </div>
          <span className="text-[10px] font-mono text-slate-500 bg-slate-800/60 border border-slate-700/50 px-2 py-0.5 rounded">
            {safeInsertionPoints.length} point{safeInsertionPoints.length !== 1 ? 's' : ''}
          </span>
        </div>

        {safeInsertionPoints.length === 0 ? (
          <div className="flex flex-col items-center justify-center flex-1 gap-2 text-slate-600">
            <span className="text-2xl opacity-30">★</span>
            <p className="text-xs font-mono text-center text-slate-600">
              No safe insertion<br />points detected
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2 flex-1">
            <p className="text-[10px] text-slate-500 font-mono">
              Click a <span className="text-amber-400 font-bold">★ Safe Hook</span> gutter marker to inspect
            </p>
            {safeInsertionPoints.map((pt) => (
              <button
                type="button"
                key={pt.line_number}
                onClick={() => onSelectPoint && onSelectPoint(pt)}
                className="w-full text-left px-2.5 py-2 rounded-lg bg-slate-800/60 hover:bg-slate-800 border border-amber-500/20 hover:border-amber-500/40 text-xs font-mono text-slate-400 flex items-center gap-2 transition-colors cursor-pointer"
              >
                <span className="text-amber-400 font-bold">★</span>
                <span>Line <span className="text-slate-200">{pt.line_number}</span></span>
                <span className="text-slate-500 truncate flex-1">{pt.target_variable}</span>
                <span className={`text-[9px] px-1.5 py-0.5 rounded font-semibold ${
                  pt.confidence === 'high' ? 'bg-emerald-900/50 text-emerald-400' : 'bg-slate-700 text-slate-400'
                }`}>
                  {pt.confidence}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Selected state — show full details
  return (
    <div className="flex flex-col h-full p-4 gap-3 overflow-y-auto">
      {/* Header */}
      <div className="shrink-0 flex items-center justify-between border-b border-slate-800 pb-2.5">
        <div className="flex items-center gap-2">
          {onSelectPoint && safeInsertionPoints.length > 1 && (
            <button
              type="button"
              onClick={() => onSelectPoint(null)}
              className="text-slate-400 hover:text-slate-200 text-xs font-mono px-1.5 py-0.5 rounded hover:bg-slate-800 transition-colors mr-1 cursor-pointer"
              title="Back to all safe hooks"
            >
              ←
            </button>
          )}
          <span className="text-amber-400 font-bold text-base leading-none">★</span>
          <span className="text-xs font-semibold text-slate-200 font-mono">Safe Hook</span>
          <span className="text-xs font-mono text-amber-400 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded">
            Line {selectedPoint.line_number}
          </span>
        </div>
        <span className={`text-[10px] font-mono px-2 py-0.5 rounded font-semibold ${
          selectedPoint.confidence === 'high'
            ? 'bg-emerald-900/50 text-emerald-400 border border-emerald-700/40'
            : 'bg-slate-800 text-slate-400 border border-slate-700'
        }`}>
          {selectedPoint.confidence} confidence
        </span>
      </div>

      {/* Target Variable */}
      <div className="shrink-0 flex items-center gap-2 bg-slate-900/60 border border-slate-800 px-2.5 py-2 rounded-lg font-mono text-xs">
        <span className="text-slate-500">accumulator:</span>
        <code className="text-cyan-300 font-semibold">{selectedPoint.target_variable}</code>
      </div>

      {/* Reason */}
      <div className="flex flex-col gap-1 bg-slate-900/40 border border-slate-800 rounded-lg p-2.5">
        <span className="text-[10px] text-amber-400 uppercase tracking-wider font-mono font-bold">Why it's safe</span>
        <p className="text-xs text-slate-300 leading-relaxed">{selectedPoint.reason}</p>
      </div>

      {/* Suggested Action */}
      <div className="flex flex-col gap-1 bg-slate-900/40 border border-slate-800 rounded-lg p-2.5">
        <span className="text-[10px] text-sky-400 uppercase tracking-wider font-mono font-bold">Suggested action</span>
        <p className="text-xs text-slate-300 leading-relaxed">{selectedPoint.suggested_action}</p>
      </div>

      {/* Boilerplate Hook */}
      <div className="flex flex-col gap-1.5">
        <span className="text-[10px] text-emerald-400 uppercase tracking-wider font-mono font-bold">Ready-to-use hook</span>
        <pre className="bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-[11px] font-mono text-slate-300 leading-snug overflow-x-auto whitespace-pre-wrap break-all">
          {selectedPoint.boilerplate_hook}
        </pre>
        <button
          type="button"
          onClick={handleCopy}
          className="w-full flex items-center justify-center gap-1.5 bg-amber-500/15 hover:bg-amber-500/25 text-amber-400 border border-amber-500/30 py-2 px-3 rounded-lg text-xs font-semibold font-mono transition-colors cursor-pointer"
        >
          {copied ? (
            <>
              <span>✓</span>
              <span>Copied!</span>
            </>
          ) : (
            <>
              <span>⧉</span>
              <span>Copy Hook Template</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
