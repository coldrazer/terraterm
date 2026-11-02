"""Provider credential checks for the TERRATERM settings API.

Pure request functions: each takes the key (and base URL or series) and
returns {"ok": bool, "detail": str}. Values are used transiently and
never stored, logged, or echoed. The caller (server.py) owns base-URL
allowlist policy; these functions never invent a destination.
"""

from __future__ import annotations

from typing import Any, Dict

import requests

TIMEOUT = 30


def check_sam(key: str, base: str, timeout: int = TIMEOUT) -> Dict[str, Any]:
    try:
        res = requests.get(f"{base}/models", headers={"Authorization": f"Bearer {key}"}, timeout=timeout)
    except Exception as exc:
        return {"ok": False, "detail": f"request failed: {type(exc).__name__}"}
    if res.status_code != 200:
        return {"ok": False, "detail": f"HTTP {res.status_code}"}
    try:
        ids = [m.get("id", "") for m in res.json().get("data", [])]
    except Exception:
        ids = []
    listed = "sam-3.1" in ids
    return {"ok": True, "detail": "connected; sam-3.1 listed" if listed else "connected; sam-3.1 not in model list"}


def check_eia(key: str, series: str, timeout: int = TIMEOUT) -> Dict[str, Any]:
    # params= encodes the series, so a series value can never inject
    # extra query parameters into the request URL.
    try:
        res = requests.get(
            "https://api.eia.gov/v2/petroleum/stoc/wstk/data/",
            params={"api_key": key, "facets[series][]": series, "length": 1},
            timeout=timeout,
        )
    except Exception as exc:
        return {"ok": False, "detail": f"request failed: {type(exc).__name__}"}
    if res.status_code != 200:
        return {"ok": False, "detail": f"HTTP {res.status_code}"}
    try:
        rows = res.json().get("response", {}).get("data", [])
    except Exception:
        rows = []
    return {"ok": bool(rows), "detail": f"series {series} returned data" if rows else f"series {series} returned no rows"}


def check_copernicus(username: str, password: str, timeout: int = TIMEOUT) -> Dict[str, Any]:
    try:
        res = requests.post(
            "https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token",
            data={"grant_type": "password", "client_id": "cdse-public", "username": username, "password": password},
            timeout=timeout,
        )
    except Exception as exc:
        return {"ok": False, "detail": f"request failed: {type(exc).__name__}"}
    if res.status_code != 200:
        return {"ok": False, "detail": f"HTTP {res.status_code}"}
    return {"ok": True, "detail": "credentials accepted (token not stored)"}


def check_baseten(key: str, base: str, timeout: int = TIMEOUT) -> Dict[str, Any]:
    try:
        res = requests.get(f"{base}/models", headers={"Authorization": f"Api-Key {key}"}, timeout=timeout)
    except Exception as exc:
        return {"ok": False, "detail": f"request failed: {type(exc).__name__}"}
    if res.status_code != 200:
        return {"ok": False, "detail": f"HTTP {res.status_code}"}
    return {"ok": True, "detail": "connected"}
