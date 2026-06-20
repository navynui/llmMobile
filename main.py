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
import traceback
import urllib.parse
import psutil
import docker
import httpx
import paho.mqtt.client as mqtt
import websocket as ws_client
import sqlite3
from typing import Optional, List, Dict, Any
from pydantic import BaseModel
from fastapi import FastAPI, HTTPException, Request, Response, BackgroundTasks
from fastapi.responses import HTMLResponse, StreamingResponse, JSONResponse
from fastapi.staticfiles import StaticFiles


app = FastAPI(title="LLM Mobile Manager")

# --- Import utils and models ---
from utils.common import (
    MODES_INI_PATH, MODELS_DIR, IMAGE_GEN_OUTPUT, WORKFLOW_PATH, PROMPTS_FILE,
    LLM_PROJECT_NAME, LLM_COMPOSE_DIR, COMFYUI_HOST, COMFY_CLIENT_ID,
    NODE_PROMPT_TEXT, NODE_RESOLUTION, NODE_KSAMPLER,
    VRAM_CRITICAL_THRESHOLD, VRAM_EMERGENCY_THRESHOLD, MQTT_CONFIG,
    safe_join, _deep_copy, get_local_stats
)
from utils.db_utils import DB_PATH, get_db_conn, consolidate_database, _clean_model_id
from utils.bench_log import BENCHMARK_LOG_DIR, BENCHMARK_EXECUTION_LOG, _rotate_benchmark_log_if_needed
from models.requests import (
    ModelsIniRequest, ModelActionRequest, GenerateRequest, MkdirRequest,
    MoveRequest, DeleteRequest, DownloadRequest, BenchmarkRunRequest,
    BenchmarkQueueRequest, JudgeRequest
)

os.makedirs(IMAGE_GEN_OUTPUT, exist_ok=True)

# --- Service imports ---
from services.docker_svc import (
    get_docker_client, get_status, get_system_stats, start_llm, stop_llm,
    _start_mqtt_listener, _local_stats_poller, _stats_cache, _stats_lock
)
from services.model_svc import (
    list_models, delete_model, get_models_ini, save_models_ini,
    proxy_llm_models, proxy_llm_load, proxy_llm_unload, get_vision_capabilities,
    _get_preset_id_for_model, _add_to_models_ini, _remove_from_models_ini
)
from services.chat_svc import proxy_chat
from services.sse_svc import stream_status, startup as sse_startup, broadcast_notification
from services.comfy_svc import (
    queue_worker, broadcast_queue, get_queue_snapshot, load_persisted_queue,
    _queue_lock, _gen_queue, _queue_sse_subscribers,
    is_queue_running, set_queue_running,
    _COMFY_HTTP
)
from services.gallery_svc import (
    browse_gallery as svc_browse_gallery,
    get_all_folders as svc_get_all_folders,
    gallery_mkdir as svc_gallery_mkdir,
    gallery_move as svc_gallery_move,
    gallery_delete as svc_gallery_delete,
)
from services.push_svc import (
    init_push, get_vapid_public_key, subscribe as push_subscribe,
    unsubscribe as push_unsubscribe, send_push
)

# ───────────────────────────────────────────────
# Startup
# ───────────────────────────────────────────────

@app.on_event("startup")
async def startup_event():
    consolidate_database()
    asyncio.create_task(_download_queue_worker())
    _start_mqtt_listener()
    asyncio.create_task(_local_stats_poller())
    sse_startup()
    init_push()
    has_queued = load_persisted_queue()
    if has_queued and not is_queue_running():
        set_queue_running(True)
        asyncio.create_task(queue_worker(send_push_fn=send_push))


# ───────────────────────────────────────────────
# REST endpoints – server control
# ───────────────────────────────────────────────

@app.get("/status")
def route_get_status():
    return get_status()


@app.get("/system_stats")
def route_get_system_stats():
    return get_system_stats()


@app.post("/start")
def route_start_llm():
    return start_llm()


@app.post("/stop")
def route_stop_llm():
    return stop_llm()


# ───────────────────────────────────────────────
# REST endpoints – model management
# ───────────────────────────────────────────────

@app.get("/models")
def route_list_models():
    return list_models()


@app.delete("/models/{filename}")
def route_delete_model(filename: str):
    return delete_model(filename)


@app.get("/api/models_ini")
def route_get_models_ini():
    return get_models_ini()


@app.post("/api/models_ini")
def route_save_models_ini(req: ModelsIniRequest):
    return save_models_ini(req)


@app.get("/api/llm/models")
async def route_proxy_llm_models():
    return await proxy_llm_models()


@app.post("/api/llm/models/load")
async def route_proxy_llm_load(req: ModelActionRequest):
    return await proxy_llm_load(req)


@app.post("/api/llm/models/unload")
async def route_proxy_llm_unload(req: ModelActionRequest):
    return await proxy_llm_unload(req)


@app.get("/models/vision-capabilities")
async def route_get_vision_capabilities():
    return await get_vision_capabilities()

@app.post("/api/chat/completions")
async def route_proxy_chat(request: Request):
    return await proxy_chat(request)


# ───────────────────────────────────────────────
# SSE – /events/status
# ───────────────────────────────────────────────

@app.get("/events/status")
async def route_stream_status(request: Request, since: str = "0"):
    return await stream_status(request, since)


# ───────────────────────────────────────────────
# (ComfyUI helpers, queue state, push notification helpers
# have been moved to services/comfy_svc.py and services/push_svc.py)
# ───────────────────────────────────────────────




# ───────────────────────────────────────────────
# REST endpoints – generation queue
# ───────────────────────────────────────────────

# (GenerateRequest is imported from models.requests)


@app.post("/api/generate/queue")
async def submit_to_queue(req: GenerateRequest):
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
        should_start = not is_queue_running()

    await broadcast_queue()

    if should_start:
        set_queue_running(True)
        asyncio.create_task(queue_worker(send_push_fn=send_push))

    return {"queue_id": queue_id, "position": len(_gen_queue)}


@app.get("/api/generate/queue")
def get_queue():
    return {"queue": get_queue_snapshot()}


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
    await broadcast_queue()
    return {"detail": f"Cancelled {queue_id}"}


@app.delete("/api/generate/queue")
async def clear_completed():
    with _queue_lock:
        done = {"completed", "error", "cancelled"}
        removable = [i for i in _gen_queue if i["status"] in done]
        for r in removable:
            _gen_queue.remove(r)
    await broadcast_queue()
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
            yield f"event: queue\ndata: {json.dumps({'queue': get_queue_snapshot()})}\n\n"
            while True:
                if await request.is_disconnected():
                    break
                try:
                    payload = await asyncio.wait_for(q.get(), timeout=15)
                    yield f"event: queue\ndata: {payload}\n\n"
                except asyncio.TimeoutError:
                    yield ": keepalive\n\n"
        finally:
            try:
                _queue_sse_subscribers.remove(q)
            except ValueError:
                pass

    return StreamingResponse(_gen(), media_type="text/event-stream")


# ───────────────────────────────────────────────
# REST endpoints – gallery
# (delegated to services/gallery_svc.py)
# ───────────────────────────────────────────────

@app.get("/api/gallery/browse")
def browse_gallery(path: str = "", page: int = 1, limit: int = 24):
    return svc_browse_gallery(path=path, page=page, limit=limit)


@app.get("/api/gallery/all_folders")
def get_all_folders():
    return svc_get_all_folders()


@app.post("/api/gallery/mkdir")
def gallery_mkdir(req: MkdirRequest):
    return svc_gallery_mkdir(req)


@app.post("/api/gallery/move")
def gallery_move(req: MoveRequest):
    return svc_gallery_move(req)


@app.post("/api/gallery/delete")
def gallery_delete(req: DeleteRequest):
    return svc_gallery_delete(req)


# ───────────────────────────────────────────────
# Phase 5 – Model Downloader & Benchmarks Backend
# ───────────────────────────────────────────────

_downloads_lock = threading.Lock()
_active_downloads: Dict[str, Dict[str, Any]] = {}  # key: f"{repo_id}/{filename}"
_download_queue = asyncio.Queue()

