import React, { useState } from 'react';
import { SAFE_INSERTION_POINTS, TEAMMATE_HANDOFF_SUMMARY } from '../data/logicLensData';

export default function TeammateHandoffDrawer({
  currentStep,
  onJumpToSafeHook
}) {
  const [activeTab, setActiveTab] = useState('intent'); // 'intent' | 'safe_hook' | 'summary'
  const [copiedHook, setCopiedHook] = useState(false);

  const bobExplanation = currentStep?.bob_explanation || {
    intent_summary: "Analyzing runtime execution frame...",
    detailed_explanation: "Deterministic trace state captured by sys.settrace.",
    teammate_logic_note: "Reviewing variable mutation lifecycles.",
    safe_to_extend: false,
    continuation_tip: "Step through execution to inspect intent."
  };

  const safeHook = SAFE_INSERTION_POINTS[0];

  const handleCopyHook = () => {
    if (safeHook?.boilerplate_hook) {
      navigator.clipboard.writeText(safeHook.boilerplate_hook);
      setCopiedHook(true);
      setTimeout(() => setCopiedHook(false), 2500);
    }
  };

  return (
    <div className="bg-surface-container-low rounded-lg p-space-md border border-surface-variant/30 flex flex-col gap-space-sm shadow-md">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-surface-variant/20 pb-2">
        <div className="flex items-center gap-space-xs">
          <span className="material-symbols-outlined text-[18px] text-tertiary">
            psychology
          </span>
          <h3 className="font-headline-sm text-headline-sm text-on-surface">
            Teammate Handoff & Intent
          </h3>
        </div>

        <span className="px-space-xs py-0.5 rounded bg-tertiary-container text-on-tertiary-container font-label-xs text-label-xs font-semibold font-mono">
          BOB AI COPILOT
        </span>
      </div>

      {/* Segmented Navigation Tabs */}
      <div className="flex items-center gap-1 bg-surface-container-lowest p-1 rounded-lg border border-surface-variant/30 font-label-md text-label-md">
        <button
          type="button"
          onClick={() => setActiveTab('intent')}
          className={`flex-1 py-1 px-2 rounded transition-all text-center flex items-center justify-center gap-1 font-mono ${
            activeTab === 'intent'
              ? 'bg-surface-container-high text-primary font-semibold shadow-sm'
              : 'text-outline hover:text-on-surface'
          }`}
        >
          <span className="material-symbols-outlined text-[14px]">lightbulb</span>
          <span>Line Intent</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('safe_hook')}
          className={`flex-1 py-1 px-2 rounded transition-all text-center flex items-center justify-center gap-1 font-mono ${
            activeTab === 'safe_hook'
              ? 'bg-surface-container-high text-secondary font-semibold shadow-sm'
              : 'text-outline hover:text-on-surface'
          }`}
        >
          <span className="material-symbols-outlined text-[14px]">star</span>
          <span>Safe Hooks</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('summary')}
          className={`flex-1 py-1 px-2 rounded transition-all text-center flex items-center justify-center gap-1 font-mono ${
            activeTab === 'summary'
              ? 'bg-surface-container-high text-tertiary font-semibold shadow-sm'
              : 'text-outline hover:text-on-surface'
          }`}
        >
          <span className="material-symbols-outlined text-[14px]">description</span>
          <span>Handoff Doc</span>
        </button>
      </div>

      {/* TAB 1: LINE-BY-LINE CONTEXTUAL INTENT */}
      {activeTab === 'intent' && (
        <div className="flex flex-col gap-space-sm pt-1">
          {/* Target Line Breadcrumb */}
          <div className="flex items-center justify-between font-label-xs text-label-xs bg-surface-container px-2 py-1 rounded border border-surface-variant/30">
            <span className="text-outline font-mono">
              TARGET LINE: <strong className="text-on-surface">Line {currentStep?.line_number || '-'}</strong>
            </span>
            <span className={`px-1.5 py-0.5 rounded font-mono font-semibold ${
              bobExplanation.safe_to_extend
                ? 'bg-secondary/20 text-secondary'
                : 'bg-surface-container-high text-outline'
            }`}>
              {bobExplanation.safe_to_extend ? '★ SAFE TO EXTEND' : 'INTERNAL STEP'}
            </span>
          </div>

          {/* Primary Intent Summary */}
          <div className="bg-surface-container-lowest p-space-sm rounded-lg border border-surface-variant/30 flex flex-col gap-1">
            <span className="text-[10px] text-tertiary uppercase tracking-wider font-mono font-bold flex items-center gap-1">
              <span className="material-symbols-outlined text-[13px]">lightbulb</span>
              Teammate Intent:
            </span>
            <p className="font-body-md text-body-md text-on-surface leading-relaxed">
              &quot;{bobExplanation.intent_summary}&quot;
            </p>
          </div>

          {/* Detailed Mechanics */}
          <div className="bg-surface-container-lowest p-space-sm rounded-lg border border-surface-variant/30 flex flex-col gap-1">
            <span className="text-[10px] text-primary uppercase tracking-wider font-mono font-bold flex items-center gap-1">
              <span className="material-symbols-outlined text-[13px]">tune</span>
              Mechanical Breakdown:
            </span>
            <p className="font-body-sm text-body-sm text-on-surface-variant leading-relaxed">
              {bobExplanation.detailed_explanation}
            </p>
          </div>

          {/* Teammate Logic Pattern */}
          <div className="bg-surface-container-lowest p-space-sm rounded-lg border border-surface-variant/30 flex flex-col gap-1">
            <span className="text-[10px] text-outline uppercase tracking-wider font-mono font-bold flex items-center gap-1">
              <span className="material-symbols-outlined text-[13px]">architecture</span>
              Alex&apos;s Design Pattern:
            </span>
            <p className="font-body-sm text-body-sm text-on-surface leading-relaxed">
              {bobExplanation.teammate_logic_note}
            </p>
          </div>

          {/* Safe Continuation Tip */}
          <div className="bg-secondary-container/15 p-space-sm rounded-lg border border-secondary/30 flex flex-col gap-1">
            <span className="text-[10px] text-secondary uppercase tracking-wider font-mono font-bold flex items-center gap-1">
              <span className="material-symbols-outlined text-[13px]">handshake</span>
              Where To Continue Advice:
            </span>
            <p className="font-body-sm text-body-sm text-on-surface leading-relaxed">
              {bobExplanation.continuation_tip}
            </p>
          </div>
        </div>
      )}

      {/* TAB 2: SAFE INSERTION PINS */}
      {activeTab === 'safe_hook' && (
        <div className="flex flex-col gap-space-sm pt-1">
          <div className="bg-surface-container-lowest p-space-sm rounded-lg border border-secondary/40 flex flex-col gap-2 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-secondary font-mono font-bold text-headline-sm">
                <span className="material-symbols-outlined text-[18px]">verified</span>
                <span>Safe Insertion Point: Line {safeHook.line_number}</span>
              </div>
              <span className="px-2 py-0.5 rounded bg-secondary text-on-secondary font-label-xs text-label-xs font-bold font-mono uppercase">
                High Confidence
              </span>
            </div>

            <p className="font-body-sm text-body-sm text-on-surface leading-relaxed">
              {safeHook.reason}
            </p>

            <div className="flex items-center justify-between bg-surface-container p-2 rounded border border-surface-variant/30 font-mono text-label-xs">
              <span className="text-outline">TARGET ACCUMULATOR:</span>
              <strong className="text-primary">{safeHook.target_variable}</strong>
            </div>

            {/* Boilerplate Hook Box */}
            <div className="flex flex-col gap-1 mt-1">
              <div className="flex items-center justify-between text-[11px] font-mono text-outline">
                <span>READY-TO-USE EXTENSION SNIPPET:</span>
                <span className="text-secondary">Safe Invariant Guarantee</span>
              </div>

              <pre className="bg-surface-container-high p-2.5 rounded font-mono text-code-sm text-on-surface overflow-x-auto border border-outline-variant/30 leading-snug">
                {safeHook.boilerplate_hook}
              </pre>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={handleCopyHook}
                className="flex-1 flex items-center justify-center gap-1.5 bg-secondary hover:bg-secondary-fixed text-on-secondary py-1.5 px-3 rounded font-label-md text-label-md transition-all shadow-sm font-semibold"
              >
                <span className="material-symbols-outlined text-[16px]">
                  {copiedHook ? 'check' : 'content_copy'}
                </span>
                <span>{copiedHook ? 'Copied to Clipboard!' : 'Copy Recommended Hook Template'}</span>
              </button>

              <button
                type="button"
                onClick={() => onJumpToSafeHook(safeHook.line_number)}
                className="flex items-center gap-1 bg-surface-container hover:bg-surface-container-high text-primary py-1.5 px-3 rounded font-label-md text-label-md border border-primary/30 transition-all font-mono"
              >
                <span className="material-symbols-outlined text-[16px]">pin_drop</span>
                <span>Jump To Line 25</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: TEAMMATE HANDOFF SUMMARY */}
      {activeTab === 'summary' && (
        <div className="flex flex-col gap-space-sm pt-1 max-h-[460px] overflow-y-auto pr-1">
          {/* Overall Purpose */}
          <div className="bg-surface-container-lowest p-space-sm rounded-lg border border-surface-variant/30 flex flex-col gap-1">
            <span className="text-[10px] text-tertiary uppercase tracking-wider font-mono font-bold">
              Script Workflow Purpose
            </span>
            <p className="font-body-sm text-body-sm text-on-surface leading-relaxed">
              {TEAMMATE_HANDOFF_SUMMARY.overall_purpose}
            </p>
          </div>

          {/* Key Data Structures Ledger */}
          <div className="bg-surface-container-lowest p-space-sm rounded-lg border border-surface-variant/30 flex flex-col gap-2">
            <span className="text-[10px] text-primary uppercase tracking-wider font-mono font-bold">
              Data Structure Contracts
            </span>
            <div className="flex flex-col gap-1.5 font-mono text-code-sm">
              {TEAMMATE_HANDOFF_SUMMARY.key_data_structures.map((item) => (
                <div key={item.name} className="p-1.5 rounded bg-surface-container border border-surface-variant/20 flex flex-col gap-0.5">
                  <div className="flex items-center justify-between">
                    <strong className="text-secondary">{item.name}</strong>
                    <span className="text-[10px] text-outline">{item.final_state_summary}</span>
                  </div>
                  <span className="text-[11px] text-on-surface-variant font-sans">{item.role}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Safe Continuation Strategy */}
          <div className="bg-surface-container-lowest p-space-sm rounded-lg border border-surface-variant/30 flex flex-col gap-1">
            <span className="text-[10px] text-secondary uppercase tracking-wider font-mono font-bold">
              Continuation Strategy
            </span>
            <p className="font-body-sm text-body-sm text-on-surface leading-relaxed">
              {TEAMMATE_HANDOFF_SUMMARY.safe_continuation_strategy}
            </p>
          </div>

          {/* Cautions */}
          <div className="bg-surface-container-lowest p-space-sm rounded-lg border border-error/30 flex flex-col gap-1.5">
            <span className="text-[10px] text-error uppercase tracking-wider font-mono font-bold flex items-center gap-1">
              <span className="material-symbols-outlined text-[13px]">warning</span>
              Teammate Invariants to Preserve:
            </span>
            <ul className="list-disc pl-4 text-body-sm text-on-surface space-y-1">
              {TEAMMATE_HANDOFF_SUMMARY.cautions_for_teammate.map((caution, idx) => (
                <li key={idx}>{caution}</li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
