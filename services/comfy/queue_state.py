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


