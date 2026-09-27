"""
test_ml_diagnostics.py — Unit and Integration Tests for ModelLens 8-Mistake Diagnostic Engine.

Verifies detection of:
1. Outlier removal based on global statistics before split
2. Global imputation before train/test split
3. Target encoding across entire dataset
4. Feature selection computed on entire dataset
5. Global feature scaling
6. Applying SMOTE / oversampling before splitting
7. Random split on temporal / grouped data
8. Evaluating on oversampled test data & raw accuracy on imbalanced priors
Plus Bob automated remediation for each issue.
"""

import sys
from pathlib import Path
import pytest

ROOT_DIR = Path(__file__).resolve().parent.parent
BACKEND_DIR = ROOT_DIR / "backend"
for p in (str(ROOT_DIR), str(BACKEND_DIR)):
    if p not in sys.path:
        sys.path.insert(0, p)

from backend.app.services.ml_diagnostics import run_ml_diagnostics, MLAuditIssue
from backend.app.services.bob_client import apply_bob_remediation
from backend.app.services.sandbox import trace_in_sandbox

SAMPLE_8_MISTAKES_CODE = """import numpy as np
import pandas as pd
from imblearn.over_sampling import SMOTE
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score, classification_report
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler

np.random.seed(42)
n_rows = 1000

df = pd.DataFrame(
    {
        "timestamp": pd.date_range("2024-01-01", periods=n_rows, freq="h"),
        "customer_id": np.random.randint(100, 200, size=n_rows),
        "income": np.random.normal(50000, 15000, size=n_rows),
        "debt_ratio": np.random.uniform(0.1, 0.9, size=n_rows),
        "category": np.random.choice(["Tier1", "Tier2", "Tier3"], size=n_rows),
        "churn": np.random.binomial(1, 0.15, size=n_rows),
    }
)

df.loc[df.sample(frac=0.05, random_state=42).index, "income"] = np.nan

mean_debt = df["debt_ratio"].mean()
std_debt = df["debt_ratio"].std()
df = df[df["debt_ratio"] < mean_debt + 3 * std_debt].copy()

df["income"] = df["income"].fillna(df["income"].mean())

target_enc = df.groupby("category")["churn"].mean()
df["category_encoded"] = df["category"].map(target_enc)

numeric_features = ["income", "debt_ratio", "category_encoded"]
corr = df[numeric_features].corrwith(df["churn"]).abs()
top_features = corr.nlargest(2).index.tolist()

scaler = StandardScaler()
df[top_features] = scaler.fit_transform(df[top_features])

X = df[top_features]
y = df["churn"]

smote = SMOTE(random_state=42)
X_resampled, y_resampled = smote.fit_resample(X, y)

X_train, X_test, y_train, y_test = train_test_split(
    X_resampled, y_resampled, test_size=0.2, random_state=42, shuffle=True
)

clf = RandomForestClassifier(random_state=42)
clf.fit(X_train, y_train)

y_pred = clf.predict(X_test)
acc = accuracy_score(y_test, y_pred)
"""


def test_detect_all_8_methodology_mistakes():
    """Verify that run_ml_diagnostics identifies all 8 methodology mistakes."""
    trace = trace_in_sandbox(SAMPLE_8_MISTAKES_CODE, timeout=30.0)
    assert trace.status == "ok"
    issues = run_ml_diagnostics(trace.steps, SAMPLE_8_MISTAKES_CODE)

    issue_ids = [iss.issue_id for iss in issues]
    issue_titles = [iss.title for iss in issues]

    # 1. Outlier removal before split
    assert any("outlier" in i_id for i_id in issue_ids), "Mistake 1 (Outlier Leakage) not detected"
    # 2. Imputation before split
    assert any("imputation" in i_id for i_id in issue_ids), "Mistake 2 (Imputation Leakage) not detected"
    # 3. Target encoding before split
    assert any("target-encoding" in i_id for i_id in issue_ids), "Mistake 3 (Target Encoding Leakage) not detected"
    # 4. Feature selection before split
    assert any("feature-selection" in i_id for i_id in issue_ids), "Mistake 4 (Feature Selection Leakage) not detected"
    # 5. Feature scaling before split
    assert any("leakage" in i_id and "outlier" not in i_id and "imputation" not in i_id and "target" not in i_id and "resampling" not in i_id for i_id in issue_ids), "Mistake 5 (Scaling Leakage) not detected"
    # 6. Resampling before split
    assert any("resampling" in i_id for i_id in issue_ids), "Mistake 6 (SMOTE Resampling Leakage) not detected"
    # 7. Temporal / Grouped split
    assert any("temporal" in i_id or "grouped" in i_id for i_id in issue_ids), "Mistake 7 (Temporal/Grouped Split) not detected"
    # 8 Part 1: Resampled test set evaluation
    assert any("resampled-test-eval" in i_id for i_id in issue_ids), "Mistake 8 Part 1 (Resampled Test Eval) not detected"
    # 8 Part 2: Accuracy on imbalanced data
    assert any("metric-mismatch" in i_id for i_id in issue_ids), "Mistake 8 Part 2 (Metric Mismatch) not detected"


def test_bob_remediation_on_all_diagnostics_issues():
    """Verify that Bob automated remediation successfully refactors each detected issue."""
    trace = trace_in_sandbox(SAMPLE_8_MISTAKES_CODE, timeout=30.0)
    issues = run_ml_diagnostics(trace.steps, SAMPLE_8_MISTAKES_CODE)

    for iss in issues:
        result = apply_bob_remediation(SAMPLE_8_MISTAKES_CODE, iss.model_dump())
        assert result.applied is True, f"Bob remediation failed for {iss.issue_id}"
        assert result.patched_code != ""
        assert result.explanation != ""
