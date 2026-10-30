"""Baseten Muse Spark client -- agent/reasoning calls only.

This is a chat model client. It does NOT segment tanks and never
replaces the SAM path in api_client.py (Meta Model API, sam-3.1).

The API key comes from the BASETEN_API_KEY environment variable or the
local settings file (settings.local.json, gitignored, mode 0600), set
from the app's Settings page. It is never hardcoded, printed or logged.
Model and base URL are likewise env-over-file-over-default.
"""

from __future__ import annotations

import os
from typing import Any, Dict, List

try:
    import settings_store
except ImportError:  # service run without its own dir on sys.path
    settings_store = None

DEFAULT_BASE_URL = "https://inference.baseten.co/v1"
DEFAULT_MODEL_ID = "meta-models/muse-spark-open-1026"
BASE_URL = DEFAULT_BASE_URL
MODEL_ID = DEFAULT_MODEL_ID


def _setting(key: str, env_name: str, default: str) -> str:
    if settings_store is not None:
        try:
            return settings_store.get(key)
        except Exception:
            pass
    return os.environ.get(env_name, "").strip() or default


def get_base_url() -> str:
    return _setting("baseten_base_url", "BASETEN_BASE_URL", DEFAULT_BASE_URL).rstrip("/")


def get_model_id() -> str:
    return _setting("baseten_model", "BASETEN_MODEL", DEFAULT_MODEL_ID)


def get_api_key() -> str:
    if settings_store is not None:
        try:
            key = settings_store.get_secret("baseten_api_key")
            if key:
                return key
        except Exception:
            pass
    return os.environ.get("BASETEN_API_KEY", "").strip()


def get_client():
    """Build the Baseten OpenAI-compatible client (key from env or Settings)."""
    api_key = get_api_key()
    if not api_key:
        raise RuntimeError("BASETEN_API_KEY is not set and no key is saved in Settings; agent calls are disabled")
    from openai import OpenAI  # lazy: only needed for live agent calls

    return OpenAI(base_url=get_base_url(), api_key=api_key)


def chat(messages: List[Dict[str, Any]], **kwargs: Any) -> str:
    """One chat completion; returns the assistant text."""
    client = get_client()
    response = client.chat.completions.create(model=get_model_id(), messages=messages, **kwargs)
    return response.choices[0].message.content or ""
