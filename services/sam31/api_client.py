"""Hosted Meta Model API client for SAM 3.1 (live segmentation path).

Calls POST {base}/responses on the Meta Model API with model ``sam-3.1``
(the id ``sam-3-1`` returns 404) and turns the result into TERRATERM
segments with the same geometry math as server.py: normalized polygon
points (x / width, y / height), class ``energy``, confidence from
``out_probs`` and area in square metres (contour area x GSD^2).

Rules (see fix.md):
  * The API key comes from the SAM_API_KEY environment variable or
    the local settings file (settings.local.json, gitignored, mode
    0600), set from the app's Settings page. It is never hardcoded,
    printed or logged, and error messages are scrubbed so the key
    can never leak through them.
  * Live SAM needs object prompts: one box plus one point per tank.
    A bare noun phrase returns HTTP 200 with empty output_text, which
    means zero segments for that call -- never a pass, never mock data.
  * Tank positions are read from sites.json. A tank without a box is
    skipped and reported, never guessed.
  * Response text is parsed with the official @meta-sam/parser
    ``formats.segmentation.image()`` step via the node helper
    (parse_sam.mjs); the legacy JSON shape is still accepted.

Env (each also settable in Settings, which writes settings.local.json):
  SAM_API_KEY       required for live calls
  SAM_API_BASE_URL  default https://api.meta.ai/v1
"""

from __future__ import annotations

import base64
import json
import os
import re
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Tuple

import requests

try:
    import settings_store
except ImportError:  # service run without its own dir on sys.path
    settings_store = None

MODEL_ID = "sam-3.1"
DEFAULT_BASE_URL = "https://api.meta.ai/v1"
SEG_CLS = "energy"
_HTTP_TIMEOUT = float(os.environ.get("SAM31_HTTP_TIMEOUT", "60"))


class SamApiError(RuntimeError):
    """Visible API failure. Messages never contain the API key."""


def _file_key() -> str:
    if settings_store is None:
        return ""
    try:
        return settings_store.get_secret("sam_api_key")
    except Exception:
        return ""


def _scrub(text: str) -> str:
    for candidate in (os.environ.get("SAM_API_KEY", ""), _file_key()):
        if candidate:
            text = text.replace(candidate, "[redacted]")
    return text


def get_api_key() -> str:
    key = os.environ.get("SAM_API_KEY", "").strip() or _file_key()
    if not key:
        raise SamApiError(
            "SAM_API_KEY is not set and no key is saved in Settings; "
            "live SAM calls are disabled until a key is added"
        )
    return key


def get_base_url() -> str:
    if settings_store is not None:
        try:
            return settings_store.get("sam_base_url").rstrip("/")
        except Exception:
            pass
    return os.environ.get("SAM_API_BASE_URL", DEFAULT_BASE_URL).rstrip("/")


# ---------------------------------------------------------------------------
# prompt builder: one box + point prompt per tank, from sites.json data only
# ---------------------------------------------------------------------------


def build_prompt_text(box: List[float], point: List[float], width: int = 1000, height: int = 1000, label: str = "storage tank") -> str:
    """Encode one object prompt (box + point) in the official token grammar.

    sites.json coords are 0-1000 normalized; the API wants pixels plus the
    media size. Never a bare noun phrase.
    """
    x1 = int(round(float(box[0]) / 1000.0 * width))
    y1 = int(round(float(box[1]) / 1000.0 * height))
    x2 = int(round(float(box[2]) / 1000.0 * width))
    y2 = int(round(float(box[3]) / 1000.0 * height))
    px = int(round(float(point[0]) / 1000.0 * width))
    py = int(round(float(point[1]) / 1000.0 * height))
    return (
        f"<0f>1<|box;x1={x1};y1={y1};x2={x2};y2={y2};w={width};h={height}|>"
        f"<|point;x={px};y={py};w={width};h={height}|>"
    )


