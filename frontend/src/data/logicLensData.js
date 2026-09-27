// Data contracts & mock trace for Mode 1: LogicLens (teammate_pipeline.py)
// Based on Master Implementation Plan (implementation_plan_tracelens.md) §8 & §11.1

export const TEAMMATE_PIPELINE_CODE = `# teammate_pipeline.py — Inherited from "Alex" (Teammate)
# Data sanitization, error triage, and metric aggregation pipeline.

raw_logs = [
    {"user": " alice ", "action": "login", "status": 200, "duration_ms": 45},
    {"user": "bob", "action": "upload_dataset", "status": 500, "duration_ms": 1200},
    {"user": "", "action": "health_ping", "status": 200, "duration_ms": 5},
    {"user": "charlie", "action": "query_db", "status": 404, "duration_ms": 310},
    {"user": " dave ", "action": "export_model", "status": 200, "duration_ms": 850},
    {"user": "eve", "action": "auth_refresh", "status": 401, "duration_ms": 90},
    {"user": " frank", "action": "batch_inference", "status": 200, "duration_ms": 420},
]

cleaned_records = []
error_count = 0
slow_queries = []
action_counts = {}

print(f"[INGEST] Starting ingestion pipeline for {len(raw_logs)} raw records...")

# Teammate loop: sanitize user records, classify anomalies, and aggregate stats
for record in raw_logs:
    name = record["user"].strip().capitalize()
    status = record["status"]
    action = record["action"]
    latency = record.get("duration_ms", 0)

    # Filter invalid/anonymous session records
    if len(name) == 0:
        print("[WARN] Dropping anonymous record with empty username")
        continue

    is_error = status >= 400
    if is_error:
        error_count += 1
        print(f"[ALERT] Error flagged: user={name} action={action} code={status}")

    # Track slow transactions (> 500ms)
    if latency > 500:
        slow_queries.append(name)

    action_counts[action] = action_counts.get(action, 0) + 1

    cleaned_records.append({
        "user": name,
        "action": action,
        "success": not is_error,
        "duration_ms": latency
    })

# Safe Hook Target: Downstream enrichments or alert webhooks can safely run here
error_rate = round((error_count / len(cleaned_records)) * 100, 1) if cleaned_records else 0.0

summary = {
    "total_processed": len(cleaned_records),
    "total_errors": error_count,
    "error_rate_pct": error_rate,
    "slow_transaction_users": slow_queries,
    "unique_actions": len(action_counts)
}

print(f"[COMPLETE] Pipeline finished. Processed: {len(cleaned_records)}, Errors: {error_count}")
print("Summary:", summary)`;

export const SAFE_INSERTION_POINTS = [
  {
    line_number: 52,
    target_variable: "cleaned_records",
    confidence: "high",
    reason: "Alex finished sanitizing records from raw_logs. cleaned_records has reached its stable terminal state (6 records) and error_count is finalized (3). Safe to inject downstream feature engineering, validation webhooks, or Slack alerts before the summary dictionary is assembled.",
    suggested_action: "Inject Slack notification webhook or customer enricher",
    boilerplate_hook: `# Injected Safe Hook: Slack Alert on High Error Rates
if error_count > 0:
    print(f"⚠️ Alert: Pipeline flagged {error_count} errors out of {len(cleaned_records)} records ({error_rate}%)")
    # send_slack_alert(channel="#ops", message=f"Sanitization flagged {error_count} failures")`
  }
];

export const TEAMMATE_HANDOFF_SUMMARY = {
  overall_purpose: "Sanitizes raw user session logs, flags latency anomalies, classifies HTTP 4xx/5xx failure statuses, and builds an aggregated operational summary report.",
  key_data_structures: [
    {
      name: "raw_logs",
      role: "Input list of 7 dictionary event records with unstripped usernames, actions, statuses, and latency metrics",
      final_state_summary: "List of 7 items (read-only, unmodified)"
    },
    {
      name: "cleaned_records",
      role: "Sanitized output list containing capitalized names, duration metrics, and normalized success boolean flags",
      final_state_summary: "List of 6 dicts with valid user identities and sanitized actions"
    },
    {
      name: "error_count",
      role: "Integer counter tracking total operations with status >= 400",
      final_state_summary: "3 (Bob 500, Charlie 404, Eve 401)"
    },
    {
      name: "slow_queries",
      role: "List of user sessions exceeding 500ms execution latency",
      final_state_summary: "['Bob', 'Dave']"
    },
    {
      name: "summary",
      role: "Final reporting payload combining processed count, error rates, slow queries, and unique action counts",
      final_state_summary: "{ total_processed: 6, total_errors: 3, error_rate_pct: 50.0, slow_transaction_users: ['Bob', 'Dave'], unique_actions: 6 }"
    }
  ],
  safe_continuation_strategy: "Inject your custom business logic at Line 52. The data structures cleaned_records, error_count, and slow_queries are completely populated and immutable after the loop. Do not edit inside the loop body unless modifying individual record attributes.",
  cautions_for_teammate: [
    "Do NOT modify raw_logs in-place — downstream telemetry relies on original order.",
    "Record 3 has an empty username ('') and is intentionally skipped with a diagnostic warning.",
    "Alex checks status >= 400 for errors, and flags transactions taking > 500ms in slow_queries."
  ]
};

