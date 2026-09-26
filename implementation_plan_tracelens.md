# Implementation Plan: TraceLens — Visual Code Walkthrough & DSAI Auditor
**Event:** IBM Bob 2.0 Hackathon (lablab.ai), Sep 25–27, 2026 — 48-hour build  
**Team:** The Overfitters  

> **Single Source of Truth:** Anyone joining a workstream — human developer or AI coding assistant (Bob, Claude Code, Cursor) — can read this document alone to understand the architecture, data contracts, mode priority, and build sequence.

---

## 1. Executive Summary & Product Vision

### The Core Problem: The Teammate Handoff Gap
When inheriting a teammate's Python script or notebook, developers face a painful dilemma:
- **Generic LLM summaries are too high-level:** An AI prompt ("explain this file") gives a hand-waving summary that obscures runtime mutations, off-by-one loop boundaries, and hidden variable states.
- **Manual code reading is slow and bug-prone:** To continue a teammate's work or patch in a feature, developers must mentally simulate execution to figure out where variables are created, how collections mutate, and where it is safe to inject new logic without causing regressions.

### The Solution: Two Complementary Modes (Main Mode Prioritized)

The platform provides a unified code intake landing page where users select between two operational modes:

```
                      ┌───────────────────────────────────────┐
                      │          Landing / Input Page         │
                      │  (Paste Code / Upload / GitHub Link)  │
                      └──────────────────┬────────────────────┘
                                         │
                    Mode Toggle: Which lens do you need?
                                         │
                 ┌───────────────────────┴────────────────────────┐
                 ▼                                                ▼
     ┌───────────────────────┐                        ┌───────────────────────┐
     │   MODE 1 (PRIMARY)    │                        │   MODE 2 (SECONDARY)  │
     │      LogicLens        │                        │     DSAI Auditor      │
     │ (Visual Walkthrough & │                        │ (ML & Data Science    │
     │   Teammate Handoff)   │                        │   Quality Defense)    │
     └───────────────────────┘                        └───────────────────────┘
```

1. **Mode 1: "LogicLens" (Main Mode — TOP BUILD PRIORITY)**
   - **Target Audience:** Developers continuing work on a teammate's Python script, onboarding to a new codebase, or debugging complex logic.
   - **How it works:** A **deterministic, manual runtime visualizer** coupled with **line-by-line contextual AI explanation**. It does **not** rely on AI hallucinations to simulate code execution. Instead, the backend traces Python execution natively and extracts concrete control-flow artifacts:
     - **Loop Visualizer:** Animates loop iterations, index progression, accumulator states, and termination conditions.
     - **State Mutation Dials:** Visualizes arrays, dictionaries, and variable mutations step by step.
     - **Branching Decision Trees:** Highlights why specific `if`/`elif`/`else` branches executed.
     - **"Safe Insertion Markers":** Highlights exactly where a developer can hook into the teammate's script safely.
   - **AI Brain (Bob):** Explains *why* the teammate wrote each line that way, what design pattern or logic was intended, and tips for extending it.

2. **Mode 2: "DSAI Auditor" (ML Mode — Migrated onto Core Tracer)**
   - **Target Audience:** Data scientists and ML engineers checking for methodology bugs.
   - **How it works:** Extends the Mode 1 trace timeline with AST & runtime heuristics to detect silent machine learning failures:
     - Pre-split data leakage (scaler/encoder fit before `train_test_split`).
     - Severe class imbalance in target vectors.
     - Model/data expressiveness mismatch.
   - **AI Brain (Bob):** Generates actionable ML diagnosis cards and remediation suggestions.

---

## 2. Unified System Architecture

