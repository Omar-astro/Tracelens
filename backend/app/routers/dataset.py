"""
dataset.py — Uploaded Dataset Manager for TraceLens Sandbox.

Provides endpoints to:
1. Upload external datasets (.csv, .parquet, .json, .tsv, etc.) up to 100MB.
2. Store datasets in `uploaded_datasets/` where sandboxed user scripts can load them.
3. Automatically delete datasets after 20 minutes (or on session reset).
"""

import os
import time
from pathlib import Path
from typing import Dict, List, Optional
from fastapi import APIRouter, File, HTTPException, UploadFile, status
from pydantic import BaseModel

router = APIRouter(prefix="/api", tags=["Datasets"])

# Resolve directory: project root / uploaded_datasets
PROJECT_ROOT = Path(__file__).resolve().parents[3]
UPLOAD_DIR = PROJECT_ROOT / "uploaded_datasets"

MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024  # 100 MB limit
DATASET_TTL_SECONDS = 20 * 60            # 20 minutes


def cleanup_expired_datasets() -> int:
    """Removes any uploaded dataset file older than 20 minutes."""
    if not UPLOAD_DIR.exists():
        return 0
    now = time.time()
    deleted_count = 0
    for file_path in UPLOAD_DIR.iterdir():
        if file_path.is_file():
            try:
                mtime = file_path.stat().st_mtime
                if now - mtime > DATASET_TTL_SECONDS:
                    file_path.unlink(missing_ok=True)
                    deleted_count += 1
            except Exception:
                pass
    return deleted_count


class DatasetInfo(BaseModel):
    filename: str
    size_bytes: int
    size_mb: float
    remaining_seconds: int
    remaining_minutes: float


class DatasetListResponse(BaseModel):
    datasets: List[DatasetInfo]


@router.post("/upload-dataset")
async def upload_dataset(file: UploadFile = File(...)):
    """
    Accepts an uploaded dataset file (up to 100MB).
    Saves to uploaded_datasets/ and sets a 20-minute auto-deletion TTL.
    """
    cleanup_expired_datasets()

    filename = Path(file.filename or "").name
    if not filename:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or empty file name.",
        )

    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    target_path = UPLOAD_DIR / filename

    total_size = 0
    chunk_size = 1024 * 1024  # 1 MB chunk

    try:
        with open(target_path, "wb") as buffer:
            while chunk := await file.read(chunk_size):
                total_size += len(chunk)
                if total_size > MAX_FILE_SIZE_BYTES:
                    buffer.close()
                    target_path.unlink(missing_ok=True)
                    raise HTTPException(
                        status_code=413,
                        detail=f"File exceeds 100MB limit ({total_size / (1024 * 1024):.1f}MB detected).",
                    )
                buffer.write(chunk)
    except HTTPException:
        raise
    except Exception as exc:
        target_path.unlink(missing_ok=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to save dataset: {str(exc)}",
        )

    return {
        "filename": filename,
        "size_bytes": total_size,
        "size_mb": round(total_size / (1024 * 1024), 2),
        "expires_in_minutes": 20,
        "message": f"Dataset '{filename}' uploaded successfully. Available to your code for the next 20 minutes.",
    }


@router.get("/datasets", response_model=DatasetListResponse)
def list_datasets():
    """Returns active uploaded datasets and their remaining lifetime."""
    cleanup_expired_datasets()
    if not UPLOAD_DIR.exists():
        return DatasetListResponse(datasets=[])

    now = time.time()
    results: List[DatasetInfo] = []
    for file_path in UPLOAD_DIR.iterdir():
        if file_path.is_file():
            try:
                stat_res = file_path.stat()
                age = now - stat_res.st_mtime
                remaining = max(0, int(DATASET_TTL_SECONDS - age))
                results.append(
                    DatasetInfo(
                        filename=file_path.name,
                        size_bytes=stat_res.st_size,
                        size_mb=round(stat_res.st_size / (1024 * 1024), 2),
                        remaining_seconds=remaining,
                        remaining_minutes=round(remaining / 60, 1),
                    )
                )
            except Exception:
                pass

    return DatasetListResponse(datasets=results)


@router.delete("/datasets/{filename}")
def delete_dataset(filename: str):
    """Deletes an uploaded dataset on demand."""
    safe_name = Path(filename).name
    target_path = UPLOAD_DIR / safe_name
    if target_path.exists() and target_path.is_file():
        target_path.unlink(missing_ok=True)
        return {"deleted": True, "filename": safe_name}
    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail=f"Dataset '{safe_name}' not found.",
    )


def wipe_all_datasets() -> int:
    """
    Wipes all uploaded datasets from disk.
    Called on backend startup, redeploy, or session reset.
    """
    if not UPLOAD_DIR.exists():
        return 0
    count = 0
    for file_path in UPLOAD_DIR.iterdir():
        if file_path.is_file():
            try:
                try:
                    file_path.unlink(missing_ok=True)
                except PermissionError:
                    os.chmod(file_path, 0o777)
                    file_path.unlink(missing_ok=True)
                count += 1
            except Exception:
                pass
    return count


@router.post("/datasets/clear")
def clear_all_datasets():
    """Clears all uploaded datasets (e.g. on session end)."""
    count = wipe_all_datasets()
    return {"cleared": count}

