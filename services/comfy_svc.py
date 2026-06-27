import os
import json
import asyncio
import datetime
import threading
import traceback
import httpx
import websocket as ws_client
from typing import Optional
import uuid

from fastapi import Request
from fastapi.responses import StreamingResponse

from models.requests import GenerateRequest
from utils.common import (
    WORKFLOW_PATH,
    KREA_WORKFLOW_PATH,
    COMFYUI_HOST,
    COMFY_CLIENT_ID,
    NODE_PROMPT_TEXT,
    NODE_RESOLUTION,
    NODE_KSAMPLER,
    NODE_KREA_PROMPT_TEXT,
    NODE_KREA_RESOLUTION,
    NODE_KREA_KSAMPLER,
    MODEL_ZIMAGE,
    MODEL_KREA,
    IMAGE_GEN_OUTPUT,
    _deep_copy,
)

# ───────────────────────────────────────────────
# ComfyUI HTTP client
# ───────────────────────────────────────────────
_COMFY_HTTP = httpx.Client(base_url=f"http://{COMFYUI_HOST}", timeout=60)


def get_comfy_http() -> httpx.Client:
    return _COMFY_HTTP


def set_comfy_http(client):
    global _COMFY_HTTP
    _COMFY_HTTP = client


# ───────────────────────────────────────────────
# Workflow helpers
# ───────────────────────────────────────────────
_workflow_cache: Optional[dict] = None
_workflow_cache_krea: Optional[dict] = None
_workflow_lock = threading.Lock()


def _load_workflow(path: str = WORKFLOW_PATH) -> dict:
    global _workflow_cache, _workflow_cache_krea
    cache = _workflow_cache if path == WORKFLOW_PATH else _workflow_cache_krea
    with _workflow_lock:
        if cache is None:
            with open(path) as f:
                cache = json.load(f)
            if path == WORKFLOW_PATH:
                _workflow_cache = cache
            else:
                _workflow_cache_krea = cache
        return _deep_copy(cache)


def _build_workflow(
    prompt: str,
    resolution: str,
    seed: int,
    queue_id: str,
    img_index: int,
    workflow: str = "zimage",
) -> dict:
    if workflow in ("krea2", "krea2-turbo"):
        wf = _load_workflow(KREA_WORKFLOW_PATH)
        if NODE_KREA_PROMPT_TEXT in wf:
            wf[NODE_KREA_PROMPT_TEXT]["inputs"]["value"] = prompt
        w, h = resolution.split("x")
        if NODE_KREA_RESOLUTION in wf:
            wf[NODE_KREA_RESOLUTION]["inputs"]["width"] = int(w)
            wf[NODE_KREA_RESOLUTION]["inputs"]["height"] = int(h)
        if NODE_KREA_KSAMPLER in wf:
            wf[NODE_KREA_KSAMPLER]["inputs"]["seed"] = seed
        for node in wf.values():
            if isinstance(node, dict) and node.get("class_type") == "SaveImage":
                node["inputs"]["filename_prefix"] = (
                    f"krea2-{queue_id}-{img_index}"
                )
        return wf

    wf = _load_workflow(WORKFLOW_PATH)
    if NODE_PROMPT_TEXT in wf:
        wf[NODE_PROMPT_TEXT]["inputs"]["text"] = prompt
    w, h = resolution.split("x")
    if NODE_RESOLUTION in wf:
        wf[NODE_RESOLUTION]["inputs"]["width"] = int(w)
        wf[NODE_RESOLUTION]["inputs"]["height"] = int(h)
    if NODE_KSAMPLER in wf:
        wf[NODE_KSAMPLER]["inputs"]["seed"] = seed
    for node in wf.values():
        if isinstance(node, dict) and node.get("class_type") == "SaveImage":
            node["inputs"]["filename_prefix"] = f"z-image-{queue_id}-{img_index}"
    return wf


# ComfyUI /free endpoint to unload models and free memory
async def _free_comfy_cache() -> bool:
    """Unload all ComfyUI models and free GPU memory."""
    try:
        # ComfyUI accepts JSON for /free
        resp = _COMFY_HTTP.post(
            "/free",
            json={"unload_models": True, "free_memory": True},
            timeout=60,
        )
        if resp.status_code == 200:
            print("[ComfyUI] /free succeeded")
            return True
        else:
            print(f"[ComfyUI] /free HTTP {resp.status_code}: {resp.text}")
    except Exception as e:
        print(f"[ComfyUI] /free request failed: {e}")
    return False


