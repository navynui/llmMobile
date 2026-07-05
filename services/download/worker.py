import os
import time
import shutil
import asyncio
import httpx
from utils.common import MODELS_DIR, MODES_INI_PATH
from utils.db_utils import get_db_conn, _clean_model_id
from services.model_svc import _add_to_models_ini, _add_to_ini, MINI_MODELS_INI

# Models larger than this on disk are unlikely to fit on the GTX�1060 (6 GB VRAM)
# once KV cache and runtime overhead are accounted for.
GTX_MAX_MODEL_BYTES = 6 * 1024**3  # 6 GB


def _should_register_on_secondary(filepath: str) -> bool:
    """Check if a GGUF file is small enough to run on the secondary GTX�1060."""
    try:
        return os.path.getsize(filepath) <= GTX_MAX_MODEL_BYTES
    except Exception:
        return False
from .state import _downloads_lock, _active_downloads, _download_queue

async def download_queue_worker():
    print("[Download Queue] Asynchronous Sequential Download Worker started.")
    while True:
        try:
            # Import inside loop to get fresh reference to possibly-initialized queue
            from .state import _download_queue as queue_ref
            if queue_ref is None:
                print("[Download Queue] WARNING: Queue not initialized, waiting...")
                await asyncio.sleep(5)
                continue
            
            repo_id, filename = await queue_ref.get()
            print(f"[Download Queue] Starting sequential download for: {repo_id}/{filename}")
            try:
                await _download_model_task(repo_id, filename)
            except Exception as e:
                print(f"[Download Queue] Exception in download task for {filename}: {e}")
            finally:
                queue_ref.task_done()
        except asyncio.CancelledError:
            break
        except Exception as e:
            import traceback
            print(f"[Download Queue] Queue worker error: {e}")
            traceback.print_exc()
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
                    if _should_register_on_secondary(dest_path):
                        _add_to_ini(filename, MINI_MODELS_INI)
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
                            SET status = 'completed', notes = 'Download completed successfully'
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
                        with _downloads_lock:
                            status = _active_downloads.get(key, {}).get("status") if key in _active_downloads else None
                            if status != "downloading":
                                print(f"[Download Task] Aborting chunk loop because status is: {status}")
                                break
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

                with _downloads_lock:
                    status = _active_downloads.get(key, {}).get("status") if key in _active_downloads else None
                    if status in ["paused", "cancelled"] or key not in _active_downloads:
                        print(f"[Download Task] Exiting task, status is: {status}")
                        return

                if current_bytes >= total_bytes:
                    shutil.move(temp_path, dest_path)
                    _add_to_models_ini(filename)
                    if _should_register_on_secondary(dest_path):
                        _add_to_ini(filename, MINI_MODELS_INI)
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
                            SET status = 'completed', notes = 'Download completed successfully'
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
                status = _active_downloads[key].get("status")
                if status in ["paused", "cancelled"]:
                    return
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
                SET status = 'failed', notes = ?
                WHERE model_id = ?
            """, (f"Error: {str(e)}", model_id))
            conn.commit()
            conn.close()
        except Exception as db_err:
            print(f"[Download DB] Failed to update status to FAILED: {db_err}")