The architecture prioritizes the **deterministic execution tracer** as the foundational backbone. Mode 1 and Mode 2 share 80% of the backend pipeline:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           FRONTEND (React + Vite)                           │
│  - Mode Selector: [ LogicLens (Walkthrough) | DSAI Auditor (ML Mode) ]      │
│  - Input: Paste Code / File Dropzone (.py, .ipynb) / GitHub File Picker     │
│  - Interactive Trace Scrubber (Step Forward / Back / Play / Pause)          │
│  - Control Flow Canvas (Loop Iterations, Branch Visualizer, Variable Table) │
│  - Line-by-Line AI Explanation Drawer + Safe Insertion Points Guide         │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │ HTTP POST /api/trace & /api/analyze
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           BACKEND (FastAPI Core)                            │
│                                                                             │
│  1. Ingestion Engine (`ingestion.py`)                                       │
│     Normalizes .py, .ipynb, and GitHub fetches into standard Source format  │
│                                                                             │
│  2. Sandbox Execution & Deterministic Tracer (`tracer.py`)                  │
│     Subprocess with resource limits (CPU/Memory/Timeout)                    │
│     `sys.settrace` + AST visitor capturing concrete frame state:            │
│     - Variable diffs (added, mutated, deleted)                              │
│     - Loop lifecycle (loop header, iteration count, current item)          │
│     - Branch outcomes (condition evaluated True/False)                      │
│     - DataFrames & Arrays (shape, stats, types)                             │
│                                                                             │
│  3. Mode Splitter & Dispatcher (`orchestrator.py`)                          │
│     ├── IF MODE == "main" (LogicLens):                                      │
│     │   ├── Flow Structurer: aggregates loop frames into loop blocks        │
│     │   └── Bob Client: generates line/block intent & continuation guidance │
│     │                                                                       │
│     └── IF MODE == "dsai" (DSAI Auditor):                                   │
│         ├── Diagnostics Engine: AST heuristics (data leakage, imbalance)    │
│         └── Bob Client: contextual ML methodology critique                  │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Data Contracts & Schemas

### 3.1 Normalized Input (`Source`)
```json
{
  "mode": "logic_lens", 
  "filename": "pipeline_step.py",
  "language": "python",
  "raw_code": "users = ['alice', 'bob']\nfor u in users:\n    print(u.upper())",
  "cell_map": []
}
```

### 3.2 Deterministic Execution Trace (Mode 1 Primary Contract)
```json
{
  "total_steps": 4,
  "steps": [
    {
      "step_id": 0,
      "line_number": 1,
      "event_type": "assignment",
      "code_line": "users = ['alice', 'bob']",
      "control_flow": {
        "block_type": "standard",
        "loop_id": null,
        "iteration": null
      },
      "variable_deltas": {
        "users": {"action": "created", "type": "list", "value": ["alice", "bob"], "length": 2}
      }
    },
    {
      "step_id": 1,
      "line_number": 2,
      "event_type": "loop_entry",
      "code_line": "for u in users:",
      "control_flow": {
        "block_type": "for_loop",
        "loop_id": "loop_L2",
        "iteration": 1,
        "total_iterations_expected": 2,
        "iter_target": "u",
        "iter_value": "alice"
      },
      "variable_deltas": {
        "u": {"action": "assigned", "type": "str", "value": "alice"}
      }
    }
  ]
}
```

### 3.3 Explanations & Handoff Guidance (`/api/explain-step`)
```json
{
  "step_id": 1,
  "line_number": 2,
  "explanation": "Iterates through the teammate's list of `users`. On this step (iteration 1 of 2), `u` is assigned 'alice'.",
  "developer_context": {
    "intent": "Prepares user identifiers for string normalization.",
    "safe_to_extend": true,
    "extension_tip": "If you need to filter specific users, insert a conditional check immediately inside this loop before line 3."
  }
}
```

### 3.4 DSAI Audit Extension (Mode 2 Payload)
```json
{
  "audit_issues": [
    {
      "step_id": 4,
      "line_number": 14,
      "type": "data_leakage",
      "severity": "high",
      "title": "Data Leakage Detected",
      "message": "Scaler fit occurred before dataset split.",
      "remediation": "Fit the scaler solely on X_train after train_test_split."
    }
  ]
}
```

---

## 4. Workstream Breakdown & Prioritized Roadmap

```
Hour: 0    6   12   18   24   30   36   42  48
      |----|----|----|----|----|----|----|---|
W1:   [ P0: Scaffold & Mode Switch UI ]
W2:   [ P1: Deterministic Engine (sys.settrace) ]
W3:        [ P2: LogicLens Visualizer (Frontend) ]
W4:             [ P3: Bob Handoff Explainer ]
W5:                  [ P4: Migrate ML Mode ]
W6:                       [ P5: Demo & Polish ]
```

---

### Phase 0: Setup, Contracts & Mode Switcher (Hours 0–4)
**Goal:** Full-stack skeleton deployed with Mode Toggle UI and mocking pipeline.