def build_prompts_for_site(site: Dict[str, Any], width: int = 1000, height: int = 1000) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    """Return (prompts, skipped) for a site catalog entry.

    Sources, in order: ``site["tanks"]`` entries, then ``site["prompts"]``
    entries that carry a ``box``. An entry with no box is skipped and
    reported in ``skipped`` -- coordinates are never invented.
    """
    prompts: List[Dict[str, Any]] = []
    skipped: List[Dict[str, Any]] = []
    entries: List[Dict[str, Any]] = []
    entries.extend(site.get("tanks") or [])
    entries.extend(site.get("prompts") or [])
    for entry in entries:
        label = entry.get("label") or entry.get("text") or "storage tank"
        box = entry.get("box")
        if not box or len(box) != 4:
            skipped.append({"label": label, "reason": "no box configured; skipped, not guessed"})
            continue
        point = entry.get("point")
        if not point or len(point) != 2:
            point = [(float(box[0]) + float(box[2])) / 2.0, (float(box[1]) + float(box[3])) / 2.0]
        prompts.append(
            {
                "text": build_prompt_text(list(box), list(point), width=width, height=height, label=str(entry.get("text") or "storage tank")),
                "box": [float(v) for v in box],
                "point": [float(v) for v in point],
                "cls": entry.get("cls") if entry.get("cls") in ("energy", "logistics", "maritime", "industrial") else SEG_CLS,
                "label": label,
            }
        )
    return prompts, skipped


# ---------------------------------------------------------------------------
# image encoding + API call
# ---------------------------------------------------------------------------


def image_to_data_url(image: Any) -> str:
    """Local path / http(s) URL / bytes -> data URL for input_image."""
    if isinstance(image, (bytes, bytearray)):
        raw = bytes(image)
    elif isinstance(image, (str, Path)) and str(image).startswith(("http://", "https://")):
        res = requests.get(str(image), timeout=_HTTP_TIMEOUT)
        res.raise_for_status()
        raw = res.content
    else:
        raw = Path(image).read_bytes()
    mime = "image/png" if raw[:8] == b"\x89PNG\r\n\x1a\n" else "image/jpeg"
    return f"data:{mime};base64," + base64.b64encode(raw).decode("ascii")


def _extract_output_text(payload: Dict[str, Any]) -> str:
    if isinstance(payload.get("output_text"), str):
        return payload["output_text"]
    for item in payload.get("output") or []:
        for part in item.get("content") or []:
            if part.get("type") in ("output_text", "text") and isinstance(part.get("text"), str):
                return part["text"]
    return ""


def call_responses_api(
    prompt_text: str,
    image_data_url: str,
    http_post: Optional[Callable[..., Any]] = None,
) -> str:
    """One live SAM call. Returns output_text ('' means zero segments)."""
    key = get_api_key()
    url = f"{get_base_url()}/responses"
    body = {
        "model": MODEL_ID,
        "stream": False,
        "input": [
            {
                "type": "message",
                "role": "user",
                "content": [
                    {"type": "input_text", "text": prompt_text},
                    {"type": "input_image", "image_url": image_data_url},
                ],
            }
        ],
        "metadata": {"include_confidence": "true"},
    }
    post = http_post or requests.post
    try:
        res = post(
            url,
            headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
            json=body,
            timeout=_HTTP_TIMEOUT,
        )
    except SamApiError:
        raise
    except Exception as exc:
        raise SamApiError(_scrub(f"SAM API request failed: {type(exc).__name__}: {exc}")) from None
    status = getattr(res, "status_code", 200)
    if status != 200:
        detail = ""
        try:
            detail = str(res.json())[:300]
        except Exception:
            detail = str(getattr(res, "text", ""))[:300]
        raise SamApiError(_scrub(f"SAM API returned HTTP {status}: {detail}"))
    try:
        payload = res.json()
    except Exception:
        raise SamApiError("SAM API returned a non-JSON response") from None
    return _extract_output_text(payload)


# ---------------------------------------------------------------------------
# response parsing (mirrors @meta-sam/parser formats.segmentation.image())
# ---------------------------------------------------------------------------


