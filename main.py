import os
import re
import glob
import json
import time
import uuid
import shutil
import asyncio
import datetime
import subprocess
import threading
import urllib.parse
import psutil
import docker
import httpx
import paho.mqtt.client as mqtt
import websocket as ws_client
from typing import Optional, List, Dict, Any
from pydantic import BaseModel
from fastapi import FastAPI, HTTPException, Request, Response, BackgroundTasks
from fastapi.responses import HTMLResponse, StreamingResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

try:
    from pywebpush import webpush, WebPushException
    HAS_WEBPUSH = True
except ImportError:
    HAS_WEBPUSH = False

app = FastAPI(title="LLM Mobile Manager")

# --- Constants ---
MODELS_DIR          = "/models"
IMAGE_GEN_OUTPUT    = "/comfyui-output"
WORKFLOW_PATH       = "/app/MyZimage_turbo.json"
PROMPTS_FILE        = "/app/PROMPTS"
LLM_PROJECT_NAME    = os.environ.get("LLM_PROJECT_NAME", "llmacpp")
LLM_COMPOSE_DIR     = os.environ.get("LLM_COMPOSE_DIR", "/llm-server")
COMFYUI_HOST        = os.environ.get("COMFYUI_HOST", "host.docker.internal:8188")
COMFY_CLIENT_ID     = "llm-mobile"

# --- Push Notification Globals ---
VAPID_PUBLIC_KEY = ""
VAPID_PRIVATE_KEY = ""
VAPID_KEYS_FILE = os.path.join(IMAGE_GEN_OUTPUT, "vapid_keys.json")
_push_subscriptions = []
SUBS_FILE_PATH = os.path.join(IMAGE_GEN_OUTPUT, "push_subscriptions.json")
QUEUE_PERSIST_PATH = os.path.join(IMAGE_GEN_OUTPUT, "generation_queue.json")

# ComfyUI workflow node IDs (MyZimage_turbo.json layout)
NODE_PROMPT_TEXT    = "57:27"   # CLIPTextEncode → .inputs.text
NODE_RESOLUTION     = "57:13"   # EmptySD3LatentImage → .inputs.width / height
NODE_KSAMPLER       = "57:3"    # KSampler → .inputs.seed

VRAM_CRITICAL_THRESHOLD  = 90.0
VRAM_EMERGENCY_THRESHOLD = 95.0

os.makedirs(IMAGE_GEN_OUTPUT, exist_ok=True)

# --- Docker client ---
try:
    docker_client = docker.DockerClient(base_url="unix://var/run/docker.sock")
except Exception as e:
    docker_client = None
    print(f"Error connecting to Docker socket: {e}")

# --- HTTP client for ComfyUI ---
_COMFY_HTTP = httpx.Client(base_url=f"http://{COMFYUI_HOST}", timeout=60)

# --- Telemetry cache ---
_stats_cache: dict = {"data": {
    "cpu_temp": 0.0, "cpu_util": 0.0, "ram_percent": 0.0,
    "gpu_temp": 0.0, "gpu_util": 0.0, "vram_percent": 0.0,
    "storage_percent": 0.0, "storage_used_gb": 0.0,
    "storage_total_gb": 0.0, "storage_free_gb": 0.0,
}}
_stats_lock = threading.Lock()
last_mqtt_update_time: float = 0.0

MQTT_CONFIG = {
    "broker": "192.168.31.182",
    "user": "mqttuser",
    "pass": "mqttpass",
    "topics": {
        "home/129/sensor/cpu_temp":               "cpu_temp",
        "home/129/sensor/tesla_p100_temp":        "gpu_temp",
        "home/129/sensor/cpu_utilization":        "cpu_util",
        "home/129/sensor/ram_utilization":        "ram_percent",
        "home/129/sensor/vram_utilization":       "vram_percent",
        "home/129/sensor/gpu_utilization":        "gpu_util",
        "home/129/sensor/disk_utilization_root":  "storage_percent",
    },
}

# ───────────────────────────────────────────────
# Queue state (in-memory, Phase 2 server-side)
# ───────────────────────────────────────────────
_queue_lock = threading.Lock()
_gen_queue: list = []          # list of queue-item dicts
_queue_running = False         # True while a worker is processing
_queue_sse_subscribers: list = []   # async queues for /events/queue SSE fans

_workflow_cache: Optional[dict] = None
_workflow_lock = threading.Lock()

# ───────────────────────────────────────────────
# Helpers
# ───────────────────────────────────────────────

def safe_join(base_dir: str, *path_parts: str) -> str:
    resolved_base = os.path.realpath(base_dir)
    target = os.path.realpath(os.path.join(resolved_base, *path_parts))
    if not target.startswith(resolved_base):
        raise HTTPException(status_code=400, detail="Access denied (outside root folder)")
    return target

