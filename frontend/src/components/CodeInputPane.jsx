import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  postTrace,
  TraceApiError,
  uploadDataset,
  getDatasets,
  deleteDataset,
  getInstallStatus,
  checkDependencies,
} from '../api/traceClient';

// pipeline_tracer.py — LogicLens primary sample (multi-stage log triage with nested loops & early exits)
const PIPELINE_TRACER_SAMPLE = `# pipeline_tracer.py — Multi-stage log triage for trace visualizers

raw_logs = [
    {"user": " alice ", "status": 200, "ms": 45},
    {"user": "",        "status": 200, "ms": 5},
    {"user": "bob",     "status": 500, "ms": 1200},
    {"user": "charlie", "status": 404, "ms": 310},
    {"user": "dave",    "status": 200, "ms": 850},
]

latency_tiers = [
    ("CRITICAL", 1000),
    ("WARNING", 300),
]

# Pass 1: Linear filter & sanitize (Guard clause)
clean_logs = []
for entry in raw_logs:
    name = entry["user"].strip().capitalize()
    if name:
        clean_logs.append({"user": name, "status": entry["status"], "ms": entry["ms"]})

# Pass 2: Nested loop (Rule matching with early exit)
triage_flags = []
for record in clean_logs:
    for tier, limit in latency_tiers:
        if record["ms"] >= limit:
            triage_flags.append((record["user"], tier))
            break

# Pass 3: State aggregation (Branching logic)
status_counts = {}
error_users = []
for record in clean_logs:
    code = record["status"]
    if code >= 400:
        error_users.append(record["user"])
    
    if code in status_counts:
        status_counts[code] += 1
    else:
        status_counts[code] = 1

print("Cleaned:", len(clean_logs))
print("Flags:", triage_flags)
print("Status Counts:", status_counts)
print("Errors:", error_users)`;

// Appendix C.2 — dsai_leakage_sample.py (Mode 2 secondary demo sample).
// NOTE: no leading or trailing blank line. The backend strips the source before
// ast.parse (see trace.py) while CodeViewer renders it verbatim, so any leading
// blank line would shift every reported line_number by one.
const DSAI_LEAKAGE_SAMPLE = `import numpy as np
import pandas as pd
from imblearn.over_sampling import SMOTE
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score, classification_report
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler

# -------------------------------------------------------------
# 0. Simulate Raw Dataset (Sequential / Customer Churn Scenario)
# -------------------------------------------------------------
np.random.seed(42)
n_rows = 1000

df = pd.DataFrame(
    {
        "timestamp": pd.date_range("2024-01-01", periods=n_rows, freq="h"),
        "customer_id": np.random.randint(100, 200, size=n_rows),  # Grouped entities
        "income": np.random.normal(50000, 15000, size=n_rows),
        "debt_ratio": np.random.uniform(0.1, 0.9, size=n_rows),
        "category": np.random.choice(["Tier1", "Tier2", "Tier3"], size=n_rows),
        "churn": np.random.binomial(1, 0.15, size=n_rows),  # 15% minority class
    }
)

# Introduce 5% missingness in income
df.loc[df.sample(frac=0.05, random_state=42).index, "income"] = np.nan

# -------------------------------------------------------------
# MISTAKE 1: Outlier removal based on global statistics
# -------------------------------------------------------------
mean_debt = df["debt_ratio"].mean()
std_debt = df["debt_ratio"].std()
df = df[df["debt_ratio"] < mean_debt + 3 * std_debt].copy()

# -------------------------------------------------------------
# MISTAKE 2: Global imputation before train/test split
# -------------------------------------------------------------
df["income"] = df["income"].fillna(df["income"].mean())

# -------------------------------------------------------------
# MISTAKE 3: Target Encoding across entire dataset
# -------------------------------------------------------------
target_enc = df.groupby("category")["churn"].mean()
df["category_encoded"] = df["category"].map(target_enc)

# -------------------------------------------------------------
# MISTAKE 4: Feature Selection computed on entire dataset
# -------------------------------------------------------------
numeric_features = ["income", "debt_ratio", "category_encoded"]
corr = df[numeric_features].corrwith(df["churn"]).abs()
top_features = corr.nlargest(2).index.tolist()

# -------------------------------------------------------------
# MISTAKE 5: Global Feature Scaling
# -------------------------------------------------------------
scaler = StandardScaler()
df[top_features] = scaler.fit_transform(df[top_features])

# -------------------------------------------------------------
# MISTAKE 6: Applying SMOTE / Oversampling BEFORE splitting
# -------------------------------------------------------------
X = df[top_features]
y = df["churn"]

smote = SMOTE(random_state=42)
X_resampled, y_resampled = smote.fit_resample(X, y)

# -------------------------------------------------------------
# MISTAKE 7: Random split on temporal / grouped data
# -------------------------------------------------------------
X_train, X_test, y_train, y_test = train_test_split(
    X_resampled, y_resampled, test_size=0.2, random_state=42, shuffle=True
)

# -------------------------------------------------------------
# MISTAKE 8: Evaluating on oversampled test data & raw accuracy
# -------------------------------------------------------------
clf = RandomForestClassifier(random_state=42)
clf.fit(X_train, y_train)

y_pred = clf.predict(X_test)

acc = accuracy_score(y_test, y_pred)
print("Accuracy:", acc)
print(classification_report(y_test, y_pred))`;

