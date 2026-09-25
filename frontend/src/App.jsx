import React, { useState } from 'react';
import Navbar from './components/Navbar';
import Sidebar from './components/Sidebar';
import InputPanel from './components/InputPanel';
import TracePlayer from './components/TracePlayer';
import ExecutionDagView from './components/ExecutionDagView';
import LeakageInspectorView from './components/LeakageInspectorView';
import TensorWatcherView from './components/TensorWatcherView';
import BobAiAuditPanel from './components/BobAiAuditPanel';
import NewAuditModal from './components/NewAuditModal';
import CommandPalette from './components/CommandPalette';
import { 
  SAMPLE_CODE_DEFAULT, 
  SAMPLE_CODE_REMEDIATED, 
  INITIAL_TRACE_STEPS 
} from './data/pipelineData';
import { SAMPLE_CODE_IMBALANCE } from './components/InputPanel';

export default function App() {
  const [mainMode, setMainMode] = useState('trace'); // 'trace' | 'input'
  const [activeView, setActiveView] = useState('code-auditor');
  const [currentStepIndex, setCurrentStepIndex] = useState(3); // Step 14 (train_test_split)
  const [isPlaying, setIsPlaying] = useState(false);
  const [code, setCode] = useState(SAMPLE_CODE_DEFAULT);
  const [hasLeakage, setHasLeakage] = useState(true);
  const [isRemediated, setIsRemediated] = useState(false);
  const [currentFileName, setCurrentFileName] = useState('churn_prediction.ipynb');
  const [selectedLineNumber, setSelectedLineNumber] = useState(14);
  const [isNewAuditModalOpen, setIsNewAuditModalOpen] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isSandboxExecuting, setIsSandboxExecuting] = useState(false);
  const [activeScenarioId, setActiveScenarioId] = useState('leakage'); // 'leakage' | 'imbalance' | 'clean'

  const [assertions, setAssertions] = useState({
    trainTestSplit: 'FAIL',
    fitVsTransform: 'FAIL',
    weightNormBounds: 'PASS'
  });

  const traceSteps = INITIAL_TRACE_STEPS;

  // Apply Remediation Fix
  const handleApplyFix = () => {
    setCode(SAMPLE_CODE_REMEDIATED);
    setHasLeakage(false);
    setIsRemediated(true);
    setActiveScenarioId('clean');
    setAssertions({
      trainTestSplit: 'PASS',
      fitVsTransform: 'PASS',
      weightNormBounds: 'PASS'
    });
  };

  // Re-run Sandbox
  const handleRerunSandbox = () => {
    setIsSandboxExecuting(true);
    setTimeout(() => {
      setIsSandboxExecuting(false);
      setIsPlaying(false);
      setCurrentStepIndex(0);
    }, 700);
  };

  // Switch Planted Scenario directly from main page
  const handleSwitchPlantedScenario = (scenario) => {
    setIsSandboxExecuting(true);
    setTimeout(() => {
      setIsSandboxExecuting(false);
      setActiveScenarioId(scenario);
      if (scenario === 'leakage') {
        setCode(SAMPLE_CODE_DEFAULT);
        setCurrentFileName('leakage_example.ipynb');
        setHasLeakage(true);
        setIsRemediated(false);
        setAssertions({
          trainTestSplit: 'FAIL',
          fitVsTransform: 'FAIL',
          weightNormBounds: 'PASS'
        });
        setCurrentStepIndex(3);
      } else if (scenario === 'imbalance') {
        setCode(SAMPLE_CODE_IMBALANCE);
        setCurrentFileName('imbalance_example.ipynb');
        setHasLeakage(false);
        setIsRemediated(false);
        setAssertions({
          trainTestSplit: 'PASS',
          fitVsTransform: 'PASS',
          weightNormBounds: 'PASS'
        });
        setCurrentStepIndex(3);
      } else if (scenario === 'clean') {
        setCode(SAMPLE_CODE_REMEDIATED);
        setCurrentFileName('clean_pipeline.py');
        setHasLeakage(false);
        setIsRemediated(true);
        setAssertions({
          trainTestSplit: 'PASS',
          fitVsTransform: 'PASS',
          weightNormBounds: 'PASS'
        });
        setCurrentStepIndex(3);
      }
      setMainMode('trace');
      setActiveView('code-auditor');
    }, 500);
  };

  // Handle Run Audit from Input Panel
  const handleRunAudit = ({ code: newCode, fileName }) => {
    setIsSandboxExecuting(true);
    setTimeout(() => {
      setIsSandboxExecuting(false);
      setCode(newCode);
      setCurrentFileName(fileName || 'custom_pipeline.py');
      const detectedLeakage = newCode.includes('fit_transform') && newCode.includes('train_test_split') && (newCode.indexOf('fit_transform') < newCode.indexOf('train_test_split'));
      setHasLeakage(detectedLeakage);
      setIsRemediated(!detectedLeakage);
      setAssertions({
        trainTestSplit: detectedLeakage ? 'FAIL' : 'PASS',
        fitVsTransform: detectedLeakage ? 'FAIL' : 'PASS',
        weightNormBounds: 'PASS'
      });
      setCurrentStepIndex(1);
      setMainMode('trace');
      setActiveView('code-auditor');
    }, 800);
  };

  const handleSelectStepId = (id) => {
    if (id === -1) {
      setIsCommandPaletteOpen(true);
      return;
    }
    const idx = traceSteps.findIndex(s => s.stepId === id);
    if (idx !== -1) {
      setCurrentStepIndex(idx);
    }
  };

  return (
    <div className="min-h-screen w-full bg-background text-on-surface font-body-md select-none flex flex-col">
      {/* Top Fixed Header */}
      <Navbar
        currentFileName={currentFileName}
        criticalIssuesCount={hasLeakage ? 1 : 0}
        warningIssuesCount={1}
        onOpenNewAudit={() => setMainMode('input')}
        onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
      />

      {/* Main Container */}
      <div className="flex flex-1 pt-14">
        {/* Left Docked Sidebar */}
        <Sidebar
          activeView={activeView}
          onSelectView={(view) => {
            setActiveView(view);
            setMainMode('trace');
          }}
          assertions={assertions}
        />

        {/* Main Workspace (Offset by sidebar w-64) */}
        <div className="pl-64 flex-1 flex flex-col min-w-0 bg-background">
          {/* Main Page Top Navigation & Planted Scenarios Bar */}
          <div className="bg-surface-container-lowest px-gutter py-2 border-b border-surface-variant/30 flex items-center justify-between flex-wrap gap-2">
            {/* View Switcher: Trace Player vs Input Source */}
            <div className="flex items-center gap-1 bg-surface-container-low p-1 rounded-lg border border-surface-variant/30">
              <button
                type="button"
                onClick={() => setMainMode('trace')}
                className={`flex items-center gap-1.5 px-3 py-1 rounded font-label-md text-label-md transition-all ${
                  mainMode === 'trace'
                    ? 'bg-surface-container-high text-primary shadow-sm font-semibold'
                    : 'text-outline hover:text-on-surface'
                }`}
              >
                <span className="material-symbols-outlined text-[15px]">play_circle</span>
                <span>Trace Player (Auditor)</span>
              </button>

              <button
                type="button"
                onClick={() => setMainMode('input')}
                className={`flex items-center gap-1.5 px-3 py-1 rounded font-label-md text-label-md transition-all ${
                  mainMode === 'input'
                    ? 'bg-surface-container-high text-primary shadow-sm font-semibold'
                    : 'text-outline hover:text-on-surface'
                }`}
              >
                <span className="material-symbols-outlined text-[15px]">input</span>
                <span>Input Source & Ingest</span>
              </button>
            </div>

            {/* Quick Planted Demo Scenarios (Implementation Plan §6 Phase 5) */}
            <div className="flex items-center gap-2">
              <span className="font-label-xs text-label-xs uppercase text-outline font-mono hidden sm:inline">
                Planted Demo:
              </span>

              <button
                type="button"
                onClick={() => handleSwitchPlantedScenario('leakage')}
                className={`px-2.5 py-1 rounded font-label-xs text-label-xs font-mono transition-all flex items-center gap-1 border ${
                  activeScenarioId === 'leakage' && hasLeakage
                    ? 'bg-error-container/20 text-error border-error/50 shadow-sm'
                    : 'bg-surface-container text-on-surface-variant border-surface-variant/30 hover:border-error/40'
                }`}
              >
                <span className="material-symbols-outlined text-[13px]">crisis_alert</span>
                <span>Demo 1: Data Leakage</span>
              </button>

              <button
                type="button"
                onClick={() => handleSwitchPlantedScenario('imbalance')}
                className={`px-2.5 py-1 rounded font-label-xs text-label-xs font-mono transition-all flex items-center gap-1 border ${
                  activeScenarioId === 'imbalance'
                    ? 'bg-tertiary-container/20 text-tertiary border-tertiary/50 shadow-sm'
                    : 'bg-surface-container text-on-surface-variant border-surface-variant/30 hover:border-tertiary/40'
                }`}
              >
                <span className="material-symbols-outlined text-[13px]">warning</span>
                <span>Demo 2: Class Imbalance</span>
              </button>

              <button
                type="button"
                onClick={() => handleSwitchPlantedScenario('clean')}
                className={`px-2.5 py-1 rounded font-label-xs text-label-xs font-mono transition-all flex items-center gap-1 border ${
                  activeScenarioId === 'clean' || isRemediated
                    ? 'bg-secondary-container/20 text-secondary border-secondary/50 shadow-sm'
                    : 'bg-surface-container text-on-surface-variant border-surface-variant/30 hover:border-secondary/40'
                }`}
              >
                <span className="material-symbols-outlined text-[13px]">verified</span>
                <span>Sanitized Ref</span>
              </button>
            </div>
          </div>

          {/* Sandbox Executing Simulation Banner */}
          {isSandboxExecuting && (
            <div className="w-full bg-primary-container/20 border-b border-primary/30 p-space-sm flex items-center justify-center gap-space-sm text-primary font-mono text-code-sm animate-pulse">
              <span className="material-symbols-outlined text-[18px] animate-spin">progress_activity</span>
              <span>Spawning isolated sandbox runner • Capturing per-line AST & DataFrame registers...</span>
            </div>
          )}

          {/* Main Body View */}
          <main className="flex-1 overflow-y-auto">
            {/* Mode A: Input Source & Ingest */}
            {mainMode === 'input' && (
              <InputPanel
                onRunAudit={handleRunAudit}
                isExecuting={isSandboxExecuting}
                onCancel={() => setMainMode('trace')}
              />
            )}

            {/* Mode B: Trace Player (Auditor Workspace) */}
            {mainMode === 'trace' && (
              <>
                {activeView === 'code-auditor' && (
                  <TracePlayer
                    code={code}
                    traceSteps={traceSteps}
                    currentStepIndex={currentStepIndex}
                    onSelectStep={setCurrentStepIndex}
                    isPlaying={isPlaying}
                    onTogglePlay={setIsPlaying}
                    hasLeakage={hasLeakage}
                    isRemediated={isRemediated}
                    onApplyFix={handleApplyFix}
                    onRerunSandbox={handleRerunSandbox}
                    selectedLineNumber={selectedLineNumber}
                    onSelectLine={setSelectedLineNumber}
                    currentFileName={currentFileName}
                  />
                )}

                {activeView === 'visual-tracer' && (
                  <div className="p-gutter">
                    <ExecutionDagView
                      hasLeakage={hasLeakage}
                      currentStep={traceSteps[currentStepIndex]}
                      onSelectNode={(node) => {
                        if (node.id === '3') {
                          handleSelectStepId(9);
                          setActiveView('code-auditor');
                        } else if (node.id === '4') {
                          handleSelectStepId(14);
                          setActiveView('code-auditor');
                        }
                      }}
                    />
                  </div>
                )}

                {activeView === 'leakage-inspector' && (
                  <div className="p-gutter">
                    <LeakageInspectorView
                      hasLeakage={hasLeakage}
                      onApplyFix={handleApplyFix}
                    />
                  </div>
                )}

                {activeView === 'tensor-watcher' && (
                  <div className="p-gutter">
                    <TensorWatcherView
                      currentStep={traceSteps[currentStepIndex]}
                    />
                  </div>
                )}

                {activeView === 'remediation-diff' && (
                  <div className="p-gutter max-w-4xl mx-auto flex flex-col gap-gutter">
                    <BobAiAuditPanel
                      hasLeakage={hasLeakage}
                      onApplyFix={handleApplyFix}
                      onRerunSandbox={handleRerunSandbox}
                      isRemediated={isRemediated}
                    />
                    <LeakageInspectorView
                      hasLeakage={hasLeakage}
                      onApplyFix={handleApplyFix}
                    />
                  </div>
                )}
              </>
            )}
          </main>
        </div>
      </div>

      {/* New Audit Modal (accessible from any view) */}
      <NewAuditModal
        isOpen={isNewAuditModalOpen}
        onClose={() => setIsNewAuditModalOpen(false)}
        onRunAudit={handleRunAudit}
      />

      {/* Command Palette (Cmd + K) */}
      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        onSelectStepId={handleSelectStepId}
        onSelectView={(view) => {
          setActiveView(view);
          setMainMode('trace');
        }}
        onApplyFix={handleApplyFix}
        onOpenNewAudit={() => setMainMode('input')}
      />
    </div>
  );
}
