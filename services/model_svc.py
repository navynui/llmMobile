import os
import re
import asyncio
import httpx
from fastapi import HTTPException
from typing import Optional

from utils.common import MODES_INI_PATH, MODELS_DIR
from models.requests import ModelActionRequest, ModelsIniRequest

async def _get_preset_id_for_model(model_id: str) -> str:
    if not model_id:
        return model_id
    try:
        async with httpx.AsyncClient() as client:
            res = await client.get("http://llm-server:8080/models", timeout=3)
            if res.status_code == 200:
                presets = [m["id"] for m in res.json().get("data", [])]
                # Search for a case-insensitive match (with or without extension)
                norm_id = model_id.lower()
                for preset in presets:
                    p_low = preset.lower()
                    if p_low == norm_id or p_low.replace(".gguf", "") == norm_id.replace(".gguf", ""):
                        return preset
    except Exception as e:
        print(f"[Preset Matching] Failed to fetch active models: {e}")
    # Fallback:
    if model_id.lower() == "default":
        return "default"
    return model_id if model_id.lower().endswith(".gguf") else (model_id + ".gguf")

def _add_to_models_ini(filename: str):
    if not os.path.exists(MODES_INI_PATH):
        try:
            os.makedirs(os.path.dirname(MODES_INI_PATH), exist_ok=True)
            with open(MODES_INI_PATH, "w") as f:
                f.write("")
        except Exception:
            return

    # Check if already present in models.ini
    already_present = False
    try:
        with open(MODES_INI_PATH, "r") as f:
            content = f.read()
            if f"[{filename}]" in content or f"[{filename.lower()}]" in content.lower():
                already_present = True
    except Exception:
        pass

    if not already_present:
        try:
            block = f"""

[{filename}]
model = /models/{filename}
n-gpu-layers = -1
"""
            with open(MODES_INI_PATH, "a") as f:
                f.write(block)
            print(f"[Models INI] Auto-registered preset config block for {filename}")
        except Exception as e:
            print(f"[Models INI] Failed to auto-add {filename}: {e}")

def _remove_from_models_ini(filename: str):
    if not os.path.exists(MODES_INI_PATH):
        return
    try:
        with open(MODES_INI_PATH, "r") as f:
            lines = f.readlines()

        new_lines = []
        skip_section = False
        target_lower = filename.lower()
        target_base = target_lower[:-5] if target_lower.endswith(".gguf") else target_lower

        for line in lines:
            line_stripped = line.strip()
            # Check if line is a section header
            if line_stripped.startswith("[") and line_stripped.endswith("]"):
                section_name = line_stripped[1:-1].lower()
                section_base = section_name[:-5] if section_name.endswith(".gguf") else section_name
                
                if section_base == target_base:
                    skip_section = True
                    continue
                else:
                    skip_section = False

            if skip_section:
                continue

            new_lines.append(line)

        with open(MODES_INI_PATH, "w") as f:
            f.writelines(new_lines)
        print(f"[Models INI] Cleaned up {filename} from models.ini")
    except Exception as e:
        print(f"[Models INI] Failed to clean up {filename}: {e}")

def list_models():
    if not os.path.exists(MODES_INI_PATH):
        return {"models": []}
    models = []
    try:
        with open(MODES_INI_PATH) as f:
            current_model = None
            is_default = False
            for line in f:
                line = line.strip()
                if not line or line.startswith(";"):
                    continue
                m = re.match(r'^\[(.+?)\.gguf\]$', line, re.IGNORECASE)
                if m:
                    if current_model:
                        models.append({"filename": current_model, "is_default": is_default})
                    current_model = m.group(1) + ".gguf"
                    is_default = False
                elif "load-on-startup" in line and "true" in line.lower() and current_model:
                    is_default = True
            if current_model:
                models.append({"filename": current_model, "is_default": is_default})
    except Exception as e:
        print(f"[Models INI] Failed to parse: {e}")
    return {"models": models}

def delete_model(filename: str):
    if not filename.endswith(".gguf") or "/" in filename or "\\" in filename:
        raise HTTPException(status_code=400, detail="Invalid filename")
    path = os.path.join(MODELS_DIR, filename)
    if os.path.exists(path):
        os.remove(path)
    
    # Also clean up models.ini configuration
    _remove_from_models_ini(filename)
    
    return {"detail": f"Deleted {filename} and updated models.ini"}

def get_models_ini():
    if not os.path.exists(MODES_INI_PATH):
        return {"content": ""}
    try:
        with open(MODES_INI_PATH, "r") as f:
            return {"content": f.read()}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