def _queue_comfy(wf: dict) -> tuple:
    resp = _COMFY_HTTP.post(
        "/prompt", json={"prompt": wf, "client_id": COMFY_CLIENT_ID}
    )
    if resp.status_code != 200:
        raise RuntimeError(
            f"ComfyUI /prompt failed ({resp.status_code}): {resp.text}"
        )
    data = resp.json()
    prompt_id = data["prompt_id"]
    save_nodes = [
        nid
        for nid, n in wf.items()
        if isinstance(n, dict) and n.get("class_type") == "SaveImage"
    ]
    return prompt_id, save_nodes


def _wait_comfy(
    prompt_id: str, on_progress=None, timeout: int = 300
) -> Optional[dict]:
    ws_url = f"ws://{COMFYUI_HOST}/ws?clientId={COMFY_CLIENT_ID}"
    try:
        ws = ws_client.WebSocket()
        ws.settimeout(timeout)
        ws.connect(ws_url)
    except Exception as e:
        print(f"[ComfyUI WS] connect failed: {e}")
        return None
    try:
        while True:
            raw = ws.recv()
            msg = json.loads(raw)
            mtype = msg.get("type")
            data = msg.get("data", {})
            if (
                mtype == "executing"
                and data.get("prompt_id") == prompt_id
            ):
                if data.get("node") is None:
                    ws.close()
                    return _get_comfy_history(prompt_id)
                if on_progress:
                    on_progress("executing", data)
            elif (
                mtype == "progress"
                and data.get("prompt_id") == prompt_id
            ):
                if on_progress:
                    on_progress("progress", data)
    except Exception as e:
        print(f"[ComfyUI WS] error waiting for {prompt_id}: {e}")
    try:
        ws.close()
    except Exception:
        pass
    return None


def _get_comfy_history(prompt_id: str) -> Optional[dict]:
    resp = _COMFY_HTTP.get(f"/history/{prompt_id}", timeout=30)
    if resp.status_code != 200:
        return None
    history = resp.json()
    if prompt_id not in history:
        return None
    images = []
    for _, out in history[prompt_id].get("outputs", {}).items():
        for img in out.get("images", []):
            images.append(
                {
                    "filename": img.get("filename", ""),
                    "subfolder": img.get("subfolder", ""),
                    "type": img.get("type", "output"),
                }
            )
    return {"prompt_id": prompt_id, "images": images} if images else None


def _write_sidecar(
    image_filename: str,
    prompt: str,
    resolution: str,
    seed: int,
    queue_id: str,
    model: str = MODEL_ZIMAGE,
):
    """Write a .json sidecar next to the generated image."""
    base = os.path.splitext(image_filename)[0]
    sidecar_path = os.path.join(IMAGE_GEN_OUTPUT, base + ".json")
    data = {
        "prompt": prompt,
        "resolution": resolution.split("x"),
        "seed": seed,
        "model": model,
        "timestamp": datetime.datetime.utcnow().isoformat() + "Z",
        "generation_id": queue_id,
    }
    try:
        with open(sidecar_path, "w") as f:
            json.dump(data, f, indent=2)
    except Exception as e:
        print(f"[Sidecar] failed to write {sidecar_path}: {e}")


# ───────────────────────────────────────────────
# Queue state
# ───────────────────────────────────────────────
QUEUE_PERSIST_PATH = os.path.join(IMAGE_GEN_OUTPUT, "generation_queue.json")
_queue_lock = threading.Lock()
_gen_queue: list = []
_queue_running = False
_queue_sse_subscribers: list = []


def get_queue_lock():
    return _queue_lock


def get_gen_queue():
    return _gen_queue


def is_queue_running() -> bool:
    return _queue_running


def set_queue_running(value: bool):
    global _queue_running
    _queue_running = value


def get_queue_sse_subscribers():
    return _queue_sse_subscribers


# ───────────────────────────────────────────────
# Queue helpers
# ───────────────────────────────────────────────
def get_queue_snapshot() -> list:
    with _queue_lock:
        return _deep_copy(_gen_queue)


def save_queue_to_disk():
    try:
        snapshot = get_queue_snapshot()
        os.makedirs(IMAGE_GEN_OUTPUT, exist_ok=True)
        with open(QUEUE_PERSIST_PATH, "w") as f:
            json.dump(snapshot, f, indent=2)
    except Exception as e:
        print(f"[Queue Persistence] Failed to save queue: {e}")


