# Stage 14 — ModelLens UI Overlay (Implementation Plan)

**Status:** Ready to execute
**Branch:** `stage-12` (clean, in sync with `origin/stage-12`)
**Depends on:** Stage 12 (Bob Explainer Pane), Stage 13 (ModelLens Diagnostics Engine)
**Source spec:** `tracelens_staged_implementation_plan.md:643-673` (Stage 14), Appendix B.2 (`:842`), Appendix C.2 (`:902`)

---

## 1. Goal

Surface Stage 13's `ml_audit_issues` in the Studio shell, add hazard-stripe gutter markers with a
remediation panel, and wire the Appendix B.2 teammate handoff summary. This closes the
backend-to-frontend gap that currently makes Stage 13 the high-water mark.

The plan's stated file manifest (`MLAuditBanner.jsx` + `bob_client.py`) is too narrow to deliver a
working feature. Section 3 documents why, and Section 2 records the approved deviations.

---

## 2. Locked Decisions

| # | Decision | Rationale |
|---|---|---|
| D1 | **Wire the full chain** — edit `CodeInputPane.jsx`, `App.jsx`, `TracePlayer.jsx`, `CodeViewer.jsx`, `traceClient.js` as needed | The manifest is a guideline. A banner wired to nothing fails the Definition of Done. |
| D2 | **Add `numpy` + `scikit-learn`** to `backend/requirements.txt` | Neither is installed in `.venv`; the Mode 2 demo script cannot execute without them. |
| D3 | **Remediation panel renders Stage 13's static `remediation_code`** | Zero latency, works offline, guaranteed-correct syntax. Avoids a live LLM round-trip on every click. |
| D4 | **B.2 endpoint reuses `explain.py`** | Groups all AI-explanation endpoints in one router; `main.py` needs no change. |
| D5 | **Handoff summary fires on explicit button click** | Deterministic for the demo — no surprise 5s wait or spinner if Bob is slow. |
| D6 | **Single commit on `stage-12`** | Matches the repo's existing branch state. Commit message follows the `Implement Stage N: <description>` convention. |

---

## 3. Blockers Found During Research

### Blocker A — `ml_audit_issues` never reaches React

`CodeInputPane.jsx:118` calls `onTraceComplete(steps, code, safePoints)` and silently drops the
third response field, even though `trace.py:244-248` already returns it. The backend is correct;
the frontend discards the data.

**Fix:** forward it as a 4th argument. Touches `CodeInputPane.jsx` and `App.jsx`, both outside the
plan's manifest — hence D1.

### Blocker B — the Mode 2 demo script cannot execute

Verified: `numpy`, `sklearn`, and `pandas` are all absent from `.venv`, and `backend/requirements.txt`
contains only `fastapi`, `uvicorn`, `pydantic`, `httpx`, and `python-dotenv`.

`dsai_leakage_sample.py` will raise `ModuleNotFoundError` in the sandbox. Per `sandbox.py:433` this
maps to `ERR_RUNTIME` (not `ERR_BLOCKED_IMPORT`, since `numpy` is not in `BLOCKED_NAMES`). The AST
audit passes still fire — they only call `ast.parse` — but the trace will be near-empty and the
demo will look broken.

**Fix:** D2. `pandas` is deliberately excluded; neither the C.2 sample nor `ml_diagnostics` needs it.

### Blocker C — the DoD script is unreachable

`dsai_leakage_sample.py` exists only inside orphaned components (`ModeIntakeDashboard.jsx`,
`InputPanel.jsx` via `SAMPLE_CODE_DEFAULT`). The active `CodeInputPane.jsx:5` defines only
`TEAMMATE_PIPELINE_SAMPLE`. The Stage 14 Definition of Done cannot be verified without a reachable
sample.

**Fix:** add `DSAI_LEAKAGE_SAMPLE` to `CodeInputPane.jsx` with a one-click button. Nominally Stage 15
work, but required to verify this stage.

### Verification that Stage 13's engine is correct

Ran `run_ml_diagnostics([], <C.2 sample>)` against the Appendix C.2 source. Returns 2 issues:

```
ml-leakage-12      | line 12 | critical | data_leakage   | Data Leakage: Preprocessor fit before train/test split
ml-imbalance-1-y   | line 8  | warning  | class_imbalance | Class Imbalance in Target 'y' (90.0% Majority)
```

