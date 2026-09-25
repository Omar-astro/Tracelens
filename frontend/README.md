# TraceLens UI — AI-Powered DSAI Code Auditor

Built according to the `implementation-plan.md` specifications and the `stitch_tracelens_ml_execution_tracer` Stitch design system for the **IBM Bob 2.0 Hackathon (lablab.ai)**.

## Key Features Built & Fully Functional:

1. **Top Telemetry Header (`Navbar.jsx`)**:
   - TraceLens custom logo & breadcrumb navigation (`models/churn/churn_prediction.ipynb`).
   - Live sandboxed run indicators (42 execution steps).
   - Dynamic issue counters: Critical Leakage badge (crimson) and Severe Imbalance badge (violet/amber).
   - Quick Cmd+K command palette trigger & "New Audit" ingestion trigger.

2. **Execution Timeline Scrubber (`TimelineScrubber.jsx`)**:
   - Step navigation controls (Prev, Next, Play/Pause with auto-stepping ticker).
   - Dynamic step counter & operation label (e.g. `Step 14 of 42 :: train_test_split()`).
   - Quick jump buttons: **Jump to Leakage (#09)** and **Jump to Imbalance (#14)**.
   - Clickable & scrubbable progress bar.
   - Milestone badges along the timeline (Step 01, 05, 09, 14, 22, 31, 42).

3. **Workspace Views & Assertions Sidebar (`Sidebar.jsx`)**:
   - Navigation across 5 specialized views:
     - **Code Auditor**: Split code editor & live inspector view.
     - **Execution DAG**: Interactive node-based tensor flow graph.
     - **Leakage Detector**: Mathematical moment contamination forensic analysis.
     - **Tensor Watcher**: Real-time memory heap registers and tensor dimension table.
     - **AI Remediation**: Proposed diff and fix applicator.
   - Real-time Trace Assertions checklist (`Train/Test Split`, `Fit vs Transform`, `Weight Norm Bounds`).
   - Runtime v2.4 (cuda0) telemetry readout.

4. **Code & Cell Auditor (`CodeAuditor.jsx`)**:
   - Python 3.11 syntax-highlighted editor with line numbers gutter.
   - Contaminated line highlights (Line 09) with inline High-Severity Data Leakage callout card.
   - Active execution step indicator (Line 14) with pulsating glow.
   - **Click-to-Explain on ANY line**: Clicking any line reveals Bob AI's contextual explanation grounded in the execution trace.

5. **Data & Model Inspector (`DataModelInspector.jsx`)**:
   - Live register telemetry for `X` (Shape, RAM footprint, Nulls, Dtypes).
   - Dimension flow sparkline SVG.
   - Interactive Target Distribution (`y`) bar chart: 92% Class 0 (920 samples) vs 8% Class 1 (80 samples) with 11.5 : 1 ratio alert.
   - Active Estimator hyperparameter breakdown.

6. **Bob AI Engine & Remediation Patch (`BobAiAuditPanel.jsx`)**:
   - Natural language methodology diagnosis explaining the ~8.4% ROC-AUC inflation.
   - Proposed code diff patch (red removed lines, green added lines).
   - **Interactive "Apply Fix to Cell [3]" button**: Applies the zero-contamination patch live, triggers celebratory confetti, updates the code in real-time, removes the leakage alert, and flips assertions from FAIL to PASS.
   - "Re-run Sandbox" simulation.

7. **New Sandboxed Trace & Audit Modal (`NewAuditModal.jsx`)**:
   - Exact Stitch implementation with 3 ingestion modes:
     - **Paste Code**: with runtime dropdown, "Load Synthetic Pipeline", clear button, and audit inspection preset toggles.
     - **Upload**: drag-and-drop `.py` and `.ipynb` files up to 25MB with staged file metadata.
     - **GitHub Repo**: repo URL, branch selector, entrypoint file picker, and read-only token badge.

8. **Command Palette (`CommandPalette.jsx`)**:
   - Press `Cmd + K` (or `Ctrl + K`) to search actions, jump to steps, or switch views instantly.

## Running the UI

```bash
cd frontend
npm install
npm run dev
```

Visit [http://localhost:5173](http://localhost:5173).
