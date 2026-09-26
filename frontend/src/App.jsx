import React from 'react';

/**
 * Stage 1 Placeholder Screen for TraceLens.
 * Stage 2 will introduce the Intake UI and ModeSelector.
 */
export default function App() {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-6 text-center select-none font-sans">
      <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-xs font-mono mb-4">
        <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse"></span>
        Stage 1 Scaffold Active
      </div>
      <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight mb-3 bg-gradient-to-r from-cyan-400 via-sky-300 to-indigo-400 bg-clip-text text-transparent">
        TraceLens
      </h1>
      <p className="text-slate-400 text-base sm:text-lg max-w-md">
        Deterministic runtime execution visualizer and ML methodology auditor for teammate handoff.
      </p>
      <div className="mt-8 text-xs text-slate-500 font-mono">
        TraceLens — coming soon
      </div>
    </main>
  );
}
