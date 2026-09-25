import React, { useEffect } from 'react';

export default function LogicLensScrubber({
  steps,
  currentStepIndex,
  onSelectStepIndex,
  isPlaying,
  onTogglePlay,
  playbackSpeed = 1,
  onChangePlaybackSpeed,
  onJumpToSafeHook
}) {
  const totalSteps = steps.length;
  const currentStep = steps[currentStepIndex] || steps[0];
  const progressPct = (( (currentStepIndex + 1) / totalSteps) * 100).toFixed(1);

  // Playback timer based on speed
  useEffect(() => {
    let timer;
    if (isPlaying) {
      const delay = Math.round(900 / playbackSpeed);
      timer = setInterval(() => {
        onSelectStepIndex((prev) => {
          if (prev >= totalSteps - 1) {
            onTogglePlay(false);
            return prev;
          }
          return prev + 1;
        });
      }, delay);
    }
    return () => clearInterval(timer);
  }, [isPlaying, playbackSpeed, totalSteps, onSelectStepIndex, onTogglePlay]);

  const handlePrev = () => {
    if (currentStepIndex > 0) {
      onSelectStepIndex(currentStepIndex - 1);
    }
  };

  const handleNext = () => {
    if (currentStepIndex < totalSteps - 1) {
      onSelectStepIndex(currentStepIndex + 1);
    }
  };

  return (
    <section className="w-full bg-surface-container-lowest px-gutter py-space-sm shadow-md border-b border-surface-variant/30">
      {/* Top Controls Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-space-sm mb-space-xs">
        <div className="flex items-center gap-space-sm flex-wrap">
          {/* Playback Controls */}
          <div className="flex items-center bg-surface-container-high rounded px-space-xs py-0.5 border border-outline-variant/40">
            {/* Jump to start */}
            <button
              type="button"
              onClick={() => onSelectStepIndex(0)}
              disabled={currentStepIndex === 0}
              className={`p-1 transition-colors ${
                currentStepIndex === 0 ? 'text-outline/40 cursor-not-allowed' : 'hover:text-primary text-on-surface-variant'
              }`}
              title="Jump to Start"
            >
              <span className="material-symbols-outlined text-[16px]">first_page</span>
            </button>

            {/* Step Back */}
            <button
              type="button"
              onClick={handlePrev}
              disabled={currentStepIndex === 0}
              className={`p-1 transition-colors ${
                currentStepIndex === 0 ? 'text-outline/40 cursor-not-allowed' : 'hover:text-primary text-on-surface-variant'
              }`}
              title="Step Backward (Left Arrow)"
            >
              <span className="material-symbols-outlined text-[16px]">skip_previous</span>
            </button>

            {/* Play / Pause */}
            <button
              type="button"
              onClick={() => onTogglePlay(!isPlaying)}
              className="p-1 hover:text-primary text-primary transition-colors"
              title={isPlaying ? "Pause (Space)" : "Auto Play (Space)"}
            >
              <span className="material-symbols-outlined text-[18px]">
                {isPlaying ? "pause" : "play_arrow"}
              </span>
            </button>

            {/* Step Forward */}
            <button
              type="button"
              onClick={handleNext}
              disabled={currentStepIndex === totalSteps - 1}
              className={`p-1 transition-colors ${
                currentStepIndex === totalSteps - 1 ? 'text-outline/40 cursor-not-allowed' : 'hover:text-primary text-on-surface-variant'
              }`}
              title="Step Forward (Right Arrow)"
            >
              <span className="material-symbols-outlined text-[16px]">skip_next</span>
            </button>

            {/* Jump to end */}
            <button
              type="button"
              onClick={() => onSelectStepIndex(totalSteps - 1)}
              disabled={currentStepIndex === totalSteps - 1}
              className={`p-1 transition-colors ${
                currentStepIndex === totalSteps - 1 ? 'text-outline/40 cursor-not-allowed' : 'hover:text-primary text-on-surface-variant'
              }`}
              title="Jump to End"
            >
              <span className="material-symbols-outlined text-[16px]">last_page</span>
            </button>
          </div>

          {/* Speed Toggle */}
          <div className="flex items-center gap-1 bg-surface-container rounded px-1.5 py-0.5 border border-surface-variant/30 font-mono text-[11px]">
            {[0.5, 1, 2].map((speed) => (
              <button
                key={speed}
                type="button"
                onClick={() => onChangePlaybackSpeed && onChangePlaybackSpeed(speed)}
                className={`px-1.5 py-0.5 rounded transition-colors ${
                  playbackSpeed === speed
                    ? 'bg-primary text-on-primary font-bold shadow-sm'
                    : 'text-outline hover:text-on-surface'
                }`}
              >
                {speed}x
              </button>
            ))}
          </div>

          {/* Current Step Label */}
          <div className="flex items-center gap-space-xs bg-surface-container px-space-sm py-1 rounded border border-outline-variant/30">
            <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
            <span className="font-label-md text-label-md text-primary font-mono">
              Step {currentStepIndex + 1} of {totalSteps}
            </span>
            <span className="text-outline font-code-sm text-code-sm">::</span>
            <span className="font-code-md text-code-md text-on-surface font-semibold font-mono truncate max-w-xs">
              Line {currentStep.line_number} ({currentStep.event_type})
            </span>
          </div>

          {/* Quick Jump to Safe Hook (Line 25) */}
          <button
            type="button"
            onClick={onJumpToSafeHook}
            className="flex items-center gap-space-xs bg-secondary-container/20 hover:bg-secondary-container/30 text-secondary px-space-sm py-1 rounded transition-colors font-label-xs text-label-xs border border-secondary/40 font-mono"
          >
            <span className="material-symbols-outlined text-[14px]">star</span>
            <span>Jump to Safe Hook (#24)</span>
          </button>
        </div>

        {/* Telemetry Stats */}
        <div className="flex items-center gap-space-md">
          <div className="flex items-center gap-space-xs font-label-xs text-label-xs text-on-surface-variant">
            <span className="text-outline">PROGRESS:</span>
            <span className="font-code-sm text-code-sm text-primary font-semibold font-mono">
              {progressPct}%
            </span>
          </div>

          <div className="hidden sm:flex items-center gap-space-xs text-outline font-label-xs text-label-xs font-mono">
            <span>Deterministic Tracer</span>
            <span>•</span>
            <span className="text-secondary font-semibold">Zero LLM Hallucination</span>
          </div>
        </div>
      </div>

      {/* Scrubber Track & Milestone Badges */}
      <div className="relative w-full pt-8 pb-3">
        {/* Progress Bar Track */}
        <div
          className="h-2 w-full bg-surface-container-high rounded-full overflow-visible relative cursor-pointer"
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const clickX = e.clientX - rect.left;
            const pct = clickX / rect.width;
            const targetIdx = Math.max(0, Math.min(totalSteps - 1, Math.round(pct * (totalSteps - 1))));
            onSelectStepIndex(targetIdx);
          }}
        >
          <div
            className="h-full bg-gradient-to-r from-primary-container via-primary to-secondary rounded-full transition-all duration-200"
            style={{ width: `${Math.max(3, Math.min(100, ((currentStepIndex + 1) / totalSteps) * 100))}%` }}
          />

          {/* Interactive Marker Thumb */}
          <div
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-4 h-4 rounded-full bg-primary shadow-[0_0_10px_#8ed5ff] cursor-pointer flex items-center justify-center transition-all duration-200"
            style={{ left: `${Math.max(2, Math.min(98, ((currentStepIndex + 1) / totalSteps) * 100))}%` }}
          >
            <div className="w-1.5 h-1.5 rounded-full bg-on-primary" />
          </div>
        </div>

        {/* Milestone Badges along Timeline */}
        <div className="relative w-full h-8 mt-2 font-mono">
          {/* Init Step 1 */}
          <div
            onClick={() => onSelectStepIndex(0)}
            className="absolute -top-7 -translate-x-1/2 flex flex-col items-center group cursor-pointer"
            style={{ left: '3%' }}
          >
            <span className={`px-1.5 py-0.5 rounded font-label-xs text-label-xs whitespace-nowrap shadow-sm transition-all ${
              currentStepIndex === 0
                ? 'bg-primary text-on-primary font-bold'
                : 'bg-surface-container text-secondary group-hover:bg-surface-container-high'
            }`}>
              01: init
            </span>
            <div className={`w-2 h-2 rounded-full mt-1 ${currentStepIndex === 0 ? 'bg-primary shadow-[0_0_8px_#8ed5ff]' : 'bg-secondary'}`} />
          </div>

          {/* Iteration 1 (Step 4) */}
          <div
            onClick={() => onSelectStepIndex(3)}
            className="absolute -top-7 -translate-x-1/2 flex flex-col items-center group cursor-pointer"
            style={{ left: '15%' }}
          >
            <span className={`px-1.5 py-0.5 rounded font-label-xs text-label-xs whitespace-nowrap shadow-sm transition-all ${
              currentStepIndex === 3
                ? 'bg-primary text-on-primary font-bold'
                : 'bg-surface-container text-outline group-hover:text-on-surface'
            }`}>
              04: Loop Alice
            </span>
            <div className={`w-2 h-2 rounded-full mt-1 ${currentStepIndex === 3 ? 'bg-primary shadow-[0_0_8px_#8ed5ff]' : 'bg-surface-variant'}`} />
          </div>

          {/* Iteration 2 (Step 9) - Error 500 */}
          <div
            onClick={() => onSelectStepIndex(8)}
            className="absolute -top-10 -translate-x-1/2 flex flex-col items-center cursor-pointer"
            style={{ left: '34%' }}
          >
            <span className="px-1.5 py-0.2 rounded bg-error-container text-on-error-container font-label-xs text-label-xs font-bold shadow-md">
              09: Loop Bob (500)
            </span>
            <div className="w-2.5 h-2.5 rounded-full bg-error mt-0.5 shadow-[0_0_8px_#ffb4ab]" />
          </div>

          {/* Iteration 3 (Step 15) - Empty Skipped */}
          <div
            onClick={() => onSelectStepIndex(14)}
            className="absolute -top-7 -translate-x-1/2 flex flex-col items-center group cursor-pointer"
            style={{ left: '57%' }}
          >
            <span className={`px-1.5 py-0.5 rounded font-label-xs text-label-xs whitespace-nowrap shadow-sm transition-all ${
              currentStepIndex === 14
                ? 'bg-primary text-on-primary font-bold'
                : 'bg-surface-container text-outline group-hover:text-on-surface'
            }`}>
              15: Skipped &quot;&quot;
            </span>
            <div className={`w-2 h-2 rounded-full mt-1 ${currentStepIndex === 14 ? 'bg-primary shadow-[0_0_8px_#8ed5ff]' : 'bg-surface-variant'}`} />
          </div>

          {/* Iteration 4 (Step 18) - Charlie */}
          <div
            onClick={() => onSelectStepIndex(17)}
            className="absolute -top-7 -translate-x-1/2 flex flex-col items-center group cursor-pointer"
            style={{ left: '69%' }}
          >
            <span className={`px-1.5 py-0.5 rounded font-label-xs text-label-xs whitespace-nowrap shadow-sm transition-all ${
              currentStepIndex === 17
                ? 'bg-primary text-on-primary font-bold'
                : 'bg-surface-container text-outline group-hover:text-on-surface'
            }`}>
              18: Loop Charlie
            </span>
            <div className={`w-2 h-2 rounded-full mt-1 ${currentStepIndex === 17 ? 'bg-primary shadow-[0_0_8px_#8ed5ff]' : 'bg-surface-variant'}`} />
          </div>

          {/* Safe Hook (Step 24) - Glowing Star Pin */}
          <div
            onClick={onJumpToSafeHook}
            className="absolute -top-11 -translate-x-1/2 flex flex-col items-center cursor-pointer z-10"
            style={{ left: '88%' }}
          >
            <span className="px-2 py-0.5 rounded bg-secondary text-on-secondary font-label-xs text-label-xs font-bold flex items-center gap-1 shadow-md animate-pulse">
              <span className="material-symbols-outlined text-[13px]">star</span>
              <span>24: SAFE HOOK</span>
            </span>
            <div className="w-3 h-3 rounded-full bg-secondary mt-0.5 shadow-[0_0_10px_#4edea3]" />
          </div>

          {/* Summary / Done (Step 26) */}
          <div
            onClick={() => onSelectStepIndex(totalSteps - 1)}
            className="absolute -top-7 -translate-x-1/2 flex flex-col items-center group cursor-pointer"
            style={{ left: '98%' }}
          >
            <span className={`px-1.5 py-0.5 rounded font-label-xs text-label-xs whitespace-nowrap ${
              currentStepIndex === totalSteps - 1
                ? 'bg-primary text-on-primary font-bold'
                : 'bg-surface-container text-outline group-hover:text-on-surface'
            }`}>
              26: done
            </span>
            <div className={`w-2 h-2 rounded-full mt-1 ${currentStepIndex === totalSteps - 1 ? 'bg-primary shadow-[0_0_8px_#8ed5ff]' : 'bg-surface-variant'}`} />
          </div>
        </div>
      </div>
    </section>
  );
}