The backend half of Stage 14's premise is sound. No Stage 13 changes needed.

---

## 4. ⚠️ Line-Number Alignment Hazard

`trace.py:171` does `code = raw_code.replace(...).strip()` before `ast.parse(code)`, but the frontend
renders the **unstripped** original via `CodeViewer`'s `code.split('\n')`. Any leading blank line
shifts every backend `line_number` by one, so hazard stripes land on the wrong line.

**Rules for this stage:**

- `DSAI_LEAKAGE_SAMPLE` must have **no leading or trailing blank lines**.
- Do not begin the template literal on the line after the backtick.

The underlying backend/frontend mismatch is pre-existing and out of scope. Flagged for Stage 15.

---

## 5. Files to Modify

### Backend
| File | Change |
|---|---|
| `backend/requirements.txt` | Add `numpy>=1.26.0`, `scikit-learn>=1.4.0` |
| `backend/app/services/bob_client.py` | Append B.2 path; replace `TODO` at `:289` |
| `backend/app/routers/explain.py` | Add `POST /api/handoff-summary` |

### Frontend
| File | Change |
|---|---|
| `frontend/src/api/traceClient.js` | Add `postHandoffSummary()`; fix stale docstring at `:78` |
| `frontend/src/components/CodeInputPane.jsx` | Forward `ml_audit_issues`; add `DSAI_LEAKAGE_SAMPLE` |
| `frontend/src/App.jsx` | `mlAuditIssues` state; pass `mode` down; footer text |
| `frontend/src/components/MLAuditBanner.jsx` | **NEW** — sticky risk banner |
| `frontend/src/components/MLRemediationPanel.jsx` | **NEW** — remediation panel |
| `frontend/src/components/HandoffSummaryPane.jsx` | **NEW** — B.2 summary view |
| `frontend/src/components/CodeViewer.jsx` | Hazard markers, additive to Stage 10 gutter |
| `frontend/src/components/TracePlayer.jsx` | Banner mount + two new drawer tabs |

### Explicitly untouched
- `bob_client.py`: `BOB_SYSTEM_PROMPT`, `build_b1_prompt`, `generate_fallback_explanation`,
  `explain_step_in_context` — the plan forbids touching the Appendix B.1 logic.
- `ml_diagnostics.py` — Stage 13, verified working.
- `trace.py`, `main.py`, `ast_flow.py`, `tracer.py`, `sandbox.py`, `handoff_analyzer.py`.
- `CodeViewer.jsx` Stage 10 `safeLineMap` / `★ Safe Hook` marker — add, do not replace.
- `TracePlayer.jsx` existing `explainer` / `hooks` / `split` tabs.

---

## 6. Step 1 — Backend: B.2 Handoff Summary

### 6.1 `backend/requirements.txt`

Append `numpy>=1.26.0` and `scikit-learn>=1.4.0`. Match the existing `>=` pin style.

### 6.2 `backend/app/services/bob_client.py`

Append-only. Add after the existing `explain_step_in_context` and replace the
`# TODO(stage-14)` marker at `:289`.

**Model** — Appendix B.2 output shape (plan `:854`):

```python
class HandoffSummary(BaseModel):
    overall_purpose: str
    key_data_structures: List[Dict[str, str]]   # {name, role, final_state_summary}
    safe_continuation_strategy: str
    cautions_for_teammate: List[str]
```

**Prompt** — `BOB_HANDOFF_SYSTEM_PROMPT`, copied verbatim from `tracelens_staged_implementation_plan.md:844`.

**Builder** — `build_b2_prompt(code, safe_insertion_points, terminal_variables) -> str`, following
the `json.dumps(..., default=str)` interpolation style of `build_b1_prompt` (`bob_client.py:61`).

**Offline fallback** — `generate_fallback_handoff_summary(...)`, mirroring
`generate_fallback_explanation` (`:99`) in structure. Deterministic derivation:
- `overall_purpose` — summarise imports, `def` lines, and `print` calls
- `key_data_structures` — one entry per terminal variable, with its `repr`
- `safe_continuation_strategy` — built from each `SafeInsertionPoint`'s `boilerplate_hook`
- `cautions_for_teammate` — derived from loop and branch counts in the trace