def _deep_copy(d: dict) -> dict:
    return json.loads(json.dumps(d))


# ───────────────────────────────────────────────
# Telemetry – local polling fallback
# ───────────────────────────────────────────────

def get_local_stats() -> dict:
    stats: dict = {}
    stats["cpu_util"] = psutil.cpu_percent()
    ram = psutil.virtual_memory()
    stats["ram_percent"] = ram.percent
    try:
        usage = psutil.disk_usage("/")
        stats["storage_percent"]  = usage.percent
        stats["storage_used_gb"]  = round(usage.used  / (1024 ** 3), 1)
        stats["storage_total_gb"] = round(usage.total / (1024 ** 3), 1)
        stats["storage_free_gb"]  = round(usage.free  / (1024 ** 3), 1)
    except Exception:
        pass
    try:
        temps = psutil.sensors_temperatures()
        if "coretemp" in temps:
            stats["cpu_temp"] = temps["coretemp"][0].current
        elif temps:
            stats["cpu_temp"] = list(temps.values())[0][0].current
    except Exception:
        pass
    try:
        res = subprocess.run(
            ["nvidia-smi", "--query-gpu=temperature.gpu,utilization.gpu,memory.used,memory.total",
             "--format=csv,noheader,nounits"],
            capture_output=True, text=True, timeout=2,
        )
        if res.returncode == 0:
            parts = res.stdout.strip().split(",")
            if len(parts) >= 4:
                stats["gpu_temp"]     = float(parts[0].strip())
                stats["gpu_util"]     = float(parts[1].strip())
                used  = float(parts[2].strip())
                total = float(parts[3].strip())
                if total > 0:
                    stats["vram_percent"] = round((used / total) * 100, 1)
    except Exception:
        pass
    return stats


def _on_mqtt_message(client, userdata, msg):
    global last_mqtt_update_time
    try:
        val = float(msg.payload.decode())
        key = MQTT_CONFIG["topics"].get(msg.topic)
        if key:
            with _stats_lock:
                _stats_cache["data"][key] = val
            last_mqtt_update_time = time.time()
    except Exception as e:
        print(f"MQTT Parse Error: {e}")


def _start_mqtt_listener():
    try:
        client = mqtt.Client()
        client.on_message = _on_mqtt_message
        client.username_pw_set(MQTT_CONFIG["user"], MQTT_CONFIG["pass"])
        client.connect(MQTT_CONFIG["broker"], 1883, 60)
        for topic in MQTT_CONFIG["topics"]:
            client.subscribe(topic)
        client.loop_start()
        print("MQTT Telemetry Listener started.")
    except Exception as e:
        print(f"MQTT Connection Error: {e}")


async def _local_stats_poller():
    while True:
        try:
            if time.time() - last_mqtt_update_time > 5.0:
                local = get_local_stats()
                with _stats_lock:
                    _stats_cache["data"].update(local)
        except Exception as e:
            print(f"Stats poller error: {e}")
        await asyncio.sleep(2)


# ───────────────────────────────────────────────
# Startup
# ───────────────────────────────────────────────

@app.on_event("startup")
async def startup_event():
    _start_mqtt_listener()
    asyncio.create_task(_local_stats_poller())
    _init_vapid_keys()
    _load_subscriptions()
    _load_persisted_queue()
    # Resume queue worker if there are pending jobs
    global _queue_running
    has_queued = False
    with _queue_lock:
        if any(item["status"] == "queued" for item in _gen_queue):
            has_queued = True
    if has_queued and not _queue_running:
        _queue_running = True
        asyncio.create_task(_queue_worker())


# ───────────────────────────────────────────────
# Container / system status helpers
# ───────────────────────────────────────────────

def _container_info(name: str) -> dict:
    try:
        container = None
        try:
            container = docker_client.containers.get(name)
        except docker.errors.NotFound:
            containers = docker_client.containers.list(all=True, filters={"name": name})
            if containers:
                container = containers[0]
        if not container:
            return {"status": "not_found", "image": None, "uptime": None}
        status = container.status
        image  = container.image.tags[0] if container.image.tags else container.image.id
        started_str = container.attrs.get("State", {}).get("StartedAt", "")
        uptime = None
        if status == "running" and started_str:
            try:
                t = started_str.split(".")[0].rstrip("Z")
                delta = datetime.datetime.utcnow() - datetime.datetime.fromisoformat(t)
                uptime = str(delta).split(".")[0]
            except Exception:
                uptime = started_str
        return {"status": status, "image": image, "uptime": uptime}
    except Exception:
        return {"status": "error", "image": None, "uptime": None}


