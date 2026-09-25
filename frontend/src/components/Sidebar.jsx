import React from 'react';

export default function Sidebar({
  activeView,
  onSelectView,
  currentMode = 'logic_lens',
  onChangeMode,
  assertions = {
    trainTestSplit: 'FAIL',
    fitVsTransform: 'FAIL',
    weightNormBounds: 'PASS'
  }
}) {
  const isLogicLens = currentMode === 'logic_lens';

  const logicNavItems = [
    { id: 'logic-studio', label: 'Studio Workspace', icon: 'dashboard', badge: '4-Pane' },
    { id: 'logic-loops', label: 'Loop Visualizer', icon: 'sync', badge: 'Active' },
    { id: 'logic-state', label: 'State & Deltas', icon: 'memory' },
    { id: 'logic-handoff', label: 'Teammate Handoff', icon: 'handshake', badge: '★ Hook' }
  ];

  const modelNavItems = [
    { id: 'code-auditor', label: 'Code Auditor', icon: 'bug_report' },
    { id: 'visual-tracer', label: 'Execution DAG', icon: 'hub' },
    { id: 'leakage-inspector', label: 'Leakage Detector', icon: 'security' },
    { id: 'tensor-watcher', label: 'Tensor Watcher', icon: 'data_object' },
    { id: 'remediation-diff', label: 'AI Remediation', icon: 'auto_fix_high' }
  ];

  const currentNavItems = isLogicLens ? logicNavItems : modelNavItems;

  return (
    <aside className="fixed left-0 top-14 bottom-0 w-64 bg-surface-container-lowest z-40 flex flex-col justify-between border-r border-surface-variant/30">
      <div className="flex flex-col flex-1 overflow-y-auto">
        {/* Mode Pill Toggle Header */}
        <div className="px-space-md py-space-sm border-b border-surface-variant/20 flex flex-col gap-1.5 bg-surface-container-low/40">
          <span className="font-label-xs text-label-xs text-outline tracking-wider uppercase font-mono">
            Active Analysis Lens
          </span>

          <div className="grid grid-cols-2 gap-1 bg-surface-container-lowest p-0.5 rounded-lg border border-surface-variant/30 font-mono text-[11px]">
            <button
              type="button"
              onClick={() => onChangeMode && onChangeMode('logic_lens')}
              className={`py-1 px-1 rounded text-center transition-all ${
                isLogicLens
                  ? 'bg-primary text-on-primary font-bold shadow-sm'
                  : 'text-outline hover:text-on-surface'
              }`}
            >
              Mode 1: Logic
            </button>

            <button
              type="button"
              onClick={() => onChangeMode && onChangeMode('model_lens')}
              className={`py-1 px-1 rounded text-center transition-all ${
                !isLogicLens
                  ? 'bg-tertiary text-on-tertiary font-bold shadow-sm'
                  : 'text-outline hover:text-on-surface'
              }`}
            >
              Mode 2: ML
            </button>
          </div>
        </div>

        {/* Workspace Views Navigation */}
        <div className="px-space-md py-space-xs border-b border-surface-variant/20 flex items-center justify-between">
          <span className="font-label-xs text-label-xs text-outline tracking-wider uppercase font-mono">
            {isLogicLens ? 'LogicLens Views' : 'ModelLens Views'}
          </span>
          <span className="material-symbols-outlined text-[14px] text-outline">view_sidebar</span>
        </div>

        <nav className="flex-1 px-space-xs py-space-sm flex flex-col gap-0.5">
          {currentNavItems.map((item) => {
            const isActive = activeView === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectView(item.id)}
                className={`flex items-center px-space-sm py-1.5 rounded transition-all text-left font-body-sm text-body-sm ${
                  isActive
                    ? 'bg-primary-container text-on-primary-container font-headline-sm shadow-sm'
                    : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface'
                }`}
              >
                <span className={`material-symbols-outlined text-[16px] mr-2 ${isActive ? 'text-on-primary-container' : 'text-outline'}`}>
                  {item.icon}
                </span>
                <span className="truncate">{item.label}</span>

                {item.badge && (
                  <span className={`ml-auto font-mono text-[10px] px-1 py-0.2 rounded ${
                    isActive ? 'bg-on-primary-container/20 text-on-primary-container' : 'bg-surface-container-high text-outline'
                  }`}>
                    {item.badge}
                  </span>
                )}

                {item.id === 'leakage-inspector' && assertions.trainTestSplit === 'FAIL' && (
                  <span className="ml-auto w-2 h-2 rounded-full bg-error" />
                )}
              </button>
            );
          })}
        </nav>

        {/* Trace Assertions Drawer */}
        <div className="px-space-md py-space-sm border-t border-surface-variant/20 flex flex-col gap-space-xs bg-surface-container-lowest/80 font-mono">
          <span className="font-label-xs text-label-xs text-outline tracking-wider uppercase">
            {isLogicLens ? 'Teammate Trace Invariants' : 'ML Audit Assertions'}
          </span>

          {isLogicLens ? (
            <>
              <div className="flex items-center justify-between text-code-sm text-on-surface-variant py-0.5">
                <span className="font-label-xs text-label-xs">Loop Exhaustion</span>
                <span className="text-secondary font-label-xs text-label-xs font-semibold">
                  PASS (4/4)
                </span>
              </div>

              <div className="flex items-center justify-between text-code-sm text-on-surface-variant py-0.5">
                <span className="font-label-xs text-label-xs">Accumulator Stable</span>
                <span className="text-secondary font-label-xs text-label-xs font-semibold">
                  3 ITEMS
                </span>
              </div>

              <div className="flex items-center justify-between text-code-sm text-on-surface-variant py-0.5">
                <span className="font-label-xs text-label-xs">Safe Hook @ L25</span>
                <span className="text-secondary font-label-xs text-label-xs font-semibold">
                  READY
                </span>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between text-code-sm text-on-surface-variant py-0.5">
                <span className="font-label-xs text-label-xs">Train/Test Split</span>
                <span className={`font-label-xs text-label-xs font-semibold ${
                  assertions.trainTestSplit === 'PASS' ? 'text-secondary' : 'text-error'
                }`}>
                  {assertions.trainTestSplit}
                </span>
              </div>

              <div className="flex items-center justify-between text-code-sm text-on-surface-variant py-0.5">
                <span className="font-label-xs text-label-xs">Fit vs Transform</span>
                <span className={`font-label-xs text-label-xs font-semibold ${
                  assertions.fitVsTransform === 'PASS' ? 'text-secondary' : 'text-error'
                }`}>
                  {assertions.fitVsTransform}
                </span>
              </div>

              <div className="flex items-center justify-between text-code-sm text-on-surface-variant py-0.5">
                <span className="font-label-xs text-label-xs">Weight Norm Bounds</span>
                <span className="text-secondary font-label-xs text-label-xs font-semibold">
                  {assertions.weightNormBounds}
                </span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Footer System Status */}
      <div className="p-space-sm border-t border-surface-variant/30 bg-surface-container-low flex items-center justify-between font-mono">
        <div className="flex items-center gap-space-xs">
          <span className="w-2 h-2 rounded-full bg-secondary animate-pulse" />
          <span className="font-label-xs text-label-xs text-on-surface-variant">
            {isLogicLens ? 'sys.settrace active' : 'Runtime v2.4 (cuda0)'}
          </span>
        </div>
        <span className="font-code-sm text-code-sm text-outline">
          {isLogicLens ? '26 steps' : '3.2GB'}
        </span>
      </div>
    </aside>
  );
}