def load_persisted_queue() -> bool:
    """Load queue from disk on startup. Returns True if there are queued items."""
    global _gen_queue
    if os.path.exists(QUEUE_PERSIST_PATH):
        try:
            with open(QUEUE_PERSIST_PATH) as f:
                data = json.load(f)
            if isinstance(data, list):
                for item in data:
                    if item.get("status") in ("running", "queued"):
                        item["status"] = "queued"
                        item["progress"] = 0.0
                        item["started_at"] = None
                _gen_queue = data
                print(
                    f"[Queue Persistence] Loaded {len(_gen_queue)} items from disk."
                )
        except Exception as e:
            print(f"[Queue Persistence] Failed to load queue: {e}")
        with _queue_lock:
            return any(item["status"] == "queued" for item in _gen_queue)
    return False


async def broadcast_queue():
    """Push full queue snapshot to all SSE subscribers and persist to disk."""
    snapshot = json.dumps({"queue": get_queue_snapshot()})
    save_queue_to_disk()
    for q in list(_queue_sse_subscribers):
        try:
            await q.put(snapshot)
        except Exception:
            pass


# ───────────────────────────────────────────────
# Queue worker
# ───────────────────────────────────────────────
async def _run_subtask(
    item: dict,
    sub_item: dict,
    sub_index: int,
    total_subs: int,
    loop: asyncio.AbstractEventLoop,
):
    """Run one generation sub-task (single workflow) and update item state."""
    import random

    prompt = item["prompt"]
    resolution = item.get("resolution", "1920x1088")
    workflow = sub_item.get("workflow", "zimage")
    num_images = sub_item.get("num_images", 1)
    seed = sub_item.get("seed")
    image_ids: list = []
    seeds: list = []

    is_seeded = seed is not None and num_images == 1

    for img_index in range(num_images):
        with _queue_lock:
            if item["status"] == "cancelled":
                break
            item["image_num"] = img_index + 1
            item["total_images"] = num_images
            item["current_sub_index"] = sub_index
            item["progress"] = 0.0
        if not is_seeded:
            seed = random.randint(0, (2 ** 63) - 1)
        seeds.append(seed)
        with _queue_lock:
            item["seed"] = seed
            item["seeds"] = seeds
        await broadcast_queue()

        wf = _build_workflow(
            prompt,
            resolution,
            seed,
            item["id"],
            img_index,
            workflow=workflow,
        )

        def on_progress(event_type, event_data):
            if event_type == "progress":
                val = event_data.get("value", 0)
                mx = event_data.get("max", 1)
                pct = round(val / mx, 4) if mx > 0 else 0
                with _queue_lock:
                    item["progress"] = pct
                asyncio.run_coroutine_threadsafe(
                    broadcast_queue(), loop
                )

        prompt_id, _ = _queue_comfy(wf)
        history = await asyncio.to_thread(
            _wait_comfy, prompt_id, on_progress
        )
        with _queue_lock:
            if item["status"] == "cancelled":
                break
            if not history or not history["images"]:
                raise RuntimeError(
                    "ComfyUI returned no images — check ComfyUI logs."
                )
        for img in history["images"]:
            fname = img["filename"]
            image_ids.append(fname)
            _write_sidecar(
                fname,
                prompt,
                resolution,
                seed,
                item["id"],
                model=workflow,
            )
    with _queue_lock:
        if item["status"] != "cancelled":
            item["image_ids"] = item.get("image_ids", []) + image_ids
    return image_ids


async def queue_worker(send_push_fn=None):
    """Main async queue worker. Processes generation items one by one.

    Args:
        send_push_fn: Optional callable(title, body) for push notifications.
    """
    global _queue_running
    while True:
        item = None
        with _queue_lock:
            for qi in _gen_queue:
                if qi["status"] == "queued":
                    item = qi
                    break
        if item is None:
            _queue_running = False
            return

        loop = asyncio.get_running_loop()
        queue_id = item["id"]
        with _queue_lock:
            item["status"] = "running"
            item["started_at"] = datetime.datetime.utcnow().isoformat() + "Z"
        await broadcast_queue()

        try:
            model = item.get("model", MODEL_ZIMAGE)
            if model == "both":
                sub_items = item.get("sub_items", [])
                for idx, sub in enumerate(sub_items):
                    with _queue_lock:
                        item["status"] = "running"
                    await _run_subtask(item, sub, idx, len(sub_items), loop)
                    if idx < len(sub_items) - 1:
                        await _free_comfy_cache()
                        with _queue_lock:
                            item["current_sub_index"] = idx + 1
                            item["progress"] = 0.0
                        await broadcast_queue()
                        await asyncio.sleep(15)
            else:
                sub_item = {
                    "workflow": model,
                    "num_images": item.get("num_images", 1),
                    "seed": item.get("seed"),
                }
                await _run_subtask(item, sub_item, 0, 1, loop)

            with _queue_lock:
                if item["status"] != "cancelled":
                    item["status"] = "completed"
                    item["progress"] = 1.0
                    item["completed_at"] = (
                        datetime.datetime.utcnow().isoformat() + "Z"
                    )
            if send_push_fn:
                send_push_fn(
                    "Image Generation Complete",
                    f"Generated {len(item.get('image_ids', []))} images for: {item['prompt'][:40]}...",
                )
        except Exception as e:
            is_cancelled = False
            with _queue_lock:
                if item["status"] == "cancelled":
                    is_cancelled = True
            if not is_cancelled:
                traceback.print_exc()
                error_msg = str(e).split("\n")[0]
                with _queue_lock:
                    item["status"] = "error"
                    item["error"] = error_msg
                if send_push_fn:
                    send_push_fn(
                        "Image Generation Failed",
                        f"Error: {error_msg} for: {item['prompt'][:40]}...",
                    )
        await broadcast_queue()


