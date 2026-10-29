"""Run the TERRATERM SAM 3.1 service against a FAKE model -- no GPU, no weights.

Lets you wire the whole TERRATERM UI (imagery, segment overlays, the segment
drawer, the compare slider) without an NVIDIA box, while the real service is
still in development.

    pip install -r requirements.txt
    python mock_sam_server.py            # serves http://localhost:8000

It stubs `sam3.model_builder.build_sam3_multiplex_video_predictor` with a
predictor that returns synthetic tank masks, and serves synthetic 16:10 imagery
to match. Swap in the real checkpoint by running `server.py` instead.
"""

from __future__ import annotations

import json
import sys
import tempfile
import types
from pathlib import Path

import cv2
import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

WIDTH, HEIGHT = 1600, 1000  # TERRATERM imagery is 16:10

# x, y, radius -- the fake "tanks" the fake model finds
OBJECTS = {
    "ela-segundo-tanks": [(220, 300, 150), (980, 620, 120), (1400, 260, 90)],
    "san-pedro-port": [(300, 500, 70), (420, 520, 60), (1100, 400, 85)],
}


def render_frame(site_id: str, shift: int) -> np.ndarray:
    img = np.zeros((HEIGHT, WIDTH, 3), dtype=np.uint8)
    img[:, :] = (78, 96, 120)
    for x, y, r in OBJECTS.get(site_id, OBJECTS["ela-segundo-tanks"]):
        cv2.circle(img, (x + shift, y), r, (188, 186, 178), -1)
        cv2.circle(img, (x + shift, y), int(r * 0.85), (150, 148, 141), 2)
    return img


class FakePredictor:
    def __init__(self, resource: Path):
        self.frames = sorted(resource.glob("*.jpg"))
        site = "ela-segundo-tanks"
        shift = 0
        for f in self.frames:
            if "shift" in f.name:
                shift = int(f.name.split("shift")[1].split(".")[0])
        self.site, self.shift = site, shift

    def _outputs(self):
        masks, boxes = [], []
        for x, y, r in OBJECTS.get(self.site, OBJECTS["ela-segundo-tanks"]):
            m = np.zeros((HEIGHT, WIDTH), dtype=np.uint8)
            cv2.circle(m, (x + self.shift, y), r, 1, -1)
            masks.append(m.astype(bool))
            boxes.append([(x - r) / WIDTH, (y - r) / HEIGHT, (2 * r) / WIDTH, (2 * r) / HEIGHT])
        return {
            "out_binary_masks": np.stack(masks),
            "out_obj_ids": np.arange(len(masks)),
            "out_probs": np.array([0.94, 0.87, 0.71][: len(masks)]),
            "out_boxes_xywh": np.array(boxes),
        }

    def handle_request(self, request):
        kind = request.get("type")
        if kind == "start_session":
            self.frames = sorted(Path(request["resource_path"]).glob("*.jpg"))
            return {"session_id": "mock-session"}
        if kind == "reset_session":
            return {}
        if kind == "add_prompt":
            return {"outputs": self._outputs()}
        raise AssertionError(f"unexpected request: {request}")

    def handle_stream_request(self, request):
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

import server  # noqa: E402  (imported after the stub is installed)


def build_catalog(tmp: Path) -> Path:
    """Write synthetic frames + a catalog that points at them."""
    sites = {}
    for site_id, objects in OBJECTS.items():
        passes = []
        for index, shift in enumerate((0, 6)):
            name = f"{site_id}-p{index}"
            frame_dir = tmp / name
            frame_dir.mkdir(parents=True, exist_ok=True)
            cv2.imwrite(str(frame_dir / f"{index:05d}.jpg"), render_frame(site_id, shift))
            passes.append(
                {
                    "id": f"p{index}",
                    "ts": 1790000000000 + index * 86400000,
                    "images": [str(frame_dir / f"{index:05d}.jpg")],
                }
            )
        sites[site_id] = {
            "name": site_id.replace("-", " ").title(),
            "short": site_id.split("-")[0].upper(),
            "type": "Tank farm" if "segundo" in site_id else "Port",
            "region": "Los Angeles, CA",
            "cls": "energy" if "segundo" in site_id else "maritime",
            "sensor": "SAT VHR",
            "gsd": 0.5,
            "prompts": [{"text": "storage tank", "cls": "energy", "label": "TK"}],
            "passes": passes,
        }
    path = tmp / "sites.mock.json"
    path.write_text(json.dumps({"sites": sites}))
    return path


if __name__ == "__main__":
    import uvicorn

    tmp = Path(tempfile.mkdtemp(prefix="sam31-mock-"))
    server.CATALOG_PATH = build_catalog(tmp)
    server.MODEL_NAME = "SAM 3.1 (Object Multiplex) — MOCK"
    print("mock SAM 3.1 service on http://localhost:8000 (no GPU, no weights)")
    uvicorn.run(server.app, host="127.0.0.1", port=8000, log_level="warning")