def save_models_ini(req: ModelsIniRequest):
    try:
        os.makedirs(os.path.dirname(MODES_INI_PATH), exist_ok=True)
        with open(MODES_INI_PATH, "w") as f:
            f.write(req.content)
        return {"detail": "models.ini updated successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

async def proxy_llm_models():
    async with httpx.AsyncClient() as c:
        try:
            return (await c.get("http://llm-server:8080/models", timeout=5)).json()
        except Exception as e:
            raise HTTPException(status_code=502, detail=str(e))

async def proxy_llm_load(req: ModelActionRequest):
    async with httpx.AsyncClient() as c:
        try:
            preset_id = await _get_preset_id_for_model(req.model)
            resp = await c.post("http://llm-server:8080/models/load", json={"model": preset_id}, timeout=30)
            result = resp.json()

            # On success, spawn a background coroutine to capture VRAM.
            if resp.status_code == 200:
                model_id = req.model
                async def _capture_vram():
                    from services.vram_svc import wait_for_idle_trigger, capture_and_store_vram
                    await wait_for_idle_trigger()
                    await asyncio.sleep(3)
                    vram_gb = await capture_and_store_vram(model_id, status="good")
                    if vram_gb is not None:
                        print(f"[VRAM] Captured VRAM for {model_id}: {vram_gb} GB")
                try:
                    asyncio.create_task(_capture_vram())
                except Exception as e:
                    print(f"[VRAM] Failed to create capture task: {e}")

            return result
        except Exception as e:
            raise HTTPException(status_code=502, detail=str(e))

async def proxy_llm_unload(req: ModelActionRequest):
    async with httpx.AsyncClient() as c:
        try:
            preset_id = await _get_preset_id_for_model(req.model)
            return (await c.post("http://llm-server:8080/models/unload", json={"model": preset_id}, timeout=10)).json()
        except Exception as e:
            raise HTTPException(status_code=502, detail=str(e))

async def get_vision_capabilities():
    try:
        async with httpx.AsyncClient() as c:
            resp = await c.get("http://llm-server:8080/models", timeout=3)
            if resp.status_code != 200:
                raise HTTPException(status_code=502, detail="Failed to fetch model metadata")
            data = resp.json()
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))

    models_metadata = {}
    for m in data.get("data", []):
        mid = m.get("id") or str(m.get("model_id", ""))
        status_dict = m.get("status") if isinstance(m.get("status"), dict) else None

        vision_capable = False
        has_mmproj = False

        if status_dict:
            vis_enabled = status_dict.get("vision_enabled", False)
            vis_loaded  = status_dict.get("vision_model_loaded", False)
            vision_capable = bool(vis_enabled or vis_loaded)

            args_raw = status_dict.get("args")
            if isinstance(args_raw, list):
                has_mmproj = "--mmproj" in args_raw
            elif isinstance(args_raw, str):
                has_mmproj = "--mmproj" in args_raw

        if not vision_capable:
            mid_lower = mid.lower()
            vision_capable = any(
                x in mid_lower
                for x in ["mmproj", "clip_l", "llava", "moondream"]
            )

        models_metadata[mid] = {
            "model_id": mid,
            "vision_capable": vision_capable or has_mmproj,
            "has_mmproj": has_mmproj
        }
    return {"models": models_metadata}

async def get_vision_capabilities_mini():
    try:
        async with httpx.AsyncClient() as c:
            resp = await c.get("http://llm-server-mini:8080/models", timeout=3)
            if resp.status_code != 200:
                raise HTTPException(status_code=502, detail="Failed to fetch mini model metadata")
            data = resp.json()
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))
    models_metadata = {}
    for m in data.get("data", []):
        mid = m.get("id") or str(m.get("model_id", ""))
        status_dict = m.get("status") if isinstance(m.get("status"), dict) else None
        vision_capable = False; has_mmproj = False
        if status_dict:
            vis_enabled = status_dict.get("vision_enabled", False)
            vis_loaded  = status_dict.get("vision_model_loaded", False)
            vision_capable = bool(vis_enabled or vis_loaded)
            args_raw = status_dict.get("args")
            if isinstance(args_raw, list):
                has_mmproj = "--mmproj" in args_raw
            elif isinstance(args_raw, str):
                has_mmproj = "--mmproj" in args_raw
        if not vision_capable:
            mid_lower = mid.lower()
            vision_capable = any(x in mid_lower for x in ["mmproj", "clip_l", "llava", "moondream"])
        models_metadata[mid] = {"model_id": mid, "vision_capable": vision_capable or has_mmproj, "has_mmproj": has_mmproj}
    return {"models": models_metadata}



# ── llama-server-mini / modelg.ini ─────────────────────────────────────────
MINI_MODELS_INI = "/models/modelg.ini"

def _list_models_from_ini(ini_path: str) -> list:
    """Parse a models INI file and return a list of model dicts."""
    if not os.path.exists(ini_path):
        return []
    models = []
    try:
        with open(ini_path) as f:
            current_model = None
            is_default = False
            for line in f:
                line = line.strip()
                if not line or line.startswith(";"):
                    continue
                m = re.match(r'^\[(.+?)\.gguf\]$', line, re.IGNORECASE)
                if m:
                    if current_model:
                        models.append({"filename": current_model, "is_default": is_default})
                    current_model = m.group(1) + ".gguf"
                    is_default = False
                elif "load-on-startup" in line and "true" in line.lower() and current_model:
                    is_default = True
            if current_model:
                models.append({"filename": current_model, "is_default": is_default})
    except Exception as e:
        print(f"[Models INI] Failed to parse {ini_path}: {e}")
    return models

