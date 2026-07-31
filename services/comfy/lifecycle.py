"""ComfyUI container lifecycle management.

Handles on-demand start/stop of the ComfyUI docker container, HTTP readiness
probing, generation-activity tracking, and an idle watchdog that shuts ComfyUI
down after a period of no image-generation activity.

The llm-mobile container mounts the host docker socket, so we can start/stop
the `comfyui` container directly via the Docker SDK (equivalent to
`docker compose up -d` / `down` in /home/nui/dev/comfyui-container).
"""
import asyncio
import datetime
import threading
import time

from fastapi import HTTPException

from services.docker_svc import get_docker_client, _container_info
from .client import get_comfy_http

COMFY_CONTAINER = "comfyui"
IDLE_TIMEOUT_SECONDS = 600        # 10 minutes without generation activity
READY_TIMEOUT_SECONDS = 180       # max wait for ComfyUI to become HTTP-ready
READY_POLL_INTERVAL = 2.0
WATCHDOG_INTERVAL = 30.0

_state_lock = threading.Lock()
_last_activity: float = time.time()
_watchdog_task: asyncio.Task | None = None


# ───────────────────────────────────────────────
# Activity tracking
# ───────────────────────────────────────────────
def touch_activity():
    """Record that image-generation activity just happened (submit or completion)."""
    global _last_activity
    with _state_lock:
        _last_activity = time.time()


def get_idle_seconds() -> float:
    with _state_lock:
        return time.time() - _last_activity


# ───────────────────────────────────────────────
# Container + HTTP helpers
# ───────────────────────────────────────────────
def _container_status() -> str:
    """Return docker container state: running | exited | created | paused | not_found | error."""
    client = get_docker_client()
    if not client:
        return "error"
    try:
        c = client.containers.get(COMFY_CONTAINER)
        return c.status
    except Exception:
        return "not_found"


def _comfy_http_ready() -> bool:
    """True when ComfyUI's HTTP API answers /system_stats with 200."""
    try:
        resp = get_comfy_http().get("/system_stats", timeout=3)
        return resp.status_code == 200
    except Exception:
        return False


def get_comfy_status() -> dict:
    """Aggregate status used by the Generator tab and the idle watchdog.

    status: off | starting | ready | error
    """
    state = _container_status()
    info = _container_info(COMFY_CONTAINER)

    if state == "running":
        status = "ready" if _comfy_http_ready() else "starting"
    elif state in ("exited", "created", "paused", "dead", "not_found"):
        status = "off"
    else:
        status = "error"

    idle_seconds = get_idle_seconds()
    return {
        "status": status,
        "container_state": state,
        "uptime": info.get("uptime"),
        "last_activity": (
            datetime.datetime.utcfromtimestamp(_last_activity).isoformat() + "Z"
        ),
        "idle_seconds": round(idle_seconds, 1),
        "auto_stop_in": (
            round(max(0.0, IDLE_TIMEOUT_SECONDS - idle_seconds), 1)
            if state == "running"
            else 0.0
        ),
    }


# ───────────────────────────────────────────────
# Manual start / stop
# ───────────────────────────────────────────────
def start_comfy() -> dict:
    client = get_docker_client()
    if not client:
        raise HTTPException(status_code=500, detail="Docker client not initialized.")
    try:
        c = client.containers.get(COMFY_CONTAINER)
    except Exception:
        raise HTTPException(
            status_code=500,
            detail="ComfyUI container not found — create it with `docker compose up -d` in /home/nui/dev/comfyui-container first.",
        )
    if c.status == "running":
        touch_activity()
        return {"detail": "ComfyUI is already running.", "status": get_comfy_status()["status"]}
    c.start()
    touch_activity()
    print("[ComfyUI Lifecycle] ComfyUI container started on demand.")
    return {"detail": "ComfyUI starting…", "status": "starting"}