# ───────────────────────────────────────────────
# REST endpoints – server control
# ───────────────────────────────────────────────

@app.get("/status")
def get_status():
    if not docker_client:
        raise HTTPException(status_code=500, detail="Docker client not initialized.")
    return {"server": _container_info("llm-server"), "manager": _container_info("llm-mobile")}


@app.get("/system_stats")
def get_system_stats():
    with _stats_lock:
        return dict(_stats_cache["data"])


@app.post("/start")
def start_llm():
    if not os.path.exists(LLM_COMPOSE_DIR):
        raise HTTPException(status_code=400, detail=f"Compose dir '{LLM_COMPOSE_DIR}' not found.")
    result = subprocess.run(
        ["docker", "compose", "-p", LLM_PROJECT_NAME, "up", "-d", "--no-build", "llama-server"],
        cwd=LLM_COMPOSE_DIR, capture_output=True, text=True,
    )
    if result.returncode != 0:
        raise HTTPException(status_code=500, detail=result.stderr)
    return {"detail": "Started llm-server"}


@app.post("/stop")
def stop_llm():
    if not docker_client:
        raise HTTPException(status_code=500, detail="Docker client not initialized.")
    try:
        c = docker_client.containers.get("llm-server")
        c.stop(); c.remove()
        return {"detail": "Stopped llm-server"}
    except docker.errors.NotFound:
        return {"detail": "llm-server is not running."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ───────────────────────────────────────────────
# REST endpoints – model management
# ───────────────────────────────────────────────

@app.get("/models")
def list_models():
    if not os.path.exists(MODELS_DIR):
        return {"models": []}
    return {"models": [os.path.basename(f) for f in glob.glob(os.path.join(MODELS_DIR, "*.gguf"))]}


@app.delete("/models/{filename}")
def delete_model(filename: str):
    if not filename.endswith(".gguf") or "/" in filename or "\\" in filename:
        raise HTTPException(status_code=400, detail="Invalid filename")
    path = os.path.join(MODELS_DIR, filename)
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="File not found")
    os.remove(path)
    return {"detail": f"Deleted {filename}"}


@app.get("/api/llm/models")
async def proxy_llm_models():
    async with httpx.AsyncClient() as c:
        try:
            return (await c.get("http://llm-server:8080/models", timeout=5)).json()
        except Exception as e:
            raise HTTPException(status_code=502, detail=str(e))


class ModelActionRequest(BaseModel):
    model: str


@app.post("/api/llm/models/load")
async def proxy_llm_load(req: ModelActionRequest):
    async with httpx.AsyncClient() as c:
        try:
            return (await c.post("http://llm-server:8080/models/load", json={"model": req.model}, timeout=30)).json()
        except Exception as e:
            raise HTTPException(status_code=502, detail=str(e))


@app.post("/api/llm/models/unload")
async def proxy_llm_unload(req: ModelActionRequest):
    async with httpx.AsyncClient() as c:
        try:
            return (await c.post("http://llm-server:8080/models/unload", json={"model": req.model}, timeout=10)).json()
        except Exception as e:
            raise HTTPException(status_code=502, detail=str(e))


# ───────────────────────────────────────────────
# REST endpoints – chat
# ───────────────────────────────────────────────

async def _get_loaded_model() -> Optional[str]:
    try:
        async with httpx.AsyncClient() as c:
            data = (await c.get("http://llm-server:8080/models", timeout=3)).json()
            for m in data.get("data", []):
                s = m.get("status")
                if s == "loaded" or (isinstance(s, dict) and s.get("value") == "loaded"):
                    return m.get("id")
    except Exception:
        pass
    return None


@app.post("/api/chat/completions")
async def proxy_chat(request: Request):
    body = await request.body()
    try:
        data = json.loads(body) if body else {}
    except Exception:
        data = {}
    if not str(data.get("model", "")).strip():
        data["model"] = await _get_loaded_model() or "default"
    body = json.dumps(data).encode()

    async def _stream():
        async with httpx.AsyncClient(timeout=httpx.Timeout(None, connect=10.0)) as c:
            try:
                async with c.stream("POST", "http://llm-server:8080/v1/chat/completions",
                                    content=body, headers={"Content-Type": "application/json"}) as r:
                    async for chunk in r.aiter_bytes():
                        yield chunk
            except Exception as e:
                yield json.dumps({"error": {"message": str(e), "type": "proxy_error"}}).encode()

    return StreamingResponse(_stream(), media_type="text/event-stream")


# ───────────────────────────────────────────────
# SSE – /events/status
# ───────────────────────────────────────────────

