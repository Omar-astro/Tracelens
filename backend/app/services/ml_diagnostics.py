"""
ml_diagnostics.py — Stage 13: ModelLens Diagnostics Engine.

Provides an ML-methodology auditor pass across completed execution traces and AST structure
when `mode == "model_lens"`.

Auditing passes:
1. Data leakage check: AST detection of .fit() / .fit_transform() on preprocessors
   (StandardScaler, MinMaxScaler, OneHotEncoder, etc.) called before train_test_split().
2. Class imbalance check: runtime and static inspection of target variables
   (y, y_train, labels, target) flagging if majority class exceeds 80%.
3. Estimator/data mismatch check: feature count / sample count heuristics against estimator
   capacities and distance-based metric limits.
"""

from __future__ import annotations

import ast
import re
from collections import Counter
from typing import Any, Dict, List, Literal, Optional, Set, Tuple, Union
from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Data Contract — Conforming to Appendix A: MLAuditIssue
# ---------------------------------------------------------------------------

class MLAuditIssue(BaseModel):
    """
    Data contract conforming to Appendix A: MLAuditIssue.
    Represents an ML audit finding with remediation advice.
    """

    issue_id: str
    step_id: int
    line_number: int
    category: Literal[
        "data_leakage",
        "class_imbalance",
        "preprocessing_mismatch",
        "metric_mismatch",
    ]
    severity: Literal["critical", "warning", "info"]
    title: str
    message: str
    offending_code: str
    remediation_code: str
    explanation: str


# ---------------------------------------------------------------------------
# Constants & Heuristic Classifications
# ---------------------------------------------------------------------------

PREPROCESSOR_CLASSES = frozenset({
    "StandardScaler",
    "MinMaxScaler",
    "RobustScaler",
    "MaxAbsScaler",
    "Normalizer",
    "OneHotEncoder",
    "OrdinalEncoder",
    "LabelEncoder",
    "QuantileTransformer",
    "PowerTransformer",
    "KBinsDiscretizer",
    "PolynomialFeatures",
    "SimpleImputer",
    "KNNImputer",
    "IterativeImputer",
    "ColumnTransformer",
    "FeatureHasher",
})

ESTIMATOR_CLASSES = frozenset({
    "LinearRegression",
    "Ridge",
    "Lasso",
    "ElasticNet",
    "LogisticRegression",
    "SGDClassifier",
    "SGDRegressor",
    "DecisionTreeClassifier",
    "DecisionTreeRegressor",
    "RandomForestClassifier",
    "RandomForestRegressor",
    "GradientBoostingClassifier",
    "GradientBoostingRegressor",
    "HistGradientBoostingClassifier",
    "HistGradientBoostingRegressor",
    "ExtraTreesClassifier",
    "ExtraTreesRegressor",
    "SVC",
    "SVR",
    "LinearSVC",
    "LinearSVR",
    "KNeighborsClassifier",
    "KNeighborsRegressor",
    "MLPClassifier",
    "MLPRegressor",
    "GaussianNB",
    "MultinomialNB",
    "BernoulliNB",
    "AdaBoostClassifier",
    "AdaBoostRegressor",
    "XGBClassifier",
    "XGBRegressor",
    "LGBMClassifier",
    "LGBMRegressor",
    "CatBoostClassifier",
    "CatBoostRegressor",
})

HIGH_CAPACITY_ESTIMATORS = frozenset({
    "RandomForestClassifier",
    "RandomForestRegressor",
    "GradientBoostingClassifier",
    "GradientBoostingRegressor",
    "HistGradientBoostingClassifier",
    "HistGradientBoostingRegressor",
    "ExtraTreesClassifier",
    "ExtraTreesRegressor",
    "MLPClassifier",
    "MLPRegressor",
    "XGBClassifier",
    "XGBRegressor",
    "LGBMClassifier",
    "LGBMRegressor",
    "CatBoostClassifier",
    "CatBoostRegressor",
})

