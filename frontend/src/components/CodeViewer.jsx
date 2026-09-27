import React, { useEffect, useRef, useState, useMemo } from 'react';
import { detectCodeBlocks } from '../utils/codeBlockDetector';

/**
 * CodeViewer — Stage 7 + Stage 10 + Stage 14: Read-only syntax viewer with gutter markers.
 * Stage 15: Syntactic block auto-detection & multi-line range selection for Bob Explainer.
 *
 * - Highlights and auto-scrolls to the line matching currentStep.line_number.
 * - Stage 10: Renders a ★ Safe Hook gutter marker on any line in safeInsertionPoints.
 * - Stage 14: Renders a hazard stripe on any line flagged by the ModelLens audit.
 *   The hazard column sits immediately right of the Stage 10 column — additive,
 *   the Safe Hook marker is untouched.
 * - Stage 15: Displays auto-select buttons for syntactic blocks (for, while, if, def, class, etc.).
 *   Allows multi-line selection via shift-click or block pill buttons.
 * - Clicking a marker calls the matching onGutterMarkerClick / onAuditMarkerClick.
 * - No editing; no Monaco dependency — pure React + Tailwind.
 */
import { SEVERITY_META, HAZARD_FILL, HAZARD_ROW_TINT, worstSeverity } from './mlAuditMeta';

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
  fileName = 'Code Editor',
  currentStep,
  skippedRange = null,
  safeInsertionPoints = [],
  selectedSafePoint = null,
  onGutterMarkerClick = null,
  onLineClick = null,
  mlAuditIssues = [],
  selectedAuditIssue = null,
  onAuditMarkerClick = null,
  selectedLineRange = null,
  onSelectLineRange = null,
  onClearLineRange = null,
  onExplainBlock = null,
}) {
  // Build a fast lookup: lineNumber → SafeInsertionPoint
  const safeLineMap = useMemo(() => {
    const map = {};
    for (const pt of safeInsertionPoints) {
      map[pt.line_number] = pt;
    }
    return map;
  }, [safeInsertionPoints]);

  // Stage 14: lineNumber → MLAuditIssue[]  (an ARRAY — several issues can share a line)
  const auditLineMap = useMemo(() => {
    const map = {};
    for (const issue of mlAuditIssues) {
      if (!map[issue.line_number]) map[issue.line_number] = [];
      map[issue.line_number].push(issue);
    }
    return map;
  }, [mlAuditIssues]);

  // Stage 15: Auto-detected syntactic blocks
  const detectedBlocks = useMemo(() => detectCodeBlocks(code), [code]);

  // Anchor line for Shift+click range selection
  const [anchorLine, setAnchorLine] = useState(null);

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

  const handleLineClick = (lineNum, e) => {
    if (e?.shiftKey && anchorLine != null) {
      const start = Math.min(anchorLine, lineNum);
      const end = Math.max(anchorLine, lineNum);
      onSelectLineRange &&
        onSelectLineRange({
          startLine: start,
          endLine: end,
          blockType: 'selection',
          label: `Lines ${start}–${end}`,
        });
    } else {
      setAnchorLine(lineNum);
      if (onLineClick) {
        onLineClick(lineNum);
      }
    }
  };

  const handleBlockSelect = (block) => {
    setAnchorLine(block.startLine);
    onSelectLineRange &&
      onSelectLineRange({
        startLine: block.startLine,
        endLine: block.endLine,
        blockType: block.type,
        label: block.label,
      });

    const el = lineRefs.current[block.startLine];
    if (el) {
      el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-950 overflow-hidden font-mono">
      {/* Header */}
      <div className="shrink-0 flex items-center justify-between px-3 py-1.5 bg-slate-900 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
          <span className="text-xs font-mono text-slate-300 font-medium">{fileName || 'Code Editor'}</span>
          <span className="text-[10px] text-slate-500 font-mono hidden sm:inline">(read-only)</span>
        </div>
        <span className="text-xs font-mono text-slate-500">{lines.length} lines</span>
      </div>

      {/* Stage 15: Auto-select block buttons toolbar */}
      {detectedBlocks.length > 0 && (
        <div className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-slate-900/90 border-b border-slate-800 overflow-x-auto text-[11px] font-mono scrollbar-none">
          <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider shrink-0 flex items-center gap-1 mr-1">
            <span className="text-indigo-400">⚡</span>
            <span>Blocks:</span>
          </span>
          {detectedBlocks.map((block) => {
            const isBlockActive =
              selectedLineRange?.startLine === block.startLine &&
              selectedLineRange?.endLine === block.endLine;
            return (
              <button
                key={block.id}
                type="button"
                onClick={() => handleBlockSelect(block)}
                className={`shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-medium transition-all cursor-pointer border shadow-sm ${
                  isBlockActive
                    ? 'bg-indigo-500/25 border-indigo-400 text-indigo-200 ring-1 ring-indigo-400/40'
                    : 'bg-slate-800/90 hover:bg-slate-800 border-slate-700/70 hover:border-slate-600 text-slate-300 hover:text-slate-100'
                }`}
                title={`Select ${block.type} block (Lines ${block.startLine}–${block.endLine})`}
              >
                <span>{block.icon}</span>
                <span className="font-semibold">{block.label}</span>
                <span className="text-[9px] opacity-70">
                  (L{block.startLine}–{block.endLine})
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Stage 15: Active Multi-line Selection Bar */}
      {selectedLineRange && (
        <div className="shrink-0 flex items-center justify-between px-3 py-1.5 bg-indigo-950/40 border-b border-indigo-500/30 text-xs font-mono">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse" />
            <span className="text-indigo-200 font-semibold text-[11px]">
              Selected {selectedLineRange.blockType ? `[${selectedLineRange.blockType}]` : ''} Lines{' '}
              <span className="text-white font-bold">{selectedLineRange.startLine}–{selectedLineRange.endLine}</span>
              <span className="text-indigo-300/70 text-[10px] ml-1">
                ({selectedLineRange.endLine - selectedLineRange.startLine + 1} lines)
              </span>
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            {onExplainBlock && (
              <button
                type="button"
                onClick={() => onExplainBlock(selectedLineRange)}
                className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/40 text-cyan-300 text-[10px] font-semibold transition-all cursor-pointer shadow-sm"
                title="Explain this block using IBM Bob"
              >
                <span>⚡</span>
                <span>Explain Block</span>
              </button>
            )}
            {onClearLineRange && (
              <button
                type="button"
                onClick={onClearLineRange}
                className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200 text-xs transition-colors cursor-pointer"
                title="Clear selected lines"
              >
                ✕
              </button>
            )}
          </div>
        </div>
      )}

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

          // Stage 15: Is line inside the selected line range?
          const isSelectedRange =
            selectedLineRange != null &&
            lineNum >= selectedLineRange.startLine &&
            lineNum <= selectedLineRange.endLine;

          // Stage 14: hazard markers for this line
          const auditIssues = auditLineMap[lineNum];
          const hasAudit = !!auditIssues && auditIssues.length > 0;
          const lineSeverity = hasAudit ? worstSeverity(auditIssues) : null;
          const isAuditSelected =
            hasAudit && auditIssues.some((i) => i.issue_id === selectedAuditIssue?.issue_id);
          // Cycle through the issues on this line on repeated clicks.
          const activeAuditIndex = hasAudit
            ? Math.max(
                0,
                auditIssues.findIndex((i) => i.issue_id === selectedAuditIssue?.issue_id)
              )
            : 0;

          // Hazard tint only applies when the line is not showing the active/skipped state.
          const hazardTint =
            hasAudit && !isActive && !isSkipped && !isSelectedRange ? HAZARD_ROW_TINT[lineSeverity] : null;

          return (
            <div
              key={lineNum}
              ref={(el) => {
                if (el) lineRefs.current[lineNum] = el;
              }}
              onClick={(e) => handleLineClick(lineNum, e)}
              className={`flex items-stretch min-w-max transition-colors duration-100 cursor-pointer ${
                isSelectedRange
                  ? isActive
                    ? 'bg-indigo-950/60 border-l-2 border-cyan-400 shadow-sm'
                    : 'bg-indigo-950/40 border-l-2 border-indigo-500/80 shadow-inner'
                  : isActive
                    ? 'bg-cyan-500/15 border-l-2 border-cyan-400 shadow-sm'
                    : isSkipped
                      ? 'bg-red-950/20 border-l-2 border-red-800/40 opacity-40'
                      : hazardTint || 'border-l-2 border-transparent hover:bg-slate-800/40'
              }`}
            >
              {/* Gutter: line number */}
              <div
                onClick={(e) => {
                  e.stopPropagation();
                  handleLineClick(lineNum, e);
                }}
                className={`shrink-0 w-10 text-right pr-2 py-0.5 select-none font-mono text-[11px] cursor-pointer hover:text-cyan-300 ${
                  isSelectedRange
                    ? 'text-indigo-300 font-bold bg-indigo-950/70'
                    : isActive
                      ? 'text-cyan-400 font-bold bg-cyan-950/40'
                      : isSkipped
                        ? 'text-red-700 bg-slate-900/40'
                        : 'text-slate-600 bg-slate-900/40'
                }`}
                title="Click line / Shift+click to select range"
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

              {/* Stage 14 gutter column: hazard stripe on ModelLens-flagged lines */}
              <div className="shrink-0 w-4 flex items-center justify-center">
                {hasAudit ? (
                  <button
                    type="button"
                    title={`[ModelLens ${lineSeverity}] Line ${lineNum}: ${auditIssues[activeAuditIndex].title}${auditIssues.length > 1 ? ` (+${auditIssues.length - 1} more)` : ''}`}
                    onClick={() =>
                      onAuditMarkerClick &&
                      onAuditMarkerClick(auditIssues[activeAuditIndex])
                    }
                    className={`group relative w-2.5 h-6 rounded-sm border transition-all cursor-pointer shadow-sm ${
                      isAuditSelected
                        ? 'ring-2 ring-white/60 scale-110'
                        : 'hover:scale-110 hover:brightness-125'
                    } ${SEVERITY_META[lineSeverity]?.border ?? 'border-slate-600'}`}
                    style={{ backgroundImage: HAZARD_FILL[lineSeverity] }}
                    aria-label={`[ModelLens ${lineSeverity}] Line ${lineNum}: ${auditIssues[activeAuditIndex].title}`}
                  >
                    {auditIssues.length > 1 && (
                      <span className="absolute -top-1.5 -right-1.5 min-w-[13px] h-[13px] px-[2px] rounded-full bg-slate-900 border border-slate-500 text-[8px] font-mono font-bold text-slate-200 flex items-center justify-center">
                        {auditIssues.length}
                      </span>
                    )}
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
