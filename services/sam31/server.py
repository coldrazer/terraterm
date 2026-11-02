"""SAM 3.1 segmentation service for TERRATERM.

Runs Meta's SAM 3.1 (facebook/sam3.1) behind a small HTTP API and returns
imagery payloads in the exact shape TERRATERM expects (see ../../CONTRACT.md).

Setup (on a machine with an NVIDIA GPU -- upstream requires CUDA 12.6+):

    conda create -n sam31 python=3.12 && conda activate sam31
    pip install torch==2.7.0 torchvision --index-url https://download.pytorch.org/whl/cu126
    pip install -r requirements.txt
    pip install "git+https://github.com/facebookresearch/sam3.git"
    hf auth login                    # facebook/sam3.1 is gated: request access first
    uvicorn server:app --host 127.0.0.1 --port 8000

The weights are pulled from the Hub on first use (facebook/sam3.1 ->
sam3.1_multiplex.pt, ~6.5 GB) and cached in the usual HF cache directory.

Endpoints
    GET  /health              readiness + which checkpoint is loaded
    GET  /sites               TERRATERM sites() payload
    GET  /imagery/{site}      TERRATERM imagery() payload (site, passes, pass, prior)
    GET  /system              TERRATERM system() payload (model provenance for the HUD)
    POST /segment             raw segmentation for a list of image URLs
    GET  /api/settings        settings status (booleans + non-secret config only)
    POST /api/settings        save settings to settings.local.json (gitignored, 0600)
    POST /api/settings/test   verify one provider key without storing it
"""

from __future__ import annotations

import json
import os
import shutil
import tempfile
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

import segmentation
from segmentation import (
    _api_segments,
    pass_list,
    polygonize,
    run_sam31,
    segment_pass,
    stage_frames,
    with_deltas,
)
from service_config import (
    API_MODEL_NAME,
    DEFAULT_THRESHOLD,
    FRAME_STORE,
    MODEL_NAME,
    MODEL_VERSION,
    backend_mode,
)

try:
    import provider_checks
except ImportError:  # service run without its own dir on sys.path
    provider_checks = None

try:
    import settings_store
except ImportError:  # service run without its own dir on sys.path
    settings_store = None

HERE = Path(__file__).resolve().parent
CATALOG_PATH = Path(os.environ.get("TERRATERM_SITES", HERE / "sites.json"))

# CORS: the page is served by scripts/serve.mjs on localhost:5173 by
# default. Anything else must opt in via TERRATERM_CORS_ORIGINS
# (comma-separated origins). A wildcard here would let any website the
# user visits call the settings routes, which can move saved keys.
DEFAULT_ORIGINS = ["http://localhost:5173", "http://127.0.0.1:5173"]
_env_origins = os.environ.get("TERRATERM_CORS_ORIGINS", "").strip()
ALLOWED_ORIGINS = [o.strip() for o in _env_origins.split(",") if o.strip()] or DEFAULT_ORIGINS

# Host: a hostile page can rebind its own domain to 127.0.0.1, which
# makes its requests same origin so CORS never applies. The Host header
# still names the attacker's domain, so reject anything but the local
# names here. A public host (the AWS demo) opts in through
# TERRATERM_ALLOWED_HOSTS (comma separated hostnames, no ports).
DEFAULT_HOSTS = ["localhost", "127.0.0.1"]
_env_hosts = os.environ.get("TERRATERM_ALLOWED_HOSTS", "").strip()
ALLOWED_HOSTS = [h.strip() for h in _env_hosts.split(",") if h.strip()] or DEFAULT_HOSTS

app = FastAPI(title="TERRATERM SAM 3.1 service", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)
app.add_middleware(
    TrustedHostMiddleware,
    allowed_hosts=ALLOWED_HOSTS,
    www_redirect=False,
)


# --------------------------------------------------------------------------
# catalog
# --------------------------------------------------------------------------