DISTANCE_BASED_ESTIMATORS = frozenset({
    "KNeighborsClassifier",
    "KNeighborsRegressor",
    "RadiusNeighborsClassifier",
    "RadiusNeighborsRegressor",
})

TARGET_VAR_PATTERN = re.compile(
    r"^(y|y_train|y_test|y_val|labels|label|target|targets|class_labels)$",
    re.IGNORECASE,
)

FEATURE_VAR_PATTERN = re.compile(
    r"^(x|x_train|x_test|x_val|x_scaled|features|data|dataset|df)$",
    re.IGNORECASE,
)


# ---------------------------------------------------------------------------
# Internal Helpers
# ---------------------------------------------------------------------------

def _get_attr(obj: Any, key: str, default: Any = None) -> Any:
    """Helper to extract attribute from either a dict or an object."""
    if isinstance(obj, dict):
        return obj.get(key, default)
    return getattr(obj, key, default)


def _get_code_line(code: str, line_number: int) -> str:
    """Safely retrieve source code line text for a given 1-based line number."""
    lines = code.splitlines()
    if 1 <= line_number <= len(lines):
        return lines[line_number - 1].strip()
    return ""


def _find_step_for_line(steps: List[Any], line_number: int) -> Tuple[int, Optional[Any]]:
    """Return (step_id, step) matching line_number, or (1, None) if not directly found."""
    for step in steps:
        if _get_attr(step, "line_number") == line_number:
            return _get_attr(step, "step_id", 1), step
    if steps:
        # Fall back to first step
        return _get_attr(steps[0], "step_id", 1), steps[0]
    return 1, None


def _eval_safe_ast_literal(node: ast.AST) -> Optional[Any]:
    """
    Safely evaluate AST expressions for lists/arrays containing constants and multiplications.
    E.g., [0] * 90 + [1] * 10 or [0, 1, 0, 1].
    """
    if isinstance(node, ast.Constant):
        return node.value
    if isinstance(node, ast.List):
        res = []
        for e in node.elts:
            v = _eval_safe_ast_literal(e)
            if v is None and not isinstance(e, ast.Constant):
                return None
            res.append(v)
        return res
    if isinstance(node, ast.Tuple):
        res = []
        for e in node.elts:
            v = _eval_safe_ast_literal(e)
            if v is None and not isinstance(e, ast.Constant):
                return None
            res.append(v)
        return tuple(res)
    if isinstance(node, ast.BinOp):
        left = _eval_safe_ast_literal(node.left)
        right = _eval_safe_ast_literal(node.right)
        if left is None or right is None:
            return None
        if isinstance(node.op, ast.Mult):
            try:
                return left * right
            except Exception:
                return None
        if isinstance(node.op, ast.Add):
            try:
                return left + right
            except Exception:
                return None
    if isinstance(node, ast.Call):
        # Unwrap np.array(...) or pd.Series(...) or list(...)
        if node.args:
            return _eval_safe_ast_literal(node.args[0])
    return None


# ---------------------------------------------------------------------------
# Pass 1: Data Leakage Check
# ---------------------------------------------------------------------------

