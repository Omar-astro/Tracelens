import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { explainStep, explainBlock } from '../api/traceClient';
import {
  explanationCache,
  pendingRequests,
  blockExplanationCache,
  pendingBlockRequests,
} from '../api/explanationCache';

/**
 * BobExplainerPane — Stage 12: IBM Bob Contextual Line Intent Explainer.
 * Stage 15: Syntactic multi-line and block explainer mode.
 *
 * Displays live AI explanations for:
 *   1) Single trace step (active line):
 *      - Logic Note (first)
 *      - Intent summary & Safe to Extend badge
 *      - Detailed explanation
 *      - Continuation tip
 *   2) Selected multi-line block (for, while, if, function, custom range):
 *      - Logic Note (first)
 *      - Block intent & Safe to Extend badge
 *      - Mechanical & logical breakdown
 *      - Variables involved
 *      - Safe extension guidance
 */
export default function BobExplainerPane({
  currentStep,
  currentStepIndex,
  code = '',
  filename = 'teammate_pipeline.py',
  safeInsertionPoints = [],
  onSelectSafePoint = null,
  selectedLineRange = null,
  onClearLineRange = null,
  terminalVariables = {},
}) {
  const stepId = currentStep?.step_id;
  const lineNumber = currentStep?.line_number;
  const codeLine = currentStep?.code_line;

  // ---------------------------------------------------------------------------
  // 1. Single Step Explanation State
  // ---------------------------------------------------------------------------
  const cachedData =
    stepId !== undefined && stepId !== null ? explanationCache.get(stepId) : null;

  const [asyncState, setAsyncState] = useState({
    stepId: null,
    data: null,
    error: null,
  });

  const [explainRequested, setExplainRequested] = useState(false);
  const lastResetStepIdRef = useRef(null);
  const [retryCounter, setRetryCounter] = useState(0);

  const isCurrentStepInAsync = asyncState.stepId === stepId;
  const currentStepData = isCurrentStepInAsync ? asyncState.data : null;
  const error = isCurrentStepInAsync ? asyncState.error : null;

  const explanation = cachedData || currentStepData;
  const isFromCache = Boolean(cachedData);

  useEffect(() => {
    if (stepId !== lastResetStepIdRef.current) {
      lastResetStepIdRef.current = stepId;
      if (!explanationCache.has(stepId)) {
        setExplainRequested(false);
      }
    }
  }, [stepId]);

  const loading = explainRequested && !explanation && !error && Boolean(currentStep);
  const showPromptButton = Boolean(currentStep) && !explanation && !explainRequested;

  const matchingSafePoint = safeInsertionPoints.find(
    (pt) => pt.line_number === lineNumber
  );

  // ---------------------------------------------------------------------------
  // 2. Multi-Line Block Explanation State (Stage 15)
  // ---------------------------------------------------------------------------
  const isBlockMode = Boolean(selectedLineRange);
  const blockKey = selectedLineRange
    ? `${selectedLineRange.startLine}_${selectedLineRange.endLine}`
    : null;

  const cachedBlockData = blockKey ? blockExplanationCache.get(blockKey) : null;

  const [asyncBlockState, setAsyncBlockState] = useState({
    blockKey: null,
    data: null,
    error: null,
  });

  const [blockExplainRequested, setBlockExplainRequested] = useState(false);
  const lastResetBlockKeyRef = useRef(null);
  const [blockRetryCounter, setBlockRetryCounter] = useState(0);

  const isCurrentBlockInAsync = asyncBlockState.blockKey === blockKey;
  const currentBlockData = isCurrentBlockInAsync ? asyncBlockState.data : null;
  const blockError = isCurrentBlockInAsync ? asyncBlockState.error : null;

  const blockExplanation = cachedBlockData || currentBlockData;
  const isBlockFromCache = Boolean(cachedBlockData);

  // Extract the text of the selected lines
  const selectedSnippet = useMemo(() => {
    if (!selectedLineRange || !code) return '';
    const allLines = code.split('\n');
    const startIdx = Math.max(0, selectedLineRange.startLine - 1);
    const endIdx = Math.min(allLines.length, selectedLineRange.endLine);
    return allLines.slice(startIdx, endIdx).join('\n');
  }, [code, selectedLineRange]);

  useEffect(() => {
    if (blockKey !== lastResetBlockKeyRef.current) {
      lastResetBlockKeyRef.current = blockKey;
      if (blockKey && !blockExplanationCache.has(blockKey)) {
        setBlockExplainRequested(false);
      }
    }
  }, [blockKey]);

  const blockLoading =
    blockExplainRequested && !blockExplanation && !blockError && Boolean(selectedLineRange);
  const showBlockPrompt =
    Boolean(selectedLineRange) && !blockExplanation && !blockExplainRequested;


  useEffect(() => {
    // Only fetch when the user has explicitly requested it
    if (!explainRequested) return;
    if (!currentStep || typeof currentStep.step_id === 'undefined') return;

    const id = currentStep.step_id;
    if (explanationCache.has(id)) {
      return;
    }

    let isSubscribed = true;

    async function loadExplanation() {
      if (pendingRequests.has(id)) {
        try {
          const result = await pendingRequests.get(id);
          if (isSubscribed) {
            setAsyncState({ stepId: id, data: result, error: null });
          }
        } catch (err) {
          if (isSubscribed) {
            setAsyncState({
              stepId: id,
              data: null,
              error: err.message || 'Failed to retrieve step explanation',
            });
          }
        }
        return;
      }

      const stepPromise = explainStep({
        step_id: currentStep.step_id,
        line_number: currentStep.line_number,
        code_line: currentStep.code_line ?? '',
        filename: filename || 'teammate_pipeline.py',
        variable_deltas: currentStep.variable_deltas ?? {},
        all_variables: currentStep.all_variables ?? {},
      });

      pendingRequests.set(id, stepPromise);

      try {
        const data = await stepPromise;
        explanationCache.set(id, data);
        if (isSubscribed) {
          setAsyncState({ stepId: id, data, error: null });
        }
      } catch (err) {
        if (isSubscribed) {
          setAsyncState({
            stepId: id,
            data: null,
            error: err.message || 'Failed to fetch Bob explanation for this step.',
          });
        }
      } finally {
        pendingRequests.delete(id);
      }
    }

    loadExplanation();

    return () => {
      isSubscribed = false;
    };
  }, [stepId, currentStepIndex, currentStep, filename, retryCounter, explainRequested]);

  // ---------------------------------------------------------------------------
  // Block Fetch Effect (Stage 15)
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!blockExplainRequested || !selectedLineRange || !code) return;
    if (blockExplanationCache.has(blockKey)) return;

    let isSubscribed = true;

    async function loadBlockExplanation() {
      if (pendingBlockRequests.has(blockKey)) {
        try {
          const res = await pendingBlockRequests.get(blockKey);
          if (isSubscribed) {
            setAsyncBlockState({ blockKey, data: res, error: null });
          }
        } catch (err) {
          if (isSubscribed) {
            setAsyncBlockState({
              blockKey,
              data: null,
              error: err?.message || 'Failed to retrieve block explanation.',
            });
          }
        }
        return;
      }

      const reqPromise = explainBlock({
        code,
        start_line: selectedLineRange.startLine,
        end_line: selectedLineRange.endLine,
        block_type: selectedLineRange.blockType || 'block',
        selected_code: selectedSnippet,
        all_variables: currentStep?.all_variables || terminalVariables || {},
        filename: filename || 'teammate_pipeline.py',
      });

      pendingBlockRequests.set(blockKey, reqPromise);

      try {
        const data = await reqPromise;
        blockExplanationCache.set(blockKey, data);
        if (isSubscribed) {
          setAsyncBlockState({ blockKey, data, error: null });
        }
      } catch (err) {
        if (isSubscribed) {
          setAsyncBlockState({
            blockKey,
            data: null,
            error: err?.message || 'Failed to fetch block explanation from Bob.',
          });
        }
      } finally {
        pendingBlockRequests.delete(blockKey);
      }
    }

    loadBlockExplanation();

    return () => {
      isSubscribed = false;
    };
  }, [
    blockKey,
    blockExplainRequested,
    selectedLineRange,
    code,
    selectedSnippet,
    currentStep,
    terminalVariables,
    filename,
    blockRetryCounter,
  ]);

  const handleExplain = useCallback(() => {
    setExplainRequested(true);
  }, []);

  const handleRetry = useCallback(() => {
    if (stepId !== undefined && stepId !== null) {
      explanationCache.delete(stepId);
      setRetryCounter((c) => c + 1);
      setExplainRequested(true);
    }
  }, [stepId]);

  const handleBlockExplain = useCallback(() => {
    setBlockExplainRequested(true);
  }, []);

  const handleBlockRetry = useCallback(() => {
    if (blockKey) {
      blockExplanationCache.delete(blockKey);
      setBlockRetryCounter((c) => c + 1);
      setBlockExplainRequested(true);
    }
  }, [blockKey]);

  // ---------------------------------------------------------------------------
  // A. Multi-Line Block Explainer Render (Stage 15)
  // ---------------------------------------------------------------------------
  if (isBlockMode) {
    return (
      <div className="flex flex-col h-full overflow-hidden bg-slate-950/40">
        {/* Top Header */}
        <div className="shrink-0 flex items-center justify-between px-3.5 py-2.5 border-b border-slate-800 bg-slate-900/70">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded bg-gradient-to-br from-indigo-500 via-sky-500 to-cyan-400 flex items-center justify-center text-slate-950 shadow-sm font-black text-[10px]">
              ⚡
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-bold text-slate-100 font-mono tracking-tight">
                  IBM Bob
                </span>
                <span className="text-[10px] font-mono text-indigo-300 bg-indigo-500/10 border border-indigo-500/20 px-1.5 py-0.2 rounded font-semibold">
                  Block Explainer
                </span>
              </div>
            </div>
          </div>

          {/* Right Badges & Return Button */}
          <div className="flex items-center gap-1.5">
            {isBlockFromCache ? (
              <span
                className="text-[9px] font-mono text-cyan-400 bg-cyan-500/10 border border-cyan-500/20 px-1.5 py-0.5 rounded flex items-center gap-1"
                title="Served from in-memory cache"
              >
                <span>⚡</span>
                <span>Cached</span>
              </span>
            ) : !blockLoading && !blockError && blockExplanation ? (
              <span className="text-[9px] font-mono text-indigo-300 bg-indigo-500/10 border border-indigo-500/20 px-1.5 py-0.5 rounded flex items-center gap-1">
                <span>●</span>
                <span>Live AI</span>
              </span>
            ) : null}

            {onClearLineRange && (
              <button
                type="button"
                onClick={onClearLineRange}
                className="text-[10px] font-mono text-slate-400 hover:text-slate-100 bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700/60 px-2 py-0.5 rounded transition-colors cursor-pointer"
                title="Exit block mode and return to step-by-step trace"
              >
                ✕ Exit Block
              </button>
            )}
          </div>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-3.5 space-y-3">
          {/* Selected Block Code Preview */}
          {selectedSnippet && (
            <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-2.5 font-mono text-xs shadow-inner">
              <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1.5 pb-1 border-b border-slate-800">
                <span className="font-semibold text-indigo-300">
                  {selectedLineRange.blockType ? `[${selectedLineRange.blockType}]` : 'Selected Block'}
                </span>
                <span className="text-slate-500">
                  Lines {selectedLineRange.startLine}–{selectedLineRange.endLine} ({selectedLineRange.endLine - selectedLineRange.startLine + 1} lines)
                </span>
              </div>
              <pre className="max-h-40 overflow-y-auto text-[11px] text-cyan-300/90 leading-5 whitespace-pre">
                {selectedSnippet}
              </pre>
            </div>
          )}

          {/* Idle Prompt */}
          {showBlockPrompt && (
            <div className="flex flex-col items-center justify-center gap-3 py-6 px-4">
              <div className="text-slate-400 text-[11px] font-mono text-center leading-relaxed">
                Selected <span className="text-indigo-300 font-semibold">{selectedLineRange.label || `Lines ${selectedLineRange.startLine}–${selectedLineRange.endLine}`}</span>
                <br />
                <span className="text-slate-500">Explain this multi-line block's intent, mechanics, variables, and safe extension guidance.</span>
              </div>
              <button
                type="button"
                onClick={handleBlockExplain}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-cyan-500/20 to-indigo-500/20 hover:from-cyan-500/30 hover:to-indigo-500/30 border border-cyan-500/40 hover:border-cyan-500/60 text-cyan-200 text-xs font-mono font-semibold transition-all cursor-pointer shadow-sm"
              >
                <span className="text-sm leading-none">⚡</span>
                Explain Block with Bob
              </button>
              <p className="text-[10px] text-slate-600 font-mono text-center">
                Uses IBM Bob / watsonx context analyzer · cached in memory
              </p>
            </div>
          )}

          {/* Loading Skeleton */}
          {blockLoading && (
            <div className="space-y-3 animate-pulse">
              <div className="p-3 rounded-lg bg-slate-900/50 border border-slate-800 space-y-2">
                <div className="h-3 bg-slate-800 rounded w-1/3" />
                <div className="h-3.5 bg-slate-800/80 rounded w-5/6" />
              </div>
              <div className="p-3 rounded-lg bg-slate-900/50 border border-slate-800 space-y-2">
                <div className="h-3 bg-slate-800 rounded w-1/4" />
                <div className="h-3 bg-slate-800/70 rounded w-full" />
                <div className="h-3 bg-slate-800/70 rounded w-4/5" />
              </div>
              <div className="p-3 rounded-lg bg-slate-900/50 border border-slate-800 space-y-2">
                <div className="h-3 bg-slate-800 rounded w-2/5" />
                <div className="h-3 bg-slate-800/70 rounded w-3/4" />
              </div>
            </div>
          )}

          {/* Error State */}
          {!blockLoading && blockError && (
            <div className="p-3 rounded-lg bg-red-950/30 border border-red-900/50 text-red-300 space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold font-mono">
                <span>⚠</span>
                <span>Block Explanation Unavailable</span>
              </div>
              <p className="text-[11px] leading-relaxed text-red-200/80 font-mono">
                {blockError}
              </p>
              <button
                type="button"
                onClick={handleBlockRetry}
                className="px-2.5 py-1 rounded bg-red-900/40 hover:bg-red-900/60 border border-red-700/50 text-xs font-mono text-red-200 transition-colors cursor-pointer"
              >
                Retry
              </button>
            </div>
          )}

          {/* Content View: BlockExplanation */}
          {!blockLoading && !blockError && blockExplanation && (
            <div className="space-y-3">
              {/* 1. Logic Note (Generic, at the top) */}
              <div className="p-3 rounded-lg bg-indigo-950/15 border border-indigo-500/20 space-y-1.5 shadow-sm">
                <div className="flex items-center gap-1.5">
                  <span className="text-indigo-400 text-xs font-mono">🧠</span>
                  <span className="text-[10px] font-mono uppercase tracking-wider font-bold text-indigo-300">
                    Logic Note
                  </span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  {blockExplanation.teammate_logic_note}
                </p>
              </div>

              {/* 2. Intent Summary */}
              <div className="p-3 rounded-lg bg-gradient-to-br from-cyan-950/20 via-slate-900/60 to-indigo-950/20 border border-cyan-500/25 shadow-sm">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] font-mono uppercase tracking-wider font-bold text-cyan-400">
                    Block Intent
                  </span>
                  {blockExplanation.safe_to_extend ? (
                    <span className="text-[9px] font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/25 px-1.5 py-0.5 rounded font-semibold flex items-center gap-1">
                      <span>✓</span>
                      <span>Safe to Extend</span>
                    </span>
                  ) : (
                    <span className="text-[9px] font-mono text-amber-400 bg-amber-500/10 border border-amber-500/25 px-1.5 py-0.5 rounded font-semibold flex items-center gap-1">
                      <span>⚠</span>
                      <span>Active Scope</span>
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-100 font-medium leading-relaxed">
                  {blockExplanation.intent_summary}
                </p>
              </div>

              {/* 3. Detailed Breakdown */}
              <div className="p-3 rounded-lg bg-slate-900/50 border border-slate-800 space-y-1.5 shadow-sm">
                <span className="text-[10px] font-mono uppercase tracking-wider font-bold text-slate-400">
                  Mechanical &amp; Logical Breakdown
                </span>
                <p className="text-xs text-slate-300 leading-relaxed">
                  {blockExplanation.detailed_explanation}
                </p>
              </div>

              {/* 4. Variables Involved */}
              {Array.isArray(blockExplanation.variables_involved) &&
                blockExplanation.variables_involved.length > 0 && (
                  <div className="p-3 rounded-lg bg-slate-900/50 border border-slate-800 space-y-2 shadow-sm">
                    <span className="text-[10px] font-mono uppercase tracking-wider font-bold text-slate-400">
                      Variables Involved
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {blockExplanation.variables_involved.map((v) => (
                        <span
                          key={v}
                          className="px-2 py-0.5 rounded text-[10px] font-mono bg-slate-800 text-amber-300 border border-slate-700 font-semibold"
                        >
                          {v}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

              {/* 5. Safe Extension Tip */}
              {blockExplanation.continuation_tip && (
                <div className="p-3 rounded-lg bg-emerald-950/15 border border-emerald-500/20 space-y-1.5 shadow-sm">
                  <div className="flex items-center gap-1.5">
                    <span className="text-emerald-400 text-xs font-mono">💡</span>
                    <span className="text-[10px] font-mono uppercase tracking-wider font-bold text-emerald-300">
                      Safe Extension Guidance
                    </span>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed font-mono">
                    {blockExplanation.continuation_tip}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // B. Single Step Explainer Render (Existing behavior preserved)
  // ---------------------------------------------------------------------------
  return (
    <div className="flex flex-col h-full overflow-hidden bg-slate-950/40">
      {/* ── Top Header ──────────────────────────────────────────────────────── */}
      <div className="shrink-0 flex items-center justify-between px-3.5 py-2.5 border-b border-slate-800 bg-slate-900/70">
        <div className="flex items-center gap-2">
          {/* Bob AI Avatar / Emblem */}
          <div className="w-5 h-5 rounded bg-gradient-to-br from-cyan-500 to-indigo-600 flex items-center justify-center text-slate-950 shadow-sm font-black text-[10px]">
            ⚡
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold text-slate-100 font-mono tracking-tight">
                IBM Bob
              </span>
              <span className="text-[10px] font-mono text-cyan-400 bg-cyan-500/10 border border-cyan-500/20 px-1.5 py-0.2 rounded font-semibold">
                Explainer
              </span>
            </div>
          </div>
        </div>

        {/* Right Badges */}
        <div className="flex items-center gap-1.5">
          {isFromCache ? (
            <span
              className="text-[9px] font-mono text-cyan-400 bg-cyan-500/10 border border-cyan-500/20 px-1.5 py-0.5 rounded flex items-center gap-1"
              title="Served from in-memory per-step cache (no network call)"
            >
              <span>⚡</span>
              <span>Cached</span>
            </span>
          ) : !loading && !error && explanation ? (
            <span className="text-[9px] font-mono text-indigo-300 bg-indigo-500/10 border border-indigo-500/20 px-1.5 py-0.5 rounded flex items-center gap-1">
              <span>●</span>
              <span>Live AI</span>
            </span>
          ) : null}

          {lineNumber && (
            <span className="text-[10px] font-mono text-slate-300 bg-slate-800/80 border border-slate-700/60 px-2 py-0.5 rounded">
              Line <span className="text-cyan-400 font-bold">{lineNumber}</span>
            </span>
          )}
        </div>
      </div>

      {/* ── Scrollable Body ─────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto p-3.5 space-y-3">
        {/* Active Line Code Preview */}
        {codeLine && (
          <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-2 font-mono text-xs shadow-inner">
            <div className="flex items-center gap-2">
              <span className="text-slate-500 select-none text-[11px] font-semibold shrink-0">
                L{lineNumber}:
              </span>
              <code className="text-cyan-300 truncate font-mono text-[11px]">
                {codeLine}
              </code>
            </div>
          </div>
        )}

        {/* ── Idle Prompt Button ─────────────────────────────────────────────
            Shown when there is a step but the user hasn't asked for an
            explanation yet. No API call is made until this button is clicked. */}
        {showPromptButton && (
          <div className="flex flex-col items-center justify-center gap-3 py-6 px-4">
            <div className="text-slate-500 text-[11px] font-mono text-center leading-relaxed">
              Step <span className="text-slate-300 font-semibold">#{stepId}</span> — Line{' '}
              <span className="text-slate-300 font-semibold">{lineNumber}</span>
              <br />
              <span className="text-slate-600">No explanation loaded yet.</span>
            </div>
            <button
              type="button"
              onClick={handleExplain}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 hover:border-cyan-500/50 text-cyan-300 hover:text-cyan-200 text-xs font-mono font-semibold transition-all cursor-pointer shadow-sm"
            >
              <span className="text-sm leading-none">⚡</span>
              Explain with Bob
            </button>
            <p className="text-[10px] text-slate-600 font-mono text-center">
              Uses one API request · result is cached per step
            </p>
          </div>
        )}

        {/* Safe Insertion Point Link (if current line is flagged in Stage 10) */}
        {matchingSafePoint && (
          <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-start justify-between gap-2 shadow-sm">
            <div className="flex items-start gap-2">
              <span className="text-amber-400 text-sm mt-0.5 leading-none">★</span>
              <div>
                <p className="text-[11px] font-mono font-semibold text-amber-300">
                  Safe Insertion Point
                </p>
                <p className="text-[10px] text-slate-300 leading-tight">
                  Accumulator <code className="text-amber-200 font-bold">{matchingSafePoint.target_variable}</code> has stabilized.
                </p>
              </div>
            </div>
            {onSelectSafePoint && (
              <button
                type="button"
                onClick={() => onSelectSafePoint(matchingSafePoint)}
                className="shrink-0 px-2 py-1 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-[10px] font-mono font-semibold transition-colors cursor-pointer"
              >
                View Hook →
              </button>
            )}
          </div>
        )}

        {/* Loading State / Skeleton */}
        {loading && (
          <div className="space-y-3 animate-pulse">
            <div className="p-3 rounded-lg bg-slate-900/50 border border-slate-800 space-y-2">
              <div className="h-3 bg-slate-800 rounded w-1/3" />
              <div className="h-3.5 bg-slate-800/80 rounded w-5/6" />
            </div>
            <div className="p-3 rounded-lg bg-slate-900/50 border border-slate-800 space-y-2">
              <div className="h-3 bg-slate-800 rounded w-1/4" />
              <div className="h-3 bg-slate-800/70 rounded w-full" />
              <div className="h-3 bg-slate-800/70 rounded w-4/5" />
            </div>
            <div className="p-3 rounded-lg bg-slate-900/50 border border-slate-800 space-y-2">
              <div className="h-3 bg-slate-800 rounded w-2/5" />
              <div className="h-3 bg-slate-800/70 rounded w-3/4" />
            </div>
          </div>
        )}

        {/* Error State */}
        {!loading && error && (
          <div className="p-3 rounded-lg bg-red-950/30 border border-red-900/50 text-red-300 space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold font-mono">
              <span>⚠</span>
              <span>Explanation Unavailable</span>
            </div>
            <p className="text-[11px] leading-relaxed text-red-200/80 font-mono">
              {error}
            </p>
            <button
              type="button"
              onClick={handleRetry}
              className="px-2.5 py-1 rounded bg-red-900/40 hover:bg-red-900/60 border border-red-700/50 text-xs font-mono text-red-200 transition-colors cursor-pointer"
            >
              Retry
            </button>
          </div>
        )}

        {/* Content View: StepExplanation */}
        {!loading && !error && explanation && (
          <div className="space-y-3">
            {/* 1. Logic Note (Generic, moved to top) */}
            <div className="p-3 rounded-lg bg-indigo-950/15 border border-indigo-500/20 space-y-1.5 shadow-sm">
              <div className="flex items-center gap-1.5">
                <span className="text-indigo-400 text-xs font-mono">🧠</span>
                <span className="text-[10px] font-mono uppercase tracking-wider font-bold text-indigo-300">
                  Logic Note
                </span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                {explanation.teammate_logic_note}
              </p>
            </div>

            {/* 2. Intent Summary */}
            <div className="p-3 rounded-lg bg-gradient-to-br from-cyan-950/20 via-slate-900/60 to-indigo-950/20 border border-cyan-500/25 shadow-sm">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] font-mono uppercase tracking-wider font-bold text-cyan-400">
                  Line Intent
                </span>
                {/* Safe To Extend Badge */}
                {explanation.safe_to_extend ? (
                  <span className="text-[9px] font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/25 px-1.5 py-0.5 rounded font-semibold flex items-center gap-1">
                    <span>✓</span>
                    <span>Safe to Extend</span>
                  </span>
                ) : (
                  <span className="text-[9px] font-mono text-amber-400 bg-amber-500/10 border border-amber-500/25 px-1.5 py-0.5 rounded font-semibold flex items-center gap-1">
                    <span>⚠</span>
                    <span>Active Dependency</span>
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-100 font-medium leading-relaxed">
                {explanation.intent_summary}
              </p>
            </div>

            {/* 3. Detailed Explanation */}
            <div className="p-3 rounded-lg bg-slate-900/50 border border-slate-800 space-y-1.5 shadow-sm">
              <span className="text-[10px] font-mono uppercase tracking-wider font-bold text-slate-400">
                Mechanical &amp; Logical Breakdown
              </span>
              <p className="text-xs text-slate-300 leading-relaxed">
                {explanation.detailed_explanation}
              </p>
            </div>

            {/* 4. Continuation Tip */}
            {explanation.continuation_tip && (
              <div className="p-3 rounded-lg bg-emerald-950/15 border border-emerald-500/20 space-y-1.5 shadow-sm">
                <div className="flex items-center gap-1.5">
                  <span className="text-emerald-400 text-xs font-mono">💡</span>
                  <span className="text-[10px] font-mono uppercase tracking-wider font-bold text-emerald-300">
                    Continuation Tip
                  </span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed font-mono">
                  {explanation.continuation_tip}
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

