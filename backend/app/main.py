"""
TraceLens Backend Application - Stage 1 Scaffold.
"""

import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .routers.trace import router as trace_router
from .routers.explain import router as explain_router
from .routers.dataset import router as dataset_router, wipe_all_datasets

logger = logging.getLogger("uvicorn.error")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Lifespan context manager for TraceLens backend.
    Wipes all uploaded datasets on startup so server restarts and fresh deploys
    always start with a clean slate.
    """
    try:
        deleted = wipe_all_datasets()
        if deleted > 0:
            logger.info(f"[TraceLens Startup] Cleaned up {deleted} stale uploaded dataset(s).")
        else:
            logger.info("[TraceLens Startup] Uploaded datasets directory cleaned / ready.")
    except Exception as exc:
        logger.warning(f"[TraceLens Startup] Error wiping datasets: {exc}")
    yield


app = FastAPI(
    title="TraceLens API",
    description="TraceLens Monorepo & Deployment Scaffold",
    version="1.0.0",
    lifespan=lifespan,
)

# Enable CORS for local Vite dev servers and production frontend deployments
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(trace_router)
app.include_router(explain_router)
app.include_router(dataset_router)


@app.get("/health")
def health():
    """Health check route returning status ok per Stage 1 specification."""
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.app.main:app", host="0.0.0.0", port=8000, reload=True)