export const LOGICLENS_TRACE_STEPS = [
  {
    step_id: 1,
    line_number: 2,
    code_line: 'raw_logs = [ {"user": " alice ", ...}, ... ]',
    event_type: "line",
    variable_deltas: {
      raw_logs: {
        action: "created",
        var_name: "raw_logs",
        type_name: "list",
        old_value: null,
        new_value: [
          { user: " alice ", action: "login", status: 200 },
          { user: "bob", action: "upload", status: 500 },
          { user: "", action: "ping", status: 200 },
          { user: "charlie", action: "logout", status: 200 }
        ],
        repr_str: "[4 log records]",
        metadata: { length: 4 }
      }
    },
    all_variables: {
      raw_logs: "list[4 items]"
    },
    bob_explanation: {
      intent_summary: "Initializing the source event log dataset.",
      detailed_explanation: "Alex defines a list of 4 user activity dictionaries simulating raw ingestion from an auth server.",
      teammate_logic_note: "Notice that user strings contain untrimmed whitespace and an empty username to simulate real-world telemetry noise.",
      safe_to_extend: false,
      continuation_tip: "Do not mutate this collection; treat it as an immutable source."
    }
  },
  {
    step_id: 2,
    line_number: 9,
    code_line: "cleaned_records = []",
    event_type: "line",
    variable_deltas: {
      cleaned_records: {
        action: "created",
        var_name: "cleaned_records",
        type_name: "list",
        old_value: null,
        new_value: [],
        repr_str: "[]",
        metadata: { length: 0 }
      }
    },
    all_variables: {
      raw_logs: "list[4 items]",
      cleaned_records: "[]"
    },
    bob_explanation: {
      intent_summary: "Creating the target accumulator list for sanitized records.",
      detailed_explanation: "Initializes an empty list that will collect valid transformed log records.",
      teammate_logic_note: "Standard accumulator pattern. Keeps raw and cleaned collections decoupled.",
      safe_to_extend: false,
      continuation_tip: "Safe continuation hook will occur after this list is populated."
    }
  },
  {
    step_id: 3,
    line_number: 10,
    code_line: "error_count = 0",
    event_type: "line",
    variable_deltas: {
      error_count: {
        action: "created",
        var_name: "error_count",
        type_name: "int",
        old_value: null,
        new_value: 0,
        repr_str: "0",
        metadata: {}
      }
    },
    all_variables: {
      raw_logs: "list[4 items]",
      cleaned_records: "[]",
      error_count: "0"
    },
    bob_explanation: {
      intent_summary: "Initializing error counter register.",
      detailed_explanation: "Prepares an integer counter to accumulate failure events (status codes >= 400).",
      teammate_logic_note: "Alex tracks errors in a scalar alongside record accumulation.",
      safe_to_extend: false,
      continuation_tip: "If you need error categorization (4xx vs 5xx), this is where you could initialize a dict counter."
    }
  },
  // ITERATION 1: Alice
  {
    step_id: 4,
    line_number: 13,
    code_line: "for record in raw_logs:",
    event_type: "loop_iteration",
    loop_context: {
      loop_id: "loop_L13",
      loop_type: "for",
      header_line: 13,
      current_iteration: 1,
      total_iterations: 4,
      iterator_target: "record",
      iterator_value: { user: " alice ", action: "login", status: 200 },
      is_exit_step: false
    },
    variable_deltas: {
      record: {
        action: "created",
        var_name: "record",
        type_name: "dict",
        old_value: null,
        new_value: { user: " alice ", action: "login", status: 200 },
        repr_str: "{'user': ' alice ', 'action': 'login', 'status': 200}",
        metadata: { keys: ["user", "action", "status"] }
      }
    },
    all_variables: {
      raw_logs: "list[4 items]",
      cleaned_records: "[]",
      error_count: "0",
      record: "{'user': ' alice ', 'action': 'login', 'status': 200}"
    },
    bob_explanation: {
      intent_summary: "Loop Iteration 1 of 4: Ingesting first record (Alice).",
      detailed_explanation: "Binds the loop target variable `record` to the first item of `raw_logs`.",
      teammate_logic_note: "Iterating through logs sequentially.",
      safe_to_extend: false,
      continuation_tip: "Loop is active. Do not inject global statements here."
    }
  },
  {
    step_id: 5,
    line_number: 14,
    code_line: 'name = record["user"].strip().capitalize()',
    event_type: "line",
    loop_context: {
      loop_id: "loop_L13",
      loop_type: "for",
      header_line: 13,
      current_iteration: 1,
      total_iterations: 4,
      iterator_target: "record",
      iterator_value: { user: " alice ", action: "login", status: 200 },
      is_exit_step: false
    },
    variable_deltas: {
      name: {
        action: "created",
        var_name: "name",
        type_name: "str",
        old_value: null,
        new_value: "Alice",
        repr_str: "'Alice'",
        metadata: { length: 5 }
      }
    },
    all_variables: {
      raw_logs: "list[4 items]",
      cleaned_records: "[]",
      error_count: "0",
      record: "{'user': ' alice ', ...}",
      name: "'Alice'"
    },
    bob_explanation: {
      intent_summary: "Sanitizing user string: stripping whitespace and capitalizing.",
      detailed_explanation: "Transforms ' alice ' -> 'Alice'. Removes leading/trailing spaces and ensures standard title case.",
      teammate_logic_note: "Alex uses chained string methods for concise sanitization.",
      safe_to_extend: true,
      continuation_tip: "If you need email normalization or regex validation, you can chain it here."
    }
  },
  {
    step_id: 6,
    line_number: 15,
    code_line: "if len(name) > 0:",
    event_type: "branch_decision",
    loop_context: {
      loop_id: "loop_L13",
      loop_type: "for",
      header_line: 13,
      current_iteration: 1,
      total_iterations: 4,
      iterator_target: "record",
      iterator_value: { user: " alice ", action: "login", status: 200 },
      is_exit_step: false
    },
    branch_context: {
      branch_id: "branch_L15",
      header_line: 15,
      condition_code: "len(name) > 0",
      evaluated_truth: true,
      taken_line: 16,
      reason: "len('Alice') = 5 > 0 -> TRUE (Branch TAKEN)"
    },
    variable_deltas: {},
    all_variables: {
      raw_logs: "list[4 items]",
      cleaned_records: "[]",
      error_count: "0",
      record: "{'user': ' alice ', ...}",
      name: "'Alice'"
    },
    bob_explanation: {
      intent_summary: "Validating that username is non-empty.",
      detailed_explanation: "Evaluates len('Alice') > 0 (5 > 0 -> True). Entering branch body.",
      teammate_logic_note: "Guards against anonymous or corrupt log entries.",
      safe_to_extend: false,
      continuation_tip: "Branch evaluates to True. Execution proceeds to error check."
    }
  },
  {
    step_id: 7,
    line_number: 16,
    code_line: 'if record["status"] >= 400:',
    event_type: "branch_decision",
    loop_context: {
      loop_id: "loop_L13",
      loop_type: "for",
      header_line: 13,
      current_iteration: 1,
      total_iterations: 4,
      iterator_target: "record",
      iterator_value: { user: " alice ", action: "login", status: 200 },
      is_exit_step: false
    },
    branch_context: {
      branch_id: "branch_L16",
      header_line: 16,
      condition_code: 'record["status"] >= 400',
      evaluated_truth: false,
      taken_line: 18,
      skipped_range: [17, 17],
      reason: "200 >= 400 -> FALSE (Branch SKIPPED; Line 17 bypassed)"
    },
    variable_deltas: {},
    all_variables: {
      raw_logs: "list[4 items]",
      cleaned_records: "[]",
      error_count: "0",
      record: "{'user': ' alice ', ...}",
      name: "'Alice'"
    },
    bob_explanation: {
      intent_summary: "Checking HTTP status code for server/client error.",
      detailed_explanation: "Status code is 200 (OK). Condition 200 >= 400 is False. Error increment skipped.",
      teammate_logic_note: "Alex categorizes all HTTP 4xx and 5xx as errors.",
      safe_to_extend: false,
      continuation_tip: "No error detected for this record."
    }
  },
  {
    step_id: 8,
    line_number: 18,
    code_line: "cleaned_records.append({ 'user': name, 'action': ..., 'success': True })",
    event_type: "line",
    loop_context: {
      loop_id: "loop_L13",
      loop_type: "for",
      header_line: 13,
      current_iteration: 1,
      total_iterations: 4,
      iterator_target: "record",
      iterator_value: { user: " alice ", action: "login", status: 200 },
      is_exit_step: false
    },
    variable_deltas: {
      cleaned_records: {
        action: "mutated",
        var_name: "cleaned_records",
        type_name: "list",
        old_value: [],
        new_value: [{ user: "Alice", action: "login", success: true }],
        repr_str: "[{'user': 'Alice', 'action': 'login', 'success': True}]",
        metadata: { length: 1, delta: "+1 item" }
      }
    },
    all_variables: {
      raw_logs: "list[4 items]",
      cleaned_records: "list[1 item: Alice]",
      error_count: "0",
      record: "{'user': ' alice ', ...}",
      name: "'Alice'"
    },
    bob_explanation: {
      intent_summary: "Appended sanitized record for Alice to accumulator.",
      detailed_explanation: "List length grows from 0 to 1. Sets normalized 'success': True because status < 400.",
      teammate_logic_note: "Constructs clean dict with uniform schema.",
      safe_to_extend: true,
      continuation_tip: "You can add extra metadata keys to the appended dictionary here (e.g. timestamp)."
    }
  },
  // ITERATION 2: Bob (Error 500)
  {
    step_id: 9,
    line_number: 13,
    code_line: "for record in raw_logs:",
    event_type: "loop_iteration",
    loop_context: {
      loop_id: "loop_L13",
      loop_type: "for",
      header_line: 13,
      current_iteration: 2,
      total_iterations: 4,
      iterator_target: "record",
      iterator_value: { user: "bob", action: "upload", status: 500 },
      is_exit_step: false
    },
    variable_deltas: {
      record: {
        action: "mutated",
        var_name: "record",
        type_name: "dict",
        old_value: { user: " alice ", action: "login", status: 200 },
        new_value: { user: "bob", action: "upload", status: 500 },
        repr_str: "{'user': 'bob', 'action': 'upload', 'status': 500}",
        metadata: {}
      }
    },
    all_variables: {
      raw_logs: "list[4 items]",
      cleaned_records: "list[1 item]",
      error_count: "0",
      record: "{'user': 'bob', 'action': 'upload', 'status': 500}"
    },
    bob_explanation: {
      intent_summary: "Loop Iteration 2 of 4: Ingesting second record (Bob - Status 500).",
      detailed_explanation: "Advances to the second record in raw_logs.",
      teammate_logic_note: "Notice status is 500 (Internal Server Error).",
      safe_to_extend: false,
      continuation_tip: "Watch the error_count variable increment on this cycle."
    }
  },
  {
    step_id: 10,
    line_number: 14,
    code_line: 'name = record["user"].strip().capitalize()',
    event_type: "line",
    loop_context: {
      loop_id: "loop_L13",
      loop_type: "for",
      header_line: 13,
      current_iteration: 2,
      total_iterations: 4,
      iterator_target: "record",
      iterator_value: { user: "bob", action: "upload", status: 500 },
      is_exit_step: false
    },
    variable_deltas: {
      name: {
        action: "mutated",
        var_name: "name",
        type_name: "str",
        old_value: "Alice",
        new_value: "Bob",
        repr_str: "'Bob'",
        metadata: { length: 3 }
      }
    },
    all_variables: {
      raw_logs: "list[4 items]",
      cleaned_records: "list[1 item]",
      error_count: "0",
      record: "{'user': 'bob', ...}",
      name: "'Bob'"
    },
    bob_explanation: {
      intent_summary: "Capitalized username 'bob' -> 'Bob'.",
      detailed_explanation: "Standardizes name casing.",
      teammate_logic_note: "Predictable string transformations.",
      safe_to_extend: false,
      continuation_tip: "String mutation is valid."
    }
  },
  {
    step_id: 11,
    line_number: 15,
    code_line: "if len(name) > 0:",
    event_type: "branch_decision",
    loop_context: {
      loop_id: "loop_L13",
      loop_type: "for",
      header_line: 13,
      current_iteration: 2,
      total_iterations: 4,
      iterator_target: "record",
      iterator_value: { user: "bob", action: "upload", status: 500 },
      is_exit_step: false
    },
    branch_context: {
      branch_id: "branch_L15",
      header_line: 15,
      condition_code: "len(name) > 0",
      evaluated_truth: true,
      taken_line: 16,
      reason: "len('Bob') = 3 > 0 -> TRUE (Branch TAKEN)"
    },
    variable_deltas: {},
    all_variables: {
      raw_logs: "list[4 items]",
      cleaned_records: "list[1 item]",
      error_count: "0",
      record: "{'user': 'bob', ...}",
      name: "'Bob'"
    },
    bob_explanation: {
      intent_summary: "Validating non-empty username for Bob.",
      detailed_explanation: "Evaluates len('Bob') > 0 (3 > 0 -> True). Entering body.",
      teammate_logic_note: "Validation passed.",
      safe_to_extend: false,
      continuation_tip: "Proceeding to status code check."
    }
  },
  {
    step_id: 12,
    line_number: 16,
    code_line: 'if record["status"] >= 400:',
    event_type: "branch_decision",
    loop_context: {
      loop_id: "loop_L13",
      loop_type: "for",
      header_line: 13,
      current_iteration: 2,
      total_iterations: 4,
      iterator_target: "record",
      iterator_value: { user: "bob", action: "upload", status: 500 },
      is_exit_step: false
    },
    branch_context: {
      branch_id: "branch_L16",
      header_line: 16,
      condition_code: 'record["status"] >= 400',
      evaluated_truth: true,
      taken_line: 17,
      reason: "500 >= 400 -> TRUE (Branch TAKEN; Line 17 executed)"
    },
    variable_deltas: {},
    all_variables: {
      raw_logs: "list[4 items]",
      cleaned_records: "list[1 item]",
      error_count: "0",
      record: "{'user': 'bob', ...}",
      name: "'Bob'"
    },
    bob_explanation: {
      intent_summary: "Detected error status code 500 (Internal Server Error).",
      detailed_explanation: "Condition 500 >= 400 evaluates to True. Execution enters line 17.",
      teammate_logic_note: "Alex flags all 500 responses.",
      safe_to_extend: false,
      continuation_tip: "Error branch triggered."
    }
  },
  {
    step_id: 13,
    line_number: 17,
    code_line: "error_count += 1",
    event_type: "line",
    loop_context: {
      loop_id: "loop_L13",
      loop_type: "for",
      header_line: 13,
      current_iteration: 2,
      total_iterations: 4,
      iterator_target: "record",
      iterator_value: { user: "bob", action: "upload", status: 500 },
      is_exit_step: false
    },
    variable_deltas: {
      error_count: {
        action: "mutated",
        var_name: "error_count",
        type_name: "int",
        old_value: 0,
        new_value: 1,
        repr_str: "1",
        metadata: { delta: "+1" }
      }
    },
    all_variables: {
      raw_logs: "list[4 items]",
      cleaned_records: "list[1 item]",
      error_count: "1",
      record: "{'user': 'bob', ...}",
      name: "'Bob'"
    },
    bob_explanation: {
      intent_summary: "Incrementing error counter from 0 -> 1.",
      detailed_explanation: "Records that Bob's upload action suffered a server failure.",
      teammate_logic_note: "Integer accumulator updated in-place.",
      safe_to_extend: true,
      continuation_tip: "If you need immediate error alerting, a webhook trigger can be hooked here."
    }
  },
  {
    step_id: 14,
    line_number: 18,
    code_line: "cleaned_records.append({ 'user': name, 'action': ..., 'success': False })",
    event_type: "line",
    loop_context: {
      loop_id: "loop_L13",
      loop_type: "for",
      header_line: 13,
      current_iteration: 2,
      total_iterations: 4,
      iterator_target: "record",
      iterator_value: { user: "bob", action: "upload", status: 500 },
      is_exit_step: false
    },
    variable_deltas: {
      cleaned_records: {
        action: "mutated",
        var_name: "cleaned_records",
        type_name: "list",
        old_value: [{ user: "Alice", action: "login", success: true }],
        new_value: [
          { user: "Alice", action: "login", success: true },
          { user: "Bob", action: "upload", success: false }
        ],
        repr_str: "[Alice (OK), Bob (FAIL)]",
        metadata: { length: 2, delta: "+1 item" }
      }
    },
    all_variables: {
      raw_logs: "list[4 items]",
      cleaned_records: "list[2 items: Alice, Bob]",
      error_count: "1",
      record: "{'user': 'bob', ...}",
      name: "'Bob'"
    },
    bob_explanation: {
      intent_summary: "Appended Bob to accumulator with success: False.",
      detailed_explanation: "List length grows from 1 to 2. Note that Bob is retained in the sanitized list even though his upload failed.",
      teammate_logic_note: "Alex preserves failed actions for auditability rather than dropping them.",
      safe_to_extend: false,
      continuation_tip: "Be aware downstream that cleaned_records contains failed attempts with success=False."
    }
  },
  // ITERATION 3: Empty string (Skipped)
  {
    step_id: 15,
    line_number: 13,
    code_line: "for record in raw_logs:",
    event_type: "loop_iteration",
    loop_context: {
      loop_id: "loop_L13",
      loop_type: "for",
      header_line: 13,
      current_iteration: 3,
      total_iterations: 4,
      iterator_target: "record",
      iterator_value: { user: "", action: "ping", status: 200 },
      is_exit_step: false
    },
    variable_deltas: {
      record: {
        action: "mutated",
        var_name: "record",
        type_name: "dict",
        old_value: { user: "bob", action: "upload", status: 500 },
        new_value: { user: "", action: "ping", status: 200 },
        repr_str: "{'user': '', 'action': 'ping', 'status': 200}",
        metadata: {}
      }
    },
    all_variables: {
      raw_logs: "list[4 items]",
      cleaned_records: "list[2 items]",
      error_count: "1",
      record: "{'user': '', 'action': 'ping', 'status': 200}"
    },
    bob_explanation: {
      intent_summary: "Loop Iteration 3 of 4: Ingesting corrupt record (empty username).",
      detailed_explanation: "Record has user: ''.",
      teammate_logic_note: "Telemetry ping event with missing auth identifier.",
      safe_to_extend: false,
      continuation_tip: "Watch how Alex's guard branch skips this iteration."
    }
  },
  {
    step_id: 16,
    line_number: 14,
    code_line: 'name = record["user"].strip().capitalize()',
    event_type: "line",
    loop_context: {
      loop_id: "loop_L13",
      loop_type: "for",
      header_line: 13,
      current_iteration: 3,
      total_iterations: 4,
      iterator_target: "record",
      iterator_value: { user: "", action: "ping", status: 200 },
      is_exit_step: false
    },
    variable_deltas: {
      name: {
        action: "mutated",
        var_name: "name",
        type_name: "str",
        old_value: "Bob",
        new_value: "",
        repr_str: "''",
        metadata: { length: 0 }
      }
    },
    all_variables: {
      raw_logs: "list[4 items]",
      cleaned_records: "list[2 items]",
      error_count: "1",
      record: "{'user': '', ...}",
      name: "''"
    },
    bob_explanation: {
      intent_summary: "Sanitizing empty string -> remains ''.",
      detailed_explanation: "Length of name is 0.",
      teammate_logic_note: "Produces zero-length string.",
      safe_to_extend: false,
      continuation_tip: "Next branch will reject this record."
    }
  },
  {
    step_id: 17,
    line_number: 15,
    code_line: "if len(name) > 0:",
    event_type: "branch_decision",
    loop_context: {
      loop_id: "loop_L13",
      loop_type: "for",
      header_line: 13,
      current_iteration: 3,
      total_iterations: 4,
      iterator_target: "record",
      iterator_value: { user: "", action: "ping", status: 200 },
      is_exit_step: false
    },
    branch_context: {
      branch_id: "branch_L15",
      header_line: 15,
      condition_code: "len(name) > 0",
      evaluated_truth: false,
      taken_line: 13,
      skipped_range: [16, 23],
      reason: "len('') = 0 > 0 -> FALSE (Branch SKIPPED; Lines 16-23 bypassed!)"
    },
    variable_deltas: {},
    all_variables: {
      raw_logs: "list[4 items]",
      cleaned_records: "list[2 items]",
      error_count: "1",
      record: "{'user': '', ...}",
      name: "''"
    },
    bob_explanation: {
      intent_summary: "Filtered out empty username (len = 0). Entire body skipped.",
      detailed_explanation: "Condition len('') > 0 evaluates to False. Lines 16 through 23 are bypassed, jumping directly to next loop iteration.",
      teammate_logic_note: "Alex safely drops records with missing usernames without raising an exception.",
      safe_to_extend: false,
      continuation_tip: "If you need an 'anonymous' fallback instead of dropping, you would modify line 15 to `if len(name) == 0: name = 'Anonymous'`."
    }
  },
  // ITERATION 4: Charlie
  {
    step_id: 18,
    line_number: 13,
    code_line: "for record in raw_logs:",
    event_type: "loop_iteration",
    loop_context: {
      loop_id: "loop_L13",
      loop_type: "for",
      header_line: 13,
      current_iteration: 4,
      total_iterations: 4,
      iterator_target: "record",
      iterator_value: { user: "charlie", action: "logout", status: 200 },
      is_exit_step: false
    },
    variable_deltas: {
      record: {
        action: "mutated",
        var_name: "record",
        type_name: "dict",
        old_value: { user: "", action: "ping", status: 200 },
        new_value: { user: "charlie", action: "logout", status: 200 },
        repr_str: "{'user': 'charlie', 'action': 'logout', 'status': 200}",
        metadata: {}
      }
    },
    all_variables: {
      raw_logs: "list[4 items]",
      cleaned_records: "list[2 items]",
      error_count: "1",
      record: "{'user': 'charlie', ...}"
    },
    bob_explanation: {
      intent_summary: "Loop Iteration 4 of 4: Final record (Charlie - Status 200).",
      detailed_explanation: "Ingesting final element of raw_logs.",
      teammate_logic_note: "Final loop cycle.",
      safe_to_extend: false,
      continuation_tip: "Loop is about to conclude."
    }
  },
  {
    step_id: 19,
    line_number: 14,
    code_line: 'name = record["user"].strip().capitalize()',
    event_type: "line",
    loop_context: {
      loop_id: "loop_L13",
      loop_type: "for",
      header_line: 13,
      current_iteration: 4,
      total_iterations: 4,
      iterator_target: "record",
      iterator_value: { user: "charlie", action: "logout", status: 200 },
      is_exit_step: false
    },
    variable_deltas: {
      name: {
        action: "mutated",
        var_name: "name",
        type_name: "str",
        old_value: "",
        new_value: "Charlie",
        repr_str: "'Charlie'",
        metadata: { length: 7 }
      }
    },
    all_variables: {
      raw_logs: "list[4 items]",
      cleaned_records: "list[2 items]",
      error_count: "1",
      record: "{'user': 'charlie', ...}",
      name: "'Charlie'"
    },
    bob_explanation: {
      intent_summary: "Sanitized 'charlie' -> 'Charlie'.",
      detailed_explanation: "Capitalizes final name.",
      teammate_logic_note: "Consistent casing.",
      safe_to_extend: false,
      continuation_tip: "Proceeding to validation."
    }
  },
  {
    step_id: 20,
    line_number: 15,
    code_line: "if len(name) > 0:",
    event_type: "branch_decision",
    loop_context: {
      loop_id: "loop_L13",
      loop_type: "for",
      header_line: 13,
      current_iteration: 4,
      total_iterations: 4,
      iterator_target: "record",
      iterator_value: { user: "charlie", action: "logout", status: 200 },
      is_exit_step: false
    },
    branch_context: {
      branch_id: "branch_L15",
      header_line: 15,
      condition_code: "len(name) > 0",
      evaluated_truth: true,
      taken_line: 16,
      reason: "len('Charlie') = 7 > 0 -> TRUE (Branch TAKEN)"
    },
    variable_deltas: {},
    all_variables: {
      raw_logs: "list[4 items]",
      cleaned_records: "list[2 items]",
      error_count: "1",
      record: "{'user': 'charlie', ...}",
      name: "'Charlie'"
    },
    bob_explanation: {
      intent_summary: "Validating non-empty username for Charlie.",
      detailed_explanation: "len('Charlie') = 7 > 0 -> True.",
      teammate_logic_note: "Validation passed.",
      safe_to_extend: false,
      continuation_tip: "Proceeding to status check."
    }
  },
  {
    step_id: 21,
    line_number: 16,
    code_line: 'if record["status"] >= 400:',
    event_type: "branch_decision",
    loop_context: {
      loop_id: "loop_L13",
      loop_type: "for",
      header_line: 13,
      current_iteration: 4,
      total_iterations: 4,
      iterator_target: "record",
      iterator_value: { user: "charlie", action: "logout", status: 200 },
      is_exit_step: false
    },
    branch_context: {
      branch_id: "branch_L16",
      header_line: 16,
      condition_code: 'record["status"] >= 400',
      evaluated_truth: false,
      taken_line: 18,
      skipped_range: [17, 17],
      reason: "200 >= 400 -> FALSE (Branch SKIPPED; Line 17 bypassed)"
    },
    variable_deltas: {},
    all_variables: {
      raw_logs: "list[4 items]",
      cleaned_records: "list[2 items]",
      error_count: "1",
      record: "{'user': 'charlie', ...}",
      name: "'Charlie'"
    },
    bob_explanation: {
      intent_summary: "Checking status 200 (OK). No error increment.",
      detailed_explanation: "200 >= 400 is False.",
      teammate_logic_note: "Successful operation.",
      safe_to_extend: false,
      continuation_tip: "Record will be marked success: True."
    }
  },
  {
    step_id: 22,
    line_number: 18,
    code_line: "cleaned_records.append({ 'user': name, 'action': ..., 'success': True })",
    event_type: "line",
    loop_context: {
      loop_id: "loop_L13",
      loop_type: "for",
      header_line: 13,
      current_iteration: 4,
      total_iterations: 4,
      iterator_target: "record",
      iterator_value: { user: "charlie", action: "logout", status: 200 },
      is_exit_step: false
    },
    variable_deltas: {
      cleaned_records: {
        action: "mutated",
        var_name: "cleaned_records",
        type_name: "list",
        old_value: [
          { user: "Alice", action: "login", success: true },
          { user: "Bob", action: "upload", success: false }
        ],
        new_value: [
          { user: "Alice", action: "login", success: true },
          { user: "Bob", action: "upload", success: false },
          { user: "Charlie", action: "logout", success: true }
        ],
        repr_str: "[Alice (OK), Bob (FAIL), Charlie (OK)]",
        metadata: { length: 3, delta: "+1 item" }
      }
    },
    all_variables: {
      raw_logs: "list[4 items]",
      cleaned_records: "list[3 items: Alice, Bob, Charlie]",
      error_count: "1",
      record: "{'user': 'charlie', ...}",
      name: "'Charlie'"
    },
    bob_explanation: {
      intent_summary: "Appended Charlie to accumulator. Final size: 3 items.",
      detailed_explanation: "cleaned_records now contains all 3 valid processed records.",
      teammate_logic_note: "Accumulation phase complete.",
      safe_to_extend: false,
      continuation_tip: "Loop is about to exit cleanly."
    }
  },
  // LOOP EXIT
  {
    step_id: 23,
    line_number: 13,
    code_line: "for record in raw_logs:  # Loop exit",
    event_type: "loop_exit",
    loop_context: {
      loop_id: "loop_L13",
      loop_type: "for",
      header_line: 13,
      current_iteration: 4,
      total_iterations: 4,
      is_exit_step: true
    },
    variable_deltas: {},
    all_variables: {
      raw_logs: "list[4 items]",
      cleaned_records: "list[3 items]",
      error_count: "1",
      record: "{'user': 'charlie', ...}",
      name: "'Charlie'"
    },
    bob_explanation: {
      intent_summary: "Loop completed all 4 iterations and terminated normally.",
      detailed_explanation: "Iterator exhausted. Control leaves loop body.",
      teammate_logic_note: "Loop invariant preserved: 4 input logs processed -> 3 valid, 1 error.",
      safe_to_extend: false,
      continuation_tip: "Entering the post-loop handoff zone."
    }
  },
  // SAFE INSERTION POINT (Line 25)
  {
    step_id: 24,
    line_number: 25,
    code_line: "# [★ SAFE INSERTION POINT: Line 25]",
    event_type: "safe_insertion",
    safe_insertion: {
      line_number: 25,
      target_variable: "cleaned_records",
      confidence: "high",
      reason: "Alex finished sanitizing records from raw_logs. cleaned_records has reached its stable terminal state (3 records) and error_count is finalized (1). Safe to inject downstream feature engineering, validation webhooks, or Slack alerts before the summary dictionary is assembled.",
      suggested_action: "Inject Slack notification webhook or customer enricher",
      boilerplate_hook: `# Injected Safe Hook: Slack Alert on High Error Rates
if error_count > 0:
    error_rate = (error_count / len(raw_logs)) * 100
    print(f"⚠️ Alert: Pipeline encountered {error_count} errors ({error_rate:.1f}%)")
    # send_slack_alert(channel="#ops", message=f"Sanitization flagged {error_count} failures")`
    },
    variable_deltas: {},
    all_variables: {
      raw_logs: "list[4 items]",
      cleaned_records: "list[3 items: Alice, Bob, Charlie]",
      error_count: "1",
      record: "{'user': 'charlie', ...}",
      name: "'Charlie'"
    },
    bob_explanation: {
      intent_summary: "★ RECOMMENDED TEAMMATE EXTENSION POINT: Line 25.",
      detailed_explanation: "All data transformations are complete. cleaned_records is stable with 3 items, and error_count is 1. Downstream logic on line 27 will only summarize counts.",
      teammate_logic_note: "Alex deliberately left this boundary between data transformation and aggregation.",
      safe_to_extend: true,
      continuation_tip: "Inject your Slack alerts, data export to Postgres, or extra filtering right here without risking teammate regressions."
    }
  },
  // Line 27: Summary dictionary
  {
    step_id: 25,
    line_number: 27,
    code_line: 'summary = { "total_valid": len(cleaned_records), "total_errors": error_count }',
    event_type: "line",
    variable_deltas: {
      summary: {
        action: "created",
        var_name: "summary",
        type_name: "dict",
        old_value: null,
        new_value: { total_valid: 3, total_errors: 1 },
        repr_str: "{'total_valid': 3, 'total_errors': 1}",
        metadata: { keys: ["total_valid", "total_errors"] }
      }
    },
    all_variables: {
      raw_logs: "list[4 items]",
      cleaned_records: "list[3 items]",
      error_count: "1",
      summary: "{'total_valid': 3, 'total_errors': 1}"
    },
    bob_explanation: {
      intent_summary: "Assembling final reporting summary dictionary.",
      detailed_explanation: "Computes len(cleaned_records) = 3 and captures total_errors = 1 into a clean report payload.",
      teammate_logic_note: "Produces the final metric dictionary for downstream consumption.",
      safe_to_extend: true,
      continuation_tip: "You can append extra metrics like error_rate: error_count / len(raw_logs)."
    }
  },
  // Line 31: Print output
  {
    step_id: 26,
    line_number: 31,
    code_line: 'print("Summary:", summary)',
    event_type: "line",
    stdout_emitted: "Summary: {'total_valid': 3, 'total_errors': 1}",
    variable_deltas: {},
    all_variables: {
      raw_logs: "list[4 items]",
      cleaned_records: "list[3 items]",
      error_count: "1",
      summary: "{'total_valid': 3, 'total_errors': 1}"
    },
    bob_explanation: {
      intent_summary: "Printing summary report to stdout. Execution complete.",
      detailed_explanation: "Outputs 'Summary: {'total_valid': 3, 'total_errors': 1}' to the console. Script terminates with return code 0.",
      teammate_logic_note: "Alex prints output for console logging.",
      safe_to_extend: false,
      continuation_tip: "TraceLens execution playback complete. Review the Teammate Handoff report in the right drawer."
    }
  }
];
