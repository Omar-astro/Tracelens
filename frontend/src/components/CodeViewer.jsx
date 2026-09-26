import React, { useEffect, useRef } from 'react';

/**
 * CodeViewer — Stage 7 + Stage 10: Read-only syntax viewer with gutter markers.
 *
 * - Highlights and auto-scrolls to the line matching currentStep.line_number.
 * - Stage 10: Renders a ★ Safe Hook gutter marker on any line in safeInsertionPoints.
 * - Clicking a ★ marker calls onGutterMarkerClick(safeInsertionPoint).
 * - No editing; no Monaco dependency — pure React + Tailwind.
 */
// Lightweight Python syntax tokenizer for read-only Prism-style presentation
function highlightPythonLine(line) {
  const trimmed = line.trimStart();
  if (trimmed.startsWith('#')) {
    const indent = line.slice(0, line.length - trimmed.length);
    return (
      <span>
        {indent}
        <span className="text-slate-500 italic">{trimmed}</span>
      </span>
    );
  }

  const tokenRegex = /(#[^\n]*)|("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')|(\b(?:def|class|return|for|in|while|if|elif|else|try|except|finally|with|as|import|from|pass|break|continue|yield|raise|lambda|is|not|and|or)\b)|(\b(?:True|False|None)\b)|(\b(?:print|len|range|enumerate|zip|map|filter|int|str|float|bool|list|dict|set|tuple)\b)|(\b\d+(?:\.\d+)?\b)/g;

  const elements = [];
  let lastIndex = 0;
  let match;

  while ((match = tokenRegex.exec(line)) !== null) {
    if (match.index > lastIndex) {
      elements.push(line.slice(lastIndex, match.index));
    }

    const [full, comment, str, kw, boolVal, builtin, num] = match;

    if (comment) {
      elements.push(
        <span key={match.index} className="text-slate-500 italic">
          {comment}
        </span>
      );
    } else if (str) {
      elements.push(
        <span key={match.index} className="text-emerald-300">
          {str}
        </span>
      );
    } else if (kw) {
      elements.push(
        <span key={match.index} className="text-sky-400 font-semibold">
          {kw}
        </span>
      );
    } else if (boolVal) {
      elements.push(
        <span key={match.index} className="text-amber-400 font-medium">
          {boolVal}
        </span>
      );
    } else if (builtin) {
      elements.push(
        <span key={match.index} className="text-cyan-300">
          {builtin}
        </span>
      );
    } else if (num) {
      elements.push(
        <span key={match.index} className="text-purple-300">
          {num}
        </span>
      );
    } else {
      elements.push(full);
    }

    lastIndex = tokenRegex.lastIndex;
  }

  if (lastIndex < line.length) {
    elements.push(line.slice(lastIndex));
  }

  return elements.length > 0 ? elements : line;
}

export default function CodeViewer({
  code,
  currentStep,
  skippedRange = null,
  safeInsertionPoints = [],
  selectedSafePoint = null,
  onGutterMarkerClick = null,
  onLineClick = null,
}) {
  // Build a fast lookup: lineNumber → SafeInsertionPoint
  const safeLineMap = React.useMemo(() => {
    const map = {};
    for (const pt of safeInsertionPoints) {
      map[pt.line_number] = pt;
    }
    return map;
  }, [safeInsertionPoints]);
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
    <div className="flex flex-col h-full bg-slate-950 overflow-hidden font-mono">
      {/* Header */}
      <div className="shrink-0 flex items-center justify-between px-3 py-1.5 bg-slate-900 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
          <span className="text-xs font-mono text-slate-300 font-medium">source.py</span>
          <span className="text-[10px] text-slate-500 font-mono hidden sm:inline">(read-only)</span>
        </div>
        <span className="text-xs font-mono text-slate-500">{lines.length} lines</span>
      </div>

      {/* Code body — scrollable */}
      <div className="flex-1 overflow-y-auto overflow-x-auto text-xs leading-6 select-text p-1">
        {lines.map((rawLine, idx) => {
          const lineNum = idx + 1;
          const isActive = lineNum === activeLine;
          const isSkipped =
            skippedRange != null &&
            lineNum >= skippedRange[0] &&
            lineNum <= skippedRange[1];
          const safePoint = safeLineMap[lineNum];
          const isSafePointSelected = selectedSafePoint?.line_number === lineNum;

          return (
            <div
              key={lineNum}
              ref={(el) => {
                if (el) lineRefs.current[lineNum] = el;
              }}
              onClick={() => onLineClick && onLineClick(lineNum)}
              className={`flex items-stretch min-w-max transition-colors duration-100 ${
                onLineClick ? 'cursor-pointer' : ''
              } ${
                isActive
                  ? 'bg-cyan-500/15 border-l-2 border-cyan-400 shadow-sm'
                  : isSkipped
                    ? 'bg-red-950/20 border-l-2 border-red-800/40 opacity-40'
                    : 'border-l-2 border-transparent hover:bg-slate-800/40'
              }`}
            >
              {/* Gutter: line number */}
              <div
                className={`shrink-0 w-10 text-right pr-2 py-0.5 select-none font-mono text-[11px] ${
                  isActive
                    ? 'text-cyan-400 font-bold bg-cyan-950/40'
                    : isSkipped
                      ? 'text-red-700 bg-slate-900/40'
                      : 'text-slate-600 bg-slate-900/40'
                }`}
                aria-hidden="true"
              >
                {lineNum}
              </div>

              {/* Gutter decoration column — Stage 10: [★ Safe Hook] marker */}
              <div className="shrink-0 min-w-[22px] px-1 flex items-center justify-center">
                {safePoint ? (
                  <button
                    type="button"
                    title={`[★ Safe Hook] Line ${lineNum}: ${safePoint.target_variable} — ${safePoint.reason}`}
                    onClick={() => onGutterMarkerClick && onGutterMarkerClick(safePoint)}
                    className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold transition-all cursor-pointer shadow-sm select-none ${
                      isSafePointSelected
                        ? 'bg-amber-500/30 text-amber-200 border border-amber-400 ring-1 ring-amber-400/50'
                        : 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 hover:text-amber-200 border border-amber-500/40 hover:border-amber-400'
                    }`}
                    aria-label={`[★ Safe Hook] Line ${lineNum}: ${safePoint.target_variable}`}
                  >
                    <span className="text-amber-400 font-bold leading-none">★</span>
                    <span className="text-[9px] uppercase tracking-wider font-semibold leading-none">Safe Hook</span>
                  </button>
                ) : (
                  <span aria-hidden="true" />
                )}
              </div>

              {/* Code text with syntax tokenization */}
              <pre
                className={`flex-1 py-0.5 pr-4 whitespace-pre font-mono ${
                  isActive ? 'text-slate-100' : isSkipped ? 'text-slate-600' : 'text-slate-300'
                }`}
              >
                {highlightPythonLine(rawLine)}
              </pre>

              {/* Active step badge (inline, right edge) */}
              {isActive && currentStep && (
                <div className="shrink-0 flex items-center pr-2">
                  <span className="text-[10px] font-mono text-cyan-400 bg-cyan-500/20 border border-cyan-500/30 px-1.5 py-0.5 rounded shadow-sm">
                    ▶ step {currentStep.step_id ?? 0}
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
