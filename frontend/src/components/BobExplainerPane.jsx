import React, { useEffect, useState, useCallback, useRef } from 'react';
import { explainStep } from '../api/traceClient';
import { explanationCache, pendingRequests } from '../api/explanationCache';

/**
 * BobExplainerPane — Stage 12: IBM Bob Contextual Line Intent Explainer.
 *
 * Displays live AI explanations for the current trace step:
 *   - intent_summary: high-level intent behind teammate's code on this line
 *   - detailed_explanation: mechanical execution and data-flow breakdown
 *   - teammate_logic_note: why the teammate structured the logic this way
 *   - safe_to_extend: badge indicating whether logic can be hooked safely
 *   - continuation_tip: concrete guidance on where and how to extend logic
 *
 * Features:
 *   - Explicit "Explain with Bob" button — no API call fires until the user
 *     clicks it, preventing wasteful requests while scrubbing the trace.
 *   - Per-step caching keyed by step_id (subsequent visits to a step are free)
 *   - Cache status indicator (⚡ Cached vs Live AI)
 *   - Graceful loading skeleton and retry button on network errors
 *   - Integration with Stage 10 safe insertion points on the current line
 */
export default function BobExplainerPane({
  currentStep,
  currentStepIndex,
  filename = 'teammate_pipeline.py',
  safeInsertionPoints = [],
  onSelectSafePoint = null,
}) {
  const stepId = currentStep?.step_id;
  const lineNumber = currentStep?.line_number;
  const codeLine = currentStep?.code_line;

  // 1. Derive cached explanation directly during render
  const cachedData =
    stepId !== undefined && stepId !== null ? explanationCache.get(stepId) : null;

  // 2. Track async fetched state (set only after promises resolve)
  const [asyncState, setAsyncState] = useState({
    stepId: null,
    data: null,
    error: null,
  });

  // 3. Whether the user has requested an explanation for the current stepId.
  //    Resets to false whenever stepId changes so the button reappears on new steps
  //    (unless that step is already cached).
  const [explainRequested, setExplainRequested] = useState(false);

  // Keep track of the last stepId we reset the flag for
  const lastResetStepIdRef = useRef(null);

  const [retryCounter, setRetryCounter] = useState(0);

  const isCurrentStepInAsync = asyncState.stepId === stepId;
  const currentStepData = isCurrentStepInAsync ? asyncState.data : null;
  const error = isCurrentStepInAsync ? asyncState.error : null;

  // Active explanation: memory cache takes precedence
  const explanation = cachedData || currentStepData;
  const isFromCache = Boolean(cachedData);

  // When the step changes, reset the "requested" flag so the button reappears
  // for steps that haven't been explained yet.
  useEffect(() => {
    if (stepId !== lastResetStepIdRef.current) {
      lastResetStepIdRef.current = stepId;
      // If this step is already cached there's nothing to request — skip reset
      if (!explanationCache.has(stepId)) {
        setExplainRequested(false);
      }
    }
  }, [stepId]);

  // loading is true only while a fetch is actually in flight
  const loading = explainRequested && !explanation && !error && Boolean(currentStep);

  // Whether to show the idle prompt (no explanation, not loading, not errored)
  const showPromptButton = Boolean(currentStep) && !explanation && !explainRequested;

  // Check if current line matches any Safe Insertion Point from Stage 10
  const matchingSafePoint = safeInsertionPoints.find(
    (pt) => pt.line_number === lineNumber
  );

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
