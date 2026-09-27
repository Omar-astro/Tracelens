import React, { useState, useRef, useEffect } from 'react';
import { postTrace, TraceApiError, uploadDataset, getDatasets, deleteDataset } from '../api/traceClient';

// Appendix C.1 — teammate_pipeline.py (Mode 1 primary demo sample)
const TEAMMATE_PIPELINE_SAMPLE = `# teammate_pipeline.py — Inherited from "Alex" (Teammate)
raw_logs = [
    {"user": " alice ", "action": "login", "status": 200},
    {"user": "bob", "action": "upload", "status": 500},
    {"user": "", "action": "ping", "status": 200},
    {"user": "charlie", "action": "logout", "status": 200}
]

cleaned_records = []
error_count = 0

# Teammate loop: sanitize user records and count 500 errors
for record in raw_logs:
    name = record["user"].strip().capitalize()
    if len(name) > 0:
        if record["status"] >= 400:
            error_count += 1
        cleaned_records.append({
            "user": name,
            "action": record["action"],
            "success": record["status"] < 400
        })

# [SAFE INSERTION POINT: here]
summary = {
    "total_valid": len(cleaned_records),
    "total_errors": error_count
}
print("Summary:", summary)
`;

// Appendix C.2 — dsai_leakage_sample.py (Mode 2 secondary demo sample).
// NOTE: no leading or trailing blank line. The backend strips the source before
// ast.parse (see trace.py) while CodeViewer renders it verbatim, so any leading
// blank line would shift every reported line_number by one.
const DSAI_LEAKAGE_SAMPLE = `# dsai_leakage_sample.py — Inherited from "Jordan" (Data Scientist)
import numpy as np
from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import train_test_split

X = np.random.randn(100, 4)
y = np.array([0] * 90 + [1] * 10)

# BUG: Data Leakage — Fitting scaler across entire dataset before splitting!
scaler = StandardScaler()
X_scaled = scaler.fit_transform(X)

X_train, X_test, y_train, y_test = train_test_split(X_scaled, y, test_size=0.2)

print("Dataset ready. Train size:", len(X_train))`;