def _add_to_ini(filename: str, ini_path: str):
    if not os.path.exists(ini_path):
        try:
            os.makedirs(os.path.dirname(ini_path), exist_ok=True)
            with open(ini_path, "w") as f:
                f.write("")
        except Exception:
            return
    already_present = False
    try:
        with open(ini_path, "r") as f:
            content = f.read()
            if f"[{filename}]" in content or f"[{filename.lower()}]" in content.lower():
                already_present = True
    except Exception:
        pass
    if not already_present:
        try:
            block = f"""

[{filename}]
model = /models/{filename}
n-gpu-layers = -1
"""
            with open(ini_path, "a") as f:
                f.write(block)
            print(f"[Models INI] Auto-registered {filename} in {ini_path}")
        except Exception as e:
            print(f"[Models INI] Failed to auto-add {filename} to {ini_path}: {e}")

def _remove_from_ini(filename: str, ini_path: str):
    if not os.path.exists(ini_path):
        return
    try:
        with open(ini_path, "r") as f:
            lines = f.readlines()
        new_lines = []
        skip_section = False
        target_lower = filename.lower()
        target_base = target_lower[:-5] if target_lower.endswith(".gguf") else target_lower
        for line in lines:
            line_stripped = line.strip()
            if line_stripped.startswith("[") and line_stripped.endswith("]"):
                section_name = line_stripped[1:-1].lower()
                section_base = section_name[:-5] if section_name.endswith(".gguf") else section_name
                if section_base == target_base:
                    skip_section = True
                    continue
                else:
                    skip_section = False
            if skip_section:
                continue
            new_lines.append(line)
        with open(ini_path, "w") as f:
            f.writelines(new_lines)
        print(f"[Models INI] Cleaned up {filename} from {ini_path}")
    except Exception as e:
        print(f"[Models INI] Failed to clean up {filename} from {ini_path}: {e}")

MINI_SERVER_URL = "http://llm-server-mini:8080"

def list_mini_models():
    return {"models": _list_models_from_ini(MINI_MODELS_INI)}

def get_models_mini_ini():
    if not os.path.exists(MINI_MODELS_INI):
        return {"content": ""}
    try:
        with open(MINI_MODELS_INI, "r") as f:
            return {"content": f.read()}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

def save_models_mini_ini(req: ModelsIniRequest):
    try:
        os.makedirs(os.path.dirname(MINI_MODELS_INI), exist_ok=True)
        with open(MINI_MODELS_INI, "w") as f:
            f.write(req.content)
        return {"detail": "modelg.ini updated successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

def delete_model_from_mini(filename: str):
    if not filename.endswith(".gguf") or "/" in filename or "\\" in filename:
        raise HTTPException(status_code=400, detail="Invalid filename")
    path = os.path.join(MODELS_DIR, filename)
    if os.path.exists(path):
        os.remove(path)
    _remove_from_ini(filename, MINI_MODELS_INI)
    return {"detail": f"Deleted {filename} and updated modelg.ini"}

async def proxy_llm_mini_models():
    async with httpx.AsyncClient() as c:
        try:
            return (await c.get(f"{MINI_SERVER_URL}/models", timeout=5)).json()
        except Exception as e:
            raise HTTPException(status_code=502, detail=str(e))

async def proxy_llm_mini_load(req: ModelActionRequest):
    async with httpx.AsyncClient() as c:
        try:
            preset_id = await _get_preset_id_for_model(req.model)
            resp = await c.post(f"{MINI_SERVER_URL}/models/load", json={"model": preset_id}, timeout=30)
            return resp.json()
        except Exception as e:
            raise HTTPException(status_code=502, detail=str(e))

async def proxy_llm_mini_unload(req: ModelActionRequest):
    async with httpx.AsyncClient() as c:
        try:
            preset_id = await _get_preset_id_for_model(req.model)
            return (await c.post(f"{MINI_SERVER_URL}/models/unload", json={"model": preset_id}, timeout=10)).json()
        except Exception as e:
            raise HTTPException(status_code=502, detail=str(e))

async def scan_mini_and_register():
    if not os.path.exists(MODELS_DIR):
        return {"detail": "Models directory not found"}
    added_count = 0
    for fname in os.listdir(MODELS_DIR):
        if fname.endswith(".gguf"):
            try:
                _add_to_ini(fname, MINI_MODELS_INI)
            except Exception as e:
                print(f"Error adding {fname} to modelg.ini: {e}")
                continue
            added_count += 1
    return {"detail": f"Scan complete. Added {added_count} models to modelg.ini."}
