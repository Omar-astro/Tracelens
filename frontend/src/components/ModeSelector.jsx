import React from 'react';

/**
 * ModeSelector component for TraceLens intake.
 * Stage 2: Radio-style toggle between LogicLens (default/selected) and ModelLens.
 */
export default function ModeSelector({ mode = 'logic_lens', onChange }) {
  return (
    <div className="w-full max-w-4xl mx-auto mb-6">
      <div className="flex items-center justify-between mb-2 px-1">
        <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">
          Inspection Mode
        </label>
        <span className="text-xs text-slate-500 font-mono">Select runtime engine</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* LogicLens Option (Default) */}
        <label
          className={`flex items-start p-4 rounded-xl border cursor-pointer transition-all duration-150 select-none ${
            mode === 'logic_lens'
              ? 'bg-cyan-950/30 border-cyan-500/60 shadow-lg shadow-cyan-950/50'
              : 'bg-slate-900/60 border-slate-800 hover:border-slate-700 hover:bg-slate-900'
          }`}
        >
          <input
            type="radio"
            name="tracelens-mode"
            value="logic_lens"
            checked={mode === 'logic_lens'}
            onChange={() => onChange?.('logic_lens')}
            className="mt-1 h-4 w-4 text-cyan-500 border-slate-700 bg-slate-850 focus:ring-cyan-500 focus:ring-offset-slate-950 accent-cyan-400"
          />
          <div className="ml-3">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-slate-100">LogicLens</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full font-mono bg-cyan-400/15 text-cyan-300 border border-cyan-400/20">
                Default
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1 leading-relaxed">
              Step-by-step control-flow visualizer, loop unrolling, variable deltas, and safe teammate insertion points.
            </p>
          </div>
        </label>

        {/* ModelLens Option */}
        <label
          className={`flex items-start p-4 rounded-xl border cursor-pointer transition-all duration-150 select-none ${
            mode === 'model_lens'
              ? 'bg-indigo-950/30 border-indigo-500/60 shadow-lg shadow-indigo-950/50'
              : 'bg-slate-900/60 border-slate-800 hover:border-slate-700 hover:bg-slate-900'
          }`}
        >
          <input
            type="radio"
            name="tracelens-mode"
            value="model_lens"
            checked={mode === 'model_lens'}
            onChange={() => onChange?.('model_lens')}
            className="mt-1 h-4 w-4 text-indigo-500 border-slate-700 bg-slate-850 focus:ring-indigo-500 focus:ring-offset-slate-950 accent-indigo-400"
          />
          <div className="ml-3">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-slate-100">ModelLens</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full font-mono bg-indigo-400/15 text-indigo-300 border border-indigo-400/20">
                Auditor
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1 leading-relaxed">
              ML methodology auditor detecting data leakage before train/test split, severe class imbalance, and estimator mismatch.
            </p>
          </div>
        </label>
      </div>
    </div>
  );
}
