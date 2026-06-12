import os
import re
import glob
import json
import time
import asyncio
import datetime
import subprocess
import threading
import psutil
import docker
import httpx
import paho.mqtt.client as mqtt
from typing import Optional, List, Dict, Any
from pydantic import BaseModel
from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.responses import HTMLResponse, StreamingResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

app = FastAPI(title="LLM Mobile Manager")

MODELS_DIR = "/models"
LLM_PROJECT_NAME = os.environ.get("LLM_PROJECT_NAME", "llmacpp")
LLM_COMPOSE_DIR = os.environ.get("LLM_COMPOSE_DIR", "/llm-server")

# Initialize Docker client
try:
    docker_client = docker.DockerClient(base_url='unix://var/run/docker.sock')
except Exception as e:
    docker_client = None
    print(f"Error connecting to Docker socket: {e}")

# Telemetry Cache
_stats_cache = {"data": {
    "cpu_temp": 0.0, "cpu_util": 0.0, "ram_percent": 0.0,
    "gpu_temp": 0.0, "gpu_util": 0.0, "vram_percent": 0.0,
    "storage_percent": 0.0, "storage_used_gb": 0.0,
    "storage_total_gb": 0.0, "storage_free_gb": 0.0
}}
_stats_lock = threading.Lock()
last_mqtt_update_time = 0.0

MQTT_CONFIG = {
    "broker": "192.168.31.182",
    "user": "mqttuser",
    "pass": "mqttpass",
    "topics": {
        "home/129/sensor/cpu_temp": "cpu_temp",
        "home/129/sensor/tesla_p100_temp": "gpu_temp",
        "home/129/sensor/cpu_utilization": "cpu_util",
        "home/129/sensor/ram_utilization": "ram_percent",
        "home/129/sensor/vram_utilization": "vram_percent",
        "home/129/sensor/gpu_utilization": "gpu_util",
        "home/129/sensor/disk_utilization_root": "storage_percent"
    }
}

# --- Telemetry fallbacks ---
def get_local_stats_data() -> dict:
    stats = {}
    
    # CPU util & RAM
    stats["cpu_util"] = psutil.cpu_percent()
    ram = psutil.virtual_memory()
    stats["ram_percent"] = ram.percent
    
    # Storage
    try:
        usage = psutil.disk_usage('/')
        stats["storage_percent"] = usage.percent
        stats["storage_used_gb"] = round(usage.used / (1024**3), 1)
        stats["storage_total_gb"] = round(usage.total / (1024**3), 1)
        stats["storage_free_gb"] = round(usage.free / (1024**3), 1)
    except Exception:
        pass

    # CPU Temp
    try:
        temps = psutil.sensors_temperatures()
        if "coretemp" in temps:
            stats["cpu_temp"] = temps["coretemp"][0].current
        elif temps:
            first_key = list(temps.keys())[0]
            stats["cpu_temp"] = temps[first_key][0].current
    except Exception:
        pass

    # GPU stats via nvidia-smi
    try:
        res = subprocess.run(
            ["nvidia-smi", "--query-gpu=temperature.gpu,utilization.gpu,memory.used,memory.total", "--format=csv,noheader,nounits"],
            capture_output=True, text=True, timeout=2
        )
        if res.returncode == 0:
            parts = res.stdout.strip().split(',')
            if len(parts) >= 4:
                stats["gpu_temp"] = float(parts[0].strip())
                stats["gpu_util"] = float(parts[1].strip())
                used = float(parts[2].strip())
                total = float(parts[3].strip())
                if total > 0:
                    stats["vram_percent"] = round((used / total) * 100, 1)
    except Exception:
        pass

    return stats

# --- MQTT Listener ---
def _on_mqtt_message(client, userdata, msg):
    global last_mqtt_update_time
    try:
        topic = msg.topic
        payload = float(msg.payload.decode())
        if topic in MQTT_CONFIG["topics"]:
            stat_key = MQTT_CONFIG["topics"][topic]
            with _stats_lock:
                _stats_cache["data"][stat_key] = payload
            last_mqtt_update_time = time.time()
    except Exception as e:
        print(f"MQTT Parse Error: {e}")

def _start_mqtt_listener():
    try:
        client = mqtt.Client()
        client.on_message = _on_mqtt_message
        if MQTT_CONFIG["user"] and MQTT_CONFIG["pass"]:
            client.username_pw_set(MQTT_CONFIG["user"], MQTT_CONFIG["pass"])
        client.connect(MQTT_CONFIG["broker"], 1883, 60)
        for topic in MQTT_CONFIG["topics"]:
            client.subscribe(topic)
        client.loop_start()
        print("MQTT Telemetry Listener started.")
    except Exception as e:
        print(f"MQTT Connection Error: {e}")

# --- Background task for local polling fallback ---
async def local_stats_poller():
    global last_mqtt_update_time
    while True:
        try:
            # If no MQTT update in the last 5 seconds, poll locally
            if time.time() - last_mqtt_update_time > 5.0:
                local_stats = get_local_stats_data()
                with _stats_lock:
                    _stats_cache["data"].update(local_stats)
        except Exception as e:
            print(f"Error in local stats poller: {e}")
        await asyncio.sleep(2)

