# TraceLens — Staged Implementation Plan (AI-Agent Ready)

**Source spec:** `implementation_plan_tracelens.md` (original 744-line master spec)
**Event:** IBM Bob 2.0 Hackathon (lablab.ai), Sep 25–27, 2026
**Team:** The Overfitters

## Why this document exists

The original spec is correct and detailed, but it describes phases as broad, overlapping
hour-ranges ("Phase 2: Hours 12–20" while "Phase 1: Hours 4–14" is still running). That
overlap is exactly what causes an AI coding agent to "helpfully" keep going into the next
phase — there's no hard wall telling it to stop. This document restructures the same spec
into **15 strictly sequential, single-purpose stages**. Each stage:

- Touches a fixed, named list of files — nothing else.
- Has an explicit "do not do this yet" list of the most tempting overreach.
- Ends with a Definition of Done checklist and a hard **STOP**.

Hand an AI agent this whole file every time, and tell it which stage number to run using
the kickoff prompt below. It never needs to guess where a stage ends.

---

## Global Rules (apply to every stage, no exceptions)

1. Implement only what is listed under **"Build exactly this"** for the requested stage.
2. Create or modify only the files listed under **"Files you may touch"** for that stage.
3. If finishing the stage cleanly seems to require something from a later stage, insert a
   `# TODO(stage-N): <what belongs here later>` placeholder instead of building it now.
4. Never start on a later stage "while you're in there," even if it's one line of code away.
5. When the stage's work is done: list every file you created/modified, then walk through
   that stage's Definition of Done checklist item by item (pass/fail), then **STOP**. Do not
   ask "should I continue to the next stage?" and do not continue automatically.
6. If a requirement is ambiguous, implement the smallest version that satisfies the
   Definition of Done — not the most feature-complete version you can imagine.
7. Before starting, check the Progress Tracker below for which stages are already marked
   done. Do not skip ahead, and do not redo a completed stage without being asked.

---

## Progress Tracker

Tick these off manually as each stage is verified complete.

- [x] Stage 1 — Monorepo & Deployment Scaffold
- [x] Stage 2 — Frontend: Intake UI (mocked, no network)
- [x] Stage 3 — Backend: AST Control-Flow Pre-Pass
- [x] Stage 4 — Backend: Deterministic Tracer + Sandbox
- [x] Stage 5 — Backend: Real `/api/trace` Endpoint
- [x] Stage 6 — Frontend↔Backend Tunnel (replace mock with real API)
- [x] Stage 7 — Frontend: Studio Shell + Playback Scrubber
- [x] Stage 8 — Frontend: Manual Visualizers (Loop / Branch / State)
- [x] Stage 9 — Backend: Safe Insertion Analyzer
- [x] Stage 10 — Frontend: Gutter Markers + Handoff Drawer
- [x] Stage 11 — Backend: IBM Bob Client + `/api/explain-step`
- [x] Stage 12 — Frontend: Bob Explainer Pane
- [x] Stage 13 — Backend: ModelLens Diagnostics Engine
- [ ] Stage 14 — Frontend: ModelLens UI Overlay
- [ ] Stage 15 — Polish, Demo Rehearsal, Deploy, Submission

---

## Stage Kickoff Prompt (copy-paste this, fill in `{N}`, attach this whole file after it)

```
Implement ONLY Stage {N} of the TraceLens Staged Implementation Plan attached below —
nothing from any other stage, even if it looks convenient right now.

Follow the "Global Rules" section exactly.

Before writing any code, restate in one line: (a) Stage {N}'s objective, and
(b) the exact list of files you are about to create or modify.

When finished: list every file you created/modified, then go through Stage {N}'s
"Definition of Done" checklist item by item marking pass/fail, then STOP.
Do not proceed to Stage {N+1}.

[paste the whole plan document after this line]
```

---

## Tech Stack & Directory Layout (fixed reference — does not change per stage)

- Backend: FastAPI + Uvicorn + Pydantic (Python)
- Frontend: React + Vite + Tailwind CSS
- Editor/code viewer: Monaco or Prism.js
- Deploy: Frontend → Vercel, Backend → Railway or Render

```
tracelens/
├── backend/
│   ├── app/
│   │   ├── main.py
│   │   ├── routers/
│   │   │   ├── trace.py
│   │   │   └── explain.py
│   │   └── services/
│   │       ├── ast_flow.py
│   │       ├── tracer.py
│   │       ├── sandbox.py
│   │       ├── handoff_analyzer.py
│   │       ├── bob_client.py
│   │       └── ml_diagnostics.py
│   └── requirements.txt
└── frontend/
    ├── src/
    │   ├── App.jsx
    │   ├── api/
    │   │   └── traceClient.js
    │   └── components/
    │       ├── ModeSelector.jsx
    │       ├── CodeInputPane.jsx
    │       ├── TracePlayer.jsx
    │       ├── CodeViewer.jsx
    │       ├── LoopVisualizer.jsx
    │       ├── BranchVisualizer.jsx
    │       ├── StateBoard.jsx
    │       ├── HandoffDrawer.jsx
    │       ├── BobExplainerPane.jsx
    │       └── MLAuditBanner.jsx
    └── package.json
```

