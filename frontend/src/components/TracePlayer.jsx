import React, { useEffect, useRef, useCallback, useState } from 'react';
import CodeViewer from './CodeViewer';
import LoopVisualizer from './LoopVisualizer';
import BranchVisualizer from './BranchVisualizer';
import StateBoard from './StateBoard';
import HandoffDrawer from './HandoffDrawer';
import BobExplainerPane from './BobExplainerPane';
import MLAuditBanner from './MLAuditBanner';
import MLRemediationPanel from './MLRemediationPanel';
import HandoffSummaryPane from './HandoffSummaryPane';

/**
 * TracePlayer — Stage 7: Studio Shell + Playback Scrubber.
 * Stage 14: mounts the ModelLens risk banner and the audit / handoff-summary drawer tabs.
 *
 * 4-pane responsive layout:
 *   Left  (~40%)  : CodeViewer — read-only source with active-line highlight
 *   Center (~35%) : Visualizer canvas — placeholder (Stage 8)
 *   Right (~25%)  : Drawer — Bob Explainer / Safe Hooks / ModelLens audit / Handoff summary
 *
 * Playback state: currentStepIndex, isPlaying, playbackSpeed (0.5x / 1x / 2x)
 * Controls: step forward, step backward, play/pause, jump to start/end, free-scrub range slider
 */
