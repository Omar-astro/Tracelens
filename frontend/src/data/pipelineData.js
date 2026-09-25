// Mock data and trace timeline based on implementation-plan.md & Stitch design system

export const SAMPLE_CODE_DEFAULT = `import pandas as pd
from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import train_test_split
from sklearn.linear_model import LogisticRegression

# Ingestion and clean-up verified in step 01..05
df = pd.read_parquet("s3://data-lake/churn_q3.parquet")
df = df.dropna(subset=["total_charges", "tenure_months"])
X = df.drop(columns=["churn", "customer_id"])

# CRITICAL LEAKAGE POINT: fit_transform called before train_test_split
scaler = StandardScaler()
X_scaled = scaler.fit_transform(X)

feature_names = X.columns.tolist()
# Extract ground-truth class label vector
y = df["churn"].astype("int32")

# Step 14: Partitioning dataset into train & holdout test
X_train, X_test, y_train, y_test = train_test_split(X_scaled, y, test_size=0.2, random_state=42)

clf_penalty = "l2"
model = LogisticRegression(penalty=clf_penalty, C=1.0, solver="lbfgs", max_iter=100)

# Pending execution in step 31
model.fit(X_train, y_train)
y_prob = model.predict_proba(X_test)[:, 1]

from sklearn.metrics import roc_auc_score
score = roc_auc_score(y_test, y_prob)
print(f"Holdout ROC-AUC: {score:.4f}")

# End of Notebook Scope
__trace_telemetry_flush()`;

export const SAMPLE_CODE_REMEDIATED = `import pandas as pd
from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import train_test_split
from sklearn.linear_model import LogisticRegression

# Ingestion and clean-up verified in step 01..05
df = pd.read_parquet("s3://data-lake/churn_q3.parquet")
df = df.dropna(subset=["total_charges", "tenure_months"])
X = df.drop(columns=["churn", "customer_id"])

feature_names = X.columns.tolist()
# Extract ground-truth class label vector
y = df["churn"].astype("int32")

# Step 14: Partitioning dataset into train & holdout test FIRST
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

# Zero Contamination: Scaler fitted ONLY on X_train
scaler = StandardScaler()
X_train = scaler.fit_transform(X_train)
X_test = scaler.transform(X_test)

clf_penalty = "l2"
# Weighted classifier to address 92/8 class skew
model = LogisticRegression(penalty=clf_penalty, C=1.0, solver="lbfgs", max_iter=100, class_weight="balanced")

model.fit(X_train, y_train)
y_prob = model.predict_proba(X_test)[:, 1]

from sklearn.metrics import roc_auc_score
score = roc_auc_score(y_test, y_prob)
print(f"Holdout ROC-AUC: {score:.4f}")

# End of Notebook Scope
__trace_telemetry_flush()`;

