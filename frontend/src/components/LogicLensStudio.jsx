import React, { useState } from 'react';
import LogicLensScrubber from './LogicLensScrubber';
import LogicLensCodeViewer from './LogicLensCodeViewer';
import LoopVisualizer from './LoopVisualizer';
import TerminalOutputPane from './TerminalOutputPane';
import BranchVisualizer from './BranchVisualizer';
import StateBoard from './StateBoard';
import TeammateHandoffDrawer from './TeammateHandoffDrawer';

export default function LogicLensStudio({
  code,
  traceSteps,
  currentStepIndex,
  onSelectStepIndex,
  isPlaying,
  onTogglePlay,
  playbackSpeed,
  onChangePlaybackSpeed
}) {
  const [selectedLineNumber, setSelectedLineNumber] = useState(13);
  const currentStep = traceSteps[currentStepIndex] || traceSteps[0];

  const handleJumpToIteration = (stepId) => {
    const idx = traceSteps.findIndex(s => s.step_id === stepId);
    if (idx !== -1) {
      onSelectStepIndex(idx);
    }
  };

  const handleJumpToSafeHook = () => {
    const idx = traceSteps.findIndex(s => s.line_number === 25 || s.event_type === 'safe_insertion');
    if (idx !== -1) {
      onSelectStepIndex(idx);
    }
    const el = document.getElementById('code-line-25');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  return (
    <div className="flex flex-col w-full min-w-0">
      {/* 1. Execution Timeline Scrubber Dock */}
      <LogicLensScrubber
        steps={traceSteps}
        currentStepIndex={currentStepIndex}
        onSelectStepIndex={onSelectStepIndex}
        isPlaying={isPlaying}
        onTogglePlay={onTogglePlay}
        playbackSpeed={playbackSpeed}
        onChangePlaybackSpeed={onChangePlaybackSpeed}
        onJumpToSafeHook={handleJumpToSafeHook}
      />

      {/* 2. LogicLens 4-Pane Interactive Workspace (Implementation Plan §3.2) */}
      <section className="grid grid-cols-1 xl:grid-cols-12 gap-gutter p-gutter">
        {/* PANE 1: Syntax-Highlighted Code Viewer (5 cols on xl) */}
        <div className="xl:col-span-5 flex flex-col gap-2 min-h-[580px]">
          <LogicLensCodeViewer
            code={code}
            currentStep={currentStep}
            steps={traceSteps}
            selectedLineNumber={selectedLineNumber}
            onSelectLine={setSelectedLineNumber}
            onJumpToStep={onSelectStepIndex}
            onOpenSafeHookDrawer={handleJumpToSafeHook}
          />
        </div>

        {/* PANES 2 & 3: Control Flow, Visualizer & State Board (4 cols on xl) */}
        <div className="xl:col-span-4 flex flex-col gap-gutter">
          {/* PANE 2: Loop Visualizer & Branch Evaluator */}
          <LoopVisualizer
            currentStep={currentStep}
            onJumpToIteration={handleJumpToIteration}
            onJumpToLoopExit={() => {
              const idx = traceSteps.findIndex(s => s.event_type === 'loop_exit');
              if (idx !== -1) onSelectStepIndex(idx);
            }}
          />

          <TerminalOutputPane
            traceSteps={traceSteps}
            currentStepIndex={currentStepIndex}
            currentStep={currentStep}
          />

          <BranchVisualizer currentStep={currentStep} />

          {/* PANE 3: State & Mutation Inspector */}
          <StateBoard currentStep={currentStep} />
        </div>

        {/* PANE 4: AI Teammate Handoff & Intent Drawer (3 cols on xl) */}
        <div className="xl:col-span-3 flex flex-col gap-gutter">
          <TeammateHandoffDrawer
            currentStep={currentStep}
            onJumpToSafeHook={handleJumpToSafeHook}
          />
        </div>
      </section>
    </div>
  );
}