# ───────────────────────────────────────────────
# Queue route endpoints (from main.py)
# ───────────────────────────────────────────────
async def submit_to_queue(req: GenerateRequest) -> dict:
    from services.push_svc import send_push

    model = getattr(req, "model", MODEL_ZIMAGE) or MODEL_ZIMAGE
    queue_id = "q" + uuid.uuid4().hex[:8]

    if model == "both":
        sub_items = [
            {
                "workflow": MODEL_KREA,
                "num_images": 1,
                "seed": None,
            },
            {
                "workflow": MODEL_ZIMAGE,
                "num_images": 1,
                "seed": None,
            },
        ]
        item = {
            "id": queue_id,
            "prompt": req.prompt,
            "resolution": req.resolution,
            "num_images": 2,
            "seed": req.seed,
            "model": model,
            "sub_items": sub_items,
            "current_sub_index": 0,
            "status": "queued",
            "image_ids": [],
            "submitted_at": datetime.datetime.utcnow().isoformat() + "Z",
            "started_at": None,
            "completed_at": None,
            "progress": 0.0,
            "image_num": 0,
            "total_images": 2,
            "seeds": [],
        }
    else:
        item = {
            "id": queue_id,
            "prompt": req.prompt,
            "resolution": req.resolution,
            "num_images": max(1, min(req.num_images, 16)),
            "seed": req.seed,
            "model": model,
            "sub_items": [],
            "current_sub_index": 0,
            "status": "queued",
            "image_ids": [],
            "submitted_at": datetime.datetime.utcnow().isoformat() + "Z",
            "started_at": None,
            "completed_at": None,
            "progress": 0.0,
            "image_num": 0,
            "total_images": max(1, min(req.num_images, 16)),
            "seeds": [],
        }

    should_start = not is_queue_running()
    with _queue_lock:
        _gen_queue.append(item)
    await broadcast_queue()
    if should_start:
        set_queue_running(True)
        asyncio.create_task(queue_worker(send_push_fn=send_push))
    return {"queue_id": queue_id, "position": len(_gen_queue)}


def get_queue() -> dict:
    return {"queue": get_queue_snapshot()}


async def cancel_queue_item(queue_id: str) -> dict:
    with _queue_lock:
        for item in _gen_queue:
            if item["id"] == queue_id and item["status"] in (
                "queued",
                "running",
            ):
                if item["status"] == "running":
                    try:
                        _COMFY_HTTP.post("/interrupt")
                    except Exception as e:
                        print(f"[ComfyUI Interrupt] failed: {e}")
                item["status"] = "cancelled"
                break
    await broadcast_queue()
    return {"detail": f"Cancelled {queue_id}"}


async def clear_completed() -> dict:
    with _queue_lock:
        done = {"completed", "error", "cancelled"}
        removable = [i for i in _gen_queue if i["status"] in done]
        for r in removable:
            _gen_queue.remove(r)
    await broadcast_queue()
    return {"detail": f"Cleared {len(removable)} finished items"}


async def stream_queue(request: Request):
    q = asyncio.Queue()
    _queue_sse_subscribers.append(q)

    async def _gen():
        try:
            yield f"event: queue\ndata: {json.dumps({'queue': get_queue_snapshot()})}\n\n"
            while True:
                if await request.is_disconnected():
                    break
                try:
                    payload = await asyncio.wait_for(
                        q.get(), timeout=15
                    )
                    yield f"event: queue\ndata: {payload}\n\n"
                except asyncio.TimeoutError:
                    yield ": keepalive\n\n"
        finally:
            try:
                _queue_sse_subscribers.remove(q)
            except ValueError:
                pass

    return StreamingResponse(_gen(), media_type="text/event-stream")
