import React, { useState, useCallback } from 'react';
import ModeSelector from './components/ModeSelector';
import CodeInputPane from './components/CodeInputPane';
import TracePlayer from './components/TracePlayer';

/**
 * TraceLens App — Stage 7: Studio Shell + Playback Scrubber.
 *
 * State machine:
 *   'intake'  — show ModeSelector + CodeInputPane
 *   'studio'  — show TracePlayer (4-pane Studio layout) driven by real trace data
 */
export default function App() {
  const [mode, setMode] = useState('logic_lens');
  const [view, setView] = useState('intake'); // 'intake' | 'studio'

  // Trace state lifted from CodeInputPane via onTraceComplete
  const [traceSteps, setTraceSteps] = useState(null);   // TraceStep[] | null
  const [sourceCode, setSourceCode] = useState('');     // last traced source

  // Playback state lives here so it persists when navigating back to intake
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);

  const handleTraceComplete = useCallback((steps, code) => {
    setTraceSteps(steps);
    setSourceCode(code);
    setCurrentStepIndex(0);
    setIsPlaying(false);
    setView('studio');
  }, []);

  const handleBackToIntake = useCallback(() => {
    setIsPlaying(false);
    setView('intake');
  }, []);

  // -------------------------------------------------------------------------
  // Studio view
  // -------------------------------------------------------------------------
  if (view === 'studio' && traceSteps && traceSteps.length > 0) {
    return (
      <main className="h-screen w-full bg-slate-950 text-slate-100 flex flex-col font-sans overflow-hidden">
        {/* Studio Top Navigation Bar */}
        <header className="flex items-center justify-between px-4 py-2.5 bg-slate-900/90 backdrop-blur border-b border-slate-800 shrink-0">
          {/* Brand & Context */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleBackToIntake}
              className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-100 bg-slate-800/80 hover:bg-slate-800 border border-slate-700/60 transition-colors px-2.5 py-1 rounded-lg"
              title="Return to Code Intake"
            >
              <span>←</span>
              <span>Intake</span>
            </button>

            <div className="h-4 w-px bg-slate-800" />

            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-md bg-gradient-to-br from-cyan-400 to-indigo-600 flex items-center justify-center shadow-sm">
                <span className="text-slate-950 font-black text-[11px] font-mono leading-none">TL</span>
              </div>
              <span className="font-semibold text-sm tracking-tight text-slate-100">
                Trace<span className="text-cyan-400">Lens</span>
              </span>
              <span className="text-[10px] font-mono uppercase tracking-wider text-cyan-400 bg-cyan-500/10 border border-cyan-500/20 px-2 py-0.5 rounded-full">
                Studio
              </span>
            </div>

            <div className="h-4 w-px bg-slate-800 hidden sm:block" />

            {/* Breadcrumb */}
            <div className="hidden sm:flex items-center gap-1.5 text-xs font-mono text-slate-400">
              <span className="text-slate-600">teammate_code /</span>
              <span className="text-slate-200 font-medium">teammate_pipeline.py</span>
            </div>
          </div>

          {/* Right Status Indicators */}
          <div className="flex items-center gap-3">
            <span className="hidden md:inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-mono text-xs">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>Trace Active</span>
            </span>

            <span className="text-xs font-mono text-slate-400 bg-slate-800/60 border border-slate-700/50 px-2.5 py-0.5 rounded-md">
              Mode: <span className="text-cyan-400 font-semibold">{mode === 'logic_lens' ? 'LogicLens' : 'ModelLens'}</span>
            </span>

            <span className="text-xs font-mono text-slate-400 bg-slate-800/60 border border-slate-700/50 px-2.5 py-0.5 rounded-md">
              <span className="text-slate-200 font-bold">{traceSteps.length}</span> steps
            </span>
          </div>
        </header>

        <TracePlayer
          code={sourceCode}
          traceSteps={traceSteps}
          currentStepIndex={currentStepIndex}
          onSelectStepIndex={setCurrentStepIndex}
          isPlaying={isPlaying}
          onTogglePlay={setIsPlaying}
          playbackSpeed={playbackSpeed}
          onChangePlaybackSpeed={setPlaybackSpeed}
        />
      </main>
    );
  }

  // -------------------------------------------------------------------------
  // Intake view (default)
  // -------------------------------------------------------------------------
  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center py-10 px-4 sm:px-6 font-sans">
      {/* Brand Header */}
      <header className="max-w-4xl w-full text-center mb-8">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-xs font-mono mb-4">
          <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
          TraceLens — Runtime Flow &amp; Auditor
        </div>

        <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight mb-3 bg-gradient-to-r from-cyan-400 via-sky-300 to-indigo-400 bg-clip-text text-transparent">
          TraceLens
        </h1>

        <p className="text-slate-400 text-sm sm:text-base max-w-xl mx-auto">
          Deterministic runtime execution visualizer and ML methodology auditor for seamless teammate handoff.
        </p>
      </header>

      {/* Mode Selector */}
      <ModeSelector mode={mode} onChange={setMode} />

      {/* Code Input Pane — wired to real backend */}
      <CodeInputPane mode={mode} onTraceComplete={handleTraceComplete} />

      <footer className="mt-12 text-center text-xs text-slate-600 font-mono">
        TraceLens • Stage 8 Visualizers Active
      </footer>
    </main>
  );
}