def _check_data_leakage(tree: ast.AST, code: str, steps: List[Any]) -> List[MLAuditIssue]:
    """
    AST-detect .fit() / .fit_transform() calls on StandardScaler / MinMaxScaler / OneHotEncoder
    and detect train_test_split() call sites; flag critical leakage if a fit call occurs
    on a line before the split.
    """
    issues: List[MLAuditIssue] = []

    # 1. Discover train_test_split call line numbers
    split_lines: List[int] = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Call):
            func = node.func
            if isinstance(func, ast.Name) and func.id == "train_test_split":
                split_lines.append(node.lineno)
            elif isinstance(func, ast.Attribute) and func.attr == "train_test_split":
                split_lines.append(node.lineno)

    if not split_lines:
        return issues

    first_split_line = min(split_lines)

    # 2. Track preprocessor variables and instantiation sites
    preprocessor_vars: Set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Assign):
            rhs = node.value
            is_prep = False
            if isinstance(rhs, ast.Call):
                call_func = rhs.func
                func_name = ""
                if isinstance(call_func, ast.Name):
                    func_name = call_func.id
                elif isinstance(call_func, ast.Attribute):
                    func_name = call_func.attr

                if func_name in PREPROCESSOR_CLASSES or any(
                    term in func_name.lower()
                    for term in ("scaler", "encoder", "normalizer", "imputer", "discretizer")
                ):
                    is_prep = True

            if is_prep:
                for target in node.targets:
                    if isinstance(target, ast.Name):
                        preprocessor_vars.add(target.id)

    # Also include variables named intuitively like 'scaler', 'encoder'
    for node in ast.walk(tree):
        if isinstance(node, ast.Name) and isinstance(node.ctx, ast.Store):
            if any(term in node.id.lower() for term in ("scaler", "encoder", "imputer", "normalizer")):
                preprocessor_vars.add(node.id)

    # 3. Discover .fit() and .fit_transform() calls
    for node in ast.walk(tree):
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute):
            method_name = node.func.attr
            if method_name in ("fit", "fit_transform"):
                caller = node.func.value
                caller_name = ""
                is_preprocessor_call = False

                if isinstance(caller, ast.Name):
                    caller_name = caller.id
                    if caller_name in preprocessor_vars or any(
                        term in caller_name.lower()
                        for term in ("scaler", "encoder", "imputer", "normalizer", "transform")
                    ):
                        is_preprocessor_call = True
                elif isinstance(caller, ast.Call):
                    c_func = caller.func
                    c_name = c_func.id if isinstance(c_func, ast.Name) else getattr(c_func, "attr", "")
                    if c_name in PREPROCESSOR_CLASSES:
                        is_preprocessor_call = True

                # fit_transform is almost exclusively used on feature transformers
                if method_name == "fit_transform":
                    is_preprocessor_call = True

                call_line = node.lineno
                if is_preprocessor_call and call_line < first_split_line:
                    step_id, _ = _find_step_for_line(steps, call_line)
                    code_text = _get_code_line(code, call_line)
                    var_display = caller_name if caller_name else "transformer"

                    issues.append(
                        MLAuditIssue(
                            issue_id=f"ml-leakage-{call_line}",
                            step_id=step_id,
                            line_number=call_line,
                            category="data_leakage",
                            severity="critical",
                            title="Data Leakage: Preprocessor fit before train/test split",
                            message=(
                                f"Feature preprocessor '{var_display}.{method_name}()' executed on line {call_line} "
                                f"prior to 'train_test_split()' on line {first_split_line}. "
                                "Fitting transformers on unpartitioned data leaks test set distribution parameters "
                                "into the training representation."
                            ),
                            offending_code=code_text,
                            remediation_code=(
                                "# 1. Partition raw data first:\n"
                                "X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)\n\n"
                                "# 2. Fit preprocessor ONLY on the training split, then transform both:\n"
                                f"{var_display} = StandardScaler()\n"
                                f"X_train_scaled = {var_display}.fit_transform(X_train)\n"
                                f"X_test_scaled = {var_display}.transform(X_test)"
                            ),
                            explanation=(
                                "Fitting feature transformers (such as StandardScaler, MinMaxScaler, or OneHotEncoder) "
                                "across the complete dataset prior to splitting leaks empirical distribution metrics "
                                "(mean, standard deviation, category levels) from the evaluation split into the training split. "
                                "This creates overly optimistic validation metrics that will degrade when deployed to production."
                            ),
                        )
                    )

    return issues


# ---------------------------------------------------------------------------
# Pass 2: Class Imbalance Check
# ---------------------------------------------------------------------------

