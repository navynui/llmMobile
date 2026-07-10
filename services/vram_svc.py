"""
services/vram_svc.py — Centralized VRAM management.

Provides helpers to read live VRAM from the existing telemetry pipeline,
compute GB values, and persist them per-model in the DB.
Also provides a shared idle-trigger monitor so benchmark and model-load flows
don't duplicate log-watching logic.

Supports per-server VRAM reading for primary (Tesla P100) and secondary
(GTX 1060) GPU.
"""

import asyncio
import time
from typing import Optional

from utils.db_utils import get_db_conn, _clean_model_id
from services.docker_svc import get_system_stats
from utils.common import VRAM_TOTAL_GB, VRAM_TOTAL_GB_GTX

# Track which model_ids have already captured VRAM to avoid redundant updates.
_captured_vram: dict[str, float] = {}


def get_model_vram_gb(server: str = "primary") -> Optional[float]:
    """Read live VRAM from the telemetry pipeline and return GB used.

    Reads from the appropriate GPU based on *server*:
      - "primary"   → Tesla P100  (16 GB), stats key vram_percent
      - "secondary" → GTX 1060     (6 GB), stats key vram_percent_gtx

    Returns None if telemetry is missing or zero (model not loaded / idle).
    """
    stats = get_system_stats()

    if server == "secondary":
        vram_pct = stats.get("vram_percent_gtx", 0.0)
        if not vram_pct:
            return None
        return round((vram_pct / 100) * VRAM_TOTAL_GB_GTX, 2)

    # Primary server: prefer absolute value from nvidia-smi (memory.used in MB → GB).
    vram_used_gb = stats.get("vram_used_gb")
    if vram_used_gb is not None and vram_used_gb > 0:
        return round(vram_used_gb, 2)
    # Fallback: percentage-based calculation.
    vram_pct = stats.get("vram_percent", 0.0)
    if not vram_pct:
        return None
    return round((vram_pct / 100) * VRAM_TOTAL_GB, 2)


def _update_model_vram_row(model_id: str, vram_gb: Optional[float], status: str):
    """Persist VRAM and status for a given model_id."""
    try:
        norm_model_id = _clean_model_id(model_id)

        conn = get_db_conn()
        cursor = conn.cursor()

        cursor.execute("SELECT model_id FROM models WHERE model_id = ?", (norm_model_id,))
        exists = cursor.fetchone() is not None

        if exists:
            cursor.execute("""
                UPDATE models SET vram_gb = ?, status = ? WHERE model_id = ?
            """, (vram_gb, status, norm_model_id))
        else:
            quantization = "Unknown"
            try:
                from utils.common import get_quantization_from_name
                quantization = get_quantization_from_name(norm_model_id)
            except Exception:
                pass

            cursor.execute("""
                INSERT INTO models (model_id, name, quantization, status, vram_gb)
                VALUES (?, ?, ?, ?, ?)
            """, (norm_model_id, norm_model_id, quantization, status, vram_gb))

        conn.commit()
        conn.close()
    except Exception as e:
        print(f"[VRAM] Failed to update DB row for {model_id}: {e}")


