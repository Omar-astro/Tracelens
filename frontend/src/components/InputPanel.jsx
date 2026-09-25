import React, { useState } from 'react';
import { 
  SAMPLE_CODE_DEFAULT, 
  SAMPLE_CODE_REMEDIATED 
} from '../data/pipelineData';

export const SAMPLE_CODE_IMBALANCE = `import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import classification_report

# Credit Default dataset with extreme 96.5% class imbalance
df = pd.read_parquet("s3://financial-risk/credit_default.parquet")
df = df.dropna(subset=["credit_score", "annual_income"])
X = df.drop(columns=["default", "account_id"])

# Target variable has severe skew: 965 non-default vs 35 default
y = df["default"]

# Split performed correctly without data leakage
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

# SEVERE METHODOLOGY FLAW: Simple linear model with class_weight=None on 96.5/3.5 skew
model = LogisticRegression(penalty="l2", C=1.0, class_weight=None)
model.fit(X_train, y_train)

# Model achieves 96.5% apparent accuracy by predicting 0 constantly - zero recall on defaults!
y_pred = model.predict(X_test)
print(classification_report(y_test, y_pred))

__trace_telemetry_flush()`;

export default function InputPanel({
  onRunAudit,
  isExecuting = false,
  onCancel
}) {
  const [activeTab, setActiveTab] = useState('paste'); // 'paste' | 'upload' | 'github'
  const [code, setCode] = useState(SAMPLE_CODE_DEFAULT);
  const [fileName, setFileName] = useState('churn_prediction.ipynb');
  const [runtime, setRuntime] = useState('Python 3.11 (PyTorch 2.3, Scikit-Learn 1.4, Pandas)');
  const [repoUrl, setRepoUrl] = useState('org-tensorflow-guard/risk-scoring-pipeline');
  const [branch, setBranch] = useState('main (commit 8f31b2c)');
  const [selectedRepoFile, setSelectedRepoFile] = useState('models/churn_prediction.ipynb');
  const [uploadedFile, setUploadedFile] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);

  const [presets, setPresets] = useState({
    dataLeakage: true,
    targetImbalance: true,
    tensorShapes: true,
    seedGovernance: true
  });

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      setErrorMsg('File exceeds 2MB hackathon sandbox limit.');
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
    };
    reader.readAsText(file);
  };

  const handleSelectPlanted = (scenario) => {
    if (scenario === 'leakage') {
      setCode(SAMPLE_CODE_DEFAULT);
      setFileName('leakage_example.ipynb');
      setActiveTab('paste');
    } else if (scenario === 'imbalance') {
      setCode(SAMPLE_CODE_IMBALANCE);
      setFileName('imbalance_example.ipynb');
      setActiveTab('paste');
    } else if (scenario === 'remediated') {
      setCode(SAMPLE_CODE_REMEDIATED);
      setFileName('clean_pipeline.py');
      setActiveTab('paste');
    }
  };

  const handleSubmit = (e) => {
    e?.preventDefault();
    if (!code.trim()) {
      setErrorMsg('Please paste, upload, or choose a pipeline script to trace.');
      return;
    }
    setErrorMsg(null);
    onRunAudit({
      code,
      fileName,
      runtime,
      tab: activeTab
    });
  };

  return (
    <div className="w-full max-w-5xl mx-auto flex flex-col gap-space-lg p-space-md animate-in fade-in duration-300">
      {/* Header Banner */}
      <div className="bg-surface-container-low rounded-xl p-space-xl border border-surface-variant/30 flex flex-col md:flex-row items-start md:items-center justify-between gap-space-md shadow-lg">
        <div className="flex items-start gap-space-md">
          <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary shrink-0 border border-primary/20">
            <span className="material-symbols-outlined text-[28px]">troubleshoot</span>
          </div>
          <div>
            <div className="flex items-center gap-space-sm flex-wrap">
              <h1 className="font-headline-lg text-headline-lg text-on-surface font-semibold tracking-tight">
                TraceLens Input & Ingestion
              </h1>
              <span className="px-2 py-0.5 rounded bg-secondary-fixed/10 text-secondary-fixed font-label-xs text-label-xs font-mono uppercase">
                Phase 1 Normalized Source
              </span>
            </div>
            <p className="font-body-md text-body-md text-on-surface-variant mt-1 max-w-2xl leading-relaxed">
              Submit your machine learning script or notebook via paste, file upload, or GitHub repository. TraceLens traces runtime variables, AST semantics, and detects data leakage, class imbalance, and model mismatches.
            </p>
          </div>
        </div>

        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="px-space-md py-1.5 rounded bg-surface-container text-on-surface hover:bg-surface-container-high transition-colors font-label-md text-label-md border border-outline-variant/30 self-end md:self-auto"
          >
            Back to Active Trace
          </button>
        )}
      </div>

      {/* Planted Demo Quick Selectors (Phase 5 of implementation plan) */}
      <div className="flex flex-col gap-2">
        <span className="font-label-xs text-label-xs uppercase tracking-wider text-outline font-mono">
          Pre-Configured Planted Demos (IBM Hackathon Scenarios):
        </span>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-space-sm">
          {/* Planted 1: Leakage */}
          <div 
            onClick={() => handleSelectPlanted('leakage')}
            className={`p-space-md rounded-lg bg-surface-container-low border cursor-pointer transition-all hover:-translate-y-0.5 ${
              fileName === 'leakage_example.ipynb' || fileName === 'churn_prediction.ipynb'
                ? 'border-error/60 bg-surface-container ring-1 ring-error/40'
                : 'border-surface-variant/30 hover:border-error/40'
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="font-code-sm text-code-sm text-error font-bold font-mono">
                Planted Demo 1
              </span>
              <span className="text-[10px] font-mono uppercase px-1.5 py-0.2 rounded bg-error-container/20 text-error">
                Critical Leak
              </span>
            </div>
            <div className="font-body-sm text-body-sm text-on-surface font-medium">
              leakage_example.ipynb
            </div>
            <p className="font-body-sm text-[12px] text-outline mt-1 leading-snug">
              StandardScaler fit_transform executed before train_test_split. Global moment pollution (+8.4% ROC-AUC inflation).
            </p>
          </div>

          {/* Planted 2: Imbalance */}
          <div 
            onClick={() => handleSelectPlanted('imbalance')}
            className={`p-space-md rounded-lg bg-surface-container-low border cursor-pointer transition-all hover:-translate-y-0.5 ${
              fileName === 'imbalance_example.ipynb'
                ? 'border-tertiary/60 bg-surface-container ring-1 ring-tertiary/40'
                : 'border-surface-variant/30 hover:border-tertiary/40'
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="font-code-sm text-code-sm text-tertiary font-bold font-mono">
                Planted Demo 2
              </span>
              <span className="text-[10px] font-mono uppercase px-1.5 py-0.2 rounded bg-tertiary-container/20 text-tertiary">
                Class Skew
              </span>
            </div>
            <div className="font-body-sm text-body-sm text-on-surface font-medium">
              imbalance_example.ipynb
            </div>
            <p className="font-body-sm text-[12px] text-outline mt-1 leading-snug">
              Severe 96.5% vs 3.5% credit default skew with unweighted LogisticRegression (zero recall on minority class).
            </p>
          </div>

          {/* Planted 3: Remediated */}
          <div 
            onClick={() => handleSelectPlanted('remediated')}
            className={`p-space-md rounded-lg bg-surface-container-low border cursor-pointer transition-all hover:-translate-y-0.5 ${
              fileName === 'clean_pipeline.py'
                ? 'border-secondary/60 bg-surface-container ring-1 ring-secondary/40'
                : 'border-surface-variant/30 hover:border-secondary/40'
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="font-code-sm text-code-sm text-secondary font-bold font-mono">
                Reference Pipeline
              </span>
              <span className="text-[10px] font-mono uppercase px-1.5 py-0.2 rounded bg-secondary-container/20 text-secondary">
                Verified
              </span>
            </div>
            <div className="font-body-sm text-body-sm text-on-surface font-medium">
              clean_pipeline.py
            </div>
            <p className="font-body-sm text-[12px] text-outline mt-1 leading-snug">
              Sanitized zero-contamination pipeline: scaler fitted on train only, balanced class weights configured.
            </p>
          </div>
        </div>
      </div>

      {/* Main Tabs Container */}
      <div className="bg-surface-container-low rounded-xl border border-surface-variant/30 overflow-hidden shadow-lg flex flex-col">
        {/* Tab Switcher */}
        <div className="px-space-lg pt-space-md pb-space-sm bg-surface-container-low border-b border-surface-variant/20 flex items-center justify-between flex-wrap gap-2">
          <div className="p-1 rounded-lg bg-surface-container-lowest flex items-center space-x-1 border border-surface-variant/30">
            <button
              type="button"
              onClick={() => setActiveTab('paste')}
              className={`px-space-md py-1.5 rounded font-label-md text-label-md tracking-wide transition-all flex items-center space-x-2 ${
                activeTab === 'paste'
                  ? 'bg-surface-container-high text-primary shadow-sm font-semibold'
                  : 'text-outline hover:text-on-surface'
              }`}
            >
              <span className="material-symbols-outlined text-[15px]">code_blocks</span>
              <span>Paste Code</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('upload')}
              className={`px-space-md py-1.5 rounded font-label-md text-label-md tracking-wide transition-all flex items-center space-x-2 ${
                activeTab === 'upload'
                  ? 'bg-surface-container-high text-primary shadow-sm font-semibold'
                  : 'text-outline hover:text-on-surface'
              }`}
            >
              <span className="material-symbols-outlined text-[15px]">upload_file</span>
              <span>Upload (.py / .ipynb)</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('github')}
              className={`px-space-md py-1.5 rounded font-label-md text-label-md tracking-wide transition-all flex items-center space-x-2 ${
                activeTab === 'github'
                  ? 'bg-surface-container-high text-primary shadow-sm font-semibold'
                  : 'text-outline hover:text-on-surface'
              }`}
            >
              <span className="material-symbols-outlined text-[15px]">deployed_code</span>
              <span>GitHub Repo</span>
            </button>
          </div>

          <div className="flex items-center gap-space-sm">
            <span className="font-label-xs text-label-xs text-outline font-mono uppercase">Target:</span>
            <span className="font-code-sm text-code-sm text-primary font-mono bg-surface-container px-2 py-0.5 rounded border border-outline-variant/30">
              {fileName}
            </span>
          </div>
        </div>

        {/* Tab 1: Paste */}
        {activeTab === 'paste' && (
          <div className="p-space-lg flex flex-col gap-space-md">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-space-sm">
                <span className="font-label-xs text-label-xs uppercase text-outline font-mono">Runtime Engine:</span>
                <select
                  value={runtime}
                  onChange={(e) => setRuntime(e.target.value)}
                  className="font-code-sm text-code-sm bg-surface-container-lowest text-on-surface px-space-sm py-1 rounded focus:outline-none border border-outline-variant/30 font-mono"
                >
                  <option>Python 3.11 (PyTorch 2.3, Scikit-Learn 1.4, Pandas)</option>
                  <option>Python 3.10 (TensorFlow 2.16, Keras 3.0)</option>
                  <option>Python 3.11 (XGBoost, LightGBM, CatBoost)</option>
                </select>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setCode('')}
                  className="font-label-xs text-label-xs uppercase hover:text-error transition-colors flex items-center gap-1 px-2 py-1 rounded hover:bg-surface-container font-mono text-outline"
                >
                  <span className="material-symbols-outlined text-[14px]">delete</span>
                  <span>Clear</span>
                </button>
              </div>
            </div>

            {/* Code Input */}
            <div className="bg-surface-container-lowest rounded-lg border border-surface-variant/30 overflow-hidden flex font-mono text-code-sm">
              <div className="bg-surface-container-low select-none py-space-sm px-space-xs text-right text-outline flex flex-col space-y-0 w-10 shrink-0 leading-5 text-[11px] border-r border-surface-variant/30">
                {code.split('\n').map((_, i) => (
                  <span key={i}>{i + 1}</span>
                ))}
              </div>
              <textarea
                value={code}
                onChange={(e) => setCode(e.target.value)}
                rows={16}
                className="w-full bg-transparent text-on-surface p-space-sm focus:outline-none resize-y font-mono text-code-sm leading-5 selection:bg-primary/20"
                placeholder="# Paste Python ML script or notebook code here..."
                spellCheck="false"
              />
            </div>
          </div>
        )}

        {/* Tab 2: Upload */}
        {activeTab === 'upload' && (
          <div className="p-space-lg flex flex-col gap-space-md">
            <label className="p-space-xl rounded-xl bg-surface-container flex flex-col items-center justify-center text-center group cursor-pointer hover:bg-surface-container-high transition-colors border-2 border-dashed border-outline-variant/40">
              <input
                type="file"
                accept=".py,.ipynb"
                className="hidden"
                onChange={handleFileUpload}
              />
              <div className="w-14 h-14 rounded-full bg-surface-container-lowest flex items-center justify-center text-primary mb-space-sm group-hover:scale-105 transition-transform shadow-inner">
                <span className="material-symbols-outlined text-[32px]">cloud_upload</span>
              </div>
              <h3 className="font-headline-sm text-headline-sm text-on-surface">
                Drop Python script or Jupyter Notebook
              </h3>
              <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">
                Supports <span className="font-mono text-primary">.py</span> and <span className="font-mono text-primary">.ipynb</span> files up to 2MB (sandbox limit)
              </p>
              <div className="mt-space-md">
                <span className="px-space-md py-1.5 rounded bg-surface-container-lowest text-on-surface font-label-md text-label-md hover:bg-surface-bright transition-colors border border-outline-variant/30">
                  Browse Local Files
                </span>
              </div>
            </label>

            {uploadedFile && (
              <div className="bg-surface-container p-space-md rounded-lg flex items-center justify-between border border-secondary/30">
                <div className="flex items-center space-x-space-md">
                  <span className="material-symbols-outlined text-secondary text-[24px]">description</span>
                  <div>
                    <span className="font-code-md text-code-md text-on-surface font-mono font-semibold block">
                      {uploadedFile.name}
                    </span>
                    <span className="font-label-xs text-label-xs text-outline font-mono">
                      {uploadedFile.size} • {uploadedFile.type}
                    </span>
                  </div>
                </div>
                <span className="font-label-xs text-label-xs text-secondary bg-secondary/10 px-2 py-0.5 rounded font-mono font-bold">
                  PARSED & READY
                </span>
              </div>
            )}
          </div>
        )}

        {/* Tab 3: GitHub Repo */}
        {activeTab === 'github' && (
          <div className="p-space-lg flex flex-col gap-space-md">
            <div className="flex flex-col space-y-space-xs">
              <label className="font-label-md text-label-md text-on-surface flex items-center space-x-1">
                <span>GitHub Repository URL</span>
                <span className="text-primary">*</span>
              </label>
              <div className="flex rounded-lg overflow-hidden bg-surface-container-lowest border border-outline-variant/40">
                <span className="px-space-md py-1.5 font-code-sm text-code-sm text-outline flex items-center bg-surface-container border-r border-outline-variant/30 font-mono">
                  https://github.com/
                </span>
                <input
                  type="text"
                  value={repoUrl}
                  onChange={(e) => setRepoUrl(e.target.value)}
                  className="w-full bg-transparent px-space-sm py-1.5 font-code-sm text-code-sm text-on-surface focus:outline-none font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-space-md">
              <div className="flex flex-col space-y-space-xs">
                <label className="font-label-md text-label-md text-on-surface font-mono text-xs">Branch / Commit</label>
                <select
                  value={branch}
                  onChange={(e) => setBranch(e.target.value)}
                  className="w-full font-code-sm text-code-sm bg-surface-container-lowest text-on-surface px-space-md py-1.5 rounded focus:outline-none border border-outline-variant/40 font-mono"
                >
                  <option>main (commit 8f31b2c)</option>
                  <option>staging-v2.1</option>
                  <option>feat/resampling-smote</option>
                </select>
              </div>

              <div className="flex flex-col space-y-space-xs">
                <label className="font-label-md text-label-md text-on-surface font-mono text-xs">Target File Selection (GitHub REST API)</label>
                <select
                  value={selectedRepoFile}
                  onChange={(e) => {
                    setSelectedRepoFile(e.target.value);
                    setFileName(e.target.value.split('/').pop());
                  }}
                  className="w-full font-code-sm text-code-sm bg-surface-container-lowest text-primary px-space-md py-1.5 rounded focus:outline-none border border-outline-variant/40 font-mono"
                >
                  <option value="models/churn_prediction.ipynb">models/churn_prediction.ipynb (Target Notebook)</option>
                  <option value="pipelines/credit_default.py">pipelines/credit_default.py (Target Script)</option>
                  <option value="evaluation/metrics.py">evaluation/metrics.py</option>
                </select>
              </div>
            </div>

            <div className="flex items-center space-x-space-sm text-outline bg-surface-container p-space-sm rounded border border-surface-variant/30">
              <span className="material-symbols-outlined text-[16px] text-secondary">verified_user</span>
              <span className="font-body-sm text-body-sm">
                GitHub REST API parsed. Target file content ready for normalized ingestion.
              </span>
            </div>
          </div>
        )}

        {/* Audit Inspection Presets */}
        <div className="px-space-lg py-space-sm bg-surface-container-low border-t border-surface-variant/20 flex flex-col gap-2">
          <span className="font-label-xs text-label-xs uppercase tracking-wider text-outline font-mono">
            Active Trace & Diagnostics Assertions:
          </span>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <label className="flex items-center gap-2 p-2 rounded bg-surface-container cursor-pointer hover:bg-surface-container-high transition-colors border border-outline-variant/20">
              <input
                type="checkbox"
                checked={presets.dataLeakage}
                onChange={(e) => setPresets(p => ({ ...p, dataLeakage: e.target.checked }))}
                className="w-3.5 h-3.5 rounded bg-surface-container-lowest text-primary accent-primary"
              />
              <span className="font-label-md text-label-md text-on-surface">Data Leakage</span>
            </label>

            <label className="flex items-center gap-2 p-2 rounded bg-surface-container cursor-pointer hover:bg-surface-container-high transition-colors border border-outline-variant/20">
              <input
                type="checkbox"
                checked={presets.targetImbalance}
                onChange={(e) => setPresets(p => ({ ...p, targetImbalance: e.target.checked }))}
                className="w-3.5 h-3.5 rounded bg-surface-container-lowest text-primary accent-primary"
              />
              <span className="font-label-md text-label-md text-on-surface">Target Imbalance</span>
            </label>

            <label className="flex items-center gap-2 p-2 rounded bg-surface-container cursor-pointer hover:bg-surface-container-high transition-colors border border-outline-variant/20">
              <input
                type="checkbox"
                checked={presets.tensorShapes}
                onChange={(e) => setPresets(p => ({ ...p, tensorShapes: e.target.checked }))}
                className="w-3.5 h-3.5 rounded bg-surface-container-lowest text-primary accent-primary"
              />
              <span className="font-label-md text-label-md text-on-surface">Tensor Shapes</span>
            </label>

            <label className="flex items-center gap-2 p-2 rounded bg-surface-container cursor-pointer hover:bg-surface-container-high transition-colors border border-outline-variant/20">
              <input
                type="checkbox"
                checked={presets.seedGovernance}
                onChange={(e) => setPresets(p => ({ ...p, seedGovernance: e.target.checked }))}
                className="w-3.5 h-3.5 rounded bg-surface-container-lowest text-primary accent-primary"
              />
              <span className="font-label-md text-label-md text-on-surface">Seed Governance</span>
            </label>
          </div>
        </div>

        {/* Error message if any */}
        {errorMsg && (
          <div className="px-space-lg py-2 bg-error-container/20 text-error font-body-sm border-t border-error/30 flex items-center gap-2 font-mono">
            <span className="material-symbols-outlined text-[16px]">error</span>
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Footer Actions */}
        <div className="p-space-lg bg-surface-container flex flex-col sm:flex-row items-center justify-between gap-space-md border-t border-surface-variant/30">
          <div className="flex items-center gap-2 text-outline text-label-xs font-mono">
            <div className="w-2 h-2 rounded-full bg-secondary animate-pulse" />
            <span>Phase 2 Sandbox Tracer Hooked • Hard timeout cap: 15s</span>
          </div>

          <button
            type="button"
            disabled={isExecuting}
            onClick={handleSubmit}
            className="group px-space-xl py-2.5 rounded bg-primary-container hover:brightness-110 active:brightness-95 text-on-primary-container font-headline-sm text-headline-sm transition-all flex items-center gap-space-sm shadow-lg w-full sm:w-auto justify-center"
          >
            <span>{isExecuting ? 'Executing in Sandbox...' : 'Run Sandboxed Trace & Audit'}</span>
            <span className={`material-symbols-outlined text-[20px] ${isExecuting ? 'animate-spin' : 'group-hover:translate-x-1 transition-transform'}`}>
              {isExecuting ? 'progress_activity' : 'arrow_forward'}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
