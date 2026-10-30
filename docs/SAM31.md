# SAM 3.1 → TERRATERM

How to run [facebook/sam3.1](https://huggingface.co/facebook/sam3.1) and wire it into
TERRATERM's orbital view.

Short version: SAM 3.1 is a ~6.5 GB PyTorch checkpoint that only runs on an NVIDIA
GPU. TERRATERM is a zero-dependency browser app. So the integration is a small
Python service in front of the model, and the browser talks to it through the
existing `window.TERRATERM.api` contract. Nothing about TERRATERM's front end changes.

```text
dist/terraterm.html  ──HTTP──▶  services/sam31  ──▶  SAM 3.1 (facebook/sam3.1)
   window.TERRATERM.api          FastAPI + PyTorch        NVIDIA GPU, CUDA 12.6+
```

---

## 1. Getting the model from Hugging Face

`facebook/sam3.1` is a **gated** repo — `gated: "manual"`, so downloads are blocked
until Meta approves your request.

1. Open <https://huggingface.co/facebook/sam3.1>, log in, and fill in the access form
   (name, affiliation, job title, country, and the Meta Privacy Policy consent box).
   Approval is manual, not instant.
2. Create a read token at <https://huggingface.co/settings/tokens>.
3. Authenticate:

   ```bash
   hf auth login          # or: export HF_TOKEN=hf_...
   ```

4. Verify:

   ```bash
   hf download facebook/sam3.1 --include "config.json"
   ```

The repo holds `sam3.1_multiplex.pt` (the weights), `config.json`,
`processor_config.json`, and the tokenizer files. Total repo size is ~7 GB; the
checkpoint itself is ~6.5 GB.

**Licence.** The repo is `license: other` — Meta's *SAM License* (updated 19 Nov 2025),
not MIT. It grants a broad non-exclusive licence but requires you to pass on the same
terms if you redistribute the SAM materials, to acknowledge Meta if you publish
results, and it **prohibits military/warfare and nuclear end uses**. Check it against
your deployment before shipping.

---

## 2. The hardware constraint (read this before planning)

Upstream SAM 3.1 requires:

| Requirement | Why it matters |
|---|---|
| NVIDIA GPU, CUDA 12.6+ | the detector and tracker are CUDA kernels; FlashAttention 3 is on by default |
| PyTorch 2.7+ | `torch.load` weights-only defaults and the fused ops used by the model |
| Python 3.12+ | `sam3` uses 3.12 syntax |

**Apple Silicon does not work.** This machine is an M5 Ultra with no CUDA device, and
upstream does not support MPS for this model. Options:

- Run the service on a Linux box with an NVIDIA GPU (colocated, or a cloud GPU).
- Run it in a container on the same host and point TERRATERM at it over the network.
- For local development without a GPU, use the sibling `facebook/sam3` image model
  instead — see §6.

---

## 3. Install and run the service

```bash
cd services/sam31

conda create -n sam31 python=3.12 && conda activate sam31

# torch first, from the CUDA wheel index
pip install torch==2.7.0 torchvision torchaudio --index-url https://download.pytorch.org/whl/cu126

# the SAM 3 package — git main carries the SAM 3.1 multiplex builder
pip install "git+https://github.com/facebookresearch/sam3.git"

pip install -r requirements.txt

hf auth login

uvicorn server:app --host 0.0.0.0 --port 8000
```

The weights download automatically on first use: `build_sam3_multiplex_video_predictor()`
calls `hf_hub_download(repo_id="facebook/sam3.1", filename="sam3.1_multiplex.pt")`.

Check it came up:

```bash
curl -s localhost:8000/health
```

Point the service at your imagery with `services/sam31/sites.json` — one entry per
TERRATERM site, with the prompts you want SAM to look for:

```json
"ela-segundo-tanks": {
  "name": "El Segundo Tank Farm",
  "short": "EL SEGUNDO",
  "type": "Tank farm",
  "region": "Los Angeles, CA",
  "cls": "energy",
  "sensor": "SAT VHR",
  "gsd": 0.5,
  "prompts": [
    { "text": "storage tank", "cls": "energy", "label": "TK" }
  ],
  "passes": [
    { "id": "p-2026-10-28-0640", "ts": 1790086400000,
      "images": ["https://your-cdn/imagery/ela-segundo/2026-10-28T0640.jpg"] }
  ]
}
```

`gsd` is **metres per pixel** — it is what turns mask pixel area into `area_m2`.

---

## 4. Wire it into TERRATERM

Copy `docs/sam31.adapter.js` and load it before the app scripts (in `src/index.html`)
or paste it above the inlined bundle in `dist/terraterm.html`:

```html
<script src="docs/sam31.adapter.js"></script>
```

The adapter is deliberately thin. It points `imagery()`, `sites()` and `system()` at the
SAM service and leaves market data (`watchlist`, `macro`, `ask`) on your own backend at
`/api`. The service already returns the contract shape, so the browser receives:

```js
{ asOf, site, passes, pass, prior }
```

…with `pass.segments[]` in the exact `Segment` shape from `CONTRACT.md`.

### How a SAM detection becomes a TERRATERM segment

| SAM 3.1 output | TERRATERM field | Note |
|---|---|---|
| `out_binary_masks[i]` | `geom: { t: 'poly', pts }` | mask → largest contour → `cv2.approxPolyDP`, normalized x/width, y/height |
| `out_probs[i]` | `conf` | 0..1, numeric everywhere |
| `out_obj_ids[i]` | `id` | matched across passes by mask IoU so the drawer follows a segment |
| contour pixel area | `area_m2` | `area_px × gsd²` |
| the text prompt | `rule`, `label` | e.g. `SAM 3.1 concept segmentation · prompt "storage tank" · mask score >= 0.50` |
| your prompt config | `cls` | must be `energy` \| `logistics` \| `maritime` \| `industrial` |

`metric` is `{ name: "Segment area", value, unit: " m²", prior, delta, deltaUnit: " m²",
digits: 0 }`. `prior` and `delta` come from the same segment id in the prior pass.

---

## 5. Gotchas

**The metric is area, not fill percentage.** The scaffold backend invents "fill %" and
"Trucks" metrics. SAM 3.1 cannot see tank fill levels — it sees masks. In live mode
TERRATERM never fills gaps with synthetic data, so a live backend should report
segment area and let the rule string say where it came from. If you need fill level,
derive it from the mask itself (shadow ratio, roof geometry) in the service, and say so
in `rule`.

**Imagery must be 16:10.** TERRATERM draws the image edge to edge at 1280×800 with no
letterboxing. Crop or pad to 1600×1000 server-side; another ratio is stretched and the
console names the image.

**`imageUrl` has to be something the browser can fetch.** If your catalog points at an
`http(s)` URL, the service passes it straight through. If it points at a local path (or
the frames come from a video folder), the service stages them and serves them back from
`/frames/{site}/{pass}/{n}.jpg` — set `TERRATERM_PUBLIC_BASE` to the URL the browser
can reach if the service is not on `http://127.0.0.1:8000`. Staged frames live in
`SAM31_FRAME_STORE` (default `$TMPDIR/sam31-frames`) and are swept after
`SAM31_FRAME_TTL` seconds.

**A pass is immutable once served.** The UI caches explicit passes for the session, so
re-segmenting a pass under the same site/id/index is not picked up until reload. Issue
a new pass id when the segmentation changes.

**Segment ids must stay stable across passes.** The service keeps a per-prompt registry
and matches the previous pass by mask IoU (≥ 0.30 by default, `SAM31_MATCH_IOU`). Below
that threshold a segment gets a fresh id, which is correct for something that actually
appeared. If your imagery shifts frame to frame, raise the threshold.

**One prompt per `add_prompt`.** SAM 3.1's session holds one text concept at a time;
switching prompts requires `reset_session` first. The service loops your prompt list
and resets between them, so more prompts cost more passes.

**Sessions expire.** `session_expiration_sec` defaults to 1200. The service opens a
session per request and resets it at the end; long frame sequences still pay full
session setup.

**Segmentation is slow.** A pass takes seconds to tens of seconds on a mid-range GPU.
Results are cached for `SAM31_CACHE_TTL` (900 s) in memory. Cache on disk too if passes
must survive a restart.

**CORS.** The service allows all origins by default. Lock it down with
`allow_origins` before exposing it beyond your workstation.

---

## 6. If you need stills without a GPU

Upstream SAM 3.1 is video-only: `build_sam3_multiplex_video_predictor()` is the 3.1
entry point, and `build_sam3_image_model()` still loads the older `facebook/sam3`
(SAM 3.0) checkpoint.

This service handles stills by staging a single frame as `00000.jpg` and running SAM
3.1 over a one-frame session — correct, but it pays the full video-session cost per
pass. If your imagery is only ever single stills, `facebook/sam3` is the faster tool:

```python
from sam3.model_builder import build_sam3_image_model
from sam3.model.sam3_image_processor import Sam3Processor

model = build_sam3_image_model()          # facebook/sam3
processor = Sam3Processor(model)
state = processor.set_image(image)
output = processor.set_text_prompt(state=state, prompt="storage tank")
masks, boxes, scores = output["masks"], output["boxes"], output["scores"]
```

Swap that into `run_sam31()` in `server.py` and the rest of the pipeline is unchanged —
it only has to return masks, scores and boxes.

---

## 7. Files

| Path | What it is |
|---|---|
| `services/sam31/server.py` | the service: SAM 3.1 wrapper, mask→polygon, TERRATERM payload assembly |
| `services/sam31/sites.json` | site catalog: prompts, GSD, sensor, pass list, image URLs |
| `services/sam31/requirements.txt` | service dependencies (install torch + `sam3` first) |
| `services/sam31/mock_sam_server.py` | the same service against a fake model — no GPU, no weights, for UI work |
| `services/sam31/test_service.py` | contract test: fake SAM, real geometry, asserts the `Segment` shape |
| `services/sam31/test_e2e.mjs` | browser test: mock service → adapter → orbital view renders the polygons |
| `docs/sam31.adapter.js` | `window.TERRATERM.api` adapter wiring the service into the UI |
| `services/sam31/settings_store.py` | local settings: env-over-file resolution, gitignored settings.local.json (0600), status without secret values |
| `services/sam31/parse_sam.mjs` | token-grammar output through the official @meta-sam/parser (mask to SVG path) |
| `src/js/ui/settings.js` | Settings panel: API keys, backend mode, per-provider tests, service URL |

### Developing without a GPU

```bash
cd services/sam31
pip install -r requirements.txt
python mock_sam_server.py        # http://localhost:8000, synthetic imagery + fake SAM
```

Then load `docs/sam31.adapter.js` and open `#/orbital/ela-segundo-tanks`. The status bar
reads `FEED LIVE` and the HUD shows `SAM 3.1 (Object Multiplex) — MOCK`.

### Running the tests

```bash
python services/sam31/test_service.py          # needs fastapi, numpy, opencv, requests, httpx
node services/sam31/test_e2e.mjs                # needs the service deps + `npm install`
```

`test_service.py` stubs `sam3.model_builder` so it runs without the weights, then checks
the payload against `CONTRACT.md`: segment shape, normalized polygon coordinates,
`area_m2` from GSD, and segment ids that stay stable across passes.

`test_e2e.mjs` starts the mock service and the app server, injects the adapter, and
drives the orbital view in Chromium — it asserts the polygons render and writes
`services/sam31/out/e2e-orbital.png`.


## 8. Settings page: API keys and backend config

The app has a SETTINGS button in the status footer (`src/js/ui/settings.js`).
It talks to the SAM service's Settings API and covers everything the app
needs to run live:

| Provider | What it powers | Settings fields |
|---|---|---|
| Meta Model API (SAM 3.1) | tank segmentation from imagery | API key, base URL |
| EIA | weekly Cushing crude stocks | API key, series (default W_EPC0_SAX_YCUOK_MBBL) |
| Copernicus Data Space | Sentinel-2 tiles | username, password |
| Baseten Muse Spark | agent chat only (never segmentation) | API key, base URL, model |
| Backend | mock vs hosted API | mock (default, no calls) or api |

Key handling rules:

- Keys come from environment variables or from `settings.local.json` next
  to `server.py`. Environment wins. The file is gitignored and written
  mode 0600.
- The repo ships with no key values. After pulling on a new machine, open
  Settings, paste the keys, save. Test buttons verify a key without saving
  it; an empty key field on Save leaves the saved value unchanged.
- The Settings API never returns, logs, or echoes a key value: `GET
  /api/settings` reports booleans (configured/missing, env/file) plus
  non-secret config only.
- Backend mode applies immediately: the service reads the effective mode
  per call, so switching mock/api in Settings needs no restart.

Mask decoding (token-grammar output) runs through Meta's official parser:
`services/sam31/parse_sam.mjs` calls `@meta-sam/parser`, declared in the
root `package.json`, so `npm install` at the repo root is required for
live API segmentation. If node or the package is missing, the API path
fails visibly (HTTP 502) instead of substituting mock segments; the
Settings page reports parser readiness.
