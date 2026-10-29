"""Smoke test for the SAM 3.1 service: fake SAM, real geometry, contract check.

Runs without a GPU, without torch and without the SAM 3.1 weights by stubbing
`sam3.model_builder.build_sam3_multiplex_video_predictor`. It exercises the whole
path that matters for TERRATERM: mask -> polygon -> Segment, plus the contract
shape, the normalized coordinates and the cross-pass segment ids.

    python test_service.py

Requires: fastapi, numpy, opencv-python-headless, requests, httpx.
"""

from __future__ import annotations

import json
import os
import sys
import tempfile
import types
from pathlib import Path

import cv2
import numpy as np

HERE = Path(__file__).resolve().parent

# --------------------------------------------------------------------------
# stub the sam3 package before the service imports it
# --------------------------------------------------------------------------

TANKS = [(220, 300, 150), (980, 620, 120)]  # x, y, radius in a 1600x1000 frame


def _fake_masks(width: int, height: int, shift: int = 0):
    masks, boxes = [], []
    for x, y, r in TANKS:
        m = np.zeros((height, width), dtype=np.uint8)
        cv2.circle(m, (x + shift, y), r, 1, -1)
        masks.append(m.astype(bool))
        boxes.append([(x + shift - r) / width, (y - r) / height, (2 * r) / width, (2 * r) / height])
    return np.stack(masks), np.array([0, 1]), np.array([0.94, 0.81]), np.array(boxes)


class FakePredictor:
    """Mimics Sam3MultiplexVideoPredictor for the calls the service makes."""

    def __init__(self, resource: Path):
        self.resource = resource
        self.frames = sorted(resource.glob("*.jpg"))
        self.shift = 6 if "p2" in resource.parent.name else 0
        self._active = None

    def _outputs(self):
        img = cv2.imread(str(self.frames[0]))
        h, w = img.shape[:2]
        masks, ids, probs, boxes = _fake_masks(w, h, self.shift)
        return {"out_binary_masks": masks, "out_obj_ids": ids, "out_probs": probs, "out_boxes_xywh": boxes}

    def handle_request(self, request):
        kind = request.get("type")
        if kind == "start_session":
            self.resource = Path(request["resource_path"])
            self.frames = sorted(self.resource.glob("*.jpg"))
            return {"session_id": "session-1"}
        if kind == "reset_session":
            return {}
        if kind == "add_prompt":
            self._active = request.get("text")
            return {"outputs": self._outputs()}
        raise AssertionError(f"unexpected request: {request}")

    def handle_stream_request(self, request):
        assert request.get("type") == "propagate_in_video"
        for i, _ in enumerate(self.frames):
            yield {"frame_index": i, "outputs": self._outputs()}


def install_fake_sam():
    sam3 = types.ModuleType("sam3")
    model_builder = types.ModuleType("sam3.model_builder")
    model_builder.build_sam3_multiplex_video_predictor = lambda **kw: FakePredictor(Path("."))
    sam3.model_builder = model_builder
    sys.modules["sam3"] = sam3
    sys.modules["sam3.model_builder"] = model_builder


install_fake_sam()
sys.path.insert(0, str(HERE))

import server  # noqa: E402  (imported after the stub is installed)

from fastapi.testclient import TestClient  # noqa: E402

VALID_CLS = {"energy", "logistics", "maritime", "industrial"}
failures: list = []


def check(cond: bool, label: str):
    print(("  ok   " if cond else "  FAIL ") + label)
    if not cond:
        failures.append(label)


# --------------------------------------------------------------------------
# fixtures: two 16:10 passes of the same tanks
# --------------------------------------------------------------------------

work = Path(tempfile.mkdtemp(prefix="sam31-test-"))
frames = work / "frames"
frames.mkdir()
for name, shift in (("p1", 0), ("p2", 6)):
    img = np.zeros((1000, 1600, 3), dtype=np.uint8)
    img[:, :] = (40, 60, 90)
    for x, y, r in TANKS:
        cv2.circle(img, (x + shift, y), r, (200, 200, 190), -1)
    cv2.imwrite(str(frames / f"{name}.jpg"), img)

catalog = {
    "sites": {
        "ela-segundo-tanks": {
            "name": "El Segundo Tank Farm",
            "short": "EL SEGUNDO",
            "type": "Tank farm",
            "region": "Los Angeles, CA",
            "cls": "energy",
            "sensor": "SAT VHR",
            "gsd": 0.5,
            "prompts": [{"text": "storage tank", "cls": "energy", "label": "TK"}],
            "passes": [
                {"id": "p1", "ts": 1790000000000, "images": [str(frames / "p1.jpg")]},
                {"id": "p2", "ts": 1790086400000, "images": [str(frames / "p2.jpg")]},
            ],
        }
    }
}
catalog_path = work / "sites.json"
catalog_path.write_text(json.dumps(catalog))
server.CATALOG_PATH = catalog_path

client = TestClient(server.app)

# --------------------------------------------------------------------------
print("\n[1] GET /health")
# --------------------------------------------------------------------------
health = client.get("/health").json()
check(health["model"] == "SAM 3.1 (Object Multiplex)", "health reports the SAM 3.1 model")
check(health["checkpoint"] == "facebook/sam3.1", "health reports the facebook/sam3.1 checkpoint")

