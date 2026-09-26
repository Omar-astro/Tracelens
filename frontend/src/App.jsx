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
      <main className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
        {/* Studio Header Bar */}
        <header className="flex items-center justify-between px-4 py-2 bg-slate-900 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleBackToIntake}
              className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-100 transition-colors px-2 py-1 rounded hover:bg-slate-800"
            >
              ← Back
            </button>
            <span className="text-xs font-mono text-cyan-400 bg-cyan-500/10 border border-cyan-500/20 px-2 py-0.5 rounded-full">
              TraceLens Studio
            </span>
            <span className="text-xs text-slate-500 font-mono hidden sm:inline">
              Mode: {mode === 'logic_lens' ? 'LogicLens' : 'ModelLens'}
            </span>
          </div>
          <span className="text-xs text-slate-600 font-mono">
            {traceSteps.length} steps
          </span>
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
        TraceLens • Stage 7 Studio Shell Active
      </footer>
    </main>
  );
}
