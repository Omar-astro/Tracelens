import React from 'react';
import TraceLensLogo from './TraceLensLogo';

export default function Navbar({
  currentFileName = 'teammate_pipeline.py',
  currentMode = 'logic_lens',
  onChangeMode,
  criticalIssuesCount = 1,
  warningIssuesCount = 1,
  onOpenNewAudit,
  onOpenCommandPalette,
  currentStepNumber = 1,
  totalSteps = 26
}) {
  const isLogicLens = currentMode === 'logic_lens';

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-surface-container-lowest/95 backdrop-blur-md shadow-[0_1px_8px_rgba(0,0,0,0.45)] border-b border-surface-variant/30">
      <div className="h-14 w-full px-margin-dense flex items-center justify-between gap-space-md">
        {/* Left: Brand & File Breadcrumbs */}
        <div className="flex items-center gap-space-md min-w-0">
          <div
            className="flex items-center gap-space-sm shrink-0 cursor-pointer"
            onClick={onOpenNewAudit}
            title="Return to Intake Dashboard"
          >
            <TraceLensLogo className="h-8 w-8 object-contain" />
            <span className="font-headline-sm text-headline-sm text-primary tracking-tight font-semibold">
              Trace<span className="text-secondary">Lens</span>
            </span>
          </div>

          <div className="h-4 w-px bg-surface-variant shrink-0" />

          {/* Mode Switcher Pill in Navbar */}
          <div className="flex items-center gap-1 bg-surface-container-lowest p-0.5 rounded-lg border border-surface-variant/40 font-mono text-label-xs shrink-0">
            <button
              type="button"
              onClick={() => onChangeMode && onChangeMode('logic_lens')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded transition-all ${
                isLogicLens
                  ? 'bg-primary text-on-primary font-bold shadow-sm'
                  : 'text-outline hover:text-on-surface'
              }`}
            >
              <span className="material-symbols-outlined text-[13px]">tune</span>
              <span>LogicLens (Main)</span>
            </button>

            <button
              type="button"
              onClick={() => onChangeMode && onChangeMode('model_lens')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded transition-all ${
                !isLogicLens
                  ? 'bg-tertiary text-on-tertiary font-bold shadow-sm'
                  : 'text-outline hover:text-on-surface'
              }`}
            >
              <span className="material-symbols-outlined text-[13px]">shield</span>
              <span>ModelLens (ML)</span>
            </button>
          </div>

          <div className="h-4 w-px bg-surface-variant shrink-0 hidden sm:block" />

          {/* File path breadcrumb */}
          <div className="hidden md:flex items-center gap-space-xs font-code-sm text-code-sm text-on-surface-variant truncate shrink-0 font-mono">
            <span className="material-symbols-outlined text-[15px] text-outline">folder_open</span>
            <span className="hover:text-on-surface transition-colors cursor-pointer">
              {isLogicLens ? 'teammate_code' : 'models/churn'}
            </span>
            <span className="text-outline">/</span>
            <span className="text-primary font-medium flex items-center gap-1">
              <span className="material-symbols-outlined text-[15px] text-primary">description</span>
              {currentFileName}
            </span>
          </div>

          {/* Sandboxed status */}
          <div className="hidden xl:flex items-center gap-space-xs px-space-sm py-0.5 rounded bg-surface-container text-secondary font-label-xs text-label-xs border border-secondary/20 shrink-0 font-mono">
            <span className="w-1.5 h-1.5 rounded-full bg-secondary animate-pulse" />
            <span>Sandboxed Trace: Step {currentStepNumber} of {totalSteps}</span>
          </div>
        </div>

        {/* Right: Telemetry Chips & Action CTAs */}
        <div className="flex items-center gap-space-sm shrink-0">
          {/* Diagnostic indicators depending on Mode */}
          {isLogicLens ? (
            <div className="hidden md:flex items-center gap-space-xs font-mono">
              <span className="px-space-sm py-0.5 rounded bg-secondary-container/20 text-secondary font-label-xs text-label-xs flex items-center gap-1 border border-secondary/30">
                <span className="material-symbols-outlined text-[12px]">star</span>
                Safe Hook @ Line 25
              </span>
              <span className="px-space-sm py-0.5 rounded bg-primary-container/20 text-primary font-label-xs text-label-xs flex items-center gap-1 border border-primary/30">
                <span className="material-symbols-outlined text-[12px]">sync</span>
                Deterministic Loops
              </span>
            </div>
          ) : (
            <div className="hidden md:flex items-center gap-space-xs font-mono">
              {criticalIssuesCount > 0 ? (
                <span className="px-space-sm py-0.5 rounded bg-error-container/20 text-error font-label-xs text-label-xs flex items-center gap-1 border border-error/25">
                  <span className="material-symbols-outlined text-[12px]">error</span>
                  {criticalIssuesCount} Critical Leakage
                </span>
              ) : (
                <span className="px-space-sm py-0.5 rounded bg-secondary-container/20 text-secondary font-label-xs text-label-xs flex items-center gap-1 border border-secondary/25">
                  <span className="material-symbols-outlined text-[12px]">check_circle</span>
                  Zero Contamination
                </span>
              )}

              {warningIssuesCount > 0 && (
                <span className="px-space-sm py-0.5 rounded bg-surface-container-high text-tertiary font-label-xs text-label-xs flex items-center gap-1 border border-tertiary/20">
                  <span className="material-symbols-outlined text-[12px]">warning</span>
                  {warningIssuesCount} Severe Imbalance
                </span>
              )}
            </div>
          )}

          {/* Quick Palette Cmd + K */}
          <button 
            type="button"
            onClick={onOpenCommandPalette}
            className="hidden lg:flex items-center gap-space-xs px-space-sm py-1 rounded bg-surface-container text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors font-code-sm text-code-sm border border-outline-variant"
          >
            <span className="material-symbols-outlined text-[14px]">terminal</span>
            <span className="font-label-xs text-label-xs text-outline">Cmd + K</span>
          </button>

          {/* New Trace CTA */}
          <button 
            type="button"
            onClick={onOpenNewAudit}
            className="flex items-center gap-space-xs px-space-md py-1 rounded bg-secondary-container hover:bg-secondary text-on-secondary font-label-md text-label-md transition-all shadow-[0_2px_8px_rgba(0,165,114,0.25)] font-semibold"
          >
            <span className="material-symbols-outlined text-[15px]">add</span>
            <span>New Trace</span>
          </button>

          {/* GitHub Link */}
          <a 
            href="https://github.com" 
            target="_blank" 
            rel="noreferrer"
            className="hidden sm:flex items-center gap-1 px-space-sm py-1 rounded bg-surface-container text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors font-code-sm text-code-sm border border-outline-variant"
          >
            <span className="material-symbols-outlined text-[15px]">code</span>
            <span className="font-label-xs text-label-xs font-mono">GitHub</span>
          </a>

          {/* User Avatar */}
          <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center shrink-0 cursor-pointer shadow-sm">
            <span className="material-symbols-outlined text-on-primary text-[18px]">person</span>
          </div>
        </div>
      </div>
    </header>
  );
}