@app.get("/events/status")
async def stream_status(request: Request, since: str = "0"):
    last_id_hdr = request.headers.get("last-event-id") or since
    counter = int(last_id_hdr) if last_id_hdr.isdigit() else 0

    async def _gen():
        nonlocal counter
        while True:
            if await request.is_disconnected():
                break
            counter += 1
            with _stats_lock:
                stats = dict(_stats_cache["data"])
            try:
                status = get_status()
            except Exception:
                status = {}
            payload = json.dumps({"stats": stats, "status": status,
                                  "timestamp": datetime.datetime.utcnow().isoformat() + "Z"})
            yield f"id: {counter}\nevent: stats\nretry: 3000\ndata: {payload}\n\n"
            await asyncio.sleep(2)

    return StreamingResponse(_gen(), media_type="text/event-stream")


# ───────────────────────────────────────────────
# ComfyUI helpers
# ───────────────────────────────────────────────

def _load_workflow() -> dict:
    global _workflow_cache
    with _workflow_lock:
        if _workflow_cache is None:
            with open(WORKFLOW_PATH) as f:
                _workflow_cache = json.load(f)
        return _deep_copy(_workflow_cache)


def _build_workflow(prompt: str, resolution: str, seed: int, queue_id: str, img_index: int) -> dict:
    wf = _load_workflow()
    if NODE_PROMPT_TEXT in wf:
        wf[NODE_PROMPT_TEXT]["inputs"]["text"] = prompt
    w, h = resolution.split("x")
    if NODE_RESOLUTION in wf:
        wf[NODE_RESOLUTION]["inputs"]["width"]  = int(w)
        wf[NODE_RESOLUTION]["inputs"]["height"] = int(h)
    if NODE_KSAMPLER in wf:
        wf[NODE_KSAMPLER]["inputs"]["seed"] = seed
    for node in wf.values():
        if isinstance(node, dict) and node.get("class_type") == "SaveImage":
            node["inputs"]["filename_prefix"] = f"z-image-{queue_id}-{img_index}"
    return wf


def _queue_comfy(wf: dict) -> tuple[str, list]:
    resp = _COMFY_HTTP.post("/prompt", json={"prompt": wf, "client_id": COMFY_CLIENT_ID})
    if resp.status_code != 200:
        raise RuntimeError(f"ComfyUI /prompt failed ({resp.status_code}): {resp.text}")
    data = resp.json()
    prompt_id = data["prompt_id"]
    save_nodes = [nid for nid, n in wf.items()
                  if isinstance(n, dict) and n.get("class_type") == "SaveImage"]
    return prompt_id, save_nodes


def _wait_comfy(prompt_id: str, on_progress=None, timeout: int = 300) -> Optional[dict]:
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
            data  = msg.get("data", {})
            if mtype == "executing" and data.get("prompt_id") == prompt_id:
                if data.get("node") is None:
                    ws.close()
                    return _get_comfy_history(prompt_id)
                if on_progress:
                    on_progress("executing", data)
            elif mtype == "progress" and data.get("prompt_id") == prompt_id:
                if on_progress:
                    on_progress("progress", data)
    except Exception as e:
        print(f"[ComfyUI WS] error waiting for {prompt_id}: {e}")
        try: ws.close()
        except Exception: pass
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
            images.append({"filename": img.get("filename", ""),
                           "subfolder": img.get("subfolder", ""),
                           "type": img.get("type", "output")})
    return {"prompt_id": prompt_id, "images": images} if images else None


def _write_sidecar(image_filename: str, prompt: str, resolution: str,
                   seed: int, queue_id: str, model: str = "z-image-turbo"):
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


async def _broadcast_queue():
    """Push full queue snapshot to all SSE subscribers."""
    snapshot = json.dumps({"queue": _get_queue_snapshot()})
    _save_queue_to_disk()
    for q in list(_queue_sse_subscribers):
        try:
            await q.put(snapshot)
        except Exception:
            pass


def _get_queue_snapshot() -> list:
    with _queue_lock:
        return _deep_copy(_gen_queue)


def _load_persisted_queue():
    global _gen_queue
    if os.path.exists(QUEUE_PERSIST_PATH):
        try:
            with open(QUEUE_PERSIST_PATH) as f:
                data = json.load(f)
                if isinstance(data, list):
                    # Sanitize state at startup
                    for item in data:
                        if item.get("status") in ("running", "queued"):
                            item["status"] = "queued"
                            item["progress"] = 0.0
                            item["started_at"] = None
                    _gen_queue = data
                    print(f"[Queue Persistence] Loaded {len(_gen_queue)} items from disk.")
        except Exception as e:
            print(f"[Queue Persistence] Failed to load queue: {e}")


