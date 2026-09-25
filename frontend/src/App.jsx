import React, { useState, useEffect } from 'react';
import Navbar from './components/Navbar';
import Sidebar from './components/Sidebar';
import ModeIntakeDashboard from './components/ModeIntakeDashboard';
import LogicLensStudio from './components/LogicLensStudio';
import TracePlayer from './components/TracePlayer';
import ExecutionDagView from './components/ExecutionDagView';
import LeakageInspectorView from './components/LeakageInspectorView';
import TensorWatcherView from './components/TensorWatcherView';
import BobAiAuditPanel from './components/BobAiAuditPanel';
import CommandPalette from './components/CommandPalette';
import LoopVisualizer from './components/LoopVisualizer';
import BranchVisualizer from './components/BranchVisualizer';
import StateBoard from './components/StateBoard';
import TeammateHandoffDrawer from './components/TeammateHandoffDrawer';

import {
  TEAMMATE_PIPELINE_CODE,
  LOGICLENS_TRACE_STEPS
} from './data/logicLensData';

import { 
  SAMPLE_CODE_DEFAULT, 
  SAMPLE_CODE_REMEDIATED, 
  INITIAL_TRACE_STEPS 
} from './data/pipelineData';
import { SAMPLE_CODE_IMBALANCE } from './components/InputPanel';