export const INITIAL_TRACE_STEPS = [
  {
    stepId: 1,
    lineNumber: 6,
    codeLine: 'df = pd.read_parquet("s3://data-lake/churn_q3.parquet")',
    operation: 'load_dataset',
    memory: '142.0 KB',
    latency: '34ms',
    variables: {
      X: { type: 'DataFrame (raw)', shape: [1000, 26], nulls: 14, dtypes: '26 cols' },
      y: null,
      estimator: null
    },
    dimensionFlow: '(0, 0) → (1000, 26)',
    targetDistribution: null,
    issue: null
  },
  {
    stepId: 5,
    lineNumber: 7,
    codeLine: 'df = df.dropna(subset=["total_charges", "tenure_months"])',
    operation: 'drop_nulls',
    memory: '168.2 KB',
    latency: '48ms',
    variables: {
      X: { type: 'DataFrame', shape: [1000, 24], nulls: 0, dtypes: '24x float64' },
      y: null,
      estimator: null
    },
    dimensionFlow: '(1000, 26) → (1000, 24)',
    targetDistribution: null,
    issue: null
  },
  {
    stepId: 9,
    lineNumber: 11,
    codeLine: 'scaler = StandardScaler(); X_scaled = scaler.fit_transform(X)',
    operation: 'scaler.fit_transform',
    memory: '192.4 KB',
    latency: '78ms',
    variables: {
      X: { type: 'numpy.ndarray (scaled)', shape: [1000, 24], nulls: 0, dtypes: 'float64' },
      y: null,
      estimator: { name: 'StandardScaler', params: 'with_mean=True, with_std=True' }
    },
    dimensionFlow: '(1000, 24) → (1000, 24)',
    targetDistribution: null,
    issue: {
      type: 'data_leakage',
      severity: 'critical',
      assertionId: 'AL-09: GLOBAL_MOMENT_POLLUTION',
      title: 'CRITICAL LEAKAGE',
      message: 'StandardScaler.fit_transform() was executed prior to train_test_split() at Step 14. Empirical distribution parameters (μ, σ) derived from the holdout validation set were incorporated into feature transforms, corrupting model validity.',
      inflation: '~8.4%'
    }
  },
  {
    stepId: 14,
    lineNumber: 16,
    codeLine: 'X_train, X_test, y_train, y_test = train_test_split(X_scaled, y, test_size=0.2, random_state=42)',
    operation: 'train_test_split',
    memory: '192.4 KB',
    latency: '142ms',
    variables: {
      X_train: { type: 'numpy.ndarray', shape: [800, 24], nulls: 0, dtypes: 'float64' },
      X_test: { type: 'numpy.ndarray', shape: [200, 24], nulls: 0, dtypes: 'float64' },
      y_train: { type: 'Series', length: 800, positiveRate: '8.0%' }
    },
    dimensionFlow: '(1000, 24) → (800, 24) + (200, 24)',
    targetDistribution: {
      total: 1000,
      class0: { label: 'Class 0 (Retained)', count: 920, pct: 92.0 },
      class1: { label: 'Class 1 (Churn)', count: 80, pct: 8.0 },
      ratio: '11.5 : 1',
      holdoutPositives: '~16'
    },
    issue: {
      type: 'class_imbalance',
      severity: 'warning',
      assertionId: 'IMB-14: EXTREME_TARGET_SKEW',
      title: 'TARGET IMBALANCE 92/8',
      message: 'Severe class imbalance detected (92.0% Class 0 vs 8.0% Class 1). Holdout test split will contain only ~16 positive examples. Without resampling or class weighting, standard cross-entropy minimizes loss by predicting majority class.',
      ratio: '11.5 : 1'
    }
  },
  {
    stepId: 22,
    lineNumber: 19,
    codeLine: 'model = LogisticRegression(penalty=clf_penalty, C=1.0, solver="lbfgs", max_iter=100)',
    operation: 'estimator_init',
    memory: '210.5 KB',
    latency: '156ms',
    variables: {
      model: { name: 'LogisticRegression', penalty: 'l2', C: 1.0, solver: 'lbfgs', class_weight: 'None [FLAGGED]' }
    },
    dimensionFlow: '(800, 24)',
    targetDistribution: {
      total: 1000,
      class0: { label: 'Class 0 (Retained)', count: 920, pct: 92.0 },
      class1: { label: 'Class 1 (Churn)', count: 80, pct: 8.0 }
    },
    issue: {
      type: 'model_mismatch',
      severity: 'warning',
      assertionId: 'MM-22: UNWEIGHTED_CLASSIFIER_ON_SKEWED_TARGET',
      title: 'MODEL CONFIG MISMATCH',
      message: 'LogisticRegression configured with class_weight=None on 92/8 imbalanced target. Consider setting class_weight="balanced" or applying SMOTE.',
      suggestion: 'Set class_weight="balanced"'
    }
  },
  {
    stepId: 31,
    lineNumber: 22,
    codeLine: 'model.fit(X_train, y_train)',
    operation: 'model.fit',
    memory: '228.1 KB',
    latency: '188ms',
    variables: {
      weights: { norm: '0.428 (L2)', shape: [24], converged: true },
      iterations: 38
    },
    dimensionFlow: 'Fitting on (800, 24)',
    targetDistribution: {
      total: 1000,
      class0: { label: 'Class 0 (Retained)', count: 920, pct: 92.0 },
      class1: { label: 'Class 1 (Churn)', count: 80, pct: 8.0 }
    },
    issue: null
  },
  {
    stepId: 42,
    lineNumber: 27,
    codeLine: 'score = roc_auc_score(y_test, y_prob)',
    operation: 'evaluate_roc_auc',
    memory: '234.8 KB',
    latency: '210ms',
    variables: {
      apparent_score: 0.9412,
      true_unleaked_score: 0.8572,
      inflation: '+0.0840 (+8.4%)'
    },
    dimensionFlow: 'Audit Finished',
    targetDistribution: {
      total: 1000,
      class0: { label: 'Class 0 (Retained)', count: 920, pct: 92.0 },
      class1: { label: 'Class 1 (Churn)', count: 80, pct: 8.0 }
    },
    issue: null
  }
];

