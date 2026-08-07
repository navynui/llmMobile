import os
import json
import asyncio
import datetime
import traceback
import time
import uuid
from fastapi import FastAPI, Request, BackgroundTasks, File, UploadFile, Form
from fastapi.responses import HTMLResponse, JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from utils.common import (
    MODES_INI_PATH, MODELS_DIR, IMAGE_GEN_OUTPUT, WORKFLOW_PATH, PROMPTS_FILE,
    LLM_PROJECT_NAME, LLM_COMPOSE_DIR, COMFYUI_HOST, COMFY_CLIENT_ID,
    NODE_PROMPT_TEXT, NODE_RESOLUTION, NODE_KSAMPLER,
    VRAM_CRITICAL_THRESHOLD, VRAM_EMERGENCY_THRESHOLD,
    MQTT_CONFIG, safe_join, _deep_copy
)
from utils.db_utils import DB_PATH, get_db_conn, consolidate_database, run_migrations, _clean_model_id
from utils.bench_log import BENCHMARK_LOG_DIR, BENCHMARK_EXECUTION_LOG, _rotate_benchmark_log_if_needed
from models.requests import (
    ModelsIniRequest, ModelActionRequest, GenerateRequest, MkdirRequest,
    MoveRequest, DeleteRequest, DownloadRequest, BenchmarkRunRequest,
    BenchmarkQueueRequest, TemperatureSweepRequest, JudgeRequest
)
# ── Service imports ─────────────────────────────────────────────────────────────
from services.docker_svc import (
    get_status, get_system_stats, start_llm, stop_llm,
    start_llm_server, stop_llm_server, restart_llm_server,
    _start_mqtt_listener, start_mqtt_watchdog, get_logs, get_server_slots_status,
    unload_kokoro_models
)
from services.model_svc import (
    list_models, delete_model, get_models_ini, save_models_ini,
    proxy_llm_models, proxy_llm_load, proxy_llm_unload,
    get_vision_capabilities, get_vision_capabilities_mini,
    list_mini_models, delete_model_from_mini, get_models_mini_ini, save_models_mini_ini,
    proxy_llm_mini_models, proxy_llm_mini_load, proxy_llm_mini_unload,
    scan_mini_and_register,
)
from services.chat_svc import proxy_chat, proxy_chat_mini
from services.tools import chat_with_tools
from services.sse_svc import stream_status, startup as sse_startup, broadcast_notification
from services.comfy.worker import queue_worker
from services.comfy.queue_state import broadcast_queue, get_queue_snapshot, load_persisted_queue, is_queue_running, set_queue_running
from services.comfy.api import (
    get_queue as svc_get_queue,
    submit_to_queue as svc_submit_to_queue,
    cancel_queue_item as svc_cancel_queue_item,
    clear_completed as svc_clear_completed,
    stream_queue as svc_stream_queue,
)
from services.comfy.comfyio import _free_comfy_cache as svc_free_comfy_cache, _upload_comfy_image
from services.comfy.api import submit_edit_to_queue as svc_submit_edit_to_queue
from services.comfy.lifecycle import (
    get_comfy_status as svc_get_comfy_status,
    start_comfy as svc_start_comfy,
    stop_comfy as svc_stop_comfy,
    start_idle_watchdog,
)
from services.llm_lifecycle import start_llm_idle_watchdog
from services.gallery_svc import (
    browse_gallery as svc_browse_gallery, get_all_folders as svc_get_all_folders,
    gallery_mkdir as svc_gallery_mkdir, gallery_move as svc_gallery_move,
    gallery_delete as svc_gallery_delete,
)
from services.push_svc import (
    init_push, get_vapid_public_key, subscribe as push_subscribe,
    unsubscribe as push_unsubscribe, send_push
)
from services.download.state import init_download_queue
from services.download.worker import download_queue_worker
from services.download.hf import search_hf_models as svc_search_hf_models, get_hf_model_details as svc_get_hf_model_details
from services.download.api import (
    download_model as svc_download_model,
    get_downloads_status as svc_get_downloads_status,
    scan_and_register_models as svc_scan_and_register_models,
    stop_download as svc_stop_download,
    resume_download as svc_resume_download,
    cancel_download as svc_cancel_download,
)
from services.benchmark.state import get_benchmark_progress
from services.benchmark.reader import get_benchmarks, get_benchmark_details, get_benchmark_logs, get_benchmark_outputs
from services.benchmark.api import run_benchmark as run_single_benchmark, run_benchmark_queue as run_queue_benchmark
from services.benchmark.sweep import run_temperature_sweep as run_sweep_handler
from services.judge.judge import judge_benchmark as svc_judge_benchmark

