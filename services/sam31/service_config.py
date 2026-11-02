"""Shared constants for the TERRATERM SAM 3.1 service.

Kept in its own module so server.py (routes) and segmentation.py (the
inference pipeline) share one copy. backend_mode() lives here too: it
reads env, then the Settings file, else "mock", per call, so a Settings
save applies without restarting the service.
"""

from __future__ import annotations

import os
import tempfile
from pathlib import Path

try:
    import settings_store
except ImportError:  # service run without its own dir on sys.path
    settings_store = None

FRAME_STORE = Path(os.environ.get("SAM31_FRAME_STORE", Path(tempfile.gettempdir()) / "sam31-frames"))
FRAME_TTL_S = float(os.environ.get("SAM31_FRAME_TTL", "86400"))
PUBLIC_BASE = os.environ.get("TERRATERM_PUBLIC_BASE", "http://127.0.0.1:8000").rstrip("/")
MODEL_NAME = "SAM 3.1 (Object Multiplex)"
MODEL_VERSION = "facebook/sam3.1"
API_MODEL_NAME = "SAM 3.1 (Meta Model API)"
DEFAULT_THRESHOLD = float(os.environ.get("SAM31_THRESHOLD", "0.5"))
MAX_POLY_POINTS = int(os.environ.get("SAM31_MAX_POLY_POINTS", "48"))
MATCH_IOU = float(os.environ.get("SAM31_MATCH_IOU", "0.30"))
HTTP_TIMEOUT = float(os.environ.get("SAM31_HTTP_TIMEOUT", "60"))
VALID_CLS = ("energy", "logistics", "maritime", "industrial")


def backend_mode() -> str:
    """Effective SAM backend: env SAM31_BACKEND, then Settings file, else mock.

    Read per call so a Settings save applies without restarting the service.
    """
    env_val = os.environ.get("SAM31_BACKEND", "").strip().lower()
    if env_val:
        return env_val
    if settings_store is not None:
        try:
            return settings_store.get("sam_backend")
        except Exception:
            pass
    return "mock"