async def _download_queue_worker():
    print("[Download Queue] Asynchronous Sequential Download Worker started.")
    while True:
        try:
            repo_id, filename = await _download_queue.get()
            print(f"[Download Queue] Starting sequential download for: {repo_id}/{filename}")
            try:
                await _download_model_task(repo_id, filename)
            except Exception as e:
                print(f"[Download Queue] Exception in download task for {filename}: {e}")
            finally:
                _download_queue.task_done()
        except asyncio.CancelledError:
            break
        except Exception as e:
            print(f"[Download Queue] Queue worker error: {e}")
            await asyncio.sleep(2)

# (DownloadRequest is imported from models.requests)

async def _download_model_task(repo_id: str, filename: str):
    key = f"{repo_id}/{filename}"
    url = f"https://huggingface.co/{repo_id}/resolve/main/{filename}"
    dest_path = os.path.join(MODELS_DIR, filename)
    temp_path = dest_path + ".download"

    current_bytes = 0
    if os.path.exists(temp_path):
        current_bytes = os.path.getsize(temp_path)

    with _downloads_lock:
        _active_downloads[key] = {
            "repo_id": repo_id,
            "filename": filename,
            "status": "downloading",
            "downloaded": current_bytes,
            "total": 0,
            "speed": "0 KB/s",
            "progress": 0.0,
            "error": None
        }

    model_id = _clean_model_id(filename)
    try:
        conn = get_db_conn()
        cursor = conn.cursor()
        cursor.execute("""
            UPDATE models 
            SET status = 'DOWNLOADING', notes = 'Downloading GGUF file...' 
            WHERE model_id = ?
        """, (model_id,))
        conn.commit()
        conn.close()
    except Exception as db_err:
        print(f"[Download DB] Failed to update status to DOWNLOADING: {db_err}")

    headers = {}
    if current_bytes > 0:
        headers["Range"] = f"bytes={current_bytes}-"

    try:
        async with httpx.AsyncClient(follow_redirects=True, timeout=30.0) as client:
            async with client.stream("GET", url, headers=headers) as r:
                if r.status_code == 416:
                    # Range not satisfiable (might already be completed)
                    r_head = await client.head(url)
                    total_bytes = int(r_head.headers.get("content-length", 0))
                    current_bytes = total_bytes
                    shutil.move(temp_path, dest_path)
                    _add_to_models_ini(filename)
                    with _downloads_lock:
                        _active_downloads[key].update({
                            "status": "completed",
                            "downloaded": total_bytes,
                            "total": total_bytes,
                            "progress": 1.0
                        })
                    try:
                        conn = get_db_conn()
                        cursor = conn.cursor()
                        cursor.execute("""
                            UPDATE models 
                            SET status = 'COMPLETED', notes = 'Download completed successfully' 
                            WHERE model_id = ?
                        """, (model_id,))
                        conn.commit()
                        conn.close()
                    except Exception as db_err:
                        print(f"[Download DB] Failed to update status to COMPLETED: {db_err}")
                    return
                elif r.status_code == 206:
                    # Partial content
                    total_bytes = current_bytes + int(r.headers.get("content-length", 0))
                    mode = "ab"
                else:
                    # Full download
                    total_bytes = int(r.headers.get("content-length", 0))
                    current_bytes = 0
                    mode = "wb"

                with _downloads_lock:
                    _active_downloads[key]["total"] = total_bytes

                start_time = time.time()
                last_update = time.time()
                bytes_since_update = 0

                with open(temp_path, mode) as f:
                    async for chunk in r.aiter_bytes(chunk_size=65536):
                        f.write(chunk)
                        current_bytes += len(chunk)
                        bytes_since_update += len(chunk)

                        now = time.time()
                        if now - last_update >= 1.0:
                            elapsed = now - last_update
                            speed_val = bytes_since_update / elapsed
                            if speed_val > 1024 * 1024:
                                speed_str = f"{speed_val / (1024*1024):.1f} MB/s"
                            else:
                                speed_str = f"{speed_val / 1024:.1f} KB/s"

                            progress_val = round(current_bytes / total_bytes, 4) if total_bytes > 0 else 0.0

                            with _downloads_lock:
                                _active_downloads[key].update({
                                    "downloaded": current_bytes,
                                    "speed": speed_str,
                                    "progress": progress_val
                                })
                            
                            last_update = now
                            bytes_since_update = 0

                # Check if fully downloaded
                if current_bytes >= total_bytes:
                    shutil.move(temp_path, dest_path)
                    _add_to_models_ini(filename)
                    with _downloads_lock:
                        _active_downloads[key].update({
                            "status": "completed",
                            "progress": 1.0,
                            "speed": "0 KB/s"
                        })
                    try:
                        conn = get_db_conn()
                        cursor = conn.cursor()
                        cursor.execute("""
                            UPDATE models 
                            SET status = 'COMPLETED', notes = 'Download completed successfully' 
                            WHERE model_id = ?
                        """, (model_id,))
                        conn.commit()
                        conn.close()
                    except Exception as db_err:
                        print(f"[Download DB] Failed to update status to COMPLETED: {db_err}")
                else:
                    raise Exception("Download connection closed prematurely")

    except Exception as e:
        with _downloads_lock:
            if key in _active_downloads:
                _active_downloads[key].update({
                    "status": "failed",
                    "error": str(e),
                    "speed": "0 KB/s"
                })
        try:
            conn = get_db_conn()
            cursor = conn.cursor()
            cursor.execute("""
                UPDATE models 
                SET status = 'FAILED', notes = ? 
                WHERE model_id = ?
            """, (f"Error: {str(e)}", model_id))
            conn.commit()
            conn.close()
        except Exception as db_err:
            print(f"[Download DB] Failed to update status to FAILED: {db_err}")


@app.get("/api/models/search")
async def search_hf_models(q: str):
    url = f"https://huggingface.co/api/models?search={urllib.parse.quote(q)}&filter=gguf&limit=10"
    async with httpx.AsyncClient() as client:
        try:
            r = await client.get(url, timeout=10.0)
            return r.json()
        except Exception as e:
            raise HTTPException(status_code=502, detail=str(e))

@app.get("/api/models/details")
async def get_hf_model_details(repo_id: str):
    url = f"https://huggingface.co/api/models/{repo_id}?blobs=true"
    async with httpx.AsyncClient() as client:
        try:
            r = await client.get(url, timeout=10.0)
            data = r.json()
            # Extract .gguf files with size
            gguf_files = []
            sibling_list = data.get("siblings", [])
            for s in sibling_list:
                fname = s.get("rfilename", "")
                if fname.lower().endswith(".gguf"):
                    gguf_files.append({
                        "filename": fname,
                        "size": s.get("size")
                    })
            return {"repo_id": repo_id, "gguf_files": gguf_files, "downloads": data.get("downloads", 0), "likes": data.get("likes", 0)}
        except Exception as e:
            raise HTTPException(status_code=502, detail=str(e))



@app.post("/api/models/download")
def download_model(req: DownloadRequest):
    key = f"{req.repo_id}/{req.filename}"
    with _downloads_lock:
        if key in _active_downloads and _active_downloads[key]["status"] in ["downloading", "queued"]:
            return {"detail": "Already in download queue or actively downloading", "key": key}
        
        _active_downloads[key] = {
            "repo_id": req.repo_id,
            "filename": req.filename,
            "status": "queued",
            "downloaded": 0,
            "total": 0,
            "speed": "Pending",
            "progress": 0.0,
            "error": None
        }
    
    # Save QUEUED state in DB
    try:
        conn = get_db_conn()
        cursor = conn.cursor()
        model_id = _clean_model_id(req.filename)
        cursor.execute("""
            INSERT INTO models (model_id, name, quantization, status, notes)
            VALUES (?, ?, ?, 'QUEUED', ?)
            ON CONFLICT(model_id) DO UPDATE SET
                status = 'QUEUED',
                notes = ?
        """, (model_id, req.filename, get_quantization_from_name(req.filename), "Queued for download", "Queued for download"))
        conn.commit()
        conn.close()
    except Exception as e:
        print(f"[Download Queue] Failed to write QUEUED state to DB: {e}")

    _download_queue.put_nowait((req.repo_id, req.filename))
    broadcast_notification(f"📥 Added {req.filename} to download queue.")
    return {"detail": "Added to download queue", "key": key}

@app.get("/api/models/downloads")
def get_downloads_status():
    with _downloads_lock:
        return {"downloads": list(_active_downloads.values())}