def _shoelace_area_px(pts_px: List[List[float]]) -> float:
    area = 0.0
    for i in range(len(pts_px)):
        x1, y1 = pts_px[i]
        x2, y2 = pts_px[(i + 1) % len(pts_px)]
        area += x1 * y2 - x2 * y1
    return abs(area) / 2.0


def _parse_svg_path(d: str) -> List[List[List[float]]]:
    """SVG path (M/L/H/V/Z, absolute + relative) -> list of rings."""
    toks = re.findall(r"[MLHVZmlhvz]|[-+]?\d*\.?\d+(?:[eE][-+]?\d+)?", d)
    rings: List[List[List[float]]] = []
    cur: Optional[List[List[float]]] = None
    x = y = 0.0
    cmd = ""
    i = 0
    while i < len(toks):
        t = toks[i]
        if t.isalpha():
            cmd = t
            i += 1
            if cmd in "Zz":
                if cur and len(cur) > 1:
                    cur.append(cur[0])
                    rings.append(cur)
                cur = None
            continue
        if cmd in "Mm":
            nx, ny = float(t), float(toks[i + 1])
            i += 2
            if cmd == "m":
                nx += x
                ny += y
            x, y = nx, ny
            if cur:
                rings.append(cur)
            cur = [[x, y]]
            cmd = "L" if cmd == "M" else "l"
        elif cmd in "Ll":
            nx, ny = float(t), float(toks[i + 1])
            i += 2
            if cmd == "l":
                nx += x
                ny += y
            x, y = nx, ny
            if cur is None:
                cur = []
            cur.append([x, y])
        elif cmd in "Hh":
            nx = float(t)
            i += 1
            if cmd == "h":
                nx += x
            x = nx
            if cur is None:
                cur = []
            cur.append([x, y])
        elif cmd in "Vv":
            ny = float(t)
            i += 1
            if cmd == "v":
                ny += y
            y = ny
            if cur is None:
                cur = []
            cur.append([x, y])
        else:
            raise SamApiError(f"unsupported SVG path command {cmd!r}")
    if cur:
        rings.append(cur)
    return rings


def _decode_output_via_node(output_text: str) -> List[Dict[str, Any]]:
    """Run the official parser helper. Returns [{bounds, confidence, svg}]."""
    import shutil
    import subprocess

    node = shutil.which("node")
    helper = Path(__file__).resolve().parent / "parse_sam.mjs"
    if not node or not helper.exists():
        raise SamApiError(
            "mask decoding needs node + @meta-sam/parser: run `npm install` "
            "at the repo root, then retry. No mock segments are substituted."
        )
    try:
        res = subprocess.run(
            [node, str(helper)],
            input=output_text,
            capture_output=True,
            text=True,
            timeout=120,
        )
    except Exception as exc:
        raise SamApiError(f"mask parser helper failed: {type(exc).__name__}") from None
    if res.returncode != 0:
        raise SamApiError(f"mask parser helper failed: {(res.stderr or '').strip()[:200]}")
    try:
        records = json.loads(res.stdout)
    except ValueError:
        raise SamApiError("mask parser helper returned non-JSON output") from None
    if not isinstance(records, list):
        raise SamApiError("mask parser helper returned an unexpected shape") from None
    return records


