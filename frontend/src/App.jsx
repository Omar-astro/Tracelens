import React, { useState } from 'react';
import ModeSelector from './components/ModeSelector';
import CodeInputPane from './components/CodeInputPane';

/**
 * TraceLens App - Stage 2: Frontend Intake UI (mocked, no network)
 */
export default function App() {
  const [mode, setMode] = useState('logic_lens');

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center py-10 px-4 sm:px-6 font-sans">
      {/* Brand Header */}
      <header className="max-w-4xl w-full text-center mb-8">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-xs font-mono mb-4">
          <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse"></span>
          TraceLens — Runtime Flow & Auditor
        </div>

        <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight mb-3 bg-gradient-to-r from-cyan-400 via-sky-300 to-indigo-400 bg-clip-text text-transparent">
          TraceLens
        </h1>

        <p className="text-slate-400 text-sm sm:text-base max-w-xl mx-auto">
          Deterministic runtime execution visualizer and ML methodology auditor for seamless teammate handoff.
        </p>
      </header>

      {/* Mode Selector (Stage 2) */}
      <ModeSelector mode={mode} onChange={setMode} />

      {/* Code Input Pane (Stage 2) */}
      <CodeInputPane mode={mode} />

      {/* Footer info */}
      <footer className="mt-12 text-center text-xs text-slate-600 font-mono">
        TraceLens • Stage 2 Intake Screen • No network calls active
      </footer>
    </main>
  );
}
