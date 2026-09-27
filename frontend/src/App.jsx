import React, { useState, useCallback } from 'react';
import HomePage from './components/HomePage';
import TracePlayer from './components/TracePlayer';
import { postTrace } from './api/traceClient';
import { clearExplanationCache } from './api/explanationCache';

/**
 * TraceLens App — Landing Home Page & Interactive Studio Shell.
 *
 * State machine:
 *   'home'    — show Landing Home Page (TraceLensHero + Lens breakdown + #try-it workspace)
 *   'studio'  — show TracePlayer (4-pane Studio layout) driven by real trace data
 */
export default function App() {
  const [mode, setMode] = useState('logic_lens');
  const [view, setView] = useState('home'); // 'home' | 'studio'

  // Trace state lifted from CodeInputPane via onTraceComplete
  const [traceSteps, setTraceSteps] = useState(null);               // TraceStep[] | null
  const [sourceCode, setSourceCode] = useState('');                 // last traced source.
  const [sourceName, setSourceName] = useState('Code Editor');       // 'Code Editor' | file name | 'Sample Script'
  const [safeInsertionPoints, setSafeInsertionPoints] = useState([]); // Stage 10
  // Stage 14: ModelLens audit issues from the Stage 13 engine (model_lens mode only)
  const [mlAuditIssues, setMlAuditIssues] = useState([]);
  // Stage 14: Appendix B.2 handoff summary — cached one-per-trace so the drawer
  // renders instantly on re-open and never re-calls the LLM.
  const [handoffSummary, setHandoffSummary] = useState(null);

  // Playback state lives here so it persists when navigating back to intake/home
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);

  const handleTraceComplete = useCallback((steps, code, safePoints = [], mlIssues = [], name = 'Code Editor') => {
    clearExplanationCache();
    setTraceSteps(steps);
    setSourceCode(code);
    setSafeInsertionPoints(safePoints);
    setMlAuditIssues(Array.isArray(mlIssues) ? mlIssues : []);
    setHandoffSummary(null);
    setCurrentStepIndex(0);
    setIsPlaying(false);
    setSourceName(name);
    setView('studio');
  }, []);

  const handleHandoffSummaryGenerated = useCallback((summary) => {
    setHandoffSummary(summary);
  }, []);

  const handleBackToHome = useCallback(() => {
    setIsPlaying(false);
    setView('home');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const handleBackToEditor = useCallback(() => {
    setIsPlaying(false);
    setView('home');
    setTimeout(() => {
      document.getElementById('try-it')?.scrollIntoView({ behavior: 'smooth' });
    }, 50);
  }, []);

  const handleApplyCodeFix = useCallback((newCode) => {
    setSourceCode(newCode);
  }, []);

  const handleReTrace = useCallback(async (newCode) => {
    setSourceCode(newCode);
    try {
      const res = await postTrace(newCode, mode);
      handleTraceComplete(
        res.steps,
        newCode,
        res.safe_insertion_points || [],
        res.ml_audit_issues || [],
        sourceName
      );
    } catch (err) {
      console.error("Failed to re-trace patched code:", err);
    }
  }, [mode, handleTraceComplete, sourceName]);


  // -------------------------------------------------------------------------
  // Studio view (active trace replay)
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
              onClick={handleBackToHome}
              className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-100 bg-slate-800/80 hover:bg-slate-800 border border-slate-700/60 transition-colors px-2.5 py-1 rounded-lg cursor-pointer"
              title="Return to Home Page"
            >
              <span>←</span>
              <span>Home</span>
            </button>

            <button
              type="button"
              onClick={handleBackToEditor}
              className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-100 bg-slate-800/80 hover:bg-slate-800 border border-slate-700/60 transition-colors px-2.5 py-1 rounded-lg cursor-pointer"
              title="Return to Code Intake & Editor"
            >
              <span>←</span>
              <span>Intake</span>
            </button>

            <div className="h-4 w-px bg-slate-800" />

            <div 
              className="flex items-center gap-2 cursor-pointer"
              onClick={handleBackToHome}
              title="TraceLens Home"
            >
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
              <span className="text-slate-400 font-semibold">{mode === 'logic_lens' ? 'LogicLens' : 'ModelLens'}</span>
              <span className="text-slate-600">/</span>
              <span className="text-slate-100 font-medium">{sourceName}</span>
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
          fileName={sourceName}
          traceSteps={traceSteps}
          currentStepIndex={currentStepIndex}
          onSelectStepIndex={setCurrentStepIndex}
          isPlaying={isPlaying}
          onTogglePlay={setIsPlaying}
          playbackSpeed={playbackSpeed}
          onChangePlaybackSpeed={setPlaybackSpeed}
          safeInsertionPoints={safeInsertionPoints}
          mode={mode}
          mlAuditIssues={mlAuditIssues}
          handoffSummary={handoffSummary}
          onHandoffSummaryGenerated={handleHandoffSummaryGenerated}
          onApplyCodeFix={handleApplyCodeFix}
          onReTrace={handleReTrace}
        />
      </main>
    );
  }

  // -------------------------------------------------------------------------
  // Home Page view (default landing page)
  // -------------------------------------------------------------------------
  return (
    <HomePage
      mode={mode}
      setMode={setMode}
      sourceCode={sourceCode}
      onTraceComplete={handleTraceComplete}
      hasActiveTrace={!!(traceSteps && traceSteps.length > 0)}
      onNavigateToStudio={() => setView('studio')}
      activeTraceStepCount={traceSteps?.length || 0}
    />
  );
}
