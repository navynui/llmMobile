"""
services/vram_svc.py — Centralized VRAM management.

Provides helpers to read live VRAM from the existing telemetry pipeline,
compute GB values, and persist them per-model in the DB.
Also provides a shared idle-trigger monitor so benchmark and model-load flows
don't duplicate log-watching logic.
"""

import asyncio
import time
from typing import Optional

from utils.db_utils import get_db_conn, _clean_model_id
from services.docker_svc import get_system_stats
from utils.common import VRAM_TOTAL_GB

# Track which model_ids have already captured VRAM to avoid redundant updates.
_captured_vram: dict[str, float] = {}


def get_model_vram_gb() -> Optional[float]:
    """Read live VRAM from the telemetry pipeline and return GB used.

    Prefers absolute vram_used_gb (from nvidia-smi memory.used in MB) when
    available — this is more reliable than percentage-based calculation
    which can be misleading on GPUs with large total memory where a single
    model's footprint is only a small fraction of the total.

    Returns None if telemetry is missing or zero (model not loaded / idle).
    """
    stats = get_system_stats()
    # Prefer absolute value from nvidia-smi (memory.used in MB → GB).
    vram_used_gb = stats.get("vram_used_gb")
    if vram_used_gb is not None and vram_used_gb > 0:
        return round(vram_used_gb, 2)
    # Fallback: percentage-based calculation.
    vram_pct = stats.get("vram_percent", 0.0)
    if not vram_pct:
        return None
    # Subtract the baseline that was already allocated before the model loads.
    # We want *additional* VRAM consumed by this specific model, but since we
    # only capture once per model transition to idle, the full percent reflects
    # the loaded model's footprint.
    return round((vram_pct / 100) * VRAM_TOTAL_GB, 2)


def _update_model_vram_row(model_id: str, vram_gb: Optional[float], status: str):
    """Persist VRAM and status for a given model_id."""
    try:
        conn = get_db_conn()
        cursor = conn.cursor()

        # If the row doesn't exist yet, create it.
        cursor.execute("SELECT model_id FROM models WHERE model_id = ?", (model_id,))
        exists = cursor.fetchone() is not None

        if exists:
            cursor.execute("""
                UPDATE models SET vram_gb = ?, status = ? WHERE model_id = ?
            """, (vram_gb, status, model_id))
        else:
            quantization = "Unknown"
            try:
                from services.judge_svc import get_quantization_from_name
                quantization = get_quantization_from_name(model_id)
            except Exception:
                pass

            cursor.execute("""
                INSERT INTO models (model_id, name, quantization, status, vram_gb)
                VALUES (?, ?, ?, ?, ?)
            """, (model_id, model_id, quantization, status, vram_gb))

        conn.commit()
        conn.close()
    except Exception as e:
        print(f"[VRAM] Failed to update DB row for {model_id}: {e}")


async def capture_and_store_vram(model_id: str, status: str = "good", timeout: float = 15.0) -> Optional[float]:
    """Capture current VRAM and persist it.

    Waits for a non-zero reading from the MQTT telemetry pipeline before
    capturing — the external sensor needs time to poll GPU memory after
    the model loads, so an immediate read may return stale/zero data.

    Args:
        model_id: Model identifier.
        status: Status label to persist in the DB.
        timeout: Seconds to wait for a non-zero reading before giving up.
    """
    global _captured_vram

    # Skip if we already captured for this model (and the value hasn't changed much).
    prev = _captured_vram.get(model_id)
    if prev is not None:
        cur = get_model_vram_gb()
        if cur is not None and abs(cur - prev) < 0.5:
            return prev

    # Wait for a real (non-zero) VRAM reading from the telemetry pipeline.
    deadline = time.time() + timeout
    while time.time() < deadline:
        vram_gb = get_model_vram_gb()
        if vram_gb is not None and vram_gb > 1.0:  # at least 1 GB to be meaningful for a model
            break
        await asyncio.sleep(1)

    # Normalize status to lowercase.
    norm_status = status.lower()
    _update_model_vram_row(model_id, vram_gb, norm_status)
    if vram_gb is not None:
        _captured_vram[model_id] = vram_gb
    return vram_gb


async def wait_for_idle_trigger(log_client=None, timeout: float = 120.0) -> bool:
    """Poll server logs for the idle trigger after a model load or benchmark round.

    Returns True when the trigger is found; False on timeout.
    Uses get_logs() if no log_client is provided (the default route).
    """
    from services.docker_svc import get_logs as _get_logs

    start = time.time()
    while time.time() - start < timeout:
        try:
            logs_resp = await asyncio.get_event_loop().run_in_executor(
                None, lambda: _get_logs("llm-server", lines=200)
            )
            log_text = (logs_resp or {}).get("logs", "")
            if "all slots are idle" in log_text.lower():
                return True
        except Exception as e:
            print(f"[VRAM] Idle trigger poll error: {e}")
        await asyncio.sleep(2)

    return False


def clear_vram_capture_cache(model_id: Optional[str] = None):
    """Clear the VRAM capture cache (for testing or forced refresh)."""
    if model_id:
        _captured_vram.pop(model_id, None)
    else:
        _captured_vram.clear()