## Master File Manifest — which stage owns each file

| File | Created in | Later modified in |
|---|---|---|
| `backend/app/main.py` | 1 | 5 |
| `backend/app/routers/trace.py` | 1 (mock only) | 5, 9, 13 |
| `backend/app/services/ast_flow.py` | 3 | — |
| `backend/app/services/tracer.py` | 4 | — |
| `backend/app/services/sandbox.py` | 4 | — |
| `backend/app/services/handoff_analyzer.py` | 9 | — |
| `backend/app/routers/explain.py` | 11 | — |
| `backend/app/services/bob_client.py` | 11 | 14 (handoff summary prompt) |
| `backend/app/services/ml_diagnostics.py` | 13 | — |
| `frontend/src/components/ModeSelector.jsx` | 2 | — |
| `frontend/src/components/CodeInputPane.jsx` | 2 | — |
| `frontend/src/api/traceClient.js` | 6 | 11 |
| `frontend/src/App.jsx` | 7 | 8, 10, 12, 14 |
| `frontend/src/components/TracePlayer.jsx` | 7 | — |
| `frontend/src/components/CodeViewer.jsx` | 7 | 10 |
| `frontend/src/components/LoopVisualizer.jsx` | 8 | — |
| `frontend/src/components/BranchVisualizer.jsx` | 8 | — |
| `frontend/src/components/StateBoard.jsx` | 8 | — |
| `frontend/src/components/HandoffDrawer.jsx` | 10 | — |
| `frontend/src/components/BobExplainerPane.jsx` | 12 | — |
| `frontend/src/components/MLAuditBanner.jsx` | 14 | — |

## Stage Overview

| # | Stage | Layer | Priority | Est. hrs | Depends on |
|---|---|---|---|---|---|
| 1 | Monorepo & Deployment Scaffold | Both | P0 | 2 | — |
| 2 | Frontend Intake UI (mocked) | Frontend | P0 | 2 | 1 |
| 3 | AST Control-Flow Pre-Pass | Backend | P0 | 3 | 1 |
| 4 | Deterministic Tracer + Sandbox | Backend | P0 | 5 | 3 |
| 5 | Real `/api/trace` Endpoint | Backend | P0 | 2 | 3, 4 |
| 6 | Frontend↔Backend Tunnel | Both | P0 | 2 | 2, 5 |
| 7 | Studio Shell + Scrubber | Frontend | P0 | 4 | 6 |
| 8 | Manual Visualizers | Frontend | P0 | 4 | 7 |
| 9 | Safe Insertion Analyzer | Backend | P1 | 3 | 5 |
| 10 | Gutter Markers + Handoff Drawer | Frontend | P1 | 2 | 8, 9 |
| 11 | Bob Client + `/api/explain-step` | Backend | P1 | 3 | 5 |
| 12 | Bob Explainer Pane | Frontend | P1 | 2 | 10, 11 |
| 13 | ModelLens Diagnostics Engine | Backend | P2 | 3 | 5 |
| 14 | ModelLens UI Overlay | Frontend | P2 | 3 | 12, 13 |
| 15 | Polish, Rehearsal, Deploy, Submit | Both | Final | 6 | all above that were built |

Priority key: **P0** = core demo, cannot ship without it. **P1** = hackathon-critical
differentiators (IBM Bob integration, teammate handoff) — cut only under real time pressure.
**P2** = secondary mode (ModelLens) — the first thing to drop if you're out of time.
**Final** = required regardless of how much of P1/P2 you kept.

---

# Stage 1 — Monorepo & Deployment Scaffold

**Priority:** P0 · **Depends on:** nothing

### Objective
Stand up empty, running skeletons for both apps and prove they can talk to the internet
and to each other. No feature logic of any kind yet.

### Files you may touch
- `backend/app/main.py`, `backend/requirements.txt`
- `backend/app/routers/trace.py` (mock endpoint only — see below)
- `frontend/` — Vite React scaffold (default template files), `frontend/package.json`
- Deployment config files (`vercel.json`, `railway.json`/`render.yaml` as applicable)

### Build exactly this
1. `backend/`: FastAPI + Uvicorn + Pydantic app with a `GET /health` route returning
   `{"status": "ok"}`. Enable CORS for the frontend's dev and prod origins.