async def capture_and_store_vram(model_id: str, status: str = "good", timeout: float = 15.0, server: str = "primary", run_id: Optional[str] = None) -> Optional[float]:
    """Capture current VRAM and persist it.

    Waits for a non-zero reading from the MQTT telemetry pipeline before
    capturing — the external sensor needs time to poll GPU memory after
    the model loads, so an immediate read may return stale/zero data.

    When *run_id* is provided, VRAM is stored in test_runs.vram_gb (per-run)
    in addition to models.vram_gb. This ensures models tested on multiple
    GPUs retain correct per-server VRAM values.

    Args:
        model_id: Model identifier.
        status: Status label to persist in the DB.
        timeout: Seconds to wait for a non-zero reading before giving up.
        server: Which GPU to read from ("primary" or "secondary").
        run_id: If provided, also persist VRAM in the test_runs row.
    """
    global _captured_vram

    norm_model_id = _clean_model_id(model_id)

    # Skip if we already captured for this model (and the value hasn't changed much).
    prev = _captured_vram.get(norm_model_id)
    if prev is not None:
        cur = get_model_vram_gb(server=server)
        if cur is not None and abs(cur - prev) < 0.5:
            return prev

    # Wait for a real (non-zero) VRAM reading from the telemetry pipeline.
    deadline = time.time() + timeout
    while time.time() < deadline:
        vram_gb = get_model_vram_gb(server=server)
        if vram_gb is not None and vram_gb > 1.0:
            break
        await asyncio.sleep(1)

    norm_status = status.lower()
    _update_model_vram_row(norm_model_id, vram_gb, norm_status)

    # Also persist per-run VRAM when a run_id is available
    if run_id and vram_gb is not None:
        try:
            conn = get_db_conn()
            cursor = conn.cursor()
            cursor.execute(
                "UPDATE test_runs SET vram_gb = ? WHERE run_id = ?",
                (vram_gb, run_id)
            )
            conn.commit()
            conn.close()
        except Exception as e:
            print(f"[VRAM] Failed to update test_runs.vram_gb for run {run_id}: {e}")

    if vram_gb is not None:
        _captured_vram[norm_model_id] = vram_gb
    return vram_gb


async def wait_for_idle_trigger(log_client=None, timeout: float = 30.0, server: str = "primary") -> bool:
    """Wait for server slots to be idle after a model load or benchmark round.

    Uses llama-server's /slots API (is_processing field) which is much faster
    and more reliable than log parsing. Falls back to log-based detection for
    older llama.cpp versions.

    Returns True when all slots are idle; False on timeout.
    """
    import httpx

    base_url = "http://llm-server:8080" if server == "primary" else "http://llm-server-mini:8080"
    start = time.time()

    while time.time() - start < timeout:
        # Primary method: check /slots API (newer llama.cpp router mode)
        try:
            async with httpx.AsyncClient(timeout=5) as client:
                models_resp = await client.get(f"{base_url}/models")
                models_data = models_resp.json()
                loaded_model = None
                for m in models_data.get("data", []):
                    s = m.get("status")
                    if s == "loaded" or (isinstance(s, dict) and s.get("value") == "loaded"):
                        loaded_model = m.get("id")
                        break

                if loaded_model:
                    slots_resp = await client.get(
                        f"{base_url}/slots", params={"model": loaded_model}
                    )
                    slots = slots_resp.json()
                    all_idle = all(
                        not slot.get("is_processing", True) for slot in slots
                    )
                    if all_idle:
                        return True
        except Exception:
            pass  # Fall through to log-based check below

        # Fallback: log-based detection for older llama.cpp
        try:
            from services.docker_svc import get_logs as _get_logs

            container_name = "llm-server-mini" if server == "secondary" else "llm-server"
            logs_resp = await asyncio.get_event_loop().run_in_executor(
                None, lambda: _get_logs(container_name, lines=100)
            )
            log_text = (logs_resp or {}).get("logs", "")
            # Older format: "all slots are idle"
            if "all slots are idle" in log_text.lower():
                return True
            # Newer router mode: check that the last slot line is a release
            lines = log_text.strip().split("\n")
            slot_lines = [
                l
                for l in lines[-50:]
                if "slot" in l.lower()
                and (
                    "release" in l.lower()
                    or "launch_slot_" in l.lower()
                    or "get_availabl" in l.lower()
                )
            ]
            if slot_lines:
                last = slot_lines[-1].lower()
                # Idle if last slot event is a release (stop processing) or
                # a get_availabl with no subsequent launch
                if "release" in last and "stop processing" in last:
                    return True
        except Exception:
            pass

        await asyncio.sleep(1)

    return False


def clear_vram_capture_cache(model_id: Optional[str] = None):
    """Clear the VRAM capture cache (for testing or forced refresh)."""
    if model_id:
        norm_model_id = _clean_model_id(model_id)
        _captured_vram.pop(norm_model_id, None)
    else:
        _captured_vram.clear()
