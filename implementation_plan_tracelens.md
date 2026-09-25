# Master Implementation Plan & Phase-by-Phase Roadmap: TraceLens
**Event:** IBM Bob 2.0 Hackathon (lablab.ai), Sep 25–27, 2026 — 48-Hour Sprint  
**Team:** The Overfitters  
**Core Priority:** Mode 1 — LogicLens (Deterministic Manual Visualizer & Line-by-Line Teammate Handoff)  
**Migrated Secondary Mode:** Mode 2 — ModelLens (ML & Data Science Methodology Auditor)  

> **Document Purpose:**  
> This specification is the definitive execution roadmap for TraceLens. It details the system architecture, data contracts, and a deep, step-by-step **how-to-implement guide for every single phase**. It removes raw code dumps while providing clear algorithmic logic, component responsibilities, state machines, and verification criteria so that any developer or AI coding assistant (Bob, Cursor, Claude Code, Copilot) can build and ship the platform seamlessly.

---

## Table of Contents
1. [Executive Summary & Problem Statement](#1-executive-summary--problem-statement)
2. [Dual-Mode Architecture & Priority Hierarchy](#2-dual-mode-architecture--priority-hierarchy)
3. [Studio UX & Interactive User Flow](#3-studio-ux--interactive-user-flow)
4. [Manual Deterministic Visualization Engine (Main Mode Core)](#4-manual-deterministic-visualization-engine-main-mode-core)
5. [The Teammate Handoff Engine & Safe Insertion Markers](#5-the-teammate-handoff-engine--safe-insertion-markers)
6. [Mode 2: ModelLens (ML Pipeline Auditor Migration)](#6-mode-2-modellens-ml-pipeline-auditor-migration)
7. [System Architecture & Dataflow](#7-system-architecture--dataflow)
8. [Core Data Contracts & API Schemas](#8-core-data-contracts--api-schemas)
9. [Detailed Phase-by-Phase Implementation Roadmap](#9-detailed-phase-by-phase-implementation-roadmap)
   - [Phase 0: Project Scaffold, Mode Intake UI & Contract Mocking (Hours 0–4)](#phase-0-project-scaffold-mode-intake-ui--contract-mocking-hours-04)
   - [Phase 1: Deterministic Execution Sandbox & AST Tracer (Hours 4–14) — P0](#phase-1-deterministic-execution-sandbox--ast-tracer-hours-414--p0)
   - [Phase 2: Frontend Studio Workspace & Playback Scrubber (Hours 12–20) — P0](#phase-2-frontend-studio-workspace--playback-scrubber-hours-1220--p0)
   - [Phase 3: Manual Visualizers Implementation (Hours 18–28) — P0 Core](#phase-3-manual-visualizers-implementation-hours-1828--p0-core)
   - [Phase 4: Teammate Handoff & Safe Insertion Engine (Hours 26–34) — P1](#phase-4-teammate-handoff--safe-insertion-engine-hours-2634--p1)
   - [Phase 5: ModelLens (ML Auditor) Migration & Risk Overlays (Hours 32–40) — P2](#phase-5-modellens-ml-auditor-migration--risk-overlays-hours-3240--p2)
   - [Phase 6: End-to-End Polish, Demo Scripts & Lablab Submission (Hours 40–48)](#phase-6-end-to-end-polish-demo-scripts--lablab-submission-hours-4048)
10. [IBM Bob Prompt Engineering & Explainer Integration](#10-ibm-bob-prompt-engineering--explainer-integration)
11. [Ready-to-Run Demo Test Scripts](#11-ready-to-run-demo-test-scripts)
12. [Risk Matrix & Defensive Engineering Guardrails](#12-risk-matrix--defensive-engineering-guardrails)

---

## 1. Executive Summary & Problem Statement

### 1.1 The Teammate Handoff Dilemma
When inheriting a Python script or data pipeline written by a teammate, developers encounter two major friction points:
1. **Generic AI summaries fail at the code level:** Asking an LLM to "summarize this file" produces vague bullet points (e.g., *"this script cleans data and computes metrics"*). When a developer sits down to add logic, they have zero visibility into runtime state mutations, list growth, nested loop indices, or off-by-one errors.
2. **Mental simulation is slow and bug-prone:** Developers spend up to 70% of their time mentally executing code line by line just to answer:
   - *"What does `records` actually look like at line 34?"*
   - *"How many times did this nested loop run?"*
   - *"If I insert my validation check here, will I overwrite a variable that my teammate depends on downriver?"*
3. **The AI Hallucination Trap:** Asking an AI to "simulate the run" often results in hallucinated variables, imagined iteration counts, and false logic.

### 1.2 The Solution: TraceLens
**TraceLens** turns inheriting teammate code into a smooth, visual walkthrough:
- **100% Deterministic Manual Tracing:** The backend executes the code inside an isolated sandbox using `sys.settrace` and AST inspection. **No LLM hallucination is involved in tracing execution state.**
- **Manual Control-Flow Visualizers:** Loops, branches, variable mutations, and collection states are rendered visually (e.g., animated loop dials, unrolled iteration history, condition outcome badges, variable delta cards).
- **Line-by-Line Contextual Intent:** As the user steps through the code, IBM Bob explains the *intent* behind the teammate's code (why it was written, what pattern is being used) and highlights safe editing zones.
- **Safe Insertion Markers:** The system analyzes variable lifecycles (creation, mutation, terminal read, destruction) to place visual pins in the editor indicating: *"Safe to insert logic here — `cleaned_records` is ready, but downstream aggregations have not started."*

---

## 2. Dual-Mode Architecture & Priority Hierarchy

The application opens to a unified code-intake landing page where the user selects between two modes:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       TRACELENS INTAKE DASHBOARD                            │
│  [ Paste Python Code ]   [ Upload .py / .ipynb ]   [ Load Teammate Sample ] │
├─────────────────────────────────────────────────────────────────────────────┤
│                         SELECT ANALYSIS LENS:                               │
│                                                                             │
│   (*) MODE 1: LogicLens [DEFAULT - TOP BUILD PRIORITY]                      │
│       Visual Code Walkthrough & Teammate Handoff Engine                     │
│       • Manual deterministic loop & branch visualizers                      │
│       • Step-by-step runtime memory diffs & mutation dials                  │
│       • Line-by-line intent walkthrough (powered by Bob)                    │
│       • "Where to continue" safe code injection markers                     │
│                                                                             │
│   ( ) MODE 2: ModelLens (ML Pipeline Auditor) [MIGRATED ONTO CORE TRACER]   │
│       Machine Learning & Data Science Methodology Guard                     │
│       • Pre-split data leakage detection (scaler/encoder before split)      │
│       • Target class imbalance & skew warnings                              │
│       • Model/data complexity mismatch heuristics                           │
│       • Automated remediation snippets                                      │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Priority Hierarchy
1. **Mode 1 (LogicLens) — Priority 0 (Core Focus):** 75% of engineering time is dedicated to perfecting the deterministic execution engine, manual visualizers (loop visualizer, branch visualizer, state board), line scrubber, and teammate handoff guide.
2. **Mode 2 (ModelLens) — Priority 1 (Migrated Architecture):** ModelLens is not an independent silo. It is implemented as a **pluggable diagnostic layer** that runs directly on top of the deterministic execution frames produced by Mode 1.

---

## 3. Studio UX & Interactive User Flow

### 3.1 Step 1: Code Intake
1. The developer pastes their teammate's Python script (or drops a `.py`/`.ipynb` file).
2. The user selects **LogicLens (Teammate Handoff)**.
3. The user clicks **"Trace & Walk Through"**.
4. The frontend dispatches `POST /api/trace` to the backend.

### 3.2 Step 2: The LogicLens Studio (4-Pane Interactive Workspace)
Once the trace completes (typically 200–500ms), the user enters the LogicLens Studio:

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ TRACELENS STUDIO  |  File: teammate_pipeline.py  |  Mode: LogicLens  |  Step 4 of 18  |  [⏮] [◀] [▶] [⏭] [AutoPlay]│
├──────────────────────────────────────────────────────┬───────────────────────────────────────────────────────────┤
│ PANE 1: SYNTAX-HIGHLIGHTED CODE VIEWER               │ PANE 2: CONTROL FLOW & MANUAL VISUALIZER                  │
│                                                      │                                                           │
│  1  raw_users = ["alice", "bob", ""]                 │ ┌───────────────────────────────────────────────────────┐ │
│  2  cleaned = []                                     │ │ 🔄 FOR LOOP VISUALIZER: `for u in raw_users:`          │ │
│  3  # Teammate loop: cleans and validates names      │ │ Iteration: [ 1 ] [● 2 ] [ 3 ]  (Current: 2 of 3)      │ │
│► 4  for u in raw_users:                              │ │ Target Variable: `u` = "bob"                          │ │
│  5      if len(u) > 0:                               │ │ Progress: [=====================>           ] 66%     │ │
│  6          cleaned.append(u.strip().capitalize())   │ └───────────────────────────────────────────────────────┘ │
│  7                                                   │ ┌───────────────────────────────────────────────────────┐ │
│ [★ SAFE INSERTION POINT: Line 7]                     │ │ 🔀 BRANCH DECISION: `if len(u) > 0:`                   │ │
│  8  user_count = len(cleaned)                        │ │ Evaluated: `len("bob") > 0` => `3 > 0` => TRUE        │ │
│                                                      │ │ Branch Taken: Line 6 (Line 7 else skipped)            │ │
│                                                      │ └───────────────────────────────────────────────────────┘ │
├──────────────────────────────────────────────────────┼───────────────────────────────────────────────────────────┤
│ PANE 3: STATE & MUTATION INSPECTOR                   │ PANE 4: AI TEAMMATE HANDOFF & INTENT DRAWER              │
│                                                      │                                                           │
│ Variable Deltas this step:                           │ 💡 Teammate Intent on Line 4:                             │
│ • `u`: "alice" ➔ "bob" (String mutated)              │ "Your teammate is iterating through the unvalidated input│
│ • `cleaned`: ["Alice"] (Length: 1)                   │ list to discard empty strings and capitalize names."      │
│ • `raw_users`: ["alice", "bob", ""] (Read-only)      │                                                           │
│                                                      │ 🛠️ Safe Continuation Advice:                             │
│ Memory Snapshot:                                     │ "If you need to filter out banned usernames, do NOT edit │
│ ┌──────────┬────────┬─────────────────────────────┐  │ the loop header. Inject your filter condition at Line 5.5│
│ │ Variable │ Type   │ Value                       │  │ Or, hook into Line 7 where `cleaned` is fully populated.│
│ ├──────────┼────────┼─────────────────────────────┤  │                                                           │
│ │ raw_users│ list   │ ['alice', 'bob', '']        │  │ 📍 Safe Insertion Markers:                             │
│ │ cleaned  │ list   │ ['Alice']                   │  │ • Line 7: `cleaned` ready, safe to add email lookups.  │
│ │ u        │ str    │ 'bob'                       │  │                                                           │
│ └──────────┴────────┴─────────────────────────────┘  │ [ Copy Recommended Hook Template ]                       │
└──────────────────────────────────────────────────────┴───────────────────────────────────────────────────────────┘
```

---

## 4. Manual Deterministic Visualization Engine (Main Mode Core)

The core tenet of LogicLens: **Never guess what the code did.** Every visual representation is driven by deterministic frame states extracted by `sys.settrace` and AST mapping.

### 4.1 Loop Visualizer
When the code enters a `for` or `while` loop, the UI shifts from static code reading to an active Loop Dial:
1. **Iteration Progress Dial:**
   - Displays the current iteration index vs total expected iterations: `Iteration 2 of 5`.
   - For `for item in collection:`: displays the target variable name, current element value, and remaining elements in the queue.
   - For `while condition:`: displays active condition operands and evaluates why the loop continued or terminated.
2. **Unrolled Iteration Carousel:**
   - A horizontal scrubber showing mini-cards for past iterations:
     `[ Iteration 1: u='alice', cleaned=['Alice'] ] ➔ [ Iteration 2: u='bob', cleaned=['Alice', 'Bob'] ] ➔ [ Iteration 3: u='', skipped ]`
   - Clicking any past iteration jumps the entire UI back to that exact loop state without needing to rerun.
3. **Accumulator Tracking:**
   - Identifies variables that mutate across loop cycles (e.g., `sum_total += val`, `cleaned.append(...)`).
   - Renders a mini growth badge showing the collection expanding in real time.

### 4.2 Branch Decision Visualizer
When execution hits an `if` / `elif` / `else` statement:
1. **Expression Sub-Evaluation:** Deconstructs compound boolean expressions:
   - Example code: `if user.is_active and score >= 50:`
   - Breakdown: `user.is_active (True) and score >= 50 (72 >= 50 -> True) => Branch TAKEN (Entering line 15)`.
2. **Skipped Branch Dimming:** Dims lines in the code viewer that were bypassed, clarifying execution flow.

### 4.3 State & Mutation Inspector
1. **Delta-Driven Variable Cards:**
   - Variables that changed in the current step pulse with color:
     - **Green Badge:** Variable created (`+ new_var = 10`).
     - **Amber Badge:** Variable mutated (`records: length 2 -> 3`).
     - **Red Strike:** Variable deleted or scoped out.
2. **Complex Structure Unpacking:**
   - Python `list`: Rendered as interactive chips showing index + item.
   - Python `dict`: Rendered as key-value property badges.
   - Pandas `DataFrame`: Displays row/column count, column names, memory footprint, and a 3-row data preview.

---

## 5. The Teammate Handoff Engine & Safe Insertion Markers

The biggest pain point when receiving code from a teammate is: **"Where can I safely add my changes without breaking their logic?"**

### 5.1 Safe Insertion Point Algorithm
The backend calculates variable lifecycles across the execution trace:
1. **Variable Lifecycle Extraction:**
   - `Born(var)`: Step ID and Line Number where `var` is first defined.
   - `Mutated(var)`: Set of line numbers where `var` is modified (reassigned, appended, updated).
   - `LastRead(var)`: Step ID and Line Number where `var` is consumed for the final time.
   - `TerminalState(var)`: Point after which `var` is stable and no longer mutated.
2. **Safe Insertion Heuristic:**
   A line $L$ is flagged as a **Safe Insertion Point** if:
   - A critical data structure (e.g., `cleaned_df`, `processed_records`) has reached its terminal or stable state.
   - Downstream dependent operations (e.g., file export, model training, API call) have not yet consumed it.
   - Injecting a transformation or filter at line $L$ will not break loop invariants or uninitialized references.

```
Variable Lifecycle Analysis:
raw_data     [===== Born L1 ===== Mutated L3 ===== Read L5 ===== Dead L10 =====================]
cleaned_list [=============== Born L5 ====== Appended L8 ====== STABLE L12 (SAFE HOOK) ======== Read L18]
metrics      [======================================================= Born L18 ===== Export L22]
                                                                        ▲
                                                                  [SAFE INSERTION]
                                                       "cleaned_list is complete & validated.
                                                        Safe to inject custom feature extraction."
```

### 5.2 Gutter Badges & Continuation Tips
- The code editor renders a glowing star marker `[★ Safe Hook]` in the line gutter.
- Clicking the marker opens Bob's **Continuation Guide**:
  - *"Your teammate finished aggregating `user_orders` on line 42. If you want to compute customer lifetime value, this is the safest line to insert your helper function `compute_clv(user_orders)`. Downstream code on line 55 only reads `summary_report`."*

---

## 6. Mode 2: ModelLens (ML Pipeline Auditor Migration)

ModelLens addresses data science and machine learning methodology pitfalls. Rather than existing as a disconnected tool, it is **migrated directly onto the LogicLens execution trace**.

### 6.1 Architectural Migration
Because the core tracer records every executed line, variable mutation, and DataFrame/array shape, ModelLens simply scans the existing trace events for known anti-patterns:
- **Heuristic 1: Data Leakage Detection:** Scans for `.fit()` / `.fit_transform()` on preprocessing transformers prior to `train_test_split`.
- **Heuristic 2: Target Class Imbalance:** Inspects target arrays in the trace; flags when class skew exceeds 80/20.
- **Heuristic 3: Model/Data Complexity Mismatch:** Identifies low-complexity linear estimators fitted to high-dimensional datasets.

### 6.2 ModelLens UI Overlay
When the user switches to ModelLens:
- The exact same code viewer and timeline scrubber are preserved.
- A **Methodology Risk Alert Bar** appears across the top.
- Red/Yellow hazard stripes appear on problematic lines in the code viewer.
- Clicking a hazard stripe reveals Bob's remediation code snippet.

---

## 7. System Architecture & Dataflow

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                     FRONTEND (React + Vite)                                      │
│                                                                                                  │
│   ┌────────────────────────┐  ┌──────────────────────────────────────────────────────────────┐   │
│   │   Intake Page          │  │                      Studio Workspace                        │   │
│   │  - Mode Toggle         │  │  - Syntax-Highlighted Editor (Monaco/Prism + Gutter Markers) │   │
│   │  - Paste / File Drop   │  │  - Interactive Scrubber (Step / Play / Loop Jump)            │   │
│   │  - Sample Pre-loaders  │  │  - Manual Visualizers (LoopDial, BranchGraph, StateBoard)    │   │
│   └───────────┬────────────┘  │  - Bob Contextual Intent & Handoff Drawer                    │   │
│               │               │  - ModelLens ML Risk Banner (Mode 2)                         │   │
│               │               └──────────────────────────────▲───────────────────────────────┘   │
└───────────────┼──────────────────────────────────────────────┼───────────────────────────────────┘
                │ HTTP POST /api/trace                         │ JSON Response
                ▼                                              │
┌──────────────────────────────────────────────────────────────┴───────────────────────────────────┐
│                                     BACKEND (FastAPI Core)                                       │
│                                                                                                  │
│  1. Ingestion & Normalizer (`services/ingestion.py`)                                             │
│     - Cleans code, strips unsafe environment calls, handles .py / .ipynb cells                   │
│                                                                                                  │
│  2. AST Control-Flow Pre-Pass (`services/ast_flow.py`)                                           │
│     - Builds AST syntax tree, indexes loop boundaries (`For`, `While`)                           │
│     - Maps conditional branches (`If`, `Compare`) and variable assignment targets                │
│                                                                                                  │
│  3. Deterministic Sandbox Tracer (`services/tracer.py` & `services/sandbox.py`)                  │
│     - Isolated execution environment with hard timeout (max 10s) and memory caps (256MB)         │
│     - `sys.settrace` interceptor capturing line, call, return, and exception events              │
│     - Frame State Diff Engine: computes delta between step $N-1$ and step $N$                    │
│     - Correlates runtime lines with AST nodes to produce deterministic Control Flow Events       │
│                                                                                                  │
│  4. Safe Insertion Analyzer (`services/handoff_analyzer.py`)                                     │
│     - Computes variable lifecycles (birth, mutation, terminal read)                              │
│     - Calculates Safe Insertion Points for teammate handoff                                      │
│                                                                                                  │
│  5. Router & Mode Dispatcher                                                                     │
│     ├── IF MODE == "logic_lens" (Mode 1 Primary):                                                │
│     │   └── Bob Client (`services/bob_client.py`): Batched/streamed line intent & handoff tips  │
│     └── IF MODE == "model_lens" (Mode 2 Migrated):                                               │
│         └── ML Auditor Engine (`services/ml_diagnostics.py`): Scans trace for leakage/imbalance │
└──────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 8. Core Data Contracts & API Schemas

### 8.1 Input Payload (`POST /api/trace`)
```typescript
export interface TraceRequest {
  mode: "logic_lens" | "model_lens";
  filename?: string;
  code: string;
  max_steps?: number; // Default: 300 (prevents runaway memory)
}
```

### 8.2 Execution Step & Control Flow Schema
```typescript
export type EventType = 
  | "line" 
  | "call" 
  | "return" 
  | "loop_entry" 
  | "loop_iteration" 
  | "loop_exit" 
  | "branch_decision" 
  | "exception";

export interface VariableDelta {
  action: "created" | "mutated" | "unchanged" | "deleted";
  var_name: string;
  type_name: string; // "int", "str", "list", "dict", "DataFrame", etc.
  old_value: any;
  new_value: any;
  repr_str: string; // Compact string for UI chip: e.g. "['Alice', 'Bob']"
  metadata?: {
    length?: number;
    shape?: [number, number]; // For DataFrames/arrays
    columns?: string[];
    null_count?: number;
  };
}

export interface LoopFlowContext {
  loop_id: string; // e.g. "loop_L4"
  loop_type: "for" | "while";
  header_line: number;
  current_iteration: number;
  total_iterations?: number;
  iterator_target?: string;  // e.g. "u"
  iterator_value?: any;      // e.g. "bob"
  is_exit_step: boolean;
}

export interface BranchFlowContext {
  branch_id: string; // e.g. "branch_L5"
  header_line: number;
  condition_code: string; // "len(u) > 0"
  evaluated_truth: boolean;
  taken_line: number;
  skipped_range?: [number, number];
}

export interface TraceStep {
  step_id: number;
  line_number: number;
  code_line: string;
  event_type: EventType;
  loop_context?: LoopFlowContext;
  branch_context?: BranchFlowContext;
  variable_deltas: Record<string, VariableDelta>;
  all_variables: Record<string, string>; // Full snapshot representation
  stdout_emitted?: string;
}
```

### 8.3 Safe Insertion Point Schema
```typescript
export interface SafeInsertionPoint {
  line_number: number;
  target_variable: string;
  reason: string;
  confidence: "high" | "medium";
  suggested_action: string;
  boilerplate_hook: string;
}
```

### 8.4 Line Explanation & Handoff Schema (`POST /api/explain-step`)
```typescript
export interface StepExplanation {
  step_id: number;
  line_number: number;
  intent_summary: string;
  detailed_explanation: string;
  teammate_logic_note: string;
  safe_to_extend: boolean;
  continuation_tip?: string;
}
```

### 8.5 ModelLens Audit Schema (Mode 2)
```typescript
export interface MLAuditIssue {
  issue_id: string;
  step_id: number;
  line_number: number;
  category: "data_leakage" | "class_imbalance" | "preprocessing_mismatch" | "metric_mismatch";
  severity: "critical" | "warning" | "info";
  title: string;
  message: string;
  offending_code: string;
  remediation_code: string;
  explanation: string;
}
```

---

## 9. Detailed Phase-by-Phase Implementation Roadmap

This section provides the actionable implementation instructions for every phase of the 48-hour build.

```
Hour:  0    6   12   18   24   30   36   42   48
       |----|----|----|----|----|----|----|----|
Phase 0: [ Scaffold & Intake UI ]
Phase 1: [ Deterministic Sandbox Tracer (P0) ]
Phase 2:      [ Studio Workspace & Scrubber (P0) ]
Phase 3:           [ Manual Visualizers (P0 Core) ]
Phase 4:                [ Teammate Handoff & Bob (P1) ]
Phase 5:                     [ ModelLens Migration (P2) ]
Phase 6:                          [ Polish & Video ]
```

---

### Phase 0: Project Scaffold, Mode Intake UI & Contract Mocking (Hours 0–4)
**Goal:** Establish the monorepo structure, deploy hello-world skeletons to cloud hosting, and implement the Mode Selection Intake UI with mocked API contracts.

#### Implementation Instructions
1. **Repository Layout:**
   - Create `backend/` with FastAPI, Uvicorn, and Pydantic.
   - Create `frontend/` with Vite, React, and Tailwind CSS.
2. **Mode Intake Screen (`CodeInputPane.jsx` & `ModeSelector.jsx`):**
   - Implement the landing screen featuring a prominent mode switch:
     - **Option 1 (Default):** LogicLens (Visual Walkthrough & Teammate Handoff).
     - **Option 2:** ModelLens (ML Methodology Auditor).
   - Add a multi-tab input selector:
     - Tab A: Raw code textarea (with line numbers and placeholder teammate code).
     - Tab B: File dropzone accepting `.py` and `.ipynb` files.
     - Tab C: One-click "Load Sample Teammate Script" button.
3. **Mock Contract Layer (`backend/app/routers/trace.py`):**
   - Before building the real tracer, create a mock endpoint returning a pre-recorded 5-step trace matching the schema in Section 8.
   - This allows frontend developers to build the Studio UI immediately without waiting for the backend tracer.
4. **Deployment Verification:**
   - Connect GitHub repo to Vercel (Frontend) and Railway or Render (Backend). Verify live CORS connectivity.

#### Verification & Test Criteria
- Navigating to the root URL displays the Mode Switcher and Code Input pane.
- Clicking "Load Sample Teammate Script" populates the textarea with sample code.
- Clicking "Trace & Walk Through" sends the mock payload and receives HTTP 200 with 5 mock steps.

---

### Phase 1: Deterministic Execution Sandbox & AST Tracer (Hours 4–14) — P0
**Goal:** Build the 100% deterministic Python execution tracer using `sys.settrace` and AST mapping to produce ground-truth runtime step events without AI hallucination.

#### Implementation Instructions
1. **AST Flow Pre-Pass (`services/ast_flow.py`):**
   - Parse the incoming Python script using Python's native `ast.parse()`.
   - Traverse the AST tree using `ast.walk` to index:
     - **Loop nodes (`ast.For`, `ast.While`):** Record header line, body line range, and loop target variable names (e.g., target `u` in `for u in users:`).
     - **Branch nodes (`ast.If`):** Record header line, raw source condition string (e.g., `len(u) > 0`), and body entry lines.
   - Store these in lookup dictionaries keyed by line number for $O(1)$ access during runtime execution.
2. **Deterministic Tracer Implementation (`services/tracer.py`):**
   - Implement a tracer class that registers a callback with `sys.settrace()`.
   - Filter events: Trace only lines where `frame.f_code.co_filename == "<tracelens_user_code>"`, ignoring internal libraries.
   - On each `'line'` event:
     - Extract `frame.f_locals`.
     - Calculate **Variable Deltas**: Compare current frame locals against the previous frame locals to classify variables as `created`, `mutated`, `unchanged`, or `deleted`.
     - Compute safe string representations and metadata (e.g., list length, dictionary key previews, DataFrame shapes).
     - Correlate the current line with the AST lookup map to attach `loop_context` or `branch_context`.
   - Implement step limiting: Terminate tracing if `step_counter >= max_steps` (default 300) to protect against memory exhaustion.
3. **Sandbox Security & Process Isolation (`services/sandbox.py`):**
   - Execute user code in a dedicated subprocess or isolated thread.
   - Apply strict safeguards:
     - Enforce a hard timeout (maximum 8 seconds) to prevent infinite loops (`while True:`).
     - Restrict dangerous builtins (block `os.system`, `subprocess`, `open`, `socket`).
4. **Serialization Engine:**
   - Build a safe serializer that converts complex objects (sets, tuples, custom classes, NumPy arrays, Pandas DataFrames) into JSON-compatible strings and UI preview chips without crashing.

#### Verification & Test Criteria
- Run a script with a 4-iteration `for` loop: Verify that `tracer.py` produces exactly 4 loop iteration steps, accurately logging the mutation of the loop target variable on each step.
- Run a script with a deliberate `while True:` loop: Verify that the sandbox terminates after the timeout threshold and returns a clean timeout error instead of crashing the server.

---

### Phase 2: Frontend Studio Workspace & Playback Scrubber (Hours 12–20) — P0
**Goal:** Build the interactive 4-pane Studio layout and playback scrubber that allows users to step forward, step backward, or auto-play through execution history.

#### Implementation Instructions
1. **Studio Grid Layout (`App.jsx`):**
   - Build a responsive 4-pane interface:
     - **Left Column (40% width):** Code Viewer with line highlight and gutter markers.
     - **Center Column (35% width):** Manual Visualizer Canvas (Loop dials, Branch decisions, State board).
     - **Right Column (25% width):** Teammate Handoff & Intent Drawer.
2. **Interactive Playback Scrubber (`TracePlayer.jsx`):**
   - Implement execution playback state:
     - `currentStepIndex`: Integer pointer into the `steps` array.
     - `isPlaying`: Boolean flag for auto-play mode.
     - `playbackSpeed`: 1x (800ms per step), 2x (400ms per step), 0.5x (1600ms per step).
   - Controls:
     - **Step Forward (`▶|`):** Increments `currentStepIndex`.
     - **Step Backward (`|◀`):** Decrements `currentStepIndex`.
     - **Play/Pause (`▶` / `⏸`):** Toggles automated `setInterval` timer.
     - **Jump to Loop Start / Loop End:** Skips directly to loop boundary steps.
     - **Range Slider:** Allows the user to scrub freely across the entire execution timeline.
3. **Code Viewer Component (`CodeViewer.jsx`):**
   - Integrate Monaco Editor or Prism.js in read-only mode.
   - Synchronize the active line: When `currentStepIndex` updates, automatically scroll to and highlight the corresponding line with a glowing accent indicator.
   - Gutter Decoration Layer: Render custom DOM elements in the line gutter for **Safe Insertion Markers** and **Audit Warnings**.

#### Verification & Test Criteria
- Pressing Step Forward advances the highlighted line in the code viewer and updates the step counter (`Step X of Y`).
- Dragging the scrubber slider instantly updates the highlighted line without lag or flickering.
- Auto-play smoothly advances through steps at the selected playback speed.

---

### Phase 3: Manual Visualizers Implementation (Hours 18–28) — P0 Core
**Goal:** Build the manual visualizer components that transform raw code execution into intuitive, visual animations of loops, branches, and memory mutations.

#### Implementation Instructions
1. **Loop Visualizer (`LoopVisualizer.jsx`):**
   - Detect when `currentStep.loop_context` is present.
   - **Progress Dial:** Render a visual progress indicator showing `Iteration N of M` (or animated pulsing dots for indeterminate `while` loops).
   - **Target Variable Card:** Display the active loop item variable in a highlighted chip (e.g., `u: 'bob'`).
   - **Iteration Carousel:** Render mini-cards representing each completed iteration. Clicking any mini-card updates `currentStepIndex` directly to that iteration's entry step.
   - **Accumulator Watcher:** If a variable grows during the loop (e.g., `cleaned.append(...)`), display an increment counter (`List size: 1 ➔ 2`).
2. **Branch Decision Visualizer (`BranchVisualizer.jsx`):**
   - Detect when `currentStep.branch_context` is present.
   - Display the condition string in monospace (e.g., `len(u) > 0`).
   - Render a glowing outcome badge:
     - **Green (`TRUE / TAKEN`):** Condition was satisfied; show pointer to the executed line.
     - **Red (`FALSE / SKIPPED`):** Condition failed; display note indicating that the `else` or next block was entered.
3. **State & Mutation Board (`StateBoard.jsx`):**
   - Split memory display into two distinct sections:
     - **Top Section (Step Deltas):** Render cards only for variables modified on the current step. Use clear color coding: green for created, amber for mutated, red for deleted. Show `old_value ➔ new_value`.
     - **Bottom Section (Active Scope Snapshot):** A clean tabular view of all variables currently in scope with their type and value string.
   - Structure formatting: Render Python lists as sequential item chips and dictionaries as key-value property badges.

#### Verification & Test Criteria
- Stepping onto a `for` loop header displays the Loop Visualizer with iteration #1 and target variable value.
- Stepping onto an `if` statement clearly indicates whether the branch evaluated to True or False.
- Modifying a list in the code immediately triggers an amber delta card in the State Board.

---

### Phase 4: Teammate Handoff & Safe Insertion Engine (Hours 26–34) — P1
**Goal:** Implement the variable lifecycle analysis algorithm that pinpoints Safe Insertion Points and connect IBM Bob to provide line-by-line intent and continuation guidance.

#### Implementation Instructions
1. **Safe Insertion Analyzer (`services/handoff_analyzer.py`):**
   - Scan all steps to build a variable lifecycle ledger:
     - For each variable: record `born_line`, `mutation_lines[]`, and `last_read_line`.
   - Identify candidate insertion points:
     - Look for lines immediately following loops or data cleaning blocks where an accumulator variable (e.g., `cleaned_data`) has reached its terminal state and is not mutated again.
     - Check that downstream code has not yet consumed the variable for export or model fitting.
   - Format each insertion point with:
     - `line_number`: Exact line where code can be added.
     - `reason`: Explanation of why this location is safe.
     - `suggested_action`: Example feature (e.g., "Add custom email validation filter").
     - `boilerplate_hook`: Ready-to-copy code snippet.
2. **Editor Gutter Integration:**
   - Display a glowing star icon `[★ Safe Hook]` in the editor gutter on safe insertion lines.
   - Clicking the marker opens a popover displaying the handoff rationale and the copyable code snippet.
3. **IBM Bob Intent Explainer (`services/bob_client.py` & `BobExplainerPane.jsx`):**
   - Connect backend to IBM Bob API (or local fallback stub).
   - Pass prompt with: current code line, variable deltas, and memory snapshot.
   - Receive JSON containing `intent_summary`, `teammate_logic_note`, and `continuation_tip`.
   - Implement frontend caching: Cache explanations in memory by `step_id` so scrubbing back and forth does not trigger redundant API calls.

#### Verification & Test Criteria
- In `teammate_pipeline.py`, the system identifies line 25 (immediately after the cleaning loop) as a high-confidence Safe Insertion Point.
- Clicking the gutter marker on line 25 displays the continuation tip: *"Safe to insert logic here — cleaned_records is fully populated."*
- As the user steps through lines, the Bob Explainer Pane updates with concise, line-specific intent notes.

---

### Phase 5: ModelLens (ML Auditor) Migration & Risk Overlays (Hours 32–40) — P2
**Goal:** Migrate the ML methodology auditor on top of the deterministic trace engine, detecting data leakage, class imbalance, and model mismatches without duplicating infrastructure.

#### Implementation Instructions
1. **Auditor Engine (`services/ml_diagnostics.py`):**
   - Build a diagnostic analyzer that takes the existing trace steps and raw code as input.
   - **Check 1: Pre-Split Data Leakage:**
     - Parse AST to detect call sites of `StandardScaler`, `MinMaxScaler`, or `OneHotEncoder` methods (`.fit()` or `.fit_transform()`).
     - Detect call sites of `train_test_split()`.
     - Flag critical leakage if any `.fit()` call occurs on a line before `train_test_split()`.
   - **Check 2: Target Class Imbalance:**
     - Inspect variable values for names like `y`, `y_train`, `labels`, or `target` in trace step deltas.
     - Compute the distribution of classes. If the majority class exceeds 80% of total samples, generate a warning with the calculated ratio.
   - **Check 3: Estimator/Data Expressiveness Mismatch:**
     - Compare feature count (from DataFrame or array shape) against estimator type (e.g., linear models on high-dimensional sparse data).
2. **ModelLens UI Layer (`MLAuditBanner.jsx`):**
   - When the user selects `model_lens` mode:
     - Render a sticky warning banner above the Studio workspace showing total detected issues.
     - Add hazard stripe gutter markers in the code viewer on lines with detected anti-patterns.
     - Clicking a hazard marker opens Bob's ML remediation panel showing the exact code refactor (e.g., wrapping transforms in an `sklearn.pipeline.Pipeline`).

#### Verification & Test Criteria
- Tracing `dsai_leakage_sample.py` in ModelLens mode triggers a critical Data Leakage alert on line 12.
- The remediation panel displays the corrected snippet showing `train_test_split` executed before `scaler.fit()`.

---

### Phase 6: End-to-End Polish, Demo Scripts & Lablab Submission (Hours 40–48)
**Goal:** Finalize demo test scripts, polish UI aesthetics, record the 90-second pitch video, and complete hackathon submission deliverables.

#### Implementation Instructions
1. **Demo Script Rehearsal:**
   - Verify `teammate_pipeline.py` (Mode 1 primary pitch) runs flawlessly from clean browser state.
   - Verify `dsai_leakage_sample.py` (Mode 2 secondary pitch) triggers the audit warning immediately.
   - Add one-click sample buttons on the intake page so evaluators and judges can test both modes with zero typing.
2. **Visual & UX Polish:**
   - Ensure clean dark mode aesthetics (Slate 950 background, Indigo accents, Emerald success badges).
   - Ensure responsive layout works on standard 1080p desktop displays.
   - Add empty states, loading skeletons, and graceful error alerts for invalid Python syntax.
3. **90-Second Demo Video Recording:**
   - *0:00–0:20 (The Hook):* Show the problem — inheriting a teammate's script; generic AI summaries don't tell you runtime behavior or where to add code safely.
   - *0:20–0:55 (Mode 1 Showcase):* Paste teammate script. Step through the loop visualizer, show the branch decision evaluator, inspect variable deltas, and highlight the Safe Insertion Marker.
   - *0:55–1:15 (Mode 2 Showcase):* Switch to ModelLens mode. Show instant detection of pre-split data leakage with Bob's automated refactor.
   - *1:15–1:30 (Tech & Closing):* Highlight deterministic `sys.settrace` architecture + IBM Bob intent integration.
4. **Final Deliverables & Submission:**
   - Deploy backend to Railway/Render and frontend to Vercel.
   - Complete Lablab.ai submission form with project description, live demo link, and pitch video URL.

---

## 10. IBM Bob Prompt Engineering & Explainer Integration

The AI engine in TraceLens translates measured runtime states into actionable human intent. Below are the production prompt templates:

### 10.1 Line-by-Line Contextual Intent Prompt
```
System Prompt:
You are an expert software engineer acting as a pair programming assistant. The user has inherited a Python script from a teammate and is stepping through it line by line. Explain the intent of the current line based on measured runtime execution state.

Input Context:
- File Name: {filename}
- Current Line Number: {line_number}
- Code Line: {code_line}
- Variables Mutated This Step: {variable_deltas}
- Local Memory Snapshot: {all_variables}

Instructions:
1. Explain what the teammate was achieving on this specific line.
2. Note why this logic was structured this way.
3. State whether it is safe to modify or hook into this line, and provide a tip for extending it.

Output strictly valid JSON with keys:
{
  "intent_summary": "One sentence summary of intent",
  "detailed_explanation": "2-3 sentence mechanical and logical breakdown",
  "teammate_logic_note": "Explanation of teammate design pattern or decision",
  "safe_to_extend": true | false,
  "continuation_tip": "Concrete advice for where to inject new logic"
}
```

### 10.2 Teammate Handoff Summary Prompt
```
System Prompt:
You are a senior technical lead reviewing a completed execution trace of a teammate's script. Produce a handoff guide so the next developer can continue the work without introducing bugs.

Input Context:
- Full Script: {code}
- Detected Safe Insertion Points: {safe_insertion_points}
- Final Variable States: {terminal_variables}

Output strictly valid JSON with keys:
{
  "overall_purpose": "High-level summary of script workflow",
  "key_data_structures": [
    {"name": "var_name", "role": "what it holds", "final_state_summary": "size and contents"}
  ],
  "safe_continuation_strategy": "Step-by-step guidance on how the developer should extend this script",
  "cautions_for_teammate": ["List of pitfalls or invariants to maintain"]
}
```

---

## 11. Ready-to-Run Demo Test Scripts

### 11.1 Demo Script 1: Main Mode Teammate Handoff (`teammate_pipeline.py`)
```python
# teammate_pipeline.py — Inherited from "Alex" (Teammate)
raw_logs = [
    {"user": " alice ", "action": "login", "status": 200},
    {"user": "bob", "action": "upload", "status": 500},
    {"user": "", "action": "ping", "status": 200},
    {"user": "charlie", "action": "logout", "status": 200}
]

cleaned_records = []
error_count = 0

# Teammate loop: sanitize user records and count 500 errors
for record in raw_logs:
    name = record["user"].strip().capitalize()
    if len(name) > 0:
        if record["status"] >= 400:
            error_count += 1
        cleaned_records.append({
            "user": name,
            "action": record["action"],
            "success": record["status"] < 400
        })

# [★ SAFE INSERTION POINT: Line 25]
# Alex finished cleaning records. Safe to insert Slack alert webhook or extra filters here!
summary = {
    "total_valid": len(cleaned_records),
    "total_errors": error_count
}
print("Summary:", summary)
```

### 11.2 Demo Script 2: ML Mode Pipeline Audit (`dsai_leakage_sample.py`)
```python
# dsai_leakage_sample.py — Inherited from "Jordan" (Data Scientist)
import numpy as np
from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import train_test_split

# Generate dummy feature matrix and heavily imbalanced target (90% class 0)
X = np.random.randn(100, 4)
y = np.array([0] * 90 + [1] * 10)

# BUG: Data Leakage — Fitting scaler across entire dataset before splitting!
scaler = StandardScaler()
X_scaled = scaler.fit_transform(X)

# Split happens AFTER scaler already saw test set statistics
X_train, X_test, y_train, y_test = train_test_split(X_scaled, y, test_size=0.2)

print("Dataset ready. Train size:", len(X_train))
```

---

## 12. Risk Matrix & Defensive Engineering Guardrails

| Risk | Severity | Root Cause | Engineering Safeguard |
|---|---|---|---|
| **Infinite loops in user code** | Critical | User pastes `while True:` or bad loop condition | Subprocess hard kill after 8 seconds; `max_steps` cap set to 300 steps. |
| **Bob API rate limit / latency** | High | LLM called on every step during scrubbing | Cache explanations by `step_id` on frontend; provide instant local fallback when API key is absent. |
| **Large DataFrame memory bloat** | High | User loads 1M row CSV | Serializer captures only shape, column names, and 3-row head preview — never full array memory. |
| **Dangerous Python builtins** | Critical | User code executes `os.system("rm -rf")` | Sandbox runs in restricted namespace; blocks `os`, `sys`, `subprocess`, `socket`, `open`. |
| **Scrubber UI out of sync** | Medium | State updates lag behind fast slider dragging | Debounce scrubber slider by 40ms; render directly from pre-indexed step array. |

---

## Summary Checklist for Developers & AI Assistants
- [ ] Complete Phase 0 monorepo setup, Mode intake UI, and mock API connectivity.
- [ ] Implement Phase 1 `sys.settrace` engine and AST loop/branch mapper.
- [ ] Implement Phase 2 interactive scrubber and synchronized code viewer.
- [ ] Implement Phase 3 manual visualizers (`LoopVisualizer`, `BranchVisualizer`, `StateBoard`).
- [ ] Implement Phase 4 Safe Insertion Point calculator and Bob contextual explainer.
- [ ] Implement Phase 5 ModelLens ML diagnostics overlay for data leakage and class skew.
- [ ] Run both demo scripts (`teammate_pipeline.py` and `dsai_leakage_sample.py`), record pitch video, and submit.