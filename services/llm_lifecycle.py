"""LLM server idle-unload lifecycle.

Unloads the loaded model from each llama-server instance after a period of
no inference activity, freeing VRAM per GPU. Mirrors the ComfyUI idle
watchdog pattern in services/comfy/lifecycle.py.

Activity sources:
  - /slots probe (slot processing) — authoritative inference signal
  - touch_activity() from model-load and chat send paths — resets the timer
    immediately so a short request between /slots probes is not missed

Config (env):
  LLM_IDLE_UNLOAD_ENABLED  default "1"  — master switch
  LLM_IDLE_UNLOAD_SECONDS  default "600" — idle timeout before unload
"""
import asyncio
import os
import threading
import time

import httpx

from services.docker_svc import get_server_slots_status
from services.benchmark.state import get_benchmark_running
from services.comfy.queue_state import is_queue_running, get_gen_queue

LLM_IDLE_TIMEOUT_SECONDS = int(os.environ.get("LLM_IDLE_UNLOAD_SECONDS", "600"))
WATCHDOG_INTERVAL = 30.0

_SERVER_URLS = {
    "llama-server": "http://llm-server:8080",
    "llama-server-mini": "http://llm-server-mini:8080",
}

_state_lock = threading.Lock()
_last_activity: dict[str, float] = {name: time.time() for name in _SERVER_URLS}
_watchdog_task: asyncio.Task | None = None


def touch_activity(server: str):
    """Record that inference activity just happened on a server."""
    if server not in _last_activity:
        return
    with _state_lock:
        _last_activity[server] = time.time()


def get_idle_seconds(server: str) -> float:
    with _state_lock:
        return time.time() - _last_activity.get(server, time.time())


def _server_key_from_url(server_url: str) -> str:
    return "llama-server-mini" if "mini" in server_url else "llama-server"


async def _unload_loaded_model(server: str, preset_id: str) -> bool:
    """Unload a model from one llama-server via its /models/unload endpoint."""
    url = _SERVER_URLS.get(server)
    if not url:
        return False
    try:
        async with httpx.AsyncClient(timeout=10) as c:
            resp = await c.post(f"{url}/models/unload", json={"model": preset_id})
        return resp.status_code == 200
    except Exception as e:
        print(f"[LLM Idle] Unload failed for {server} '{preset_id}': {e}")
        return False


async def _llm_idle_watchdog_loop():
    while True:
        try:
            await asyncio.sleep(WATCHDOG_INTERVAL)

            if os.environ.get("LLM_IDLE_UNLOAD_ENABLED", "1") != "1":
                continue

            # Guards: benchmarks and ComfyUI generation manage their own VRAM.
            if get_benchmark_running():
                continue
            if is_queue_running():
                continue
            if any(i.get("status") in ("queued", "running") for i in get_gen_queue()):
                continue

            slots = await get_server_slots_status()
            for info in slots:
                server = info.get("name")
                if server not in _last_activity:
                    continue

                if info.get("processing"):
                    touch_activity(server)
                    continue

                if info.get("error"):
                    continue

                preset_id = info.get("loaded_model")
                if not preset_id:
                    continue

                if get_idle_seconds(server) < LLM_IDLE_TIMEOUT_SECONDS:
                    continue

                print(
                    f"[LLM Idle] {server} idle {LLM_IDLE_TIMEOUT_SECONDS}s — "
                    f"unloading '{preset_id}' to free VRAM"
                )
                ok = await _unload_loaded_model(server, preset_id)
                if ok:
                    print(f"[LLM Idle] {server} unloaded '{preset_id}'")
                else:
                    print(f"[LLM Idle] {server} unload failed for '{preset_id}'")
                touch_activity(server)  # reset so we don't re-fire
        except asyncio.CancelledError:
            break
        except Exception as e:
            print(f"[LLM Idle] Watchdog error: {e}")


def start_llm_idle_watchdog() -> asyncio.Task:
    global _watchdog_task
    if _watchdog_task is None or _watchdog_task.done():
        _watchdog_task = asyncio.create_task(_llm_idle_watchdog_loop())
    return _watchdog_task
