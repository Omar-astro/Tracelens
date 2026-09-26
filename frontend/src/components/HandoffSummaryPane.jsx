import React, { useState, useCallback } from 'react';
import { postHandoffSummary, TraceApiError } from '../api/traceClient';

/**
 * HandoffSummaryPane — Stage 14: Teammate Handoff Summary (Appendix B.2).
 *
 * Available in BOTH modes. Calls POST /api/handoff-summary once and renders the
 * four Appendix B.2 fields:
 *   overall_purpose, key_data_structures, safe_continuation_strategy,
 *   cautions_for_teammate
 *
 * The call is triggered by an explicit button (not on mount) so the demo path is
 * deterministic — no surprise latency or spinner while the user is stepping
 * through the trace. The result is cached one-per-trace by the parent.
 */
export default function HandoffSummaryPane({
  code = '',
  safeInsertionPoints = [],
  terminalVariables = {},
  summary = null,
  onSummaryGenerated,
}) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleGenerate = useCallback(async () => {
    if (!code.trim()) {
      setError('No traced source available to summarise.');
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const result = await postHandoffSummary({
        code,
        safeInsertionPoints,
        terminalVariables,
      });
      if (onSummaryGenerated) onSummaryGenerated(result);
    } catch (err) {
      setError(
        err instanceof TraceApiError
          ? err.message
          : 'Unexpected error generating the handoff summary.'
      );
    } finally {
      setIsLoading(false);
    }
  }, [code, safeInsertionPoints, terminalVariables, onSummaryGenerated]);

  // ── Idle state ───────────────────────────────────────────────────────────
  if (!summary) {
    return (
      <div className="flex flex-col h-full min-h-0">
        <Header />
        <div className="flex-1 flex flex-col items-center justify-center gap-3 p-5 text-center min-h-0">
          <span className="text-2xl" aria-hidden="true">
            📋
          </span>
          <span className="text-xs font-mono font-semibold text-slate-300">
            No handoff summary yet
          </span>
          <span className="text-[11px] text-slate-500 leading-relaxed max-w-[240px]">
            Generates a senior-lead handoff guide from the completed trace: the script's purpose, its
            key data structures, where to safely continue the work, and what to watch out for.
          </span>

          <button
            type="button"
            onClick={handleGenerate}
            disabled={isLoading || !code.trim()}
            className="mt-1 px-3.5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-semibold transition-colors cursor-pointer inline-flex items-center gap-1.5"
          >
            {isLoading ? (
              <>
                <span className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                <span>Generating…</span>
              </>
            ) : (
              <>
                <span>✦</span>
                <span>Generate Handoff Summary</span>
              </>
            )}
          </button>

          {!code.trim() && (
            <span className="text-[10px] font-mono text-slate-600">
              Trace a script first to enable this.
            </span>
          )}

          {error && (
            <div className="mt-2 w-full rounded-lg border border-red-500/30 bg-red-950/30 p-2.5 text-left">
              <span className="text-[11px] text-red-300 leading-relaxed">{error}</span>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Result state ──────────────────────────────────────────────────────────
  const structures = Array.isArray(summary.key_data_structures) ? summary.key_data_structures : [];
  const cautions = Array.isArray(summary.cautions_for_teammate) ? summary.cautions_for_teammate : [];

  return (
    <div className="flex flex-col h-full min-h-0">
      <Header />

      {/* Regenerate / status bar */}
      <div className="shrink-0 flex items-center justify-between gap-2 px-4 py-1.5 bg-slate-900/60 border-b border-slate-800">
        <span className="text-[10px] font-mono text-slate-500 inline-flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
          Appendix B.2 summary
        </span>
        <button
          type="button"
          onClick={handleGenerate}
          disabled={isLoading}
          className="px-2 py-0.5 rounded text-[11px] font-mono text-slate-400 hover:text-slate-100 hover:bg-slate-700/60 transition-colors cursor-pointer disabled:opacity-50"
        >
          {isLoading ? 'Regenerating…' : '↻ Regenerate'}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3.5 min-h-0">
        {error && (
          <div className="rounded-lg border border-red-500/30 bg-red-950/30 p-2.5">
            <span className="text-[11px] text-red-300 leading-relaxed">{error}</span>
          </div>
        )}

        {/* Overall purpose */}
        <Section title="Overall purpose" accent="indigo">
          <p className="text-[11px] text-slate-300 leading-relaxed">
            {summary.overall_purpose || '—'}
          </p>
        </Section>

        {/* Key data structures */}
        <Section title={`Key data structures (${structures.length})`} accent="cyan">
          {structures.length === 0 ? (
            <p className="text-[11px] text-slate-500">No terminal structures reported.</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {structures.map((entry, idx) => (
                <li
                  key={`${entry.name}-${idx}`}
                  className="rounded-lg border border-slate-800 bg-slate-950/60 p-2.5"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[11px] font-mono font-bold text-cyan-300">
                      {entry.name}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed mb-1">{entry.role}</p>
                  <p className="text-[10px] font-mono text-slate-500 leading-relaxed">
                    → {entry.final_state_summary}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Section>

        {/* Safe continuation strategy */}
        <Section title="Safe continuation strategy" accent="emerald">
          <p className="text-[11px] text-slate-300 leading-relaxed">
            {summary.safe_continuation_strategy || '—'}
          </p>
        </Section>

        {/* Cautions */}
        <Section title={`Cautions for the next developer (${cautions.length})`} accent="amber">
          {cautions.length === 0 ? (
            <p className="text-[11px] text-slate-500">No cautions reported.</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {cautions.map((caution, idx) => (
                <li key={idx} className="flex items-start gap-2">
                  <span className="text-amber-400 font-bold text-[11px] leading-5 shrink-0" aria-hidden="true">
                    ⚠
                  </span>
                  <span className="text-[11px] text-slate-400 leading-relaxed">{caution}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </div>
  );
}

/* ── Sub-components ─────────────────────────────────────────────────────── */

function Header() {
  return (
    <div className="shrink-0 flex items-center justify-between border-b border-slate-800 px-4 pt-2.5 pb-2">
      <div className="flex items-center gap-2">
        <span className="text-indigo-400 font-bold text-base leading-none" aria-hidden="true">
          📋
        </span>
        <span className="text-xs font-semibold text-slate-200 font-mono">Handoff Summary</span>
      </div>
    </div>
  );
}

const ACCENTS = {
  indigo: 'text-indigo-300/90 border-l-indigo-400/60',
  cyan: 'text-cyan-300/90 border-l-cyan-400/60',
  emerald: 'text-emerald-300/90 border-l-emerald-400/60',
  amber: 'text-amber-300/90 border-l-amber-400/60',
};

function Section({ title, accent = 'indigo', children }) {
  return (
    <section className={`border-l-2 pl-2.5 ${ACCENTS[accent] ?? ACCENTS.indigo}`}>
      <h4 className="text-[10px] font-mono uppercase tracking-wider mb-1.5">{title}</h4>
      {children}
    </section>
  );
}
