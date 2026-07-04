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
from .client import _COMFY_HTTP
from .queue_state import _queue_lock, _gen_queue, is_queue_running, set_queue_running, get_queue_snapshot, broadcast_queue, _queue_sse_subscribers
from .worker import queue_worker, _cancel_pending_cooldown
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
            "force_generate": getattr(req, "force_generate", False) or False,
            "krea_multiplier": req.krea_multiplier,
            "enhancer_strength": req.enhancer_strength,
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
            "force_generate": getattr(req, "force_generate", False) or False,
            "krea_multiplier": req.krea_multiplier if model in ("krea2", "krea2-turbo") else None,
            "enhancer_strength": req.enhancer_strength if model in ("krea2", "krea2-turbo") else None,
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

    # Cancel any pending cooldown reload if new generation arrives mid-cooldown
    cancelled = _cancel_pending_cooldown()
    if cancelled:
        print("[Queue] New generation request arrived during cooldown — cancelling pending llama.cpp reload.")

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
