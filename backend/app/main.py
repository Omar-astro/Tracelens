"""
TraceLens Backend Application - Stage 1 Scaffold.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .routers.trace import router as trace_router
from .routers.explain import router as explain_router

app = FastAPI(
    title="TraceLens API",
    description="TraceLens Monorepo & Deployment Scaffold",
    version="1.0.0",
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


@app.get("/health")
def health():
    """Health check route returning status ok per Stage 1 specification."""
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.app.main:app", host="0.0.0.0", port=8000, reload=True)
