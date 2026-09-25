import React from 'react';

export default function TensorWatcherView({ currentStep }) {
  const registers = [
    { name: 'df', type: 'pandas.DataFrame', shape: '(1000, 26)', dtypes: 'float64 (24), int32 (1), object (1)', memory: '208.4 KB', status: 'In-Scope' },
    { name: 'X', type: 'pandas.DataFrame', shape: '(1000, 24)', dtypes: 'float64 (24)', memory: '192.4 KB', status: 'In-Scope' },
    { name: 'X_scaled', type: 'numpy.ndarray', shape: '(1000, 24)', dtypes: 'float64', memory: '192.4 KB', status: 'Contaminated' },
    { name: 'y', type: 'pandas.Series', shape: '(1000,)', dtypes: 'int32', memory: '4.0 KB', status: 'Imbalanced (92/8)' },
    { name: 'X_train', type: 'numpy.ndarray', shape: '(800, 24)', dtypes: 'float64', memory: '153.6 KB', status: 'In-Scope' },
    { name: 'X_test', type: 'numpy.ndarray', shape: '(200, 24)', dtypes: 'float64', memory: '38.4 KB', status: 'Holdout' },
    { name: 'model', type: 'LogisticRegression', shape: 'Weights: (24,)', dtypes: 'solver=lbfgs', memory: '1.2 KB', status: 'Unweighted' }
  ];

  return (
    <div className="flex flex-col bg-surface-container-lowest rounded-lg p-space-lg shadow-lg border border-surface-variant/30 min-h-[540px] gap-space-md">
      <div className="flex items-center justify-between pb-space-md border-b border-surface-variant/20">
        <div className="flex items-center gap-space-sm">
          <span className="material-symbols-outlined text-[20px] text-primary">data_object</span>
          <div>
            <h2 className="font-headline-sm text-headline-sm text-on-surface">Tensor & Variable Memory Watcher</h2>
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              Live Python heap register table tracked per execution line event.
            </p>
          </div>
        </div>

        <span className="font-mono text-code-sm text-primary bg-surface-container px-space-sm py-1 rounded border border-outline-variant/30">
          HEAP USAGE: {currentStep?.memory || '192.4 KB'}
        </span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded border border-surface-variant/30">
        <table className="w-full text-left font-mono text-code-sm">
          <thead className="bg-surface-container-low text-outline text-[11px] uppercase border-b border-surface-variant/30">
            <tr>
              <th className="px-4 py-2">Identifier</th>
              <th className="px-4 py-2">Data Structure</th>
              <th className="px-4 py-2">Dimensions (Shape)</th>
              <th className="px-4 py-2">Dtypes</th>
              <th className="px-4 py-2">RAM Footprint</th>
              <th className="px-4 py-2">Audit Tag</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-variant/20 bg-surface-container-lowest">
            {registers.map((reg) => {
              const isContaminated = reg.status === 'Contaminated';
              const isImbalanced = reg.status.includes('Imbalanced');

              return (
                <tr key={reg.name} className="hover:bg-surface-container/40 transition-colors">
                  <td className="px-4 py-2.5 font-bold text-primary">{reg.name}</td>
                  <td className="px-4 py-2.5 text-on-surface-variant">{reg.type}</td>
                  <td className="px-4 py-2.5 text-secondary">{reg.shape}</td>
                  <td className="px-4 py-2.5 text-outline text-xs">{reg.dtypes}</td>
                  <td className="px-4 py-2.5 text-on-surface">{reg.memory}</td>
                  <td className="px-4 py-2.5">
                    <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold ${
                      isContaminated 
                        ? 'bg-error-container/20 text-error border border-error/30' 
                        : isImbalanced
                          ? 'bg-tertiary-container/20 text-tertiary border border-tertiary/30'
                          : 'bg-secondary-container/20 text-secondary'
                    }`}>
                      {reg.status}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-auto pt-4 border-t border-surface-variant/20 flex items-center justify-between text-label-xs font-mono text-outline">
        <span>sys.settrace captures DataFrame memory footprints, column types, and missing value rates without modifying user code</span>
        <span className="text-secondary">All 7 registers verified</span>
      </div>
    </div>
  );
}
