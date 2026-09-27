"""
package_installer.py — Automatic runtime dependency preparation for TraceLens sandbox.

Detects third-party libraries imported by user code that are missing in the local environment,
downloads and installs them via `pip` before the sandboxed execution begins.
Critically, this installation runs OUTSIDE the 30-second sandbox execution timer, so
downloading packages never counts against user execution timeout limits.
"""

from __future__ import annotations

import ast
import importlib
import importlib.util
import logging
import re
import subprocess
import sys
import threading
from typing import Any, Dict, List, Optional, Set

logger = logging.getLogger(__name__)

# Modules that are blocked by security policy and must NOT be downloaded or allowed
BLOCKED_MODULES = frozenset({"os", "sys", "subprocess", "socket", "shutil", "ctypes", "threading", "multiprocessing", "pty"})

# Live progress tracking for package installations
_INSTALL_LOCK = threading.Lock()
_INSTALL_STATUS: Dict[str, Any] = {
    "is_installing": False,
    "packages": [],
    "current_package": None,
    "completed": [],
    "progress_pct": 0,
    "status_message": "",
    "error": None,
}


def get_install_status() -> Dict[str, Any]:
    """Return a snapshot of current package installation state."""
    with _INSTALL_LOCK:
        return dict(_INSTALL_STATUS)


def reset_install_status() -> None:
    """Reset the package installation state."""
    global _INSTALL_STATUS
    with _INSTALL_LOCK:
        _INSTALL_STATUS = {
            "is_installing": False,
            "packages": [],
            "current_package": None,
            "completed": [],
            "progress_pct": 0,
            "status_message": "",
            "error": None,
        }

# Canonical mapping from Python import name to PyPI package distribution name
IMPORT_TO_PYPI = {
    "sklearn": "scikit-learn",
    "cv2": "opencv-python",
    "PIL": "pillow",
    "yaml": "pyyaml",
    "bs4": "beautifulsoup4",
    "dotenv": "python-dotenv",
    "fitz": "pymupdf",
    "jwt": "pyjwt",
    "serial": "pyserial",
    "plotly": "plotly",
    "seaborn": "seaborn",
    "xgboost": "xgboost",
    "lightgbm": "lightgbm",
    "torch": "torch",
    "torchvision": "torchvision",
    "statsmodels": "statsmodels",
    "imblearn": "imbalanced-learn",
}


def extract_imported_modules(code: str) -> Set[str]:
    """Parse AST to extract all root module names imported by the script."""
    modules: Set[str] = set()
    if not code or not isinstance(code, str):
        return modules
    try:
        tree = ast.parse(code)
    except Exception:
        # Fallback to regex in case of partial or syntax-delayed code
        pattern = re.compile(r"^\s*(?:import|from)\s+([a-zA-Z0-9_]+)", re.MULTILINE)
        for match in pattern.finditer(code):
            modules.add(match.group(1))
        return modules

    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                modules.add(alias.name.split(".")[0])
        elif isinstance(node, ast.ImportFrom):
            if node.module:
                modules.add(node.module.split(".")[0])
    return modules


def is_module_available(module_name: str) -> bool:
    """Return True if module can be loaded or found in current sys.path."""
    if not module_name:
        return True
    if module_name in sys.modules:
        return True
    stdlib_names = getattr(sys, "stdlib_module_names", set())
    if module_name in stdlib_names:
        return True
    try:
        spec = importlib.util.find_spec(module_name)
        return spec is not None
    except Exception:
        return False


def get_missing_libraries(code: str) -> List[str]:
    """Return list of required third-party libraries not currently available in the environment."""
    imported = extract_imported_modules(code)
    missing: List[str] = []
    stdlib_names = getattr(sys, "stdlib_module_names", set())

    for mod in sorted(imported):
        if not mod or mod in BLOCKED_MODULES or mod in stdlib_names:
            continue
        if not re.match(r"^[a-zA-Z_][a-zA-Z0-9_]*$", mod):
            continue
        if not is_module_available(mod):
            missing.append(mod)
    return missing


def install_package(module_name: str, timeout_seconds: int = 180) -> bool:
    """Download and prepare missing library using pip in a separate external process.
    
    NOTE: This runs completely outside the sandbox execution timeout timer.
    """
    pypi_name = IMPORT_TO_PYPI.get(module_name, module_name)
    logger.info("TraceLens Auto-Installer: Installing missing library '%s' (package: '%s')...", module_name, pypi_name)
    
    cmd = [
        sys.executable,
        "-m",
        "pip",
        "install",
        "--prefer-binary",
        "--quiet",
        pypi_name,
    ]
    try:
        proc = subprocess.run(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            timeout=timeout_seconds,
            check=False,
        )
        if proc.returncode == 0:
            importlib.invalidate_caches()
            logger.info("TraceLens Auto-Installer: Successfully installed '%s'", pypi_name)
            return True
        logger.warning(
            "TraceLens Auto-Installer: Failed to install '%s'. pip exit code %d: %s",
            pypi_name,
            proc.returncode,
            proc.stderr.strip() or proc.stdout.strip(),
        )
        return False
    except subprocess.TimeoutExpired:
        logger.warning("TraceLens Auto-Installer: pip install timed out after %ds for '%s'", timeout_seconds, pypi_name)
        return False
    except Exception as exc:
        logger.error("TraceLens Auto-Installer: Error installing '%s': %s", pypi_name, exc)
        return False


def prepare_environment_for_code(code: str) -> List[str]:
    """Scan code for missing libraries, download and prepare them, and return list of newly installed libs.
    
    This function executes prior to sandbox creation, ensuring library download time
    is NOT charged to the sandbox execution timeout timer.
    """
    missing = get_missing_libraries(code)
    if not missing:
        return []

    global _INSTALL_STATUS
    total = len(missing)
    with _INSTALL_LOCK:
        _INSTALL_STATUS["is_installing"] = True
        _INSTALL_STATUS["packages"] = list(missing)
        _INSTALL_STATUS["current_package"] = missing[0]
        _INSTALL_STATUS["completed"] = []
        _INSTALL_STATUS["progress_pct"] = 15
        _INSTALL_STATUS["status_message"] = f"Preparing to install {total} missing package(s): {', '.join(missing)}..."
        _INSTALL_STATUS["error"] = None

    installed = []
    try:
        for idx, mod in enumerate(missing):
            pypi_name = IMPORT_TO_PYPI.get(mod, mod)
            step_base_pct = int((idx / total) * 75) + 15
            with _INSTALL_LOCK:
                _INSTALL_STATUS["current_package"] = mod
                _INSTALL_STATUS["progress_pct"] = step_base_pct
                _INSTALL_STATUS["status_message"] = (
                    f"Downloading & installing '{pypi_name}' ({idx + 1} of {total})..."
                )

            success = install_package(mod)
            if success:
                installed.append(mod)
                with _INSTALL_LOCK:
                    _INSTALL_STATUS["completed"].append(mod)
                    _INSTALL_STATUS["progress_pct"] = int(((idx + 1) / total) * 75) + 15
                    _INSTALL_STATUS["status_message"] = (
                        f"Installed '{pypi_name}' successfully."
                    )
            else:
                with _INSTALL_LOCK:
                    _INSTALL_STATUS["error"] = f"Failed to install package '{pypi_name}'"

        with _INSTALL_LOCK:
            _INSTALL_STATUS["progress_pct"] = 100
            _INSTALL_STATUS["status_message"] = "Dependencies prepared. Starting sandboxed execution trace..."
    finally:
        with _INSTALL_LOCK:
            _INSTALL_STATUS["is_installing"] = False
    return installed
