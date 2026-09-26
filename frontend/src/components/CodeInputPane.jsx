import React, { useState, useRef } from 'react';

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

// Stage 1/Appendix A 5-step mock trace array
const MOCK_TRACE_STEPS = [
  {
    step_id: 1,
    line_number: 1,
    code_line: 'raw_logs = [{"user": " alice ", "action": "login", "status": 200}]',
    event_type: 'line',
    loop_context: null,
    branch_context: null,
    variable_deltas: {
      raw_logs: {
        action: 'created',
        var_name: 'raw_logs',
        type_name: 'list',
        old_value: null,
        new_value: [{ user: ' alice ', action: 'login', status: 200 }],
        repr_str: "[{'user': ' alice ', 'action': 'login', 'status': 200}]",
        metadata: { length: 1 }
      }
    },
    all_variables: {
      raw_logs: "[{'user': ' alice ', 'action': 'login', 'status': 200}]"
    },
    stdout_emitted: null
  },
  {
    step_id: 2,
    line_number: 8,
    code_line: 'cleaned_records = []',
    event_type: 'line',
    loop_context: null,
    branch_context: null,
    variable_deltas: {
      cleaned_records: {
        action: 'created',
        var_name: 'cleaned_records',
        type_name: 'list',
        old_value: null,
        new_value: [],
        repr_str: '[]',
        metadata: { length: 0 }
      }
    },
    all_variables: {
      raw_logs: "[{'user': ' alice ', 'action': 'login', 'status': 200}]",
      cleaned_records: '[]'
    },
    stdout_emitted: null
  },
  {
    step_id: 3,
    line_number: 9,
    code_line: 'error_count = 0',
    event_type: 'line',
    loop_context: null,
    branch_context: null,
    variable_deltas: {
      error_count: {
        action: 'created',
        var_name: 'error_count',
        type_name: 'int',
        old_value: null,
        new_value: 0,
        repr_str: '0',
        metadata: null
      }
    },
    all_variables: {
      raw_logs: "[{'user': ' alice ', 'action': 'login', 'status': 200}]",
      cleaned_records: '[]',
      error_count: '0'
    },
    stdout_emitted: null
  },
  {
    step_id: 4,
    line_number: 12,
    code_line: 'for record in raw_logs:',
    event_type: 'loop_iteration',
    loop_context: {
      loop_id: 'loop_line_12',
      loop_type: 'for',
      header_line: 12,
      current_iteration: 1,
      total_iterations: 1,
      iterator_target: 'record',
      iterator_value: { user: ' alice ', action: 'login', status: 200 },
      is_exit_step: false
    },
    branch_context: null,
    variable_deltas: {
      record: {
        action: 'created',
        var_name: 'record',
        type_name: 'dict',
        old_value: null,
        new_value: { user: ' alice ', action: 'login', status: 200 },
        repr_str: "{'user': ' alice ', 'action': 'login', 'status': 200}",
        metadata: null
      }
    },
    all_variables: {
      raw_logs: "[{'user': ' alice ', 'action': 'login', 'status': 200}]",
      cleaned_records: '[]',
      error_count: '0',
      record: "{'user': ' alice ', 'action': 'login', 'status': 200}"
    },
    stdout_emitted: null
  },
  {
    step_id: 5,
    line_number: 13,
    code_line: 'name = record["user"].strip().capitalize()',
    event_type: 'line',
    loop_context: null,
    branch_context: null,
    variable_deltas: {
      name: {
        action: 'created',
        var_name: 'name',
        type_name: 'str',
        old_value: null,
        new_value: 'Alice',
        repr_str: "'Alice'",
        metadata: { length: 5 }
      }
    },
    all_variables: {
      raw_logs: "[{'user': ' alice ', 'action': 'login', 'status': 200}]",
      cleaned_records: '[]',
      error_count: '0',
      record: "{'user': ' alice ', 'action': 'login', 'status': 200}",
      name: "'Alice'"
    },
    stdout_emitted: null
  }
];

export default function CodeInputPane({ mode = 'logic_lens' }) {
  // Tabs: 'editor' (Tab A), 'dropzone' (Tab B), 'sample' (Tab C)
  const [activeTab, setActiveTab] = useState('editor');
  const [code, setCode] = useState('');
  const [loadedFileName, setLoadedFileName] = useState('');
  const [isDragOver, setIsDragOver] = useState(false);
  const [mockTraceState, setMockTraceState] = useState(null);

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

  // Trigger Trace & Walk Through (Stage 2: Mocked local state only, no network calls)
  const handleTraceClick = () => {
    // # TODO(stage-6): Replace hardcoded mock trace with postTrace API client call
    // # TODO(stage-7): Transition to Studio workspace layout
    setMockTraceState(MOCK_TRACE_STEPS);
    console.log('Trace & Walk Through triggered. Local mock trace array (5 steps):', MOCK_TRACE_STEPS);
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
            className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 text-white font-bold text-xs shadow-lg shadow-cyan-500/20 active:scale-[0.98] transition-all cursor-pointer inline-flex items-center gap-2"
          >
            <span>▶</span>
            <span>Trace & Walk Through</span>
          </button>
        </div>
      </div>

      {/* Mock Trace Confirmation Banner (Stage 2 Verification) */}
      {mockTraceState && (
        <div className="mt-4 p-3.5 rounded-xl bg-emerald-950/30 border border-emerald-500/30 text-emerald-300 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            <span>
              Mock trace array stored in local state ({mockTraceState.length} steps) and logged to console.
            </span>
          </div>
          <span className="font-mono text-[10px] text-emerald-400/80 bg-emerald-900/40 px-2 py-0.5 rounded">
            Stage 2 Mock Active (No network calls)
          </span>
        </div>
      )}
    </div>
  );
}