def catalog() -> Dict[str, Any]:
    try:
        return json.loads(CATALOG_PATH.read_text())
    except FileNotFoundError:
        return {"sites": {}}


def site_config(site_id: str) -> Dict[str, Any]:
    site = catalog().get("sites", {}).get(site_id)
    if not site:
        raise HTTPException(status_code=404, detail=f"unknown site: {site_id}")
    return site




# --------------------------------------------------------------------------
# routes
# --------------------------------------------------------------------------


class PromptSpec(BaseModel):
    text: str
    cls: str = "industrial"
    label: str = ""
    hud: Optional[bool] = None
    box: Optional[List[float]] = None
    point: Optional[List[float]] = None


class SegmentRequest(BaseModel):
    images: List[str] = Field(..., description="http(s) image URLs or local paths, in order")
    prompts: List[PromptSpec]
    threshold: float = DEFAULT_THRESHOLD
    gsd: float = 0.5


@app.get("/health")
def health() -> Dict[str, Any]:
    loaded = segmentation._predictor is not None
    if backend_mode() == "api":
        return {
            "ok": not segmentation._predictor_error,
            "model": API_MODEL_NAME,
            "checkpoint": MODEL_VERSION,
            "backend": "api",
            "loaded": True,
            "error": segmentation._predictor_error,
            "threshold": DEFAULT_THRESHOLD,
        }
    return {
        "ok": loaded and not segmentation._predictor_error,
        "model": MODEL_NAME,
        "checkpoint": MODEL_VERSION,
        "backend": backend_mode(),
        "loaded": loaded,
        "error": segmentation._predictor_error,
        "threshold": DEFAULT_THRESHOLD,
    }


@app.get("/frames/{site_id}/{pass_id}/{name}")
def frame(site_id: str, pass_id: str, name: str) -> FileResponse:
    """Serve a staged frame so the browser can load pass imagery."""
    if "/" in name or ".." in name:
        raise HTTPException(status_code=400, detail="bad frame name")
    path = (FRAME_STORE / site_id / pass_id / name).resolve()
    if not str(path).startswith(str(FRAME_STORE.resolve())) or not path.exists():
        raise HTTPException(status_code=404, detail="frame not found")
    return FileResponse(path, media_type="image/jpeg")


@app.post("/segment")
def segment(req: SegmentRequest) -> Dict[str, Any]:
    """Raw segmentation: images + prompts in, polygons + scores out."""
    if not req.images:
        raise HTTPException(status_code=400, detail="images[] is required")
    if not req.prompts:
        raise HTTPException(status_code=400, detail="prompts[] is required")

    specs = [{"text": p.text, "cls": p.cls, "label": p.label, "hud": p.hud, "box": p.box, "point": p.point} for p in req.prompts]
    workdir = Path(tempfile.mkdtemp(prefix="sam31-"))
    try:
        frame_paths, sizes_list = stage_frames(req.images, workdir)
        if backend_mode() == "api":
            site_like = {"prompts": specs, "gsd": req.gsd}
            frames_out = []
            for fi, url in enumerate(req.images):
                w, h = sizes_list[fi]
                segs = _api_segments("segment", site_like, [url], req.gsd, [(w, h)])
                frames_out.append(
                    {
                        "index": fi,
                        "width": w,
                        "height": h,
                        "detections": [
                            {
                                "prompt": s["rule"],
                                "cls": s["cls"],
                                "objId": fi,
                                "score": s["conf"],
                                "box": None,
                                "polygon": s["geom"]["pts"],
                                "areaPx": round(s["area_m2"] / (req.gsd * req.gsd), 2) if req.gsd else 0,
                            }
                            for s in segs
                        ],
                    }
                )
            return {"asOf": int(time.time() * 1000), "model": API_MODEL_NAME, "frames": frames_out}
        per_frame = run_sam31(frame_paths, specs, req.threshold)
    finally:
        shutil.rmtree(workdir, ignore_errors=True)

    frames = []
    for fi in range(len(frame_paths)):
        width, height = sizes_list[fi]
        detections = []
        for spec in specs:
            for obj in per_frame.get(fi, {}).get(spec["text"], []):
                poly, area_px = polygonize(obj["mask"])
                if not poly:
                    continue
                detections.append(
                    {
                        "prompt": spec["text"],
                        "cls": spec["cls"],
                        "objId": obj["obj_id"],
                        "score": obj["score"],
                        "box": obj["box"],
                        "polygon": poly,
                        "areaPx": round(area_px, 2),
                    }
                )
        frames.append(
            {"index": fi, "width": width, "height": height, "detections": detections}
        )
    return {"asOf": int(time.time() * 1000), "model": MODEL_NAME, "frames": frames}


