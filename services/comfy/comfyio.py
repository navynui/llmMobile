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
        "/prompt", json={"prompt": wf, "client_id": COMFY_CLIENT_ID}, timeout=120.0
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
            # Skip binary frames (preview images from custom nodes)
            if isinstance(raw, bytes):
                continue
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


def _upload_comfy_image(file_bytes: bytes, filename: str) -> str | None:
    """Upload an image to ComfyUI's input directory. Returns the saved filename."""
    try:
        files = {
            "image": (filename, file_bytes, "image/png"),
        }
        data = {
            "type": "input",
            "overwrite": "True",
        }
        resp = _COMFY_HTTP.post("/upload/image", files=files, data=data, timeout=60)
        if resp.status_code == 200:
            data = resp.json()
            saved_name = data.get("name", filename)
            print(f"[ComfyUI] Uploaded image: {saved_name}")
            return saved_name
        else:
            print(f"[ComfyUI] Upload image failed ({resp.status_code}): {resp.text}")
    except Exception as e:
        print(f"[ComfyUI] Upload image error: {e}")
    return None


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


