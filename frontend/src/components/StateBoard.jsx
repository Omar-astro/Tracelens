import React, { useState } from 'react';

export default function StateBoard({ currentStep }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedVar, setExpandedVar] = useState(null);

  const deltas = currentStep?.variable_deltas || {};
  const deltaKeys = Object.keys(deltas);

  const allVars = currentStep?.all_variables || {};
  const varEntries = Object.entries(allVars).filter(([key]) =>
    key.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="bg-surface-container-low rounded-lg p-space-md border border-surface-variant/30 flex flex-col gap-space-md shadow-md">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-surface-variant/20 pb-2">
        <div className="flex items-center gap-space-xs">
          <span className="material-symbols-outlined text-[18px] text-secondary">
            memory
          </span>
          <h3 className="font-headline-sm text-headline-sm text-on-surface">
            State & Mutation Inspector
          </h3>
        </div>

        <span className="px-space-xs py-0.5 rounded bg-surface-container-high text-outline font-label-xs text-label-xs font-mono">
          STEP #{currentStep?.step_id || 1} DELTAS
        </span>
      </div>

      {/* TOP SECTION: Variable Deltas this Step */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between font-label-xs text-label-xs text-outline font-mono">
          <span className="uppercase tracking-wider">Mutations On This Step ({deltaKeys.length})</span>
          <span>Diff Engine</span>
        </div>

        {deltaKeys.length === 0 ? (
          <div className="bg-surface-container-lowest p-space-sm rounded border border-surface-variant/20 text-outline text-body-sm italic flex items-center gap-1.5">
            <span className="material-symbols-outlined text-[15px]">info</span>
            <span>No memory mutations on this step (Conditional test or pass-through).</span>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2">
            {deltaKeys.map((key) => {
              const delta = deltas[key];
              const isCreated = delta.action === 'created';
              const isMutated = delta.action === 'mutated';

              return (
                <div
                  key={key}
                  className={`p-2.5 rounded-lg border flex flex-col gap-1 font-mono transition-all min-w-0 overflow-hidden ${
                    isCreated
                      ? 'bg-secondary/10 border-secondary/40'
                      : isMutated
                        ? 'bg-primary/10 border-primary/40'
                        : 'bg-error/10 border-error/40'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                        isCreated
                          ? 'bg-secondary text-on-secondary'
                          : isMutated
                            ? 'bg-primary text-on-primary'
                            : 'bg-error text-on-error'
                      }`}>
                        {delta.action}
                      </span>
                      <strong className="text-on-surface text-code-md">{delta.var_name}</strong>
                      <span className="text-outline text-[11px]">({delta.type_name})</span>
                    </div>

                    {delta.metadata?.delta && (
                      <span className="text-[11px] font-bold text-secondary bg-secondary/20 px-1 rounded">
                        {delta.metadata.delta}
                      </span>
                    )}
                  </div>

                  {/* Value representation */}
                  <div className="bg-surface-container-lowest/90 p-1.5 rounded border border-surface-variant/30 text-code-sm text-on-surface min-w-0 overflow-hidden">
                    {isMutated && delta.old_value !== undefined ? (
                      <div className="flex items-start gap-2 flex-wrap min-w-0">
                        <span className="line-through text-outline font-mono text-xs break-all whitespace-pre-wrap max-h-20 overflow-y-auto min-w-0">
                          {typeof delta.old_value === 'object' ? JSON.stringify(delta.old_value) : String(delta.old_value)}
                        </span>
                        <span className="text-primary font-bold shrink-0">➔</span>
                        <span className="text-secondary font-semibold font-mono text-xs break-all whitespace-pre-wrap max-h-20 overflow-y-auto min-w-0">
                          {delta.repr_str || (typeof delta.new_value === 'object' ? JSON.stringify(delta.new_value) : String(delta.new_value))}
                        </span>
                      </div>
                    ) : (
                      <div className="text-secondary font-mono text-xs break-all whitespace-pre-wrap max-h-20 overflow-y-auto min-w-0">
                        {delta.repr_str || (typeof delta.new_value === 'object' ? JSON.stringify(delta.new_value) : String(delta.new_value))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* BOTTOM SECTION: Active Scope Memory Snapshot */}
      <div className="flex flex-col gap-1.5 pt-2 border-t border-surface-variant/20">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <span className="font-label-xs text-label-xs uppercase tracking-wider text-outline font-mono">
            Active Scope Snapshot ({varEntries.length} In Scope)
          </span>

          {/* Quick Search */}
          <div className="relative">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Filter variables..."
              className="bg-surface-container-lowest text-on-surface font-mono text-[11px] px-2 py-0.5 rounded border border-surface-variant/40 focus:outline-none focus:border-primary w-36"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute right-1 top-1/2 -translate-y-1/2 text-outline hover:text-on-surface text-[10px]"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Variable Snapshot Grid / Table */}
        <div className="bg-surface-container-lowest rounded-lg border border-surface-variant/30 overflow-hidden font-mono text-code-sm max-h-48 overflow-y-auto">
          <div className="grid grid-cols-12 bg-surface-container-high px-2 py-1 text-[11px] text-outline font-semibold border-b border-surface-variant/30">
            <span className="col-span-4">IDENTIFIER</span>
            <span className="col-span-8">MEASURED RUNTIME VALUE</span>
          </div>

          {varEntries.length === 0 ? (
            <div className="p-2 text-outline text-[12px] italic text-center">
              No matching variables in current frame scope.
            </div>
          ) : (
            varEntries.map(([key, val]) => (
              <div
                key={key}
                onClick={() => setExpandedVar(expandedVar === key ? null : key)}
                className="grid grid-cols-12 px-2 py-1.5 border-b border-surface-variant/15 hover:bg-surface-container/40 transition-colors items-start cursor-pointer min-w-0"
              >
                <div className="col-span-4 flex items-center gap-1 font-semibold text-primary truncate min-w-0">
                  <span className="material-symbols-outlined text-[12px] text-outline shrink-0">data_object</span>
                  <span className="truncate">{key}</span>
                </div>
                <div className="col-span-8 font-mono text-xs break-all whitespace-pre-wrap max-h-20 overflow-y-auto min-w-0 text-on-surface-variant">
                  {val}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
