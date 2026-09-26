import React, { useEffect, useRef, useCallback } from 'react';
import CodeViewer from './CodeViewer';

/**
 * TracePlayer — Stage 7: Studio Shell + Playback Scrubber.
 *
 * 4-pane responsive layout:
 *   Left  (~40%)  : CodeViewer — read-only source with active-line highlight
 *   Center (~35%) : Visualizer canvas — placeholder (Stage 8)
 *   Right (~25%)  : Handoff / intent drawer — placeholder (Stage 10)
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
}) {
  const totalSteps = traceSteps.length;
  const currentStep = traceSteps[currentStepIndex] ?? traceSteps[0];

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

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <div className="flex flex-col w-full flex-1 overflow-hidden">
      {/* ── Playback Controls Dock ─────────────────────────────────────────── */}
      <section className="shrink-0 bg-slate-900 border-b border-slate-800 px-4 py-2">
        {/* Row 1: Buttons + speed + step counter */}
        <div className="flex flex-wrap items-center gap-3 mb-2">
          {/* Jump to start */}
          <button
            type="button"
            onClick={() => onSelectStepIndex(0)}
            disabled={currentStepIndex === 0}
            className="p-1 disabled:opacity-30 hover:text-cyan-400 text-slate-400 transition-colors"
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
            className="p-1 disabled:opacity-30 hover:text-cyan-400 text-slate-400 transition-colors"
            title="Step Backward"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M6 18V6h2v5.5l8.5-5.5V18L8 12.5V18z" />
            </svg>
          </button>

          {/* Play / Pause */}
          <button
            type="button"
            onClick={() => onTogglePlay(!isPlaying)}
            className="p-1 text-cyan-400 hover:text-cyan-300 transition-colors"
            title={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? (
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M6 19h4V5H6zm8-14v14h4V5z" />
              </svg>
            ) : (
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5v14l11-7z" />
              </svg>
            )}
          </button>

          {/* Step Forward */}
          <button
            type="button"
            onClick={handleStepForward}
            disabled={currentStepIndex === totalSteps - 1}
            className="p-1 disabled:opacity-30 hover:text-cyan-400 text-slate-400 transition-colors"
            title="Step Forward"
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
            className="p-1 disabled:opacity-30 hover:text-cyan-400 text-slate-400 transition-colors"
            title="Jump to End"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M16 6h2v12h-2zm-2.5 6L5 6v12z" />
            </svg>
          </button>

          {/* Divider */}
          <span className="w-px h-5 bg-slate-700" />

          {/* Speed buttons */}
          <div className="flex items-center gap-1 text-xs font-mono">
            {[0.5, 1, 2].map((speed) => (
              <button
                key={speed}
                type="button"
                onClick={() => onChangePlaybackSpeed(speed)}
                className={`px-2 py-0.5 rounded transition-colors ${
                  playbackSpeed === speed
                    ? 'bg-cyan-500 text-slate-900 font-bold'
                    : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800'
                }`}
              >
                {speed}x
              </button>
            ))}
          </div>

          {/* Divider */}
          <span className="w-px h-5 bg-slate-700" />

          {/* Step counter */}
          <span className="text-xs font-mono text-cyan-400 bg-cyan-500/10 border border-cyan-500/20 px-2 py-0.5 rounded">
            Step {currentStepIndex + 1} of {totalSteps}
          </span>

          {/* Current line info */}
          {currentStep && (
            <span className="text-xs font-mono text-slate-400">
              Line {currentStep.line_number}
              {' · '}
              <span className="text-slate-500">{currentStep.event_type}</span>
            </span>
          )}
        </div>

        {/* Row 2: Scrub slider */}
        <input
          type="range"
          min={0}
          max={totalSteps - 1}
          value={currentStepIndex}
          onChange={handleScrub}
          className="w-full h-1.5 accent-cyan-400 cursor-pointer rounded-full bg-slate-700"
          aria-label="Scrub through trace steps"
        />
      </section>

      {/* ── 4-Pane Workspace ──────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden min-h-0">
        {/* LEFT (~40%): Code Viewer */}
        <div className="w-[40%] min-w-[280px] flex flex-col border-r border-slate-800 overflow-hidden">
          <CodeViewer
            code={code}
            currentStep={currentStep}
          />
        </div>

        {/* CENTER (~35%): Visualizer canvas — placeholder for Stage 8 */}
        <div className="w-[35%] flex flex-col border-r border-slate-800 overflow-auto p-4">
          {/* TODO(stage-8): render LoopVisualizer / BranchVisualizer / StateBoard here */}
          <div className="flex flex-col items-center justify-center h-full gap-3 text-slate-600">
            <svg className="w-10 h-10 opacity-40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <path d="M8 12h8M12 8v8" />
            </svg>
            <p className="text-xs font-mono text-center">
              Visualizer Canvas<br />
              <span className="text-slate-700">(Stage 8: Loop / Branch / State)</span>
            </p>
          </div>
        </div>

        {/* RIGHT (~25%): Handoff / intent drawer — placeholder for Stage 10 */}
        <div className="w-[25%] min-w-[180px] flex flex-col overflow-auto p-4">
          {/* TODO(stage-10): render HandoffDrawer here */}
          <div className="flex flex-col items-center justify-center h-full gap-3 text-slate-600">
            <svg className="w-8 h-8 opacity-40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
            <p className="text-xs font-mono text-center">
              Handoff Drawer<br />
              <span className="text-slate-700">(Stage 10)</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
