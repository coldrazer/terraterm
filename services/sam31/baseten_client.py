"""Baseten Muse Spark client -- agent/reasoning calls only.

This is a chat model client. It does NOT segment tanks and never
replaces the SAM path in api_client.py (Meta Model API, sam-3.1).

The API key comes from the BASETEN_API_KEY environment variable only.
It is never hardcoded, printed or logged.
"""

from __future__ import annotations

import os
from typing import Any, Dict, List

BASE_URL = "https://inference.baseten.co/v1"
MODEL_ID = "meta-models/muse-spark-open-1026"


def get_client():
    """Build the Baseten OpenAI-compatible client (key from env only)."""
    api_key = os.environ.get("BASETEN_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("BASETEN_API_KEY is not set; agent calls are disabled")
    from openai import OpenAI  # lazy: only needed for live agent calls

    return OpenAI(base_url=BASE_URL, api_key=api_key)


def chat(messages: List[Dict[str, Any]], **kwargs: Any) -> str:
    """One chat completion; returns the assistant text."""
    client = get_client()
    response = client.chat.completions.create(model=MODEL_ID, messages=messages, **kwargs)
    return response.choices[0].message.content or ""
