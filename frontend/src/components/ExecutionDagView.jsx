import React from 'react';
import { DAG_NODES } from '../data/pipelineData';

export default function ExecutionDagView({
  hasLeakage,
  currentStep,
  onSelectNode
}) {
  return (
    <div className="flex flex-col bg-surface-container-lowest rounded-lg p-space-lg shadow-lg border border-surface-variant/30 min-h-[540px]">
      <div className="flex items-center justify-between pb-space-md border-b border-surface-variant/20 mb-space-lg">
        <div className="flex items-center gap-space-sm">
          <span className="material-symbols-outlined text-[20px] text-primary">hub</span>
          <div>
            <h2 className="font-headline-sm text-headline-sm text-on-surface">Execution Directed Acyclic Graph (DAG)</h2>
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              Telemetry tensor flow map showing data transformations, holdout splitting, and leakage boundaries.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-space-sm text-label-xs font-mono">
          <span className="flex items-center gap-1 text-secondary">
            <span className="w-2 h-2 rounded-full bg-secondary" /> Valid Tensor
          </span>
          <span className="flex items-center gap-1 text-error">
            <span className="w-2 h-2 rounded-full bg-error" /> Contamination Vector
          </span>
          <span className="flex items-center gap-1 text-tertiary">
            <span className="w-2 h-2 rounded-full bg-tertiary" /> Class Imbalance Skew
          </span>
        </div>
      </div>

      {/* Visual DAG Nodes Container */}
      <div className="flex flex-wrap items-center justify-center gap-8 py-8 relative">
        {DAG_NODES.map((node, index) => {
          const isLeakageNode = node.id === '3' && hasLeakage;
          const isResolvedNode = node.id === '3' && !hasLeakage;

          let statusBg = 'border-surface-variant';
          let badgeColor = 'bg-surface-container text-outline';

          if (isLeakageNode) {
            statusBg = 'border-error shadow-[0_0_15px_rgba(244,63,94,0.3)] ring-1 ring-error';
            badgeColor = 'bg-error-container text-on-error-container';
          } else if (node.status === 'warning') {
            statusBg = 'border-tertiary shadow-[0_0_12px_rgba(213,195,255,0.2)]';
            badgeColor = 'bg-tertiary-container text-on-tertiary-container';
          } else if (node.status === 'pass' || isResolvedNode) {
            statusBg = 'border-secondary/40 hover:border-secondary';
            badgeColor = 'bg-secondary-container/20 text-secondary';
          }

          return (
            <React.Fragment key={node.id}>
              {/* Node Card matching Stitch specifications */}
              <div
                onClick={() => onSelectNode && onSelectNode(node)}
                className={`relative w-64 bg-surface-container-low rounded p-0 border transition-all cursor-pointer hover:-translate-y-1 ${statusBg}`}
              >
                {/* Left Pin Connection Handle */}
                {index > 0 && (
                  <div className="absolute -left-1.5 top-1/2 -translate-y-1/2 w-3 h-3 rounded-sm bg-surface-container-high border border-primary flex items-center justify-center" />
                )}

                {/* Right Pin Connection Handle */}
                {index < DAG_NODES.length - 1 && (
                  <div className="absolute -right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 rounded-sm bg-surface-container-high border border-primary flex items-center justify-center" />
                )}

                {/* Node Header */}
                <div className="bg-surface-container px-3 py-2 border-b border-surface-variant/30 flex items-center justify-between">
                  <span className="font-code-sm text-code-sm text-primary font-bold font-mono truncate">
                    {node.title}
                  </span>
                  <span className="text-[10px] font-mono text-outline">Cell [{node.cell}]</span>
                </div>

                {/* Node Body */}
                <div className="p-3 flex flex-col gap-1.5">
                  <div className="flex items-center justify-between text-label-xs font-mono">
                    <span className="text-outline">TENSOR SHAPE:</span>
                    <span className="text-on-surface font-semibold">{node.shape}</span>
                  </div>

                  {isLeakageNode ? (
                    <div className="bg-error-container/20 text-error p-1.5 rounded text-[11px] font-mono flex items-center gap-1 border border-error/30 mt-1">
                      <span className="material-symbols-outlined text-[13px]">warning</span>
                      <span>LEAKAGE: Holdout Contamination</span>
                    </div>
                  ) : isResolvedNode ? (
                    <div className="bg-secondary-container/20 text-secondary p-1.5 rounded text-[11px] font-mono flex items-center gap-1 border border-secondary/30 mt-1">
                      <span className="material-symbols-outlined text-[13px]">verified</span>
                      <span>Zero Contamination Confirmed</span>
                    </div>
                  ) : node.error ? (
                    <div className="bg-tertiary-container/20 text-tertiary p-1.5 rounded text-[11px] font-mono flex items-center gap-1 border border-tertiary/30 mt-1">
                      <span className="material-symbols-outlined text-[13px]">info</span>
                      <span>{node.error}</span>
                    </div>
                  ) : (
                    <div className="text-secondary text-[11px] font-mono flex items-center gap-1 mt-1">
                      <span className="material-symbols-outlined text-[13px]">check</span>
                      <span>Assertion Verified</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Connecting Flow Arrow */}
              {index < DAG_NODES.length - 1 && (
                <div className="hidden md:flex items-center text-outline">
                  <span className="material-symbols-outlined text-[20px] text-primary/70">
                    arrow_forward
                  </span>
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>

      {/* DAG Footnote */}
      <div className="mt-auto pt-4 border-t border-surface-variant/20 flex items-center justify-between text-label-xs font-mono text-outline">
        <span>Execution Graph auto-compiled from AST parser & sys.settrace timeline registers</span>
        <span className="text-primary">6 Pipeline Nodes • 2 Sandboxed Verifications</span>
      </div>
    </div>
  );
}
