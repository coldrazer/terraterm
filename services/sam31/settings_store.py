"""Local settings store for the TERRATERM live backend.

One rule: secret values live in exactly two places, and neither is the
repo. Either an environment variable, or the settings file next to this
module (settings.local.json, gitignored, written mode 0600). The settings
page in the app writes that file; the desktop flow is: pull the repo,
open Settings, paste the keys, save. Nothing is committed.

Precedence: environment wins over the file, the file wins over the
built-in default. Status reports carry booleans and non-secret config
only (base URLs, model ids, series, backend mode). They never carry a
secret value, and neither do logs or error messages from this module.
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Any, Dict

HERE = Path(__file__).resolve().parent
SETTINGS_PATH = Path(os.environ.get("TERRATERM_SETTINGS", HERE / "settings.local.json"))

# key -> (environment variable, default, is_secret)
KNOWN_KEYS: Dict[str, Any] = {
    "sam_api_key": ("SAM_API_KEY", "", True),
    "sam_base_url": ("SAM_API_BASE_URL", "https://api.meta.ai/v1", False),
    "sam_backend": ("SAM31_BACKEND", "mock", False),
    "eia_api_key": ("EIA_API_KEY", "", True),
    "eia_series": ("EIA_SERIES", "W_EPC0_SAX_YCUOK_MBBL", False),
    "copernicus_user": ("COPERNICUS_USER", "", False),
    "copernicus_password": ("COPERNICUS_PASSWORD", "", True),
    "baseten_api_key": ("BASETEN_API_KEY", "", True),
    "baseten_base_url": ("BASETEN_BASE_URL", "https://inference.baseten.co/v1", False),
    "baseten_model": ("BASETEN_MODEL", "meta-models/muse-spark-open-1026", False),
}

# mtime cache: the file is tiny and local, but the API path reads settings
# on every call, so avoid re-reading when nothing changed.
_cache: Dict[str, Any] = {"mtime": None, "data": {}}


def _read_file() -> Dict[str, Any]:
    try:
        mtime = SETTINGS_PATH.stat().st_mtime
    except OSError:
        return {}
    if _cache["mtime"] == mtime:
        return _cache["data"]
    try:
        data = json.loads(SETTINGS_PATH.read_text())
    except (OSError, ValueError):
        return {}
    if not isinstance(data, dict):
        return {}
    # Unknown keys are ignored, never trusted.
    data = {k: v for k, v in data.items() if k in KNOWN_KEYS and isinstance(v, str)}
    _cache["mtime"] = mtime
    _cache["data"] = data
    return data


def _source_of(key: str) -> str:
    env_name = KNOWN_KEYS[key][0]
    if os.environ.get(env_name, "").strip():
        return "env"
    if _read_file().get(key, "").strip():
        return "file"
    return "missing"


def get(key: str) -> str:
    """Effective value for a known key: env, then file, then default."""
    env_name, default, _secret = KNOWN_KEYS[key]
    env_val = os.environ.get(env_name, "").strip()
    if env_val:
        return env_val
    file_val = _read_file().get(key, "").strip()
    if file_val:
        return file_val
    return default


def get_secret(key: str) -> str:
    """Effective secret value, or '' when unset. Never logged by callers."""
    env_name, _default, _secret = KNOWN_KEYS[key]
    env_val = os.environ.get(env_name, "").strip()
    if env_val:
        return env_val
    return _read_file().get(key, "").strip()


def set_many(updates: Dict[str, Any]) -> Dict[str, Any]:
    """Apply a partial update to the settings file.

    A key absent from updates is left unchanged. An empty string clears
    that key from the file (the effective value falls back to env or
    default). Unknown keys are ignored. The file is written atomically
    with mode 0600. Returns the fresh status dict (no secret values).
    """
    data = dict(_read_file())
    for key, value in updates.items():
        if key not in KNOWN_KEYS or not isinstance(value, str):
            continue
        value = value.strip()
        if key == "sam_backend" and value and value not in ("mock", "api"):
            raise ValueError("sam_backend must be 'mock' or 'api'")
        if value:
            data[key] = value
        else:
            data.pop(key, None)
    SETTINGS_PATH.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=str(SETTINGS_PATH.parent), prefix=".settings-", suffix=".tmp")
    try:
        with os.fdopen(fd, "w") as fh:
            json.dump(data, fh, indent=2, sort_keys=True)
            fh.write("\n")
        os.chmod(tmp, 0o600)
        os.replace(tmp, SETTINGS_PATH)
    except Exception:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise
    _cache["mtime"] = None
    _cache["data"] = {}
    return status()


def parser_status() -> Dict[str, Any]:
    """Is mask decoding available? node + the @meta-sam/parser package.

    The check runs the real helper with empty input (it must print []).
    No network, no key, no model call.
    """
    helper = HERE / "parse_sam.mjs"
    node = shutil.which("node")
    if not node or not helper.exists():
        return {"node": bool(node), "parser": False, "helper": bool(helper.exists())}
    try:
        res = subprocess.run(
            [node, str(helper)],
            input="",
            capture_output=True,
            text=True,
            timeout=30,
        )
        ok = res.returncode == 0 and json.loads(res.stdout or "null") == []
    except Exception:
        ok = False
    return {"node": True, "parser": ok, "helper": True}


def status() -> Dict[str, Any]:
    """Everything the settings page may display. No secret values, ever."""
    providers = {}
    for provider, secret_key, extra_keys in (
        ("sam", "sam_api_key", ["sam_base_url", "sam_backend"]),
        ("eia", "eia_api_key", ["eia_series"]),
        ("copernicus", "copernicus_password", []),
        ("baseten", "baseten_api_key", ["baseten_base_url", "baseten_model"]),
    ):
        entry: Dict[str, Any] = {
            "configured": bool(get_secret(secret_key)),
            "source": _source_of(secret_key),
        }
        for k in extra_keys:
            entry[k] = get(k)
        if provider == "copernicus":
            entry["user_configured"] = bool(get("copernicus_user"))
            entry["user_source"] = _source_of("copernicus_user")
        providers[provider] = entry
    return {
        "backend": get("sam_backend"),
        "backend_source": _source_of("sam_backend"),
        "providers": providers,
        "parser": parser_status(),
        "settings_file": str(SETTINGS_PATH),
    }


if __name__ == "__main__":
    # Manual check: python settings_store.py prints status (no secrets).
    print(json.dumps(status(), indent=2))
