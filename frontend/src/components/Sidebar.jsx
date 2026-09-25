import React from 'react';

export default function Sidebar({
  activeView,
  onSelectView,
  assertions = {
    trainTestSplit: 'FAIL',
    fitVsTransform: 'FAIL',
    weightNormBounds: 'PASS'
  }
}) {
  const navItems = [
    { id: 'code-auditor', label: 'Code Auditor', icon: 'bug_report' },
    { id: 'visual-tracer', label: 'Execution DAG', icon: 'hub' },
    { id: 'leakage-inspector', label: 'Leakage Detector', icon: 'security' },
    { id: 'tensor-watcher', label: 'Tensor Watcher', icon: 'data_object' },
    { id: 'remediation-diff', label: 'AI Remediation', icon: 'auto_fix_high' }
  ];

  return (
    <aside className="fixed left-0 top-14 bottom-0 w-64 bg-surface-container-lowest z-40 flex flex-col justify-between border-r border-surface-variant/30">
      <div className="flex flex-col flex-1 overflow-y-auto">
        {/* Header */}
        <div className="px-space-md py-space-sm border-b border-surface-variant/20 flex items-center justify-between">
          <span className="font-label-xs text-label-xs text-outline tracking-wider uppercase font-mono">
            Workspace Views
          </span>
          <span className="material-symbols-outlined text-[14px] text-outline">view_sidebar</span>
        </div>

        {/* View Navigation Links */}
        <nav className="flex-1 px-space-xs py-space-sm flex flex-col gap-0.5">
          {navItems.map((item) => {
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
                <span>{item.label}</span>
                {item.id === 'leakage-inspector' && assertions.trainTestSplit === 'FAIL' && (
                  <span className="ml-auto w-2 h-2 rounded-full bg-error" />
                )}
              </button>
            );
          })}
        </nav>

        {/* Trace Assertions Drawer */}
        <div className="px-space-md py-space-sm border-t border-surface-variant/20 flex flex-col gap-space-xs bg-surface-container-lowest/80">
          <span className="font-label-xs text-label-xs text-outline tracking-wider uppercase font-mono">
            Trace Assertions
          </span>

          <div className="flex items-center justify-between text-code-sm text-on-surface-variant py-0.5">
            <span className="font-label-xs text-label-xs">Train/Test Split</span>
            <span className={`font-label-xs text-label-xs font-semibold font-mono ${
              assertions.trainTestSplit === 'PASS' ? 'text-secondary' : 'text-error'
            }`}>
              {assertions.trainTestSplit}
            </span>
          </div>

          <div className="flex items-center justify-between text-code-sm text-on-surface-variant py-0.5">
            <span className="font-label-xs text-label-xs">Fit vs Transform</span>
            <span className={`font-label-xs text-label-xs font-semibold font-mono ${
              assertions.fitVsTransform === 'PASS' ? 'text-secondary' : 'text-error'
            }`}>
              {assertions.fitVsTransform}
            </span>
          </div>

          <div className="flex items-center justify-between text-code-sm text-on-surface-variant py-0.5">
            <span className="font-label-xs text-label-xs">Weight Norm Bounds</span>
            <span className="text-secondary font-label-xs text-label-xs font-semibold font-mono">
              {assertions.weightNormBounds}
            </span>
          </div>
        </div>
      </div>

      {/* Footer System Status */}
      <div className="p-space-sm border-t border-surface-variant/30 bg-surface-container-low flex items-center justify-between">
        <div className="flex items-center gap-space-xs">
          <span className="w-2 h-2 rounded-full bg-secondary animate-pulse" />
          <span className="font-label-xs text-label-xs text-on-surface-variant font-mono">
            Runtime v2.4 (cuda0)
          </span>
        </div>
        <span className="font-code-sm text-code-sm text-outline font-mono">3.2GB</span>
      </div>
    </aside>
  );
}