# --------------------------------------------------------------------------
print("\n[2] GET /imagery/{site}")
# --------------------------------------------------------------------------
res = client.get("/imagery/ela-segundo-tanks")
check(res.status_code == 200, "imagery returns 200")
payload = res.json()

for key in ("asOf", "site", "passes", "pass", "prior"):
    check(key in payload, f"payload has {key!r}")

p = payload["pass"]
for key in ("id", "i", "ts", "sensor", "gsd", "model", "imageUrl", "segments"):
    check(key in p, f"pass has {key!r}")

segs = p["segments"]
check(len(segs) == 2, f"two tanks detected (got {len(segs)})")
check(
    str(p.get("imageUrl", "")).startswith("http"),
    "pass.imageUrl is an http URL the browser can actually load",
)

# --------------------------------------------------------------------------
print("\n[3] Segment shape matches CONTRACT.md")
# --------------------------------------------------------------------------
for s in segs:
    tag = s.get("id")
    check(isinstance(s.get("id"), str) and s["id"], f"{tag}: id is a non-empty string")
    check(s.get("cls") in VALID_CLS, f"{tag}: cls is one of {sorted(VALID_CLS)}")
    check(isinstance(s.get("hud"), bool), f"{tag}: hud is a boolean")
    check(isinstance(s.get("conf"), (int, float)) and 0 <= s["conf"] <= 1, f"{tag}: conf is 0..1")
    check(isinstance(s.get("area_m2"), (int, float)) and s["area_m2"] > 0, f"{tag}: area_m2 is a positive number")
    check(isinstance(s.get("rule"), str) and "storage tank" in s["rule"], f"{tag}: rule names the prompt")

    g = s.get("geom") or {}
    check(g.get("t") == "poly", f"{tag}: geom.t is 'poly'")
    pts = g.get("pts") or []
    check(len(pts) >= 3, f"{tag}: polygon has at least 3 points")
    check(all(0 <= x <= 1 and 0 <= y <= 1 for x, y in pts), f"{tag}: points are normalized to 0..1")
    check(len(pts) <= 48, f"{tag}: polygon is simplified to <= 48 points ({len(pts)})")

    m = s.get("metric") or {}
    for key in ("name", "value", "unit", "prior", "delta"):
        check(key in m, f"{tag}: metric has {key!r}")
    check(m.get("prior") is not None, f"{tag}: metric.prior is filled from the prior pass")
    check(isinstance(m.get("delta"), (int, float)), f"{tag}: metric.delta is numeric")

# --------------------------------------------------------------------------
print("\n[4] geometry matches the mask")
# --------------------------------------------------------------------------
# tank 1: centre (220,300) r=150 in a 1600x1000 frame -> normalized centre
cx, cy, r = TANKS[0]
expect_cx, expect_cy, expect_r = cx / 1600, cy / 1000, r / 1600
best = min(
    segs,
    key=lambda s: abs(sum(pt[0] for pt in s["geom"]["pts"]) / len(s["geom"]["pts"]) - expect_cx),
)
pts = best["geom"]["pts"]
mx = sum(pt[0] for pt in pts) / len(pts)
my = sum(pt[1] for pt in pts) / len(pts)
check(abs(mx - expect_cx) < 0.03, f"polygon centroid x ~ {expect_cx:.3f} (got {mx:.3f})")
check(abs(my - expect_cy) < 0.03, f"polygon centroid y ~ {expect_cy:.3f} (got {my:.3f})")
check(abs(best["area_m2"] - 3.14159265 * r * r * 0.5 * 0.5) < 400, "area_m2 = contour px x gsd^2")

# --------------------------------------------------------------------------
print("\n[5] segment ids are stable across passes")
# --------------------------------------------------------------------------
prior = payload["prior"]
check(prior is not None, "prior pass is present")
prior_ids = {s["id"] for s in prior["segments"]}
cur_ids = {s["id"] for s in segs}
check(prior_ids == cur_ids, f"same segment ids in both passes ({sorted(cur_ids)})")

# --------------------------------------------------------------------------
print("\n[6] GET /imagery/{site}?pass=p1")
# --------------------------------------------------------------------------
first = client.get("/imagery/ela-segundo-tanks", params={"pass": "p1"}).json()
check(first["pass"]["id"] == "p1", "explicit pass id is honoured")
check(first["pass"]["i"] == 0, "pass.i is the position in passes")
check(first["prior"] is None, "the oldest pass has no prior")

# --------------------------------------------------------------------------
print("\n[7] GET /sites and GET /system")
# --------------------------------------------------------------------------
sites = client.get("/sites").json()
check(len(sites["sites"]) == 1, "sites() lists the catalog")
check(sites["sites"][0]["latestPass"] == "p2", "sites() reports the latest pass")
check(sites["sites"][0]["segments"] == 2, "sites() reports the segment count")

system = client.get("/system").json()
check(system["models"][0]["role"] == "segmentation", "system() reports the segmentation model")