app = FastAPI(title="LLM Mobile Manager")

# ───────────────────────────────────────────────
# Startup
# ───────────────────────────────────────────────
@app.on_event("startup")
async def startup_event():
    os.makedirs(IMAGE_GEN_OUTPUT, exist_ok=True)
    run_migrations()
    consolidate_database()
    init_download_queue()
    asyncio.create_task(download_queue_worker())
    _start_mqtt_listener()
    start_mqtt_watchdog()
    sse_startup()
    init_push()
    start_idle_watchdog()
    start_llm_idle_watchdog()
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

@app.get("/api/servers/slots")
async def route_get_server_slots():
    return await get_server_slots_status()

@app.post("/servers/{name}/start")
def route_start_llm_server(name: str):
    return start_llm_server(name)

@app.post("/servers/{name}/stop")
def route_stop_llm_server(name: str):
    return stop_llm_server(name)

@app.post("/servers/{name}/restart")
def route_restart_llm_server(name: str):
    return restart_llm_server(name)

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

@app.get("/models-mini/vision-capabilities")
async def route_get_vision_capabilities_mini():
    return await get_vision_capabilities_mini()

@app.get("/models-mini")
def route_list_mini_models():
    return list_mini_models()

@app.delete("/models-mini/{filename}")
def route_delete_model_from_mini(filename: str):
    return delete_model_from_mini(filename)

@app.get("/api/models_mini_ini")
def route_get_models_mini_ini():
    return get_models_mini_ini()

@app.post("/api/models_mini_ini")
def route_save_models_mini_ini(req: ModelsIniRequest):
    return save_models_mini_ini(req)

@app.get("/api/llm-mini/models")
async def route_proxy_llm_mini_models():
    return await proxy_llm_mini_models()

@app.post("/api/llm-mini/models/load")
async def route_proxy_llm_mini_load(req: ModelActionRequest):
    return await proxy_llm_mini_load(req)

@app.post("/api/llm-mini/models/unload")
async def route_proxy_llm_mini_unload(req: ModelActionRequest):
    return await proxy_llm_mini_unload(req)

@app.post("/api/models-mini/scan_and_register")
def route_scan_mini_and_register():
    return scan_mini_and_register()


@app.post("/api/chat/completions")
async def route_proxy_chat(request: Request):
    body = await request.body()
    try:
        data = json.loads(body) if body else {}
    except Exception:
        data = {}
    if "tools" in data:
        return await chat_with_tools(request, "http://llm-server:8080")
    return await proxy_chat(request)

@app.post("/api/chat-mini/completions")
async def route_proxy_chat_mini(request: Request):
    body = await request.body()
    try:
        data = json.loads(body) if body else {}
    except Exception:
        data = {}
    if "tools" in data:
        return await chat_with_tools(request, "http://llm-server-mini:8080")
    return await proxy_chat_mini(request)

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

@app.post("/api/comfy/free")
async def route_free_comfy():
    success = await svc_free_comfy_cache()
    return {"success": success, "detail": "ComfyUI memory freed" if success else "Failed to free ComfyUI memory"}


@app.post("/api/kokoro/unload")
async def route_unload_kokoro():
    return unload_kokoro_models()



# ───────────────────────────────────────────────
# REST endpoints – ComfyUI container lifecycle
# ───────────────────────────────────────────────
@app.get("/api/comfyui/status")
def route_comfyui_status():
    return svc_get_comfy_status()


@app.post("/api/comfyui/start")
def route_comfyui_start():
    return svc_start_comfy()


@app.post("/api/comfyui/stop")
def route_comfyui_stop():
    return svc_stop_comfy()