export const LINE_EXPLANATIONS = {
  1: {
    line: 'import pandas as pd',
    context: 'Module Import',
    explanation: 'Imports the pandas library as `pd` for tabular data manipulation and DataFrame loading.'
  },
  2: {
    line: 'from sklearn.preprocessing import StandardScaler',
    context: 'Module Import',
    explanation: 'Imports `StandardScaler` from scikit-learn, which standardizes features by removing the mean and scaling to unit variance.'
  },
  3: {
    line: 'from sklearn.model_selection import train_test_split',
    context: 'Module Import',
    explanation: 'Imports `train_test_split` to randomly partition datasets into training and testing subsets.'
  },
  4: {
    line: 'from sklearn.linear_model import LogisticRegression',
    context: 'Module Import',
    explanation: 'Imports `LogisticRegression`, a standard linear model for binary classification.'
  },
  6: {
    line: 'df = pd.read_parquet("s3://data-lake/churn_q3.parquet")',
    context: 'Data Ingestion',
    explanation: 'Reads customer retention dataset from S3 parquet storage into memory. At this step, DataFrame has 1,000 rows and 26 feature columns.'
  },
  7: {
    line: 'df = df.dropna(subset=["total_charges", "tenure_months"])',
    context: 'Data Cleaning',
    explanation: 'Removes rows containing missing values in the critical numeric features `total_charges` and `tenure_months`. 14 null records dropped.'
  },
  8: {
    line: 'X = df.drop(columns=["churn", "customer_id"])',
    context: 'Feature Selection',
    explanation: 'Extracts predictor feature matrix `X` by excluding the ground truth target column `churn` and the unique identifier `customer_id`. Resulting shape: (1000, 24).'
  },
  9: {
    line: 'scaler = StandardScaler(); X_scaled = scaler.fit_transform(X)',
    context: 'Data Leakage Detected',
    explanation: '⚠️ CRITICAL METHODOLOGY ERROR: `StandardScaler.fit_transform()` is called on the entire dataset `X` BEFORE partitioning into train and test sets. The scaler calculates μ (mean) and σ (standard deviation) incorporating test set samples, contaminating test evaluation.'
  },
  10: {
    line: 'feature_names = X.columns.tolist()',
    context: 'Metadata Extraction',
    explanation: 'Saves feature names into a Python list for later coefficient attribution and model interpretability.'
  },
  12: {
    line: 'y = df["churn"].astype("int32")',
    context: 'Target Extraction',
    explanation: 'Extracts the binary target variable `churn`. Trace inspection reveals 920 zeros (retained) and 80 ones (churned) — an 11.5:1 class skew.'
  },
  14: {
    line: 'X_train, X_test, y_train, y_test = train_test_split(...)',
    context: 'Data Partitioning',
    explanation: 'Splits dataset into 80% training (800 samples) and 20% test (200 samples). Because `X_scaled` was passed instead of raw `X`, information from `X_test` was already leaked.'
  },
  16: {
    line: 'model = LogisticRegression(...)',
    context: 'Model Instantiation',
    explanation: 'Initializes a LogisticRegression classifier. Note that `class_weight` is left at default `None`, which underperforms on datasets with 92/8 imbalance.'
  },
  18: {
    line: 'model.fit(X_train, y_train)',
    context: 'Model Training',
    explanation: 'Executes optimization (L-BFGS solver, L2 penalty) over 800 training vectors. Converged in 38 iterations.'
  },
  19: {
    line: 'y_prob = model.predict_proba(X_test)[:, 1]',
    context: 'Inference',
    explanation: 'Computes positive-class calibrated probabilities for the 200 test instances.'
  },
  21: {
    line: 'score = roc_auc_score(y_test, y_prob)',
    context: 'Metric Evaluation',
    explanation: 'Computes Area Under the ROC Curve. The apparent score of 0.9412 is artificially inflated by ~8.4% due to the data leakage in Line 9.'
  }
};

export const DAG_NODES = [
  { id: '1', title: 'pd.read_parquet', type: 'source', shape: '(1000, 26)', status: 'pass', cell: 1 },
  { id: '2', title: 'df.dropna', type: 'clean', shape: '(1000, 24)', status: 'pass', cell: 1 },
  { id: '3', title: 'StandardScaler.fit_transform', type: 'transform', shape: '(1000, 24)', status: 'fail', error: 'Data Leakage', cell: 2 },
  { id: '4', title: 'train_test_split', type: 'split', shape: 'Train: 800 | Test: 200', status: 'warning', error: 'Skew 92/8', cell: 3 },
  { id: '5', title: 'LogisticRegression.fit', type: 'model', shape: 'Weights: (24,)', status: 'pass', cell: 3 },
  { id: '6', title: 'roc_auc_score', type: 'metric', shape: 'AUC: 0.941 (Inflated)', status: 'warning', cell: 3 }
];
