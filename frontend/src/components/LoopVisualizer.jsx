import React from 'react';

export default function LoopVisualizer({
  currentStep,
  onJumpToIteration,
  onJumpToLoopExit
}) {
  const loopContext = currentStep?.loop_context;
  const currentIteration = loopContext?.current_iteration || 0;
  const totalIterations = loopContext?.total_iterations || 4;
  const targetVarName = loopContext?.iterator_target || 'record';
  const targetValue = loopContext?.iterator_value;
  const isExit = loopContext?.is_exit_step;

  const pct = Math.min(100, Math.round((currentIteration / totalIterations) * 100));

  // Pre-indexed iteration milestones for teammate_pipeline.py
  // Iteration 1 -> step 4
  // Iteration 2 -> step 9
  // Iteration 3 -> step 15 (Skipped)
  // Iteration 4 -> step 18
  const iterationCards = [
    {
      num: 1,
      stepId: 4,
      targetUser: 'Alice',
      status: 200,
      outcome: 'appended (success: True)',
      badgeColor: 'text-secondary bg-secondary/10 border-secondary/30'
    },
    {
      num: 2,
      stepId: 9,
      targetUser: 'Bob',
      status: 500,
      outcome: 'error counted (+1), appended (success: False)',
      badgeColor: 'text-error bg-error/10 border-error/30'
    },
    {
      num: 3,
      stepId: 15,
      targetUser: '"" (empty)',
      status: 200,
      outcome: 'len(name) == 0 -> SKIPPED (dropped)',
      badgeColor: 'text-outline bg-surface-container border-outline/30'
    },
    {
      num: 4,
      stepId: 18,
      targetUser: 'Charlie',
      status: 200,
      outcome: 'appended (success: True)',
      badgeColor: 'text-secondary bg-secondary/10 border-secondary/30'
    }
  ];

  // Inspect current accumulator states from all_variables
  const cleanedSummary = currentStep?.all_variables?.cleaned_records || '[]';
  const errorCountVal = currentStep?.all_variables?.error_count || '0';

  return (
    <div className="bg-surface-container-low rounded-lg p-space-md border border-surface-variant/30 flex flex-col gap-space-sm shadow-md">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-surface-variant/20 pb-2">
        <div className="flex items-center gap-space-xs">
          <span className="material-symbols-outlined text-[18px] text-primary animate-spin-slow">
            sync
          </span>
          <h3 className="font-headline-sm text-headline-sm text-on-surface">
            Loop Visualizer
          </h3>
          <span className="font-code-sm text-code-sm text-outline font-mono">
            `for record in raw_logs:`
          </span>
        </div>

        <div className="flex items-center gap-2">
          {isExit ? (
            <span className="px-2 py-0.5 rounded font-label-xs text-label-xs bg-secondary-container/20 text-secondary border border-secondary/40 font-mono">
              LOOP EXHAUSTED (4/4)
            </span>
          ) : (
            <button
              type="button"
              onClick={onJumpToLoopExit}
              title="Fast-forward to loop exit"
              className="px-2 py-0.5 rounded font-label-xs text-label-xs bg-primary-container/20 hover:bg-primary-container/30 text-primary border border-primary/40 font-mono flex items-center gap-1 transition-colors"
            >
              <span>ITERATION {currentIteration} OF {totalIterations}</span>
              <span className="material-symbols-outlined text-[12px]">fast_forward</span>
            </button>
          )}
        </div>
      </div>

      {/* Loop Progress Dial & Target Variable Chip */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-space-sm items-center bg-surface-container-lowest p-space-sm rounded-lg border border-surface-variant/20">
        {/* Dial / Progress Meter */}
        <div className="md:col-span-4 flex flex-col gap-1">
          <div className="flex items-center justify-between text-outline font-label-xs text-label-xs font-mono">
            <span>CYCLE PROGRESS</span>
            <span className="text-primary font-bold">{pct}%</span>
          </div>

          <div className="w-full h-2.5 bg-surface-container-high rounded-full overflow-hidden relative">
            <div
              className="h-full bg-gradient-to-r from-primary-container via-primary to-secondary transition-all duration-300"
              style={{ width: `${pct}%` }}
            />
          </div>

          <span className="text-[11px] text-outline font-mono">
            Target Collection: <strong className="text-on-surface">raw_logs</strong> (4 records)
          </span>
        </div>

        {/* Current Iteration Target Card */}
        <div className="md:col-span-8 bg-surface-container rounded p-space-xs border border-outline-variant/30 flex flex-col gap-1">
          <div className="flex items-center justify-between font-label-xs text-label-xs">
            <div className="flex items-center gap-1 text-primary font-mono font-semibold">
              <span className="material-symbols-outlined text-[14px]">arrow_right_alt</span>
              <span>Active Target: <code className="text-on-surface bg-surface-container-high px-1 rounded">{targetVarName}</code></span>
            </div>
            <span className="text-outline font-mono">Step #{currentStep?.step_id}</span>
          </div>

          {targetValue ? (
            <div className="font-code-sm text-code-sm text-on-surface bg-surface-container-lowest p-1.5 rounded border border-surface-variant/30 font-mono overflow-x-auto flex items-center justify-between">
              <span>
                <strong className="text-secondary">user:</strong> &quot;{targetValue.user}&quot; |{' '}
                <strong className="text-secondary">action:</strong> &quot;{targetValue.action}&quot; |{' '}
                <strong className={targetValue.status >= 400 ? 'text-error' : 'text-primary'}>status:</strong> {targetValue.status}
              </span>
              {targetValue.status >= 400 && (
                <span className="px-1.5 py-0.2 rounded bg-error-container text-on-error-container font-label-xs text-label-xs font-bold shrink-0 ml-2">
                  500 ERROR
                </span>
              )}
            </div>
          ) : (
            <div className="text-outline italic text-body-sm p-1">
              Loop pointer suspended or completed.
            </div>
          )}
        </div>
      </div>

      {/* Unrolled Iteration Carousel */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between font-label-xs text-label-xs text-outline font-mono">
          <span className="flex items-center gap-1 uppercase tracking-wider">
            <span className="material-symbols-outlined text-[13px]">view_carousel</span>
            Unrolled Iteration History (Click to Jump)
          </span>
          <span className="text-[10px]">Deterministic AST Trace</span>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
          {iterationCards.map((card) => {
            const isActive = currentIteration === card.num && !isExit;
            const isCompleted = currentIteration > card.num || isExit;

            return (
              <button
                key={card.num}
                type="button"
                onClick={() => onJumpToIteration(card.stepId)}
                className={`flex flex-col p-2 rounded-lg text-left transition-all border ${
                  isActive
                    ? 'bg-primary-container/20 border-primary ring-1 ring-primary shadow-sm'
                    : isCompleted
                      ? 'bg-surface-container-lowest/80 border-surface-variant/40 hover:bg-surface-container'
                      : 'bg-surface-container-lowest/40 border-surface-variant/20 opacity-60 hover:opacity-100'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className={`font-mono text-label-xs font-bold px-1.5 py-0.5 rounded ${
                    isActive ? 'bg-primary text-on-primary' : 'bg-surface-container-high text-outline'
                  }`}>
                    #{card.num}
                  </span>

                  <span className={`text-[10px] font-mono px-1 py-0.5 rounded border ${card.badgeColor}`}>
                    {card.status}
                  </span>
                </div>

                <div className="font-code-sm text-code-sm text-on-surface font-mono truncate font-semibold">
                  {card.targetUser}
                </div>

                <div className="text-[11px] text-outline mt-1 leading-tight line-clamp-2">
                  {card.outcome}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Accumulator Tracking Cards (cleaned_records & error_count) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-space-sm pt-1">
        {/* Accumulator 1: cleaned_records */}
        <div className="bg-surface-container rounded p-space-xs border border-surface-variant/30 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded bg-secondary-container/20 text-secondary flex items-center justify-center font-mono font-bold text-xs">
              +
            </div>
            <div className="flex flex-col">
              <span className="font-label-xs text-label-xs text-outline uppercase font-mono">
                Accumulator: cleaned_records
              </span>
              <span className="font-code-sm text-code-sm text-on-surface font-mono">
                {cleanedSummary}
              </span>
            </div>
          </div>
          <span className="text-secondary font-label-xs text-label-xs font-mono font-bold bg-secondary/10 px-1.5 py-0.5 rounded">
            GROWING
          </span>
        </div>

        {/* Accumulator 2: error_count */}
        <div className="bg-surface-container rounded p-space-xs border border-surface-variant/30 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded bg-error-container/20 text-error flex items-center justify-center font-mono font-bold text-xs">
              !
            </div>
            <div className="flex flex-col">
              <span className="font-label-xs text-label-xs text-outline uppercase font-mono">
                Counter: error_count
              </span>
              <span className="font-code-sm text-code-sm text-on-surface font-mono">
                Total Failures: <strong className="text-error font-bold">{errorCountVal}</strong>
              </span>
            </div>
          </div>
          <span className={`font-label-xs text-label-xs font-mono font-bold px-1.5 py-0.5 rounded ${
            Number(errorCountVal) > 0 ? 'bg-error/20 text-error' : 'bg-surface-container-high text-outline'
          }`}>
            {Number(errorCountVal) > 0 ? '1 FAULT' : '0 FAULTS'}
          </span>
        </div>
      </div>
    </div>
  );
}
