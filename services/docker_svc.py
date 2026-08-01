import os
import time
import datetime
import threading
import subprocess
import logging
import docker as _docker_module
import paho.mqtt.client as mqtt
from fastapi import HTTPException

from utils.common import LLM_PROJECT_NAME, LLM_COMPOSE_DIR, MQTT_CONFIG

# OWNED GLOBAL — no other file may import this directly from main.py
_docker_client = None
try:
    _docker_client = _docker_module.DockerClient(base_url="unix://var/run/docker.sock")
except Exception as e:
    _docker_client = None
    print(f"Error connecting to Docker socket: {e}")

# Host root partition total size (from `df -h /`): 464GB
_HOST_STORAGE_TOTAL_GB = 464.0

_stats_cache: dict = {"data": {
  "cpu_temp": 0.0, "cpu_util": 0.0, "ram_percent": 0.0,
  "gpu_temp": 0.0, "gpu_util": 0.0, "vram_percent": 0.0,
  "storage_percent": 0.0, "storage_used_gb": 0.0, "storage_total_gb": _HOST_STORAGE_TOTAL_GB,
  "gpu_temp_gtx": 0.0, "gpu_util_gtx": 0.0, "vram_percent_gtx": 0.0,
}}
_stats_lock = threading.Lock()
last_mqtt_update_time: float = 0.0
_mqtt_client = None
_mqtt_watchdog_started = False

def _compute_storage_used(percent: float) -> float:
    if _HOST_STORAGE_TOTAL_GB <= 0 or percent <= 0:
        return 0.0
    return round(percent * _HOST_STORAGE_TOTAL_GB / 100.0, 1)

from typing import Any

def get_docker_client() -> Any:
    return _docker_client

def set_docker_client(client):
    global _docker_client
    _docker_client = client

_MANAGED_LLM_SERVERS = [
    {"name": "llama-server",      "container": "llm-server",      "label": "Primary (llama-server)"},
    {"name": "llama-server-mini", "container": "llm-server-mini", "label": "Secondary (llama-server-mini)"},
]

def _llm_server_by_name(name: str) -> dict | None:
    for entry in _MANAGED_LLM_SERVERS:
        if entry["name"] == name:
            return entry
    return None

def _container_info(name: str) -> dict:
    if not _docker_client:
        return {"status": "error", "image": None, "uptime": None}
    try:
        container = None
        try:
            container = _docker_client.containers.get(name)
        except _docker_module.errors.NotFound:
            containers = _docker_client.containers.list(all=True, filters={"name": name})
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

def list_managed_llm_servers() -> list[dict]:
    return _MANAGED_LLM_SERVERS

def unload_kokoro_models():
    """Request kokoro-tts server to unload GPU models from VRAM."""
    import httpx
    try:
        # kokoro-tts container runs on port 8000 internally (port 8001 on host / docker network kokoro-tts:8000)
        resp = httpx.post("http://kokoro-tts:8000/api/unload", timeout=5.0)
        if resp.status_code == 200:
            return {"success": True, "detail": "Kokoro-TTS GPU models unloaded"}
        return {"success": False, "detail": f"Unload endpoint returned {resp.status_code}"}
    except Exception as e:
        return {"success": False, "detail": f"Failed to unload Kokoro-TTS: {str(e)}"}


def get_status():
    if not _docker_client:
        raise HTTPException(status_code=500, detail="Docker client not initialized.")
    servers = []
    primary_info = None
    for entry in _MANAGED_LLM_SERVERS:
        info = _container_info(entry["container"])
        servers.append({
            "name": entry["name"],
            "container": entry["container"],
            "label": entry["label"],
            "status": info.get("status"),
            "image": info.get("image"),
            "uptime": info.get("uptime"),
        })
        if entry["name"] == "llama-server":
            primary_info = info
    return {
        "manager": _container_info("llm-mobile"),
        "server": primary_info or {"status": "not_found", "image": None, "uptime": None},
        "servers": servers,
        "comfyui": _container_info("comfyui"),
        "kokoro": _container_info("kokoro-tts"),
    }


def get_system_stats():
    with _stats_lock:
        return dict(_stats_cache["data"])