@app.on_event("startup")
async def startup_event():
    _start_mqtt_listener()
    asyncio.create_task(local_stats_poller())

# --- REST Endpoints ---

@app.get("/status")
def get_status():
    if not docker_client:
        raise HTTPException(status_code=500, detail="Docker client not initialized.")
    
    def get_container_info(name):
        try:
            container = None
            try:
                container = docker_client.containers.get(name)
            except docker.errors.NotFound:
                # Find first container matching 'name'
                containers = docker_client.containers.list(all=True, filters={"name": name})
                if containers:
                    container = containers[0]
            
            if not container:
                return {"status": "not_found", "image": None, "uptime": None}

            status = container.status
            image = container.image.tags[0] if container.image.tags else container.image.id
            started_at_str = container.attrs.get('State', {}).get('StartedAt')
            uptime = "unknown"
            if status == "running" and started_at_str:
                try:
                    time_str = started_at_str.split('.')[0]
                    if time_str.endswith('Z'):
                        time_str = time_str[:-1]
                    started_at = datetime.datetime.fromisoformat(time_str)
                    now = datetime.datetime.utcnow()
                    delta = now - started_at
                    uptime = str(delta).split('.')[0]
                except Exception:
                    uptime = started_at_str
            return {"status": status, "image": image, "uptime": uptime if status == "running" else None}
        except Exception:
            return {"status": "error", "image": None, "uptime": None}

    try:
        # Note: We query 'llm-mobile' for manager status in the new container
        return {
            "server": get_container_info("llm-server"),
            "manager": get_container_info("llm-mobile")
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/system_stats")
def get_system_stats_compat():
    with _stats_lock:
        return _stats_cache["data"]

@app.get("/models")
def list_models():
    if not os.path.exists(MODELS_DIR):
        return {"models": []}
    files = glob.glob(os.path.join(MODELS_DIR, "*.gguf"))
    filenames = [os.path.basename(f) for f in files]
    return {"models": filenames}

@app.delete("/models/{filename}")
def delete_model(filename: str):
    if not filename.endswith(".gguf") or "/" in filename or "\\" in filename:
        raise HTTPException(status_code=400, detail="Invalid filename")
    file_path = os.path.join(MODELS_DIR, filename)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found")
    try:
        os.remove(file_path)
        return {"detail": f"Successfully deleted {filename}"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# --- Router Proxy Endpoints ---

@app.get("/api/llm/models")
async def proxy_llm_models():
    try:
        async with httpx.AsyncClient() as client:
            res = await client.get("http://llm-server:8080/models", timeout=5)
            return res.json()
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"llama-server unreachable: {e}")

class ModelActionRequest(BaseModel):
    model: str

@app.post("/api/llm/models/load")
async def proxy_llm_load(req: ModelActionRequest):
    try:
        async with httpx.AsyncClient() as client:
            res = await client.post(
                "http://llm-server:8080/models/load",
                json={"model": req.model},
                timeout=30
            )
            return res.json()
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"llama-server unreachable: {e}")

@app.post("/api/llm/models/unload")
async def proxy_llm_unload(req: ModelActionRequest):
    try:
        async with httpx.AsyncClient() as client:
            res = await client.post(
                "http://llm-server:8080/models/unload",
                json={"model": req.model},
                timeout=10
            )
            return res.json()
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"llama-server unreachable: {e}")