# --------------------------------------------------------------------------
print("\n[8] POST /segment")
# --------------------------------------------------------------------------
raw = client.post(
    "/segment",
    json={"images": [str(frames / "p1.jpg")], "prompts": [{"text": "storage tank", "cls": "energy"}]},
).json()
check(len(raw["frames"][0]["detections"]) == 2, "raw /segment returns both detections")
check(raw["frames"][0]["detections"][0]["polygon"], "raw /segment returns polygons")

# --------------------------------------------------------------------------
print("\n[9] api_client with stubbed HTTP (no live calls, no real key)")
# --------------------------------------------------------------------------
os.environ["SAM_API_KEY"] = "test-key-not-real"
os.environ.pop("SAM_API_BASE_URL", None)
import api_client  # noqa: E402

captured: dict = {}


class _StubRes:
    def __init__(self, status_code=200, payload=None, text=""):
        self.status_code = status_code
        self._payload = payload or {}
        self.text = text

    def json(self):
        return self._payload


def _stub_post_ok(url, headers=None, json=None, timeout=None):  # noqa: A002 - mirrors requests.post
    captured.update(url=url, headers=headers, body=json)
    seg = json_module.dumps(
        {"segments": [{"polygon": [[0, 0], [100, 0], [100, 100], [0, 100]], "confidence": 0.582}], "out_probs": [0.582]}
    )
    return _StubRes(200, {"output_text": seg})


import json as json_module  # noqa: E402

_site_with_box = {
    "gsd": 10,
    "prompts": [{"text": "storage tank", "cls": "energy", "label": "TK", "box": [10, 20, 110, 120], "point": [60, 70]}],
}
_prompts, _skipped = api_client.build_prompts_for_site(_site_with_box)
check(len(_prompts) == 1 and len(_skipped) == 0, "api: tank with box yields one prompt, none skipped")
check("box [10, 20, 110, 120]" in _prompts[0]["text"] and "(60, 70)" in _prompts[0]["text"], "api: prompt encodes box plus point")
check(_prompts[0]["text"] != "storage tank", "api: prompt is not a bare noun phrase")

_no_box_prompts, _no_box_skipped = api_client.build_prompts_for_site({"prompts": [{"text": "storage tank", "label": "TK"}]})
check(_no_box_prompts == [] and len(_no_box_skipped) == 1, "api: tank without box is skipped and reported, not guessed")

_out = api_client.call_responses_api(_prompts[0]["text"], "data:image/jpeg;base64,AAAA", http_post=_stub_post_ok)
check(captured["url"] == "https://api.meta.ai/v1/responses", "api: endpoint is {base}/responses")
check(captured["body"]["model"] == "sam-3.1", "api: model id is sam-3.1 exactly")
check(captured["body"]["stream"] is False, "api: stream is false")
check(captured["body"]["metadata"] == {"include_confidence": True}, "api: metadata asks for confidence")
_in = captured["body"]["input"][0]
check(_in["type"] == "message" and _in["role"] == "user", "api: input is a user message")
check(_in["content"][0]["type"] == "input_text" and _in["content"][1]["type"] == "input_image", "api: content is input_text + input_image")
check(captured["headers"]["Authorization"] == "Bearer test-key-not-real", "api: key sent as Bearer from env only")

_dets = api_client.parse_output_text(_out, 1600, 1000, 10)
check(len(_dets) == 1 and abs(_dets[0]["confidence"] - 0.582) < 1e-9, "api: confidence comes from the response (0.582)")
check(_dets[0]["cls"] == "energy", "api: segment class is energy")
check(all(0 <= x <= 1 and 0 <= y <= 1 for x, y in _dets[0]["polygon"]), "api: polygon points are normalized")
check(_dets[0]["area_m2"] == 100 * 100 * 10 * 10, "api: area_m2 = contour area x gsd^2")

check(api_client.parse_output_text("", 1600, 1000, 10) == [], "api: empty output_text yields zero segments without crashing")
check(api_client.parse_output_text("   ", 1600, 1000, 10) == [], "api: blank output_text yields zero segments")

_dets2, _ = api_client.segment_image_via_api(frames / "p1.jpg", 1600, 1000, 10, _site_with_box, http_post=_stub_post_ok)
check(len(_dets2) == 1, "api: segment_image_via_api returns the parsed detection")


def _stub_post_fail(url, headers=None, json=None, timeout=None):  # noqa: A002
    return _StubRes(500, {"error": "boom"}, text="boom")


try:
    api_client.call_responses_api(_prompts[0]["text"], "data:image/jpeg;base64,AAAA", http_post=_stub_post_fail)
    check(False, "api: HTTP failure raises visibly")
except api_client.SamApiError as exc:
    check("test-key-not-real" not in str(exc), "api: key never appears in error output")
    check("500" in str(exc), "api: HTTP failure raises visibly with status")

check("test-key-not-real" not in json_module.dumps(captured["body"]), "api: key never appears in request body/logs")

print("\n" + ("ALL CHECKS PASSED" if not failures else f"{len(failures)} FAILURE(S): " + "; ".join(failures)))
sys.exit(1 if failures else 0)