- **Tasks:**
  - Repo setup: FastAPI backend + React/Vite frontend (Tailwind CSS for UI).
  - Main Page Design: Create an intuitive toggle:
    - **LogicLens (Teammate Handoff & Logic Visualizer)** — *Default selected*.
    - **DSAI Auditor (ML Quality Check)**.
  - Setup mock trace responses for both modes so frontend and backend work concurrently.
  - Deploy frontend to Vercel and backend to Railway/Render. Verify live connection.

---

### Phase 1: Core Execution Sandbox & Manual Tracer (Hours 4–14) — *High Priority*
**Goal:** Execute user Python code safely and extract real execution frames without relying on AI simulation.

- **Sandbox Security (`sandbox_executor.py`):**
  - Run via isolated Python subprocess with hard timeout (max 10 seconds).
  - Apply `resource.setrlimit` caps on memory (256MB max) and CPU cycles.
  - Block network access flags and dangerous imports (`os.system`, `subprocess`, `socket`).
- **Deterministic Tracer (`tracer.py`):**
  - Utilize `sys.settrace` listening for `'line'`, `'call'`, `'return'` events.
  - State capture on each line:
    - Variable snapshot: extract locals, calculate diff from previous step (what variable was modified or created).
    - Data structure introspection: length, values (truncated if > 10 items), types.
    - DataFrames/Series: capture shape, dtypes, columns, null counts.
- **Control Flow AST Enrichment (`ast_flow.py`):**
  - Parse script via `ast` to map loop structures (`For`, `While`) and conditionals (`If`, `Compare`).
  - Correlate runtime trace lines with AST nodes so the tracer explicitly tags:
    - *Loop Start, Iteration count, Loop Exit.*
    - *Branch taken vs. Branch skipped.*

---

### Phase 2: LogicLens Frontend Visualizer (Hours 12–24) — *Core Innovation*
**Goal:** Build the visual execution interface that makes reading a teammate's code effortless.

- **Interactive Player Controls:**
  - Code Viewer with active line highlight synced with a playback scrubber (Step Next, Step Back, Auto-Play, Speed 1x/2x).
- **Control Flow Visualizations:**
  - **Loop Progress Dial:** When code enters a loop, display an interactive iteration counter (e.g., `Iteration 2 of 5: current item = 'bob'`) with an unrolled timeline of past iterations.
  - **Variable State Board:** Visual badges for local variables. When a variable changes, animate the badge with a pulse effect showing `old_value → new_value`.
  - **Collection Inspection:** Render Python lists and dicts as interactive chips instead of raw text strings.
- **Teammate Handoff Marker Panel:**
  - Mark terminal states of variables.
  - Flag "safe edit zones" where new variables or conditions can be slotted in without breaking downriver dependencies.

---

### Phase 3: Bob AI Contextual Explainer (Hours 22–30)
**Goal:** Connect IBM Bob to explain the logic and guide subsequent development.

- **Backend AI Prompts (`bob_client.py`):**
  - `explain_line_in_context(code_line, prior_state, next_state)`: Explains the exact mechanical and logical purpose of that line.
  - `explain_handoff_strategy(code, current_trace)`: Answers: *"If I need to continue my teammate's work, where should I hook in and what should I be careful of?"*
- **Caching Layer:**
  - Cache responses by `(hash(code_line), hash(variable_state))` to eliminate redundant API calls during scrubber scrubbing.
- **UI Integration:**
  - Side drawer displays Bob's "Logic Narrative" and "Safe Extension Guide" updating as the user steps through lines.

---

### Phase 4: Migrate & Plug in DSAI Auditor Mode (Hours 28–36)
**Goal:** Incorporate the ML methodology auditor into the new unified pipeline.

- **Heuristic Engine (`diagnostics.py`):**
  - Consumes the trace output generated in Phase 1.
  - *Check 1 (Leakage):* Detect `.fit()` / `.fit_transform()` on preprocessing transformers prior to `train_test_split`.
  - *Check 2 (Imbalance):* Inspect target arrays in the trace; flag when class skew exceeds 80/20.
  - *Check 3 (Model/Data Mismatch):* Identify low-complexity linear estimators fitted to high-dimensional datasets.
- **Audit UI Layer:**
  - When in "DSAI Auditor" mode, the player displays a dedicated **Methodology Risk Alert Bar** above the code pane.
  - Gutter alerts on problematic lines; clicking an alert opens Bob's diagnostic and remediation recommendation.