@app.post("/api/models/scan_and_register")
def scan_and_register_models():
    try:
        # 1. Get all GGUF files in MODELS_DIR
        if not os.path.exists(MODELS_DIR):
            return {"detail": "Models directory not found.", "registered": []}
            
        gguf_files = []
        for filename in os.listdir(MODELS_DIR):
            if filename.lower().endswith(".gguf"):
                if "mmproj" not in filename.lower():
                    gguf_files.append(filename)
                    
        # 2. Check what is already present in models.ini
        registered_in_ini = set()
        if os.path.exists(MODES_INI_PATH):
            try:
                with open(MODES_INI_PATH, "r") as f:
                    for line in f:
                        line = line.strip()
                        if not line or line.startswith(";"):
                            continue
                        m = re.match(r'^\[(.+?)\]$', line)
                        if m:
                            raw_name = m.group(1)
                            if raw_name == "*":
                                continue
                            if raw_name.lower().endswith(".gguf"):
                                registered_in_ini.add(raw_name.lower())
                                registered_in_ini.add(raw_name[:-5].lower())
                            else:
                                registered_in_ini.add(raw_name.lower())
                                registered_in_ini.add(f"{raw_name.lower()}.gguf")
            except Exception as e:
                print(f"[Scan] Failed to parse models.ini: {e}")
                
        # 3. Add missing models
        added = []
        for filename in gguf_files:
            if filename.lower() not in registered_in_ini:
                _add_to_models_ini(filename)
                added.append(filename)
                
        return {"detail": f"Scan complete. Registered {len(added)} new models.", "registered": added}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/benchmarks")
def get_benchmarks(show_all: bool = False):
    try:
        # 1. Parse models.ini and check what GGUF files exist on disk
        local_ready_filenames = set()
        if os.path.exists(MODES_INI_PATH):
            try:
                with open(MODES_INI_PATH) as f:
                    for line in f:
                        line = line.strip()
                        if not line or line.startswith(";"):
                            continue
                        m = re.match(r'^\[(.+?)\]$', line)
                        if m:
                            raw_name = m.group(1)
                            if raw_name == "*":
                                continue
                            if raw_name.lower().endswith(".gguf"):
                                base_name = raw_name[:-5]
                            else:
                                base_name = raw_name
                            filename = base_name + ".gguf"
                            # Check if the file exists on disk
                            if os.path.exists(os.path.join(MODELS_DIR, filename)):
                                local_ready_filenames.add(filename.lower())
                                local_ready_filenames.add(base_name.lower())  # Support both with & without .gguf
            except Exception as e:
                print(f"[Benchmarks API] Failed to parse models INI: {e}")

        # 2. Query database for tested models
        conn = get_db_conn()
        cursor = conn.cursor()
        
        query = """
        WITH latest_runs AS (
            SELECT tr.model_id, tr.run_id, tr.timestamp,
                   ROW_NUMBER() OVER (PARTITION BY tr.model_id ORDER BY tr.timestamp DESC) as rn
            FROM test_runs tr
        ),
        run_scores_agg AS (
            SELECT lr.model_id, lr.run_id, lr.timestamp,
                   SUM(rs.score) as total_score,
                   MAX(CASE WHEN rs.round_name = 'speed_metric' THEN rs.speed_tps END) as avg_tps
            FROM latest_runs lr
            JOIN round_scores rs ON lr.run_id = rs.run_id
            WHERE lr.rn = 1
            GROUP BY lr.model_id, lr.run_id, lr.timestamp
        )
        SELECT m.model_id, m.name, m.quantization, m.status, m.notes,
               rsa.run_id, rsa.timestamp, rsa.total_score, rsa.avg_tps,
               (SELECT COUNT(*) FROM model_hallucinations mh WHERE mh.model_id = m.model_id) as hallucination_count
        FROM models m
        JOIN run_scores_agg rsa ON m.model_id = rsa.model_id
        ORDER BY rsa.total_score DESC;
        """
        
        cursor.execute(query)
        rows = cursor.fetchall()
        conn.close()
        
        benchmarks = []
        tested_names_lower = set()
        
        for r in rows:
            avg_tps = r["avg_tps"] or 0.0
            total_score = r["total_score"] or 0
            hallucinated = r["hallucination_count"] > 0
            model_name = r["name"]
            
            # Add both with and without .gguf versions of the tested model name
            name_low = model_name.lower()
            tested_names_lower.add(name_low)
            if name_low.endswith(".gguf"):
                tested_names_lower.add(name_low[:-5])
            else:
                tested_names_lower.add(name_low + ".gguf")
            
            # Also add lowercase model_id to prevent duplicates with untested models
            tested_names_lower.add(r["model_id"].lower())
            
            # Determine if this model is ready on disk
            is_model_ready = (name_low in local_ready_filenames) or (r["model_id"].lower() in local_ready_filenames)
            
            # Apply strict filters if show_all is False
            if not show_all:
                if avg_tps < 20.0 or hallucinated or total_score < 50:
                    # Do not filter out the model if it is currently ready on disk!
                    if not is_model_ready:
                        continue
            
            benchmarks.append({
                "model_id": r["model_id"],
                "model": model_name,
                "platform": "Tesla P100 (16GB)",
                "quant": r["quantization"] or "Unknown",
                "tokens_sec": round(avg_tps, 1),
                "score": total_score,
                "is_ready": is_model_ready,
                "is_tested": True
            })
            
        # 3. Append ready models that have NOT been tested yet
        if os.path.exists(MODES_INI_PATH):
            try:
                with open(MODES_INI_PATH) as f:
                    for line in f:
                        line = line.strip()
                        if not line or line.startswith(";"):
                            continue
                        m = re.match(r'^\[(.+?)\]$', line)
                        if m:
                            raw_name = m.group(1)
                            if raw_name == "*":
                                continue
                            if raw_name.lower().endswith(".gguf"):
                                base_name = raw_name[:-5]
                            else:
                                base_name = raw_name
                            filename = base_name + ".gguf"
                            if filename.lower() in local_ready_filenames and filename.lower() not in tested_names_lower:
                                benchmarks.append({
                                    "model_id": filename,
                                    "model": filename,
                                    "platform": "Ready",
                                    "quant": get_quantization_from_name(filename),
                                    "tokens_sec": None,
                                    "score": None,
                                    "is_ready": True,
                                    "is_tested": False
                                })
            except Exception as e:
                print(f"[Benchmarks API] Failed to append ready models: {e}")
                
        return {"benchmarks": benchmarks}
    except Exception as e:
        print(f"Error querying benchmarks database: {e}")
        return {"benchmarks": [], "error": str(e)}


