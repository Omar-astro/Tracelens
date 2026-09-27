"""
ml_diagnostics.py — ModelLens Diagnostics Engine.

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

RESAMPLING_CLASSES = frozenset({
    "SMOTE",
    "ADASYN",
    "RandomOverSampler",
    "BorderlineSMOTE",
    "SVMSMOTE",
    "SMOTENC",
    "SMOTEN",
    "RandomUnderSampler",
    "NearMiss",
    "TomekLinks",
    "EditedNearestNeighbours",
    "InstanceHardnessThreshold",
})

FEATURE_SELECTOR_CLASSES = frozenset({
    "SelectKBest",
    "SelectPercentile",
    "GenericUnivariateSelect",
    "RFE",
    "RFECV",
    "SelectFromModel",
    "SequentialFeatureSelector",
})

TEMPORAL_COLUMN_NAMES = frozenset({
    "timestamp",
    "date",
    "datetime",
    "time",
    "year",
    "month",
    "day",
    "hour",
    "minute",
    "second",
    "created_at",
    "updated_at",
    "period",
    "ts",
})

ENTITY_COLUMN_NAMES = frozenset({
    "customer_id",
    "user_id",
    "client_id",
    "patient_id",
    "device_id",
    "account_id",
    "session_id",
    "entity_id",
    "subject_id",
    "person_id",
    "member_id",
    "player_id",
})

TARGET_COLUMN_NAMES = frozenset({
    "churn",
    "target",
    "label",
    "labels",
    "y",
    "default",
    "status",
    "class",
    "outcome",
    "survived",
    "bought",
    "clicked",
})


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
# Dataset Schema & Column Extractor
# ---------------------------------------------------------------------------

def _extract_dataset_columns(tree: ast.AST) -> Set[str]:
    """Extracts column names mentioned in DataFrame definitions or indexing."""
    cols: Set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Dict):
            for k in node.keys:
                if isinstance(k, ast.Constant) and isinstance(k.value, str):
                    cols.add(k.value.lower())
        elif isinstance(node, ast.Subscript):
            if isinstance(node.slice, ast.Constant) and isinstance(node.slice.value, str):
                cols.add(node.slice.value.lower())
    return cols


# ---------------------------------------------------------------------------
# Pass 1: Data Leakage Check
# ---------------------------------------------------------------------------

def _check_data_leakage(tree: ast.AST, code: str, steps: List[Any]) -> List[MLAuditIssue]:
    """
    AST-detects all forms of data leakage occurring before train_test_split():
    1. Outlier removal based on global statistics (Mistake 1).
    2. Global imputation before splitting (Mistake 2).
    3. Target encoding computed across entire dataset (Mistake 3).
    4. Feature selection computed on unpartitioned dataset (Mistake 4).
    5. Feature scaling (StandardScaler/MinMaxScaler) fit before split (Mistake 5).
    6. Oversampling / SMOTE applied before split (Mistake 6).
    7. Random split on temporal or grouped entity data (Mistake 7).
    """
    issues: List[MLAuditIssue] = []

    # 1. Discover train_test_split call line numbers and nodes
    split_lines: List[int] = []
    split_calls: List[ast.Call] = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Call):
            func = node.func
            if (isinstance(func, ast.Name) and func.id == "train_test_split") or (
                isinstance(func, ast.Attribute) and func.attr == "train_test_split"
            ):
                split_lines.append(node.lineno)
                split_calls.append(node)

    if not split_lines:
        return issues

    first_split_line = min(split_lines)
    detected_cols = _extract_dataset_columns(tree)
    temporal_cols = detected_cols & TEMPORAL_COLUMN_NAMES
    entity_cols = detected_cols & ENTITY_COLUMN_NAMES

    # --- 1. Outlier Removal Leakage (Mistake 1) ---
    outlier_stat_vars: Set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Assign) and node.lineno < first_split_line:
            # Check if RHS computes outlier statistics (.mean(), .std(), .quantile(), etc.)
            calls = [
                n
                for n in ast.walk(node.value)
                if isinstance(n, ast.Call)
                and isinstance(n.func, ast.Attribute)
                and n.func.attr in ("mean", "std", "quantile", "median", "var")
            ]
            is_stat_calc = bool(calls)
            for t in node.targets:
                if isinstance(t, ast.Name):
                    t_low = t.id.lower()
                    if is_stat_calc or any(
                        k in t_low
                        for k in ("mean", "std", "iqr", "bound", "threshold", "cutoff", "quantile")
                    ):
                        outlier_stat_vars.add(t.id)

            # Check if LHS is df filtering df = df[...] with <, >, <=, >=
            rhs = node.value
            if isinstance(rhs, ast.Call) and isinstance(rhs.func, ast.Attribute) and rhs.func.attr == "copy":
                rhs = rhs.func.value
            if isinstance(rhs, ast.Subscript):
                slice_node = rhs.slice
                compares = [n for n in ast.walk(slice_node) if isinstance(n, ast.Compare)]
                for cmp in compares:
                    names_in_cmp = {n.id for n in ast.walk(cmp) if isinstance(n, ast.Name)}
                    attrs_in_cmp = {
                        n.func.attr
                        for n in ast.walk(cmp)
                        if isinstance(n, ast.Call) and isinstance(n.func, ast.Attribute)
                    }
                    if (
                        (names_in_cmp & outlier_stat_vars)
                        or (attrs_in_cmp & {"mean", "std", "quantile", "median"})
                        or any("debt" in n or "ratio" in n or "bound" in n for n in names_in_cmp)
                    ):
                        step_id, _ = _find_step_for_line(steps, node.lineno)
                        code_text = _get_code_line(code, node.lineno)
                        issues.append(
                            MLAuditIssue(
                                issue_id=f"ml-outlier-leakage-{node.lineno}",
                                step_id=step_id,
                                line_number=node.lineno,
                                category="data_leakage",
                                severity="critical",
                                title="Data Leakage: Outlier Removal Based on Global Statistics",
                                message=(
                                    f"Outlier filtering on line {node.lineno} removes rows using global dataset statistics "
                                    f"prior to 'train_test_split()' on line {first_split_line}. "
                                    "Filtering outliers on unpartitioned data leaks test set distribution boundaries into the "
                                    "training fold and discards valid evaluation samples."
                                ),
                                offending_code=code_text,
                                remediation_code=(
                                    "# Calculate outlier thresholds strictly on the training partition:\n"
                                    "X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)\n"
                                    "mean_val = X_train['debt_ratio'].mean()\n"
                                    "std_val = X_train['debt_ratio'].std()\n"
                                    "# Filter outliers strictly from training fold:\n"
                                    "train_mask = X_train['debt_ratio'] < mean_val + 3 * std_val\n"
                                    "X_train, y_train = X_train[train_mask], y_train[train_mask]"
                                ),
                                explanation=(
                                    "Computing distribution metrics (mean, standard deviation, interquartile range) across the entire "
                                    "dataset to eliminate outliers leaks empirical variance and boundary metrics from the test split into "
                                    "the training set. Outlier filtering must be fitted strictly on the training partition."
                                ),
                            )
                        )
                        break

    # --- 2. Global Imputation Leakage (Mistake 2) ---
    for node in ast.walk(tree):
        if isinstance(node, ast.Call) and node.lineno < first_split_line:
            if isinstance(node.func, ast.Attribute) and node.func.attr == "fillna":
                calls = [
                    n
                    for n in ast.walk(node)
                    if isinstance(n, ast.Call)
                    and isinstance(n.func, ast.Attribute)
                    and n.func.attr in ("mean", "median", "mode")
                ]
                if calls or any(isinstance(a, ast.Name) and "mean" in a.id.lower() for a in node.args):
                    step_id, _ = _find_step_for_line(steps, node.lineno)
                    code_text = _get_code_line(code, node.lineno)
                    issues.append(
                        MLAuditIssue(
                            issue_id=f"ml-imputation-leakage-{node.lineno}",
                            step_id=step_id,
                            line_number=node.lineno,
                            category="data_leakage",
                            severity="critical",
                            title="Data Leakage: Global Imputation before Train/Test Split",
                            message=(
                                f"Missing value imputation executed on line {node.lineno} prior to 'train_test_split()' "
                                f"on line {first_split_line}. Imputing missing values using dataset-wide aggregate statistics "
                                "leaks test set central tendencies into training features."
                            ),
                            offending_code=code_text,
                            remediation_code=(
                                "# Impute missing values strictly using training set parameters:\n"
                                "X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)\n"
                                "income_mean = X_train['income'].mean()\n"
                                "X_train['income'] = X_train['income'].fillna(income_mean)\n"
                                "X_test['income'] = X_test['income'].fillna(income_mean)"
                            ),
                            explanation=(
                                "Calculating replacement values (mean, median, mode) across the entire dataset before partitioning "
                                "leaks empirical summary statistics from the evaluation split into the training split. Imputers must "
                                "learn parameters strictly from training data."
                            ),
                        )
                    )

    # --- 3. Target Encoding Leakage (Mistake 3) ---
    for node in ast.walk(tree):
        if isinstance(node, ast.Assign) and node.lineno < first_split_line:
            for sub in ast.walk(node.value):
                if isinstance(sub, ast.Call) and isinstance(sub.func, ast.Attribute):
                    if sub.func.attr in ("mean", "agg", "transform", "apply"):
                        val = sub.func.value
                        if isinstance(val, ast.Subscript):
                            col = val.slice
                            col_str = col.value if isinstance(col, ast.Constant) and isinstance(col.value, str) else ""
                            if col_str.lower() in TARGET_COLUMN_NAMES:
                                step_id, _ = _find_step_for_line(steps, node.lineno)
                                code_text = _get_code_line(code, node.lineno)
                                issues.append(
                                    MLAuditIssue(
                                        issue_id=f"ml-target-encoding-leakage-{node.lineno}",
                                        step_id=step_id,
                                        line_number=node.lineno,
                                        category="data_leakage",
                                        severity="critical",
                                        title="Data Leakage: Target Encoding across Entire Dataset",
                                        message=(
                                            f"Target encoding computed on line {node.lineno} prior to 'train_test_split()' "
                                            f"on line {first_split_line}. Computing conditional target expectations using the full "
                                            "dataset directly encodes ground-truth test labels into training feature representations."
                                        ),
                                        offending_code=code_text,
                                        remediation_code=(
                                            "# Compute target encoding mappings strictly on the training partition:\n"
                                            "X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)\n"
                                            "target_map = y_train.groupby(X_train['category']).mean()\n"
                                            "X_train['category_encoded'] = X_train['category'].map(target_map)\n"
                                            "X_test['category_encoded'] = X_test['category'].map(target_map).fillna(y_train.mean())"
                                        ),
                                        explanation=(
                                            "Target encoding replaces categorical categories with the posterior probability or mean of the "
                                            "target. Computing this across the unpartitioned dataset leaks the exact target ground truth of "
                                            "the test set into the features, causing severe data leakage and artificially inflated metrics."
                                        ),
                                    )
                                )
                                break

    # --- 4. Feature Selection Leakage (Mistake 4) ---
    for node in ast.walk(tree):
        if isinstance(node, ast.Call) and node.lineno < first_split_line:
            is_feat_sel = False
            if isinstance(node.func, ast.Attribute) and node.func.attr in ("corrwith", "corr"):
                names_in_call = [
                    n.slice.value
                    for n in ast.walk(node)
                    if isinstance(n, ast.Subscript) and isinstance(n.slice, ast.Constant) and isinstance(n.slice.value, str)
                ]
                if any(n.lower() in TARGET_COLUMN_NAMES for n in names_in_call) or any(
                    isinstance(n, ast.Name) and n.id in ("y", "target", "labels") for n in ast.walk(node)
                ):
                    is_feat_sel = True
            elif isinstance(node.func, (ast.Name, ast.Attribute)):
                fname = node.func.id if isinstance(node.func, ast.Name) else node.func.attr
                if fname in FEATURE_SELECTOR_CLASSES:
                    is_feat_sel = True

            if is_feat_sel:
                step_id, _ = _find_step_for_line(steps, node.lineno)
                code_text = _get_code_line(code, node.lineno)
                issues.append(
                    MLAuditIssue(
                        issue_id=f"ml-feature-selection-leakage-{node.lineno}",
                        step_id=step_id,
                        line_number=node.lineno,
                        category="data_leakage",
                        severity="critical",
                        title="Data Leakage: Feature Selection on Unsplit Dataset",
                        message=(
                            f"Feature selection computed on line {node.lineno} across the unpartitioned dataset prior to "
                            f"'train_test_split()' on line {first_split_line}. Evaluating correlations or statistical dependence "
                            "against the target before splitting biases feature rankings with test set signals."
                        ),
                        offending_code=code_text,
                        remediation_code=(
                            "# Perform feature selection strictly on the training partition:\n"
                            "X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)\n"
                            "corr = X_train[numeric_features].corrwith(y_train).abs()\n"
                            "top_features = corr.nlargest(2).index.tolist()\n"
                            "X_train = X_train[top_features]\n"
                            "X_test = X_test[top_features]"
                        ),
                        explanation=(
                            "Feature selection selects variables with the highest correlation or predictive capacity with the target. "
                            "When performed on the entire dataset before splitting, the model selects features that overfit random "
                            "fluctuations in the test set, leading to optimistically biased validation scores."
                        ),
                    )
                )

    # --- 5. Global Feature Scaling (Mistake 5) ---
    preprocessor_vars: Set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Assign):
            rhs = node.value
            is_prep = False
            if isinstance(rhs, ast.Call):
                call_func = rhs.func
                func_name = call_func.id if isinstance(call_func, ast.Name) else getattr(call_func, "attr", "")
                if func_name in PREPROCESSOR_CLASSES or any(
                    term in func_name.lower() for term in ("scaler", "encoder", "normalizer", "imputer", "discretizer")
                ):
                    is_prep = True
            if is_prep:
                for target in node.targets:
                    if isinstance(target, ast.Name):
                        preprocessor_vars.add(target.id)

    for node in ast.walk(tree):
        if isinstance(node, ast.Name) and isinstance(node.ctx, ast.Store):
            if any(term in node.id.lower() for term in ("scaler", "encoder", "imputer", "normalizer")):
                preprocessor_vars.add(node.id)

    for node in ast.walk(tree):
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute):
            method_name = node.func.attr
            if method_name in ("fit", "fit_transform"):
                caller = node.func.value
                caller_name = caller.id if isinstance(caller, ast.Name) else ""
                is_preprocessor_call = False
                if caller_name and (
                    caller_name in preprocessor_vars
                    or any(term in caller_name.lower() for term in ("scaler", "encoder", "imputer", "normalizer", "transform"))
                ):
                    is_preprocessor_call = True
                elif isinstance(caller, ast.Call):
                    c_func = caller.func
                    c_name = c_func.id if isinstance(c_func, ast.Name) else getattr(c_func, "attr", "")
                    if c_name in PREPROCESSOR_CLASSES:
                        is_preprocessor_call = True

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

    # --- 6. Resampling / SMOTE Leakage (Mistake 6) ---
    for node in ast.walk(tree):
        if isinstance(node, ast.Assign) and node.lineno < first_split_line:
            if isinstance(node.value, ast.Call):
                func = node.value.func
                fname = func.id if isinstance(func, ast.Name) else getattr(func, "attr", "")
                if fname == "fit_resample":
                    step_id, _ = _find_step_for_line(steps, node.lineno)
                    code_text = _get_code_line(code, node.lineno)
                    issues.append(
                        MLAuditIssue(
                            issue_id=f"ml-resampling-leakage-{node.lineno}",
                            step_id=step_id,
                            line_number=node.lineno,
                            category="data_leakage",
                            severity="critical",
                            title="Data Leakage: Resampling (SMOTE) Applied before Split",
                            message=(
                                f"Resampling technique '.fit_resample()' executed on line {node.lineno} prior to "
                                f"'train_test_split()' on line {first_split_line}. Synthesizing minority samples before "
                                "splitting creates synthetic samples bridging train and test distributions, causing direct "
                                "data leakage into test folds."
                            ),
                            offending_code=code_text,
                            remediation_code=(
                                "# Split raw data first, then apply SMOTE ONLY to the training partition:\n"
                                "X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)\n"
                                "smote = SMOTE(random_state=42)\n"
                                "X_train_resampled, y_train_resampled = smote.fit_resample(X_train, y_train)\n"
                                "# Fit estimator on resampled training set:\n"
                                "clf.fit(X_train_resampled, y_train_resampled)"
                            ),
                            explanation=(
                                "Resampling algorithms like SMOTE synthesize new data points by interpolating between nearest "
                                "neighbors. When applied before train/test splitting, synthetic points are generated using test-set "
                                "neighbors and distributed across both train and test partitions. This leaks test patterns into "
                                "training and corrupts evaluation integrity."
                            ),
                        )
                    )

    # --- 7. Temporal / Grouped Split (Mistake 7) ---
    for sc in split_calls:
        has_temp = bool(temporal_cols)
        has_ent = bool(entity_cols)
        shuffle_val = True
        for kw in sc.keywords:
            if kw.arg == "shuffle":
                if isinstance(kw.value, ast.Constant):
                    shuffle_val = bool(kw.value.value)
        if (has_temp or has_ent) and shuffle_val:
            col_list = ", ".join(f"'{c}'" for c in sorted(temporal_cols | entity_cols))
            step_id, _ = _find_step_for_line(steps, sc.lineno)
            code_text = _get_code_line(code, sc.lineno)
            issues.append(
                MLAuditIssue(
                    issue_id=f"ml-temporal-grouped-split-{sc.lineno}",
                    step_id=step_id,
                    line_number=sc.lineno,
                    category="data_leakage",
                    severity="warning",
                    title="Data Leakage: Random Split on Temporal / Grouped Data",
                    message=(
                        f"Random 'train_test_split()' executed on line {sc.lineno} with shuffle=True on a dataset containing "
                        f"{col_list}. Shuffling time series data causes temporal lookahead bias; "
                        "randomly splitting grouped entities leaks customer-specific identity patterns between training and test sets."
                    ),
                    offending_code=code_text,
                    remediation_code=(
                        "# For temporal data, split sequentially without shuffling:\n"
                        "# X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, shuffle=False)\n"
                        "# For grouped entities (e.g. customer_id), use GroupShuffleSplit to keep customers isolated:\n"
                        "from sklearn.model_selection import GroupShuffleSplit\n"
                        "gss = GroupShuffleSplit(n_splits=1, test_size=0.2, random_state=42)\n"
                        "train_idx, test_idx = next(gss.split(X, y, groups=df['customer_id']))\n"
                        "X_train, X_test = X.iloc[train_idx], X.iloc[test_idx]\n"
                        "y_train, y_test = y.iloc[train_idx], y.iloc[test_idx]"
                    ),
                    explanation=(
                        "Shuffling sequential or time-series data allows future events to be included in training data to predict "
                        "past events, creating unrealistic lookahead bias. Furthermore, when entities (e.g., customer_id) have "
                        "multiple records, standard splitting places records from the same customer into both train and test splits, "
                        "causing identity leakage."
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
    and AST assignments / binomial distributions; flag if the majority class exceeds 80%.
    """
    issues: List[MLAuditIssue] = []
    seen_vars: Set[str] = set()

    # 1. Inspect binomial distributions in AST (e.g. churn in DataFrame dict or y = np.random.binomial)
    for node in ast.walk(tree):
        if isinstance(node, ast.Dict):
            for k, v in zip(node.keys, node.values):
                k_str = k.value if isinstance(k, ast.Constant) and isinstance(k.value, str) else ""
                for sub in ast.walk(v):
                    if isinstance(sub, ast.Call) and isinstance(sub.func, ast.Attribute) and sub.func.attr == "binomial":
                        if len(sub.args) >= 2:
                            p_val = getattr(sub.args[1], "value", None)
                            if isinstance(p_val, (int, float)) and (0.0 < p_val <= 0.20 or 0.80 <= p_val < 1.0):
                                target_name = k_str or "target"
                                ratio = max(p_val, 1.0 - p_val)
                                pct = ratio * 100.0
                                line_no = getattr(k, "lineno", getattr(sub, "lineno", 1))
                                step_id, _ = _find_step_for_line(steps, line_no)
                                code_text = _get_code_line(code, line_no)
                                seen_vars.add(target_name)
                                issues.append(
                                    MLAuditIssue(
                                        issue_id=f"ml-imbalance-{line_no}-{target_name}",
                                        step_id=step_id,
                                        line_number=line_no,
                                        category="class_imbalance",
                                        severity="warning",
                                        title=f"Class Imbalance in Target '{target_name}' ({pct:.1f}% Majority)",
                                        message=(
                                            f"Target column '{target_name}' defined on line {line_no} shows severe class imbalance "
                                            f"({pct:.1f}% majority). Standard unweighted models and raw accuracy metrics will "
                                            "be misleadingly inflated on this distribution."
                                        ),
                                        offending_code=code_text,
                                        remediation_code=(
                                            "# Address class imbalance using stratification, class weights, or resampling:\n"
                                            "from sklearn.utils.class_weight import compute_class_weight\n\n"
                                            "# 1. Ensure stratified partitioning:\n"
                                            "X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, stratify=y)\n\n"
                                            "# 2. Supply class weights to downstream estimator:\n"
                                            "# model = RandomForestClassifier(class_weight='balanced')\n"
                                            "# 3. Evaluate using Balanced Accuracy or F1-Score."
                                        ),
                                        explanation=(
                                            f"When a single class accounts for {pct:.1f}% of observed targets, an unweighted classifier "
                                            "minimizes empirical loss by trivially predicting the majority class for all instances. "
                                            "This leads to severe failures on minority classes despite high nominal accuracy scores."
                                        ),
                                    )
                                )
        elif isinstance(node, ast.Assign):
            for sub in ast.walk(node.value):
                if isinstance(sub, ast.Call) and isinstance(sub.func, ast.Attribute) and sub.func.attr == "binomial":
                    if len(sub.args) >= 2:
                        p_val = getattr(sub.args[1], "value", None)
                        if isinstance(p_val, (int, float)) and (0.0 < p_val <= 0.20 or 0.80 <= p_val < 1.0):
                            target_name = None
                            for t in node.targets:
                                if isinstance(t, ast.Name) and (TARGET_VAR_PATTERN.match(t.id) or t.id.lower() in TARGET_COLUMN_NAMES):
                                    target_name = t.id
                            if target_name and target_name not in seen_vars:
                                ratio = max(p_val, 1.0 - p_val)
                                pct = ratio * 100.0
                                step_id, _ = _find_step_for_line(steps, node.lineno)
                                code_text = _get_code_line(code, node.lineno)
                                seen_vars.add(target_name)
                                issues.append(
                                    MLAuditIssue(
                                        issue_id=f"ml-imbalance-{node.lineno}-{target_name}",
                                        step_id=step_id,
                                        line_number=node.lineno,
                                        category="class_imbalance",
                                        severity="warning",
                                        title=f"Class Imbalance in Target '{target_name}' ({pct:.1f}% Majority)",
                                        message=(
                                            f"Target variable '{target_name}' defined on line {node.lineno} shows severe class imbalance "
                                            f"({pct:.1f}% majority). Standard unweighted models and raw accuracy metrics will "
                                            "be misleadingly inflated on this distribution."
                                        ),
                                        offending_code=code_text,
                                        remediation_code=(
                                            "# Address class imbalance using stratification, class weights, or resampling:\n"
                                            "from sklearn.utils.class_weight import compute_class_weight\n\n"
                                            "# 1. Ensure stratified partitioning:\n"
                                            f"X_train, X_test, y_train, y_test = train_test_split(X, {target_name}, test_size=0.2, stratify={target_name})\n\n"
                                            "# 2. Supply class weights to downstream estimator:\n"
                                            "# model = RandomForestClassifier(class_weight='balanced')\n"
                                            "# 3. Evaluate using Balanced Accuracy or F1-Score."
                                        ),
                                        explanation=(
                                            f"When a single class accounts for {pct:.1f}% of observed targets, an unweighted classifier "
                                            "minimizes empirical loss by trivially predicting the majority class for all instances. "
                                            "This leads to severe failures on minority classes despite high nominal accuracy scores."
                                        ),
                                    )
                                )

    # 2. Attempt AST static evaluation for target variables (e.g. y = np.array([0]*90 + [1]*10))
    ast_targets: Dict[str, Tuple[int, List[Any]]] = {}
    for node in ast.walk(tree):
        if isinstance(node, ast.Assign):
            for target in node.targets:
                if isinstance(target, ast.Name) and TARGET_VAR_PATTERN.match(target.id):
                    evaluated = _eval_safe_ast_literal(node.value)
                    if isinstance(evaluated, (list, tuple)) and len(evaluated) >= 5:
                        ast_targets[target.id] = (node.lineno, list(evaluated))

    # 3. Inspect runtime trace variable deltas
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
                if repr_str.startswith("[") and "]" in repr_str:
                    try:
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
    Compare feature count against estimator complexity and audit evaluation methodology:
    1. Resampled test evaluation: testing on synthetic test fold derived from SMOTE (Mistake 8 part 1).
    2. Accuracy on imbalanced/synthetic data: misleading metrics (Mistake 8 part 2).
    3. Curse of dimensionality / high-dimensional p > n mismatch.
    4. Distance-based estimators (KNN) operating on high feature counts (p > 20).
    5. High-capacity ensembles (RandomForest, GradientBoosting, MLP) trained on very small n (< 30).
    """
    issues: List[MLAuditIssue] = []

    # 1. Discover resampled variables and test split targets derived from resampled data
    resample_vars: Set[str] = set()
    split_targets_resampled: Set[str] = set()
    has_resampling = False

    for node in ast.walk(tree):
        if isinstance(node, ast.Assign):
            if isinstance(node.value, ast.Call):
                func = node.value.func
                fname = func.id if isinstance(func, ast.Name) else getattr(func, "attr", "")
                if fname == "fit_resample" or fname in RESAMPLING_CLASSES:
                    has_resampling = True
                    for t in node.targets:
                        if isinstance(t, (ast.Tuple, ast.List)):
                            for elt in t.elts:
                                if isinstance(elt, ast.Name):
                                    resample_vars.add(elt.id)
                        elif isinstance(t, ast.Name):
                            resample_vars.add(t.id)

    for node in ast.walk(tree):
        if isinstance(node, ast.Assign) and isinstance(node.value, ast.Call):
            c = node.value
            c_name = c.func.id if isinstance(c.func, ast.Name) else getattr(c.func, "attr", "")
            if c_name == "train_test_split":
                receives_resampled = any(
                    isinstance(a, ast.Name) and (a.id in resample_vars or "resample" in a.id.lower())
                    for a in c.args
                )
                if receives_resampled:
                    for t in node.targets:
                        if isinstance(t, (ast.Tuple, ast.List)):
                            for elt in t.elts:
                                if isinstance(elt, ast.Name):
                                    split_targets_resampled.add(elt.id)

    # --- Mistake 8 Part 1: Resampled Test Set Evaluation ---
    for node in ast.walk(tree):
        if isinstance(node, ast.Call):
            func = node.func
            fname = func.id if isinstance(func, ast.Name) else getattr(func, "attr", "")
            if fname in ("predict", "predict_proba", "score"):
                for a in node.args:
                    if isinstance(a, ast.Name) and (
                        a.id in split_targets_resampled
                        or (a.id in ("X_test", "y_test") and has_resampling and split_targets_resampled)
                    ):
                        step_id, _ = _find_step_for_line(steps, node.lineno)
                        code_text = _get_code_line(code, node.lineno)
                        issues.append(
                            MLAuditIssue(
                                issue_id=f"ml-resampled-test-eval-{node.lineno}",
                                step_id=step_id,
                                line_number=node.lineno,
                                category="metric_mismatch",
                                severity="critical",
                                title="Evaluation Flaw: Test Split Derived from Resampled / Synthetic Data",
                                message=(
                                    f"Model evaluation on line {node.lineno} uses test partition '{a.id}' derived from "
                                    "resampled synthetic data. Evaluating on synthetic samples produces invalid validation "
                                    "metrics because test data must reflect the real-world operational distribution."
                                ),
                                offending_code=code_text,
                                remediation_code=(
                                    "# Test set must only consist of real, un-augmented samples:\n"
                                    "X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)\n"
                                    "# Resample strictly the training split:\n"
                                    "smote = SMOTE(random_state=42)\n"
                                    "X_train_res, y_train_res = smote.fit_resample(X_train, y_train)\n"
                                    "clf.fit(X_train_res, y_train_res)\n"
                                    "# Evaluate on untouched real test set:\n"
                                    "y_pred = clf.predict(X_test)"
                                ),
                                explanation=(
                                    "Oversampling methods like SMOTE synthesize artificial data points. Evaluating a model on synthetic "
                                    "test points measures its ability to interpolate artificial samples rather than its real-world generalization. "
                                    "Test sets must strictly preserve untouched natural data distributions."
                                ),
                            )
                        )
                        break

    # --- Mistake 8 Part 2: Accuracy on Imbalanced Data ---
    is_imbalanced_domain = has_class_imbalance or has_resampling
    if is_imbalanced_domain:
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
                                f"Accuracy metric called on line {node.lineno} on an imbalanced classification problem. "
                                "Accuracy is dominated by majority class performance and fails to reflect predictive power."
                            ),
                            offending_code=code_text,
                            remediation_code=(
                                "from sklearn.metrics import classification_report, f1_score, balanced_accuracy_score\n\n"
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

    # 2. Discover feature dimensions (n_samples, n_features) from trace metadata
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

    # 3. Discover estimator calls and instantiations in AST
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