export default function App() {
  // App Navigation States
  const [mainScreen, setMainScreen] = useState('studio'); // 'studio' | 'intake'
  const [currentLensMode, setCurrentLensMode] = useState('logic_lens'); // 'logic_lens' (Mode 1) | 'model_lens' (Mode 2)
  const [activeView, setActiveView] = useState('logic-studio'); // Logic: 'logic-studio' | 'logic-loops' | 'logic-state' | 'logic-handoff'
                                                                 // Model: 'code-auditor' | 'visual-tracer' | 'leakage-inspector' | 'tensor-watcher' | 'remediation-diff'
  const [isSandboxExecuting, setIsSandboxExecuting] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);

  // --- MODE 1: LogicLens State ---
  const [logicCode, setLogicCode] = useState(TEAMMATE_PIPELINE_CODE);
  const [logicFileName, setLogicFileName] = useState('teammate_pipeline.py');
  const [currentLogicStepIndex, setCurrentLogicStepIndex] = useState(3); // Start at Iteration 1 header
  const [isLogicPlaying, setIsLogicPlaying] = useState(false);
  const [logicPlaybackSpeed, setLogicPlaybackSpeed] = useState(1);

  // --- MODE 2: ModelLens State ---
  const [modelCode, setModelCode] = useState(SAMPLE_CODE_DEFAULT);
  const [modelFileName, setModelFileName] = useState('churn_prediction.ipynb');
  const [currentModelStepIndex, setCurrentModelStepIndex] = useState(3); // Step 14
  const [isModelPlaying, setIsModelPlaying] = useState(false);
  const [hasLeakage, setHasLeakage] = useState(true);
  const [isRemediated, setIsRemediated] = useState(false);
  const [activeScenarioId, setActiveScenarioId] = useState('leakage');
  const [assertions, setAssertions] = useState({
    trainTestSplit: 'FAIL',
    fitVsTransform: 'FAIL',
    weightNormBounds: 'PASS'
  });

  const logicSteps = LOGICLENS_TRACE_STEPS;
  const modelSteps = INITIAL_TRACE_STEPS;

  // Global Keyboard Navigation (Space to play/pause, Left/Right to step, Cmd+K)
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Ignore if focus is in an input or textarea
      if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) {
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        if (currentLensMode === 'logic_lens') {
          setIsLogicPlaying((prev) => !prev);
        } else {
          setIsModelPlaying((prev) => !prev);
        }
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        if (currentLensMode === 'logic_lens') {
          setCurrentLogicStepIndex((prev) => Math.max(0, prev - 1));
        } else {
          setCurrentModelStepIndex((prev) => Math.max(0, prev - 1));
        }
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        if (currentLensMode === 'logic_lens') {
          setCurrentLogicStepIndex((prev) => Math.min(logicSteps.length - 1, prev + 1));
        } else {
          setCurrentModelStepIndex((prev) => Math.min(modelSteps.length - 1, prev + 1));
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentLensMode, logicSteps.length, modelSteps.length]);

  // Mode Switcher handler
  const handleSwitchMode = (newMode) => {
    setIsSandboxExecuting(true);
    setTimeout(() => {
      setIsSandboxExecuting(false);
      setCurrentLensMode(newMode);
      if (newMode === 'logic_lens') {
        setActiveView('logic-studio');
      } else {
        setActiveView('code-auditor');
      }
      setMainScreen('studio');
    }, 350);
  };

  // Launch from Intake Dashboard
  const handleLaunchTrace = ({ mode, code: inputCode, fileName: inputFileName }) => {
    setIsSandboxExecuting(true);
    setTimeout(() => {
      setIsSandboxExecuting(false);
      setCurrentLensMode(mode);
      if (mode === 'logic_lens') {
        setLogicCode(inputCode || TEAMMATE_PIPELINE_CODE);
        setLogicFileName(inputFileName || 'teammate_pipeline.py');
        setCurrentLogicStepIndex(0);
        setActiveView('logic-studio');
      } else {
        setModelCode(inputCode || SAMPLE_CODE_DEFAULT);
        setModelFileName(inputFileName || 'churn_prediction.ipynb');
        const detected = inputCode.includes('fit_transform') && inputCode.includes('train_test_split') && (inputCode.indexOf('fit_transform') < inputCode.indexOf('train_test_split'));
        setHasLeakage(detected);
        setIsRemediated(!detected);
        setAssertions({
          trainTestSplit: detected ? 'FAIL' : 'PASS',
          fitVsTransform: detected ? 'FAIL' : 'PASS',
          weightNormBounds: 'PASS'
        });
        setCurrentModelStepIndex(1);
        setActiveView('code-auditor');
      }
      setMainScreen('studio');
    }, 700);
  };

  // Mode 2 Remediation Handlers
  const handleApplyFix = () => {
    setModelCode(SAMPLE_CODE_REMEDIATED);
    setHasLeakage(false);
    setIsRemediated(true);
    setActiveScenarioId('clean');
    setAssertions({
      trainTestSplit: 'PASS',
      fitVsTransform: 'PASS',
      weightNormBounds: 'PASS'
    });
  };

  const handleRerunSandbox = () => {
    setIsSandboxExecuting(true);
    setTimeout(() => {
      setIsSandboxExecuting(false);
      setIsModelPlaying(false);
      setCurrentModelStepIndex(0);
    }, 600);
  };

  const handleSwitchPlantedScenario = (scenario) => {
    setIsSandboxExecuting(true);
    setTimeout(() => {
      setIsSandboxExecuting(false);
      setActiveScenarioId(scenario);
      if (scenario === 'leakage') {
        setModelCode(SAMPLE_CODE_DEFAULT);
        setModelFileName('leakage_example.ipynb');
        setHasLeakage(true);
        setIsRemediated(false);
        setAssertions({ trainTestSplit: 'FAIL', fitVsTransform: 'FAIL', weightNormBounds: 'PASS' });
        setCurrentModelStepIndex(3);
      } else if (scenario === 'imbalance') {
        setModelCode(SAMPLE_CODE_IMBALANCE);
        setModelFileName('imbalance_example.ipynb');
        setHasLeakage(false);
        setIsRemediated(false);
        setAssertions({ trainTestSplit: 'PASS', fitVsTransform: 'PASS', weightNormBounds: 'PASS' });
        setCurrentModelStepIndex(3);
      } else if (scenario === 'clean') {
        setModelCode(SAMPLE_CODE_REMEDIATED);
        setModelFileName('clean_pipeline.py');
        setHasLeakage(false);
        setIsRemediated(true);
        setAssertions({ trainTestSplit: 'PASS', fitVsTransform: 'PASS', weightNormBounds: 'PASS' });
        setCurrentModelStepIndex(3);
      }
      setCurrentLensMode('model_lens');
      setActiveView('code-auditor');
      setMainScreen('studio');
    }, 400);
  };

  const currentLogicStep = logicSteps[currentLogicStepIndex] || logicSteps[0];
  const currentModelStep = modelSteps[currentModelStepIndex] || modelSteps[0];

  return (
    <div className="min-h-screen w-full bg-background text-on-surface font-body-md select-none flex flex-col">
      {/* 1. Global Navigation Bar */}
      <Navbar
        currentFileName={currentLensMode === 'logic_lens' ? logicFileName : modelFileName}
        currentMode={currentLensMode}
        onChangeMode={handleSwitchMode}
        criticalIssuesCount={hasLeakage ? 1 : 0}
        warningIssuesCount={1}
        onOpenNewAudit={() => setMainScreen('intake')}
        onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
        currentStepNumber={currentLensMode === 'logic_lens' ? currentLogicStepIndex + 1 : currentModelStep.stepId}
        totalSteps={currentLensMode === 'logic_lens' ? logicSteps.length : 42}
      />

      {/* 2. Main Studio Body */}
      <div className="flex flex-1 pt-14">
        {/* Left Docked Sidebar (Hidden in Intake screen) */}
        {mainScreen === 'studio' && (
          <Sidebar
            activeView={activeView}
            onSelectView={(view) => {
              setActiveView(view);
              setMainScreen('studio');
            }}
            currentMode={currentLensMode}
            onChangeMode={handleSwitchMode}
            assertions={assertions}
          />
        )}

        {/* Content Area */}
        <div className={`flex-1 flex flex-col min-w-0 bg-background ${mainScreen === 'studio' ? 'pl-64' : 'pl-0'}`}>
          {/* Top Sub-Bar: Quick Switcher & Planted Scenarios */}
          {mainScreen === 'studio' && (
            <div className="bg-surface-container-lowest px-gutter py-2 border-b border-surface-variant/30 flex items-center justify-between flex-wrap gap-2">
              {/* Studio vs Ingest switcher */}
              <div className="flex items-center gap-1 bg-surface-container-low p-1 rounded-lg border border-surface-variant/30">
                <button
                  type="button"
                  onClick={() => setMainScreen('studio')}
                  className="flex items-center gap-1.5 px-3 py-1 rounded font-label-md text-label-md bg-surface-container-high text-primary shadow-sm font-semibold"
                >
                  <span className="material-symbols-outlined text-[15px]">play_circle</span>
                  <span>{currentLensMode === 'logic_lens' ? 'LogicLens Studio' : 'ModelLens Auditor'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setMainScreen('intake')}
                  className="flex items-center gap-1.5 px-3 py-1 rounded font-label-md text-label-md text-outline hover:text-on-surface transition-all"
                >
                  <span className="material-symbols-outlined text-[15px]">input</span>
                  <span>Intake &amp; Code Ingestion</span>
                </button>
              </div>

              {/* Planted Demos for Evaluators */}
              <div className="flex items-center gap-2">
                <span className="font-label-xs text-label-xs uppercase text-outline font-mono hidden sm:inline">
                  Judge Demos:
                </span>

                {/* Mode 1 Primary Demo Button */}
                <button
                  type="button"
                  onClick={() => {
                    handleSwitchMode('logic_lens');
                    setCurrentLogicStepIndex(3);
                  }}
                  className={`px-2.5 py-1 rounded font-label-xs text-label-xs font-mono transition-all flex items-center gap-1 border ${
                    currentLensMode === 'logic_lens'
                      ? 'bg-secondary-container/20 text-secondary border-secondary/50 shadow-sm font-bold'
                      : 'bg-surface-container text-on-surface-variant border-surface-variant/30 hover:border-secondary/40'
                  }`}
                >
                  <span className="material-symbols-outlined text-[13px]">handshake</span>
                  <span>Mode 1: Teammate Handoff</span>
                </button>

                {/* Mode 2 Leakage Demo Button */}
                <button
                  type="button"
                  onClick={() => handleSwitchPlantedScenario('leakage')}
                  className={`px-2.5 py-1 rounded font-label-xs text-label-xs font-mono transition-all flex items-center gap-1 border ${
                    currentLensMode === 'model_lens' && activeScenarioId === 'leakage' && hasLeakage
                      ? 'bg-error-container/20 text-error border-error/50 shadow-sm font-bold'
                      : 'bg-surface-container text-on-surface-variant border-surface-variant/30 hover:border-error/40'
                  }`}
                >
                  <span className="material-symbols-outlined text-[13px]">crisis_alert</span>
                  <span>Mode 2: Leakage Audit</span>
                </button>

                {/* Mode 2 Imbalance Demo Button */}
                <button
                  type="button"
                  onClick={() => handleSwitchPlantedScenario('imbalance')}
                  className={`px-2.5 py-1 rounded font-label-xs text-label-xs font-mono transition-all flex items-center gap-1 border ${
                    currentLensMode === 'model_lens' && activeScenarioId === 'imbalance'
                      ? 'bg-tertiary-container/20 text-tertiary border-tertiary/50 shadow-sm font-bold'
                      : 'bg-surface-container text-on-surface-variant border-surface-variant/30 hover:border-tertiary/40'
                  }`}
                >
                  <span className="material-symbols-outlined text-[13px]">warning</span>
                  <span>Mode 2: Imbalance Skew</span>
                </button>
              </div>
            </div>
          )}

          {/* Sandbox Running Spinner Banner */}
          {isSandboxExecuting && (
            <div className="w-full bg-primary-container/20 border-b border-primary/30 p-space-sm flex items-center justify-center gap-space-sm text-primary font-mono text-code-sm animate-pulse">
              <span className="material-symbols-outlined text-[18px] animate-spin">progress_activity</span>
              <span>Spawning sys.settrace deterministic sandbox • Capturing per-step AST registers &amp; deltas...</span>
            </div>
          )}

          {/* 3. Main Workspace Router */}
          <main className="flex-1 overflow-y-auto">
            {/* SCREEN 1: Intake & Mode Selection Landing Dashboard */}
            {mainScreen === 'intake' && (
              <ModeIntakeDashboard
                onLaunchTrace={handleLaunchTrace}
                isExecuting={isSandboxExecuting}
                initialMode={currentLensMode}
              />
            )}

            {/* SCREEN 2: Studio Workspace */}
            {mainScreen === 'studio' && (
              <>
                {/* ============================================================== */}
                {/* MODE 1: LogicLens (Visual Walkthrough & Teammate Handoff)     */}
                {/* ============================================================== */}
                {currentLensMode === 'logic_lens' && (
                  <>
                    {/* Primary 4-Pane Studio Workspace (Plan §3.2) */}
                    {activeView === 'logic-studio' && (
                      <LogicLensStudio
                        code={logicCode}
                        traceSteps={logicSteps}
                        currentStepIndex={currentLogicStepIndex}
                        onSelectStepIndex={setCurrentLogicStepIndex}
                        isPlaying={isLogicPlaying}
                        onTogglePlay={setIsLogicPlaying}
                        playbackSpeed={logicPlaybackSpeed}
                        onChangePlaybackSpeed={setLogicPlaybackSpeed}
                        onOpenSafeHookDrawer={() => {
                          const idx = logicSteps.findIndex(s => s.line_number === 25);
                          if (idx !== -1) setCurrentLogicStepIndex(idx);
                        }}
                      />
                    )}

                    {/* Dedicated Loop Visualizer Deep-Dive */}
                    {activeView === 'logic-loops' && (
                      <div className="p-gutter max-w-5xl mx-auto flex flex-col gap-gutter">
                        <LoopVisualizer
                          currentStep={currentLogicStep}
                          onJumpToIteration={(stepId) => {
                            const idx = logicSteps.findIndex(s => s.step_id === stepId);
                            if (idx !== -1) setCurrentLogicStepIndex(idx);
                            setActiveView('logic-studio');
                          }}
                          onJumpToLoopExit={() => {
                            const idx = logicSteps.findIndex(s => s.event_type === 'loop_exit');
                            if (idx !== -1) setCurrentLogicStepIndex(idx);
                            setActiveView('logic-studio');
                          }}
                        />
                        <BranchVisualizer currentStep={currentLogicStep} />
                      </div>
                    )}

                    {/* Dedicated State & Mutation Board */}
                    {activeView === 'logic-state' && (
                      <div className="p-gutter max-w-5xl mx-auto">
                        <StateBoard currentStep={currentLogicStep} />
                      </div>
                    )}

                    {/* Dedicated Teammate Handoff & Safe Insertion Pins */}
                    {activeView === 'logic-handoff' && (
                      <div className="p-gutter max-w-5xl mx-auto">
                        <TeammateHandoffDrawer
                          currentStep={currentLogicStep}
                          onJumpToSafeHook={() => {
                            const idx = logicSteps.findIndex(s => s.line_number === 25);
                            if (idx !== -1) setCurrentLogicStepIndex(idx);
                            setActiveView('logic-studio');
                          }}
                        />
                      </div>
                    )}
                  </>
                )}

                {/* ============================================================== */}
                {/* MODE 2: ModelLens (ML Methodology Auditor)                     */}
                {/* ============================================================== */}
                {currentLensMode === 'model_lens' && (
                  <>
                    {activeView === 'code-auditor' && (
                      <TracePlayer
                        code={modelCode}
                        traceSteps={modelSteps}
                        currentStepIndex={currentModelStepIndex}
                        onSelectStep={setCurrentModelStepIndex}
                        isPlaying={isModelPlaying}
                        onTogglePlay={setIsModelPlaying}
                        hasLeakage={hasLeakage}
                        isRemediated={isRemediated}
                        onApplyFix={handleApplyFix}
                        onRerunSandbox={handleRerunSandbox}
                        selectedLineNumber={14}
                        onSelectLine={() => {}}
                        currentFileName={modelFileName}
                      />
                    )}

                    {activeView === 'visual-tracer' && (
                      <div className="p-gutter">
                        <ExecutionDagView
                          hasLeakage={hasLeakage}
                          currentStep={modelSteps[currentModelStepIndex]}
                          onSelectNode={(node) => {
                            if (node.id === '3') {
                              setCurrentModelStepIndex(2); // Step 9
                              setActiveView('code-auditor');
                            } else if (node.id === '4') {
                              setCurrentModelStepIndex(3); // Step 14
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
                          currentStep={modelSteps[currentModelStepIndex]}
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
              </>
            )}
          </main>
        </div>
      </div>

      {/* Command Palette (Cmd + K) */}
      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        onSelectStepId={(id) => {
          if (id === -1) {
            setIsCommandPaletteOpen(true);
            return;
          }
          if (currentLensMode === 'logic_lens') {
            const idx = logicSteps.findIndex(s => s.step_id === id);
            if (idx !== -1) setCurrentLogicStepIndex(idx);
          } else {
            const idx = modelSteps.findIndex(s => s.stepId === id);
            if (idx !== -1) setCurrentModelStepIndex(idx);
          }
        }}
        onSelectView={(view) => {
          if (view.startsWith('logic-')) {
            setCurrentLensMode('logic_lens');
          } else {
            setCurrentLensMode('model_lens');
          }
          setActiveView(view);
          setMainScreen('studio');
        }}
        onChangeMode={handleSwitchMode}
        onApplyFix={handleApplyFix}
        onOpenNewAudit={() => setMainScreen('intake')}
      />
    </div>
  );
}