export default function CodeInputPane({ mode = 'logic_lens', onTraceComplete, onRequestMode, initialCode = '' }) {
  // Tabs: 'editor', 'dropzone', 'sample', 'dataset'
  const [activeTab, setActiveTab] = useState('editor');
  const [code, setCode] = useState(initialCode || '');
  const [sourceType, setSourceType] = useState('editor'); // 'editor' | 'file' | 'sample'
  const [loadedFileName, setLoadedFileName] = useState('');
  const [isDragOver, setIsDragOver] = useState(false);

  useEffect(() => {
    if (initialCode) {
      setCode(initialCode);
    }
  }, [initialCode]);


  // Stage 6: real network state
  const [isLoading, setIsLoading] = useState(false);
  const [traceError, setTraceError] = useState(null);    // string | null
  const [traceSteps, setTraceSteps] = useState(null);    // TraceStep[] | null

  // Dataset upload state (100MB limit, 20m retention)
  const [uploadedDatasets, setUploadedDatasets] = useState([]);
  const [isUploadingDataset, setIsUploadingDataset] = useState(false);
  const [datasetError, setDatasetError] = useState(null);
  const [datasetSuccess, setDatasetSuccess] = useState(null);

  const fetchDatasets = async () => {
    try {
      const res = await getDatasets();
      if (Array.isArray(res?.datasets)) {
        setUploadedDatasets(res.datasets);
      }
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    fetchDatasets();
    const interval = setInterval(fetchDatasets, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleDatasetUpload = async (file) => {
    if (!file) return;
    setDatasetError(null);
    setDatasetSuccess(null);
    setIsUploadingDataset(true);

    try {
      const res = await uploadDataset(file);
      setDatasetSuccess(res.message || `Uploaded ${file.name} successfully.`);
      await fetchDatasets();
    } catch (err) {
      setDatasetError(err.message || 'Failed to upload dataset.');
    } finally {
      setIsUploadingDataset(false);
    }
  };

  const handleDeleteDataset = async (filename) => {
    await deleteDataset(filename);
    await fetchDatasets();
  };

  const textareaRef = useRef(null);
  const lineNumbersRef = useRef(null);

  // Sync scroll between textarea and line number gutter
  const handleScroll = () => {
    if (textareaRef.current && lineNumbersRef.current) {
      lineNumbersRef.current.scrollTop = textareaRef.current.scrollTop;
    }
  };

  // Populate code with Appendix C sample
  const handleLoadSample = () => {
    setCode(TEAMMATE_PIPELINE_SAMPLE);
    setSourceType('sample');
    setLoadedFileName('Sample Script');
    setActiveTab('editor');
  };

  // Stage 14: Appendix C.2 ModelLens sample — switch the caller to ModelLens mode too
  const handleLoadLeakageSample = () => {
    setCode(DSAI_LEAKAGE_SAMPLE);
    setSourceType('sample');
    setLoadedFileName('Sample Script');
    setActiveTab('editor');
    if (onRequestMode) onRequestMode('model_lens');
  };

  // Process file upload (.py or .ipynb)
  const handleFile = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result;
      if (typeof text !== 'string') return;

      if (file.name.endsWith('.ipynb')) {
        try {
          const parsed = JSON.parse(text);
          const codeCells = parsed.cells
            ?.filter((cell) => cell.cell_type === 'code')
            ?.map((cell) => (Array.isArray(cell.source) ? cell.source.join('') : cell.source))
            ?.join('\n\n# --- In [Cell] ---\n');
          setCode(codeCells || text);
        } catch {
          setCode(text);
        }
      } else {
        setCode(text);
      }
      setSourceType('file');
      setLoadedFileName(file.name);
      setActiveTab('editor');
    };
    reader.readAsText(file);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer?.files?.[0];
    if (file) {
      handleFile(file);
    }
  };

  // Stage 6: Real network call to POST /api/trace
  const handleTraceClick = async () => {
    if (!code.trim()) return;

    setIsLoading(true);
    setTraceError(null);
    setTraceSteps(null);

    try {
      const response = await postTrace(code, mode);
      // Backend returns { steps, safe_insertion_points, ml_audit_issues? }
      const steps = response.steps ?? [];
      // Stage 10: safe insertion points from backend (Stage 9)
      const safePoints = response.safe_insertion_points ?? [];
      // Stage 14: ModelLens audit issues — only present in model_lens mode
      const mlIssues = response.ml_audit_issues ?? [];
      setTraceSteps(steps);

      let effectiveSourceName = 'Code Editor';
      if (sourceType === 'file' && loadedFileName) {
        effectiveSourceName = loadedFileName;
      } else if (sourceType === 'sample') {
        effectiveSourceName = 'Sample Script';
      } else if (activeTab === 'editor') {
        effectiveSourceName = 'Code Editor';
      } else if (activeTab === 'sample') {
        effectiveSourceName = 'Sample Script';
      }

      if (onTraceComplete) {
        onTraceComplete(steps, code, safePoints, mlIssues, effectiveSourceName);
      }
      console.log('Trace complete —', steps.length, 'steps,', safePoints.length, 'safe insertion points,', mlIssues.length, 'ML audit issues');
    } catch (err) {
      const message =
        err instanceof TraceApiError
          ? err.message
          : 'Unexpected error — check the console for details.';
      setTraceError(message);
      console.error('postTrace failed:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Compute line count for gutter
  const lines = code ? code.split('\n') : [''];
  const lineCount = Math.max(lines.length, 12);

  return (
    <div className="w-full max-w-4xl mx-auto bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-2xl backdrop-blur-sm">
      {/* Tab Navigation Header */}
      <div className="flex flex-wrap items-center justify-between border-b border-slate-800 pb-4 mb-4 gap-3">
        <div className="flex items-center space-x-2">
          {/* Code Editor */}
          <button
            type="button"
            onClick={() => setActiveTab('editor')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold tracking-wide transition-all ${
              activeTab === 'editor'
                ? 'bg-slate-800 text-cyan-400 border border-cyan-500/30 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            Code Editor
          </button>

          {/* Dropzone */}
          <button
            type="button"
            onClick={() => setActiveTab('dropzone')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold tracking-wide transition-all ${
              activeTab === 'dropzone'
                ? 'bg-slate-800 text-cyan-400 border border-cyan-500/30 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            Dropzone (.py / .ipynb)
          </button>

          {/* Sample Script */}
          <button
            type="button"
            onClick={() => setActiveTab('sample')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold tracking-wide transition-all ${
              activeTab === 'sample'
                ? 'bg-slate-800 text-cyan-400 border border-cyan-500/30 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            Sample Script
          </button>

          {/* Upload Dataset */}
          <button
            type="button"
            onClick={() => setActiveTab('dataset')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold tracking-wide transition-all flex items-center gap-1.5 ${
              activeTab === 'dataset'
                ? 'bg-slate-800 text-cyan-400 border border-cyan-500/30 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <span>Upload Dataset</span>
            {uploadedDatasets.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[9px] bg-emerald-500/20 text-emerald-300 font-mono font-bold">
                {uploadedDatasets.length}
              </span>
            )}
          </button>
        </div>

        {/* Quick action button for Sample Teammate Script */}
        <button
          type="button"
          onClick={handleLoadSample}
          className="text-xs font-mono px-3 py-1.5 rounded-lg bg-cyan-950/40 text-cyan-400 border border-cyan-700/40 hover:bg-cyan-900/50 hover:border-cyan-500 transition-colors inline-flex items-center gap-1.5 cursor-pointer"
        >
          <span>⚡</span>
          <span>Load Sample Teammate Script</span>
        </button>
      </div>

      {/* Tab A: Code Editor with Line Numbers & Placeholder */}
      {activeTab === 'editor' && (
        <div className="relative font-mono text-xs rounded-xl border border-slate-800 bg-slate-950 overflow-hidden flex">
          {/* Gutter with line numbers */}
          <div
            ref={lineNumbersRef}
            aria-hidden="true"
            className="w-12 py-3 bg-slate-900/60 border-r border-slate-800 text-slate-600 text-right pr-3 select-none overflow-hidden leading-6 font-mono"
          >
            {Array.from({ length: lineCount }, (_, i) => (
              <div key={i + 1}>{i + 1}</div>
            ))}
          </div>

          {/* Raw code textarea */}
          <textarea
            ref={textareaRef}
            value={code}
            onChange={(e) => {
              setCode(e.target.value);
              if (sourceType !== 'file') {
                setSourceType('editor');
                setLoadedFileName('');
              }
            }}
            onScroll={handleScroll}
            rows={14}
            spellCheck={false}
            placeholder={`# Paste teammate Python code here to trace runtime execution...\n# Example:\n# raw_logs = [{"user": "alice", "action": "login"}]\n# for record in raw_logs:\n#     print(record)`}
            className="flex-1 p-3 bg-transparent text-slate-100 placeholder-slate-600 outline-none resize-y leading-6 font-mono focus:ring-0"
          />
        </div>
      )}

      {/* Tab B: File Dropzone */}
      {activeTab === 'dropzone' && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragOver(true);
          }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={handleDrop}
          className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors ${
            isDragOver
              ? 'border-cyan-400 bg-cyan-950/20'
              : 'border-slate-800 bg-slate-950/60 hover:border-slate-700'
          }`}
        >
          <div className="max-w-md mx-auto flex flex-col items-center">
            <div className="w-12 h-12 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-cyan-400 text-lg mb-3">
              📄
            </div>
            <h3 className="text-sm font-semibold text-slate-200 mb-1">
              Drop Python script or Jupyter Notebook
            </h3>
            <p className="text-xs text-slate-400 mb-4">
              Accepts <span className="font-mono text-cyan-400">.py</span> or{' '}
              <span className="font-mono text-cyan-400">.ipynb</span> files
            </p>
            <label className="cursor-pointer px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 border border-slate-700 transition-colors">
              <span>Browse File</span>
              <input
                type="file"
                accept=".py,.ipynb"
                onChange={(e) => handleFile(e.target.files?.[0])}
                className="hidden"
              />
            </label>
          </div>
        </div>
      )}

      {/* Tab C: Sample Teammate Script Details & Loader */}
      {activeTab === 'sample' && (
        <div className="flex flex-col gap-4 text-left">
          {/* Appendix C.1 — Mode 1 primary demo */}
          <div className="p-5 rounded-xl border border-slate-800 bg-slate-950/60">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-200">
                  Appendix C.1: teammate_pipeline.py
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Inherited script from teammate Alex with loop sanitization, error counting, and safe hook point.
                </p>
              </div>
              <button
                type="button"
                onClick={handleLoadSample}
                className="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold transition-colors cursor-pointer"
              >
                Load Sample Teammate Script
              </button>
            </div>
            <pre className="p-3 bg-slate-900 border border-slate-800 rounded-lg text-[11px] font-mono text-slate-300 max-h-48 overflow-y-auto leading-5">
              {TEAMMATE_PIPELINE_SAMPLE}
            </pre>
          </div>

          {/* Appendix C.2 — Stage 14: Mode 2 secondary demo */}
          <div className="p-5 rounded-xl border border-rose-900/50 bg-rose-950/10">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                  Appendix C.2: dsai_leakage_sample.py
                  <span className="text-[9px] font-mono uppercase tracking-wider text-rose-300 bg-rose-500/15 border border-rose-500/30 px-1.5 py-0.5 rounded">
                    ModelLens
                  </span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Inherited from Jordan (Data Scientist). Deliberate data leakage — the scaler is fitted across the
                  full dataset before the split. Switches the mode selector to ModelLens.
                </p>
              </div>
              <button
                type="button"
                onClick={handleLoadLeakageSample}
                className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold transition-colors cursor-pointer shrink-0"
              >
                Load Leakage Sample
              </button>
            </div>
            <pre className="p-3 bg-slate-900 border border-slate-800 rounded-lg text-[11px] font-mono text-slate-300 max-h-48 overflow-y-auto leading-5">
              {DSAI_LEAKAGE_SAMPLE}
            </pre>
          </div>
        </div>
      )}

      {/* Tab D: Dataset Upload (.csv, .parquet, .json, etc.) */}
      {activeTab === 'dataset' && (
        <div className="flex flex-col gap-4 text-left">
          {/* Policy & Guidance Banner */}
          <div className="p-4 rounded-xl border border-cyan-500/20 bg-cyan-950/20 flex items-start gap-3">
            <span className="text-xl">📊</span>
            <div className="text-xs space-y-1">
              <h4 className="font-bold text-slate-200">Session Dataset Storage</h4>
              <p className="text-slate-400 leading-relaxed">
                Upload external dataset files (<code className="text-cyan-300 font-mono">.csv</code>, <code className="text-cyan-300 font-mono">.parquet</code>, <code className="text-cyan-300 font-mono">.json</code>, <code className="text-cyan-300 font-mono">.xlsx</code>). 
                Once uploaded, your Python script can access it directly by filename (e.g. <code className="text-cyan-300 font-mono">pd.read_csv('housing 2.csv')</code>).
              </p>
              <div className="flex flex-wrap items-center gap-3 pt-1 text-[11px] font-mono text-cyan-400/90">
                <span>⚡ Max file size: <strong>100 MB</strong></span>
                <span>⏱ Auto-deleted after: <strong>20 minutes</strong> (or when removed)</span>
              </div>
            </div>
          </div>

          {/* Upload Dropzone */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragOver(true);
            }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragOver(false);
              const f = e.dataTransfer?.files?.[0];
              if (f) handleDatasetUpload(f);
            }}
            className={`border-2 border-dashed rounded-xl p-6 text-center transition-colors ${
              isDragOver
                ? 'border-cyan-400 bg-cyan-950/20'
                : 'border-slate-800 bg-slate-950/60 hover:border-slate-700'
            }`}
          >
            <div className="max-w-md mx-auto flex flex-col items-center">
              <div className="w-10 h-10 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-cyan-400 text-lg mb-2">
                📁
              </div>
              <h3 className="text-xs font-semibold text-slate-200 mb-1">
                Select or Drop Dataset File (.csv, .parquet, .json, .xlsx)
              </h3>
              <p className="text-[11px] text-slate-400 mb-3">
                Max size: 100 MB · Retained for 20 minutes
              </p>
              <label
                className={`cursor-pointer px-4 py-2 rounded-lg text-xs font-semibold text-slate-200 border border-slate-700 transition-colors inline-flex items-center gap-1.5 ${
                  isUploadingDataset ? 'bg-slate-800 opacity-50 cursor-not-allowed' : 'bg-slate-800 hover:bg-slate-700'
                }`}
              >
                {isUploadingDataset ? (
                  <>
                    <span className="w-3 h-3 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
                    <span>Uploading Dataset…</span>
                  </>
                ) : (
                  <>
                    <span>Browse Dataset</span>
                    <input
                      type="file"
                      accept=".csv,.parquet,.json,.tsv,.txt,.xlsx,.feather,.h5"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handleDatasetUpload(f);
                        e.target.value = '';
                      }}
                      disabled={isUploadingDataset}
                      className="hidden"
                    />
                  </>
                )}
              </label>
            </div>
          </div>

          {/* Feedback messages */}
          {datasetSuccess && (
            <div className="p-3 rounded-lg bg-emerald-950/30 border border-emerald-500/30 text-emerald-300 text-xs flex items-center justify-between">
              <span>✓ {datasetSuccess}</span>
              <button
                type="button"
                onClick={() => setDatasetSuccess(null)}
                className="text-slate-400 hover:text-slate-200 text-xs cursor-pointer"
              >
                ✕
              </button>
            </div>
          )}

          {datasetError && (
            <div className="p-3 rounded-lg bg-red-950/30 border border-red-500/30 text-red-300 text-xs flex items-center justify-between">
              <span>⚠ {datasetError}</span>
              <button
                type="button"
                onClick={() => setDatasetError(null)}
                className="text-slate-400 hover:text-slate-200 text-xs cursor-pointer"
              >
                ✕
              </button>
            </div>
          )}

          {/* List of currently active uploaded datasets */}
          <div className="space-y-2">
            <h4 className="text-xs font-mono font-semibold text-slate-400 uppercase tracking-wider">
              Active Uploaded Datasets ({uploadedDatasets.length})
            </h4>

            {uploadedDatasets.length === 0 ? (
              <div className="p-4 rounded-xl border border-slate-800/80 bg-slate-950/30 text-center text-xs text-slate-500 font-mono">
                No active datasets uploaded yet. Upload a file above to make it available to your scripts.
              </div>
            ) : (
              <div className="space-y-2">
                {uploadedDatasets.map((ds) => (
                  <div
                    key={ds.filename}
                    className="p-3 rounded-xl border border-slate-800 bg-slate-950/80 flex items-center justify-between gap-3 text-xs"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-lg">📄</span>
                      <div>
                        <div className="font-mono font-bold text-slate-100 flex items-center gap-2">
                          <span>{ds.filename}</span>
                          <span className="text-[10px] font-normal text-slate-400 font-mono">
                            ({ds.size_mb > 0 ? `${ds.size_mb} MB` : `${ds.size_bytes} B`})
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          In Python:{' '}
                          <code className="text-cyan-300 font-mono bg-slate-900 px-1 py-0.5 rounded border border-slate-800">
                            pd.read_csv('{ds.filename}')
                          </code>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="text-[10px] font-mono text-amber-400/90 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded flex items-center gap-1">
                        <span>⏱</span>
                        <span>Auto-deletes in ~{Math.ceil(ds.remaining_minutes)}m</span>
                      </span>

                      <button
                        type="button"
                        onClick={() => handleDeleteDataset(ds.filename)}
                        className="px-2.5 py-1 rounded bg-red-950/40 hover:bg-red-900/60 border border-red-800/40 text-red-300 text-xs font-mono transition-colors cursor-pointer"
                        title="Delete dataset now"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Footer Details & Primary Action Button */}
      <div className="mt-5 flex flex-wrap items-center justify-between gap-4 pt-4 border-t border-slate-800/80">
        <div className="text-xs text-slate-500 font-mono flex items-center gap-2.5 flex-wrap">
          {sourceType === 'file' && loadedFileName ? (
            <span className="text-cyan-400">File: {loadedFileName}</span>
          ) : sourceType === 'sample' ? (
            <span className="text-cyan-400">Sample Script loaded</span>
          ) : (
            <span>Ready for analysis • Mode: {mode}</span>
          )}
          {uploadedDatasets.length > 0 && (
            <span className="text-[11px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full inline-flex items-center gap-1">
              <span>📊</span>
              <span>Dataset: {uploadedDatasets[0].filename} ({uploadedDatasets[0].size_mb > 0 ? `${uploadedDatasets[0].size_mb} MB` : `${uploadedDatasets[0].size_bytes} B`})</span>
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleTraceClick}
            disabled={isLoading || !code.trim()}
            className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-xs shadow-lg shadow-cyan-500/20 active:scale-[0.98] transition-all cursor-pointer inline-flex items-center gap-2"
          >
            {isLoading ? (
              <>
                <span className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin"></span>
                <span>Tracing…</span>
              </>
            ) : (
              <>
                <span>▶</span>
                <span>Trace &amp; Walk Through</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Stage 6: Error state */}
      {traceError && (
        <div className="mt-4 p-3.5 rounded-xl bg-red-950/30 border border-red-500/30 text-red-300 text-xs flex items-start gap-2">
          <span className="mt-0.5 shrink-0 w-4 h-4 rounded-full bg-red-500/20 text-red-400 flex items-center justify-center font-bold">!</span>
          <div>
            <span className="font-semibold text-red-200">Trace failed: </span>
            <span>{traceError}</span>
          </div>
        </div>
      )}

      {/* Stage 6: Success banner — raw step count (Stage 7 will replace with Studio view) */}
      {traceSteps && !traceError && (
        <div className="mt-4 p-3.5 rounded-xl bg-emerald-950/30 border border-emerald-500/30 text-emerald-300 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            <span>
              Trace complete — <strong>{traceSteps.length}</strong> steps received from the backend.
            </span>
          </div>
          <span className="font-mono text-[10px] text-emerald-400/80 bg-emerald-900/40 px-2 py-0.5 rounded">
            Live API ✓
          </span>
        </div>
      )}
      {/* TODO(stage-7): Replace success banner with Studio workspace view */}
    </div>
  );
}
