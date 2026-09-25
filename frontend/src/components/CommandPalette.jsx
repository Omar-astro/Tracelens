import React, { useState, useEffect } from 'react';

export default function CommandPalette({
  isOpen,
  onClose,
  onSelectStepId,
  onSelectView,
  onApplyFix,
  onOpenNewAudit,
  onChangeMode
}) {
  const [query, setQuery] = useState('');

  // Handle Cmd+K / Ctrl+K keyboard shortcut
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        if (isOpen) onClose();
        else onSelectStepId(-1);
      }
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, onSelectStepId]);

  if (!isOpen) return null;

  const actions = [
    // LogicLens Core Actions
    { id: 'mode-logic', title: 'Switch to Mode 1: LogicLens (Teammate Handoff)', category: 'Lens Mode', icon: 'tune', run: () => onChangeMode && onChangeMode('logic_lens') },
    { id: 'mode-model', title: 'Switch to Mode 2: ModelLens (ML Methodology)', category: 'Lens Mode', icon: 'shield', run: () => onChangeMode && onChangeMode('model_lens') },
    { id: 'jump-safe-hook', title: 'Jump to Safe Hook [★ Line 25]', category: 'LogicLens', icon: 'star', run: () => onSelectView('logic-handoff') },
    { id: 'view-logic-studio', title: 'View 4-Pane Studio Workspace', category: 'LogicLens', icon: 'dashboard', run: () => onSelectView('logic-studio') },
    { id: 'view-logic-loops', title: 'View Loop Dial & Iteration Carousel', category: 'LogicLens', icon: 'sync', run: () => onSelectView('logic-loops') },
    { id: 'view-logic-state', title: 'View State & Mutation Deltas', category: 'LogicLens', icon: 'memory', run: () => onSelectView('logic-state') },
    
    // ModelLens Actions
    { id: 'jump-9', title: 'Jump to Step 09 (Data Leakage Point)', category: 'ModelLens', icon: 'crisis_alert', run: () => onSelectStepId(9) },
    { id: 'jump-14', title: 'Jump to Step 14 (Train/Test Split & Imbalance)', category: 'ModelLens', icon: 'warning', run: () => onSelectStepId(14) },
    { id: 'jump-31', title: 'Jump to Step 31 (Estimator Fit)', category: 'ModelLens', icon: 'play_circle', run: () => onSelectStepId(31) },
    { id: 'view-dag', title: 'View Execution DAG Flow Graph', category: 'ModelLens', icon: 'hub', run: () => onSelectView('visual-tracer') },
    { id: 'view-code', title: 'View Code Auditor & Cell Inspector', category: 'ModelLens', icon: 'bug_report', run: () => onSelectView('code-auditor') },
    { id: 'view-leakage', title: 'View Leakage Forensic Inspector', category: 'ModelLens', icon: 'security', run: () => onSelectView('leakage-inspector') },
    { id: 'view-tensors', title: 'View Tensor Register Watcher', category: 'ModelLens', icon: 'data_object', run: () => onSelectView('tensor-watcher') },
    { id: 'apply-fix', title: 'Apply Zero-Contamination Patch (Bob AI)', category: 'ModelLens', icon: 'auto_fix_high', run: () => onApplyFix() },
    
    // General Actions
    { id: 'new-audit', title: 'Start New Trace / Audit (Intake Dashboard)', category: 'Actions', icon: 'add_circle', run: () => onOpenNewAudit() },
  ];

  const filtered = actions.filter(a => a.title.toLowerCase().includes(query.toLowerCase()) || a.category.toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-24 p-4">
      <div 
        className="fixed inset-0 bg-surface-container-lowest/80 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="relative z-10 w-full max-w-lg bg-surface-container-low rounded-xl shadow-2xl border border-surface-variant/40 overflow-hidden text-on-surface">
        {/* Search Input */}
        <div className="p-3 border-b border-surface-variant/30 flex items-center gap-2">
          <span className="material-symbols-outlined text-[18px] text-outline">search</span>
          <input
            autoFocus
            type="text"
            placeholder="Type a command (e.g. hook, loop, leakage, DAG)..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full bg-transparent font-code-sm text-code-sm text-on-surface focus:outline-none font-mono"
          />
          <span className="font-label-xs text-label-xs bg-surface-container px-1.5 py-0.5 rounded text-outline font-mono">
            ESC
          </span>
        </div>

        {/* Command List */}
        <div className="max-h-72 overflow-y-auto p-1.5 flex flex-col gap-0.5">
          {filtered.length === 0 ? (
            <div className="p-4 text-center text-outline text-body-sm font-mono">
              No matching commands
            </div>
          ) : (
            filtered.map((action) => (
              <button
                key={action.id}
                type="button"
                onClick={() => {
                  action.run();
                  onClose();
                }}
                className="flex items-center justify-between p-2 rounded hover:bg-surface-container text-left transition-colors group"
              >
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[16px] text-outline group-hover:text-primary">
                    {action.icon}
                  </span>
                  <span className="font-body-sm text-body-sm text-on-surface font-mono">
                    {action.title}
                  </span>
                </div>
                <span className="font-label-xs text-[10px] uppercase text-outline font-mono">
                  {action.category}
                </span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
