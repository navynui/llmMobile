"""
services/download_svc.py
Owns: _downloads_lock, _active_downloads, _download_queue
Handles: HuggingFace search, model download (streaming + resume), status, scan-and-register
"""

import os
import re
import time
import shutil
import asyncio
import threading
import urllib.parse
from typing import Dict, Any

import httpx
from fastapi import HTTPException

from utils.common import MODELS_DIR, MODES_INI_PATH
from utils.db_utils import get_db_conn, _clean_model_id
from models.requests import DownloadRequest
from services.model_svc import _add_to_models_ini
from services.sse_svc import broadcast_notification

# ── Owned globals ──────────────────────────────────────────────────────────────
_downloads_lock = threading.Lock()
_active_downloads: Dict[str, Dict[str, Any]] = {}  # key: "{repo_id}/{filename}"
_download_queue: asyncio.Queue = None  # initialised in init_download_queue()


def init_download_queue() -> asyncio.Queue:
    """Create the asyncio Queue and store it; returns it for task creation."""
    global _download_queue
    _download_queue = asyncio.Queue()
    return _download_queue


# ── Internal helpers ───────────────────────────────────────────────────────────

def get_quantization_from_name(name: str) -> str:
    match = re.search(r'\b(Q[0-9]_[K_M_L_S_X_]+|IQ[0-9]_[A-Z_]+)\b', name, re.IGNORECASE)
    if match:
        return match.group(1).upper()
    return "Unknown"


# ── Download worker ────────────────────────────────────────────────────────────

async def download_queue_worker():
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
                    # Range not satisfiable – file may already be complete
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
                    total_bytes = current_bytes + int(r.headers.get("content-length", 0))
                    mode = "ab"
                else:
                    total_bytes = int(r.headers.get("content-length", 0))
                    current_bytes = 0
                    mode = "wb"

                with _downloads_lock:
                    _active_downloads[key]["total"] = total_bytes

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


# ── Public API functions (called by route handlers in main.py) ─────────────────

async def search_hf_models(q: str):
    url = f"https://huggingface.co/api/models?search={urllib.parse.quote(q)}&filter=gguf&limit=10"
    async with httpx.AsyncClient() as client:
        try:
            r = await client.get(url, timeout=10.0)
            return r.json()
        except Exception as e:
            raise HTTPException(status_code=502, detail=str(e))


async def get_hf_model_details(repo_id: str):
    url = f"https://huggingface.co/api/models/{repo_id}?blobs=true"
    async with httpx.AsyncClient() as client:
        try:
            r = await client.get(url, timeout=10.0)
            data = r.json()
            gguf_files = []
            for s in data.get("siblings", []):
                fname = s.get("rfilename", "")
                if fname.lower().endswith(".gguf"):
                    gguf_files.append({"filename": fname, "size": s.get("size")})
            return {
                "repo_id": repo_id,
                "gguf_files": gguf_files,
                "downloads": data.get("downloads", 0),
                "likes": data.get("likes", 0)
            }
        except Exception as e:
            raise HTTPException(status_code=502, detail=str(e))


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
        """, (model_id, req.filename, get_quantization_from_name(req.filename),
              "Queued for download", "Queued for download"))
        conn.commit()
        conn.close()
    except Exception as e:
        print(f"[Download Queue] Failed to write QUEUED state to DB: {e}")

    _download_queue.put_nowait((req.repo_id, req.filename))
    broadcast_notification(f"📥 Added {req.filename} to download queue.")
    return {"detail": "Added to download queue", "key": key}


def get_downloads_status():
    with _downloads_lock:
        return {"downloads": list(_active_downloads.values())}


def scan_and_register_models():
    try:
        if not os.path.exists(MODELS_DIR):
            return {"detail": "Models directory not found.", "registered": []}

        gguf_files = []
        for filename in os.listdir(MODELS_DIR):
            if filename.lower().endswith(".gguf"):
                if "mmproj" not in filename.lower():
                    gguf_files.append(filename)

        # Build set of already-registered names from models.ini
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

        added = []
        for filename in gguf_files:
            if filename.lower() not in registered_in_ini:
                _add_to_models_ini(filename)
                added.append(filename)

        return {"detail": f"Scan complete. Registered {len(added)} new models.", "registered": added}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
