import React, { useEffect } from 'react';

export default function TimelineScrubber({
  steps,
  currentStepIndex,
  onSelectStep,
  isPlaying,
  onTogglePlay,
  hasLeakage = true
}) {
  const currentStep = steps[currentStepIndex] || steps[0];
  const totalSteps = 42; // standard simulated steps
  const progressPct = ((currentStep.stepId / totalSteps) * 100).toFixed(1);

  // Playback timer
  useEffect(() => {
    let timer;
    if (isPlaying) {
      timer = setInterval(() => {
        onSelectStep((prevIndex) => {
          if (prevIndex >= steps.length - 1) {
            onTogglePlay(false);
            return prevIndex;
          }
          return prevIndex + 1;
        });
      }, 1500);
    }
    return () => clearInterval(timer);
  }, [isPlaying, steps.length, onSelectStep, onTogglePlay]);

  const handlePrev = () => {
    if (currentStepIndex > 0) {
      onSelectStep(currentStepIndex - 1);
    }
  };

  const handleNext = () => {
    if (currentStepIndex < steps.length - 1) {
      onSelectStep(currentStepIndex + 1);
    }
  };

  const jumpToStepId = (id) => {
    const idx = steps.findIndex(s => s.stepId === id);
    if (idx !== -1) {
      onSelectStep(idx);
    }
  };

  return (
    <section className="w-full bg-surface-container-lowest px-gutter py-space-sm shadow-md border-b border-surface-variant/30">
      {/* Controls & Quick Navigation */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-space-sm mb-space-xs">
        <div className="flex items-center gap-space-sm flex-wrap">
          {/* Stepper Buttons */}
          <div className="flex items-center bg-surface-container-high rounded px-space-xs py-0.5 border border-outline-variant/40">
            <button
              type="button"
              onClick={handlePrev}
              disabled={currentStepIndex === 0}
              className={`p-1 transition-colors ${
                currentStepIndex === 0 
                  ? 'text-outline/40 cursor-not-allowed' 
                  : 'hover:text-primary text-on-surface-variant'
              }`}
              title="Step Back"
            >
              <span className="material-symbols-outlined text-[16px]">skip_previous</span>
            </button>
            <button
              type="button"
              onClick={() => onTogglePlay(!isPlaying)}
              className="p-1 hover:text-primary text-primary transition-colors"
              title={isPlaying ? "Pause Execution" : "Play Execution"}
            >
              <span className="material-symbols-outlined text-[18px]">
                {isPlaying ? "pause" : "play_arrow"}
              </span>
            </button>
            <button
              type="button"
              onClick={handleNext}
              disabled={currentStepIndex === steps.length - 1}
              className={`p-1 transition-colors ${
                currentStepIndex === steps.length - 1 
                  ? 'text-outline/40 cursor-not-allowed' 
                  : 'hover:text-primary text-on-surface-variant'
              }`}
              title="Step Forward"
            >
              <span className="material-symbols-outlined text-[16px]">skip_next</span>
            </button>
          </div>

          {/* Current Step Label */}
          <div className="flex items-center gap-space-xs bg-surface-container px-space-sm py-1 rounded border border-outline-variant/30">
            <span className="w-2 h-2 rounded-full bg-primary-container animate-pulse" />
            <span className="font-label-md text-label-md text-primary font-mono">
              Step {currentStep.stepId} of {totalSteps}
            </span>
            <span className="text-outline font-code-sm text-code-sm">::</span>
            <span className="font-code-md text-code-md text-on-surface font-semibold font-mono">
              {currentStep.operation}()
            </span>
          </div>

          {/* Quick Jump Buttons */}
          {hasLeakage && (
            <button
              type="button"
              onClick={() => jumpToStepId(9)}
              className="flex items-center gap-space-xs bg-error-container/20 hover:bg-error-container/30 text-error px-space-sm py-1 rounded transition-colors font-label-xs text-label-xs border border-error/20"
            >
              <span className="material-symbols-outlined text-[14px]">crisis_alert</span>
              <span>Jump to Leakage (#09)</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => jumpToStepId(14)}
            className="flex items-center gap-space-xs bg-tertiary-container/20 hover:bg-tertiary-container/30 text-tertiary px-space-sm py-1 rounded transition-colors font-label-xs text-label-xs border border-tertiary/20"
          >
            <span className="material-symbols-outlined text-[14px]">warning</span>
            <span>Jump to Imbalance (#14)</span>
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
            <span>MEM: {currentStep.memory}</span>
            <span>•</span>
            <span>LATENCY: {currentStep.latency}</span>
          </div>
        </div>
      </div>

      {/* Scrubber Track & Milestone Badges */}
      <div className="relative w-full pt-8 pb-3">
        {/* Scrub Progress Bar Track */}
        <div 
          className="h-1.5 w-full bg-surface-container-high rounded-full overflow-visible relative cursor-pointer"
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const clickX = e.clientX - rect.left;
            const pct = clickX / rect.width;
            const targetStepId = Math.round(pct * totalSteps);
            // find closest step
            let closestIdx = 0;
            let minDiff = 999;
            steps.forEach((s, idx) => {
              const diff = Math.abs(s.stepId - targetStepId);
              if (diff < minDiff) {
                minDiff = diff;
                closestIdx = idx;
              }
            });
            onSelectStep(closestIdx);
          }}
        >
          <div
            className="h-full bg-gradient-to-r from-secondary-container via-primary-container to-primary rounded-full transition-all duration-300"
            style={{ width: `${Math.max(2, Math.min(100, (currentStep.stepId / totalSteps) * 100))}%` }}
          />

          {/* Interactive Marker Thumb */}
          <div
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-4 h-4 rounded-full bg-primary shadow-[0_0_10px_#8ed5ff] cursor-pointer flex items-center justify-center transition-all duration-300"
            style={{ left: `${Math.max(2, Math.min(98, (currentStep.stepId / totalSteps) * 100))}%` }}
          >
            <div className="w-1.5 h-1.5 rounded-full bg-on-primary" />
          </div>
        </div>

        {/* Milestone Badges along Timeline */}
        <div className="relative w-full h-8 mt-2">
          {/* Step 01 */}
          <div
            onClick={() => jumpToStepId(1)}
            className="absolute -top-7 -translate-x-1/2 flex flex-col items-center group cursor-pointer"
            style={{ left: '2.38%' }}
          >
            <span className={`px-1.5 py-0.5 rounded font-label-xs text-label-xs whitespace-nowrap shadow-sm transition-all ${
              currentStep.stepId === 1 
                ? 'bg-primary text-on-primary font-bold' 
                : 'bg-surface-container text-secondary group-hover:bg-surface-container-high'
            }`}>
              01: load_dataset
            </span>
            <div className={`w-2 h-2 rounded-full mt-1 ${currentStep.stepId === 1 ? 'bg-primary shadow-[0_0_8px_#8ed5ff]' : 'bg-secondary'}`} />
          </div>

          {/* Step 05 */}
          <div
            onClick={() => jumpToStepId(5)}
            className="absolute -top-7 -translate-x-1/2 flex flex-col items-center group cursor-pointer"
            style={{ left: '11.9%' }}
          >
            <span className={`px-1.5 py-0.5 rounded font-label-xs text-label-xs whitespace-nowrap shadow-sm transition-all ${
              currentStep.stepId === 5 
                ? 'bg-primary text-on-primary font-bold' 
                : 'bg-surface-container text-secondary group-hover:bg-surface-container-high'
            }`}>
              05: drop_nulls
            </span>
            <div className={`w-2 h-2 rounded-full mt-1 ${currentStep.stepId === 5 ? 'bg-primary shadow-[0_0_8px_#8ed5ff]' : 'bg-secondary'}`} />
          </div>

          {/* Step 09 (FLAGGED: LEAKAGE) */}
          <div
            onClick={() => jumpToStepId(9)}
            className="absolute -top-11 -translate-x-1/2 flex flex-col items-center cursor-pointer z-10"
            style={{ left: '21.42%' }}
          >
            {hasLeakage ? (
              <>
                <span className="px-1.5 py-0.5 rounded bg-error-container text-on-error-container font-label-xs text-label-xs flex items-center gap-1 shadow-md animate-bounce border border-error/30">
                  <span className="material-symbols-outlined text-[11px]">crisis_alert</span>
                  <span>CRITICAL LEAKAGE</span>
                </span>
                <span className="mt-0.5 px-1 py-0.2 rounded bg-surface-container-high text-error font-label-xs text-label-xs whitespace-nowrap">
                  09: scaler.fit_transform
                </span>
                <div className="w-2.5 h-2.5 rounded-full bg-error mt-0.5 shadow-[0_0_8px_#ffb4ab]" />
              </>
            ) : (
              <>
                <span className="px-1.5 py-0.5 rounded bg-secondary-container text-on-secondary-container font-label-xs text-label-xs flex items-center gap-1 shadow-md">
                  <span className="material-symbols-outlined text-[11px]">check_circle</span>
                  <span>CLEANED</span>
                </span>
                <span className="mt-0.5 px-1 py-0.2 rounded bg-surface-container-high text-secondary font-label-xs text-label-xs whitespace-nowrap">
                  09: split_first
                </span>
                <div className="w-2 h-2 rounded-full bg-secondary mt-0.5" />
              </>
            )}
          </div>

          {/* Step 14 (ACTIVE / IMBALANCE) */}
          <div
            onClick={() => jumpToStepId(14)}
            className="absolute -top-11 -translate-x-1/2 flex flex-col items-center cursor-pointer z-10"
            style={{ left: '33.33%' }}
          >
            <span className="px-1.5 py-0.5 rounded bg-tertiary-container text-on-tertiary-container font-label-xs text-label-xs flex items-center gap-1 shadow-md border border-tertiary/30">
              <span className="material-symbols-outlined text-[11px]">warning</span>
              <span>TARGET IMBALANCE 92/8</span>
            </span>
            <span className={`mt-0.5 px-1.5 py-0.5 rounded font-label-xs text-label-xs font-semibold whitespace-nowrap shadow-md transition-all ${
              currentStep.stepId === 14 
                ? 'bg-primary text-on-primary ring-1 ring-primary-container' 
                : 'bg-surface-container text-on-surface'
            }`}>
              14: train_test_split {currentStep.stepId === 14 && '[ACTIVE]'}
            </span>
            <div className={`w-3 h-3 rounded-full mt-0.5 ${currentStep.stepId === 14 ? 'bg-primary shadow-[0_0_10px_#8ed5ff]' : 'bg-surface-variant'}`} />
          </div>

          {/* Step 22 */}
          <div
            onClick={() => jumpToStepId(22)}
            className="absolute -top-7 -translate-x-1/2 flex flex-col items-center group cursor-pointer opacity-80 hover:opacity-100"
            style={{ left: '52.38%' }}
          >
            <span className={`px-1.5 py-0.5 rounded font-label-xs text-label-xs whitespace-nowrap ${
              currentStep.stepId === 22 
                ? 'bg-primary text-on-primary font-bold' 
                : 'bg-surface-container text-outline group-hover:text-on-surface'
            }`}>
              22: model_init
            </span>
            <div className={`w-2 h-2 rounded-full mt-1 ${currentStep.stepId === 22 ? 'bg-primary shadow-[0_0_8px_#8ed5ff]' : 'bg-surface-variant'}`} />
          </div>

          {/* Step 31 */}
          <div
            onClick={() => jumpToStepId(31)}
            className="absolute -top-7 -translate-x-1/2 flex flex-col items-center group cursor-pointer opacity-80 hover:opacity-100"
            style={{ left: '73.8%' }}
          >
            <span className={`px-1.5 py-0.5 rounded font-label-xs text-label-xs whitespace-nowrap ${
              currentStep.stepId === 31 
                ? 'bg-primary text-on-primary font-bold' 
                : 'bg-surface-container text-outline group-hover:text-on-surface'
            }`}>
              31: model.fit
            </span>
            <div className={`w-2 h-2 rounded-full mt-1 ${currentStep.stepId === 31 ? 'bg-primary shadow-[0_0_8px_#8ed5ff]' : 'bg-surface-variant'}`} />
          </div>

          {/* Step 42 */}
          <div
            onClick={() => jumpToStepId(42)}
            className="absolute -top-7 -translate-x-1/2 flex flex-col items-center group cursor-pointer opacity-80 hover:opacity-100"
            style={{ left: '95%' }}
          >
            <span className={`px-1.5 py-0.5 rounded font-label-xs text-label-xs whitespace-nowrap ${
              currentStep.stepId === 42 
                ? 'bg-primary text-on-primary font-bold' 
                : 'bg-surface-container text-outline group-hover:text-on-surface'
            }`}>
              42: evaluate_roc_auc
            </span>
            <div className={`w-2 h-2 rounded-full mt-1 ${currentStep.stepId === 42 ? 'bg-primary shadow-[0_0_8px_#8ed5ff]' : 'bg-surface-variant'}`} />
          </div>
        </div>
      </div>
    </section>
  );
}