def _save_queue_to_disk():
    try:
        snapshot = _get_queue_snapshot()
        os.makedirs(IMAGE_GEN_OUTPUT, exist_ok=True)
        with open(QUEUE_PERSIST_PATH, "w") as f:
            json.dump(snapshot, f, indent=2)
    except Exception as e:
        print(f"[Queue Persistence] Failed to save queue: {e}")


def _init_vapid_keys():
    global VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY
    if os.path.exists(VAPID_KEYS_FILE):
        try:
            with open(VAPID_KEYS_FILE) as f:
                data = json.load(f)
                VAPID_PUBLIC_KEY = data.get("public_key")
                VAPID_PRIVATE_KEY = data.get("private_key")
        except Exception:
            pass
            
    if not VAPID_PUBLIC_KEY or not VAPID_PRIVATE_KEY:
        if HAS_WEBPUSH:
            try:
                from cryptography.hazmat.primitives.asymmetric import ec
                from cryptography.hazmat.primitives import serialization
                import base64
                
                private_key = ec.generate_private_key(ec.SECP256R1())
                private_der = private_key.private_bytes(
                    encoding=serialization.Encoding.DER,
                    format=serialization.PrivateFormat.PKCS8,
                    encryption_algorithm=serialization.NoEncryption()
                )
                
                public_key = private_key.public_key()
                public_bytes = public_key.public_bytes(
                    encoding=serialization.Encoding.X962,
                    format=serialization.PublicFormat.UncompressedPoint
                )
                
                VAPID_PUBLIC_KEY = base64.urlsafe_b64encode(public_bytes).decode().rstrip("=")
                VAPID_PRIVATE_KEY = base64.urlsafe_b64encode(private_der).decode().rstrip("=")
                
                os.makedirs(IMAGE_GEN_OUTPUT, exist_ok=True)
                with open(VAPID_KEYS_FILE, "w") as f:
                    json.dump({"public_key": VAPID_PUBLIC_KEY, "private_key": VAPID_PRIVATE_KEY}, f)
                print("[VAPID] Generated and saved new VAPID keys.")
            except Exception as e:
                # Use a fallback key if generation fails (e.g. cryptography package missing)
                print(f"[VAPID] Failed to generate VAPID keys programmatically: {e}. Using dev-fallback.")
                VAPID_PUBLIC_KEY = "BEl6mABClg1401306C9V8t-mC9c-L6121401306C9V8t-mC9c-L6121401306C"
                VAPID_PRIVATE_KEY = "DEV_FALLBACK_KEY"
        else:
            print("[VAPID] WebPush not available. Using dev-fallback keys.")
            VAPID_PUBLIC_KEY = "BEl6mABClg1401306C9V8t-mC9c-L6121401306C9V8t-mC9c-L6121401306C"
            VAPID_PRIVATE_KEY = "DEV_FALLBACK_KEY"


def _load_subscriptions():
    global _push_subscriptions
    if os.path.exists(SUBS_FILE_PATH):
        try:
            with open(SUBS_FILE_PATH) as f:
                _push_subscriptions = json.load(f)
        except Exception:
            _push_subscriptions = []


def _save_subscriptions():
    try:
        os.makedirs(IMAGE_GEN_OUTPUT, exist_ok=True)
        with open(SUBS_FILE_PATH, "w") as f:
            json.dump(_push_subscriptions, f)
    except Exception:
        pass


def _send_push_notification(title: str, body: str):
    global _push_subscriptions
    if not HAS_WEBPUSH or VAPID_PRIVATE_KEY == "DEV_FALLBACK_KEY":
        print(f"[Push Notifications] Push not configured/available. Logging: {title} - {body}")
        return

    vapid_claims = {
        "sub": "mailto:admin@localhost"
    }

    for sub in list(_push_subscriptions):
        try:
            webpush(
                subscription_info=sub,
                data=json.dumps({"title": title, "body": body}),
                vapid_private_key=VAPID_PRIVATE_KEY,
                vapid_claims=vapid_claims
            )
            print(f"[Push Notifications] Sent push to {sub.get('endpoint')}")
        except WebPushException as ex:
            print(f"[Push Notifications] Failed to send push: {ex}")
            if ex.response and ex.response.status_code in (404, 410):
                try:
                    _push_subscriptions.remove(sub)
                    _save_subscriptions()
                except Exception:
                    pass
        except Exception as e:
            print(f"[Push Notifications] Error sending push: {e}")


# ───────────────────────────────────────────────
# Queue worker (runs in background asyncio task)
# ───────────────────────────────────────────────