**Entry point** — `generate_handoff_summary(...) -> HandoffSummary`, replicating
`explain_step_in_context` (`:191`) exactly in shape:
- env-key short-circuit on the `your_api_key_here_DO_NOT_COMMIT` check (`:210`)
- `httpx.Client(timeout=5.0)` (`:246`)
- OpenAI-style `chat/completions` payload
- JSON-fence stripping (`:258-262`) and `re.search(r"\{.*\}", ..., re.DOTALL)`
- bare `except Exception: pass` → fallback
- **never raises**

### 6.3 `backend/app/routers/explain.py`

Add `HandoffSummaryRequest` (`code: str`, `safe_insertion_points: List[Dict[str, Any]]`,
`terminal_variables: Dict[str, Any]`; blank `code` → 400, matching the `:49` guard style) and
`@router.post("/handoff-summary", response_model=HandoffSummary)`.

Extend the existing dual-root `try/except ImportError` block at `:12-21` with the two new symbols.

---

## 7. Step 2 — Frontend: Plumb the Data Through

### 7.1 `frontend/src/api/traceClient.js`

- Add `postHandoffSummary({ code, safeInsertionPoints, terminalVariables })` → `POST /api/handoff-summary`,
  reusing `explainStep`'s conventions (`:106`) for the `TraceApiError` / detail-extraction paths.
- Update the stale comment at `:78` to mention `ml_audit_issues` in the response shape.

### 7.2 `frontend/src/components/CodeInputPane.jsx`

- `:118` → `onTraceComplete(steps, code, safePoints, response.ml_audit_issues ?? [])` (Blocker A fix)
- Add `DSAI_LEAKAGE_SAMPLE` — Appendix C.2 verbatim, blank-line-free (Section 4)
- Add a second one-click sample button in the Sample tab (Blocker C fix)

### 7.3 `frontend/src/App.jsx`

- `const [mlAuditIssues, setMlAuditIssues] = useState([])`
- `handleTraceComplete(steps, code, safePoints, mlIssues)` → set state, reset on back-to-intake
- Pass `mode` and `mlAuditIssues` into `TracePlayer`
- Footer `:144` → "TraceLens • Stage 14 ModelLens UI Active"

---

## 8. Step 3 — Frontend: New Components

### 8.1 `MLAuditBanner.jsx` (new)

Sticky banner above the playback dock. Rendered only when `mode === 'model_lens'`.

- Total issue count
- Per-severity chips (critical / warning / info) — clickable, filters the issue list
- Category legend
- Emerald all-clear state when `ml_audit_issues.length === 0`
- Returns `null` in `logic_lens` mode

### 8.2 `MLRemediationPanel.jsx` (new)

Right-drawer `'audit'` tab.

- Empty state prompting a hazard-marker click
- Selected issue: severity chip, category, `title`, `message`, `offending_code` and
  `remediation_code` in `<pre>` blocks, plus `explanation`
- Copy-to-clipboard on `remediation_code`, reusing the `HandoffDrawer.jsx:21-35` pattern including
  the `document.execCommand` fallback for non-HTTPS contexts
- Prev/next issue navigation

Per D3, `remediation_code` is rendered directly. No LLM call.

### 8.3 `HandoffSummaryPane.jsx` (new)

Right-drawer `'summary'` tab. Available in **both** modes.

- Idle state with a "Generate Handoff Summary" button (D5)
- `postHandoffSummary` fires only on click; result cached in `App` state — one call per trace session
- Renders all four B.2 fields; `key_data_structures` as a table
- `cautions_for_teammate` as a list
- Loading skeleton and error state

---

## 9. Step 4 — Frontend: Extend the Existing Shell

### 9.1 `CodeViewer.jsx`

**Additive only** — extend the Stage 10 gutter decoration column at `:171-190`. Do not touch
`safeLineMap` or the `★ Safe Hook` marker.

New props: `mlAuditIssues = []`, `selectedAuditIssue = null`, `onAuditMarkerClick = null`.

- Build a `line_number → MLAuditIssue[]` map. Note this is an **array**, unlike the single-valued
  `safeLineMap` — multiple issues can share a line. Render a count badge in that case.