@app.post("/api/generate/edit")
async def route_generate_edit(
    image_a: UploadFile = File(...),
    image_b: UploadFile | None = File(None),
    prompt: str = Form(...),
    steps: int = Form(8),
):
    """Upload images for editing, build workflow, and queue the generation."""
    # Clamp steps to valid range
    steps = max(4, min(12, steps))

    # Editing uploads straight to ComfyUI — make sure it is up first.
    if svc_get_comfy_status()["status"] != "ready":
        return JSONResponse(
            status_code=409,
            content={"detail": "ComfyUI is not running. Start it with the button above, then retry the edit."},
        )

    # Read and upload image A
    image_a_bytes = await image_a.read()
    image_a_filename = _upload_comfy_image(image_a_bytes, image_a.filename or "image_a.png")
    if not image_a_filename:
        return JSONResponse(status_code=500, content={"detail": "Failed to upload image A to ComfyUI"})

    # Read and upload image B (if provided)
    image_b_filename = None
    if image_b and image_b.filename:
        image_b_bytes = await image_b.read()
        image_b_filename = _upload_comfy_image(image_b_bytes, image_b.filename or "image_b.png")
        if not image_b_filename:
            return JSONResponse(status_code=500, content={"detail": "Failed to upload image B to ComfyUI"})

    # Queue the edit task
    result = await svc_submit_edit_to_queue(
        prompt=prompt,
        steps=steps,
        image_a_filename=image_a_filename,
        image_b_filename=image_b_filename,
    )
    return result

@app.get("/api/generate/queue")
def get_queue():
    return svc_get_queue()

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

@app.post("/api/models/downloads/clear-finished")
def route_clear_finished_downloads():
    from services.download.api import clear_finished_downloads
    return clear_finished_downloads()

@app.post("/api/models/downloads/{key:path}/stop")
def route_stop_download(key: str):
    return svc_stop_download(key)

@app.post("/api/models/downloads/{key:path}/resume")
def route_resume_download(key: str):
    return svc_resume_download(key)

@app.post("/api/models/downloads/{key:path}/cancel")
def route_cancel_download(key: str):
    return svc_cancel_download(key)

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
def route_get_benchmarks(show_all: bool = False, server: str | None = None):
    return get_benchmarks(show_all=show_all, server=server)

@app.get("/api/benchmarks/details")
def route_get_benchmark_details(model_id: str, server: str = "primary"):
    return get_benchmark_details(model_id, server)

@app.post("/api/benchmarks/queue/run")
async def route_run_benchmark_queue(req: BenchmarkQueueRequest, background_tasks: BackgroundTasks):
    return await run_queue_benchmark(req, background_tasks)

@app.post("/api/benchmarks/run")
async def route_run_benchmark(req: BenchmarkRunRequest, background_tasks: BackgroundTasks):
    return await run_single_benchmark(req, background_tasks)

@app.post("/api/benchmarks/temperature-sweep")
async def route_temperature_sweep(req: TemperatureSweepRequest, background_tasks: BackgroundTasks):
    return await run_sweep_handler(req, background_tasks)


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

@app.post("/api/benchmarks/aggregate")
def route_aggregate_benchmark(model_id: str):
    from services.benchmark import calculate_and_store_model_aggregates
    return calculate_and_store_model_aggregates(model_id)

# ───────────────────────────────────────────────
# Logs
# ───────────────────────────────────────────────
@app.get("/api/logs")
def route_get_logs(container_name: str = "llm-server", lines: int = 100):
    return get_logs(container_name=container_name, lines=lines)

# ───────────────────────────────────────────────
# Push Notifications / VAPID
# ───────────────────────────────────────────────
@app.get("/api/notifications/vapid-key")
def route_get_vapid_key():
    """Return the VAPID public key for push notification subscription."""
    return JSONResponse(content={"public_key": get_vapid_public_key()})

@app.post("/api/notifications/subscribe")
def route_subscribe_push(req: dict):
    """Subscribe a client to push notifications."""
    push_subscribe(req)
    return {"status": "subscribed"}

# ───────────────────────────────────────────────
# PWA manifest
# ───────────────────────────────────────────────
@app.get("/manifest.json")
def pwa_manifest():
    manifest = {
        "name": "LLM Mobile Manager",
        "short_name": "LLM Mobile",
        "description": "Mobile-first controller for LLM inference, image generation, and benchmarking",
        "start_url": "/",
        "display": "standalone",
        "background_color": "#111827",
        "theme_color": "#6366f1",
        "orientation": "any",
        "categories": ["productivity", "utilities"],
        "lang": "en-US",
        "display_override": ["standalone", "window-controls-overlay"],
        "icons": [
            {
                "src": "/icons.svg",
                "sizes": "any",
                "type": "image/svg+xml",
                "purpose": "any maskable",
            },
            {
                "src": "/favicon.svg",
                "sizes": "192x192",
                "type": "image/svg+xml",
                "purpose": "any",
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