async def _queue_worker():
    global _queue_running
    while True:
        # Find next pending item
        item = None
        with _queue_lock:
            for qi in _gen_queue:
                if qi["status"] == "queued":
                    item = qi
                    break
        if item is None:
            _queue_running = False
            return  # No more work – exit; will be restarted on next submit

        loop = asyncio.get_running_loop()
        queue_id = item["id"]

        # Mark running
        with _queue_lock:
            item["status"]     = "running"
            item["started_at"] = datetime.datetime.utcnow().isoformat() + "Z"
        await _broadcast_queue()

        prompt     = item["prompt"]
        resolution = item.get("resolution", "1920x1088")
        num_images = item.get("num_images", 1)
        image_ids: list = []
        seeds: list = []
        error_msg: Optional[str] = None

        try:
            for img_index in range(num_images):
                # Check cancellation
                with _queue_lock:
                    if item["status"] == "cancelled":
                        break

                # Use original seed if provided for single image, otherwise generate random
                if item.get("seed") is not None and num_images == 1:
                    seed = item["seed"]
                else:
                    import random
                    seed = random.randint(0, (2 ** 63) - 1)
                
                seeds.append(seed)

                # Update progress
                with _queue_lock:
                    item["image_num"]    = img_index + 1
                    item["total_images"] = num_images
                    item["progress"]     = 0.0
                    item["seed"]         = seed
                    item["seeds"]        = seeds
                await _broadcast_queue()

                wf = _build_workflow(prompt, resolution, seed, queue_id, img_index)

                # Progress callback pushes into our async loop
                def on_progress(event_type, event_data):
                    if event_type == "progress":
                        val = event_data.get("value", 0)
                        mx  = event_data.get("max", 1)
                        pct = round(val / mx, 4) if mx > 0 else 0
                        with _queue_lock:
                            item["progress"] = pct
                        asyncio.run_coroutine_threadsafe(_broadcast_queue(), loop)

                prompt_id, _ = _queue_comfy(wf)
                history = await asyncio.to_thread(_wait_comfy, prompt_id, on_progress)

                # Check cancellation immediately after wait completes
                with _queue_lock:
                    if item["status"] == "cancelled":
                        break

                if not history or not history["images"]:
                    raise RuntimeError("ComfyUI returned no images — check ComfyUI logs.")

                for img in history["images"]:
                    fname = img["filename"]
                    image_ids.append(fname)
                    _write_sidecar(fname, prompt, resolution, seed, queue_id)

            # Completed
            with _queue_lock:
                if item["status"] != "cancelled":
                    item["status"]       = "completed"
                    item["image_ids"]    = image_ids
                    item["progress"]     = 1.0
                    item["completed_at"] = datetime.datetime.utcnow().isoformat() + "Z"
            
            _send_push_notification(
                title="Image Generation Complete",
                body=f"Generated {len(image_ids)} images for: {prompt[:40]}..."
            )

        except Exception as e:
            is_cancelled = False
            with _queue_lock:
                if item["status"] == "cancelled":
                    is_cancelled = True
            
            if not is_cancelled:
                import traceback
                traceback.print_exc()
                error_msg = str(e).split("\n")[0]
                with _queue_lock:
                    item["status"] = "error"
                    item["error"]  = error_msg
                
                _send_push_notification(
                    title="Image Generation Failed",
                    body=f"Error: {error_msg} for: {prompt[:40]}..."
                )

        await _broadcast_queue()


# ───────────────────────────────────────────────
# REST endpoints – generation queue
# ───────────────────────────────────────────────

class GenerateRequest(BaseModel):
    prompt: str
    resolution: str = "1920x1088"
    num_images: int = 1
    seed: Optional[int] = None


@app.post("/api/generate/queue")
async def submit_to_queue(req: GenerateRequest):
    global _queue_running
    queue_id = "q" + uuid.uuid4().hex[:8]
    item = {
        "id":           queue_id,
        "prompt":       req.prompt,
        "resolution":   req.resolution,
        "num_images":   max(1, min(req.num_images, 16)),
        "status":       "queued",
        "image_ids":    [],
        "submitted_at": datetime.datetime.utcnow().isoformat() + "Z",
        "started_at":   None,
        "completed_at": None,
        "progress":     0.0,
        "image_num":    0,
        "total_images": req.num_images,
        "seed":         req.seed,
        "seeds":        [],
    }
    with _queue_lock:
        _gen_queue.append(item)
        should_start = not _queue_running

    await _broadcast_queue()

    if should_start:
        _queue_running = True
        asyncio.create_task(_queue_worker())

    return {"queue_id": queue_id, "position": len(_gen_queue)}


@app.get("/api/generate/queue")
def get_queue():
    return {"queue": _get_queue_snapshot()}