def _check_class_imbalance(
    tree: ast.AST,
    code: str,
    steps: List[Any],
) -> List[MLAuditIssue]:
    """
    Inspect variables named like y / y_train / labels / target in the trace's variable deltas
    and AST assignments; flag if the majority class exceeds 80%.
    """
    issues: List[MLAuditIssue] = []
    seen_vars: Set[str] = set()

    # 1. Attempt AST static evaluation for target variables (e.g. y = np.array([0]*90 + [1]*10))
    ast_targets: Dict[str, Tuple[int, List[Any]]] = {}
    for node in ast.walk(tree):
        if isinstance(node, ast.Assign):
            for target in node.targets:
                if isinstance(target, ast.Name) and TARGET_VAR_PATTERN.match(target.id):
                    evaluated = _eval_safe_ast_literal(node.value)
                    if isinstance(evaluated, (list, tuple)) and len(evaluated) >= 5:
                        ast_targets[target.id] = (node.lineno, list(evaluated))

    # 2. Inspect runtime trace variable deltas
    trace_targets: Dict[str, Tuple[int, int, List[Any]]] = {}  # var -> (step_id, line, items)
    for step in steps:
        step_id = _get_attr(step, "step_id", 1)
        line_no = _get_attr(step, "line_number", 1)
        deltas = _get_attr(step, "variable_deltas", {}) or {}

        for var_name, delta in deltas.items():
            if not TARGET_VAR_PATTERN.match(var_name):
                continue

            new_val = _get_attr(delta, "new_value")
            items: Optional[List[Any]] = None

            if isinstance(new_val, (list, tuple)) and len(new_val) >= 5:
                items = list(new_val)
            else:
                repr_str = _get_attr(delta, "repr_str", "")
                # If repr_str is a list representation like [0, 0, ..., 1, 0]
                if repr_str.startswith("[") and "]" in repr_str:
                    try:
                        # Extract integer/string tokens
                        tokens = re.findall(r"\b\d+\b", repr_str)
                        if len(tokens) >= 5:
                            items = tokens
                    except Exception:
                        pass

            if items and len(items) >= 5:
                trace_targets[var_name] = (step_id, line_no, items)

    # Combine static AST and runtime trace findings
    candidate_targets: Dict[str, Tuple[int, int, List[Any]]] = {}

    for var_name, (step_id, line_no, items) in trace_targets.items():
        candidate_targets[var_name] = (step_id, line_no, items)

    for var_name, (line_no, items) in ast_targets.items():
        if var_name not in candidate_targets:
            step_id, _ = _find_step_for_line(steps, line_no)
            candidate_targets[var_name] = (step_id, line_no, items)
        else:
            # If AST has full list and trace was truncated, use AST items
            if len(items) > len(candidate_targets[var_name][2]):
                step_id = candidate_targets[var_name][0]
                candidate_targets[var_name] = (step_id, line_no, items)

    for var_name, (step_id, line_no, items) in candidate_targets.items():
        if var_name in seen_vars:
            continue

        counts = Counter(items)
        total = sum(counts.values())
        if total < 5:
            continue

        majority_val, majority_count = counts.most_common(1)[0]
        ratio = majority_count / total

        if ratio > 0.8:  # Majority class exceeds 80%
            seen_vars.add(var_name)
            pct = ratio * 100
            code_text = _get_code_line(code, line_no)

            issues.append(
                MLAuditIssue(
                    issue_id=f"ml-imbalance-{step_id}-{var_name}",
                    step_id=step_id,
                    line_number=line_no,
                    category="class_imbalance",
                    severity="warning",
                    title=f"Class Imbalance in Target '{var_name}' ({pct:.1f}% Majority)",
                    message=(
                        f"Target variable '{var_name}' on line {line_no} shows severe class imbalance: "
                        f"class '{majority_val}' represents {pct:.1f}% ({majority_count}/{total}) of samples "
                        "(exceeds 80% heuristic threshold). Standard accuracy metrics will be misleadingly inflated."
                    ),
                    offending_code=code_text,
                    remediation_code=(
                        "# Address class imbalance using stratification, class weights, or resampling:\n"
                        "from sklearn.utils.class_weight import compute_class_weight\n\n"
                        "# 1. Ensure stratified partitioning:\n"
                        f"X_train, X_test, y_train, y_test = train_test_split(X, {var_name}, test_size=0.2, stratify={var_name})\n\n"
                        "# 2. Supply class weights to downstream estimator:\n"
                        "# model = LogisticRegression(class_weight='balanced')\n"
                        "# 3. Evaluate using Balanced Accuracy, F1-Score, or PR-AUC rather than raw Accuracy."
                    ),
                    explanation=(
                        f"When a single class accounts for {pct:.1f}% of observed targets, an unweighted classifier "
                        "minimizes empirical loss by trivially predicting the majority class for all instances. "
                        "This leads to severe failures on minority classes despite high nominal accuracy scores."
                    ),
                )
            )

    return issues