2. In `routers/trace.py`, add **one mock** `POST /api/trace` that ignores its input and
   returns a hardcoded 5-step array matching the `TraceStep` shape in Appendix A (values can
   be fake/placeholder — this is only to prove the wire format end-to-end later).
3. `frontend/`: Vite + React + Tailwind scaffold showing a placeholder page (e.g. "TraceLens
   — coming soon") with no real components yet.
4. Connect the repo to Vercel (frontend) and Railway or Render (backend). Confirm both are
   live and the frontend can reach the backend's `/health` route across origins (a simple
   `fetch` in the browser console is enough — no UI for this yet).

### Explicitly not this stage
- No Intake UI, no mode selector, no real tracer, no real trace data.

### Definition of Done
- [ ] `GET /health` returns 200 from the deployed backend URL.
- [ ] `POST /api/trace` (mock) returns 200 with a 5-step array shaped like Appendix A.
- [ ] Deployed frontend URL loads the placeholder page with no console CORS errors when it
      pings the deployed backend's `/health`.

---

# Stage 2 — Frontend: Intake UI (mocked, no network)

**Priority:** P0 · **Depends on:** Stage 1

### Objective
Build the landing screen exactly as far as visuals and local state go. It must look and
behave correctly with a **hardcoded local mock trace object** — no network call yet.

### Files you may touch
- `frontend/src/components/ModeSelector.jsx`
- `frontend/src/components/CodeInputPane.jsx`
- `frontend/src/App.jsx` (only to render these two components on the intake screen)

### Build exactly this
1. `ModeSelector.jsx`: radio-style toggle between **LogicLens** (default/selected) and
   **ModelLens**.
2. `CodeInputPane.jsx`: three input tabs —
   - Tab A: raw code textarea with line numbers and teammate-code placeholder text.
   - Tab B: file dropzone accepting `.py` / `.ipynb`.
   - Tab C: "Load Sample Teammate Script" button that fills the textarea with the
     `teammate_pipeline.py` sample from Appendix C.
