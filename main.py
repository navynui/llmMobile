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
from services.download_svc import (
    init_download_queue, download_queue_worker,
    search_hf_models as svc_search_hf_models,
    get_hf_model_details as svc_get_hf_model_details,
    download_model as svc_download_model,
    get_downloads_status as svc_get_downloads_status,
    scan_and_register_models as svc_scan_and_register_models,
    get_quantization_from_name,
)
from services.benchmark_svc import (
    run_benchmark_task, run_benchmark_queue_task,
    get_benchmark_progress, get_benchmark_running,
    get_benchmark_lock, set_benchmark_running,
    log_benchmark, log_benchmark_error,
)
from services.judge_svc import (
    judge_benchmark as svc_judge_benchmark,
    get_llm_server_url,
    get_quantization_from_name as judge_get_quantization_from_name,
)
from services.chat_svc import _get_loaded_model

# ───────────────────────────────────────────────
# Startup
# ───────────────────────────────────────────────

@app.on_event("startup")
async def startup_event():
    consolidate_database()
    init_download_queue()
    asyncio.create_task(download_queue_worker())
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
# Phase F – Model Downloader
# (delegated to services/download_svc.py)
# ───────────────────────────────────────────────

# (DownloadRequest is imported from models.requests)

@app.get("/api/models/search")
async def route_search_hf_models(q: str):
    return await svc_search_hf_models(q)


@app.get("/api/models/details")
async def route_get_hf_model_details(repo_id: str):
    return await svc_get_hf_model_details(repo_id)


@app.post("/api/models/download")
def route_download_model(req: DownloadRequest):
    return svc_download_model(req)


@app.get("/api/models/downloads")
def route_get_downloads_status():
    return svc_get_downloads_status()


@app.post("/api/models/scan_and_register")
def route_scan_and_register_models():
    return svc_scan_and_register_models()

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

# (benchmark globals, logging, and task functions moved to services/benchmark_svc.py)
# (BenchmarkRunRequest is imported from models.requests)

# (run_benchmark_task, run_benchmark_queue_task moved to services/benchmark_svc.py)

# (BenchmarkQueueRequest is imported from models.requests)




@app.post("/api/benchmarks/queue/run")
async def route_run_benchmark_queue(req: BenchmarkQueueRequest, background_tasks: BackgroundTasks):
    async with get_benchmark_lock():
        if get_benchmark_running():
            raise HTTPException(status_code=400, detail="A benchmark or queue is already actively running. Please wait for it to complete.")
        set_benchmark_running(True)

    try:
        background_tasks.add_task(run_benchmark_queue_task, req.models, req.judge_model_id)
        return {
            "status": "success",
            "message": "Automated benchmark queue initiated successfully in the background.",
            "queue_size": len(req.models)
        }
    except Exception as e:
        async with get_benchmark_lock():
            set_benchmark_running(False)
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/benchmarks/run")
async def route_run_benchmark(req: BenchmarkRunRequest, background_tasks: BackgroundTasks):
    async with get_benchmark_lock():
        if get_benchmark_running():
            raise HTTPException(status_code=400, detail="A benchmark is already actively running. Please wait for it to complete.")
        set_benchmark_running(True)

    try:
        raw_model_id = await _get_loaded_model()
        if not raw_model_id:
            async with get_benchmark_lock():
                set_benchmark_running(False)
            raise HTTPException(status_code=400, detail="No active model is loaded in the server. Please load a model before running benchmarks.")

        model_id = _clean_model_id(raw_model_id)
        display_name = os.path.basename(raw_model_id)

        run_id = str(uuid.uuid4())
        timestamp = time.strftime("%Y-%m-%d %H:%M:%S")

        out_dir = "/app/benchmark_results" if os.path.exists("/app") else "/home/nui/llmaCPP/benchmark_results"
        raw_output_path = os.path.join(out_dir, f"benchmark_{run_id}.json")

        conn = get_db_conn()
        cursor = conn.cursor()
        cursor.execute("""
        INSERT INTO models (model_id, name, quantization, status, notes)
        VALUES (?, ?, ?, 'TESTING', ?)
        ON CONFLICT(model_id) DO UPDATE SET
            status = 'TESTING',
            notes = ?
        """, (model_id, display_name, get_quantization_from_name(raw_model_id),
              f"Testing run initiated at {timestamp}", f"Testing run initiated at {timestamp}"))

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

        background_tasks.add_task(run_benchmark_task, run_id, model_id, req.judge_model_id)
        return {
            "status": "success",
            "message": "Benchmark sequence initiated successfully in the background.",
            "run_id": run_id,
            "model_id": model_id
        }
    except Exception as e:
        async with get_benchmark_lock():
            set_benchmark_running(False)
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/benchmarks/status")
def route_get_benchmark_status():
    return get_benchmark_progress()


@app.get("/api/benchmarks/logs")
def route_get_benchmark_logs(lines: int = 200):
    """Return the persistent benchmark execution log file."""
    try:
        if not os.path.exists(BENCHMARK_EXECUTION_LOG):
            return {"logs": ""}
        with open(BENCHMARK_EXECUTION_LOG, "r", encoding="utf-8") as f:
            all_lines = f.readlines()
        tail = all_lines[-lines:] if len(all_lines) > lines else all_lines
        return {"logs": "".join(tail)}
    except Exception as e:
        print(f"[Logs] Error reading benchmark log file: {e}")
        return {"logs": f"Error: {str(e)}"}


@app.get("/api/benchmarks/outputs")
def route_get_benchmark_outputs():
    """List all saved raw JSON output files."""
    try:
        os.makedirs(BENCHMARK_LOG_DIR, exist_ok=True)
        outputs = []
        for f_name in sorted(os.listdir(BENCHMARK_LOG_DIR)):
            full_path = os.path.join(BENCHMARK_LOG_DIR, f_name)
            if not os.path.isfile(full_path):
                continue
            if f_name == "benchmark_execution.log":
                continue
            stat_info = os.stat(full_path)
            outputs.append({
                "filename": f_name,
                "size_bytes": stat_info.st_size,
                "modified_at": time.strftime("%Y-%m-%d %H:%M:%S", time.gmtime(stat_info.st_mtime)),
            })
        return {"outputs": outputs}
    except Exception as e:
        print(f"[Outputs] Error listing benchmark outputs: {e}")
        return {"outputs": [], "error": str(e)}


# ─────────────────────────────────────────────────────────────────────────────
# Phase F – Judge
# (judge helpers and judge_benchmark moved to services/judge_svc.py)
# ─────────────────────────────────────────────────────────────────────────────

# (JudgeRequest is imported from models.requests)


@app.post("/api/benchmarks/judge")
async def route_judge_benchmark(req: JudgeRequest):
    return await svc_judge_benchmark(req)


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