# ---------------------------------------------------------------------------
# Pass 3: Estimator / Data Mismatch Check
# ---------------------------------------------------------------------------

def _check_estimator_data_mismatch(
    tree: ast.AST,
    code: str,
    steps: List[Any],
    has_class_imbalance: bool,
) -> List[MLAuditIssue]:
    """
    Compare feature count (DataFrame / array shape) against estimator complexity heuristics:
    1. Curse of dimensionality / high-dimensional p > n mismatch.
    2. Distance-based estimators (KNN) operating on high feature counts (p > 20).
    3. High-capacity ensembles (RandomForest, GradientBoosting, MLP) trained on very small n (< 30).
    4. Metric mismatch: using raw accuracy on imbalanced datasets.
    """
    issues: List[MLAuditIssue] = []

    # 1. Discover feature dimensions (n_samples, n_features) from trace metadata
    n_samples: Optional[int] = None
    n_features: Optional[int] = None
    feature_var_line: int = 1

    for step in steps:
        deltas = _get_attr(step, "variable_deltas", {}) or {}
        for var_name, delta in deltas.items():
            if FEATURE_VAR_PATTERN.match(var_name):
                meta = _get_attr(delta, "metadata")
                if meta:
                    shape = _get_attr(meta, "shape")
                    if shape and len(shape) == 2:
                        n_samples = shape[0]
                        n_features = shape[1]
                        feature_var_line = _get_attr(step, "line_number", 1)

    # Fallback: inspect AST for assignments like X = np.random.randn(100, 4)
    if n_samples is None or n_features is None:
        for node in ast.walk(tree):
            if isinstance(node, ast.Assign):
                for target in node.targets:
                    if isinstance(target, ast.Name) and FEATURE_VAR_PATTERN.match(target.id):
                        if isinstance(node.value, ast.Call):
                            args = node.value.args
                            if len(args) == 2:
                                s0 = _eval_safe_ast_literal(args[0])
                                s1 = _eval_safe_ast_literal(args[1])
                                if isinstance(s0, int) and isinstance(s1, int):
                                    n_samples = s0
                                    n_features = s1
                                    feature_var_line = node.lineno

    # 2. Discover estimator calls and instantiations in AST
    estimators_found: List[Tuple[str, int]] = []  # (estimator_class, line_number)
    for node in ast.walk(tree):
        if isinstance(node, ast.Call):
            func = node.func
            fname = ""
            if isinstance(func, ast.Name):
                fname = func.id
            elif isinstance(func, ast.Attribute):
                fname = func.attr

            if fname in ESTIMATOR_CLASSES:
                estimators_found.append((fname, node.lineno))

    # Check Heuristic A: p > n (Curse of Dimensionality / High Dimensionality)
    if n_samples is not None and n_features is not None:
        if n_features > n_samples and n_samples > 0:
            step_id, _ = _find_step_for_line(steps, feature_var_line)
            code_text = _get_code_line(code, feature_var_line)
            issues.append(
                MLAuditIssue(
                    issue_id=f"ml-dim-mismatch-{feature_var_line}",
                    step_id=step_id,
                    line_number=feature_var_line,
                    category="preprocessing_mismatch",
                    severity="critical" if estimators_found else "warning",
                    title=f"High Dimensionality: Features ({n_features}) Exceed Samples ({n_samples})",
                    message=(
                        f"Dataset has {n_features} features but only {n_samples} samples (p > n). "
                        "When feature dimensions exceed sample count, unregularized linear models "
                        "and decision trees suffer from severe variance and rank deficiency."
                    ),
                    offending_code=code_text,
                    remediation_code=(
                        "# Apply dimensionality reduction or regularized feature selection:\n"
                        "from sklearn.decomposition import PCA\n"
                        "from sklearn.linear_model import Ridge, Lasso\n\n"
                        f"pca = PCA(n_components=min(10, {n_samples} // 2))\n"
                        "X_reduced = pca.fit_transform(X)"
                    ),
                    explanation=(
                        "In the p > n regime, the feature covariance matrix is rank-deficient and cannot be inverted. "
                        "Without strict regularization (L1 Lasso / L2 Ridge) or projection (PCA), models overfit "
                        "training noise and generalize poorly."
                    ),
                )
            )

        # Check Heuristic B: Distance-based estimators with high feature counts (p > 20)
        for est_name, est_line in estimators_found:
            if est_name in DISTANCE_BASED_ESTIMATORS and n_features > 20:
                step_id, _ = _find_step_for_line(steps, est_line)
                code_text = _get_code_line(code, est_line)
                issues.append(
                    MLAuditIssue(
                        issue_id=f"ml-knn-dim-{est_line}",
                        step_id=step_id,
                        line_number=est_line,
                        category="preprocessing_mismatch",
                        severity="warning",
                        title=f"Curse of Dimensionality in '{est_name}' (p={n_features} > 20)",
                        message=(
                            f"Distance-based estimator '{est_name}' instantiated with {n_features} features. "
                            "In dimensions > 20, Euclidean distances concentrate and nearest-neighbor distinctions degrade."
                        ),
                        offending_code=code_text,
                        remediation_code=(
                            "from sklearn.pipeline import Pipeline\n"
                            "from sklearn.decomposition import PCA\n"
                            f"from sklearn.neighbors import {est_name}\n\n"
                            "pipeline = Pipeline([\n"
                            "    ('pca', PCA(n_components=10)),\n"
                            f"    ('model', {est_name}(n_neighbors=5))\n"
                            "])"
                        ),
                        explanation=(
                            "As dimensionality increases, the volume of space grows exponentially, making all pairwise "
                            "distances approximately equal. Nearest neighbor queries lose discrimination capacity without "
                            "manifold learning or dimensionality reduction."
                        ),
                    )
                )

        # Check Heuristic C: High-capacity ensemble on very small sample size (< 30)
        for est_name, est_line in estimators_found:
            if est_name in HIGH_CAPACITY_ESTIMATORS and n_samples < 30 and n_samples > 0:
                step_id, _ = _find_step_for_line(steps, est_line)
                code_text = _get_code_line(code, est_line)
                issues.append(
                    MLAuditIssue(
                        issue_id=f"ml-capacity-mismatch-{est_line}",
                        step_id=step_id,
                        line_number=est_line,
                        category="preprocessing_mismatch",
                        severity="warning",
                        title=f"Model Complexity Mismatch: '{est_name}' on Small Dataset (n={n_samples})",
                        message=(
                            f"High-capacity estimator '{est_name}' applied to small sample size (n={n_samples} < 30). "
                            "Ensemble trees and neural networks will easily memorize small datasets."
                        ),
                        offending_code=code_text,
                        remediation_code=(
                            "# Switch to simpler regularized models or use cross-validation:\n"
                            "from sklearn.linear_model import RidgeClassifier, LogisticRegression\n"
                            "from sklearn.model_selection import StratifiedKFold\n\n"
                            "model = LogisticRegression(C=0.1, penalty='l2')"
                        ),
                        explanation=(
                            "Complex estimators possess high parameter capacity. When trained on fewer than 30 samples, "
                            "they exhibit high variance and severe overfitting even with default hyperparameters."
                        ),
                    )
                )

    # Check Heuristic D: Metric Mismatch Check
    # If class imbalance exists and accuracy_score or score() is invoked in AST
    if has_class_imbalance:
        for node in ast.walk(tree):
            if isinstance(node, ast.Call):
                func = node.func
                is_accuracy_call = False
                if isinstance(func, ast.Name) and func.id == "accuracy_score":
                    is_accuracy_call = True
                elif isinstance(func, ast.Attribute) and func.attr in ("accuracy_score", "score"):
                    is_accuracy_call = True

                if is_accuracy_call:
                    step_id, _ = _find_step_for_line(steps, node.lineno)
                    code_text = _get_code_line(code, node.lineno)
                    issues.append(
                        MLAuditIssue(
                            issue_id=f"ml-metric-mismatch-{node.lineno}",
                            step_id=step_id,
                            line_number=node.lineno,
                            category="metric_mismatch",
                            severity="warning",
                            title="Evaluation Metric Mismatch: Accuracy on Imbalanced Data",
                            message=(
                                f"Accuracy metric called on line {node.lineno} on a dataset with severe class imbalance. "
                                "Accuracy is dominated by majority class performance and fails to reflect predictive power."
                            ),
                            offending_code=code_text,
                            remediation_code=(
                                "from sklearn.metrics import classification_report, f1_score, roc_auc_score\n\n"
                                "# Replace raw accuracy with balanced metrics:\n"
                                "print(classification_report(y_test, y_pred))\n"
                                "# f1 = f1_score(y_test, y_pred, average='weighted')"
                            ),
                            explanation=(
                                "Accuracy measures the fraction of correct predictions regardless of class distribution. "
                                "Under severe imbalance, a degenerate predictor that always predicts the majority class "
                                "receives high accuracy while providing zero utility on the minority class."
                            ),
                        )
                    )

    return issues


