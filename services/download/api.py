import os
import re
import urllib.parse
from fastapi import HTTPException
from utils.common import MODELS_DIR, MODES_INI_PATH, get_quantization_from_name
from utils.db_utils import get_db_conn, _clean_model_id
from models.requests import DownloadRequest
from services.model_svc import _add_to_models_ini, _add_to_ini, MINI_MODELS_INI
from services.sse_svc import broadcast_notification
from .state import _downloads_lock, _active_downloads, _download_queue

# ── Public API functions (called by route handlers in main.py) ─────────────────

def download_model(req: DownloadRequest):
    try:
        print(f"[Download Queue] Starting download for: {req.repo_id}/{req.filename}")
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
                VALUES (?, ?, ?, 'queued', ?)
                ON CONFLICT(model_id) DO UPDATE SET
                    status = 'queued',
                    notes = ?
            """, (model_id, req.filename, get_quantization_from_name(req.filename),
                  "Queued for download", "Queued for download"))
            conn.commit()
            conn.close()
        except Exception as e:
            print(f"[Download Queue] Failed to write QUEUED state to DB: {e}")
            import traceback
            traceback.print_exc()

        # Check if queue is initialized (import fresh reference)
        from .state import _download_queue as current_queue
        if current_queue is None:
            print("[Download Queue] ERROR: Queue not initialized!")
            raise HTTPException(status_code=500, detail="Download queue not initialized. Please restart the server.")
        
        print(f"[Download Queue] Putting {req.repo_id}/{req.filename} into queue...")
        current_queue.put_nowait((req.repo_id, req.filename))
        broadcast_notification(f"📥 Added {req.filename} to download queue.")
        print(f"[Download Queue] Successfully added to queue: {key}")
        return {"detail": "Added to download queue", "key": key}
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        print(f"[Download Queue] Error in download_model: {e}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


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
                # Also register on secondary if file fits on GTX�1060
                filepath = os.path.join(MODELS_DIR, filename)
                if os.path.exists(filepath):
                    file_size = os.path.getsize(filepath)
                    if file_size <= 6 * 1024**3:  # 6 GB
                        _add_to_ini(filename, MINI_MODELS_INI)

        return {"detail": f"Scan complete. Registered {len(added)} new models.", "registered": added}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ── Download control functions ─────────────────────────────────────────────────

def stop_download(key: str):
    """Stop/pause an active download."""
    with _downloads_lock:
        if key not in _active_downloads:
            raise HTTPException(status_code=404, detail="Download not found")
        
        download = _active_downloads[key]
        if download["status"] not in ["downloading", "queued"]:
            raise HTTPException(status_code=400, detail=f"Cannot stop download in status: {download['status']}")
        
        download["status"] = "paused"
        download["speed"] = "0 KB/s"
        
        try:
            conn = get_db_conn()
            cursor = conn.cursor()
            model_id = _clean_model_id(download["filename"])
            cursor.execute("""
                UPDATE models
                SET status = 'PAUSED', notes = 'Download paused by user'
                WHERE model_id = ?
            """, (model_id,))
            conn.commit()
            conn.close()
        except Exception as db_err:
            print(f"[Download DB] Failed to update status to PAUSED: {db_err}")
    
    return {"detail": f"Download {key} paused"}


def resume_download(key: str):
    """Resume a paused or failed download."""
    with _downloads_lock:
        if key not in _active_downloads:
            raise HTTPException(status_code=404, detail="Download not found")
        
        download = _active_downloads[key]
        if download["status"] not in ["paused", "failed", "completed"]:
            raise HTTPException(status_code=400, detail=f"Cannot resume download in status: {download['status']}")
        
        if download["status"] == "completed":
            download.update({
                "status": "queued",
                "downloaded": 0,
                "progress": 0.0,
                "error": None
            })
        else:
            download["status"] = "queued"
            download["error"] = None
        
        try:
            conn = get_db_conn()
            cursor = conn.cursor()
            model_id = _clean_model_id(download["filename"])
            status = 'queued' if download["status"] == "queued" else 'PAUSED'
            notes = 'Download resumed by user' if download["status"] == "queued" else 'Download paused by user'
            cursor.execute("""
                UPDATE models
                SET status = ?, notes = ?
                WHERE model_id = ?
            """, (status, notes, model_id))
            conn.commit()
            conn.close()
        except Exception as db_err:
            print(f"[Download DB] Failed to update status: {db_err}")
    
    if download["status"] == "queued":
        repo_id, filename = download["repo_id"], download["filename"]
        _download_queue.put_nowait((repo_id, filename))
        broadcast_notification(f"📥 Resumed download: {filename}")
    
    return {"detail": f"Download {key} resumed"}


def cancel_download(key: str):
    """Cancel a download and clean up partial files."""
    with _downloads_lock:
        if key not in _active_downloads:
            raise HTTPException(status_code=404, detail="Download not found")
        
        download = _active_downloads[key]
        repo_id, filename = download["repo_id"], download["filename"]
        
        download["status"] = "cancelled"
        download["speed"] = "0 KB/s"
        
        try:
            conn = get_db_conn()
            cursor = conn.cursor()
            model_id = _clean_model_id(filename)
            cursor.execute("""
                UPDATE models
                SET status = 'CANCELLED', notes = 'Download cancelled by user'
                WHERE model_id = ?
            """, (model_id,))
            conn.commit()
            conn.close()
        except Exception as db_err:
            print(f"[Download DB] Failed to update status to CANCELLED: {db_err}")
        
        dest_path = os.path.join(MODELS_DIR, filename)
        temp_path = dest_path + ".download"
        for path in [temp_path, dest_path]:
            try:
                if os.path.exists(path):
                    os.remove(path)
                    print(f"[Download Cleanup] Removed {path}")
            except Exception as e:
                print(f"[Download Cleanup] Failed to remove {path}: {e}")
    
    return {"detail": f"Download {key} cancelled and cleaned up"}


def clear_finished_downloads():
    """Remove completed downloads from the active downloads list."""
    with _downloads_lock:
        to_remove = []
        for key, download in _active_downloads.items():
            if download["status"] in ["completed", "cancelled"]:
                to_remove.append(key)
        
        for key in to_remove:
            del _active_downloads[key]
    
    return {"detail": f"Cleared {len(to_remove)} finished downloads"}