@app.get("/sites")
def sites() -> Dict[str, Any]:
    """TERRATERM sites() payload."""
    out = []
    for site_id, site in (catalog().get("sites") or {}).items():
        passes = site.get("passes") or []
        latest = passes[-1] if passes else None
        segments: List[Dict[str, Any]] = []
        key_label = ""
        key_metric: Dict[str, Any] = {"name": "Segment area", "value": 0, "unit": " m²"}
        key_conf = 0.0
        if latest:
            try:
                payload = segment_pass(site_id, site, dict(latest, i=len(passes) - 1))
                segments = payload["segments"]
                if segments:
                    head = max(segments, key=lambda s: s["area_m2"])
                    key_label = head["label"]
                    key_metric = head["metric"]
                    key_conf = head["conf"]
            except Exception:
                segments = []
        cadence_h = site.get("cadenceH")
        if cadence_h is None and len(passes) > 1:
            cadence_h = round((passes[-1]["ts"] - passes[-2]["ts"]) / 3600000)
        out.append(
            {
                "id": site_id,
                "name": site.get("name", site_id),
                "short": site.get("short", site_id),
                "type": site.get("type", ""),
                "region": site.get("region", ""),
                "cls": site.get("cls", "industrial"),
                "latestPass": latest["id"] if latest else None,
                "segments": len(segments),
                "keyLabel": key_label,
                "keyMetric": key_metric,
                "keyConf": key_conf,
                "cadenceH": cadence_h,
            }
        )
    return {"asOf": int(time.time() * 1000), "sites": out}


@app.get("/imagery/{site_id}")
def imagery(site_id: str, pass_id: Optional[str] = Query(default=None, alias="pass")) -> Dict[str, Any]:
    """TERRATERM imagery() payload: site, passes, pass, prior."""
    site = site_config(site_id)
    passes = site.get("passes") or []
    if not passes:
        raise HTTPException(status_code=500, detail=f"site {site_id} has no passes")

    idx = len(passes) - 1
    if pass_id is not None:
        found = next(
            (i for i, p in enumerate(passes) if p["id"] == pass_id or p.get("i") == int(pass_id)),
            None,
        )
        if found is None:
            raise HTTPException(status_code=404, detail=f"unknown pass: {pass_id}")
        idx = found

    current = segment_pass(site_id, site, dict(passes[idx], i=idx))
    prior = segment_pass(site_id, site, dict(passes[idx - 1], i=idx - 1)) if idx > 0 else None
    current = with_deltas(current, prior)

    site_meta = {
        "id": site_id,
        "name": site.get("name", site_id),
        "short": site.get("short", site_id),
        "type": site.get("type", ""),
        "region": site.get("region", ""),
        "cls": site.get("cls", "industrial"),
    }
    if current["segments"]:
        site_meta["key"] = current["segments"][0]["id"]

    return {
        "asOf": int(time.time() * 1000),
        "site": site_meta,
        "passes": pass_list(site),
        "pass": current,
        "prior": prior,
    }


@app.get("/system")
def system() -> Dict[str, Any]:
    """TERRATERM system() payload -- model provenance for the HUD."""
    return {
        "asOf": int(time.time() * 1000),
        "mode": "live",
        "models": [
            {
                "name": MODEL_NAME,
                "role": "segmentation",
                "where": MODEL_VERSION,
                "status": "ready" if segmentation._predictor is not None else "loading",
                "latencyMs": 0,
            }
        ],
        "context": {"used": 0, "max": 0},
        "sourcesFused": 1,
    }


