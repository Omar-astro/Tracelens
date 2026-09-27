import os
import sys
from pathlib import Path

# Ensure /app and workspace roots are in sys.path
current_dir = Path(__file__).resolve().parent
parent_dir = current_dir.parent
for p in [str(parent_dir), str(current_dir)]:
    if p not in sys.path:
        sys.path.insert(0, p)

if __name__ == "__main__":
    raw_port = os.environ.get("PORT", "8000")
    try:
        port = int(raw_port)
    except (ValueError, TypeError):
        port = 8000

    print(f"[TraceLens Backend] Launching Uvicorn on 0.0.0.0:{port} (PORT env='{raw_port}')", flush=True)

    try:
        from backend.app.main import app
    except ImportError:
        from app.main import app

    import uvicorn
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=port,
        proxy_headers=True,
        forwarded_allow_ips="*",
    )
