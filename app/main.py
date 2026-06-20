import os
import json
import asyncio
import datetime
import traceback
import time
import uuid

from fastapi import FastAPI, Request, BackgroundTasks
from fastapi.responses import HTMLResponse, JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles

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
    ModelsIniRequest, ModelActionRequest, GenerateRequest,
    MkdirRequest, MoveRequest, DeleteRequest, DownloadRequest,
    BenchmarkRunRequest, BenchmarkQueueRequest, JudgeRequest
)

# ── Service imports ─────────────────────────────────────────────────────────────
from services.docker_svc import (
    get_status, get_system_stats, start_llm, stop_llm,
    _start_mqtt_listener, _local_stats_poller, get_logs
)
from services.model_svc import (
    list_models, delete_model, get_models_ini, save_models_ini,
    proxy_llm_models, proxy_llm_load, proxy_llm_unload,
    get_vision_capabilities
)
from services.chat_svc import proxy_chat
from services.sse_svc import stream_status, startup as sse_startup, broadcast_notification
from services.comfy_svc import (
    queue_worker, broadcast_queue, get_queue_snapshot, load_persisted_queue,
    is_queue_running, set_queue_running, get_queue,
    submit_to_queue as svc_submit_to_queue,
    cancel_queue_item as svc_cancel_queue_item,
    clear_completed as svc_clear_completed,
    stream_queue as svc_stream_queue,
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
)
from services.benchmark_svc import (
    get_benchmark_progress,
    get_benchmarks,
    get_benchmark_details,
    get_benchmark_logs,
    get_benchmark_outputs,
    run_benchmark as run_single_benchmark,
    run_benchmark_queue as run_queue_benchmark,
)
from services.judge_svc import (
    judge_benchmark as svc_judge_benchmark,
)

app = FastAPI(title="LLM Mobile Manager")

# ───────────────────────────────────────────────
# Startup
# ───────────────────────────────────────────────

@app.on_event("startup")
async def startup_event():
    os.makedirs(IMAGE_GEN_OUTPUT, exist_ok=True)
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
# REST endpoints – generation queue
# ───────────────────────────────────────────────

@app.post("/api/generate/queue")
async def submit_to_queue(req: GenerateRequest):
    return await svc_submit_to_queue(req)

@app.get("/api/generate/queue")
def get_queue():
    return get_queue()

@app.delete("/api/generate/queue/{queue_id}")
async def cancel_queue_item(queue_id: str):
    return await svc_cancel_queue_item(queue_id)

@app.delete("/api/generate/queue")
async def clear_completed():
    return await svc_clear_completed()

# ───────────────────────────────────────────────
# SSE – /events/queue
# ───────────────────────────────────────────────

@app.get("/events/queue")
async def stream_queue(request: Request):
    return await svc_stream_queue(request)

# ───────────────────────────────────────────────
# REST endpoints – gallery
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
# ───────────────────────────────────────────────

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

# ───────────────────────────────────────────────
# Benchmarks
# ───────────────────────────────────────────────

@app.get("/api/benchmarks")
def route_get_benchmarks(show_all: bool = False):
    return get_benchmarks(show_all=show_all)

@app.get("/api/benchmarks/details")
def route_get_benchmark_details(model_id: str):
    return get_benchmark_details(model_id)

@app.post("/api/benchmarks/queue/run")
async def route_run_benchmark_queue(req: BenchmarkQueueRequest, background_tasks: BackgroundTasks):
    return await run_queue_benchmark(req, background_tasks)

@app.post("/api/benchmarks/run")
async def route_run_benchmark(req: BenchmarkRunRequest, background_tasks: BackgroundTasks):
    return await run_single_benchmark(req, background_tasks)

@app.get("/api/benchmarks/status")
def route_get_benchmark_status():
    return get_benchmark_progress()

@app.get("/api/benchmarks/logs")
def route_get_benchmark_logs(lines: int = 200):
    return get_benchmark_logs(lines=lines)

@app.get("/api/benchmarks/outputs")
def route_get_benchmark_outputs():
    return get_benchmark_outputs()

# ───────────────────────────────────────────────
# Judge
# ───────────────────────────────────────────────

@app.post("/api/benchmarks/judge")
async def route_judge_benchmark(req: JudgeRequest):
    return await svc_judge_benchmark(req)

# ───────────────────────────────────────────────
# Logs
# ───────────────────────────────────────────────

@app.get("/api/logs")
def route_get_logs(container_name: str = "llm-server", lines: int = 100):
    return get_logs(container_name=container_name, lines=lines)

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
                "sizes": "192x192",
                "type": "image/svg+xml",
                "purpose": "any maskable",
            },
            {
                "src": "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 512 512'%3E%3Crect width='512' height='512' rx='100' fill='%230f172a'/%3E%3Cpath d='M295 64L140 288h112v160l144-224h-116z' fill='%236366f1'/%3E%3C/svg%3E",
                "sizes": "512x512",
                "type": "image/svg+xml",
                "purpose": "any maskable",
            },
        ],
    }
    return JSONResponse(content=manifest, headers={"Content-Type": "application/manifest+json"})

# ───────────────────────────────────────────────
# Static file mounts (images + frontend dist)
# ───────────────────────────────────────────────

app.mount("/images", StaticFiles(directory=IMAGE_GEN_OUTPUT), name="images")
dist_dir = os.path.join(os.path.dirname(__file__), "..", "dist")
if os.path.exists(dist_dir):
    app.mount("/", StaticFiles(directory=dist_dir, html=True), name="static")
else:
    @app.get("/")
    def fallback_root():
        return HTMLResponse("<h1>Run 'npm run build' to build the frontend.</h1>")