@app.delete("/api/generate/queue/{queue_id}")
async def cancel_queue_item(queue_id: str):
    with _queue_lock:
        for item in _gen_queue:
            if item["id"] == queue_id and item["status"] in ("queued", "running"):
                if item["status"] == "running":
                    try:
                        _COMFY_HTTP.post("/interrupt")
                    except Exception as e:
                        print(f"[ComfyUI Interrupt] failed: {e}")
                item["status"] = "cancelled"
                break
    await _broadcast_queue()
    return {"detail": f"Cancelled {queue_id}"}


@app.delete("/api/generate/queue")
async def clear_completed():
    with _queue_lock:
        done = {"completed", "error", "cancelled"}
        removable = [i for i in _gen_queue if i["status"] in done]
        for r in removable:
            _gen_queue.remove(r)
    await _broadcast_queue()
    return {"detail": f"Cleared {len(removable)} finished items"}


# ───────────────────────────────────────────────
# SSE – /events/queue
# ───────────────────────────────────────────────

@app.get("/events/queue")
async def stream_queue(request: Request):
    q: asyncio.Queue = asyncio.Queue()
    _queue_sse_subscribers.append(q)

    async def _gen():
        try:
            # Send current snapshot immediately on connect
            yield f"event: queue\ndata: {json.dumps({'queue': _get_queue_snapshot()})}\n\n"
            while True:
                if await request.is_disconnected():
                    break
                try:
                    payload = await asyncio.wait_for(q.get(), timeout=15)
                    yield f"event: queue\ndata: {payload}\n\n"
                except asyncio.TimeoutError:
                    yield ": keepalive\n\n"   # prevent proxy timeouts
        finally:
            try:
                _queue_sse_subscribers.remove(q)
            except ValueError:
                pass

    return StreamingResponse(_gen(), media_type="text/event-stream")


# ───────────────────────────────────────────────
# REST endpoints – gallery
# ───────────────────────────────────────────────

def _read_sidecar(image_path: str) -> dict:
    base = os.path.splitext(image_path)[0]
    sidecar = base + ".json"
    if os.path.exists(sidecar):
        try:
            with open(sidecar) as f:
                return json.load(f)
        except Exception:
            pass
    return {}