def start_llm():
    return _start_llm_service("llama-server", "llama-server")

def stop_llm():
    if not _docker_client:
        raise HTTPException(status_code=500, detail="Docker client not initialized.")
    try:
        c = _docker_client.containers.get("llm-server")
        c.stop(); c.remove()
        return {"detail": "Stopped llm-server"}
    except _docker_module.errors.NotFound:
        return {"detail": "llm-server is not running."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

def _start_llm_service(service_name: str, detail_name: str | None = None):
    if not os.path.exists(LLM_COMPOSE_DIR):
        raise HTTPException(status_code=400, detail=f"Compose dir '{LLM_COMPOSE_DIR}' not found.")
    result = subprocess.run(
        ["docker", "compose", "-p", LLM_PROJECT_NAME, "up", "-d", "--no-build", service_name],
        cwd=LLM_COMPOSE_DIR, capture_output=True, text=True,
    )
    if result.returncode != 0:
        raise HTTPException(status_code=500, detail=result.stderr)
    label = detail_name or service_name
    return {"detail": f"Started {label}"}

def _stop_llm_container(container_name: str):
    if not _docker_client:
        raise HTTPException(status_code=500, detail="Docker client not initialized.")
    try:
        c = _docker_client.containers.get(container_name)
        c.stop(); c.remove()
        return {"detail": f"Stopped {container_name}"}
    except _docker_module.errors.NotFound:
        return {"detail": f"{container_name} is not running."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

def start_llm_server(name: str):
    entry = _llm_server_by_name(name)
    if not entry:
        raise HTTPException(status_code=404, detail=f"Unknown managed server '{name}'.")
    return _start_llm_service(entry["name"], entry["container"])

def stop_llm_server(name: str):
    entry = _llm_server_by_name(name)
    if not entry:
        raise HTTPException(status_code=404, detail=f"Unknown managed server '{name}'.")
    return _stop_llm_container(entry["container"])

def restart_llm_server(name: str):
    entry = _llm_server_by_name(name)
    if not entry:
        raise HTTPException(status_code=404, detail=f"Unknown managed server '{name}'.")
    stop_result = _stop_llm_container(entry["container"])
    start_result = _start_llm_service(entry["name"], entry["container"])
    return {
        "detail": f"Restarted {entry['container']}",
        "stop": stop_result,
        "start": start_result,
    }

def _on_mqtt_message(client, userdata, msg):
    global last_mqtt_update_time
    try:
        val = float(msg.payload.decode())
        key = MQTT_CONFIG["topics"].get(msg.topic)
        if key:
            with _stats_lock:
                _stats_cache["data"][key] = val
                # When storage_percent arrives, derive used GB from hardcoded host total.
                if key == "storage_percent":
                    _stats_cache["data"]["storage_used_gb"] = _compute_storage_used(val)
            last_mqtt_update_time = time.time()
    except Exception as e:
        print(f"MQTT Parse Error: {e}")

def _on_mqtt_connect(client, userdata, flags, rc):
    print(f"MQTT connected rc={rc}")

def _on_mqtt_disconnect(client, userdata, rc):
    print(f"MQTT disconnected rc={rc}")

def _start_mqtt_listener():
    global _mqtt_client
    try:
        # Tear down any previous client before (re)connecting.
        if _mqtt_client is not None:
            try:
                _mqtt_client.loop_stop()
            except Exception:
                pass
            try:
                _mqtt_client.disconnect()
            except Exception:
                pass
            _mqtt_client = None

        # Make paho's own warnings/errors visible in container logs.
        _paho_logger = logging.getLogger("paho.mqtt")
        if not _paho_logger.handlers:
            _paho_logger.addHandler(logging.StreamHandler())
        _paho_logger.setLevel(logging.WARNING)

        client = mqtt.Client()
        client.on_message = _on_mqtt_message
        client.on_connect = _on_mqtt_connect
        client.on_disconnect = _on_mqtt_disconnect
        client.username_pw_set(MQTT_CONFIG["user"], MQTT_CONFIG["pass"])
        client.reconnect_delay_set(min_delay=1, max_delay=30)
        client.connect(MQTT_CONFIG["broker"], 1883, 60)
        for topic in MQTT_CONFIG["topics"]:
            client.subscribe(topic)
        client.loop_start()
        _mqtt_client = client
        print(f"MQTT Telemetry Listener started at {datetime.datetime.utcnow().isoformat()} UTC")
    except Exception as e:
        print(f"MQTT Connection Error: {e}")

def _mqtt_watchdog_loop():
    """Restart the MQTT listener if telemetry has gone stale for too long.

    paho's loop_start thread can die silently (broker restart, network blip,
    unhandled exception) leaving _stats_cache frozen. This watchdog restarts
    the listener when no message has arrived for STALE_MQTT_SECONDS.
    """
    stale_seconds = 90
    check_interval = 30
    while True:
        time.sleep(check_interval)
        with _stats_lock:
            idle_for = time.time() - last_mqtt_update_time
        if idle_for > stale_seconds:
            print(f"MQTT telemetry stale for {idle_for:.0f}s — restarting listener")
            _start_mqtt_listener()

def start_mqtt_watchdog():
    global _mqtt_watchdog_started
    if _mqtt_watchdog_started:
        return
    _mqtt_watchdog_started = True
    t = threading.Thread(target=_mqtt_watchdog_loop, daemon=True)
    t.start()


def get_logs(container_name: str = "llm-server", lines: int = 100):
    cli = get_docker_client()
    if not cli:
        raise HTTPException(status_code=500, detail="Docker client not initialized.")
    try:
        c = cli.containers.get(container_name)
        logs = c.logs(tail=lines, stdout=True, stderr=True).decode("utf-8", errors="ignore")
        return {
            "container": container_name,
            "logs": logs
        }
    except Exception as e:
        return {"container": container_name, "logs": f"Error fetching logs: {str(e)}"}


async def get_server_slots_status() -> list[dict]:
    """Check /slots on both llama-server instances to see if they're busy.

    Returns a list with one dict per server:
      {
        "name": "llama-server",
        "container": "llm-server",
        "label": "Primary (llama-server)",
        "slots": [...],       # raw slot data from /slots endpoint
        "processing": bool,   # True if any slot is actively processing
        "error": str | None,  # error message if call failed
      }
    """
    import httpx

    results = []
    for entry in _MANAGED_LLM_SERVERS:
        base_url = "http://llm-server:8080" if entry["name"] == "llama-server" else "http://llm-server-mini:8080"
        container_name = entry["container"]
        info = {"name": entry["name"], "container": container_name, "label": entry["label"], "slots": [], "processing": False, "loaded_model": None, "error": None}

        # Check container is running first
        cinfo = _container_info(container_name)
        if cinfo.get("status") != "running":
            info["error"] = f"Container '{container_name}' is not running"
            results.append(info)
            continue

        try:
            async with httpx.AsyncClient(timeout=5) as client:
                # First find the loaded model (needed for /slots query param)
                models_resp = await client.get(f"{base_url}/models")
                loaded_model = None
                if models_resp.status_code == 200:
                    models_data = models_resp.json()
                    for m in models_data.get("data", []):
                        s = m.get("status")
                        if s == "loaded" or (isinstance(s, dict) and s.get("value") == "loaded"):
                            loaded_model = m.get("id")
                            break

                if loaded_model:
                    info["loaded_model"] = loaded_model
                    # /slots requires ?model= query param with the loaded model name
                    slots_resp = await client.get(f"{base_url}/slots", params={"model": loaded_model})
                    if slots_resp.status_code == 200:
                        slots = slots_resp.json()
                        info["slots"] = slots
                        # A slot is processing if its state != 0 or is_processing is True
                        info["processing"] = any(
                            slot.get("state", 0) != 0 or slot.get("is_processing", False)
                            for slot in slots
                        )
                    else:
                        info["error"] = f"Slots endpoint returned {slots_resp.status_code}"
                else:
                    # No model loaded — no slots to check, server is idle
                    info["slots"] = []
                    info["processing"] = False
        except Exception as e:
            info["error"] = str(e)

        results.append(info)
    return results

