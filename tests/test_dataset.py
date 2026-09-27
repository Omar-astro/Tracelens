"""
test_dataset.py — Unit and integration tests for Dataset Upload and Sandbox Integration.
"""

import io
import os
import sys
import time
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent
BACKEND_DIR = ROOT_DIR / "backend"
for p in (str(ROOT_DIR), str(BACKEND_DIR)):
    if p not in sys.path:
        sys.path.insert(0, p)

from fastapi.testclient import TestClient

try:
    from backend.app.main import app
    from backend.app.routers.dataset import UPLOAD_DIR, cleanup_expired_datasets, wipe_all_datasets
    from backend.app.services.sandbox import trace_in_sandbox
except ImportError:
    from app.main import app
    from app.routers.dataset import UPLOAD_DIR, cleanup_expired_datasets, wipe_all_datasets
    from app.services.sandbox import trace_in_sandbox

client = TestClient(app)


def setup_function():
    cleanup_expired_datasets()


def teardown_function():
    # Clean up uploaded test files
    if UPLOAD_DIR.exists():
        for f in UPLOAD_DIR.iterdir():
            if f.is_file():
                f.unlink(missing_ok=True)


def test_upload_dataset_success():
    csv_bytes = b"feature1,feature2,target\n1.0,2.0,0\n3.0,4.0,1\n"
    response = client.post(
        "/api/upload-dataset",
        files={"file": ("test_data.csv", io.BytesIO(csv_bytes), "text/csv")},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["filename"] == "test_data.csv"
    assert data["size_bytes"] == len(csv_bytes)
    assert data["expires_in_minutes"] == 20
    assert (UPLOAD_DIR / "test_data.csv").exists()


def test_upload_dataset_exceeds_100mb():
    class BigStream(io.RawIOBase):
        def __init__(self, size):
            self.size = size
            self.pos = 0

        def read(self, n=-1):
            if self.pos >= self.size:
                return b""
            chunk_size = min(n if n > 0 else self.size - self.pos, self.size - self.pos)
            self.pos += chunk_size
            return b"a" * chunk_size

        def readable(self):
            return True

    # 105 MB
    response = client.post(
        "/api/upload-dataset",
        files={"file": ("too_large.csv", BigStream(105 * 1024 * 1024), "text/csv")},
    )
    assert response.status_code == 413
    assert "exceeds 100MB limit" in response.json()["detail"]


def test_list_and_delete_dataset():
    client.post(
        "/api/upload-dataset",
        files={"file": ("delete_me.csv", io.BytesIO(b"a,b\n1,2\n"), "text/csv")},
    )

    list_res = client.get("/api/datasets")
    assert list_res.status_code == 200
    filenames = [d["filename"] for d in list_res.json()["datasets"]]
    assert "delete_me.csv" in filenames

    del_res = client.delete("/api/datasets/delete_me.csv")
    assert del_res.status_code == 200
    assert del_res.json()["deleted"] is True

    # Verify deleted
    assert not (UPLOAD_DIR / "delete_me.csv").exists()


def test_cleanup_expired_datasets():
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    old_file = UPLOAD_DIR / "old_dataset.csv"
    old_file.write_text("a,b\n1,2\n")

    # Set mtime to 25 minutes ago (1500 seconds ago)
    past_time = time.time() - 1500
    os.utime(old_file, (past_time, past_time))

    deleted = cleanup_expired_datasets()
    assert deleted >= 1
    assert not old_file.exists()


def test_sandbox_executes_uploaded_dataset():
    # Upload a sample CSV
    csv_data = b"median_house_value,rooms\n150000,3\n250000,4\n"
    client.post(
        "/api/upload-dataset",
        files={"file": ("housing 2.csv", io.BytesIO(csv_data), "text/csv")},
    )

    code = """import pandas as pd
data = pd.read_csv('housing 2.csv')
total_rows = len(data)
"""
    res = trace_in_sandbox(code, max_steps=100)
    assert res.status == "ok"
    assert res.error is None
    # Verify variable was populated in trace steps
    last_vars = res.steps[-1].get("all_variables", {})
    assert "total_rows" in last_vars
    assert "2" in str(last_vars["total_rows"])


def test_wipe_all_datasets():
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    f1 = UPLOAD_DIR / "file1.csv"
    f2 = UPLOAD_DIR / "file2.csv"
    f1.write_text("a,b\n1,2\n")
    f2.write_text("x,y\n3,4\n")

    count = wipe_all_datasets()
    assert count >= 2
    assert not f1.exists()
    assert not f2.exists()


def test_lifespan_startup_wipes_datasets():
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    stale_file = UPLOAD_DIR / "stale_dataset.csv"
    stale_file.write_text("col1,col2\nval1,val2\n")
    assert stale_file.exists()

    # When TestClient enters context, lifespan startup runs
    with TestClient(app):
        # Startup lifespan should have wiped the stale file
        assert not stale_file.exists()