@app.get("/api/gallery/browse")
def browse_gallery(path: str = "", page: int = 1, limit: int = 24):
    if not os.path.exists(IMAGE_GEN_OUTPUT):
        return {"current_path": "", "folders": [], "images": [],
                "total_images": 0, "page": 1, "limit": limit, "total_pages": 0}

    target_dir = safe_join(IMAGE_GEN_OUTPUT, path)
    if not os.path.isdir(target_dir):
        raise HTTPException(status_code=404, detail="Directory not found")

    folders, images = [], []

    for name in os.listdir(target_dir):
        if name.startswith(".") or name.endswith(".json"):
            continue
        full = os.path.join(target_dir, name)
        rel  = os.path.relpath(full, IMAGE_GEN_OUTPUT)
        if os.path.isdir(full):
            folders.append({"name": name, "relative_path": rel})
        elif name.lower().endswith((".png", ".jpg", ".jpeg", ".webp")):
            mtime    = os.path.getmtime(full)
            url_path = "/".join(urllib.parse.quote(p) for p in rel.split(os.sep))
            sidecar  = _read_sidecar(full)
            images.append({
                "filename":      name,
                "relative_path": rel,
                "url":           f"/images/{url_path}",
                "mtime":         mtime,
                "prompt":        sidecar.get("prompt"),
                "seed":          sidecar.get("seed"),
                "model":         sidecar.get("model"),
                "timestamp":     sidecar.get("timestamp"),
                "generation_id": sidecar.get("generation_id"),
            })

    folders.sort(key=lambda x: x["name"].lower())
    images.sort(key=lambda x: x["mtime"], reverse=True)

    # Orphan sidecar cleanup (delete .json with no matching image)
    for name in os.listdir(target_dir):
        if name.endswith(".json"):
            img_base = os.path.join(target_dir, os.path.splitext(name)[0])
            has_image = any(os.path.exists(img_base + ext) for ext in [".png", ".jpg", ".jpeg", ".webp"])
            if not has_image:
                try:
                    os.remove(os.path.join(target_dir, name))
                except Exception:
                    pass

    total   = len(images)
    pages   = max(1, (total + limit - 1) // limit) if total > 0 else 0
    start   = (page - 1) * limit
    paged   = images[start:start + limit]

    return {"current_path": path, "folders": folders, "images": paged,
            "total_images": total, "page": page, "limit": limit, "total_pages": pages}


@app.get("/api/gallery/all_folders")
def get_all_folders():
    if not os.path.exists(IMAGE_GEN_OUTPUT):
        return []
    folders = [""]
    for root, dirs, _ in os.walk(IMAGE_GEN_OUTPUT):
        dirs[:] = [d for d in dirs if not d.startswith(".")]
        for d in dirs:
            rel = os.path.relpath(os.path.join(root, d), IMAGE_GEN_OUTPUT)
            folders.append(rel)
    folders.sort(key=str.lower)
    return folders


class MkdirRequest(BaseModel):
    current_path: str
    folder_name: str


class MoveRequest(BaseModel):
    current_path: str
    filenames: list
    destination: str


class DeleteRequest(BaseModel):
    current_path: str
    filenames: list
    folders: list


@app.post("/api/gallery/mkdir")
def gallery_mkdir(req: MkdirRequest):
    target = safe_join(IMAGE_GEN_OUTPUT, req.current_path, req.folder_name)
    os.makedirs(target, exist_ok=True)
    return {"detail": "Folder created"}


@app.post("/api/gallery/move")
def gallery_move(req: MoveRequest):
    dest_dir = safe_join(IMAGE_GEN_OUTPUT, req.destination)
    if not os.path.isdir(dest_dir):
        raise HTTPException(status_code=400, detail="Destination does not exist")
    moved, errors = [], []
    for rel in req.filenames:
        src = safe_join(IMAGE_GEN_OUTPUT, req.current_path, rel)
        dst = os.path.join(dest_dir, os.path.basename(src))
        try:
            shutil.move(src, dst)
            # Also move sidecar if exists
            sidecar_src = os.path.splitext(src)[0] + ".json"
            if os.path.exists(sidecar_src):
                shutil.move(sidecar_src, os.path.join(dest_dir, os.path.basename(sidecar_src)))
            moved.append(rel)
        except Exception as e:
            errors.append(str(e))
    if errors:
        raise HTTPException(status_code=500, detail=f"Moved {len(moved)}, errors: {errors}")
    return {"detail": f"Moved {len(moved)} files", "moved": moved}


@app.post("/api/gallery/delete")
def gallery_delete(req: DeleteRequest):
    deleted, errors = [], []
    for rel in req.filenames:
        path = safe_join(IMAGE_GEN_OUTPUT, req.current_path, rel)
        try:
            os.remove(path)
            sidecar = os.path.splitext(path)[0] + ".json"
            if os.path.exists(sidecar):
                os.remove(sidecar)
            deleted.append(rel)
        except Exception as e:
            errors.append(str(e))
    for rel_dir in req.folders:
        path = safe_join(IMAGE_GEN_OUTPUT, req.current_path, rel_dir)
        try:
            shutil.rmtree(path)
        except Exception as e:
            errors.append(str(e))
    if errors:
        raise HTTPException(status_code=500, detail=str(errors))
    return {"detail": f"Deleted {len(deleted)} files"}


# ───────────────────────────────────────────────
# PWA manifest
# ───────────────────────────────────────────────

@app.get("/manifest.json")
def pwa_manifest():
    manifest = {
        "name": "LLM Server Manager Mobile",
        "short_name": "LLM Mobile",
        "description": "Mobile-first local LLM & image generation dashboard",
        "start_url": "/",
        "display": "standalone",
        "background_color": "#0b0f19",
        "theme_color": "#6366f1",
        "orientation": "portrait",
        "icons": [
            {
                "src": "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 192 192'%3E%3Crect width='192' height='192' rx='38' fill='%230f172a'/%3E%3Cpath d='M110 24L52 108h42v60l54-84h-44z' fill='%236366f1'/%3E%3C/svg%3E",
                "sizes": "192x192", "type": "image/svg+xml", "purpose": "any maskable",
            },
            {
                "src": "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 512 512'%3E%3Crect width='512' height='512' rx='100' fill='%230f172a'/%3E%3Cpath d='M295 64L140 288h112v160l144-224h-116z' fill='%236366f1'/%3E%3C/svg%3E",
                "sizes": "512x512", "type": "image/svg+xml", "purpose": "any maskable",
            },
        ],
    }
    return JSONResponse(content=manifest, headers={"Content-Type": "application/manifest+json"})


# ───────────────────────────────────────────────
# Static file mounts (images + frontend dist)
# ───────────────────────────────────────────────

app.mount("/images", StaticFiles(directory=IMAGE_GEN_OUTPUT), name="images")

dist_dir = os.path.join(os.path.dirname(__file__), "dist")
if os.path.exists(dist_dir):
    app.mount("/", StaticFiles(directory=dist_dir, html=True), name="static")
else:
    @app.get("/")
    def fallback_root():
        return HTMLResponse("<h1>Run 'npm run build' to build the frontend.</h1>")