def _parse_token_output(output_text: str, width: int, height: int, gsd: float) -> List[Dict[str, Any]]:
    """Token-grammar output_text -> detections, via the official parser.

    Mask raster coords are local to the box; they are translated by the
    box origin (left, top). Box right/bottom in the output are
    exclusive, so the reported inclusive box subtracts one.
    """
    records = _decode_output_via_node(output_text)
    detections: List[Dict[str, Any]] = []
    for rec in records:
        svg = rec.get("svg")
        bounds = rec.get("bounds") or {}
        if not svg or bounds.get("left") is None or bounds.get("top") is None:
            continue
        rings = _parse_svg_path(svg)
        if not rings:
            continue
        ring = max(rings, key=lambda r: abs(_shoelace_area_px(r)))
        pts_px = [[bounds["left"] + px, bounds["top"] + py] for px, py in ring]
        conf = rec.get("confidence")
        conf = float(conf) if conf is not None else 0.0
        area_m2 = _shoelace_area_px(pts_px) * float(gsd) * float(gsd)
        detections.append(
            {
                "polygon": [[round(x / width, 5), round(y / height, 5)] for x, y in pts_px],
                "cls": SEG_CLS,
                "confidence": round(conf, 4),
                "score": round(conf, 4),
                "area_m2": round(area_m2, 1),
                "box": [bounds["left"], bounds["top"], bounds["right"] - 1, bounds["bottom"] - 1],
            }
        )
    return detections


def parse_output_text(output_text: str, width: int, height: int, gsd: float) -> List[Dict[str, Any]]:
    """Segmentation output_text -> TERRATERM-ready detections.

    Empty output_text yields zero segments (not an error, not mock data).
    Token grammar (the API's real output) goes through the official
    parser helper; the legacy JSON shape is still accepted. Each
    detection: normalized polygon, cls energy, confidence, area_m2.
    """
    if not output_text or not output_text.strip():
        return []
    text = output_text.strip()
    if "<|box;" in text or "<|mask;" in text:
        return _parse_token_output(text, width, height, gsd)
    fence = re.search(r"```(?:json)?\s*(.*?)```", text, re.DOTALL)
    if fence:
        text = fence.group(1).strip()
    try:
        data = json.loads(text)
    except (json.JSONDecodeError, ValueError):
        start, end = text.find("{"), text.rfind("}")
        if start < 0 or end <= start:
            start, end = text.find("["), text.rfind("]")
        if start < 0 or end <= start:
            raise SamApiError("SAM API output_text was not parseable segmentation JSON") from None
        data = json.loads(text[start : end + 1])

    if isinstance(data, dict):
        items = data.get("segments") or data.get("objects") or data.get("masks") or []
        probs = data.get("out_probs") or data.get("probs") or []
    elif isinstance(data, list):
        items, probs = data, []
    else:
        items, probs = [], []

    detections: List[Dict[str, Any]] = []
    for i, item in enumerate(items):
        if not isinstance(item, dict):
            continue
        raw_pts = item.get("polygon") or item.get("points") or item.get("pts") or []
        if not raw_pts:
            continue
        pts_px = [[float(p[0]), float(p[1])] for p in raw_pts]
        conf = item.get("confidence", item.get("score"))
        if conf is None and i < len(probs):
            conf = probs[i]
        conf = float(conf) if conf is not None else 0.0
        area_m2 = _shoelace_area_px(pts_px) * float(gsd) * float(gsd)
        detections.append(
            {
                "polygon": [[round(x / width, 5), round(y / height, 5)] for x, y in pts_px],
                "cls": SEG_CLS,
                "confidence": round(conf, 4),
                "score": round(conf, 4),
                "area_m2": round(area_m2, 1),
                "box": item.get("box"),
            }
        )
    return detections


def segment_image_via_api(
    image: Any,
    width: int,
    height: int,
    gsd: float,
    site: Dict[str, Any],
    http_post: Optional[Callable[..., Any]] = None,
) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    """Run live SAM for one image. Returns (detections, skipped).

    One API call per tank prompt. Failures raise SamApiError visibly;
    mock segments are never substituted.
    """
    prompts, skipped = build_prompts_for_site(site, width=width, height=height)
    if not prompts:
        return [], skipped
    data_url = image_to_data_url(image)
    detections: List[Dict[str, Any]] = []
    for prompt in prompts:
        output_text = call_responses_api(prompt["text"], data_url, http_post=http_post)
        for det in parse_output_text(output_text, width, height, gsd):
            det["prompt"] = prompt["text"]
            det["label"] = prompt.get("label", "")
            detections.append(det)
    return detections, skipped