# ---------------------------------------------------------------------------
# Public Diagnostics Pipeline
# ---------------------------------------------------------------------------

def run_ml_diagnostics(steps: List[Any], code: str) -> List[MLAuditIssue]:
    """
    Executes all ModelLens diagnostics passes over the completed execution trace and source code.

    Returns a list of MLAuditIssue objects sorted by line number.
    """
    if not code or not code.strip():
        return []

    try:
        tree = ast.parse(code)
    except Exception:
        return []

    issues: List[MLAuditIssue] = []

    # Pass 1: Data Leakage Check
    try:
        leakage_issues = _check_data_leakage(tree, code, steps)
        issues.extend(leakage_issues)
    except Exception:
        pass

    # Pass 2: Class Imbalance Check
    has_imbalance = False
    try:
        imbalance_issues = _check_class_imbalance(tree, code, steps)
        if imbalance_issues:
            has_imbalance = True
        issues.extend(imbalance_issues)
    except Exception:
        pass

    # Pass 3: Estimator / Data Mismatch Check
    try:
        mismatch_issues = _check_estimator_data_mismatch(tree, code, steps, has_imbalance)
        issues.extend(mismatch_issues)
    except Exception:
        pass

    # Deduplicate issues by issue_id and sort by line_number
    seen_ids: Set[str] = set()
    deduped: List[MLAuditIssue] = []
    for issue in issues:
        if issue.issue_id not in seen_ids:
            seen_ids.add(issue.issue_id)
            deduped.append(issue)

    deduped.sort(key=lambda x: (x.line_number, x.step_id))
    return deduped
