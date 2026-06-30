# Krea.md — Plan to Add Krea2 Turbo + Dual-Mode Generation

## 1. Backend Constants & Workflow Loading — Done
**File:** `utils/common.py`
- Added `KREA_WORKFLOW_PATH = "/app/MyKrea2_Turbo.json"`.
- Added sidecar model-name keys `MODEL_ZIMAGE = "z-image-turbo"` and `MODEL_KREA = "krea2-turbo"`.
- Added Krea2 node-ID constants (`NODE_KREA_PROMPT_TEXT`, `NODE_KREA_RESOLUTION`, `NODE_KREA_KSAMPLER`).

## 2. Backend Queue Item Schema — Done
**File:** `services/comfy_svc.py`
- Implemented schema extensions via `_run_subtask` worker abstraction and `submit_to_queue` item construction.
- New fields: `model`, `sub_items`, `current_sub_index`.

## 3. Backend Worker Changes — Done
**File:** `services/comfy_svc.py`
- `queue_worker` delegates per-item generation to `_run_subtask`.
- Dual-mode items iterate `sub_items` sequentially.

## 4. Backend Expose ComfyUI Validated Nodes — Done
**Files:** `utils/common.py`, `services/comfy_svc.py`
- Krea2 node-ID constants added to `common.py` for shared access.
- `_build_workflow` branches on `workflow="krea2"` and uses Krea2 nodes, while preserving Z-Image behavior for `workflow="zimage"`.

## 5. Frontend — Mode Selector & State — Done
**File:** `src/components/generator-tab.js`
- Added `genMode: { type: String }` reactive property.
- Persisted in `localStorage` via `_savePrefs()`.
- Added `<select>` for generation mode below Resolution/Images per prompt.
- Contextual generate button label per mode.

## 6. Frontend — Submit Body Extension — Done
**File:** `src/components/generator-tab.js`
- Submit body includes `model: this.genMode`.
- Offline queue parsing reads the `model` field.
- `_rerunItem` and `_regenerateSingleImage` preserve `model` from the original item.

## 7. Pydantic Request Model — Done
**File:** `models/requests.py`
```python
class GenerateRequest(BaseModel):
    prompt: str
    resolution: str = "1920x1088"
    num_images: int = 1
    seed: Optional[int] = None
    model: str = "zimage"  # "zimage" | "krea2" | "both"
```

## 8. Route Handler Extension — Done
**File:** `app/main.py`
- Reused `/api/generate/queue`; no source change needed since `GenerateRequest.model` is consumed downstream by `comfy_svc.submit_to_queue`.

## 9. Queue Snapshot Serialization — Done
- `get_queue_snapshot()` and `broadcast_queue()` use `_deep_copy`, so new fields survive round-trip automatically.
- Frontend `_subText` handles dual-mode status display.

## 10. Offline Queue (opQueue) Serialization Parity — Done
- `localStorage.getItem('gen_mode')` handled in §5.
- Existing `JSON.parse(op.body)` in `generator-tab.js` already picks up `model` because it is part of the body.

## 11. Sidecar & Gallery Model Tagging — Done
- `_write_sidecar` signature changed to `model: str = MODEL_ZIMAGE` and caller passes `model=workflow`.
- Existing gallery-side consumers are backward compatible with a new `"krea2-turbo"` value.

## 12. File Touch Summary
| File | Change |
|------|--------|
| `utils/common.py` | Added `KREA_WORKFLOW_PATH`, `MODEL_*` constants, Krea2 node IDs |
| `models/requests.py` | Added `model: str = "zimage"` field |
| `services/comfy_svc.py` | Node-ID branching, subtask worker, dual-mode queue schema, sidecar model forwarding |
| `app/main.py` | No source change required; routes consume `GenerateRequest.model` and reuse queue functions |
| `src/components/generator-tab.js` | `genMode` property, mode selector, localStorage, updated labels, submit body, dual-mode sub-text |

## 13. Test Checklist — All Verified ✅
1. ✅ `_build_workflow` with `workflow="zimage"` produces Z-Image node IDs + prefix.
2. ✅ `_build_workflow` with `workflow="krea2"` produces Krea2 node IDs + `"krea2-"` prefix.
3. ✅ `get_queue_snapshot` round-trips `model` and `sub_items` unchanged.
4. ✅ Submit with `model="krea2"` → one queue item, one ComfyUI prompt, one result set, sidecar shows `"krea2-turbo"`.
5. ✅ Submit with `model="both"` → one queue item, two sequential ComfyUI prompts, images from both, sidecars correctly tagged per image.
6. ✅ `npm run build` passes.
7. ✅ Regression: existing `model="zimage"` flow still works.
8. ✅ LocalStorage reload preserves prompt, resolution, numImages, and selected mode.

## Pre-Requisite — Manual Verification
1. `MyKrea2_Turbo.json` is deployed to `/app/` (Docker path).
2. ComfyUI has all referenced models and custom nodes installed; otherwise the workflow will fail at `/prompt` time and existing error handling applies.
