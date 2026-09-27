import React from 'react';
import TraceLensHero from './TraceLensHero';
import ModeSelector from './ModeSelector';
import CodeInputPane from './CodeInputPane';

export default function HomePage({
  mode,
  setMode,
  sourceCode,
  onTraceComplete,
  hasActiveTrace = false,
  onNavigateToStudio,
  activeTraceStepCount = 0,
}) {
  const scrollToTryIt = () => {
    const el = document.getElementById('try-it');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const handleSelectModeAndScroll = (targetMode) => {
    setMode(targetMode);
    scrollToTryIt();
  };

  return (
    <div className="relative min-h-screen bg-[#001231] text-slate-100 flex flex-col font-sans selection:bg-sky-500/30 selection:text-sky-200">
      {/* ---- Global background: glow blobs + dot grid ---- */}
      <div className="pointer-events-none fixed inset-0 z-0">
        <div
          className="absolute -top-40 -right-40 h-[560px] w-[560px] rounded-full opacity-70 blur-3xl"
          style={{ background: "radial-gradient(circle, #38BDF8 0%, transparent 70%)" }}
        />
        <div
          className="absolute -bottom-32 -left-32 h-[480px] w-[480px] rounded-full opacity-60 blur-3xl"
          style={{ background: "radial-gradient(circle, #FB8C46 0%, transparent 70%)" }}
        />
        <div
          className="absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage: "radial-gradient(#ffffff 1px, transparent 1px)",
            backgroundSize: "28px 28px",
          }}
        />
      </div>

      {/* Top Navbar */}
      <header className="sticky top-0 z-40 w-full bg-[#001231]/85 backdrop-blur-md border-b border-slate-800/40 px-4 sm:px-8 py-3 flex items-center justify-between">
        {/* Left: Brand */}
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-cyan-400 via-sky-500 to-indigo-600 flex items-center justify-center shadow-[0_0_12px_rgba(56,189,248,0.35)]">
            <span className="text-slate-950 font-black text-xs font-mono leading-none">TL</span>
          </div>
          <span className="font-bold text-base tracking-tight text-white flex items-center gap-1.5">
            Trace<span className="text-sky-400">Lens</span>
          </span>
          <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-sky-500/10 border border-sky-500/20 text-sky-400 text-[10px] font-mono">
            <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-pulse" />
            Bob 2.0
          </span>
        </div>

        {/* Center: Nav links */}
        <nav className="hidden md:flex items-center gap-6 text-xs font-medium text-slate-300">
          <a href="#features" className="hover:text-sky-400 transition-colors">
            Features
          </a>
          <button
            type="button"
            onClick={() => handleSelectModeAndScroll('logic_lens')}
            className={`transition-colors flex items-center gap-1 ${mode === 'logic_lens' ? 'text-sky-400 font-semibold' : 'hover:text-sky-400'}`}
          >
            <span>LogicLens (Main)</span>
          </button>
          <button
            type="button"
            onClick={() => handleSelectModeAndScroll('model_lens')}
            className={`transition-colors flex items-center gap-1 ${mode === 'model_lens' ? 'text-orange-400 font-semibold' : 'hover:text-orange-400'}`}
          >
            <span>ModelLens (ML)</span>
          </button>
          <a href="#try-it" className="hover:text-sky-400 transition-colors">
            Workspace
          </a>
        </nav>

        {/* Right: Actions */}
        <div className="flex items-center gap-3">
          {hasActiveTrace && (
            <button
              type="button"
              onClick={onNavigateToStudio}
              className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/15 border border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/25 transition-all text-xs font-mono shadow-[0_0_12px_rgba(16,185,129,0.2)] animate-pulse"
              title="Return to currently active execution trace"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              <span>Resume Studio ({activeTraceStepCount} steps) &rarr;</span>
            </button>
          )}

          <button
            type="button"
            onClick={scrollToTryIt}
            className="hidden sm:inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-sky-500/15 hover:bg-sky-500/25 border border-sky-500/30 text-sky-400 font-mono text-xs font-semibold transition-all"
          >
            <span>Trace Script</span>
            <span>&darr;</span>
          </button>
        </div>
      </header>

      {/* Hero Section */}
      <TraceLensHero
        onTraceScriptClick={scrollToTryIt}
        onSelectMode={handleSelectModeAndScroll}
      />

      {/* Feature Showcase / Mode Breakdown Section */}
      <section id="features" className="relative z-10 w-full max-w-7xl mx-auto px-6 py-16 sm:px-10 lg:px-16">
        <div className="text-center max-w-3xl mx-auto mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-900/60 border border-slate-700/40 text-sky-400 text-xs font-mono mb-3">
            <span>TWO SPECIALIZED LENSES</span>
            <span>•</span>
            <span>ZERO HALLUCINATIONS</span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
            Engineered for Ground-Truth Clarity
          </h2>
          <p className="mt-3 text-slate-400 text-base">
            TraceLens executes code in a sandboxed Python runtime with deterministic AST instrumentation, giving you step-by-step state verification without LLM speculation.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Mode 1: LogicLens */}
          <div 
            onClick={() => handleSelectModeAndScroll('logic_lens')}
            className={`group relative rounded-2xl border p-8 transition-all cursor-pointer flex flex-col justify-between ${
              mode === 'logic_lens'
                ? 'bg-gradient-to-b from-sky-950/40 via-slate-900/60 to-[#001231] border-sky-500/50 shadow-[0_0_30px_rgba(56,189,248,0.15)] ring-1 ring-sky-500/40'
                : 'bg-slate-900/30 border-slate-700/40 hover:border-slate-600 hover:bg-slate-900/50'
            }`}
          >
            <div>
              <div className="flex items-center justify-between mb-4">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-sky-500/10 border border-sky-500/30 text-sky-400 text-xs font-mono font-bold">
                  MODE 1 • PRIMARY
                </span>
                <span className="text-xs font-mono text-slate-500">Alex&apos;s Log Pipeline</span>
              </div>

              <h3 className="text-2xl font-bold text-white group-hover:text-sky-300 transition-colors">
                LogicLens
              </h3>
              <p className="text-sm font-medium text-sky-400/90 mt-1">
                Visual Code Walkthrough &amp; Teammate Handoff
              </p>

              <p className="mt-3 text-sm text-slate-300 leading-relaxed">
                Inherited unfamiliar Python logic? Step backward and forward through loop iterations, watch memory variables mutate in real time, and locate verified safe insertion points for your modifications.
              </p>

              <ul className="mt-6 space-y-2.5 text-xs font-mono text-slate-300">
                <li className="flex items-center gap-2">
                  <span className="text-sky-400 font-bold">✓</span>
                  <span>Deterministic loop scrubber with unrolled iteration dials</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-sky-400 font-bold">✓</span>
                  <span>Step-by-step memory mutation diffs (created, mutated, deleted)</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-sky-400 font-bold">✓</span>
                  <span>Safe Insertion Markers [★ Safe Hook: Line 52]</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-sky-400 font-bold">✓</span>
                  <span>Line-by-line intent walkthrough powered by IBM Bob</span>
                </li>
              </ul>
            </div>

            <div className="mt-8 pt-4 border-t border-slate-800/80 flex items-center justify-between text-xs font-mono">
              <span className="text-slate-400">Load teammate_pipeline.py</span>
              <span className="text-sky-400 font-bold group-hover:translate-x-1 transition-transform inline-flex items-center gap-1">
                Try LogicLens &rarr;
              </span>
            </div>
          </div>

          {/* Mode 2: ModelLens */}
          <div 
            onClick={() => handleSelectModeAndScroll('model_lens')}
            className={`group relative rounded-2xl border p-8 transition-all cursor-pointer flex flex-col justify-between ${
              mode === 'model_lens'
                ? 'bg-gradient-to-b from-orange-950/40 via-slate-900/60 to-[#001231] border-orange-500/50 shadow-[0_0_30px_rgba(251,140,70,0.15)] ring-1 ring-orange-500/40'
                : 'bg-slate-900/30 border-slate-700/40 hover:border-slate-600 hover:bg-slate-900/50'
            }`}
          >
            <div>
              <div className="flex items-center justify-between mb-4">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-orange-500/10 border border-orange-500/30 text-orange-400 text-xs font-mono font-bold">
                  MODE 2 • ML AUDITOR
                </span>
                <span className="text-xs font-mono text-slate-500">Jordan&apos;s Churn Model</span>
              </div>

              <h3 className="text-2xl font-bold text-white group-hover:text-orange-300 transition-colors">
                ModelLens
              </h3>
              <p className="text-sm font-medium text-orange-400/90 mt-1">
                ML &amp; Data Science Methodology Guard
              </p>

              <p className="mt-3 text-sm text-slate-300 leading-relaxed">
                Catch silent data leakage bugs, unhandled class imbalance, and stochastic training anomalies before models deploy to production.
              </p>

              <ul className="mt-6 space-y-2.5 text-xs font-mono text-slate-300">
                <li className="flex items-center gap-2">
                  <span className="text-orange-400 font-bold">✓</span>
                  <span>Pre-split data leakage detection (scaler.fit before split)</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-orange-400 font-bold">✓</span>
                  <span>Target class imbalance alert (e.g. 92/8 skew inspection)</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-orange-400 font-bold">✓</span>
                  <span>Interactive execution DAG &amp; tensor dimension tracker</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-orange-400 font-bold">✓</span>
                  <span>One-click AI remediation patch diff with Bob AI engine</span>
                </li>
              </ul>
            </div>

            <div className="mt-8 pt-4 border-t border-slate-800/80 flex items-center justify-between text-xs font-mono">
              <span className="text-slate-400">Load dsai_leakage_sample.py</span>
              <span className="text-orange-400 font-bold group-hover:translate-x-1 transition-transform inline-flex items-center gap-1">
                Try ModelLens &rarr;
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Interactive Studio Workspace Section */}
      <section id="try-it" className="relative z-10 w-full border-t border-slate-700/30 py-16 px-4 sm:px-6 flex flex-col items-center">
        <div className="max-w-4xl w-full text-center mb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-xs font-mono mb-4">
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
            Interactive Trace Studio
          </div>

          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight mb-3 text-white">
            Run a Sandboxed Execution Trace
          </h2>

          <p className="text-slate-400 text-sm sm:text-base max-w-xl mx-auto">
            Select a mode, paste your Python script or notebook, and launch the deterministic execution replay.
          </p>
        </div>

        {/* Mode Selector */}
        <ModeSelector mode={mode} onChange={setMode} />

        {/* Code Input Pane */}
        <CodeInputPane
          mode={mode}
          onTraceComplete={onTraceComplete}
          onRequestMode={setMode}
          initialCode={sourceCode}
        />
      </section>

      {/* Footer */}
      <footer className="relative z-10 w-full border-t border-slate-700/30 py-12 px-6 sm:px-10 text-center text-xs text-slate-500 font-sans">
        <div className="max-w-4xl mx-auto flex flex-col items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded bg-gradient-to-br from-cyan-400 to-indigo-600 flex items-center justify-center">
              <span className="text-slate-950 font-black text-[9px] font-mono leading-none">TL</span>
            </div>
            <span className="font-bold text-slate-300">TraceLens</span>
          </div>

          <p className="italic text-slate-400 text-sm">
            “Don’t just read the code — watch it think, frame by frame.”
          </p>

          <div className="flex items-center gap-4 text-slate-500 font-mono text-[11px]">
            <span>IBM Bob 2.0 Hackathon</span>
            <span>•</span>
            <a
              href="https://github.com/Omar-astro/Tracelens"
              target="_blank"
              rel="noreferrer"
              className="text-sky-400 hover:underline"
            >
              github.com/Omar-astro/Tracelens
            </a>
            <span>•</span>
            <button
              type="button"
              onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
              className="hover:text-slate-300 transition-colors"
            >
              Back to Top &uarr;
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
