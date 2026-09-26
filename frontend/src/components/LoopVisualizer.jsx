import React from 'react';

/**
 * LoopVisualizer — Stage 8
 *
 * Renders when currentStep.loop_context is present.
 * Driven entirely by real trace data — no hardcoded values.
 *
 * Props:
 *   currentStep          : TraceStep
 *   allSteps             : TraceStep[]  (full trace, for building iteration carousel)
 *   currentStepIndex     : number
 *   onJumpToIteration    : (stepIndex: number) => void
 *   onJumpToLoopExit     : () => void
 */
export default function LoopVisualizer({
  currentStep,
  allSteps = [],
  currentStepIndex,
  onJumpToIteration,
  onJumpToLoopExit,
}) {
  const loopContext = currentStep?.loop_context;
  if (!loopContext) return null;

  const {
    loop_id,
    loop_type,
    header_line,
    current_iteration,
    total_iterations,
    iterator_target,
    iterator_value,
    is_exit_step,
  } = loopContext;

  // Build the iteration carousel from allSteps:
  // find every step whose loop_context.loop_id matches and whose line equals
  // header_line (i.e. each time the loop header was visited = each iteration).
  const iterationSteps = allSteps.reduce((acc, step, idx) => {
    const lc = step.loop_context;
    if (
      lc &&
      lc.loop_id === loop_id &&
      step.line_number === lc.header_line &&
      !lc.is_exit_step
    ) {
      acc.push({ stepIndex: idx, iterNum: lc.current_iteration, step });
    }
    return acc;
  }, []);

  // Total known = highest iteration found, or total_iterations if provided
  const knownTotal = total_iterations
    ? total_iterations
    : iterationSteps.length || current_iteration;

  const pct = knownTotal > 0
    ? Math.min(100, Math.round((current_iteration / knownTotal) * 100))
    : 0;

  // Determine a colour for each iteration card based on variable deltas at that step
  function cardBadgeClass(step) {
    const deltas = step?.variable_deltas ?? {};
    // heuristic: any error-like variable mutated → error; anything created → secondary; else neutral
    const keys = Object.keys(deltas);
    if (keys.some((k) => k.toLowerCase().includes('error'))) {
      return 'text-error bg-error/10 border-error/30';
    }
    if (keys.some((d) => deltas[d].action === 'created')) {
      return 'text-secondary bg-secondary/10 border-secondary/30';
    }
    if (keys.some((d) => deltas[d].action === 'mutated')) {
      return 'text-primary bg-primary/10 border-primary/30';
    }
    return 'text-outline bg-surface-container border-outline/30';
  }

  // Accumulator variables: variables that are lists/dicts and grow across iterations
  // Show every variable in all_variables that is a collection
  const allVars = currentStep?.all_variables ?? {};
  const accumulators = Object.entries(allVars).filter(([, v]) => {
    const s = String(v);
    return s.startsWith('[') || s.startsWith('{');
  });

  return (
    <div className="bg-surface-container-low rounded-lg p-space-md border border-surface-variant/30 flex flex-col gap-space-sm shadow-md">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-surface-variant/20 pb-2">
        <div className="flex items-center gap-space-xs">
          <span className="material-symbols-outlined text-[18px] text-primary">sync</span>
          <h3 className="font-headline-sm text-headline-sm text-on-surface">
            Loop Visualizer
          </h3>
          <span className="font-code-sm text-code-sm text-outline font-mono">
            `{loop_type} … (line {header_line})`
          </span>
        </div>

        <div className="flex items-center gap-2">
          {is_exit_step ? (
            <span className="px-2 py-0.5 rounded font-label-xs text-label-xs bg-secondary-container/20 text-secondary border border-secondary/40 font-mono">
              LOOP EXHAUSTED ({current_iteration}/{knownTotal})
            </span>
          ) : (
            <button
              type="button"
              onClick={onJumpToLoopExit}
              title="Fast-forward to loop exit"
              className="px-2 py-0.5 rounded font-label-xs text-label-xs bg-primary-container/20 hover:bg-primary-container/30 text-primary border border-primary/40 font-mono flex items-center gap-1 transition-colors"
            >
              <span>ITERATION {current_iteration} OF {knownTotal}</span>
              <span className="material-symbols-outlined text-[12px]">fast_forward</span>
            </button>
          )}
        </div>
      </div>

      {/* Progress + Target Variable */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-space-sm items-center bg-surface-container-lowest p-space-sm rounded-lg border border-surface-variant/20">
        {/* Progress bar */}
        <div className="md:col-span-4 flex flex-col gap-1">
          <div className="flex items-center justify-between text-outline font-label-xs text-label-xs font-mono">
            <span>CYCLE PROGRESS</span>
            <span className="text-primary font-bold">{pct}%</span>
          </div>
          <div className="w-full h-2.5 bg-surface-container-high rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-primary-container via-primary to-secondary transition-all duration-300"
              style={{ width: `${pct}%` }}
            />
          </div>
          {iterator_target && (
            <span className="text-[11px] text-outline font-mono">
              Target: <strong className="text-on-surface">{iterator_target}</strong>
            </span>
          )}
        </div>

        {/* Current iteration value */}
        <div className="md:col-span-8 bg-surface-container rounded p-space-xs border border-outline-variant/30 flex flex-col gap-1">
          <div className="flex items-center justify-between font-label-xs text-label-xs">
            <div className="flex items-center gap-1 text-primary font-mono font-semibold">
              <span className="material-symbols-outlined text-[14px]">arrow_right_alt</span>
              {iterator_target ? (
                <span>
                  Active value:{' '}
                  <code className="text-on-surface bg-surface-container-high px-1 rounded">
                    {iterator_target}
                  </code>
                </span>
              ) : (
                <span>Loop iteration</span>
              )}
            </div>
            <span className="text-outline font-mono">Step #{currentStep?.step_id}</span>
          </div>

          <div className="font-code-sm text-code-sm text-on-surface bg-surface-container-lowest p-1.5 rounded border border-surface-variant/30 font-mono overflow-x-auto">
            {iterator_value !== null && iterator_value !== undefined ? (
              typeof iterator_value === 'object'
                ? JSON.stringify(iterator_value)
                : String(iterator_value)
            ) : (
              <span className="text-outline italic">No iterator value captured</span>
            )}
          </div>
        </div>
      </div>

      {/* Iteration Carousel */}
      {iterationSteps.length > 0 && (
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between font-label-xs text-label-xs text-outline font-mono">
            <span className="flex items-center gap-1 uppercase tracking-wider">
              <span className="material-symbols-outlined text-[13px]">view_carousel</span>
              Iteration History (Click to Jump)
            </span>
            <span className="text-[10px]">{iterationSteps.length} iterations traced</span>
          </div>

          <div className="flex flex-wrap gap-2">
            {iterationSteps.map(({ stepIndex, iterNum, step }) => {
              const isActive = stepIndex === currentStepIndex;
              const isCompleted = stepIndex < currentStepIndex;
              const badgeClass = cardBadgeClass(step);

              return (
                <button
                  key={stepIndex}
                  type="button"
                  onClick={() => onJumpToIteration(stepIndex)}
                  className={`flex flex-col p-2 rounded-lg text-left transition-all border min-w-[80px] ${
                    isActive
                      ? 'bg-primary-container/20 border-primary ring-1 ring-primary shadow-sm'
                      : isCompleted
                        ? 'bg-surface-container-lowest/80 border-surface-variant/40 hover:bg-surface-container'
                        : 'bg-surface-container-lowest/40 border-surface-variant/20 opacity-60 hover:opacity-100'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1 gap-1">
                    <span className={`font-mono text-label-xs font-bold px-1.5 py-0.5 rounded ${
                      isActive ? 'bg-primary text-on-primary' : 'bg-surface-container-high text-outline'
                    }`}>
                      #{iterNum}
                    </span>
                    <span className={`text-[9px] font-mono px-1 py-0.5 rounded border ${badgeClass}`}>
                      s{stepIndex}
                    </span>
                  </div>

                  <div className="font-code-sm text-code-sm text-on-surface font-mono truncate text-[10px] max-w-[100px]">
                    {step?.loop_context?.iterator_value !== undefined && step.loop_context.iterator_value !== null
                      ? (typeof step.loop_context.iterator_value === 'object'
                          ? JSON.stringify(step.loop_context.iterator_value).slice(0, 20)
                          : String(step.loop_context.iterator_value).slice(0, 20))
                      : '—'}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Accumulator/Growth Badges */}
      {accumulators.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-space-xs pt-1">
          {accumulators.slice(0, 4).map(([key, val]) => (
            <div
              key={key}
              className="bg-surface-container rounded p-space-xs border border-surface-variant/30 flex items-center justify-between"
            >
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded bg-secondary-container/20 text-secondary flex items-center justify-center font-mono font-bold text-xs shrink-0">
                  +
                </div>
                <div className="flex flex-col overflow-hidden">
                  <span className="font-label-xs text-label-xs text-outline uppercase font-mono truncate">
                    {key}
                  </span>
                  <span className="font-code-sm text-code-sm text-on-surface font-mono truncate text-[10px]">
                    {String(val).slice(0, 40)}
                  </span>
                </div>
              </div>
              <span className="text-secondary font-label-xs text-label-xs font-mono font-bold bg-secondary/10 px-1.5 py-0.5 rounded shrink-0 ml-1">
                GROWING
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
