"""
test_package_installer.py — Tests for package installer service and sandbox security / mode policies.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent
BACKEND_DIR = ROOT_DIR / "backend"
for p in (str(ROOT_DIR), str(BACKEND_DIR)):
    if p not in sys.path:
        sys.path.insert(0, p)

from fastapi.testclient import TestClient

try:
    from backend.app.main import app
    from backend.app.services.package_installer import (
        BLOCKED_MODULES,
        IMPORT_TO_PYPI,
        extract_imported_modules,
        get_missing_libraries,
        is_module_available,
        prepare_environment_for_code,
    )
except ImportError:
    from app.main import app
    from app.services.package_installer import (
        BLOCKED_MODULES,
        IMPORT_TO_PYPI,
        extract_imported_modules,
        get_missing_libraries,
        is_module_available,
        prepare_environment_for_code,
    )

client = TestClient(app)


def test_extract_imported_modules_standard():
    code = """
import math
import json, re
from collections import defaultdict
from sklearn.model_selection import train_test_split
import numpy.random as nr
"""
    modules = extract_imported_modules(code)
    assert "math" in modules
    assert "json" in modules
    assert "re" in modules
    assert "collections" in modules
    assert "sklearn" in modules
    assert "numpy" in modules


def test_extract_imported_modules_syntax_fallback():
    # If there is broken syntax at bottom, regex fallback recovers top imports
    code = """
import requests
from bs4 import BeautifulSoup
def broken_syntax(
"""
    modules = extract_imported_modules(code)
    assert "requests" in modules
    assert "bs4" in modules


def test_blocked_modules_not_in_missing_libraries():
    code = """
import os
import sys
import subprocess
import socket
import shutil
import ctypes
import threading
"""
    missing = get_missing_libraries(code)
    # Blocked security modules must NEVER be returned as missing libraries for installation
    for blocked in BLOCKED_MODULES:
        assert blocked not in missing


def test_stdlib_modules_not_missing():
    code = """
import math
import itertools
import json
"""
    missing = get_missing_libraries(code)
    assert missing == []


def test_pypi_alias_mappings():
    assert IMPORT_TO_PYPI.get("sklearn") == "scikit-learn"
    assert IMPORT_TO_PYPI.get("cv2") == "opencv-python"
    assert IMPORT_TO_PYPI.get("PIL") == "pillow"
    assert IMPORT_TO_PYPI.get("yaml") == "pyyaml"
    assert IMPORT_TO_PYPI.get("bs4") == "beautifulsoup4"


def test_is_module_available():
    assert is_module_available("math") is True
    assert is_module_available("sys") is True
    assert is_module_available("non_existent_fake_package_xyz_123") is False


def test_prepare_environment_installed():
    code = "import math\nx = math.sqrt(16)"
    installed = prepare_environment_for_code(code)
    # Already available stdlib module, no installs required
    assert installed == []


def test_mode_lens_disables_safe_hooks():
    code = """
x = 10
y = x + 5
print(y)
"""
    # 1. Mode: model_lens -> safe_insertion_points MUST be empty []
    resp_model = client.post("/api/trace", json={"code": code, "mode": "model_lens"})
    assert resp_model.status_code == 200
    data_model = resp_model.json()
    assert data_model["safe_insertion_points"] == []

    # 2. Mode: logic_lens -> safe_insertion_points should be computed
    resp_logic = client.post("/api/trace", json={"code": code, "mode": "logic_lens"})
    assert resp_logic.status_code == 200
    data_logic = resp_logic.json()
    assert isinstance(data_logic["safe_insertion_points"], list)
    assert len(data_logic["safe_insertion_points"]) > 0


def test_blocked_module_rejection():
    code = """
import os
print(os.getcwd())
"""
    resp = client.post("/api/trace", json={"code": code, "mode": "logic_lens"})
    assert resp.status_code == 400
    detail = resp.json().get("detail", "")
    assert "os" in detail or "Security violation" in detail or "TraceLens sandbox" in detail


def test_blocked_open_builtin_rejection():
    code = """
with open('some_file.txt', 'w') as f:
    f.write('forbidden')
"""
    resp = client.post("/api/trace", json={"code": code, "mode": "logic_lens"})
    assert resp.status_code == 400
    detail = resp.json().get("detail", "")
    assert "open" in detail or "Security violation" in detail or "TraceLens sandbox" in detail


def test_install_status_endpoint():
    resp = client.get("/api/install-status")
    assert resp.status_code == 200
    data = resp.json()
    assert "is_installing" in data
    assert "progress_pct" in data
    assert "status_message" in data


def test_check_dependencies_endpoint():
    # Stdlib only -> empty missing
    resp = client.post("/api/check-dependencies", json={"code": "import math\nprint(math.pi)"})
    assert resp.status_code == 200
    assert resp.json()["missing"] == []
    assert resp.json()["count"] == 0

    # Fake third-party package -> detected as missing
    resp2 = client.post("/api/check-dependencies", json={"code": "import non_existent_dummy_pkg_12345\n"})
    assert resp2.status_code == 200
    assert "non_existent_dummy_pkg_12345" in resp2.json()["missing"]
    assert resp2.json()["count"] >= 1


def test_pipeline_tracer_sample_tracing():
    code = """# pipeline_tracer.py — Multi-stage log triage for trace visualizers

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
print("Errors:", error_users)"""

    resp = client.post("/api/trace", json={"code": code, "mode": "logic_lens"})
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["steps"]) > 20
    assert len(data["safe_insertion_points"]) > 0

