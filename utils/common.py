import os
import re
import json
import psutil
import subprocess
from fastapi import HTTPException

MODELS_DIR = "/models"
if not os.path.exists(MODELS_DIR) or (os.path.exists("/home/nui/llmaCPP/models") and not os.listdir(MODELS_DIR)):
    MODELS_DIR = "/home/nui/llmaCPP/models"
    os.makedirs(MODELS_DIR, exist_ok=True)

MODES_INI_PATH = "/models/models.ini"
if not os.path.exists(MODES_INI_PATH):
    MODES_INI_PATH = "/home/nui/llmaCPP/models/models.ini"
    os.makedirs(os.path.dirname(MODES_INI_PATH), exist_ok=True)

MODELG_INI_PATH = "/models/modelg.ini"
if not os.path.exists(MODELG_INI_PATH):
    MODELG_INI_PATH = "/home/nui/llmaCPP/models/modelg.ini"
    os.makedirs(os.path.dirname(MODELG_INI_PATH), exist_ok=True)

IMAGE_GEN_OUTPUT = "/comfyui-output"
if not os.path.exists(IMAGE_GEN_OUTPUT):
    IMAGE_GEN_OUTPUT = "/home/nui/llmaCPP/comfyui-output"
    if not os.path.exists(IMAGE_GEN_OUTPUT):
        IMAGE_GEN_OUTPUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "comfyui-output")
    os.makedirs(IMAGE_GEN_OUTPUT, exist_ok=True)

WORKFLOW_PATH = "/app/MyZimage_turbo.json"
if not os.path.exists(WORKFLOW_PATH):
    WORKFLOW_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "MyZimage_turbo.json")

KREA_WORKFLOW_PATH = "/app/MyKrea2E_Turbo.json"
if not os.path.exists(KREA_WORKFLOW_PATH):
    KREA_WORKFLOW_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "MyKrea2E_Turbo.json")

BOOGU_WORKFLOW_PATH = "/app/My_Boogu_Image_Turbo_T2I.json"
if not os.path.exists(BOOGU_WORKFLOW_PATH):
    BOOGU_WORKFLOW_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "My_Boogu_Image_Turbo_T2I.json")

MODEL_ZIMAGE = "z-image-turbo"
MODEL_KREA = "krea2-turbo"
MODEL_BOOGU = "boogu-turbo"
MODEL_KREA_EDIT = "krea2-edit"

KREA2_EDIT1_WORKFLOW_PATH = "/app/Image1_krea2_edit.json"
if not os.path.exists(KREA2_EDIT1_WORKFLOW_PATH):
    KREA2_EDIT1_WORKFLOW_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "Image1_krea2_edit.json")

KREA2_EDIT2_WORKFLOW_PATH = "/app/Img2-to-Img1-text-krea2_edit.json"
if not os.path.exists(KREA2_EDIT2_WORKFLOW_PATH):
    KREA2_EDIT2_WORKFLOW_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "Img2-to-Img1-text-krea2_edit.json")

PROMPTS_FILE = "/app/PROMPTS"
if not os.path.exists(PROMPTS_FILE):
    PROMPTS_FILE = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "PROMPTS")
LLM_PROJECT_NAME = os.environ.get("LLM_PROJECT_NAME", "llmacpp")
LLM_COMPOSE_DIR = os.environ.get("LLM_COMPOSE_DIR", "/llm-server")
COMFYUI_HOST = os.environ.get("COMFYUI_HOST", "host.docker.internal:8188")
COMFY_CLIENT_ID = "llm-mobile"

NODE_PROMPT_TEXT = "57:27"
NODE_RESOLUTION = "57:13"
NODE_KSAMPLER = "57:3"
NODE_KREA_PROMPT_TEXT = "4"
NODE_KREA_RESOLUTION = "6"
NODE_KREA_KSAMPLER = "3"

NODE_BOOGU_PROMPT_TEXT = "34:11"
NODE_BOOGU_RESOLUTION = "34:8"
NODE_BOOGU_KSAMPLER = "34:32"

VRAM_CRITICAL_THRESHOLD = 90.0
VRAM_EMERGENCY_THRESHOLD = 95.0

# Total VRAM in GB — matches the Tesla P100 16GB platform string used elsewhere.
VRAM_TOTAL_GB = 16.0
VRAM_TOTAL_GB_GTX = 6.0

# ComfyUI idle cooldown before reloading llama.cpp model (seconds)
COMFY_IDLE_COOLDOWN_SECONDS = int(os.environ.get("COMFY_IDLE_COOLDOWN_SECONDS", "180"))

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
            "home/129/sensor/disk_utilization_root": "storage_percent",
            "home/129/sensor/gtx_1060_temp": "gpu_temp_gtx",
            "home/129/sensor/gtx_utilization": "gpu_util_gtx",
            "home/129/sensor/gram_utilization": "vram_percent_gtx",
        },
}


def safe_join(base_dir: str, *path_parts: str) -> str:
    resolved_base = os.path.realpath(base_dir)
    target = os.path.realpath(os.path.join(resolved_base, *path_parts))
    if not target.startswith(resolved_base):
        raise HTTPException(status_code=400, detail="Access denied (outside root folder)")
    return target


def _deep_copy(d: dict) -> dict:
    return json.loads(json.dumps(d))


def get_local_stats() -> dict:
    stats: dict = {}
    stats["cpu_util"] = psutil.cpu_percent()
    ram = psutil.virtual_memory()
    stats["ram_percent"] = ram.percent
    try:
        usage = psutil.disk_usage("/")
        stats["storage_percent"] = usage.percent
        stats["storage_used_gb"] = round(usage.used / (1024 ** 3), 1)
        stats["storage_total_gb"] = round(usage.total / (1024 ** 3), 1)
        stats["storage_free_gb"] = round(usage.free / (1024 ** 3), 1)
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
            [
                "nvidia-smi",
                "--query-gpu=temperature.gpu,utilization.gpu,memory.used,memory.total",
                "--format=csv,noheader,nounits",
            ],
            capture_output=True,
            text=True,
            timeout=2,
        )
        if res.returncode == 0:
            parts = res.stdout.strip().split(",")
            if len(parts) >= 4:
                stats["gpu_temp"] = float(parts[0].strip())
                stats["gpu_util"] = float(parts[1].strip())
                used_gb = float(parts[2].strip()) / 1024.0
                total_gb = float(parts[3].strip()) / 1024.0
                if total_gb > 0:
                    stats["vram_percent"] = round((used_gb / total_gb) * 100, 1)
                # Absolute VRAM used in GB — more reliable than percentage.
                stats["vram_used_gb"] = round(used_gb, 2)
    except Exception:
        pass
    return stats


def get_quantization_from_name(name: str) -> str:
    match = re.search(r'\b(Q[0-9]_[K_M_L_S_X_]+|IQ[0-9]_[A-Z_]+)\b', name, re.IGNORECASE)
    if match:
        return match.group(1).upper()
    return "Unknown"