3. A "Trace & Walk Through" button. On click: store a **hardcoded local mock trace array**
   (same shape as Stage 1's mock response) in local component state and log it to the
   console. Do **not** call `fetch`/`axios` here — that wiring is Stage 6.

### Explicitly not this stage
- No network calls. No Studio workspace. No real backend interaction at all.

### Definition of Done
- [ ] Mode switcher defaults to LogicLens and toggles visually to ModelLens.
- [ ] "Load Sample Teammate Script" populates the textarea with the Appendix C sample.
- [ ] Clicking "Trace & Walk Through" logs a mock 5-step trace object to the console; no
      network request is made (verify in the browser Network tab).

---

# Stage 3 — Backend: AST Control-Flow Pre-Pass

**Priority:** P0 · **Depends on:** Stage 1

### Objective
A pure, standalone Python module that parses source code and indexes loop/branch structure.
No tracer, no API wiring — testable by calling the function directly in a script or pytest.

### Files you may touch
- `backend/app/services/ast_flow.py`
- A throwaway test script or `tests/test_ast_flow.py`

### Build exactly this
1. Parse incoming code with `ast.parse()`.
2. Walk the tree with `ast.walk()` and build two lookup dicts keyed by line number:
   - Loop nodes (`ast.For`, `ast.While`): header line, body line range, target variable
     name(s) (e.g. `u` in `for u in users:`).
   - Branch nodes (`ast.If`): header line, raw source condition string
     (e.g. `"len(u) > 0"`), body entry line.
3. Expose a single function, e.g. `build_flow_index(code: str) -> FlowIndex`, returning both
   dicts.

### Explicitly not this stage
- No `sys.settrace`, no sandboxing, no API endpoint. This module has no I/O beyond the
  function's return value.

### Definition of Done
- [ ] Running the module against the Appendix C `teammate_pipeline.py` sample correctly
      identifies the `for` loop's header line and target variable (`record`).
- [ ] It correctly identifies the nested `if` conditions and their raw source strings.
- [ ] The function has no side effects and no dependency on FastAPI.

---

# Stage 4 — Backend: Deterministic Tracer + Sandbox

**Priority:** P0 · **Depends on:** Stage 3

### Objective
The core "never guess, always measure" engine: a `sys.settrace`-based tracer producing
ground-truth `TraceStep` objects, run inside a safety sandbox. Still not exposed via any
API endpoint — verify it by running it directly against a script file.

### Files you may touch
- `backend/app/services/tracer.py`
- `backend/app/services/sandbox.py`
- A throwaway test script or `tests/test_tracer.py`

### Build exactly this
1. **`tracer.py`:**
   - Register a callback via `sys.settrace()`.
   - Only trace frames where `frame.f_code.co_filename == "<tracelens_user_code>"`.
   - On each `'line'` event: read `frame.f_locals`, diff against the previous step's locals
     to classify each variable as `created` / `mutated` / `unchanged` / `deleted`, and
     compute a compact `repr_str` plus metadata (length, shape, columns, null_count where
     applicable).
   - Correlate the current line against Stage 3's flow index to attach `loop_context` /
     `branch_context` per the `TraceStep` shape (Appendix A).
   - Stop tracing once `step_counter >= max_steps` (default 300).
2. **`sandbox.py`:**
   - Execute user code in an isolated subprocess or thread.
   - Hard timeout: 8 seconds (kill on timeout, return a clean timeout error — never let it
     crash the server).
   - Restricted namespace: block `os`, `sys` (the traced program's own use of it, not your
     tracer's), `subprocess`, `socket`, `open`.
3. **Serializer:** convert non-JSON-native objects (sets, tuples, custom classes, NumPy
   arrays, Pandas DataFrames) into safe string/preview representations without throwing.

### Explicitly not this stage
- No FastAPI route. No frontend involvement. No Safe Insertion logic (Stage 9). No Bob calls.

### Definition of Done
- [ ] A 4-iteration `for` loop script produces exactly 4 loop-iteration steps with accurate
      target-variable mutation logging on each.
- [ ] A deliberate `while True:` script is killed by the timeout and returns a clean error
      object instead of hanging or crashing the process.
- [ ] Running the Appendix C `teammate_pipeline.py` sample produces a step list where
      `cleaned_records` and `error_count` show correct deltas at each relevant line.

---

# Stage 5 — Backend: Real `/api/trace` Endpoint

**Priority:** P0 · **Depends on:** Stage 3, Stage 4

### Objective
Replace the Stage 1 mock with the real pipeline: ingestion → AST pre-pass → tracer/sandbox
→ schema-correct JSON response. Verify with `curl`/pytest — still no frontend involvement.

### Files you may touch
- `backend/app/routers/trace.py` (replace the mock body)
- `backend/app/main.py` (only if router wiring needs it)

### Build exactly this
1. Implement the `TraceRequest` Pydantic model (Appendix A).
2. Endpoint logic: strip/normalize incoming code → `build_flow_index()` (Stage 3) →
   run the sandboxed tracer (Stage 4) → return a JSON array of `TraceStep` objects matching
   Appendix A exactly (field names and types must match).
3. Handle and return clean error payloads for: invalid Python syntax, sandbox timeout,
   `max_steps` exceeded.

### Explicitly not this stage
- No frontend wiring (Stage 6). No safe insertion points, no Bob explanations, no ModelLens
  — those are separate response fields added in later stages; do not add empty placeholders
  for them beyond what a `# TODO(stage-9)` comment covers.

### Definition of Done
- [ ] `curl -X POST /api/trace` with the Appendix C `teammate_pipeline.py` sample returns a
      200 response whose steps match the `TraceStep` schema field-for-field.
- [ ] Posting a script with a syntax error returns a clean 4xx with a readable message, not
      a 500 stack trace.
- [ ] Posting `while True: pass` returns a timeout error within ~8–10 seconds, not a hang.

---

# Stage 6 — Frontend↔Backend Tunnel

**Priority:** P0 · **Depends on:** Stage 2, Stage 5

### Objective
This is the connective layer between the two apps: build the API client, environment
config, and error/loading states, then swap Stage 2's hardcoded mock for a real network
call to Stage 5's endpoint.

### Files you may touch
- `frontend/src/api/traceClient.js`
- `frontend/src/components/CodeInputPane.jsx` (only the submit handler — swap mock for real
  call)
- Environment config (`.env`, Vite env vars) for the API base URL

### Build exactly this
1. `traceClient.js`: a single exported function, e.g. `postTrace(code, mode)`, that calls
   `POST {API_BASE_URL}/api/trace`, returns parsed JSON, and throws a typed error on
   non-2xx responses or network failure.
2. Wire the API base URL via environment variable so it points at localhost in dev and the
   deployed backend in prod.
3. In `CodeInputPane.jsx`'s submit handler: replace the Stage 2 hardcoded mock with a real
   call to `postTrace`. Add a loading state (spinner/disabled button) while the request is
   in flight, and a visible error state if it fails.
4. Confirm CORS works against the real deployed backend, not just `/health`.

### Explicitly not this stage
- No Studio workspace UI to display the result yet (Stage 7) — it's fine to just
  console.log the real response for now, or render it as raw JSON temporarily.

### Definition of Done
- [ ] Clicking "Trace & Walk Through" makes a real network request (visible in the Network
      tab) to the deployed backend and receives real `TraceStep` data back.
- [ ] A syntax-error script shows a visible error state in the UI instead of a silent
      failure or crash.
- [ ] Slow/failed requests show a loading indicator and don't leave the button in a stuck
      state.

---

# Stage 7 — Frontend: Studio Shell + Playback Scrubber

**Priority:** P0 · **Depends on:** Stage 6

### Objective
The 4-pane Studio layout and step-by-step playback, driven by the real trace data now
flowing through the Stage 6 tunnel. Visualizer panes are empty/placeholder for now.

### Files you may touch
- `frontend/src/App.jsx` (route/state to switch from Intake to Studio view)
- `frontend/src/components/TracePlayer.jsx`
- `frontend/src/components/CodeViewer.jsx`

### Build exactly this
1. 4-pane responsive layout: code viewer (left, ~40%), visualizer canvas (center, ~35%,
   empty placeholder for now), handoff/intent drawer (right, ~25%, empty placeholder for
   now).
2. `TracePlayer.jsx` playback state: `currentStepIndex`, `isPlaying`, `playbackSpeed`
   (0.5x/1x/2x). Controls: step forward, step backward, play/pause, jump to loop
   start/end, and a free-scrub range slider.
3. `CodeViewer.jsx`: read-only Monaco/Prism viewer; highlight and auto-scroll to the line
   matching `currentStepIndex`. Leave an empty gutter decoration layer (populated in
   Stage 10).

### Explicitly not this stage
- No LoopVisualizer/BranchVisualizer/StateBoard content (Stage 8). No gutter markers content
  (Stage 10). No Bob pane content (Stage 12).

### Definition of Done
- [ ] Step Forward/Backward correctly advances/retreats the highlighted line and updates a
      "Step X of Y" counter.
- [ ] Dragging the scrub slider updates the highlighted line instantly, without lag or
      flicker.
- [ ] Play/Pause auto-advances at the selected speed and stops cleanly at the last step.

---

# Stage 8 — Frontend: Manual Visualizers

**Priority:** P0 · **Depends on:** Stage 7

### Objective
Fill the center visualizer pane with the three deterministic visualizers, driven purely by
`loop_context` / `branch_context` / `variable_deltas` already present on each `TraceStep`.

### Files you may touch
- `frontend/src/components/LoopVisualizer.jsx`
- `frontend/src/components/BranchVisualizer.jsx`
- `frontend/src/components/StateBoard.jsx`
- `frontend/src/App.jsx` (only to mount these three inside the existing center pane)

### Build exactly this
1. **`LoopVisualizer.jsx`** (renders when `currentStep.loop_context` is present): iteration
   progress ("Iteration N of M"), target variable chip, an unrolled iteration carousel of
   past iterations (clickable to jump `currentStepIndex`), and an accumulator/growth badge
   for variables that grow across iterations.
2. **`BranchVisualizer.jsx`** (renders when `currentStep.branch_context` is present):
   monospace condition string, green "TRUE/TAKEN" or red "FALSE/SKIPPED" outcome badge, and
   dimming of the skipped code range in `CodeViewer`.
3. **`StateBoard.jsx`**: top section shows only this step's `variable_deltas` as color-coded
   cards (green=created, amber=mutated, red=deleted, `old_value ➔ new_value`); bottom
   section shows a full table of all variables currently in scope. Lists render as item
   chips; dicts render as key-value badges.

### Explicitly not this stage
- No gutter markers/handoff drawer content (Stage 10). No Bob-generated text anywhere in
  this pane.

### Definition of Done
- [ ] Stepping onto the `for` loop header in the Appendix C sample shows iteration 1 and the
      correct target variable value.
- [ ] Stepping onto the nested `if` clearly shows TRUE/FALSE and which line was taken.
- [ ] Appending to `cleaned_records` triggers a visible amber delta card in the State Board.

---

# Stage 9 — Backend: Safe Insertion Analyzer

**Priority:** P1 · **Depends on:** Stage 5

### Objective
Compute variable lifecycles across a completed trace and flag Safe Insertion Points —
pure backend logic, extending the `/api/trace` response.

### Files you may touch
- `backend/app/services/handoff_analyzer.py`
- `backend/app/routers/trace.py` (only to attach the new `safe_insertion_points` field to
  the existing response)

### Build exactly this
1. Scan the full step list to build a per-variable lifecycle ledger: `born_line`,
   `mutation_lines[]`, `last_read_line`.
2. Flag a line as a Safe Insertion Point when: an accumulator variable has reached a stable
   terminal state (not mutated again), and downstream code has not yet consumed it for
   export/model-fitting/similar.
3. For each flagged point, produce a `SafeInsertionPoint` object (Appendix A): `line_number`,
   `target_variable`, `reason`, `confidence`, `suggested_action`, `boilerplate_hook`.
4. Attach `safe_insertion_points: SafeInsertionPoint[]` to the existing `/api/trace`
   response — do not change any existing field.

### Explicitly not this stage
- No gutter UI, no drawer UI (Stage 10). No Bob-generated continuation text — `reason` and
  `suggested_action` here are computed, not AI-generated.

### Definition of Done
- [ ] Tracing the Appendix C `teammate_pipeline.py` sample flags the line immediately after
      the cleaning loop as a high-confidence Safe Insertion Point.
- [ ] Existing `TraceStep` fields in the response are unchanged from Stage 5's output.

---

# Stage 10 — Frontend: Gutter Markers + Handoff Drawer

**Priority:** P1 · **Depends on:** Stage 8, Stage 9

### Objective
Surface Stage 9's computed safe-insertion data in the UI: gutter star markers and a static
handoff drawer. No live AI calls yet — that's Stage 12.

### Files you may touch
- `frontend/src/components/CodeViewer.jsx` (populate the gutter decoration layer)
- `frontend/src/components/HandoffDrawer.jsx`

### Build exactly this
1. In `CodeViewer.jsx`'s gutter, render a `[★ Safe Hook]` marker on any line present in
   `safe_insertion_points`.
2. `HandoffDrawer.jsx`: clicking a gutter marker opens a popover/panel showing that point's
   `reason`, `suggested_action`, and a copy-to-clipboard button for `boilerplate_hook`.

### Explicitly not this stage
- No Bob intent text, no `/api/explain-step` calls (Stage 11–12).

### Definition of Done
- [ ] The Appendix C sample shows a gutter star on the line after the cleaning loop.
- [ ] Clicking it shows the backend-computed reason and a working "copy" button for the
      boilerplate hook.

---

# Stage 11 — Backend: IBM Bob Client + `/api/explain-step`

**Priority:** P1 · **Depends on:** Stage 5

### Objective
Wire the IBM Bob API for line-by-line intent explanations, using the exact prompt in
Appendix B.1. New, separate endpoint — does not touch `/api/trace`.

### Files you may touch
- `backend/app/services/bob_client.py`
- `backend/app/routers/explain.py`

### Build exactly this
1. `bob_client.py`: a function that sends the Appendix B.1 prompt (filled with filename,
   line number, code line, variable deltas, full memory snapshot) to the Bob API and parses
   the strict-JSON response into a `StepExplanation` object (Appendix A).
2. `POST /api/explain-step`: accepts a single step's context, calls `bob_client`, returns
   the `StepExplanation` JSON. Include a local fallback stub (canned response) for when no
   API key/connection is available, so the rest of the stack keeps working offline.

### Explicitly not this stage
- No frontend wiring or caching (Stage 12). No handoff-summary prompt (Appendix B.2) — that
  belongs to Stage 14.

### Definition of Done
- [ ] `curl -X POST /api/explain-step` with a sample step returns valid JSON matching
      `StepExplanation` exactly.
- [ ] With no Bob API key configured, the endpoint still returns a usable fallback instead
      of erroring out.

---

# Stage 12 — Frontend: Bob Explainer Pane

**Priority:** P1 · **Depends on:** Stage 10, Stage 11

### Objective
Fill the right-hand drawer with live Bob explanations as the user steps through the trace,
with per-step caching so scrubbing doesn't spam the API.

### Files you may touch
- `frontend/src/components/BobExplainerPane.jsx`
- `frontend/src/api/traceClient.js` (add an `explainStep` call)

### Build exactly this
1. On each `currentStepIndex` change, call `/api/explain-step` for that step (via
   `traceClient.js`) unless already cached.
2. Cache explanations in memory keyed by `step_id`; re-visiting a step must not re-fire the
   network call.
3. Render `intent_summary`, `detailed_explanation`, `teammate_logic_note`, and
   `continuation_tip` in the drawer alongside the Stage 10 handoff content.

### Explicitly not this stage
- No ModelLens content (Stage 13–14).

### Definition of Done
- [ ] Stepping through the Appendix C sample shows a distinct, line-specific intent note
      per step.
- [ ] Scrubbing back to a previously visited step does not trigger a new network request
      (verify in the Network tab).

---

# Stage 13 — Backend: ModelLens Diagnostics Engine

**Priority:** P2 · **Depends on:** Stage 5

### Objective
The secondary ML-methodology-auditor mode, built as a diagnostic pass over the existing
trace — not a separate pipeline.

### Files you may touch
- `backend/app/services/ml_diagnostics.py`
- `backend/app/routers/trace.py` (only to run this pass when `mode == "model_lens"` and
  attach `ml_audit_issues` to the response)

### Build exactly this
1. **Data leakage check:** AST-detect `.fit()`/`.fit_transform()` calls on
   `StandardScaler`/`MinMaxScaler`/`OneHotEncoder` and detect `train_test_split()` call
   sites; flag critical leakage if a fit call occurs on a line before the split.
2. **Class imbalance check:** inspect variables named like `y`/`y_train`/`labels`/`target`
   in the trace's variable deltas; flag if the majority class exceeds 80%.
3. **Estimator/data mismatch check:** compare feature count (DataFrame/array shape) against
   estimator complexity heuristics.
4. Each finding becomes an `MLAuditIssue` object (Appendix A) attached to the trace response
   only when `mode == "model_lens"`.

### Explicitly not this stage
- No UI (Stage 14). Do not change the `logic_lens` mode's response shape at all.

### Definition of Done
- [ ] Tracing the Appendix C `dsai_leakage_sample.py` in `model_lens` mode returns a
      critical `data_leakage` issue on the correct line.
- [ ] Tracing the same file in `logic_lens` mode returns no `ml_audit_issues` field (or an
      empty array) and is otherwise unaffected.

---

# Stage 14 — Frontend: ModelLens UI Overlay

**Priority:** P2 · **Depends on:** Stage 12, Stage 13

### Objective
Surface Stage 13's findings in the same Studio shell, plus wire the handoff-summary Bob
prompt (Appendix B.2) for a full end-of-trace teammate handoff summary.

### Files you may touch
- `frontend/src/components/MLAuditBanner.jsx`
- `backend/app/services/bob_client.py` (add the Appendix B.2 prompt path only — do not
  touch the Appendix B.1 logic built in Stage 11)

### Build exactly this
1. When `mode === "model_lens"`: sticky risk banner across the top of the Studio showing
   total issue count; hazard-stripe gutter markers on offending lines (reuse the
   `CodeViewer` gutter layer from Stage 10 — add to it, don't replace it).
2. Clicking a hazard marker opens a remediation panel with Bob's corrected code snippet.
3. Add a "Handoff Summary" view (either mode) that calls the Appendix B.2 prompt once the
   trace is complete and renders `overall_purpose`, `key_data_structures`,
   `safe_continuation_strategy`, and `cautions_for_teammate`.

### Explicitly not this stage
- Nothing beyond ModelLens UI and the handoff-summary view — this is the last feature
  stage before polish.

### Definition of Done
- [ ] Tracing `dsai_leakage_sample.py` in ModelLens mode shows the risk banner and a hazard
      stripe on the leakage line; clicking it shows the corrected snippet.
- [ ] The Handoff Summary view renders valid content for the `teammate_pipeline.py` sample.

---

# Stage 15 — Polish, Demo Rehearsal, Deploy, Submission

**Priority:** Final · **Depends on:** whichever of Stages 1–14 you actually shipped

### Objective
Turn whatever is built into a submittable, judge-proof demo. If Stage 13/14 (ModelLens) was
cut for time, this stage covers Mode 1 only — do not backfill cut stages here.

### Files you may touch
- Any styling/CSS across existing components (visual polish only — no new features)
- One-click sample buttons on the intake page for both demo scripts
- Deployment configs, README, submission materials

### Build exactly this
1. Verify `teammate_pipeline.py` (Mode 1) runs flawlessly from a clean browser/incognito
   session, start to finish.
2. If ModelLens shipped: verify `dsai_leakage_sample.py` triggers the audit warning
   immediately.
3. Visual polish: dark theme (Slate 950 background, Indigo accents, Emerald success
   badges), responsive on 1080p desktop, loading skeletons, graceful invalid-syntax error
   states.
4. Record the 90-second pitch video per the beat sheet in Appendix D.
5. Deploy final builds (Vercel + Railway/Render) and complete the lablab.ai submission form
   with description, live demo link, and video URL.

### Explicitly not this stage
- No new features. If something is broken, fix the bug in place — do not "quickly add" a
  feature from a stage you skipped.

### Definition of Done
- [ ] Both demo scripts (whichever modes are shipped) run cleanly from a cold start with
      zero typing required by the judge.
- [ ] Pitch video recorded and within time.
- [ ] Lablab.ai submission form completed with live links.

---

# Appendix A — Data Contracts (shared by all stages — do not modify field names)

```typescript
export interface TraceRequest {
  mode: "logic_lens" | "model_lens";
  filename?: string;
  code: string;
  max_steps?: number; // Default: 300
}

export type EventType =
  | "line" | "call" | "return"
  | "loop_entry" | "loop_iteration" | "loop_exit"
  | "branch_decision" | "exception";

export interface VariableDelta {
  action: "created" | "mutated" | "unchanged" | "deleted";
  var_name: string;
  type_name: string;
  old_value: any;
  new_value: any;
  repr_str: string;
  metadata?: {
    length?: number;
    shape?: [number, number];
    columns?: string[];
    null_count?: number;
  };
}

export interface LoopFlowContext {
  loop_id: string;
  loop_type: "for" | "while";
  header_line: number;
  current_iteration: number;
  total_iterations?: number;
  iterator_target?: string;
  iterator_value?: any;
  is_exit_step: boolean;
}

export interface BranchFlowContext {
  branch_id: string;
  header_line: number;
  condition_code: string;
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
  all_variables: Record<string, string>;
  stdout_emitted?: string;
}

export interface SafeInsertionPoint {
  line_number: number;
  target_variable: string;
  reason: string;
  confidence: "high" | "medium";
  suggested_action: string;
  boilerplate_hook: string;
}

export interface StepExplanation {
  step_id: number;
  line_number: number;
  intent_summary: string;
  detailed_explanation: string;
  teammate_logic_note: string;
  safe_to_extend: boolean;
  continuation_tip?: string;
}

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

# Appendix B — IBM Bob Prompt Templates

### B.1 — Line-by-Line Contextual Intent Prompt (used by Stage 11)
```
System Prompt:
You are an expert software engineer acting as a pair programming assistant. The user has
inherited a Python script from a teammate and is stepping through it line by line. Explain
the intent of the current line based on measured runtime execution state.

Input Context:
- File Name: {filename}
- Current Line Number: {line_number}
- Code Line: {code_line}
- Variables Mutated This Step: {variable_deltas}
- Local Memory Snapshot: {all_variables}

Instructions:
1. Explain what the teammate was achieving on this specific line.
2. Note why this logic was structured this way.
3. State whether it is safe to modify or hook into this line, and provide a tip for
   extending it.

Output strictly valid JSON with keys:
{
  "intent_summary": "One sentence summary of intent",
  "detailed_explanation": "2-3 sentence mechanical and logical breakdown",
  "teammate_logic_note": "Explanation of teammate design pattern or decision",
  "safe_to_extend": true | false,
  "continuation_tip": "Concrete advice for where to inject new logic"
}
```

### B.2 — Teammate Handoff Summary Prompt (used by Stage 14)
```
System Prompt:
You are a senior technical lead reviewing a completed execution trace of a teammate's
script. Produce a handoff guide so the next developer can continue the work without
introducing bugs.

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

# Appendix C — Demo Scripts

### C.1 — `teammate_pipeline.py` (Mode 1 primary demo)
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

# [SAFE INSERTION POINT: here]
summary = {
    "total_valid": len(cleaned_records),
    "total_errors": error_count
}
print("Summary:", summary)
```

### C.2 — `dsai_leakage_sample.py` (Mode 2 secondary demo)
```python
# dsai_leakage_sample.py — Inherited from "Jordan" (Data Scientist)
import numpy as np
from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import train_test_split

X = np.random.randn(100, 4)
y = np.array([0] * 90 + [1] * 10)

# BUG: Data Leakage — Fitting scaler across entire dataset before splitting!
scaler = StandardScaler()
X_scaled = scaler.fit_transform(X)

X_train, X_test, y_train, y_test = train_test_split(X_scaled, y, test_size=0.2)

print("Dataset ready. Train size:", len(X_train))
```

---

# Appendix D — Risk Matrix & 90-Second Video Beat Sheet

| Risk | Severity | Safeguard | Handled in |
|---|---|---|---|
| Infinite loops in user code | Critical | 8s hard timeout, 300-step cap | Stage 4 |
| Bob API rate limit/latency | High | Cache by `step_id`; offline fallback stub | Stage 11, 12 |
| Large DataFrame memory bloat | High | Serialize shape/columns/3-row preview only | Stage 4 |
| Dangerous builtins | Critical | Restricted namespace (block os/sys/subprocess/socket/open) | Stage 4 |
| Scrubber UI desync | Medium | Debounce slider; render from pre-indexed step array | Stage 7 |

Video beat sheet (90s total):
- 0:00–0:20 — The Hook: inheriting teammate code, generic AI summaries don't show runtime
  behavior or safe edit points.
- 0:20–0:55 — Mode 1: paste script, step through loop/branch visualizers, show variable
  deltas, highlight the Safe Insertion Marker.
- 0:55–1:15 — Mode 2: switch to ModelLens, show instant leakage detection + Bob's refactor.
- 1:15–1:30 — Tech + closing: deterministic `sys.settrace` engine + IBM Bob intent
  integration.
