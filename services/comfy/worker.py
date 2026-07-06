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
from .workflow import _build_workflow
from .comfyio import _queue_comfy, _wait_comfy, _write_sidecar, _free_comfy_cache
from .queue_state import _queue_lock, get_gen_queue, set_queue_running, broadcast_queue
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
    krea_multiplier = item.get("krea_multiplier") if workflow in ("krea2", "krea2-turbo") else None
    enhancer_strength = item.get("enhancer_strength") if workflow in ("krea2", "krea2-turbo") else None
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
            krea_multiplier=krea_multiplier,
            enhancer_strength=enhancer_strength,
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


from contextlib import asynccontextmanager

# ── Global cooldown task tracker ────────────────────────────────────────────
_cooldown_task: asyncio.Task | None = None


def _cancel_pending_cooldown() -> bool:
    """Cancel any pending reload cooldown task. Returns True if one was cancelled."""
    global _cooldown_task
    if _cooldown_task is not None and not _cooldown_task.done():
        _cooldown_task.cancel()
        # don't await the task here — submit_to_queue is sync and we detach
        # the task will handle CancelledError internally
        _cooldown_task = None
        return True
    _cooldown_task = None  # Clear if already done
    return False


async def check_llama_cpp_idle() -> bool:
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get("http://llm-server:8080/slots", timeout=3)
            if resp.status_code == 200:
                slots = resp.json()
                for slot in slots:
                    if slot.get("state") != 0:
                        return False
                return True
    except Exception as e:
        print(f"[VRAM Swap] Failed to check slots: {e}")
    return True


@asynccontextmanager
async def swap_vram_for_generation(force_generate: bool = False):
    from services.chat_svc import _get_loaded_model
    from services.model_svc import proxy_llm_unload, proxy_llm_load
    from models.requests import ModelActionRequest

    loaded_model = await _get_loaded_model()
    
    if loaded_model and not force_generate:
        idle = False
        for _ in range(30):
            if await check_llama_cpp_idle():
                idle = True
                break
            await asyncio.sleep(1)
            
        if not idle:
            raise RuntimeError("Cannot free VRAM — llama-server is busy processing a chat request.")
            
        print(f"[VRAM Swap] Unloading model: {loaded_model}")
        unload_success = False
        for attempt in range(2):
            try:
                await proxy_llm_unload(ModelActionRequest(model=loaded_model))
                unload_success = True
                break
            except Exception as e:
                print(f"[VRAM Swap] Unload attempt {attempt+1} failed: {e}")
                if attempt == 0:
                    await asyncio.sleep(3)
                    
        if not unload_success:
            raise RuntimeError("Cannot free VRAM — unload request to llama.cpp failed.")
            
    try:
        yield
    finally:
        pass


async def _reload_llama_model(model: str):
    """Reload a llama.cpp model with retry logic."""
    from services.model_svc import proxy_llm_load
    from models.requests import ModelActionRequest

    print(f"[VRAM Swap] Reloading model: {model}")
    reload_success = False
    for attempt in range(2):
        try:
            await proxy_llm_load(ModelActionRequest(model=model))
            reload_success = True
            break
        except Exception as e:
            print(f"[VRAM Swap] Reload attempt {attempt+1} failed: {e}")
            if attempt == 0:
                await asyncio.sleep(3)
    if not reload_success:
        print(f"[VRAM Swap] CRITICAL: Failed to reload model: {model}")


async def _post_queue_cleanup(loaded_model: str):
    """Free ComfyUI VRAM immediately, then wait before reloading llama.cpp model."""
    from utils.common import COMFY_IDLE_COOLDOWN_SECONDS

    # Free ComfyUI VRAM immediately
    freed = await _free_comfy_cache()
    if freed:
        print(f"[VRAM Swap] ComfyUI VRAM freed after generation.")
    else:
        print(f"[VRAM Swap] Warning: Failed to free ComfyUI VRAM.")

    if COMFY_IDLE_COOLDOWN_SECONDS <= 0:
        await _reload_llama_model(loaded_model)
        return

    print(f"[VRAM Swap] Waiting {COMFY_IDLE_COOLDOWN_SECONDS}s before reloading llama.cpp model...")
    try:
        await asyncio.sleep(COMFY_IDLE_COOLDOWN_SECONDS)
    except asyncio.CancelledError:
        print("[VRAM Swap] Cooldown cancelled — new generation request arrived.")
        raise

    await _reload_llama_model(loaded_model)


async def queue_worker(send_push_fn=None):
    """Main async queue worker. Processes generation items one by one.

    Args:
        send_push_fn: Optional callable(title, body) for push notifications.
    """
    global _cooldown_task

    first_item = None
    with _queue_lock:
        for qi in get_gen_queue():
            if qi["status"] == "queued":
                first_item = qi
                break

    force_gen = first_item.get("force_generate", False) if first_item else False

    # Determine which model was loaded before we start, so we can restore it later
    from services.chat_svc import _get_loaded_model
    loaded_model = await _get_loaded_model()

    # Unload llama.cpp model before generation (if applicable)
    try:
        async with swap_vram_for_generation(force_generate=force_gen):
            # Generation loop inside the context manager (model is unloaded here)
            while True:
                item = None
                with _queue_lock:
                    for qi in get_gen_queue():
                        if qi["status"] == "queued":
                            item = qi
                            break
                if item is None:
                    set_queue_running(False)
                    break  # Exit loop, not the function — cleanup happens below

                loop = asyncio.get_running_loop()
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

    except Exception as e:
        print(f"[Queue Worker] Swapping or generation failed: {e}")
        with _queue_lock:
            for qi in get_gen_queue():
                if qi["status"] == "queued":
                    qi["status"] = "error"
                    qi["error"] = f"VRAM Swap failed: {str(e)}"
        await broadcast_queue()
        # If we unloaded a model but generation failed, reload it immediately
        if loaded_model and not force_gen:
            print(f"[Queue Worker] Reloading model after failure: {loaded_model}")
            await _reload_llama_model(loaded_model)
        set_queue_running(False)
        return

    # After the generation loop finishes: free ComfyUI and schedule cooldown reload
    if loaded_model and not force_gen:
        print(f"[Queue Worker] Generation done. Starting cooldown cleanup for {loaded_model}")
        set_queue_running(False)
        _cooldown_task = asyncio.create_task(_post_queue_cleanup(loaded_model))
    else:
        set_queue_running(False)


