# pipeline_tracer.py — Multi-stage log triage for trace visualizers

raw_logs = [
    {"user": " alice ", "status": 200, "ms": 45},
    {"user": "",        "status": 200, "ms": 5},
    {"user": "bob",     "status": 500, "ms": 1200},
    {"user": "charlie", "status": 404, "ms": 310},
    {"user": "dave",    "status": 200, "ms": 850},
]

latency_tiers = [
    ("CRITICAL", 1000),
    ("WARNING", 300),
]

# Pass 1: Linear filter & sanitize (Guard clause)
clean_logs = []
for entry in raw_logs:
    name = entry["user"].strip().capitalize()
    if name:
        clean_logs.append({"user": name, "status": entry["status"], "ms": entry["ms"]})

# Pass 2: Nested loop (Rule matching with early exit)
triage_flags = []
for record in clean_logs:
    for tier, limit in latency_tiers:
        if record["ms"] >= limit:
            triage_flags.append((record["user"], tier))
            break

# Pass 3: State aggregation (Branching logic)
status_counts = {}
error_users = []
for record in clean_logs:
    code = record["status"]
    if code >= 400:
        error_users.append(record["user"])
    
    if code in status_counts:
        status_counts[code] += 1
    else:
        status_counts[code] = 1

print("Cleaned:", len(clean_logs))
print("Flags:", triage_flags)
print("Status Counts:", status_counts)
print("Errors:", error_users)