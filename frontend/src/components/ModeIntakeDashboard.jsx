import React, { useState } from 'react';
import { TEAMMATE_PIPELINE_CODE } from '../data/logicLensData';
import { SAMPLE_CODE_DEFAULT } from '../data/pipelineData';
import { SAMPLE_CODE_IMBALANCE } from './InputPanel';

export default function ModeIntakeDashboard({
  onLaunchTrace,
  isExecuting = false,
  initialMode = 'logic_lens'
}) {
  const [selectedMode, setSelectedMode] = useState(initialMode); // 'logic_lens' | 'model_lens'
  const [activeTab, setActiveTab] = useState('paste'); // 'paste' | 'upload' | 'sample'
  const [code, setCode] = useState(initialMode === 'logic_lens' ? TEAMMATE_PIPELINE_CODE : SAMPLE_CODE_DEFAULT);
  const [fileName, setFileName] = useState(initialMode === 'logic_lens' ? 'teammate_pipeline.py' : 'churn_prediction.ipynb');
  const [uploadedFile, setUploadedFile] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);

  // Switch Mode handler
  const handleSelectMode = (mode) => {
    setSelectedMode(mode);
    if (mode === 'logic_lens') {
      setCode(TEAMMATE_PIPELINE_CODE);
      setFileName('teammate_pipeline.py');
    } else {
      setCode(SAMPLE_CODE_DEFAULT);
      setFileName('churn_prediction.ipynb');
    }
  };

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      setErrorMsg('File exceeds 2MB sandbox limit.');
      return;
    }
    setErrorMsg(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result;
      if (file.name.endsWith('.ipynb')) {
        try {
          const parsed = JSON.parse(text);
          const codeCells = parsed.cells
            ?.filter(c => c.cell_type === 'code')
            ?.map(c => Array.isArray(c.source) ? c.source.join('') : c.source)
            ?.join('\n\n# --- In [Cell] ---\n') || text;
          setCode(codeCells);
        } catch {
          setCode(text);
        }
      } else {
        setCode(text);
      }
      setFileName(file.name);
      setUploadedFile({
        name: file.name,
        size: `${(file.size / 1024).toFixed(1)} KB`,
        type: file.name.endsWith('.ipynb') ? 'Jupyter Notebook' : 'Python Script'
      });
      setActiveTab('paste');
    };
    reader.onerror = () => {
      setErrorMsg('Failed to read file contents.');
    };
    reader.readAsText(file);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onLaunchTrace({
      mode: selectedMode,
      code,
      fileName
    });
  };

  const lines = code.split('\n');

  return (
    <div className="w-full min-h-screen bg-background text-on-surface py-space-xl px-space-md flex flex-col items-center">
      {/* Hero Header */}
      <div className="max-w-4xl w-full text-center flex flex-col items-center gap-space-xs mb-space-lg">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-surface-container border border-surface-variant/40 text-primary font-mono text-label-xs mb-1">
          <span className="w-2 h-2 rounded-full bg-secondary animate-pulse" />
          <span>IBM Bob 2.0 Hackathon • lablab.ai</span>
        </div>

        <h1 className="font-headline-xl text-3xl md:text-4xl text-on-surface font-bold tracking-tight">
          Trace<span className="text-primary">Lens</span> Studio Intake
        </h1>

        <p className="text-body-md text-on-surface-variant max-w-2xl leading-relaxed">
          The deterministic runtime visualizer for inheriting teammate code and auditing ML methodology. Zero LLM hallucinations during execution tracking.
        </p>
      </div>

      {/* Main Mode Selection Card (Implementation Plan §2) */}
      <div className="max-w-4xl w-full flex flex-col gap-space-lg">
        <div className="flex flex-col gap-space-xs">
          <span className="font-label-xs text-label-xs uppercase tracking-widest text-outline font-mono">
            Step 1: Select Analysis Lens
          </span>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-space-md">
            {/* MODE 1: LogicLens (DEFAULT - TOP BUILD PRIORITY) */}
            <div
              onClick={() => handleSelectMode('logic_lens')}
              className={`p-space-lg rounded-xl border cursor-pointer transition-all flex flex-col justify-between ${
                selectedMode === 'logic_lens'
                  ? 'bg-surface-container-low border-primary shadow-[0_0_20px_rgba(56,189,248,0.15)] ring-1 ring-primary'
                  : 'bg-surface-container-lowest border-surface-variant/30 hover:border-outline-variant hover:bg-surface-container-low/60'
              }`}
            >
              <div className="flex flex-col gap-space-xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-4 h-4 rounded-full border-2 flex items-center justify-center border-primary">
                      {selectedMode === 'logic_lens' && (
                        <span className="w-2 h-2 rounded-full bg-primary" />
                      )}
                    </span>
                    <span className="font-headline-sm text-headline-sm text-primary font-bold">
                      MODE 1: LogicLens
                    </span>
                  </div>
                  <span className="px-2 py-0.5 rounded font-label-xs text-label-xs font-mono font-bold bg-secondary/15 text-secondary border border-secondary/30">
                    MAIN PRIORITY
                  </span>
                </div>

                <p className="font-headline-sm text-on-surface font-semibold mt-1">
                  Visual Code Walkthrough & Teammate Handoff Engine
                </p>

                <p className="font-body-sm text-body-sm text-on-surface-variant leading-relaxed">
                  Inherited a teammate&apos;s Python script? Step through deterministic loop dials, branch evaluations, runtime memory deltas, and pinpoint safe code insertion zones.
                </p>

                <ul className="text-body-sm text-outline space-y-1 font-mono text-[11px] mt-2">
                  <li className="flex items-center gap-1.5">
                    <span className="text-secondary font-bold">✓</span>
                    <span>Manual deterministic loop dials & unrolled iteration carousel</span>
                  </li>
                  <li className="flex items-center gap-1.5">
                    <span className="text-secondary font-bold">✓</span>
                    <span>Step-by-step memory mutation diffs (created, mutated, deleted)</span>
                  </li>
                  <li className="flex items-center gap-1.5">
                    <span className="text-secondary font-bold">✓</span>
                    <span>Safe Insertion Markers [★ Safe Hook: Line 25]</span>
                  </li>
                  <li className="flex items-center gap-1.5">
                    <span className="text-secondary font-bold">✓</span>
                    <span>Line-by-line intent walkthrough powered by IBM Bob</span>
                  </li>
                </ul>
              </div>

              <div className="mt-4 pt-3 border-t border-surface-variant/20 flex items-center justify-between text-label-xs text-outline font-mono">
                <span>Demo: Alex&apos;s Log Sanitizer</span>
                <span className="text-primary font-semibold">teammate_pipeline.py →</span>
              </div>
            </div>

            {/* MODE 2: ModelLens (ML Pipeline Auditor) */}
            <div
              onClick={() => handleSelectMode('model_lens')}
              className={`p-space-lg rounded-xl border cursor-pointer transition-all flex flex-col justify-between ${
                selectedMode === 'model_lens'
                  ? 'bg-surface-container-low border-tertiary shadow-[0_0_20px_rgba(213,195,255,0.15)] ring-1 ring-tertiary'
                  : 'bg-surface-container-lowest border-surface-variant/30 hover:border-outline-variant hover:bg-surface-container-low/60'
              }`}
            >
              <div className="flex flex-col gap-space-xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-4 h-4 rounded-full border-2 flex items-center justify-center border-tertiary">
                      {selectedMode === 'model_lens' && (
                        <span className="w-2 h-2 rounded-full bg-tertiary" />
                      )}
                    </span>
                    <span className="font-headline-sm text-headline-sm text-tertiary font-bold">
                      MODE 2: ModelLens
                    </span>
                  </div>
                  <span className="px-2 py-0.5 rounded font-label-xs text-label-xs font-mono bg-surface-container-high text-outline">
                    ML AUDITOR
                  </span>
                </div>

                <p className="font-headline-sm text-on-surface font-semibold mt-1">
                  ML & Data Science Methodology Guard
                </p>

                <p className="font-body-sm text-body-sm text-on-surface-variant leading-relaxed">
                  Catch catastrophic data leakage, target class skew, and estimator mismatches before training models on contaminated splits.
                </p>

                <ul className="text-body-sm text-outline space-y-1 font-mono text-[11px] mt-2">
                  <li className="flex items-center gap-1.5">
                    <span className="text-tertiary font-bold">✓</span>
                    <span>Pre-split data leakage detection (scaler.fit before split)</span>
                  </li>
                  <li className="flex items-center gap-1.5">
                    <span className="text-tertiary font-bold">✓</span>
                    <span>Target class imbalance alert (92/8 skew inspection)</span>
                  </li>
                  <li className="flex items-center gap-1.5">
                    <span className="text-tertiary font-bold">✓</span>
                    <span>Interactive execution DAG & tensor dimension watcher</span>
                  </li>
                  <li className="flex items-center gap-1.5">
                    <span className="text-tertiary font-bold">✓</span>
                    <span>One-click AI remediation patch diff by Bob AI</span>
                  </li>
                </ul>
              </div>

              <div className="mt-4 pt-3 border-t border-surface-variant/20 flex items-center justify-between text-label-xs text-outline font-mono">
                <span>Demo: Jordan&apos;s Churn Model</span>
                <span className="text-tertiary font-semibold">churn_prediction.ipynb →</span>
              </div>
            </div>
          </div>
        </div>

        {/* Step 2: Code Ingestion & Pre-loaders Card */}
        <div className="bg-surface-container-low rounded-xl border border-surface-variant/30 p-space-lg flex flex-col gap-space-md shadow-xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-space-sm border-b border-surface-variant/20 pb-space-sm">
            {/* Input Mode Tabs */}
            <div className="flex items-center gap-1 bg-surface-container-lowest p-1 rounded-lg border border-surface-variant/30 font-label-md text-label-md">
              <button
                type="button"
                onClick={() => setActiveTab('paste')}
                className={`flex items-center gap-1.5 px-3 py-1 rounded transition-all font-mono ${
                  activeTab === 'paste'
                    ? 'bg-surface-container-high text-primary font-semibold shadow-sm'
                    : 'text-outline hover:text-on-surface'
                }`}
              >
                <span className="material-symbols-outlined text-[15px]">code_blocks</span>
                <span>Code Editor</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('upload')}
                className={`flex items-center gap-1.5 px-3 py-1 rounded transition-all font-mono ${
                  activeTab === 'upload'
                    ? 'bg-surface-container-high text-primary font-semibold shadow-sm'
                    : 'text-outline hover:text-on-surface'
                }`}
              >
                <span className="material-symbols-outlined text-[15px]">upload_file</span>
                <span>Upload (.py / .ipynb)</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('sample')}
                className={`flex items-center gap-1.5 px-3 py-1 rounded transition-all font-mono ${
                  activeTab === 'sample'
                    ? 'bg-surface-container-high text-secondary font-semibold shadow-sm'
                    : 'text-outline hover:text-on-surface'
                }`}
              >
                <span className="material-symbols-outlined text-[15px]">auto_stories</span>
                <span>Sample Scripts</span>
              </button>
            </div>

            {/* Quick Demo Selector Chips */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[11px] font-mono text-outline uppercase">Quick Load:</span>
              <button
                type="button"
                onClick={() => {
                  setSelectedMode('logic_lens');
                  setCode(TEAMMATE_PIPELINE_CODE);
                  setFileName('teammate_pipeline.py');
                }}
                className={`px-2 py-0.5 rounded text-[11px] font-mono transition-all border ${
                  selectedMode === 'logic_lens'
                    ? 'bg-secondary/20 text-secondary border-secondary/40 font-bold'
                    : 'bg-surface-container text-on-surface-variant border-surface-variant/40 hover:text-on-surface'
                }`}
              >
                Alex&apos;s Pipeline (Mode 1)
              </button>

              <button
                type="button"
                onClick={() => {
                  setSelectedMode('model_lens');
                  setCode(SAMPLE_CODE_DEFAULT);
                  setFileName('churn_prediction.ipynb');
                }}
                className={`px-2 py-0.5 rounded text-[11px] font-mono transition-all border ${
                  selectedMode === 'model_lens'
                    ? 'bg-tertiary/20 text-tertiary border-tertiary/40 font-bold'
                    : 'bg-surface-container text-on-surface-variant border-surface-variant/40 hover:text-on-surface'
                }`}
              >
                DSAI Leakage (Mode 2)
              </button>
            </div>
          </div>

          {/* TAB 1: CODE EDITOR */}
          {activeTab === 'paste' && (
            <div className="flex flex-col gap-space-xs">
              <div className="flex items-center justify-between text-outline font-label-xs text-label-xs font-mono">
                <span className="flex items-center gap-1">
                  <span className="material-symbols-outlined text-[14px]">description</span>
                  <span>{fileName}</span>
                  <span>({lines.length} lines)</span>
                </span>
                <button
                  type="button"
                  onClick={() => setCode('')}
                  className="hover:text-error transition-colors uppercase text-[10px]"
                >
                  Clear Editor
                </button>
              </div>

              {/* Code Surface with line numbers */}
              <div className="bg-surface-container-lowest rounded-lg border border-surface-variant/30 flex overflow-hidden shadow-inner h-72">
                <div className="bg-surface-container-lowest select-none py-2 px-2 text-right font-mono text-[12px] text-outline-variant flex flex-col space-y-0 w-10 shrink-0 leading-5 border-r border-surface-variant/20 overflow-hidden">
                  {lines.slice(0, 50).map((_, i) => (
                    <span key={i}>{i + 1}</span>
                  ))}
                </div>

                <textarea
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  spellCheck="false"
                  placeholder="# Paste teammate Python script or model pipeline here..."
                  className="flex-1 bg-transparent text-on-surface font-mono text-[12px] leading-5 p-2 focus:outline-none resize-none selection:bg-primary/20"
                />
              </div>
            </div>
          )}

          {/* TAB 2: UPLOAD FILE */}
          {activeTab === 'upload' && (
            <div className="flex flex-col gap-space-sm items-center justify-center p-space-lg border-2 border-dashed border-surface-variant/40 rounded-lg bg-surface-container-lowest">
              <span className="material-symbols-outlined text-4xl text-primary">cloud_upload</span>
              <p className="font-headline-sm text-headline-sm text-on-surface">
                Drop Python Script (.py) or Jupyter Notebook (.ipynb)
              </p>
              <p className="font-body-sm text-body-sm text-outline">
                Supports automatic cell extraction and AST pre-pass parsing.
              </p>

              <label className="cursor-pointer bg-primary hover:bg-primary-container text-on-primary font-label-md text-label-md px-4 py-2 rounded font-semibold transition-all">
                <span>Browse Files</span>
                <input
                  type="file"
                  accept=".py,.ipynb"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>

              {errorMsg && (
                <div className="p-2 rounded bg-error-container/20 text-error font-mono text-label-xs flex items-center gap-2 border border-error/30">
                  <span className="material-symbols-outlined text-[16px]">error</span>
                  <span>{errorMsg}</span>
                </div>
              )}

              {uploadedFile && (
                <div className="mt-2 p-2 rounded bg-surface-container text-secondary font-mono text-label-xs flex items-center gap-2 border border-secondary/30">
                  <span className="material-symbols-outlined text-[16px]">check_circle</span>
                  <span>Loaded {uploadedFile.name} ({uploadedFile.size})</span>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: SAMPLE SCRIPTS */}
          {activeTab === 'sample' && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-space-sm">
              <button
                type="button"
                onClick={() => {
                  setSelectedMode('logic_lens');
                  setCode(TEAMMATE_PIPELINE_CODE);
                  setFileName('teammate_pipeline.py');
                  setActiveTab('paste');
                }}
                className="p-space-sm rounded-lg bg-surface-container border border-surface-variant/40 hover:border-secondary transition-all text-left flex flex-col gap-1"
              >
                <span className="font-label-xs text-label-xs uppercase font-mono text-secondary font-bold">
                  Mode 1 Sample (Main)
                </span>
                <strong className="text-on-surface text-body-md font-mono">teammate_pipeline.py</strong>
                <p className="text-body-sm text-outline text-[12px]">
                  Alex&apos;s log cleaner loop, error counters, and safe insertion hook on line 25.
                </p>
              </button>

              <button
                type="button"
                onClick={() => {
                  setSelectedMode('model_lens');
                  setCode(SAMPLE_CODE_DEFAULT);
                  setFileName('churn_prediction.ipynb');
                  setActiveTab('paste');
                }}
                className="p-space-sm rounded-lg bg-surface-container border border-surface-variant/40 hover:border-error transition-all text-left flex flex-col gap-1"
              >
                <span className="font-label-xs text-label-xs uppercase font-mono text-error font-bold">
                  Mode 2 Sample (Leakage)
                </span>
                <strong className="text-on-surface text-body-md font-mono">dsai_leakage_sample.py</strong>
                <p className="text-body-sm text-outline text-[12px]">
                  Pre-split StandardScaler fit_transform contaminating holdout validation split.
                </p>
              </button>

              <button
                type="button"
                onClick={() => {
                  setSelectedMode('model_lens');
                  setCode(SAMPLE_CODE_IMBALANCE);
                  setFileName('credit_imbalance.ipynb');
                  setActiveTab('paste');
                }}
                className="p-space-sm rounded-lg bg-surface-container border border-surface-variant/40 hover:border-tertiary transition-all text-left flex flex-col gap-1"
              >
                <span className="font-label-xs text-label-xs uppercase font-mono text-tertiary font-bold">
                  Mode 2 Sample (Skew)
                </span>
                <strong className="text-on-surface text-body-md font-mono">credit_imbalance.py</strong>
                <p className="text-body-sm text-outline text-[12px]">
                  96.5% / 3.5% credit default target skew and unweighted classifier mismatch.
                </p>
              </button>
            </div>
          )}

          {/* Action Row */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-space-md pt-2 border-t border-surface-variant/20">
            <div className="flex items-center gap-2 text-outline font-mono text-[11px]">
              <span className="material-symbols-outlined text-[15px]">security</span>
              <span>Sandboxed Execution: Hard timeout 30s • Restricted Namespace</span>
            </div>

            <button
              type="button"
              onClick={handleSubmit}
              disabled={isExecuting || !code.trim()}
              className="flex items-center justify-center gap-2 px-6 py-2.5 rounded-lg bg-primary hover:bg-primary-container text-on-primary font-headline-sm font-semibold transition-all shadow-[0_4px_16px_rgba(56,189,248,0.3)] disabled:opacity-50 cursor-pointer"
            >
              {isExecuting ? (
                <>
                  <span className="material-symbols-outlined text-[18px] animate-spin">progress_activity</span>
                  <span>Tracing Execution Sandbox...</span>
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-[18px]">play_arrow</span>
                  <span>Trace &amp; Walk Through ({selectedMode === 'logic_lens' ? 'LogicLens' : 'ModelLens'})</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
