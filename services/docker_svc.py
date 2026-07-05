import os
import time
import datetime
import threading
import subprocess
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

_stats_cache: dict = {"data": {
    "cpu_temp": 0.0, "cpu_util": 0.0, "ram_percent": 0.0,
    "gpu_temp": 0.0, "gpu_util": 0.0, "vram_percent": 0.0, "vram_used_gb": 0.0,
    "storage_percent": 0.0, "storage_used_gb": 0.0,
    "storage_total_gb": 0.0, "storage_free_gb": 0.0,
}}
_stats_lock = threading.Lock()
last_mqtt_update_time: float = 0.0

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
        print(f"MQTT Telemetry Listener started at {datetime.datetime.utcnow().isoformat()} UTC")
    except Exception as e:
        print(f"MQTT Connection Error: {e}")


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