def stop_comfy() -> dict:
    client = get_docker_client()
    if not client:
        raise HTTPException(status_code=500, detail="Docker client not initialized.")
    try:
        c = client.containers.get(COMFY_CONTAINER)
    except Exception:
        return {"detail": "ComfyUI is not running.", "status": "off"}
    if c.status != "running":
        return {"detail": "ComfyUI is not running.", "status": "off"}
    c.stop(timeout=30)
    print("[ComfyUI Lifecycle] ComfyUI container stopped.")
    return {"detail": "ComfyUI stopped.", "status": "off"}


# ───────────────────────────────────────────────
# Auto-start + readiness (used by the queue worker)
# ───────────────────────────────────────────────
async def ensure_comfy_ready() -> dict:
    """Ensure the ComfyUI container is running and HTTP-ready.

    Starts the container if it is stopped, then polls /system_stats until it
    responds. Raises RuntimeError if ComfyUI cannot be made ready.
    """
    state = _container_status()

    if state == "running" and await asyncio.to_thread(_comfy_http_ready):
        touch_activity()
        return {"status": "ready", "started": False}

    started = False
    if state == "running":
        # Already booting — just wait for readiness.
        pass
    elif state in ("exited", "created", "paused", "dead", "not_found"):
        client = get_docker_client()
        if not client:
            raise RuntimeError("Docker client not initialized.")
        try:
            c = client.containers.get(COMFY_CONTAINER)
        except Exception:
            raise RuntimeError(
                "ComfyUI container not found — create it with `docker compose up -d` in /home/nui/dev/comfyui-container first."
            )
        if c.status != "running":
            await asyncio.to_thread(c.start)
            started = True
            print("[ComfyUI Lifecycle] Auto-started ComfyUI container for generation.")
    else:
        raise RuntimeError(f"ComfyUI is in an unexpected state: {state}")

    deadline = time.time() + READY_TIMEOUT_SECONDS
    while time.time() < deadline:
        if await asyncio.to_thread(_comfy_http_ready):
            touch_activity()
            print("[ComfyUI Lifecycle] ComfyUI is ready.")
            return {"status": "ready", "started": started}
        await asyncio.sleep(READY_POLL_INTERVAL)

    raise RuntimeError(
        f"ComfyUI did not become ready within {READY_TIMEOUT_SECONDS}s. Check the comfyui container logs."
    )


# ───────────────────────────────────────────────
# Idle watchdog — auto-shutdown after 10 min idle
# ───────────────────────────────────────────────
async def _idle_watchdog_loop():
    from .queue_state import get_gen_queue, is_queue_running

    while True:
        try:
            await asyncio.sleep(WATCHDOG_INTERVAL)
            if _container_status() != "running":
                continue
            if is_queue_running():
                continue
            if any(i.get("status") in ("queued", "running") for i in get_gen_queue()):
                continue
            if get_idle_seconds() < IDLE_TIMEOUT_SECONDS:
                continue

            print("[ComfyUI Lifecycle] No generation activity for 10 minutes — stopping ComfyUI.")
            client = get_docker_client()
            if not client:
                continue
            try:
                c = client.containers.get(COMFY_CONTAINER)
                # docker SDK 7.x: Container.stop() only accepts keyword args
                await asyncio.to_thread(lambda: c.stop(timeout=30))
                print("[ComfyUI Lifecycle] ComfyUI stopped by idle watchdog.")
            except Exception as e:
                print(f"[ComfyUI Lifecycle] Failed to stop ComfyUI: {e}")
        except asyncio.CancelledError:
            break
        except Exception as e:
            print(f"[ComfyUI Lifecycle] Watchdog error: {e}")


def start_idle_watchdog() -> asyncio.Task:
    """Start the idle watchdog task once (idempotent)."""
    global _watchdog_task
    if _watchdog_task is None or _watchdog_task.done():
        _watchdog_task = asyncio.create_task(_idle_watchdog_loop())
    return _watchdog_task