@app.post("/start")
def start_llm():
    if not os.path.exists(LLM_COMPOSE_DIR):
        raise HTTPException(status_code=400, detail=f"Compose directory '{LLM_COMPOSE_DIR}' not found.")
    try:
        result = subprocess.run(
            ["docker", "compose", "-p", LLM_PROJECT_NAME, "up", "-d", "--no-build", "llama-server"],
            cwd=LLM_COMPOSE_DIR,
            capture_output=True,
            text=True
        )
        if result.returncode != 0:
            raise HTTPException(status_code=500, detail=f"Failed to start container:\n{result.stderr}")
        return {"detail": "Successfully started llm-server"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/stop")
def stop_llm():
    if not docker_client:
        raise HTTPException(status_code=500, detail="Docker client not initialized.")
    try:
        container = docker_client.containers.get("llm-server")
        container.stop()
        container.remove()
        return {"detail": "Successfully stopped and removed llm-server"}
    except docker.errors.NotFound:
        return {"detail": "llm-server is not running."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# --- Chat Proxy Endpoint ---

async def get_actually_loaded_model() -> Optional[str]:
    try:
        async with httpx.AsyncClient() as client:
            res = await client.get("http://llm-server:8080/models", timeout=3)
            if res.status_code == 200:
                data = res.json()
                for m in data.get("data", []):
                    status = m.get("status")
                    model_id = m.get("id")
                    if status == "loaded" or (isinstance(status, dict) and status.get("value") == "loaded"):
                        return model_id
    except Exception:
        pass
    return None

@app.post("/api/chat/completions")
async def proxy_chat_completions(request: Request):
    body = await request.body()
    try:
        data = json.loads(body) if body else {}
    except Exception:
        data = {}

    # If no model is specified, auto-fallback to the actually loaded model
    if "model" not in data or not str(data.get("model", "")).strip():
        actual_loaded = await get_actually_loaded_model()
        if actual_loaded:
            data["model"] = actual_loaded
        else:
            # Fallback placeholder
            data["model"] = "default"
            
    body = json.dumps(data).encode("utf-8")

    async def stream_response():
        timeout_cfg = httpx.Timeout(None, connect=10.0)
        async with httpx.AsyncClient(timeout=timeout_cfg) as client:
            try:
                async with client.stream(
                    "POST",
                    "http://llm-server:8080/v1/chat/completions",
                    content=body,
                    headers={"Content-Type": "application/json"},
                ) as response:
                    async for chunk in response.aiter_bytes():
                        yield chunk
            except Exception as e:
                error_payload = json.dumps({"error": {"message": str(e), "type": "proxy_error"}})
                yield f"{error_payload}\n".encode('utf-8')

    return StreamingResponse(stream_response(), media_type="text/event-stream")

# --- SSE status stream endpoint (/events/status) ---

@app.get("/events/status")
async def stream_status(request: Request, since: str = None):
    # Extract Last-Event-ID if present
    last_event_id = request.headers.get("last-event-id") or since or "0"
    
    async def event_generator():
        event_counter = int(last_event_id) if last_event_id.isdigit() else 0
        while True:
            # Disconnection check
            if await request.is_disconnected():
                break
            
            event_counter += 1
            
            with _stats_lock:
                stats = dict(_stats_cache["data"])
            
            # Fetch container status
            try:
                status = get_status()
            except Exception:
                status = {"server": {"status": "error"}, "manager": {"status": "running"}}
                
            payload = {
                "stats": stats,
                "status": status,
                "timestamp": datetime.datetime.utcnow().isoformat() + "Z"
            }
            
            yield f"id: {event_counter}\nevent: stats\nretry: 3000\ndata: {json.dumps(payload)}\n\n"
            await asyncio.sleep(2)
            
    return StreamingResponse(event_generator(), media_type="text/event-stream")

# --- PWA Manifest ---

@app.get("/manifest.json")
def pwa_manifest():
    manifest = {
        "name": "LLM Server Manager Mobile",
        "short_name": "LLM Mobile",
        "description": "Mobile-first local LLM & image generation dashboard",
        "start_url": "/",
        "display": "standalone",
        "background_color": "#0f172a",
        "theme_color": "#6366f1",
        "orientation": "portrait",
        "icons": [
            {
                "src": "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 192 192'%3E%3Cdefs%3E%3CradialGradient id='bg' cx='50%25' cy='50%25' r='50%25'%3E%3Cstop offset='0%25' stop-color='%231e1b4b'/%3E%3Cstop offset='100%25' stop-color='%230f172a'/%3E%3C/radialGradient%3E%3ClinearGradient id='bolt' x1='0%25' y1='0%25' x2='100%25' y2='100%25'%3E%3Cstop offset='0%25' stop-color='%23a5b4fc'/%3E%3Cstop offset='100%25' stop-color='%236366f1'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='192' height='192' rx='38' fill='url(%23bg)'/%3E%3Cpath d='M110 24L52 108h42v60l54-84h-44z' fill='url(%23bolt)' stroke='%23c7d2fe' stroke-width='2' stroke-linejoin='round'/%3E%3C/svg%3E",
                "sizes": "192x192",
                "type": "image/svg+xml",
                "purpose": "any maskable"
            },
            {
                "src": "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 512 512'%3E%3Cdefs%3E%3CradialGradient id='bg' cx='50%25' cy='50%25' r='50%25'%3E%3Cstop offset='0%25' stop-color='%231e1b4b'/%3E%3Cstop offset='100%25' stop-color='%230f172a'/%3E%3C/radialGradient%3E%3ClinearGradient id='bolt' x1='0%25' y1='0%25' x2='100%25' y2='100%25'%3E%3Cstop offset='0%25' stop-color='%23a5b4fc'/%3E%3Cstop offset='100%25' stop-color='%236366f1'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='512' height='512' rx='100' fill='url(%23bg)'/%3E%3Cpath d='M295 64L140 288h112v160l144-224h-116z' fill='url(%23bolt)' stroke='%23c7d2fe' stroke-width='5' stroke-linejoin='round'/%3E%3C/svg%3E",
                "sizes": "512x512",
                "type": "image/svg+xml",
                "purpose": "any maskable"
            }
        ]
    }
    return JSONResponse(content=manifest, headers={"Content-Type": "application/manifest+json"})

# --- Static Files Mount ---
dist_dir = os.path.join(os.path.dirname(__file__), "dist")
if os.path.exists(dist_dir):
    app.mount("/", StaticFiles(directory=dist_dir, html=True), name="static")
else:
    @app.get("/")
    def serve_fallback_root():
        return HTMLResponse("<h1>Vite Frontend not built yet. Run 'npm run build' inside dev/llmMobile.</h1>")
