import React, { useState, useRef } from 'react';
import { postTrace, TraceApiError } from '../api/traceClient';

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

export default function CodeInputPane({ mode = 'logic_lens', onTraceComplete }) {
  // Tabs: 'editor' (Tab A), 'dropzone' (Tab B), 'sample' (Tab C)
  const [activeTab, setActiveTab] = useState('editor');
  const [code, setCode] = useState('');
  const [loadedFileName, setLoadedFileName] = useState('');
  const [isDragOver, setIsDragOver] = useState(false);

  // Stage 6: real network state
  const [isLoading, setIsLoading] = useState(false);
  const [traceError, setTraceError] = useState(null);    // string | null
  const [traceSteps, setTraceSteps] = useState(null);    // TraceStep[] | null

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
    setLoadedFileName('teammate_pipeline.py');
    setActiveTab('editor');
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
      // Backend returns { steps: TraceStep[], safe_insertion_points: [...] }
      const steps = Array.isArray(response) ? response : (response.steps ?? []);
      setTraceSteps(steps);
      if (onTraceComplete) {
        onTraceComplete(steps, code);
      }
      console.log('Trace complete —', steps.length, 'steps received:', steps);
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
          {/* Tab A */}
          <button
            type="button"
            onClick={() => setActiveTab('editor')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold tracking-wide transition-all ${
              activeTab === 'editor'
                ? 'bg-slate-800 text-cyan-400 border border-cyan-500/30 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            Tab A: Code Editor
          </button>

          {/* Tab B */}
          <button
            type="button"
            onClick={() => setActiveTab('dropzone')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold tracking-wide transition-all ${
              activeTab === 'dropzone'
                ? 'bg-slate-800 text-cyan-400 border border-cyan-500/30 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            Tab B: Dropzone (.py / .ipynb)
          </button>

          {/* Tab C */}
          <button
            type="button"
            onClick={() => setActiveTab('sample')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold tracking-wide transition-all ${
              activeTab === 'sample'
                ? 'bg-slate-800 text-cyan-400 border border-cyan-500/30 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            Tab C: Sample Script
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
            onChange={(e) => setCode(e.target.value)}
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
        <div className="p-5 rounded-xl border border-slate-800 bg-slate-950/60 text-left">
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
      )}

      {/* Footer Details & Primary Action Button */}
      <div className="mt-5 flex flex-wrap items-center justify-between gap-4 pt-4 border-t border-slate-800/80">
        <div className="text-xs text-slate-500 font-mono">
          {loadedFileName ? (
            <span className="text-cyan-400">File: {loadedFileName}</span>
          ) : (
            <span>Ready for analysis • Mode: {mode}</span>
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
