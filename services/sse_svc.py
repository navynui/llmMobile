import os
import time
import json
import asyncio
import datetime
from fastapi import Request
from fastapi.responses import StreamingResponse

from services.docker_svc import get_docker_client, get_status, _stats_cache, _stats_lock
from services.chat_svc import _get_loaded_model
from services.vram_svc import capture_and_store_vram

_sse_subscribers = []

def broadcast_notification(message: str):
    print(f"[Log Monitor] Broadcasting notification: {message}")
    for q in list(_sse_subscribers):
        try:
            q.put_nowait(message)
        except Exception:
            pass

async def log_monitor_task():
    # Start tracking from current time to avoid historical log spam
    last_log_time = int(time.time())
    print("[Log Monitor] Started background log monitor task")
    while True:
        try:
            await asyncio.sleep(2)
            docker_client = get_docker_client()
            if not docker_client:
                continue
            try:
                c = docker_client.containers.get("llm-server")
                if c.status != "running":
                    continue
            except Exception:
                continue
            
            # Fetch logs since last_log_time
            now = int(time.time())
            try:
                logs_bytes = c.logs(since=last_log_time, stdout=True, stderr=True)
                logs = logs_bytes.decode("utf-8", errors="ignore")
            except Exception as e:
                print(f"[Log Monitor] Error fetching container logs: {e}")
                continue
                
            last_log_time = now
            
            if "update_slots: all slots are idle" in logs or "all slots are idle" in logs:
                model_name = "Model"
                try:
                    loaded_model = await _get_loaded_model()
                    if loaded_model:
                        model_name = os.path.basename(loaded_model)
                except Exception:
                    pass
                broadcast_notification(f"🎉 {model_name} loaded and ready!")
                # Capture VRAM right after the idle notification — the telemetry
                # pipeline should have updated by now since it's polling nvidia-smi.
                try:
                    asyncio.create_task(capture_and_store_vram(model_name, status="good"))
                except Exception as e:
                    print(f"[Log Monitor] VRAM capture error: {e}")
        except Exception as e:
            print(f"[Log Monitor] Task encountered unexpected error: {e}")

async def stream_status(request: Request, since: str = "0"):
    last_id_hdr = request.headers.get("last-event-id") or since
    counter = int(last_id_hdr) if last_id_hdr.isdigit() else 0

    q = asyncio.Queue()
    _sse_subscribers.append(q)

    async def _gen():
        nonlocal counter
        try:
            while True:
                if await request.is_disconnected():
                    break
                
                while not q.empty():
                    msg = q.get_nowait()
                    counter += 1
                    notif_payload = json.dumps({"message": msg})
                    yield f"id: {counter}\nevent: notification\ndata: {notif_payload}\n\n"

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
        finally:
            if q in _sse_subscribers:
                _sse_subscribers.remove(q)

    return StreamingResponse(_gen(), media_type="text/event-stream")

def startup():
    asyncio.create_task(log_monitor_task())