- Hazard stripe: severity-keyed diagonal-gradient bar (critical → red, warning → amber, info → sky)
- Tint the row left-border by the maximum severity present on that line

### 9.2 `TracePlayer.jsx`

New props: `mode`, `mlAuditIssues`.

- Render `MLAuditBanner` above the playback controls dock when `mode === 'model_lens'`
- `const [selectedAuditIssue, setSelectedAuditIssue] = useState(null)`
- Hazard-marker click → `setSelectedAuditIssue(issue)` and `setDrawerTab('audit')`
- Add `'audit'` (with issue-count badge) and `'summary'` drawer tabs
- Leave `explainer` / `hooks` / `split` untouched

---

## 10. Step 5 — Verification

### Setup
```bash
pip install pytest numpy scikit-learn     # into .venv; pytest is currently absent
```

### Automated
1. `pytest` from repo root — all four test files green
   (`test_ast_flow.py`, `test_tracer.py`, `test_sandbox.py`, `test_explain.py`)
2. `cd frontend && npm run lint` — oxlint clean
3. `cd frontend && npm run build` — succeeds

### Manual
```bash
uvicorn backend.app.main:app --port 8000
cd frontend && npm run dev
```

### Definition of Done

**DoD 1** — Load the `dsai_leakage_sample.py` sample in ModelLens mode:
- Banner reads "2 issues"
- Hazard stripe on the `fit_transform` line (critical) and the `y = np.array(...)` line (warning)
- Clicking the critical marker renders the split-then-fit `remediation_code`

**DoD 2** — Load `teammate_pipeline.py` in either mode:
- Handoff Summary renders all four fields: `overall_purpose`, `key_data_structures`,
  `safe_continuation_strategy`, `cautions_for_teammate`

**Regression** — `logic_lens` mode:
- No banner, no hazard markers
- Stage 10 `★ Safe Hook` gutter markers and drawer still work
- Stage 12 Bob Explainer Pane still calls `/api/explain-step` and caches by `step_id`

---

## 11. Out of Scope (Stage 15)

- Visual restyling beyond what the new components need
- README, deployment configs, submission materials
- One-click sample buttons beyond the two demo scripts
- Deleting the 17 orphaned components and the mock data modules
- `main.py:19` — `allow_origins=["*"]` combined with `allow_credentials=True`
- Tailwind CDN (`index.html:14`) vs. the unregistered `@tailwindcss/vite` plugin
- The `code.strip()` line-number mismatch (Section 4) beyond writing samples correctly
- `App.jsx:44` gates the studio on `traceSteps.length > 0`, so a script erroring before its first
  traced line cannot reach the ModelLens UI at all
- Installing `pytest` into `backend/requirements.txt` (install locally only)

---

## 12. Execution Order

Steps 1–3 (backend) are independent of steps 4–11 (frontend). Nailing the backend contract first
lets the frontend be built against it without guesswork.

| # | Target | Change |
|---|---|---|
| 1 | `backend/requirements.txt` | `numpy`, `scikit-learn` |
| 2 | `backend/app/services/bob_client.py` | B.2 model, prompt, fallback, entry point |
| 3 | `backend/app/routers/explain.py` | `POST /api/handoff-summary` |
| 4 | `frontend/src/api/traceClient.js` | `postHandoffSummary()` |
| 5 | `frontend/src/components/CodeInputPane.jsx` | forward `ml_audit_issues`; add sample |
| 6 | `frontend/src/App.jsx` | `mlAuditIssues` state; pass `mode` down |
| 7 | `frontend/src/components/MLAuditBanner.jsx` | new |
| 8 | `frontend/src/components/MLRemediationPanel.jsx` | new |
| 9 | `frontend/src/components/HandoffSummaryPane.jsx` | new |
| 10 | `frontend/src/components/CodeViewer.jsx` | hazard markers |
| 11 | `frontend/src/components/TracePlayer.jsx` | banner + two drawer tabs |
| 12 | — | `pytest`, DoD 1 & 2, regression, lint, build |

Final step: single commit on `stage-12`, message `Implement Stage 14: Frontend ModelLens UI Overlay`.
Then tick Stage 14 in the progress tracker at `tracelens_staged_implementation_plan.md:58`.