export default function TracePlayer({
  code,
  traceSteps,
  currentStepIndex,
  onSelectStepIndex,
  isPlaying,
  onTogglePlay,
  playbackSpeed,
  onChangePlaybackSpeed,
  safeInsertionPoints = [],
  mode = 'logic_lens',
  mlAuditIssues = [],
  handoffSummary = null,
  onHandoffSummaryGenerated,
}) {
  // Stage 10: tracks which SafeInsertionPoint the user clicked in the gutter
  const [selectedSafePoint, setSelectedSafePoint] = useState(null);
  // Stage 12: Drawer tab view ('explainer' | 'hooks' | 'split')
  // Stage 14: adds 'audit' and 'summary'
  const [drawerTab, setDrawerTab] = useState('explainer');
  // Stage 14: tracks which MLAuditIssue the user clicked in the hazard gutter
  const [selectedAuditIssue, setSelectedAuditIssue] = useState(null);

  // When a new trace loads, drop any stale gutter selection so the drawer starts
  // clean. Adjusted during render rather than in an effect to avoid a cascading
  // second render pass.
  const [tracedCode, setTracedCode] = useState(code);
  if (tracedCode !== code) {
    setTracedCode(code);
    setSelectedAuditIssue(null);
    setSelectedSafePoint(null);
  }

  // Stage 14: the ModelLens audit is only meaningful in model_lens mode.
  const isModelLens = mode === 'model_lens';
  const auditIssues = isModelLens ? mlAuditIssues : [];

  // When a new trace loads, drop any stale selection so the drawer starts clean.
  const handleGutterMarkerClick = useCallback((point) => {
    setSelectedSafePoint(point);
    setDrawerTab('hooks');
  }, []);

  const handleAuditMarkerClick = useCallback((issue) => {
    setSelectedAuditIssue(issue);
    setDrawerTab('audit');
  }, []);

  // Clicking a severity chip in the banner opens the audit drawer on that issue.
  const handleBannerIssueSelect = useCallback((issue) => {
    setSelectedAuditIssue(issue);
    setDrawerTab('audit');
  }, []);

  const totalSteps = traceSteps.length;
  const currentStep = traceSteps[currentStepIndex] ?? traceSteps[0];

  // Terminal frame variables for the Appendix B.2 handoff prompt.
  const terminalVariables = React.useMemo(() => {
    const last = traceSteps[traceSteps.length - 1];
    return last?.all_variables ?? {};
  }, [traceSteps]);


  // ---------------------------------------------------------------------------
  // Auto-play timer
  // ---------------------------------------------------------------------------
  const intervalRef = useRef(null);

  const stopPlay = useCallback(() => {
    onTogglePlay(false);
  }, [onTogglePlay]);

  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (!isPlaying) return;

    const delay = Math.round(900 / playbackSpeed);
    intervalRef.current = setInterval(() => {
      onSelectStepIndex((prev) => {
        const next = prev + 1;
        if (next >= totalSteps) {
          // Stop cleanly at last step
          stopPlay();
          return totalSteps - 1;
        }
        return next;
      });
    }, delay);

    return () => {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    };
  }, [isPlaying, playbackSpeed, totalSteps, onSelectStepIndex, stopPlay]);

  // ---------------------------------------------------------------------------
  // Navigation helpers
  // ---------------------------------------------------------------------------
  const handleStepBack = () => {
    if (currentStepIndex > 0) onSelectStepIndex(currentStepIndex - 1);
  };

  const handleStepForward = () => {
    if (currentStepIndex < totalSteps - 1) onSelectStepIndex(currentStepIndex + 1);
  };

  const handleScrub = (e) => {
    const idx = Number(e.target.value);
    onSelectStepIndex(idx);
  };

  // Stage 7: Jump to the first step of the loop we are currently inside.
  // Only operates when currentStep has a loop_context (button is hidden otherwise).
  const handleJumpToLoopStart = () => {
    const currentLoopId = currentStep?.loop_context?.loop_id;
    if (!currentLoopId) return;
    for (let i = 0; i < totalSteps; i++) {
      if (traceSteps[i]?.loop_context?.loop_id === currentLoopId) {
        onSelectStepIndex(i);
        return;
      }
    }
  };

  // Stage 7: Jump to the exit step of the loop we are currently inside.
  // Only operates when currentStep has a loop_context (button is hidden otherwise).
  const handleJumpToLoopEnd = () => {
    const currentLoopId = currentStep?.loop_context?.loop_id;
    if (!currentLoopId) return;
    let lastMatch = -1;
    for (let i = 0; i < totalSteps; i++) {
      if (traceSteps[i]?.loop_context?.loop_id === currentLoopId) {
        lastMatch = i;
        if (traceSteps[i]?.loop_context?.is_exit_step) {
          onSelectStepIndex(i);
          return;
        }
      }
    }
    // No explicit exit step found — land on the last step bearing this loop_id.
    if (lastMatch !== -1) onSelectStepIndex(lastMatch);
  };

  // True only while the current step is inside a loop.
  const inLoop = !!currentStep?.loop_context;

  const progressPct = (((currentStepIndex + 1) / totalSteps) * 100).toFixed(1);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <div className="flex flex-col w-full flex-1 overflow-hidden min-h-0">
      {/* ── Stage 14: ModelLens Risk Banner (model_lens mode only) ─────────── */}
      <MLAuditBanner
        mode={mode}
        issues={auditIssues}
        onSelectIssue={handleBannerIssueSelect}
      />

      {/* ── Playback Controls Dock ─────────────────────────────────────────── */}
      <section className="shrink-0 bg-slate-900 border-b border-slate-800 px-4 py-2.5">
        {/* Row 1: Buttons + speed + step counter */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 mb-2.5">
          <div className="flex items-center gap-2 flex-wrap">
            {/* Primary Stepper Dock */}
            <div className="flex items-center bg-slate-800/80 border border-slate-700/60 rounded-lg p-0.5 shadow-sm">
              {/* Jump to start */}
              <button
                type="button"
                onClick={() => onSelectStepIndex(0)}
                disabled={currentStepIndex === 0}
                className="p-1.5 disabled:opacity-30 hover:text-cyan-400 text-slate-400 transition-colors rounded hover:bg-slate-700/60"
                title="Jump to Start"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M6 6h2v12H6zm3.5 6 8.5 6V6z" />
                </svg>
              </button>

              {/* Step Backward */}
              <button
                type="button"
                onClick={handleStepBack}
                disabled={currentStepIndex === 0}
                className="p-1.5 disabled:opacity-30 hover:text-cyan-400 text-slate-400 transition-colors rounded hover:bg-slate-700/60"
                title="Step Backward (Left Arrow)"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M6 18V6h2v5.5l8.5-5.5V18L8 12.5V18z" />
                </svg>
              </button>

              {/* Play / Pause */}
              <button
                type="button"
                onClick={() => onTogglePlay(!isPlaying)}
                className="px-2.5 py-1 text-cyan-400 hover:text-cyan-300 transition-colors rounded hover:bg-slate-700/60 flex items-center gap-1 font-semibold text-xs"
                title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
              >
                {isPlaying ? (
                  <>
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M6 19h4V5H6zm8-14v14h4V5z" />
                    </svg>
                    <span>Pause</span>
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                    <span>Play</span>
                  </>
                )}
              </button>

              {/* Step Forward */}
              <button
                type="button"
                onClick={handleStepForward}
                disabled={currentStepIndex === totalSteps - 1}
                className="p-1.5 disabled:opacity-30 hover:text-cyan-400 text-slate-400 transition-colors rounded hover:bg-slate-700/60"
                title="Step Forward (Right Arrow)"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M18 18V6h-2v5.5L7.5 6v12L16 12.5V18z" />
                </svg>
              </button>

              {/* Jump to end */}
              <button
                type="button"
                onClick={() => onSelectStepIndex(totalSteps - 1)}
                disabled={currentStepIndex === totalSteps - 1}
                className="p-1.5 disabled:opacity-30 hover:text-cyan-400 text-slate-400 transition-colors rounded hover:bg-slate-700/60"
                title="Jump to End"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M16 6h2v12h-2zm-2.5 6L5 6v12z" />
                </svg>
              </button>
            </div>

            {/* Loop Stepper Dock — visible only while inside a loop */}
            {inLoop && (
              <div className="flex items-center bg-emerald-950/40 border border-emerald-500/30 rounded-lg p-0.5">
                <button
                  type="button"
                  onClick={handleJumpToLoopStart}
                  className="px-2 py-1 flex items-center gap-1 text-xs font-mono hover:text-emerald-300 text-emerald-400 transition-colors rounded hover:bg-emerald-900/40"
                  title={`Jump to start of ${currentStep.loop_context.loop_type} loop`}
                >
                  <span className="font-bold">⟲</span>
                  <span>Loop Start</span>
                </button>
                <div className="h-3.5 w-px bg-emerald-700/50" />
                <button
                  type="button"
                  onClick={handleJumpToLoopEnd}
                  className="px-2 py-1 flex items-center gap-1 text-xs font-mono hover:text-emerald-300 text-emerald-400 transition-colors rounded hover:bg-emerald-900/40"
                  title={`Jump to end of ${currentStep.loop_context.loop_type} loop`}
                >
                  <span>Loop End</span>
                  <span className="font-bold">⟳</span>
                </button>
              </div>
            )}

            {/* Speed toggle */}
            <div className="flex items-center bg-slate-800/80 border border-slate-700/60 rounded-lg p-0.5 text-xs font-mono">
              {[0.5, 1, 2].map((speed) => (
                <button
                  key={speed}
                  type="button"
                  onClick={() => onChangePlaybackSpeed(speed)}
                  className={`px-2 py-0.5 rounded transition-colors ${
                    playbackSpeed === speed
                      ? 'bg-cyan-500 text-slate-950 font-bold shadow-sm'
                      : 'text-slate-400 hover:text-slate-100 hover:bg-slate-700/50'
                  }`}
                >
                  {speed}x
                </button>
              ))}
            </div>

            {/* Step counter */}
            <span className="text-xs font-mono text-cyan-300 bg-cyan-500/10 border border-cyan-500/20 px-2.5 py-1 rounded-lg font-semibold">
              Step {currentStepIndex + 1} of {totalSteps}
            </span>

            {/* Active loop tag if inside loop */}
            {currentStep?.loop_context && (
              <span className="text-xs font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-1 rounded-lg flex items-center gap-1 shadow-sm">
                <span className="text-emerald-400 font-bold">⟳</span>
                <span>{currentStep.loop_context.loop_type || 'loop'}: iter {currentStep.loop_context.current_iteration ?? '?'}</span>
              </span>
            )}
          </div>

          {/* Right: Progress % and Line metadata */}
          <div className="flex items-center gap-3 text-xs font-mono">
            {currentStep && (
              <span className="text-slate-400 bg-slate-800/50 px-2.5 py-1 rounded border border-slate-700/40 hidden md:inline">
                Line <span className="text-slate-200 font-bold">{currentStep.line_number}</span>
                {' · '}
                <span className="text-cyan-400">{currentStep.event_type}</span>
              </span>
            )}
            <div className="flex items-center gap-1.5 bg-slate-800/50 px-2.5 py-1 rounded border border-slate-700/40">
              <span className="text-slate-500">PROGRESS:</span>
              <span className="text-cyan-400 font-bold">{progressPct}%</span>
            </div>
          </div>
        </div>

        {/* Row 2: Custom Sleek Timeline Scrubber Track */}
        <div className="relative w-full py-1.5 flex items-center group">
          {/* Visual Track */}
          <div
            className="relative w-full h-2 bg-slate-800 rounded-full overflow-hidden border border-slate-700/50 cursor-pointer shadow-inner"
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const clickX = e.clientX - rect.left;
              const pct = Math.max(0, Math.min(1, clickX / rect.width));
              onSelectStepIndex(Math.round(pct * (totalSteps - 1)));
            }}
          >
            {/* Active gradient fill */}
            <div
              className="h-full bg-gradient-to-r from-cyan-500 via-sky-400 to-indigo-500 rounded-full transition-all duration-100 shadow-[0_0_10px_rgba(6,182,212,0.5)]"
              style={{ width: `${totalSteps <= 1 ? 100 : (currentStepIndex / (totalSteps - 1)) * 100}%` }}
            />
          </div>

          {/* Interactive thumb marker */}
          <div
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-4 h-4 rounded-full bg-cyan-400 border-2 border-slate-950 shadow-[0_0_8px_#22d3ee] pointer-events-none transition-all duration-100"
            style={{ left: `${totalSteps <= 1 ? 0 : (currentStepIndex / (totalSteps - 1)) * 100}%` }}
          />

          {/* Full overlay invisible range input for native dragging, accessibility & touch */}
          <input
            type="range"
            min={0}
            max={totalSteps - 1}
            value={currentStepIndex}
            onChange={handleScrub}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            aria-label="Scrub through trace steps"
          />
        </div>
      </section>

      {/* ── 4-Pane Responsive Workspace ──────────────────────────────────── */}
      <div className="flex flex-col lg:flex-row flex-1 overflow-y-auto lg:overflow-hidden min-h-0">
        {/* LEFT (~40%): Code Viewer — gutter markers + skipped range */}
        <div className="w-full lg:w-[40%] min-h-[320px] lg:min-h-0 min-w-[280px] flex flex-col border-b lg:border-b-0 lg:border-r border-slate-800 overflow-hidden">
          <CodeViewer
            code={code}
            currentStep={currentStep}
            skippedRange={currentStep?.branch_context?.skipped_range ?? null}
            safeInsertionPoints={safeInsertionPoints}
            selectedSafePoint={selectedSafePoint}
            onGutterMarkerClick={setSelectedSafePoint}
            onLineClick={(lineNum) => {
              const idx = traceSteps.findIndex(s => s.line_number === lineNum);
              if (idx !== -1) onSelectStepIndex(idx);
            }}
            mlAuditIssues={auditIssues}
            selectedAuditIssue={selectedAuditIssue}
            onAuditMarkerClick={handleAuditMarkerClick}
          />
        </div>

        {/* CENTER (~35%): Stage 8 Visualizer Canvas */}
        <div className="w-full lg:w-[35%] min-h-[220px] lg:min-h-0 flex flex-col border-b lg:border-b-0 lg:border-r border-slate-800 overflow-auto p-3 gap-3 bg-slate-950/50">
          {/* LoopVisualizer — shown when step has loop_context */}
          {currentStep?.loop_context && (
            <LoopVisualizer
              currentStep={currentStep}
              allSteps={traceSteps}
              currentStepIndex={currentStepIndex}
              onJumpToIteration={onSelectStepIndex}
              onJumpToLoopExit={handleJumpToLoopEnd}
            />
          )}

          {/* BranchVisualizer — shown when step has branch_context */}
          {currentStep?.branch_context && (
            <BranchVisualizer currentStep={currentStep} />
          )}

          {/* StateBoard — always shown */}
          <StateBoard currentStep={currentStep} />
        </div>

        {/* RIGHT (~25%): Stage 10, 12 & 14 — Drawer with Bob Explainer, Handoff Drawer,
            ModelLens Remediation, and Handoff Summary */}
        <div className="w-full lg:w-[25%] min-h-[180px] lg:min-h-0 min-w-[240px] flex flex-col overflow-hidden border-l border-slate-800 bg-slate-950/30">
          {/* Drawer View Navigation Tabs */}
          <div className="shrink-0 flex items-center px-2 py-1.5 bg-slate-900 border-b border-slate-800">
            <div className="flex items-center gap-1 bg-slate-800/80 p-0.5 rounded-lg border border-slate-700/60 text-xs font-mono flex-wrap">
              <button
                type="button"
                onClick={() => setDrawerTab('explainer')}
                className={`px-2 py-0.5 rounded text-[11px] font-semibold transition-colors flex items-center gap-1 cursor-pointer ${
                  drawerTab === 'explainer'
                    ? 'bg-cyan-500 text-slate-950 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title="IBM Bob Line-by-Line Contextual Intent Explainer"
              >
                <span>⚡</span>
                <span>Bob Explainer</span>
              </button>

              <button
                type="button"
                onClick={() => setDrawerTab('hooks')}
                className={`px-2 py-0.5 rounded text-[11px] font-semibold transition-colors flex items-center gap-1 cursor-pointer ${
                  drawerTab === 'hooks'
                    ? 'bg-amber-500 text-slate-950 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title="Stage 10 Safe Insertion Hooks"
              >
                <span className="text-amber-400 font-bold leading-none">★</span>
                <span>Safe Hooks</span>
                {safeInsertionPoints.length > 0 && (
                  <span className={`px-1 py-0.2 rounded text-[9px] ${
                    drawerTab === 'hooks' ? 'bg-slate-950 text-amber-300' : 'bg-slate-900/80 text-slate-300'
                  }`}>
                    {safeInsertionPoints.length}
                  </span>
                )}
              </button>

              {/* Stage 14: ModelLens remediation — only in model_lens mode */}
              {isModelLens && (
                <button
                  type="button"
                  onClick={() => setDrawerTab('audit')}
                  className={`px-2 py-0.5 rounded text-[11px] font-semibold transition-colors flex items-center gap-1 cursor-pointer ${
                    drawerTab === 'audit'
                      ? 'bg-rose-500 text-slate-950 shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                  title="Stage 14 ModelLens Remediation — click a hazard marker in the gutter"
                >
                  <span className="text-rose-400 font-bold leading-none">☠</span>
                  <span>Audit</span>
                  {auditIssues.length > 0 && (
                    <span className={`px-1 py-0.2 rounded text-[9px] ${
                      drawerTab === 'audit' ? 'bg-slate-950 text-rose-200' : 'bg-slate-900/80 text-slate-300'
                    }`}>
                      {auditIssues.length}
                    </span>
                  )}
                </button>
              )}

              <button
                type="button"
                onClick={() => setDrawerTab('summary')}
                className={`px-2 py-0.5 rounded text-[11px] font-semibold transition-colors cursor-pointer ${
                  drawerTab === 'summary'
                    ? 'bg-indigo-500 text-slate-950 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title="Stage 14 Appendix B.2 Teammate Handoff Summary"
              >
                📋 Summary
              </button>

              <button
                type="button"
                onClick={() => setDrawerTab('split')}
                className={`px-2 py-0.5 rounded text-[11px] font-semibold transition-colors cursor-pointer ${
                  drawerTab === 'split'
                    ? 'bg-indigo-500 text-slate-950 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title="Stacked View: Bob Explainer and Safe Hooks"
              >
                Split
              </button>
            </div>
          </div>

          {/* Drawer Content */}
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
            {drawerTab === 'explainer' && (
              <BobExplainerPane
                currentStep={currentStep}
                currentStepIndex={currentStepIndex}
                safeInsertionPoints={safeInsertionPoints}
                onSelectSafePoint={(pt) => {
                  setSelectedSafePoint(pt);
                  setDrawerTab('hooks');
                }}
              />
            )}

            {drawerTab === 'hooks' && (
              <HandoffDrawer
                selectedPoint={selectedSafePoint}
                safeInsertionPoints={safeInsertionPoints}
                onSelectPoint={setSelectedSafePoint}
              />
            )}

            {/* Stage 14: ModelLens remediation panel */}
            {drawerTab === 'audit' && isModelLens && (
              <MLRemediationPanel
                issues={auditIssues}
                selectedIssue={selectedAuditIssue}
                onSelectIssue={setSelectedAuditIssue}
              />
            )}

            {/* Stage 14: Appendix B.2 handoff summary (both modes) */}
            {drawerTab === 'summary' && (
              <HandoffSummaryPane
                code={code}
                safeInsertionPoints={safeInsertionPoints}
                terminalVariables={terminalVariables}
                summary={handoffSummary}
                onSummaryGenerated={onHandoffSummaryGenerated}
              />
            )}

            {drawerTab === 'split' && (
              <div className="flex flex-col h-full overflow-hidden">
                <div className="h-1/2 min-h-[160px] border-b border-slate-800 overflow-hidden flex flex-col">
                  <BobExplainerPane
                    currentStep={currentStep}
                    currentStepIndex={currentStepIndex}
                    safeInsertionPoints={safeInsertionPoints}
                    onSelectSafePoint={(pt) => {
                      setSelectedSafePoint(pt);
                    }}
                  />
                </div>
                <div className="h-1/2 min-h-[160px] overflow-hidden flex flex-col">
                  <HandoffDrawer
                    selectedPoint={selectedSafePoint}
                    safeInsertionPoints={safeInsertionPoints}
                    onSelectPoint={setSelectedSafePoint}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