@app.get("/api/benchmarks/details")
def get_benchmark_details(model_id: str):
    try:
        model_id = _clean_model_id(model_id)
        conn = get_db_conn()
        cursor = conn.cursor()
        
        # 1. Fetch model metadata
        cursor.execute("SELECT model_id, name, quantization, status, notes FROM models WHERE model_id = ?", (model_id,))
        model_row = cursor.fetchone()
        if not model_row:
            conn.close()
            raise HTTPException(status_code=404, detail="Model benchmark record not found")
            
        # 2. Fetch latest run
        cursor.execute("SELECT run_id, timestamp FROM test_runs WHERE model_id = ? ORDER BY timestamp DESC LIMIT 1", (model_id,))
        run_row = cursor.fetchone()
        
        rounds = []
        hallucinations = []
        timestamp = None
        run_id = None
        
        if run_row:
            run_id = run_row["run_id"]
            timestamp = run_row["timestamp"]
            
            # Fetch scores
            cursor.execute("SELECT round_name, score, reasoning, speed_tps FROM round_scores WHERE run_id = ? ORDER BY id ASC", (run_id,))
            rounds = [dict(row) for row in cursor.fetchall()]
            
            # Fetch hallucinations
            cursor.execute("SELECT round_name, description FROM model_hallucinations WHERE model_id = ?", (model_id,))
            hallucinations = [dict(row) for row in cursor.fetchall()]
            
        conn.close()
        
        return {
            "model_id": model_row["model_id"],
            "name": model_row["name"],
            "quantization": model_row["quantization"],
            "status": model_row["status"],
            "notes": model_row["notes"],
            "run_id": run_id,
            "timestamp": timestamp,
            "rounds": rounds,
            "hallucinations": hallucinations
        }
    except HTTPException as he:
        raise he
    except Exception as e:
        print(f"Error fetching benchmark details for {model_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

_benchmark_running = False
_benchmark_lock = asyncio.Lock()
_benchmark_progress = {
    "running": False,
    "model_id": "",
    "current_round": "",
    "rounds_completed": 0,
    "total_rounds": 5,
    "logs": [],
    "queue_running": False,
    "queue": [],
    "queue_completed": [],
    "queue_current_index": 0
}

# (BENCHMARK_LOG_DIR, BENCHMARK_EXECUTION_LOG, and _rotate_benchmark_log_if_needed are imported from utils.bench_log)


def log_benchmark_progress(msg: str):
    print(msg)
    _benchmark_progress["logs"].append(f"[{time.strftime('%H:%M:%S')}] {msg}")
    if len(_benchmark_progress["logs"]) > 200:
        _benchmark_progress["logs"].pop(0)

    # Also write to persistent log file (best-effort, never fail the app for this)
    try:
        os.makedirs(BENCHMARK_LOG_DIR, exist_ok=True)
        _rotate_benchmark_log_if_needed()
        with open(BENCHMARK_EXECUTION_LOG, "a", encoding="utf-8") as f:
            f.write(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] {msg}\n")
    except Exception:
        pass


def log_benchmark_error(msg: str):
    """Write an error-level benchmark log with full traceback."""
    import traceback as _tb
    ts = time.strftime("%Y-%m-%d %H:%M:%S")
    line = f"[{ts}] ERROR: {msg}"
    print(line)
    
    try:
        os.makedirs(BENCHMARK_LOG_DIR, exist_ok=True)
        _rotate_benchmark_log_if_needed()
        with open(BENCHMARK_EXECUTION_LOG, "a", encoding="utf-8") as f:
            f.write(f"{line}\n")
            tb_lines = traceback.format_exc().split("\n")
            # Skip the last line (it's just the exception name, already in 'msg')
            if len(tb_lines) > 1 and tb_lines[-1].strip() == "":
                f.write(f"Traceback:\n")
                for l in tb_lines[:-1]:
                    f.write(f"  {l}\n")
            else:
                for l in tb_lines:
                    if l.strip():
                        f.write(f"  {l}\n")
    except Exception:
        pass


def log_benchmark(msg: str):
    """Write a benchmark progress message to both console and persistent file."""
    print(msg)
    _benchmark_progress["logs"] = getattr(_benchmark_progress, "logs", [])  # ensure backwards compat
    if isinstance(_benchmark_progress.get("logs"), list) and len(_benchmark_progress["logs"]) < 200:
        _benchmark_progress["logs"].append(f"[{time.strftime('%H:%M:%S')}] {msg}")

    try:
        os.makedirs(BENCHMARK_LOG_DIR, exist_ok=True)
        _rotate_benchmark_log_if_needed()
        with open(BENCHMARK_EXECUTION_LOG, "a", encoding="utf-8") as f:
            f.write(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] {msg}\n")
    except Exception:
        pass


# (BenchmarkRunRequest is imported from models.requests)


async def run_benchmark_task(run_id: str, model_id: str, judge_model_id: Optional[str]):
    global _benchmark_running
    
    _benchmark_progress["running"] = True
    _benchmark_progress["model_id"] = model_id
    _benchmark_progress["current_round"] = "Initializing..."
    _benchmark_progress["rounds_completed"] = 0
    _benchmark_progress["logs"] = []
    
    log_benchmark(f"Starting benchmark sequence for model: {model_id}")
    
    prompts = {
        "Round 1: Knowledge QA": "What is the full formal name of Bangkok, Thailand? Please include the Thai script and official English translation.",
        "Round 2: Technical Reasoning / Domain Knowledge": "Explain how llama.cpp handles KV cache allocation dynamically during continuous batching on consumer GPUs. Compare paged attention vs. static buffers, and discuss VRAM fragmentation risks.",
        "Round 3: Code Generation": "Write a complete, highly optimized Python script using asyncio and aiohttp to concurrently scrape metadata from 50 URLs. Include a custom token bucket rate limiter, proper connection pooling, exponential backoff for 5xx errors, and clean handling of TaskGroup or gather exceptions.",
        "Round 4: Abstract Reasoning": "A matrix is rotated 90 degrees clockwise, then reflected horizontally across its center vertical axis, and finally rotated 180 degrees counter-clockwise. Describe the final state of an element originally at position (i, j) in an N x N matrix relative to its initial coordinates, showing step-by-step mathematical transformations.",
        "Round 5: Creative Writing": "Write a 500-word short story about a solo network engineer monitoring a globally distributed routing infrastructure in the year 2042 during an undocumented, silent anomaly. The style should be cyberpunk hard-boiled, told from a first-person perspective, emphasizing the psychological weight of isolation and technical minutiae."
    }
    
    rounds_list = []
    server_url = get_llm_server_url()
    # Use chat completions endpoint so instruct models receive proper
    # chat template formatting (raw /completion causes instruct models
    # like Gemma-4 to output placeholder templates instead of real answers)
    api_url = f"{server_url}/v1/chat/completions"
    
    try:
        async with httpx.AsyncClient(timeout=600.0) as client:
            for idx, (round_name, prompt_text) in enumerate(prompts.items(), 1):
                _benchmark_progress["current_round"] = round_name
                log_benchmark(f"Executing {round_name}...")
                
                preset_id = await _get_preset_id_for_model(model_id)
                payload = {
                    "model": preset_id,
                    "messages": [{"role": "user", "content": prompt_text}],
                    "temperature": 0.7,
                    "stream": False,
                    "max_tokens": 4096
                }
                
                start_time = time.time()
                content = ""
                tokens_predicted = 0
                speed_tps = 0.0
                duration = 0.0
                
                def _parse_response(response):
                    nonlocal content, tokens_predicted, speed_tps, duration
                    if response.status_code == 200:
                        res_data = response.json()
                        choice = res_data.get("choices", [{}])[0]
                        content = choice.get("message", {}).get("content", "")
                        usage = res_data.get("usage", {})
                        tokens_predicted = usage.get("completion_tokens", 0)
                        timings = res_data.get("timings", {})
                        speed_tps = timings.get("predicted_per_second", 0)
                        
                        if tokens_predicted == 0 and content:
                            tokens_predicted = len(content) // 4
                        
                        if speed_tps == 0 and duration > 0 and tokens_predicted > 0:
                            speed_tps = tokens_predicted / duration
                    else:
                        log_benchmark(f"HTTP error {response.status_code} in {round_name}: {response.text[:200]}")
                
                # Track whether we got a server error (non-200) so retries don't loop on persistent errors
                has_server_error = False
                try:
                    response = await client.post(api_url, json=payload)
                    _parse_response(response)
                    if response.status_code != 200:
                        content = ""  # Mark as empty for retry logic
                        has_server_error = True
                except Exception as round_err:
                    tb = traceback.format_exc()
                    log_benchmark_error(f"Model: {model_id}, Round: {round_name}, Error: {round_err}")
                    content = ""
                    has_server_error = True
                
                # Retry if content is empty (model hit token limit while thinking).
                # Skip retries on server errors since they won't help.
                retry_count = 0
                max_retries = 3
                while not content and retry_count < max_retries and not has_server_error:
                    retry_count += 1
                    log_benchmark(f"{round_name}: Empty response, retry {retry_count}/{max_retries}...")
                    await asyncio.sleep(5)  # brief pause before retry
                    try:
                        start_time = time.time()
                        response = await client.post(api_url, json=payload)
                        _parse_response(response)
                        if not content and response.status_code == 200 and tokens_predicted > 0:
                            log_benchmark(f"{round_name}: Retry {retry_count} succeeded")
                    except Exception as retry_err:
                        tb = traceback.format_exc()
                        log_benchmark_error(f"Model: {model_id}, Round: {round_name}, Retry error: {retry_err}")
                
                # Determine final outcome
                if not content and has_server_error:
                    # Don't retry on persistent server errors (retries won't help)
                    log_benchmark(f"{round_name}: Server error — no retries")
                    rounds_list.append({
                        "round_name": get_gold_key(round_name) or round_name,
                        "error": f"Server error (non-200 response), no content"
                    })
                elif not content and retry_count >= max_retries:
                    # Exhausted all retries with empty responses
                    log_benchmark(f"{round_name}: Exhausted all retries — empty response persisted")
                    rounds_list.append({
                        "round_name": get_gold_key(round_name) or round_name,
                        "error": f"Empty response after {max_retries} retries"
                    })
                elif content:
                    duration = time.time() - start_time
                    log_benchmark(f"Completed {round_name} in {duration:.2f}s | {tokens_predicted} tokens | {speed_tps:.2f} t/s")
                    rounds_list.append({
                        "round_name": get_gold_key(round_name) or round_name,
                        "prompt": prompt_text,
                        "response": content,
                        "metrics": {
                            "duration_seconds": round(duration, 2),
                            "tokens_generated": tokens_predicted,
                            "tokens_per_second": round(speed_tps, 2)
                        }
                    })
                
                _benchmark_progress["rounds_completed"] = idx
                
                if idx < len(prompts):
                    log_benchmark("Cooling down for 10 seconds to prevent VRAM locks...")
                    await asyncio.sleep(10)
                    
        # Compile and save JSON
        results = {
            "model_id": model_id,
            "model_name": os.path.basename(model_id),
            "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
            "rounds": rounds_list
        }
        
        out_dir = "/app/benchmark_results" if os.path.exists("/app") else "/home/nui/llmaCPP/benchmark_results"
        os.makedirs(out_dir, exist_ok=True)
        raw_output_path = os.path.join(out_dir, f"benchmark_{run_id}.json")
        
        with open(raw_output_path, "w", encoding="utf-8") as f:
            json.dump(results, f, indent=4, ensure_ascii=False)
            
        log_benchmark(f"Saved raw results to {raw_output_path}")
        
        # Trigger judge
        log_benchmark("Starting AI Judge grading sequence...")
        _benchmark_progress["current_round"] = "AI Judge Grading..."
        
        req = JudgeRequest(run_id=run_id, judge_model_id=judge_model_id)
        try:
            await judge_benchmark(req)
            log_benchmark("AI Judge grading sequence completed successfully!")
        except Exception as j_err:
            tb = traceback.format_exc()
            log_benchmark_error(f"Judge grading failed: {j_err}")
        
    except Exception as run_err:
        tb = traceback.format_exc()
        log_benchmark_error(f"Model: {model_id}, Benchmark failed: {run_err}")
        try:
            conn = get_db_conn()
            cursor = conn.cursor()
            cursor.execute("""
            INSERT INTO models (model_id, name, quantization, status, notes)
            VALUES (?, ?, ?, 'FAILED', ?)
            ON CONFLICT(model_id) DO UPDATE SET
                status = 'FAILED',
                notes = ?
            """, (model_id, os.path.basename(model_id), get_quantization_from_name(model_id), f"Failed: {str(run_err)}", f"Failed: {str(run_err)}"))
            conn.commit()
            conn.close()
        except Exception as db_err:
            log_benchmark_error(f"Model: {model_id}, Failed to record failure in DB: {db_err}")
    finally:
        async with _benchmark_lock:
            global _benchmark_running
            _benchmark_running = False
            _benchmark_progress["running"] = False
        _benchmark_progress["current_round"] = "Finished"


# (BenchmarkQueueRequest is imported from models.requests)


async def run_benchmark_queue_task(models: list[str], judge_model_id: str):
    global _benchmark_running
    
    _benchmark_progress["running"] = True
    _benchmark_progress["queue_running"] = True
    _benchmark_progress["queue"] = models
    _benchmark_progress["queue_completed"] = []
    _benchmark_progress["queue_current_index"] = 0
    _benchmark_progress["logs"] = []
    
    log_benchmark(f"Initializing automated benchmark queue for {len(models)} models using Judge: {judge_model_id}")
    
    try:
        for idx, model_id in enumerate(models):
            _benchmark_progress["queue_current_index"] = idx
            log_benchmark(f"--- Queue Progress: {idx+1}/{len(models)} | Starting Model: {model_id} ---")
            
            # 1. Load the test model via the server API
            preset_id = await _get_preset_id_for_model(model_id)
            log_benchmark(f"Queue: Requesting server to load test model: {model_id} (preset: {preset_id})")
            async with httpx.AsyncClient() as client:
                try:
                    load_res = await client.post("http://llm-server:8080/models/load", json={"model": preset_id}, timeout=30)
                    if load_res.status_code != 200:
                        try:
                            res_json = load_res.json()
                            error_msg = res_json.get("error", {}).get("message", "")
                            if "already running" in error_msg or "already loaded" in error_msg:
                                log_benchmark(f"Queue: {model_id} is already loaded and running.")
                            else:
                                tb = traceback.format_exc()
                                log_benchmark_error(f"Model: {model_id}, Server returned {load_res.status_code}: {error_msg}")
                                continue
                        except Exception as e:
                            tb = traceback.format_exc()
                            log_benchmark_error(f"Model: {model_id}, Server HTTP error {load_res.status_code}")
                            continue
                except Exception as e:
                    tb = traceback.format_exc()
                    log_benchmark_error(f"Model: {model_id}, Exception loading: {e}")
                    continue
            
            # 2. Wait for model to load successfully
            log_benchmark(f"Queue: Waiting for {model_id} to load...")
            loaded = False
            for _ in range(60): # wait up to 120 seconds
                await asyncio.sleep(2)
                curr_loaded = await _get_loaded_model()
                if curr_loaded and _clean_model_id(curr_loaded) == _clean_model_id(model_id):
                    loaded = True
                    break
            
            if not loaded:
                log_benchmark_error(f"Model: {model_id}, Timeout loading model")
                continue
                
            log_benchmark(f"Queue: Success! {model_id} loaded. Running benchmark...")
            
            # 3. Create run_id and run the benchmark rounds on the test model
            run_id = str(uuid.uuid4())
            timestamp = time.strftime("%Y-%m-%d %H:%M:%S")
            out_dir = "/app/benchmark_results" if os.path.exists("/app") else "/home/nui/llmaCPP/benchmark_results"
            raw_output_path = os.path.join(out_dir, f"benchmark_{run_id}.json")
            
            # Normalize model_id: lowercase + strip .gguf to avoid duplicate DB records
            # when the same model is loaded with different casing or suffix across runs
            norm_model_id = _clean_model_id(model_id)
            display_name = os.path.basename(model_id)
            
            # Insert or update status in DB as TESTING
            try:
                conn = get_db_conn()
                cursor = conn.cursor()
                cursor.execute("""
                INSERT INTO models (model_id, name, quantization, status, notes)
                VALUES (?, ?, ?, 'TESTING', ?)
                ON CONFLICT(model_id) DO UPDATE SET
                    status = 'TESTING',
                    notes = ?
                """, (norm_model_id, display_name, get_quantization_from_name(model_id), f"Queue run initiated at {timestamp}", f"Queue run initiated at {timestamp}"))
                
                # Delete old run records (idempotent: wipe previous runs for same model)
                cursor.execute("SELECT run_id FROM test_runs WHERE model_id = ?", (norm_model_id,))
                for old_run in cursor.fetchall():
                    cursor.execute("DELETE FROM test_runs WHERE run_id = ?", (old_run["run_id"],))
                    
                cursor.execute("""
                INSERT INTO test_runs (run_id, model_id, timestamp, raw_output_path)
                VALUES (?, ?, ?, ?)
                """, (run_id, norm_model_id, timestamp, raw_output_path))
                conn.commit()
                conn.close()
                # Use normalized id going forward so judge grading matches the DB record
                model_id = norm_model_id
            except Exception as db_err:
                tb = traceback.format_exc()
                log_benchmark_error(f"Model: {model_id}, Queue DB Error: {db_err}")
                continue
                
            prompts = {
                "Round 1: Knowledge QA": "What is the full formal name of Bangkok, Thailand? Please include the Thai script and official English translation.",
                "Round 2: Technical Reasoning / Domain Knowledge": "Explain how llama.cpp handles KV cache allocation dynamically during continuous batching on consumer GPUs. Compare paged attention vs. static buffers, and discuss VRAM fragmentation risks.",
                "Round 3: Code Generation": "Write a complete, highly optimized Python script using asyncio and aiohttp to concurrently scrape metadata from 50 URLs. Include a custom token bucket rate limiter, proper connection pooling, exponential backoff for 5xx errors, and clean handling of TaskGroup or gather exceptions.",
                "Round 4: Abstract Reasoning": "A matrix is rotated 90 degrees clockwise, then reflected horizontally across its center vertical axis, and finally rotated 180 degrees counter-clockwise. Describe the final state of an element originally at position (i, j) in an N x N matrix relative to its initial coordinates, showing step-by-step mathematical transformations.",
                "Round 5: Creative Writing": "Write a 500-word short story about a solo network engineer monitoring a globally distributed routing infrastructure in the year 2042 during an undocumented, silent anomaly. The style should be cyberpunk hard-boiled, told from a first-person perspective, emphasizing the psychological weight of isolation and technical minutiae."
            }
            
            rounds_list = []
            server_url = get_llm_server_url()
            # Use chat completions endpoint so instruct models receive proper
            # chat template formatting (raw /completion causes instruct models
            # like Gemma-4 to output placeholder templates instead of real answers)
            api_url = f"{server_url}/v1/chat/completions"
            
            async with httpx.AsyncClient(timeout=600.0) as client:
                for r_idx, (round_name, prompt_text) in enumerate(prompts.items(), 1):
                    _benchmark_progress["current_round"] = f"Model {idx+1}/{len(models)}: {round_name}"
                    _benchmark_progress["rounds_completed"] = r_idx - 1
                    
                    preset_id = await _get_preset_id_for_model(model_id)
                    log_benchmark(f"Executing {round_name} on {model_id} (preset: {preset_id})...")
                    payload = {
                        "model": preset_id,
                        "messages": [{"role": "user", "content": prompt_text}],
                        "temperature": 0.7,
                        "stream": False,
                        "max_tokens": 4096
                    }
                    start_time = time.time()
                    content = ""
                    tokens_predicted = 0
                    speed_tps = 0.0
                    duration = 0.0
                    
                    def _parse_response(response):
                        nonlocal content, tokens_predicted, speed_tps, duration
                        if response.status_code == 200:
                            res_data = response.json()
                            choice = res_data.get("choices", [{}])[0]
                            content = choice.get("message", {}).get("content", "")
                            usage = res_data.get("usage", {})
                            tokens_predicted = usage.get("completion_tokens", 0)
                            # Timings may be in top-level or per-choice depending on llama.cpp version
                            timings = res_data.get("timings", {})
                            speed_tps = timings.get("predicted_per_second", 0)
                            if tokens_predicted == 0 and content:
                                tokens_predicted = len(content) // 4
                            if speed_tps == 0 and duration > 0 and tokens_predicted > 0:
                                speed_tps = tokens_predicted / duration
                        else:
                            log_benchmark(f"HTTP error {response.status_code} in {round_name}: {response.text[:200]}")
                    
                    # Track whether we got a server error (non-200) so retries don't loop on persistent errors
                    has_server_error = False
                    try:
                        response = await client.post(api_url, json=payload)
                        _parse_response(response)
                        if response.status_code != 200:
                            content = ""
                            has_server_error = True
                    except Exception as round_err:
                        tb = traceback.format_exc()
                        log_benchmark_error(f"Model: {model_id}, Round: {round_name}, Error: {round_err}")
                        content = ""
                        has_server_error = True
                    
                    # Retry if content is empty (model hit token limit while thinking).
                    # Skip retries on server errors since they won't help.
                    retry_count = 0
                    max_retries = 3
                    while not content and retry_count < max_retries and not has_server_error:
                        retry_count += 1
                        log_benchmark(f"{round_name}: Empty response, retry {retry_count}/{max_retries}...")
                        await asyncio.sleep(5)  # brief pause before retry
                        try:
                            start_time = time.time()
                            response = await client.post(api_url, json=payload)
                            _parse_response(response)
                            if not content and response.status_code == 200 and tokens_predicted > 0:
                                log_benchmark(f"{round_name}: Retry {retry_count} succeeded")
                        except Exception as retry_err:
                            tb = traceback.format_exc()
                            log_benchmark_error(f"Model: {model_id}, Round: {round_name}, Retry error: {retry_err}")
                    
                    # Determine final outcome
                    if not content and has_server_error:
                        log_benchmark(f"{round_name}: Server error — no retries")
                        rounds_list.append({
                            "round_name": get_gold_key(round_name) or round_name,
                            "error": f"Server error (non-200 response), no content"
                        })
                    elif not content and retry_count >= max_retries:
                        log_benchmark(f"{round_name}: Exhausted all retries — empty response persisted")
                        rounds_list.append({
                            "round_name": get_gold_key(round_name) or round_name,
                            "error": f"Empty response after {max_retries} retries"
                        })
                    elif content:
                        duration = time.time() - start_time
                        log_benchmark(f"Completed {round_name} in {duration:.2f}s | {tokens_predicted} tokens | {speed_tps:.2f} t/s")
                        rounds_list.append({
                            "round_name": get_gold_key(round_name) or round_name,
                            "prompt": prompt_text,
                            "response": content,
                            "metrics": {
                                "duration_seconds": round(duration, 2),
                                "tokens_generated": tokens_predicted,
                                "tokens_per_second": round(speed_tps, 2)
                            }
                        })
                    
                    _benchmark_progress["rounds_completed"] = r_idx
                    if r_idx < len(prompts):
                        log_benchmark("Cooling down for 10 seconds to prevent VRAM locks...")
                        await asyncio.sleep(10)
                        
            # Save raw JSON results
            results = {
                "model_id": model_id,
                "model_name": os.path.basename(model_id),
                "timestamp": timestamp,
                "rounds": rounds_list
            }
            os.makedirs(out_dir, exist_ok=True)
            with open(raw_output_path, "w", encoding="utf-8") as f:
                json.dump(results, f, indent=4, ensure_ascii=False)
            log_benchmark("Saved raw test results.")
            
            # 4. Switch to Judge Model for evaluation
            preset_id = await _get_preset_id_for_model(judge_model_id)
            log_benchmark(f"Queue: Requesting server to load Judge model: {judge_model_id} (preset: {preset_id})")
            async with httpx.AsyncClient() as client:
                try:
                    load_res = await client.post("http://llm-server:8080/models/load", json={"model": preset_id}, timeout=30)
                    if load_res.status_code != 200:
                        try:
                            res_json = load_res.json()
                            error_msg = res_json.get("error", {}).get("message", "")
                            if "already running" in error_msg or "already loaded" in error_msg:
                                log_benchmark(f"Queue: Judge model {judge_model_id} is already loaded and running.")
                            else:
                                tb = traceback.format_exc()
                                log_benchmark_error(f"Judge: Server returned {load_res.status_code}: {error_msg}")
                                continue
                        except Exception as e:
                            tb = traceback.format_exc()
                            log_benchmark_error(f"Judge: HTTP error {load_res.status_code}")
                            continue
                except Exception as e:
                    tb = traceback.format_exc()
                    log_benchmark_error(f"Judge: Exception loading: {e}")
                    continue
                    
            # Wait for Judge model to load
            log_benchmark(f"Queue: Waiting for Judge model to load...")
            judge_loaded = False
            for _ in range(60):
                await asyncio.sleep(2)
                curr_loaded = await _get_loaded_model()
                if curr_loaded and _clean_model_id(curr_loaded) == _clean_model_id(judge_model_id):
                    judge_loaded = True
                    break
            
            if not judge_loaded:
                log_benchmark_error(f"Judge: Timeout loading model {judge_model_id}")
                continue
                
            # 5. Execute AI Judge evaluation
            log_benchmark("Queue: Starting AI Judge grading sequence...")
            _benchmark_progress["current_round"] = "AI Judge Grading..."
            try:
                req = JudgeRequest(run_id=run_id, judge_model_id=judge_model_id)
                await judge_benchmark(req)
                log_benchmark(f"Queue: AI Judge grading completed successfully for {model_id}!")
                _benchmark_progress["queue_completed"].append(model_id)
            except Exception as judge_err:
                tb = traceback.format_exc()
                log_benchmark_error(f"Judge: Grading failed for model {model_id}: {judge_err}")
                
            # Wait 10s cooldown between models
            if idx < len(models) - 1:
                log_benchmark("Cooling down 10 seconds before next model in queue...")
                await asyncio.sleep(10)
        
        log_benchmark("--- Automated Benchmark Queue Completed Successfully! ---")
        
    except Exception as queue_err:
        tb = traceback.format_exc()
        log_benchmark_error(f"Benchmark queue execution failed: {queue_err}")
    finally:
        async with _benchmark_lock:
            _benchmark_running = False
        _benchmark_progress["running"] = False
        _benchmark_progress["queue_running"] = False
        _benchmark_progress["current_round"] = "Finished"


@app.post("/api/benchmarks/queue/run")
async def run_benchmark_queue(req: BenchmarkQueueRequest, background_tasks: BackgroundTasks):
    global _benchmark_running
    
    async with _benchmark_lock:
        if _benchmark_running:
            raise HTTPException(status_code=400, detail="A benchmark or queue is already actively running. Please wait for it to complete.")
        _benchmark_running = True
        
    try:
        background_tasks.add_task(run_benchmark_queue_task, req.models, req.judge_model_id)
        return {
            "status": "success",
            "message": "Automated benchmark queue initiated successfully in the background.",
            "queue_size": len(req.models)
        }
    except Exception as e:
        async with _benchmark_lock:
            _benchmark_running = False
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/benchmarks/run")
async def run_benchmark(req: BenchmarkRunRequest, background_tasks: BackgroundTasks):
    global _benchmark_running
    
    async with _benchmark_lock:
        if _benchmark_running:
            raise HTTPException(status_code=400, detail="A benchmark is already actively running. Please wait for it to complete.")
        _benchmark_running = True
        
    try:
        # Detect loaded model and normalize ID to avoid duplicate DB records
        raw_model_id = await _get_loaded_model()
        if not raw_model_id:
            async with _benchmark_lock:
                _benchmark_running = False
            raise HTTPException(status_code=400, detail="No active model is loaded in the server. Please load a model before running benchmarks.")
        
        # Normalize: lowercase + strip .gguf so every run of the same model merges
        model_id = _clean_model_id(raw_model_id)
        display_name = os.path.basename(raw_model_id)
            
        run_id = str(uuid.uuid4())
        timestamp = time.strftime("%Y-%m-%d %H:%M:%S")
        
        # Determine raw output path
        out_dir = "/app/benchmark_results" if os.path.exists("/app") else "/home/nui/llmaCPP/benchmark_results"
        raw_output_path = os.path.join(out_dir, f"benchmark_{run_id}.json")
        
        # Save placeholder records in database
        conn = get_db_conn()
        cursor = conn.cursor()
        
        cursor.execute("""
        INSERT INTO models (model_id, name, quantization, status, notes)
        VALUES (?, ?, ?, 'TESTING', ?)
        ON CONFLICT(model_id) DO UPDATE SET
            status = 'TESTING',
            notes = ?
        """, (model_id, display_name, get_quantization_from_name(raw_model_id), f"Testing run initiated at {timestamp}", f"Testing run initiated at {timestamp}"))
        
        # Clean any historical test run for this model so we keep only the latest
        cursor.execute("SELECT run_id FROM test_runs WHERE model_id = ?", (model_id,))
        old_runs = cursor.fetchall()
        for old_run in old_runs:
            cursor.execute("DELETE FROM test_runs WHERE run_id = ?", (old_run["run_id"],))
            
        cursor.execute("""
        INSERT INTO test_runs (run_id, model_id, timestamp, raw_output_path)
        VALUES (?, ?, ?, ?)
        """, (run_id, model_id, timestamp, raw_output_path))
        
        conn.commit()
        conn.close()
        
        # Queue background task (pass raw_model_id for preset lookup, normalized model_id for DB)
        background_tasks.add_task(run_benchmark_task, run_id, model_id, req.judge_model_id)
        
        return {
            "status": "success",
            "message": "Benchmark sequence initiated successfully in the background.",
            "run_id": run_id,
            "model_id": model_id
        }
    except Exception as e:
        async with _benchmark_lock:
            _benchmark_running = False
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/benchmarks/status")
def get_benchmark_status():
    return _benchmark_progress


@app.get("/api/benchmarks/logs")
def get_benchmark_logs(lines: int = 200):
    """Return the persistent benchmark execution log file."""
    try:
        if not os.path.exists(BENCHMARK_EXECUTION_LOG):
            return {"logs": ""}
        with open(BENCHMARK_EXECUTION_LOG, "r", encoding="utf-8") as f:
            all_lines = f.readlines()
        # Return last N lines
        tail = all_lines[-lines:] if len(all_lines) > lines else all_lines
        return {"logs": "".join(tail)}
    except Exception as e:
        print(f"[Logs] Error reading benchmark log file: {e}")
        return {"logs": f"Error: {str(e)}"}


@app.get("/api/benchmarks/outputs")
def get_benchmark_outputs():
    """List all saved raw JSON output files and the execution log."""
    try:
        os.makedirs(BENCHMARK_LOG_DIR, exist_ok=True)
        outputs = []
        for f_name in sorted(os.listdir(BENCHMARK_LOG_DIR)):
            full_path = os.path.join(BENCHMARK_LOG_DIR, f_name)
            if not os.path.isfile(full_path):
                continue
            stat_info = os.stat(full_path)
            # Skip the execution log itself from this listing
            if f_name == "benchmark_execution.log":
                continue
            outputs.append({
                "filename": f_name,
                "size_bytes": stat_info.st_size,
                "modified_at": time.strftime("%Y-%m-%d %H:%M:%S", time.gmtime(stat_info.st_mtime)),
            })
        return {"outputs": outputs}
    except Exception as e:
        print(f"[Outputs] Error listing benchmark outputs: {e}")
        return {"outputs": [], "error": str(e) + ": " + traceback.format_exc() if 'traceback' in dir(__builtins__) else str(e)}


# (JudgeRequest is imported from models.requests)


def get_llm_server_url() -> str:
    try:
        import socket
        socket.gethostbyname("llm-server")
        return "http://llm-server:8080"
    except Exception:
        return "http://localhost:8080"


def get_gold_answers() -> dict:
    paths = [
        "/app/answers1.json",
        "/home/nui/llmaCPP/answers1.json",
        "/llm-server/answers1.json"
    ]
    for path in paths:
        if os.path.exists(path):
            try:
                with open(path, "r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception:
                pass
    raise FileNotFoundError("Could not locate answers1.json")


def load_raw_json(path_str: str) -> dict:
    if os.path.exists(path_str):
        with open(path_str, "r", encoding="utf-8") as f:
            return json.load(f)
    
    basename = os.path.basename(path_str)
    alternates = [
        os.path.join("/home/nui/workspace/llmTest/model_test_output", basename),
        os.path.join("/llm-server/benchmark_results", basename),
        os.path.join("/app/benchmark_results", basename),
        os.path.join("/home/nui/llmaCPP/benchmark_results", basename),
    ]
    for alt in alternates:
        if os.path.exists(alt):
            try:
                with open(alt, "r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception:
                pass
    raise FileNotFoundError(f"Could not load raw JSON for path: {path_str}")


def parse_judge_json(raw_text: str) -> dict:
    clean_text = re.sub(r'<think>.*?</think>', '', raw_text, flags=re.DOTALL)
    start_idx = clean_text.find('{')
    end_idx = clean_text.rfind('}')
    if start_idx == -1 or end_idx == -1:
        raise ValueError(f"No JSON object found in response: {raw_text[:200]}")
    json_str = clean_text[start_idx:end_idx+1]
    return json.loads(json_str)


async def query_judge_model(judge_model: str, system_prompt: str, user_prompt: str) -> str:
    url = f"{get_llm_server_url()}/v1/chat/completions"
    preset_id = await _get_preset_id_for_model(judge_model)
    log_benchmark(f"Grading round using Judge model: {preset_id}...")
    payload = {
        "model": preset_id,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ],
        "temperature": 0.1,
        "stream": False
    }
    async with httpx.AsyncClient(timeout=300.0) as client:
        response = await client.post(url, json=payload)
        response.raise_for_status()
        res_data = response.json()
        log_benchmark(f"Grading round completed for Judge model: {preset_id}")
        return res_data["choices"][0]["message"]["content"]


def get_gold_key(round_name: str) -> Optional[str]:
    round_map = {
        "round 1": "knowledge_qa",
        "round 2": "technical_reasoning",
        "round 3": "code_generation",
        "round 4": "abstract_logic",
        "round 5": "creative_writing"
    }
    r_lower = round_name.lower().strip()
    if r_lower in ["knowledge_qa", "technical_reasoning", "code_generation", "abstract_logic", "creative_writing"]:
        return r_lower
    for key, val in round_map.items():
        if key in r_lower:
            return val
    return None


def get_quantization_from_name(name: str) -> str:
    match = re.search(r'\b(Q[0-9]_[K_M_L_S_X_]+|IQ[0-9]_[A-Z_]+)\b', name, re.IGNORECASE)
    if match:
        return match.group(1).upper()
    return "Unknown"


@app.post("/api/benchmarks/judge")
async def judge_benchmark(req: JudgeRequest):
    try:
        conn = get_db_conn()
        cursor = conn.cursor()
        
        # 1. Determine run_id and model_id
        if req.run_id:
            cursor.execute("SELECT run_id, model_id, raw_output_path FROM test_runs WHERE run_id = ?", (req.run_id,))
            run_row = cursor.fetchone()
        else:
            cursor.execute("SELECT run_id, model_id, raw_output_path FROM test_runs ORDER BY timestamp DESC LIMIT 1")
            run_row = cursor.fetchone()
            
        if not run_row:
            conn.close()
            raise HTTPException(status_code=404, detail="No test run found to grade")
            
        run_id = run_row["run_id"]
        model_id = run_row["model_id"]
        raw_output_path = run_row["raw_output_path"]
        
        # 2. Determine Judge model
        judge_model = req.judge_model_id or await _get_loaded_model()
        if not judge_model:
            conn.close()
            raise HTTPException(status_code=400, detail="No active model loaded to act as Judge. Please load a model first.")
            
        # 3. Load raw JSON results
        raw_data = load_raw_json(raw_output_path)
        gold = get_gold_answers()
        
        # 4. Compute average TPS and Speed score
        tps_list = []
        for r in raw_data.get("rounds", []):
            metrics = r.get("metrics", {})
            tps = metrics.get("tokens_per_second") or 0.0
            if not tps:
                dur = metrics.get("duration_seconds") or 0.0
                tok = metrics.get("tokens_generated") or 0.0
                if dur > 0:
                    tps = tok / dur
            if tps > 0:
                tps_list.append(tps)
                
        avg_tps = sum(tps_list) / len(tps_list) if tps_list else 0.0
        speed_score = min(25, int((avg_tps / 60.0) * 25))
        
        # 5. Begin grading qualitative rounds
        graded_rounds = []
        hallucinations = []
        
        # Let's perform sequential grading
        for r in raw_data.get("rounds", []):
            round_name = r.get("round") or r.get("round_name") or ""
            model_response = r.get("response", "")
            gold_key = get_gold_key(round_name)
            
            if not gold_key or gold_key not in gold:
                print(f"Skipping unmappable round: {round_name}")
                continue
                
            gold_round = gold[gold_key]
            correct_answer = gold_round.get("correct_answer", "")
            key_points = gold_round.get("key_points", [])
            max_points = gold_round.get("max_points", 0)
            
            key_points_str = "\n".join([f"- {kp}" for kp in key_points])
            
            system_prompt = "You are an expert, objective AI Benchmark Judge."
            user_prompt = f"""You are grading a local LLM's response to a specific benchmark round.
Compare the model's response against the provided Gold Standard and verify which key points were addressed.

### Grading Rubric & Max Points:
- Category: {gold_key}
- Max Points: {max_points}

### Gold Standard Ground Truth:
{correct_answer}

### Key Points to Verify:
{key_points_str}

### Model Response Under Test:
\"\"\"
{model_response}
\"\"\"

### Grading Instructions:
1. Evaluate the model response strictly based on factual accuracy, correctness, and adherence to the key points.
2. Award points up to the maximum ({max_points} pts). Be fair but strict.
3. Deduced scores should be integers.
4. Auditing Hallucinations: 
   - If this is "Round 1: Knowledge QA" (knowledge_qa), check if the model fabricated, invented, or hallucinated facts, spelling, or etymology (e.g. fabricating parts of Bangkok's name, inventing Thai words, or providing wrong English translations).
   - If a hallucination is detected, you MUST set "hallucination_detected" to true and provide a description.

You must return a JSON object exactly matching this structure (do not output any other text or markdown outside of the JSON):
{{
    "score": <integer_score>,
    "reasoning": "<concise_explanation_of_the_assigned_score>",
    "hallucination_detected": <true_or_false>,
    "hallucination_description": "<description_if_detected_else_empty>"
}}"""
            
            print(f"Grading round: {gold_key} using judge {judge_model}...")
            log_benchmark(f"Grading round: {gold_key} using judge {judge_model}")
            try:
                judge_response = await query_judge_model(judge_model, system_prompt, user_prompt)
                grades = parse_judge_json(judge_response)
                
                score = grades.get("score") or 0
                reasoning = grades.get("reasoning") or ""
                hallucinated = grades.get("hallucination_detected") or False
                hallucination_desc = grades.get("hallucination_description") or ""
                
                # Fetch round speed
                round_tps = r.get("metrics", {}).get("tokens_per_second") or avg_tps
                
                graded_rounds.append({
                    "round_name": gold_key,
                    "score": min(max_points, int(score)),
                    "reasoning": reasoning,
                    "speed_tps": round_tps
                })
                
                if hallucinated and hallucination_desc:
                    hallucinations.append({
                        "round_name": round_name,
                        "description": hallucination_desc
                    })
            except Exception as grading_err:
                tb = traceback.format_exc()
                print(f"Failed to grade round {gold_key}: {grading_err}")
                log_benchmark_error(f"Judge: Grading failed for round {gold_key}: {str(grading_err)}")
                # Fallback to zero points on failure to avoid blocking
                graded_rounds.append({
                    "round_name": gold_key,
                    "score": 0,
                    "reasoning": f"Grading failed: {str(grading_err)}",
                    "speed_tps": 0.0
                })
                
        # 6. Save results to Database
        # Clean old scores and hallucinations for this model
        cursor.execute("SELECT run_id FROM test_runs WHERE model_id = ? AND run_id != ?", (model_id, run_id))
        old_runs = cursor.fetchall()
        for old_run in old_runs:
            cursor.execute("DELETE FROM test_runs WHERE run_id = ?", (old_run["run_id"],))
            
        cursor.execute("DELETE FROM model_hallucinations WHERE model_id = ?", (model_id,))
        cursor.execute("DELETE FROM round_scores WHERE run_id = ?", (run_id,))
        
        # Update model metadata in models table
        model_name = raw_data.get("model_name") or model_id
        quant = get_quantization_from_name(model_name)
        status = "⚠️ HALLUCINATION WARNING" if hallucinations else "✅ FAST"
        
        cursor.execute("""
        INSERT INTO models (model_id, name, quantization, status, notes)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(model_id) DO UPDATE SET
            name = excluded.name,
            quantization = excluded.quantization,
            status = excluded.status,
            notes = excluded.notes
        """, (model_id, model_name, quant, status, f"Graded by {judge_model} on {time.strftime('%Y-%m-%d %H:%M:%S')}"))
        
        # Insert speed_metric round score
        cursor.execute("""
        INSERT INTO round_scores (run_id, round_name, score, reasoning, speed_tps)
        VALUES (?, 'speed_metric', ?, ?, ?)
        """, (run_id, speed_score, f"Observed average TPS: {avg_tps:.2f}", avg_tps))
        
        # Insert qualitative scores
        for gr in graded_rounds:
            cursor.execute("""
            INSERT INTO round_scores (run_id, round_name, score, reasoning, speed_tps)
            VALUES (?, ?, ?, ?, ?)
            """, (run_id, gr["round_name"], gr["score"], gr["reasoning"], gr["speed_tps"]))
            
        # Insert hallucinations
        for h in hallucinations:
            cursor.execute("""
            INSERT INTO model_hallucinations (model_id, round_name, description, severity)
            VALUES (?, ?, ?, 'warning')
            """, (model_id, h["round_name"], h["description"]))
        
        log_benchmark(f"All {len(graded_rounds)} qualitative rounds graded. Hallucinations: {len(hallucinations)}")
        conn.commit()
        conn.close()
        
        return {
            "status": "success",
            "model_id": model_id,
            "run_id": run_id,
            "average_tps": round(avg_tps, 2),
            "speed_score": speed_score,
            "graded_rounds": graded_rounds,
            "hallucinations_detected": len(hallucinations)
        }
    except Exception as e:
        tb = traceback.format_exc()
        log_benchmark_error(f"Judge grading error for model {model_id}: {e}")
        print(f"Error in judge_benchmark: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/logs")
def get_logs(container_name: str = "llm-server", lines: int = 100):
    if not docker_client:
        raise HTTPException(status_code=500, detail="Docker client not initialized.")
    try:
        c = docker_client.containers.get(container_name)
        logs = c.logs(tail=lines, stdout=True, stderr=True).decode("utf-8", errors="ignore")
        return {"container": container_name, "logs": logs}
    except Exception as e:
        return {"container": container_name, "logs": f"Error fetching logs: {str(e)}"}



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