---

### Phase 5: Demo Script, Polish & Planted Examples (Hours 36–44)
**Goal:** Rehearse bulletproof demos for both modes.

- **Prepare Demo Samples:**
  1. **Demo 1 (LogicLens Mode - Primary Pitch):** A multi-step data processing script written by a "teammate" with nested loops, dictionary aggregations, and edge-case filtering. Show how LogicLens traces the loops visually, explains the teammate's intent line by line, and points out the exact line to add a new filter without creating regressions.
  2. **Demo 2 (DSAI Auditor Mode - Secondary Pitch):** A 15-line model training snippet with an insidious data leakage bug. Show the auditor flag the leakage on the timeline with Bob's fix.
- **UX Polish:**
  - Add smooth transitions, empty states, copy-paste sample buttons for instant judging evaluation.
  - Responsive layout for desktop judge evaluation.

---

### Phase 6: Video & Submission (Hours 44–48)
- Record 90-second focused pitch & demo video.
  - *0:00–0:25:* The problem (inheriting teammate code is painful; AI summaries don't prevent handoff bugs).
  - *0:25–1:05:* Live Demo of Mode 1 (LogicLens) showcasing the visual loop tracer, line explanations, and safe editing markers.
  - *1:05–1:20:* Switch to Mode 2 (DSAI Auditor) demonstrating ML methodology leak detection.
  - *1:20–1:30:* Tech stack summary and IBM Bob integration highlight.
- Final deployment validation on live public URLs.
- Submit hackathon deliverables on lablab.ai.

---

## 5. Directory Structure

```
tracelens/
├── backend/
│   ├── app/
│   │   ├── main.py                     # FastAPI entrypoint & CORS
│   │   ├── routers/
│   │   │   ├── trace.py                # POST /api/trace (LogicLens runner)
│   │   │   ├── explain.py              # POST /api/explain-step (Bob logic)
│   │   │   └── audit.py                # POST /api/audit (DSAI Auditor)
│   │   ├── services/
│   │   │   ├── ingestion.py            # Paste / File / GitHub fetcher
│   │   │   ├── sandbox.py              # Subprocess & resource management
│   │   │   ├── tracer.py               # Deterministic sys.settrace engine
│   │   │   ├── ast_flow.py             # AST loop/branch extractor
│   │   │   ├── diagnostics.py          # ML methodology heuristics
│   │   │   └── bob_client.py           # IBM Bob LLM client (with stub fallback)
│   │   └── models/
│   │       └── schemas.py              # Pydantic models for trace & states
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── ModeSelector.jsx        # Toggle: LogicLens vs. DSAI Auditor
│   │   │   ├── CodeInputPane.jsx       # Paste / Upload / GitHub URL tabs
│   │   │   ├── TracePlayer.jsx         # Stepper controls & playback timeline
│   │   │   ├── CodeViewer.jsx          # Monaco / Prism syntax-highlighted code
│   │   │   ├── visualizers/
│   │   │   │   ├── LoopVisualizer.jsx  # Loop counters & iteration dials
│   │   │   │   ├── StateBoard.jsx      # Variable mutation diff cards
│   │   │   │   └── BranchGraph.jsx     # If/Else outcome viewer
│   │   │   ├── BobExplainerPane.jsx    # Line logic & teammate handoff guide
│   │   │   └── DSAIAuditPanel.jsx      # Methodology risk flags & fixes
│   │   ├── App.jsx
│   │   └── main.jsx
│   ├── package.json
│   └── tailwind.config.js
├── sample_scripts/
│   ├── teammate_data_cleaning.py       # Primary demo: loops, state changes
│   └── dsai_leakage_sample.py          # Secondary demo: scaler before split
└── README.md
```

---

## 6. Risk Assessment & Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Infinite loop in user code freezes tracer | High | Subprocess enforced with strict 10s timeout; kill signal triggered automatically. |
| AST/Runtime trace mismatch on dynamic code | Medium | Rely strictly on line numbers reported by Python's native `sys.settrace`. |
| Bob API latency slows step playback | High | Pre-fetch explanations in background batches or generate on-demand with local client cache. |
| Over-complex custom visualizers burn hackathon time | High | Build simple, high-polish modular visualizers (Iteration Badge, Variable Diff Chip) before attempting complex graph trees. |
