import React from 'react';

/**
 * Attempt to parse a Python repr string into a JS object so we can resolve
 * subscript access like record["status"] → 200.
 * Returns null if parsing fails.
 */
function tryParseRepr(repr) {
  if (typeof repr !== 'string') return null;
  try {
    // Python repr uses single quotes; JSON needs double quotes and true/false/null
    const json = repr
      .replace(/'/g, '"')
      .replace(/\bTrue\b/g, 'true')
      .replace(/\bFalse\b/g, 'false')
      .replace(/\bNone\b/g, 'null');
    return JSON.parse(json);
  } catch {
    return null;
  }
}

/**
 * Substitute runtime variable values into a condition code string.
 *
 * Strategy (applied in order so longer/more-specific patterns win):
 *  1. var["key"] or var['key']  → resolved dict lookup value, e.g. `record["status"] (200)`
 *  2. var[integer]              → resolved list/tuple lookup value
 *  3. bare var name             → annotated with its repr, e.g. `name ('Alice')`
 *
 * e.g. `record["status"] >= 400` with record="{'status': 200}"
 *   → `record["status"] (200) >= 400`
 */
function buildEvaluatedExpression(conditionCode, allVars) {
  if (!conditionCode || !allVars || Object.keys(allVars).length === 0) {
    return conditionCode;
  }

  let result = conditionCode;

  // Sort variable names longest-first to prevent partial-name collisions
  const varNames = Object.keys(allVars).sort((a, b) => b.length - a.length);

  for (const name of varNames) {
    const rawVal = allVars[name];
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const parsed = tryParseRepr(String(rawVal));

    // Pass 1: resolve subscript access  var["key"] / var['key'] / var[index]
    if (parsed !== null && typeof parsed === 'object') {
      result = result.replace(
        new RegExp(`\\b${escaped}\\s*\\[\\s*(["\']?)([^\\]"']+)\\1\\s*\\]`, 'g'),
        (match, quote, keyRaw) => {
          const key = quote ? keyRaw : (isNaN(keyRaw) ? keyRaw : Number(keyRaw));
          const resolved = Array.isArray(parsed)
            ? parsed[Number(keyRaw)]
            : parsed[keyRaw];
          if (resolved !== undefined) {
            return `${match} (${JSON.stringify(resolved)})`;
          }
          return match;
        }
      );
    }

    // Pass 2: annotate remaining bare variable names (not already annotated)
    // Only replace occurrences NOT already followed by " (…)"
    result = result.replace(
      new RegExp(`\\b${escaped}\\b(?!\\s*\\()`, 'g'),
      (match, offset) => {
        // Skip if it's part of a subscript we already annotated — check for [
        const after = result.slice(offset + match.length).trimStart();
        if (after.startsWith('[')) return match; // will be handled by pass 1
        return `${name} (${rawVal})`;
      }
    );
  }

  return result;
}

export default function BranchVisualizer({ currentStep }) {
  const branchContext = currentStep?.branch_context;

  if (!branchContext) {
    return (
      <div className="bg-surface-container-low rounded-lg p-space-md border border-surface-variant/30 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-space-xs text-outline">
          <span className="material-symbols-outlined text-[18px]">alt_route</span>
          <span className="font-headline-sm text-headline-sm">Branch Decision Evaluator</span>
        </div>
        <span className="text-outline font-label-xs text-label-xs font-mono">
          Sequential execution (No active branch on line {currentStep?.line_number || '–'})
        </span>
      </div>
    );
  }

  const {
    condition_code,
    evaluated_truth,
    taken_line,
    skipped_range,
    header_line,
  } = branchContext;

  return (
    <div className={`rounded-lg p-space-md border shadow-md flex flex-col gap-space-xs transition-all ${
      evaluated_truth
        ? 'bg-secondary-container/10 border-secondary/40'
        : 'bg-error-container/10 border-error/40'
    }`}>
      {/* Header */}
      <div className="flex items-center justify-between border-b border-surface-variant/20 pb-2">
        <div className="flex items-center gap-space-xs">
          <span className={`material-symbols-outlined text-[18px] ${
            evaluated_truth ? 'text-secondary' : 'text-error'
          }`}>
            alt_route
          </span>
          <h3 className="font-headline-sm text-headline-sm text-on-surface">
            Branch Decision Evaluator
          </h3>
          <span className="font-code-sm text-code-sm text-outline font-mono">
            `Line {header_line}`
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <span className={`px-2 py-0.5 rounded font-label-xs text-label-xs font-mono font-bold flex items-center gap-1 ${
            evaluated_truth
              ? 'bg-secondary text-on-secondary shadow-sm'
              : 'bg-error text-on-error shadow-sm'
          }`}>
            <span className="material-symbols-outlined text-[13px]">
              {evaluated_truth ? 'check_circle' : 'cancel'}
            </span>
            {evaluated_truth ? 'TRUE / TAKEN' : 'FALSE / SKIPPED'}
          </span>
        </div>
      </div>

      {/* Condition Expression */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-space-sm items-start bg-surface-container-lowest p-space-sm rounded border border-surface-variant/30 font-mono min-w-0">
        <div className="md:col-span-7 flex flex-col gap-0.5 min-w-0">
          <span className="text-[10px] text-outline uppercase tracking-wider">
            EVALUATED EXPRESSION
          </span>
          <div className="truncate max-w-full font-mono text-xs text-primary bg-surface-container px-2 py-1 rounded border border-outline-variant/30 overflow-hidden">
            {buildEvaluatedExpression(condition_code, currentStep?.all_variables)}
          </div>
          {buildEvaluatedExpression(condition_code, currentStep?.all_variables) !== condition_code && (
            <span className="text-[10px] text-outline font-mono truncate max-w-full">
              raw: {condition_code}
            </span>
          )}
        </div>

        <div className="md:col-span-5 flex flex-col gap-0.5">
          <span className="text-[10px] text-outline uppercase tracking-wider">
            RUNTIME RESULT
          </span>
          <div className={`font-code-sm text-code-sm px-2 py-1 rounded border font-bold ${
            evaluated_truth
              ? 'bg-secondary/10 border-secondary/30 text-secondary'
              : 'bg-error/10 border-error/30 text-error'
          }`}>
            {evaluated_truth ? 'True' : 'False'}
          </div>
        </div>
      </div>

      {/* Execution Path Guidance */}
      <div className="flex items-center justify-between text-body-sm font-label-xs text-label-xs pt-1">
        <div className="flex items-center gap-1 text-on-surface">
          <span className="material-symbols-outlined text-[14px] text-primary">arrow_forward</span>
          <span>Flow enters: <strong className="text-primary font-mono font-semibold">Line {taken_line}</strong></span>
        </div>

        {skipped_range && (
          <div className="flex items-center gap-1 text-error font-mono">
            <span className="material-symbols-outlined text-[14px]">block</span>
            <span>
              Dimmed in viewer:{' '}
              <strong className="underline">
                Lines {skipped_range[0]}..{skipped_range[1]}
              </strong>
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