// Sandbox security rules: constructs that cannot be traced
const RESTRICTED_CONSTRUCTS = [
  {
    id: 'os',
    name: 'os',
    label: 'Operating System Access (os)',
    pattern: /(?:^|\n)\s*(?:import\s+(?:[a-zA-Z0-9_]+,\s*)*os\b|from\s+os\b)/m,
    description: 'Direct OS calls, process manipulation, and file paths are blocked in the sandbox.'
  },
  {
    id: 'sys',
    name: 'sys',
    label: 'System Access (sys)',
    pattern: /(?:^|\n)\s*(?:import\s+(?:[a-zA-Z0-9_]+,\s*)*sys\b|from\s+sys\b)/m,
    description: 'System runtime manipulation and exit hooks are blocked.'
  },
  {
    id: 'subprocess',
    name: 'subprocess',
    label: 'Process Execution (subprocess)',
    pattern: /(?:^|\n)\s*(?:import\s+(?:[a-zA-Z0-9_]+,\s*)*subprocess\b|from\s+subprocess\b)/m,
    description: 'Subprocess spawning and shell commands are forbidden.'
  },
  {
    id: 'socket',
    name: 'socket',
    label: 'Network Socket Access (socket)',
    pattern: /(?:^|\n)\s*(?:import\s+(?:[a-zA-Z0-9_]+,\s*)*socket\b|from\s+socket\b)/m,
    description: 'Raw network socket creation is restricted.'
  },
  {
    id: 'shutil',
    name: 'shutil',
    label: 'Filesystem Shell Utilities (shutil)',
    pattern: /(?:^|\n)\s*(?:import\s+(?:[a-zA-Z0-9_]+,\s*)*shutil\b|from\s+shutil\b)/m,
    description: 'Bulk file and directory manipulations are prohibited.'
  },
  {
    id: 'ctypes',
    name: 'ctypes',
    label: 'Foreign Function Interface (ctypes)',
    pattern: /(?:^|\n)\s*(?:import\s+(?:[a-zA-Z0-9_]+,\s*)*ctypes\b|from\s+ctypes\b)/m,
    description: 'Direct memory access and C library loading are prohibited.'
  },
  {
    id: 'threading',
    name: 'threading / multiprocessing',
    label: 'Concurrency (threading/multiprocessing)',
    pattern: /(?:^|\n)\s*(?:import\s+(?:[a-zA-Z0-9_]+,\s*)*(?:threading|multiprocessing)\b|from\s+(?:threading|multiprocessing)\b)/m,
    description: 'Spawning threads or child processes is restricted to ensure deterministic execution.'
  },
  {
    id: 'open',
    name: 'open()',
    label: 'Direct File I/O (open)',
    pattern: /(?<![a-zA-Z0-9_.])open\s*\(/,
    description: 'Direct filesystem reading/writing via open() is blocked. Use the Upload Dataset tab and pd.read_csv(...) instead.'
  },
];

export default function CodeInputPane({ mode = 'logic_lens', onTraceComplete, onRequestMode, initialCode = '' }) {
  // Tabs: 'editor', 'dropzone', 'sample', 'dataset'
  const [activeTab, setActiveTab] = useState('editor');
  const [code, setCode] = useState(initialCode || '');
  const [sourceType, setSourceType] = useState('editor'); // 'editor' | 'file' | 'sample'
  const [loadedFileName, setLoadedFileName] = useState('');
  const [fileMetadata, setFileMetadata] = useState(null);
  const [isSampleActive, setIsSampleActive] = useState(false);
  const [codeFlash, setCodeFlash] = useState(false);
  const [sampleNotification, setSampleNotification] = useState(null);
  const [isDragOver, setIsDragOver] = useState(false);

  // Scan code for disallowed sandbox libraries / operations (Item 6)
  const detectedRestricted = useMemo(() => {
    if (!code || !code.trim()) return [];
    return RESTRICTED_CONSTRUCTS.filter((item) => item.pattern.test(code));
  }, [code]);

  const notificationTimeoutRef = useRef(null);
  const flashTimeoutRef = useRef(null);
  const prevModeRef = useRef(mode);

  // Missing package installation progress state (Item 4 Update Bar)
  const [installState, setInstallState] = useState(null);
  const installPollRef = useRef(null);

  useEffect(() => {
    return () => {
      if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current);
      if (notificationTimeoutRef.current) clearTimeout(notificationTimeoutRef.current);
      if (installPollRef.current) clearInterval(installPollRef.current);
    };
  }, []);

  const triggerCodeFlash = (message) => {
    setCodeFlash(true);
    setSampleNotification(message);

    if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current);
    flashTimeoutRef.current = setTimeout(() => {
      setCodeFlash(false);
    }, 850);

    if (notificationTimeoutRef.current) clearTimeout(notificationTimeoutRef.current);
    notificationTimeoutRef.current = setTimeout(() => {
      setSampleNotification(null);
    }, 2600);
  };

  // When mode changes, if sample was active/toggled, auto-update sample code and notify user
  useEffect(() => {
    if (prevModeRef.current !== mode) {
      if (isSampleActive) {
        const nextCode = mode === 'model_lens' ? DSAI_LEAKAGE_SAMPLE : PIPELINE_TRACER_SAMPLE;
        const sampleName = mode === 'model_lens' ? 'dsai_leakage_sample.py' : 'pipeline_tracer.py';
        setCode(nextCode);
        setLoadedFileName(sampleName);
        setSourceType('sample');
        setFileMetadata(null);
        setActiveTab('editor');

        triggerCodeFlash(
          mode === 'model_lens'
            ? '⚡ Switched to ModelLens Sample (dsai_leakage_sample.py)'
            : '⚡ Switched to LogicLens Sample (pipeline_tracer.py)'
        );
      }
      prevModeRef.current = mode;
    }
  }, [mode, isSampleActive]);

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

  // Glowy Sample Script loader with mode-adaptive sample switching
  const handleToggleSample = () => {
    const nextCode = mode === 'model_lens' ? DSAI_LEAKAGE_SAMPLE : PIPELINE_TRACER_SAMPLE;
    const sampleName = mode === 'model_lens' ? 'dsai_leakage_sample.py' : 'pipeline_tracer.py';
    setCode(nextCode);
    setSourceType('sample');
    setLoadedFileName(sampleName);
    setFileMetadata(null);
    setIsSampleActive(true);
    setActiveTab('editor');

    triggerCodeFlash(
      mode === 'model_lens'
        ? '⚡ Loaded ModelLens Sample (dsai_leakage_sample.py)'
        : '⚡ Loaded LogicLens Sample (pipeline_tracer.py)'
    );
  };

  // Populate code with Appendix C sample
  const handleLoadSample = () => {
    handleToggleSample();
  };

  // Stage 14: Appendix C.2 ModelLens sample — switch caller to ModelLens
  const handleLoadLeakageSample = () => {
    if (onRequestMode) onRequestMode('model_lens');
    setCode(DSAI_LEAKAGE_SAMPLE);
    setSourceType('sample');
    setLoadedFileName('dsai_leakage_sample.py');
    setFileMetadata(null);
    setIsSampleActive(true);
    setActiveTab('editor');
    triggerCodeFlash('⚡ Loaded ModelLens Sample (dsai_leakage_sample.py)');
  };

  // Process file upload (.py or .ipynb)
  const handleFile = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result;
      if (typeof text !== 'string') return;

      let extractedCode = text;
      const isNotebook = file.name.endsWith('.ipynb');

      if (isNotebook) {
        try {
          const parsed = JSON.parse(text);
          const codeCells = parsed.cells
            ?.filter((cell) => cell.cell_type === 'code')
            ?.map((cell) => (Array.isArray(cell.source) ? cell.source.join('') : cell.source))
            ?.join('\n\n# --- In [Cell] ---\n');
          extractedCode = codeCells || text;
        } catch {
          extractedCode = text;
        }
      }

      setCode(extractedCode);
      setSourceType('file');
      setLoadedFileName(file.name);
      setIsSampleActive(false);

      const calculatedLines = extractedCode ? extractedCode.split('\n').length : 0;
      const formattedSize = file.size > 1024 * 1024
        ? `${(file.size / (1024 * 1024)).toFixed(2)} MB`
        : `${Math.max(1, Math.round(file.size / 1024))} KB`;

      setFileMetadata({
        name: file.name,
        lineCount: calculatedLines,
        sizeFormatted: formattedSize,
        isNotebook,
      });

      // Do NOT switch to 'editor' tab automatically:
      // stay on dropzone tab displaying the file card.
    };
    reader.readAsText(file);
  };

  const handleRemoveFile = () => {
    setCode('');
    setSourceType('editor');
    setLoadedFileName('');
    setFileMetadata(null);
    setIsSampleActive(false);
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
    setInstallState(null);

    // Pre-check if any imported packages are missing
    try {
      const depCheck = await checkDependencies(code);
      if (depCheck && Array.isArray(depCheck.missing) && depCheck.missing.length > 0) {
        setInstallState({
          isInstalling: true,
          packages: depCheck.missing,
          currentPackage: depCheck.missing[0],
          completed: [],
          progressPct: 15,
          statusMessage: `Preparing to install ${depCheck.missing.length} missing package(s): ${depCheck.missing.join(', ')}...`,
        });
      }
    } catch {
      // Non-critical: continue to trace
    }

    // Start polling installation progress during trace
    if (installPollRef.current) clearInterval(installPollRef.current);
    installPollRef.current = setInterval(async () => {
      try {
        const status = await getInstallStatus();
        if (status && (status.is_installing || status.progress_pct > 0)) {
          setInstallState({
            isInstalling: status.is_installing,
            packages: status.packages || [],
            currentPackage: status.current_package,
            completed: status.completed || [],
            progressPct: status.progress_pct,
            statusMessage: status.status_message,
          });
        }
      } catch {
        // ignore polling error
      }
    }, 400);

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
      if (installPollRef.current) {
        clearInterval(installPollRef.current);
        installPollRef.current = null;
      }
      setIsLoading(false);
      // Leave completion banner visible briefly (1s)
      setTimeout(() => {
        setInstallState(null);
      }, 1000);
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
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold tracking-wide transition-all flex items-center gap-1.5 ${
              activeTab === 'dropzone'
                ? 'bg-slate-800 text-cyan-400 border border-cyan-500/30 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <span>Dropzone (.py / .ipynb)</span>
            {fileMetadata && (
              <span className="px-1.5 py-0.2 rounded-full text-[9px] bg-cyan-500/20 text-cyan-300 font-mono font-bold">
                ✓
              </span>
            )}
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

        {/* Glowy Sample Script Action & Toggle Button */}
        <button
          type="button"
          onClick={handleToggleSample}
          className={`text-xs font-mono font-semibold px-4 py-1.5 rounded-lg border transition-all duration-300 inline-flex items-center gap-2 cursor-pointer ${
            isSampleActive
              ? 'bg-gradient-to-r from-cyan-950 via-slate-900 to-indigo-950 text-cyan-200 border-cyan-400 shadow-[0_0_22px_rgba(6,182,212,0.45)] ring-1 ring-cyan-400/60'
              : 'bg-cyan-950/40 hover:bg-cyan-900/50 text-cyan-300 hover:text-cyan-100 border-cyan-500/40 hover:border-cyan-400 shadow-[0_0_14px_rgba(6,182,212,0.25)] hover:shadow-[0_0_22px_rgba(6,182,212,0.5)]'
          }`}
          title={`Load sample script for ${mode === 'model_lens' ? 'ModelLens' : 'LogicLens'} (auto-switches with mode)`}
        >
          <span className="text-sm">⚡</span>
          <span>Sample Script</span>
          {isSampleActive && (
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse shadow-[0_0_8px_#22d3ee]" />
          )}
        </button>
      </div>

      {/* Dynamic Sandbox Policy Warning: Disallowed Modules/Constructs Detected (Item 6) */}
      {detectedRestricted.length > 0 && (
        <div className="mb-4 p-4 rounded-xl bg-amber-950/40 border border-amber-500/40 text-amber-200 text-xs shadow-lg shadow-amber-950/20 text-left animate-fadeIn">
          <div className="flex items-start gap-3">
            <span className="text-xl shrink-0 mt-0.5 leading-none">⚠️</span>
            <div className="space-y-1.5 flex-1">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <h4 className="font-bold text-amber-100 flex items-center gap-2">
                  <span>Sandbox Restriction Warning</span>
                  <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-mono text-[10px] font-semibold border border-amber-500/30">
                    {detectedRestricted.length} disallowed construct{detectedRestricted.length > 1 ? 's' : ''} detected
                  </span>
                </h4>
                <span className="text-[10px] font-mono text-amber-400/80 bg-amber-900/40 px-2 py-0.5 rounded border border-amber-800/50">
                  TraceLens Sandbox Policy
                </span>
              </div>
              <p className="text-amber-200/90 text-[11px] leading-relaxed">
                The execution sandbox blocks low-level system access, subprocesses, sockets, and raw file manipulation to guarantee deterministic tracing and isolate execution:
              </p>
              <div className="flex flex-wrap gap-2 pt-1">
                {detectedRestricted.map((item) => (
                  <span
                    key={item.id}
                    className="px-2.5 py-1 rounded-lg bg-amber-900/60 border border-amber-700/60 text-amber-200 font-mono text-[11px] flex items-center gap-1.5 shadow-sm"
                    title={item.description}
                  >
                    <span className="text-amber-400 font-bold">🚫</span>
                    <strong>{item.name}</strong>
                    <span className="text-amber-300/70 text-[10px]">({item.label})</span>
                  </span>
                ))}
              </div>
              <p className="text-[11px] text-amber-300/80 pt-1">
                💡 <strong>Tip:</strong> If reading external data files, upload them in the{' '}
                <button
                  type="button"
                  onClick={() => setActiveTab('dataset')}
                  className="underline font-semibold hover:text-cyan-300 text-amber-200 cursor-pointer"
                >
                  Upload Dataset
                </button>{' '}
                tab and load with <code className="text-cyan-300 bg-slate-900/80 px-1 py-0.5 rounded border border-slate-700 font-mono">pd.read_csv('filename.csv')</code> rather than calling <code className="text-amber-300 font-mono">open()</code>.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Dynamic Package Installation Update Bar (Item 4) */}
      {installState && (installState.isInstalling || installState.progressPct > 0) && (
        <div className="mb-4 p-4 rounded-xl bg-gradient-to-r from-cyan-950/90 via-slate-900 to-indigo-950/90 border border-cyan-500/50 shadow-[0_0_30px_rgba(6,182,212,0.25)] text-left animate-fadeIn">
          <div className="flex items-center justify-between gap-3 mb-2.5">
            <div className="flex items-center gap-2.5">
              <span className="w-5 h-5 rounded-full border-2 border-cyan-400 border-t-transparent animate-spin shrink-0" />
              <div>
                <h4 className="text-xs font-bold text-cyan-200 flex items-center gap-2">
                  <span>Installing Missing Library:</span>
                  <span className="font-mono px-2 py-0.5 rounded bg-cyan-900/60 border border-cyan-400/40 text-cyan-300">
                    {installState.currentPackage || installState.packages?.[0] || 'package'}
                  </span>
                </h4>
                <p className="text-[11px] text-slate-300 font-mono mt-0.5">
                  {installState.statusMessage || 'Preparing runtime environment via pip...'}
                </p>
              </div>
            </div>
            <div className="text-right">
              <span className="text-xs font-mono font-bold text-cyan-400">
                {installState.progressPct}%
              </span>
            </div>
          </div>

          {/* Glowing Animated Progress Bar */}
          <div className="w-full h-2.5 bg-slate-950 rounded-full overflow-hidden border border-slate-700/60 relative">
            <div
              className="h-full bg-gradient-to-r from-cyan-500 via-sky-400 to-indigo-500 rounded-full transition-all duration-300 shadow-[0_0_14px_rgba(6,182,212,0.8)]"
              style={{ width: `${Math.max(8, Math.min(100, installState.progressPct))}%` }}
            />
          </div>

          {/* Subtext info */}
          <div className="mt-2 flex items-center justify-between text-[10px] text-slate-400 font-mono flex-wrap gap-2">
            <span className="flex items-center gap-1.5 text-cyan-300/90">
              <span>⏱</span>
              <span>Timeout isolated: package download time does <strong>not</strong> count towards the 30s limit</span>
            </span>
            {installState.packages && installState.packages.length > 1 && (
              <span className="text-slate-400">
                Package {(installState.completed?.length || 0) + 1} of {installState.packages.length}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Tab A: Code Editor with Line Numbers & Fixed Dimensions */}
      {activeTab === 'editor' && (
        <div className="relative">
          {/* Visual Notification on Code Change */}
          {sampleNotification && (
            <div className="absolute -top-3.5 right-3 z-10 flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-950/95 border border-cyan-400 text-cyan-200 text-[11px] font-mono shadow-[0_0_20px_rgba(6,182,212,0.5)] transition-all animate-bounce">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping" />
              <span>{sampleNotification}</span>
            </div>
          )}

          <div
            className={`relative font-mono text-xs rounded-xl border bg-slate-950 overflow-hidden flex h-[380px] transition-all duration-500 ${
              codeFlash
                ? 'border-cyan-400 ring-2 ring-cyan-400/70 shadow-[0_0_35px_rgba(6,182,212,0.5)]'
                : 'border-slate-800'
            }`}
          >
            {/* Gutter with line numbers */}
            <div
              ref={lineNumbersRef}
              aria-hidden="true"
              className="w-12 py-3 bg-slate-900/60 border-r border-slate-800 text-slate-600 text-right pr-3 select-none overflow-hidden leading-6 font-mono h-full pointer-events-none shrink-0"
            >
              {Array.from({ length: lineCount }, (_, i) => (
                <div key={i + 1}>{i + 1}</div>
              ))}
            </div>

            {/* Raw code textarea with internal scrolling */}
            <textarea
              ref={textareaRef}
              value={code}
              onChange={(e) => {
                const val = e.target.value;
                setCode(val);
                setIsSampleActive(false);
                if (fileMetadata) {
                  setFileMetadata((prev) =>
                    prev ? { ...prev, lineCount: val.split('\n').length } : null
                  );
                } else if (sourceType !== 'file') {
                  setSourceType('editor');
                  setLoadedFileName('');
                }
              }}
              onScroll={handleScroll}
              spellCheck={false}
              placeholder={`# Paste teammate Python code here to trace runtime execution...\n# Example:\n# raw_logs = [{"user": "alice", "action": "login"}]\n# for record in raw_logs:\n#     print(record)`}
              className="flex-1 p-3 bg-transparent text-slate-100 placeholder-slate-600 outline-none resize-none leading-6 font-mono focus:ring-0 h-full overflow-y-auto overflow-x-auto whitespace-pre"
            />
          </div>
        </div>
      )}

      {/* Tab B: File Dropzone with File Card Display */}
      {activeTab === 'dropzone' && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragOver(true);
          }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={handleDrop}
          className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors min-h-[280px] flex flex-col items-center justify-center ${
            isDragOver
              ? 'border-cyan-400 bg-cyan-950/20'
              : fileMetadata
              ? 'border-cyan-500/40 bg-slate-950/80'
              : 'border-slate-800 bg-slate-950/60 hover:border-slate-700'
          }`}
        >
          {fileMetadata ? (
            <div className="max-w-md mx-auto flex flex-col items-center">
              <div className="w-14 h-14 rounded-2xl bg-cyan-950/60 border border-cyan-500/40 flex items-center justify-center text-cyan-300 text-2xl mb-3 shadow-lg shadow-cyan-500/10">
                {fileMetadata.isNotebook ? '📓' : '📄'}
              </div>
              <h3 className="text-base font-bold font-mono text-slate-100 mb-1 flex items-center gap-2">
                <span>{fileMetadata.name}</span>
              </h3>
              <div className="flex items-center gap-2 text-xs text-slate-400 font-mono mb-4 flex-wrap justify-center">
                <span className="text-cyan-400 font-semibold">{fileMetadata.lineCount.toLocaleString()} lines</span>
                <span>•</span>
                <span>{fileMetadata.sizeFormatted}</span>
                <span>•</span>
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] uppercase font-bold tracking-wider inline-flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Ready to Trace
                </span>
              </div>
              <div className="flex items-center gap-2.5 flex-wrap justify-center">
                <label className="cursor-pointer px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 border border-slate-700 transition-colors inline-flex items-center gap-1.5">
                  <span>Choose Another File</span>
                  <input
                    type="file"
                    accept=".py,.ipynb"
                    onChange={(e) => {
                      handleFile(e.target.files?.[0]);
                      e.target.value = '';
                    }}
                    className="hidden"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => setActiveTab('editor')}
                  className="px-3.5 py-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-xs font-semibold text-slate-300 hover:text-slate-100 border border-slate-700/80 transition-colors"
                >
                  View in Editor
                </button>
                <button
                  type="button"
                  onClick={handleRemoveFile}
                  className="px-3 py-1.5 rounded-lg bg-rose-950/40 hover:bg-rose-900/60 text-xs font-semibold text-rose-300 border border-rose-800/40 transition-colors"
                  title="Remove file"
                >
                  Remove File
                </button>
              </div>
            </div>
          ) : (
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
                  onChange={(e) => {
                    handleFile(e.target.files?.[0]);
                    e.target.value = '';
                  }}
                  className="hidden"
                />
              </label>
            </div>
          )}
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
                Once uploaded, your Python script can access it directly by filename, for example: <code className="text-cyan-300 font-mono">pd.read_csv('dataset.csv')</code>.
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

      {/* Informational Guidance Cards: Sandbox Restrictions & Trace Recording Scope (Items 5 & 6) */}
      <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-3 text-left">
        {/* Card 1: Sandbox Security & Package Auto-Preparation (Item 6 & Item 4) */}
        <div className="p-3.5 rounded-xl border border-slate-800 bg-slate-950/60 flex flex-col justify-between text-xs space-y-2">
          <div>
            <div className="flex items-center gap-2 font-bold text-slate-200 mb-1">
              <span className="text-amber-400">🛡️</span>
              <span>Sandbox Restrictions &amp; Dependencies</span>
            </div>
            <p className="text-slate-400 text-[11px] leading-relaxed">
              System modules (<code className="text-amber-300 font-mono">os</code>, <code className="text-amber-300 font-mono">sys</code>, <code className="text-amber-300 font-mono">subprocess</code>, <code className="text-amber-300 font-mono">socket</code>) and direct <code className="text-amber-300 font-mono">open()</code> cannot be traced in the sandbox. Standard third-party packages (e.g. <code className="text-cyan-300 font-mono">numpy</code>, <code className="text-cyan-300 font-mono">pandas</code>, <code className="text-cyan-300 font-mono">sklearn</code>) are automatically prepared.
            </p>
          </div>
          <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400">
            <span className="flex items-center gap-1.5 text-cyan-400 font-mono text-[10px]">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
              Package preparation does not reduce 30s execution timeout
            </span>
          </div>
        </div>

        {/* Card 2: Trace Loading & Dynamic Scope Note (Item 5) */}
        <div className="p-3.5 rounded-xl border border-slate-800 bg-slate-950/60 flex flex-col justify-between text-xs space-y-2">
          <div>
            <div className="flex items-center gap-2 font-bold text-slate-200 mb-1">
              <span className="text-sky-400">ℹ️</span>
              <span>Why Did Part of My Code Not Load?</span>
            </div>
            <p className="text-slate-400 text-[11px] leading-relaxed">
              TraceLens records live runtime execution. If a code line does not execute at runtime (such as untaken <code className="text-sky-300 font-mono">if/else</code> branches, uncalled functions, or code after an early <code className="text-sky-300 font-mono">return</code>), it will not load into the trace replay.
            </p>
          </div>
          <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400">
            <span className="text-slate-500 font-mono text-[10px]">
              Unexecuted lines are flagged in the Studio Code Viewer
            </span>
          </div>
        </div>
      </div>

      {/* Footer Details & Primary Action Button */}
      <div className="mt-5 flex flex-wrap items-center justify-between gap-4 pt-4 border-t border-slate-800/80">
        <div className="text-xs text-slate-500 font-mono flex items-center gap-2.5 flex-wrap">
          {sourceType === 'file' && loadedFileName ? (
            <span className="text-cyan-400 flex items-center gap-1.5">
              <span>📄</span>
              <span>File: <strong>{loadedFileName}</strong> ({fileMetadata ? `${fileMetadata.lineCount} lines` : `${lines.length} lines`})</span>
            </span>
          ) : sourceType === 'sample' ? (
            <span className="text-cyan-400 flex items-center gap-1.5">
              <span>⚡</span>
              <span>Sample Script: <strong>{loadedFileName || (mode === 'model_lens' ? 'dsai_leakage_sample.py' : 'pipeline_tracer.py')}</strong></span>
            </span>
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
                <span>
                  {installState && installState.isInstalling
                    ? `Installing ${installState.currentPackage || 'Package'}…`
                    : 'Tracing…'}
                </span>
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
