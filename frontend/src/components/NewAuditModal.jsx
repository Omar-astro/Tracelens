import React, { useState } from 'react';
import { SAMPLE_CODE_DEFAULT } from '../data/pipelineData';

export default function NewAuditModal({
  isOpen,
  onClose,
  onRunAudit
}) {
  const [activeTab, setActiveTab] = useState('paste'); // 'paste' | 'upload' | 'github'
  const [pastedCode, setPastedCode] = useState(SAMPLE_CODE_DEFAULT);
  const [runtime, setRuntime] = useState('Python 3.11 (PyTorch 2.3, Scikit-Learn 1.4, Pandas)');
  const [repoUrl, setRepoUrl] = useState('org-tensorflow-guard/risk-scoring-pipeline');
  const [branch, setBranch] = useState('main (commit 8f31b2c)');
  const [entrypoint, setEntrypoint] = useState('models/train_classifier.py');
  const [uploadedFile, setUploadedFile] = useState({
    name: 'churn_pipeline_validation.ipynb',
    size: '1.84 MB',
    cells: 24,
    type: 'Scikit-Learn pipeline'
  });
  const [presets, setPresets] = useState({
    dataLeakage: true,
    targetImbalance: true,
    tensorShapes: true,
    seedGovernance: true
  });
  const [isRunning, setIsRunning] = useState(false);

  if (!isOpen) return null;

  const handleClear = () => {
    setPastedCode('');
  };

  const handleLoadSample = () => {
    setPastedCode(SAMPLE_CODE_DEFAULT);
  };

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      setUploadedFile({
        name: file.name,
        size: `${(file.size / (1024 * 1024)).toFixed(2)} MB`,
        cells: 18,
        type: file.name.endsWith('.ipynb') ? 'Jupyter Notebook' : 'Python Script'
      });
    }
  };

  const handleSubmit = () => {
    setIsRunning(true);
    setTimeout(() => {
      setIsRunning(false);
      onRunAudit({
        tab: activeTab,
        code: activeTab === 'paste' ? pastedCode : SAMPLE_CODE_DEFAULT,
        fileName: activeTab === 'upload' ? uploadedFile.name : activeTab === 'github' ? entrypoint.split('/').pop() : 'train.ipynb',
        runtime
      });
      onClose();
    }, 900);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-surface-container-lowest/85 backdrop-blur-md transition-opacity" 
        onClick={onClose}
      />

      {/* Modal Dialog Container */}
      <div className="relative z-10 w-full max-w-4xl bg-surface-container-low rounded-xl shadow-2xl overflow-hidden flex flex-col text-on-surface border border-surface-variant/40 animate-in fade-in zoom-in-95">
        {/* Modal Header */}
        <div className="px-space-xl pt-space-xl pb-space-lg bg-surface-container-low flex items-start justify-between border-b border-surface-variant/20">
          <div className="flex items-start space-x-space-md">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary-container shrink-0 mt-0.5">
              <span className="material-symbols-outlined text-[24px]">troubleshoot</span>
            </div>
            <div className="flex flex-col">
              <div className="flex items-center space-x-space-sm">
                <h2 className="font-headline-lg text-headline-lg tracking-tight text-on-surface">
                  New Sandboxed Trace & Audit
                </h2>
                <span className="font-label-xs text-label-xs bg-secondary-fixed/10 text-secondary-fixed px-2 py-0.5 rounded font-mono uppercase tracking-wider">
                  v2.4 Kernel
                </span>
              </div>
              <p className="font-body-md text-body-md text-on-surface-variant mt-1">
                Audit ML notebooks & scripts for data leakage, class imbalance, and stochastic errors.
              </p>
            </div>
          </div>

          {/* ESC Button */}
          <button 
            type="button"
            onClick={onClose}
            className="group flex items-center space-x-1.5 px-2 py-1 rounded bg-surface-container hover:bg-surface-container-high transition-colors text-outline hover:text-on-surface border border-outline-variant/30"
          >
            <span className="font-label-xs text-label-xs tracking-wider uppercase font-mono">ESC</span>
            <span className="material-symbols-outlined text-[16px]">close</span>
          </button>
        </div>

        {/* Segmented Switcher Controls */}
        <div className="px-space-xl pt-space-xs pb-space-md bg-surface-container-low">
          <div className="p-1 rounded-lg bg-surface-container-lowest flex items-center space-x-1 w-fit border border-surface-variant/30">
            <button
              type="button"
              onClick={() => setActiveTab('paste')}
              className={`px-space-lg py-1.5 rounded font-label-md text-label-md tracking-wide transition-all flex items-center space-x-2 ${
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
              className={`px-space-lg py-1.5 rounded font-label-md text-label-md tracking-wide transition-all flex items-center space-x-2 ${
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
              className={`px-space-lg py-1.5 rounded font-label-md text-label-md tracking-wide transition-all flex items-center space-x-2 ${
                activeTab === 'github'
                  ? 'bg-surface-container-high text-primary shadow-sm font-semibold'
                  : 'text-outline hover:text-on-surface'
              }`}
            >
              <span className="material-symbols-outlined text-[15px]">deployed_code</span>
              <span>GitHub Repo</span>
            </button>
          </div>
        </div>

        {/* Modal Body Tab Panes */}
        <div className="px-space-xl py-space-md bg-surface-container-low flex flex-col space-y-space-lg max-h-[500px] overflow-y-auto">
          {/* TAB 1: PASTE CODE */}
          {activeTab === 'paste' && (
            <div className="flex flex-col space-y-space-md">
              {/* Sub-toolbar */}
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center space-x-space-sm">
                  <label className="font-label-xs text-label-xs uppercase text-outline tracking-wider font-mono">
                    Engine Runtime:
                  </label>
                  <div className="relative inline-block">
                    <select
                      value={runtime}
                      onChange={(e) => setRuntime(e.target.value)}
                      className="appearance-none font-code-sm text-code-sm bg-surface-container-lowest text-on-surface pl-space-sm pr-8 py-1 rounded cursor-pointer focus:outline-none focus:text-primary border border-outline-variant/40"
                    >
                      <option>Python 3.11 (PyTorch 2.3, Scikit-Learn 1.4, Pandas)</option>
                      <option>Python 3.10 (TensorFlow 2.16, Keras 3.0)</option>
                      <option>Python 3.11 (XGBoost, LightGBM, CatBoost)</option>
                      <option>JAX 0.4.26 (Flax, Optax)</option>
                    </select>
                    <span className="material-symbols-outlined absolute right-1.5 top-1.5 pointer-events-none text-[14px] text-outline">
                      expand_more
                    </span>
                  </div>
                </div>

                <div className="flex items-center space-x-space-xs text-outline">
                  <button
                    type="button"
                    onClick={handleLoadSample}
                    className="font-label-xs text-label-xs tracking-wider uppercase hover:text-primary transition-colors flex items-center space-x-1 px-2 py-0.5 rounded hover:bg-surface-container font-mono"
                  >
                    <span className="material-symbols-outlined text-[14px]">history</span>
                    <span>Load Synthetic Pipeline</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleClear}
                    className="font-label-xs text-label-xs tracking-wider uppercase hover:text-error transition-colors flex items-center space-x-1 px-2 py-0.5 rounded hover:bg-surface-container font-mono"
                  >
                    <span className="material-symbols-outlined text-[14px]">delete_sweep</span>
                    <span>Clear</span>
                  </button>
                </div>
              </div>

              {/* Code Editor Surface */}
              <div className="bg-surface-container-lowest rounded-lg flex overflow-hidden group shadow-inner border border-surface-variant/30">
                {/* Line Numbers Gutter */}
                <div className="bg-surface-container-lowest select-none py-space-sm px-space-xs text-right font-code-sm text-code-sm text-outline-variant flex flex-col space-y-0 w-9 shrink-0 leading-5 font-mono">
                  {pastedCode.split('\n').slice(0, 16).map((_, i) => (
                    <span key={i}>{i + 1}</span>
                  ))}
                </div>

                {/* Code Input Container */}
                <div className="flex-1 relative">
                  <textarea
                    value={pastedCode}
                    onChange={(e) => setPastedCode(e.target.value)}
                    rows={12}
                    className="w-full bg-transparent text-on-surface font-code-sm text-code-sm leading-5 p-space-sm focus:outline-none resize-none font-mono selection:bg-primary/20"
                    placeholder="# Paste model pipeline script here..."
                    spellCheck="false"
                  />
                </div>
              </div>

              {/* Preset Audit Toggles */}
              <div className="flex flex-col space-y-space-xs pt-1">
                <span className="font-label-xs text-label-xs uppercase tracking-widest text-outline font-mono">
                  Audit Inspection Presets
                </span>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-space-xs">
                  <label className="flex items-center space-x-space-sm p-2 rounded-lg bg-surface-container cursor-pointer hover:bg-surface-container-high transition-colors border border-outline-variant/20">
                    <input
                      type="checkbox"
                      checked={presets.dataLeakage}
                      onChange={(e) => setPresets(p => ({ ...p, dataLeakage: e.target.checked }))}
                      className="w-3.5 h-3.5 rounded bg-surface-container-lowest text-primary accent-primary cursor-pointer"
                    />
                    <div className="flex flex-col">
                      <span className="font-label-md text-label-md text-on-surface leading-tight">Data Leakage</span>
                      <span className="font-label-xs text-label-xs text-outline leading-tight mt-0.5">Pre-split fit & contamination</span>
                    </div>
                  </label>

                  <label className="flex items-center space-x-space-sm p-2 rounded-lg bg-surface-container cursor-pointer hover:bg-surface-container-high transition-colors border border-outline-variant/20">
                    <input
                      type="checkbox"
                      checked={presets.targetImbalance}
                      onChange={(e) => setPresets(p => ({ ...p, targetImbalance: e.target.checked }))}
                      className="w-3.5 h-3.5 rounded bg-surface-container-lowest text-primary accent-primary cursor-pointer"
                    />
                    <div className="flex flex-col">
                      <span className="font-label-md text-label-md text-on-surface leading-tight">Target Imbalance</span>
                      <span className="font-label-xs text-label-xs text-outline leading-tight mt-0.5">Skew & metric mismatch</span>
                    </div>
                  </label>

                  <label className="flex items-center space-x-space-sm p-2 rounded-lg bg-surface-container cursor-pointer hover:bg-surface-container-high transition-colors border border-outline-variant/20">
                    <input
                      type="checkbox"
                      checked={presets.tensorShapes}
                      onChange={(e) => setPresets(p => ({ ...p, tensorShapes: e.target.checked }))}
                      className="w-3.5 h-3.5 rounded bg-surface-container-lowest text-primary accent-primary cursor-pointer"
                    />
                    <div className="flex flex-col">
                      <span className="font-label-md text-label-md text-on-surface leading-tight">Tensor Shapes</span>
                      <span className="font-label-xs text-label-xs text-outline leading-tight mt-0.5">Dynamic dimension drift</span>
                    </div>
                  </label>

                  <label className="flex items-center space-x-space-sm p-2 rounded-lg bg-surface-container cursor-pointer hover:bg-surface-container-high transition-colors border border-outline-variant/20">
                    <input
                      type="checkbox"
                      checked={presets.seedGovernance}
                      onChange={(e) => setPresets(p => ({ ...p, seedGovernance: e.target.checked }))}
                      className="w-3.5 h-3.5 rounded bg-surface-container-lowest text-primary accent-primary cursor-pointer"
                    />
                    <div className="flex flex-col">
                      <span className="font-label-md text-label-md text-on-surface leading-tight">Seed Governance</span>
                      <span className="font-label-xs text-label-xs text-outline leading-tight mt-0.5">Unpinned pseudorandom state</span>
                    </div>
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: UPLOAD */}
          {activeTab === 'upload' && (
            <div className="flex flex-col space-y-space-md">
              <label className="p-space-xl rounded-xl bg-surface-container flex flex-col items-center justify-center text-center group cursor-pointer hover:bg-surface-container-high transition-colors border-2 border-dashed border-outline-variant/40">
                <input 
                  type="file" 
                  accept=".py,.ipynb" 
                  className="hidden" 
                  onChange={handleFileUpload} 
                />
                <div className="w-12 h-12 rounded-full bg-surface-container-lowest flex items-center justify-center text-primary mb-space-sm group-hover:scale-105 transition-transform shadow-inner">
                  <span className="material-symbols-outlined text-[28px]">cloud_upload</span>
                </div>
                <h4 className="font-headline-sm text-headline-sm text-on-surface">
                  Drag & drop Python script or Jupyter Notebook
                </h4>
                <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">
                  Supports standard execution paths: <span className="font-code-sm text-code-sm text-primary font-mono">.py</span>, <span className="font-code-sm text-code-sm text-primary font-mono">.ipynb</span> (up to 25MB)
                </p>
                <div className="mt-space-md flex items-center space-x-space-xs">
                  <span className="px-space-md py-1.5 rounded bg-surface-container-lowest text-on-surface font-label-md text-label-md hover:bg-surface-bright transition-colors border border-outline-variant/30">
                    Browse Files
                  </span>
                </div>
              </label>

              {/* Staged File Card */}
              <div className="bg-surface-container p-space-md rounded-lg flex items-center justify-between border border-secondary/30">
                <div className="flex items-center space-x-space-md">
                  <span className="material-symbols-outlined text-secondary text-[24px]">description</span>
                  <div className="flex flex-col">
                    <span className="font-code-md text-code-md text-on-surface font-mono font-semibold">
                      {uploadedFile.name}
                    </span>
                    <span className="font-label-xs text-label-xs text-outline font-mono">
                      {uploadedFile.size} • {uploadedFile.cells} code cells • {uploadedFile.type}
                    </span>
                  </div>
                </div>

                <div className="flex items-center space-x-space-sm">
                  <span className="font-label-xs text-label-xs text-secondary bg-secondary/10 px-2 py-0.5 rounded font-mono font-bold">
                    READY
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: GITHUB REPO */}
          {activeTab === 'github' && (
            <div className="bg-surface-container p-space-lg rounded-xl flex flex-col space-y-space-md border border-surface-variant/30">
              <div className="flex flex-col space-y-space-xs">
                <label className="font-label-md text-label-md text-on-surface flex items-center space-x-1">
                  <span>Repository URL</span>
                  <span className="text-primary">*</span>
                </label>
                <div className="flex rounded-lg overflow-hidden bg-surface-container-lowest border border-outline-variant/40">
                  <span className="px-space-md py-1.5 font-code-sm text-code-sm text-outline flex items-center bg-surface-container border-r border-outline-variant/30">
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
                  <label className="font-label-md text-label-md text-on-surface">Branch / Commit SHA</label>
                  <div className="relative">
                    <select
                      value={branch}
                      onChange={(e) => setBranch(e.target.value)}
                      className="w-full appearance-none font-code-sm text-code-sm bg-surface-container-lowest text-on-surface px-space-md py-1.5 rounded focus:outline-none border border-outline-variant/40 font-mono"
                    >
                      <option>main (commit 8f31b2c)</option>
                      <option>staging-v2.1</option>
                      <option>feat/resampling-smote</option>
                    </select>
                    <span className="material-symbols-outlined absolute right-2.5 top-2 pointer-events-none text-[16px] text-outline">
                      expand_more
                    </span>
                  </div>
                </div>

                <div className="flex flex-col space-y-space-xs">
                  <label className="font-label-md text-label-md text-on-surface">Entrypoint File</label>
                  <input
                    type="text"
                    value={entrypoint}
                    onChange={(e) => setEntrypoint(e.target.value)}
                    className="w-full bg-surface-container-lowest px-space-md py-1.5 rounded font-code-sm text-code-sm text-on-surface focus:outline-none border border-outline-variant/40 font-mono"
                  />
                </div>
              </div>

              {/* Permission Badge */}
              <div className="flex items-center space-x-space-sm text-outline bg-surface-container-lowest/50 p-space-sm rounded border border-surface-variant/20">
                <span className="material-symbols-outlined text-[16px] text-secondary">verified_user</span>
                <span className="font-body-sm text-body-sm">
                  GitHub App authenticated with read-only tree permissions.
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-space-xl py-space-lg bg-surface-container-low flex flex-col sm:flex-row items-center justify-between gap-space-md border-t border-surface-variant/20">
          {/* Latency Telemetry Note */}
          <div className="flex items-center space-x-2 text-outline">
            <div className="w-2 h-2 rounded-full bg-secondary animate-pulse" />
            <span className="material-symbols-outlined text-[16px] text-secondary">bolt</span>
            <span className="font-label-xs text-label-xs text-on-surface-variant font-mono">
              Isolated Firecracker microVM execution (&lt; 15s avg)
            </span>
          </div>

          {/* Action CTAs */}
          <div className="flex items-center space-x-space-sm w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-space-lg py-2 rounded bg-surface-container text-on-surface font-label-md text-label-md hover:bg-surface-container-high transition-colors border border-outline-variant/30"
            >
              Cancel
            </button>

            <button
              type="button"
              disabled={isRunning}
              onClick={handleSubmit}
              className="group px-space-xl py-2 rounded bg-primary-container text-on-primary-container font-headline-sm text-headline-sm hover:brightness-110 active:brightness-95 transition-all flex items-center space-x-space-sm shadow-md"
            >
              <span>{isRunning ? 'Tracing Sandbox...' : 'Run Sandboxed Trace & Audit'}</span>
              <span className={`material-symbols-outlined text-[18px] ${isRunning ? 'animate-spin' : 'group-hover:translate-x-0.5 transition-transform'}`}>
                {isRunning ? 'progress_activity' : 'arrow_forward'}
              </span>
              <span className="ml-1 px-1.5 py-0.5 rounded bg-on-primary-container/20 font-label-xs text-label-xs font-mono opacity-80">
                ⌘↵
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