# ---------------------------------------------------------------------------
# Settings API: keys + config for the app's Settings page.
# Secrets are never returned, logged, or echoed. Test calls use the value
# transiently and never store it; save calls write settings.local.json
# (gitignored, mode 0600). The repo ships with no values.
# ---------------------------------------------------------------------------


class SettingsSave(BaseModel):
    sam_api_key: Optional[str] = None
    sam_base_url: Optional[str] = None
    sam_backend: Optional[str] = None
    eia_api_key: Optional[str] = None
    eia_series: Optional[str] = None
    copernicus_user: Optional[str] = None
    copernicus_password: Optional[str] = None
    baseten_api_key: Optional[str] = None
    baseten_base_url: Optional[str] = None
    baseten_model: Optional[str] = None


class SettingsTest(BaseModel):
    provider: str
    key: Optional[str] = None
    username: Optional[str] = None
    password: Optional[str] = None


def _require_store() -> Any:
    if settings_store is None:
        raise HTTPException(status_code=500, detail="settings store unavailable")
    return settings_store


@app.get("/api/settings")
def api_settings() -> Dict[str, Any]:
    """Settings status: booleans + non-secret config. No secret values, ever."""
    return _require_store().status()


@app.post("/api/settings")
def api_settings_save(body: SettingsSave) -> Dict[str, Any]:
    """Save a partial update. Absent keys are unchanged; '' clears a key."""
    store = _require_store()
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    try:
        return store.set_many(updates)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from None


@app.post("/api/settings/test")
def api_settings_test(body: SettingsTest) -> Dict[str, Any]:
    """Verify one provider's key. Uses the value transiently; never stores it."""
    store = _require_store()
    if provider_checks is None:
        raise HTTPException(status_code=500, detail="provider checks unavailable")
    provider = (body.provider or "").strip().lower()
    if provider == "sam":
        key = (body.key or "").strip() or store.get_secret("sam_api_key")
        if not key:
            raise HTTPException(status_code=409, detail="SAM key is not configured")
        base = store.get("sam_base_url").rstrip("/")
        _check_base_url(store, "sam_base_url", base)
        result = provider_checks.check_sam(key, base)
    elif provider == "eia":
        key = (body.key or "").strip() or store.get_secret("eia_api_key")
        if not key:
            raise HTTPException(status_code=409, detail="EIA key is not configured")
        result = provider_checks.check_eia(key, store.get("eia_series"))
    elif provider == "copernicus":
        user = (body.username or "").strip() or store.get("copernicus_user")
        pw = (body.password or "").strip() or store.get_secret("copernicus_password")
        if not user or not pw:
            raise HTTPException(status_code=409, detail="Copernicus user/password are not configured")
        result = provider_checks.check_copernicus(user, pw)
    elif provider == "baseten":
        key = (body.key or "").strip() or store.get_secret("baseten_api_key")
        if not key:
            raise HTTPException(status_code=409, detail="Baseten key is not configured")
        base = store.get("baseten_base_url").rstrip("/")
        _check_base_url(store, "baseten_base_url", base)
        result = provider_checks.check_baseten(key, base)
    else:
        raise HTTPException(status_code=400, detail=f"unknown provider: {provider} (expected sam, eia, copernicus, baseten)")
    return {"provider": provider, **result}


def _check_base_url(store: Any, key: str, base: str) -> None:
    """Reject a file-sourced base URL that fails the allowlist.

    The settings file is web-writable input, so a value from it must be
    https on a known host before any key is sent to it. Env-sourced
    values are the operator's own and pass through.
    """
    try:
        source = store.source_of(key)
    except AttributeError:
        return
    if source != "file":
        return
    try:
        store.validate_base_url(key, base)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from None
