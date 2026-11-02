"""SAM 3.1 inference pipeline for TERRATERM: predictor, geometry,
segment-id registry, frame staging, caching, and TERRATERM payload
assembly. No FastAPI routes here; server.py owns the HTTP layer.
"""

from __future__ import annotations

import os
import re
import shutil
import threading
import time
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import cv2
import numpy as np
import requests
from fastapi import HTTPException

from service_config import (
    API_MODEL_NAME,
    DEFAULT_THRESHOLD,
    FRAME_STORE,
    FRAME_TTL_S,
    HTTP_TIMEOUT,
    MATCH_IOU,
    MAX_POLY_POINTS,
    MODEL_NAME,
    PUBLIC_BASE,
    VALID_CLS,
    backend_mode,
)


def slug(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", (text or "").lower()).strip("-")[:24] or "seg"


# --------------------------------------------------------------------------
# model
# --------------------------------------------------------------------------

_predictor = None
_predictor_error: Optional[str] = None
_predictor_lock = threading.Lock()


def _predictor_kwargs() -> Dict[str, Any]:
    """FlashAttention 3 is CUDA-only; allow turning it off for other GPUs."""
    kwargs: Dict[str, Any] = {}
    use_fa3 = os.environ.get("SAM31_USE_FA3", "auto")
    if use_fa3.lower() in ("0", "false", "no"):
        kwargs["use_fa3"] = False
    if os.environ.get("SAM31_MAX_NUM_OBJECTS"):
        kwargs["max_num_objects"] = int(os.environ["SAM31_MAX_NUM_OBJECTS"])
    if os.environ.get("SAM31_MULTIPLEX_COUNT"):
        kwargs["multiplex_count"] = int(os.environ["SAM31_MULTIPLEX_COUNT"])
    return kwargs


def get_predictor():
    """Build (once) and return the SAM 3.1 multiplex video predictor."""
    global _predictor, _predictor_error
    if _predictor is not None:
        return _predictor
    with _predictor_lock:
        if _predictor is not None:
            return _predictor
        try:
            from sam3.model_builder import build_sam3_multiplex_video_predictor

            _predictor = build_sam3_multiplex_video_predictor(**_predictor_kwargs())
            _predictor_error = None
        except Exception as exc:  # pragma: no cover - surfaced through /health
            _predictor_error = f"{type(exc).__name__}: {exc}"
            raise
    return _predictor


# --------------------------------------------------------------------------
# geometry helpers
# --------------------------------------------------------------------------


def polygonize(mask: np.ndarray, max_points: int = MAX_POLY_POINTS) -> Tuple[List[List[float]], float]:
    """Binary mask -> normalized polygon + pixel area.

    TERRATERM normalizes x (and radii) by image width and y by image height,
    so a pixel (col, row) becomes [col / width, row / height].
    """
    binary = mask.astype(np.uint8)
    contours, _ = cv2.findContours(binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return [], 0.0
    contour = max(contours, key=cv2.contourArea)
    area_px = float(cv2.contourArea(contour))
    if area_px <= 0:
        return [], 0.0
    eps = 0.002 * cv2.arcLength(contour, True)
    approx = cv2.approxPolyDP(contour, eps, True)
    while len(approx) > max_points:
        eps *= 1.8
        approx = cv2.approxPolyDP(contour, eps, True)
    h, w = mask.shape[:2]
    pts = [[round(float(p[0][0]) / w, 5), round(float(p[0][1]) / h, 5)] for p in approx]
    return pts, area_px


def mask_iou(a: np.ndarray, b: np.ndarray) -> float:
    if a.shape != b.shape:
        b = cv2.resize(b.astype(np.uint8), (a.shape[1], a.shape[0]), interpolation=cv2.INTER_NEAREST).astype(bool)
    union = int(np.logical_or(a, b).sum())
    if union == 0:
        return 0.0
    return float(np.logical_and(a, b).sum()) / float(union)


# --------------------------------------------------------------------------
# segment id registry -- keeps ids stable across passes so the drawer can
# follow a segment while the user steps passes (CONTRACT.md, imagery()).
# --------------------------------------------------------------------------


class SegmentIds:
    def __init__(self) -> None:
        self._by_prompt: Dict[str, Dict[str, Any]] = {}

    def resolve(self, prompt_text: str, objects: List[Dict[str, Any]]) -> Dict[int, str]:
        """Map this frame's SAM object ids to TERRATERM segment ids.

        Objects are matched to the previous frame by mask IoU; unmatched
        objects get a fresh id.
        """
        slot = self._by_prompt.setdefault(prompt_text, {"next": 1, "prev": {}})
        prev: Dict[int, Tuple[np.ndarray, str]] = slot["prev"]
        assigned: Dict[int, str] = {}
        claimed: set = set()
        current: Dict[int, Tuple[np.ndarray, str]] = {}

        for obj in objects:
            best_id, best_iou = None, 0.0
            for prev_obj_id, (ref_mask, seg_id) in prev.items():
                if prev_obj_id in claimed:
                    continue
                iou = mask_iou(obj["mask"], ref_mask)
                if iou > best_iou:
                    best_iou, best_id = iou, seg_id
            if best_id is not None and best_iou >= MATCH_IOU:
                seg_id = best_id
            else:
                seg_id = f"sam31-{slug(prompt_text)}-{slot['next']}"
                slot["next"] += 1
            assigned[obj["obj_id"]] = seg_id
            current[obj["obj_id"]] = (obj["mask"], seg_id)

        slot["prev"] = current
        return assigned


_id_registry = SegmentIds()


# --------------------------------------------------------------------------
# inference
# --------------------------------------------------------------------------


def _parse_outputs(out: Dict[str, Any], threshold: float) -> List[Dict[str, Any]]:
    """Turn a SAM 3.1 frame output into a list of detections."""
    masks = out.get("out_binary_masks")
    if masks is None:
        return []
    obj_ids = out.get("out_obj_ids")
    probs = out.get("out_probs")
    boxes = out.get("out_boxes_xywh")
    n = len(obj_ids) if obj_ids is not None else len(masks)
    out_list: List[Dict[str, Any]] = []
    for i in range(n):
        score = float(probs[i]) if probs is not None and i < len(probs) else 1.0
        if score < threshold:
            continue
        mask = np.asarray(masks[i]).astype(bool)
        if not mask.any():
            continue
        out_list.append(
            {
                "obj_id": int(obj_ids[i]) if obj_ids is not None else i,
                "score": round(score, 4),
                "mask": mask,
                "box": [float(v) for v in boxes[i]] if boxes is not None and i < len(boxes) else None,
            }
        )
    return out_list


def run_sam31(
    frame_paths: List[Path],
    prompts: List[Dict[str, Any]],
    threshold: float = DEFAULT_THRESHOLD,
) -> Dict[int, Dict[str, List[Dict[str, Any]]]]:
    """Run SAM 3.1 over a staged frame folder.

    Returns {frame_index: {prompt_text: [detections]}}. The folder must contain
    JPEGs named <frame_index>.jpg, which is what SAM 3.1 expects.
    """
    predictor = get_predictor()
    resource = str(frame_paths[0].parent)
    resp = predictor.handle_request(request=dict(type="start_session", resource_path=resource))
    session_id = resp["session_id"]

    per_frame: Dict[int, Dict[str, List[Dict[str, Any]]]] = {}
    try:
        for index, prompt in enumerate(prompts):
            # SAM 3.1 needs a reset before switching to a different text prompt.
            if index > 0:
                predictor.handle_request(request=dict(type="reset_session", session_id=session_id))
            added = predictor.handle_request(
                request=dict(
                    type="add_prompt",
                    session_id=session_id,
                    frame_index=0,
                    text=prompt["text"],
                )
            )
            if len(frame_paths) == 1:
                per_frame.setdefault(0, {})[prompt["text"]] = _parse_outputs(added["outputs"], threshold)
            else:
                for item in predictor.handle_stream_request(
                    request=dict(type="propagate_in_video", session_id=session_id)
                ):
                    fi = int(item["frame_index"])
                    per_frame.setdefault(fi, {})[prompt["text"]] = _parse_outputs(item["outputs"], threshold)
    finally:
        try:
            predictor.handle_request(request=dict(type="reset_session", session_id=session_id))
        except Exception:
            pass
    return per_frame


def stage_frames(urls: List[str], workdir: Path) -> Tuple[List[Path], List[Tuple[int, int]]]:
    """Download images into <frame_index>.jpg files; return paths + sizes."""
    paths: List[Path] = []
    sizes: List[Tuple[int, int]] = []
    workdir.mkdir(parents=True, exist_ok=True)
    for i, url in enumerate(urls):
        dest = workdir / f"{i:05d}.jpg"
        if not dest.exists():
            if url.startswith("http://") or url.startswith("https://"):
                res = requests.get(url, timeout=HTTP_TIMEOUT)
                res.raise_for_status()
                dest.write_bytes(res.content)
            else:
                src = Path(url)
                if not src.exists():
                    raise HTTPException(status_code=400, detail=f"image not found: {url}")
                shutil.copyfile(src, dest)
        img = cv2.imread(str(dest))
        if img is None:
            raise HTTPException(status_code=400, detail=f"unreadable image: {url}")
        paths.append(dest)
        sizes.append((img.shape[1], img.shape[0]))
    return paths, sizes


def sweep_frames() -> None:
    """Drop frame folders older than FRAME_TTL_S."""
    if not FRAME_STORE.exists():
        return
    cutoff = time.time() - FRAME_TTL_S
    for site_dir in FRAME_STORE.iterdir():
        if not site_dir.is_dir():
            continue
        for pass_dir in site_dir.iterdir():
            try:
                if pass_dir.stat().st_mtime < cutoff:
                    shutil.rmtree(pass_dir, ignore_errors=True)
            except OSError:
                pass


def browser_url(source: str, site_id: str, pass_id: str) -> str:
    """A URL the browser can actually load for the pass image."""
    if source.startswith("http://") or source.startswith("https://"):
        return source
    return f"{PUBLIC_BASE}/frames/{site_id}/{pass_id}/00000.jpg"



# --------------------------------------------------------------------------
# segmentation cache
# --------------------------------------------------------------------------

_cache: Dict[str, Dict[str, Any]] = {}
_cache_lock = threading.Lock()
CACHE_TTL_S = float(os.environ.get("SAM31_CACHE_TTL", "900"))


def cache_get(key: str) -> Optional[Dict[str, Any]]:
    with _cache_lock:
        entry = _cache.get(key)
    if not entry:
        return None
    if time.time() - entry["at"] > CACHE_TTL_S:
        return None
    return entry["value"]


def cache_put(key: str, value: Dict[str, Any]) -> None:
    with _cache_lock:
        _cache[key] = {"at": time.time(), "value": value}


# --------------------------------------------------------------------------
# TERRATERM payload assembly
# --------------------------------------------------------------------------


def build_segments(
    site_id: str,
    site: Dict[str, Any],
    prompt_specs: List[Dict[str, Any]],
    per_frame: Dict[int, Dict[str, List[Dict[str, Any]]]],
    frame_index: int,
    gsd: float,
    threshold: float,
    sizes: Dict[int, Tuple[int, int]],
) -> List[Dict[str, Any]]:
    """Map SAM detections to TERRATERM Segment objects."""
    segments: List[Dict[str, Any]] = []
    frame_masks = per_frame.get(frame_index, {})
    width, height = sizes.get(frame_index, (0, 0))
    frame_px = max(width * height, 1)

    for spec in prompt_specs:
        text = spec["text"]
        objects = frame_masks.get(text, [])
        ids = _id_registry.resolve(text, objects)
        for obj in objects:
            pts, area_px = polygonize(obj["mask"])
            if not pts:
                continue
            area_m2 = area_px * gsd * gsd
            seg_id = ids.get(obj["obj_id"], f"sam31-{slug(text)}-{obj['obj_id']}")
            segments.append(
                {
                    "id": seg_id,
                    "label": f"{spec.get('label') or text.upper()} {obj['obj_id'] + 1}",
                    "cls": spec.get("cls") if spec.get("cls") in VALID_CLS else "industrial",
                    "hud": bool(spec.get("hud", area_px / frame_px > 0.005)),
                    "conf": obj["score"],
                    "geom": {"t": "poly", "pts": pts},
                    "area_m2": round(area_m2, 1),
                    "metric": {
                        "name": "Segment area",
                        "value": round(area_m2, 1),
                        "unit": " m²",
                        "prior": None,
                        "delta": None,
                        "deltaUnit": " m²",
                        "digits": 0,
                    },
                    "rule": (
                        f'SAM 3.1 concept segmentation · prompt "{text}" · '
                        f"mask score >= {threshold:.2f}"
                    ),
                }
            )
    return segments


def _api_segments(site_id: str, site: Dict[str, Any], urls: List[str], gsd: float, sizes_list: List[Tuple[int, int]]) -> List[Dict[str, Any]]:
    """Live segments via the Meta Model API. Errors surface; no mock fallback."""
    import api_client

    segments: List[Dict[str, Any]] = []
    for fi, url in enumerate(urls):
        width, height = sizes_list[fi]
        try:
            detections, _skipped = api_client.segment_image_via_api(url, width, height, gsd, site)
        except api_client.SamApiError as exc:
            raise HTTPException(status_code=502, detail=f"SAM API failed: {exc}") from None
        for n, det in enumerate(detections):
            segments.append(
                {
                    "id": f"sam31-api-{n + 1}",
                    "label": f"{det.get('label') or 'TK'} {n + 1}",
                    "cls": det.get("cls", "energy"),
                    "hud": True,
                    "conf": det["confidence"],
                    "geom": {"t": "poly", "pts": det["polygon"]},
                    "area_m2": det["area_m2"],
                    "metric": {
                        "name": "Segment area",
                        "value": det["area_m2"],
                        "unit": " m²",
                        "prior": None,
                        "delta": None,
                        "deltaUnit": " m²",
                        "digits": 0,
                    },
                    "rule": f'SAM 3.1 Meta Model API · prompt "{det.get("prompt", "")}"',
                }
            )
    return segments


def segment_pass(site_id: str, site: Dict[str, Any], pass_meta: Dict[str, Any]) -> Dict[str, Any]:
    """Run (or reuse) segmentation for one pass and return its TERRATERM Pass."""
    key = f"{site_id}|{pass_meta['id']}|{backend_mode()}"
    cached = cache_get(key)
    if cached:
        return cached

    prompt_specs = site.get("prompts") or []
    if not prompt_specs:
        raise HTTPException(status_code=500, detail=f"site {site_id} has no prompts configured")

    gsd = float(site.get("gsd", 0.5))
    threshold = float(site.get("threshold", DEFAULT_THRESHOLD))
    urls = pass_meta.get("images") or []
    if not urls:
        raise HTTPException(status_code=500, detail=f"pass {pass_meta['id']} has no images")

    sweep_frames()
    frame_dir = FRAME_STORE / site_id / str(pass_meta["id"])
    frame_paths, sizes_list = stage_frames(urls, frame_dir)
    if backend_mode() == "api":
        segments = _api_segments(site_id, site, urls, gsd, sizes_list)
        model_label = API_MODEL_NAME
    elif backend_mode() == "mock":
        per_frame = run_sam31(frame_paths, prompt_specs, threshold)
        sizes = {i: s for i, s in enumerate(sizes_list)}
        segments = []
        for fi in range(len(frame_paths)):
            segments.extend(build_segments(site_id, site, prompt_specs, per_frame, fi, gsd, threshold, sizes))
        model_label = MODEL_NAME
    else:
        raise HTTPException(status_code=500, detail=f"unknown SAM31_BACKEND: {backend_mode()} (expected api or mock)")

    payload = {
        "id": pass_meta["id"],
        "i": pass_meta.get("i", 0),
        "ts": pass_meta["ts"],
        "sensor": site.get("sensor", "SAT VHR"),
        "gsd": gsd,
        "model": model_label,
        "imageUrl": browser_url(urls[0], site_id, str(pass_meta["id"])),
        "segments": segments,
    }
    cache_put(key, payload)
    return payload


def with_deltas(pass_payload: Dict[str, Any], prior_payload: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    """Fill metric.prior / metric.delta from the prior pass's areas."""
    if not prior_payload:
        return pass_payload
    prior_area = {s["id"]: s["area_m2"] for s in prior_payload.get("segments", [])}
    for seg in pass_payload.get("segments", []):
        prev = prior_area.get(seg["id"])
        seg["metric"]["prior"] = prev
        seg["metric"]["delta"] = round(seg["area_m2"] - prev, 1) if prev is not None else None
    return pass_payload


def pass_list(site: Dict[str, Any]) -> List[Dict[str, Any]]:
    passes = site.get("passes") or []
    return [{"id": p["id"], "i": i, "ts": p["ts"]} for i, p in enumerate(passes)]


