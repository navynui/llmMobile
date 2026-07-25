"""
Shared utility functions for MCP tools: resource checks, state queries, safe defaults.
"""

import os
import json
import asyncio
from typing import Optional

# ── Constants ──────────────────────────────────────────────────────────────────

VRAM_TOTAL_PRIMARY_GB = 16.0   # Tesla P100
VRAM_TOTAL_SECONDARY_GB = 6.0  # GTX 1060
VRAM_SAFE_MARGIN_GB = 2.0      # Reserve for KV cache / system
VRAM_SAFE_MARGIN_GTX_GB = 1.0  # Reserve for GTX 1060

HOST_STORAGE_TOTAL_GB = 464.0  # Root partition
STORAGE_SAFE_MARGIN_GB = 20.0  # Minimum free space we require

MODELS_DIR = "/models"
BENCHMARK_RESULTS_DIR = "/app/benchmark_results"

MCP_SERVER_PORT = int(os.environ.get("MCP_SERVER_PORT", "8002"))
MCP_SERVER_HOST = os.environ.get("MCP_SERVER_HOST", "0.0.0.0")


# ── FastAPI proxy helpers ──────────────────────────────────────────────────────

API_BASE = "http://localhost:8000"

async def _api_get(path: str) -> dict:
    """GET a FastAPI endpoint and return parsed JSON."""
    import httpx
    async with httpx.AsyncClient(timeout=10.0) as c:
        resp = await c.get(f"{API_BASE}{path}")
        resp.raise_for_status()
        return resp.json()


async def _api_post(path: str, body: dict = None) -> dict:
    """POST to a FastAPI endpoint and return parsed JSON."""
    import httpx
    async with httpx.AsyncClient(timeout=30.0) as c:
        resp = await c.post(f"{API_BASE}{path}", json=body or {})
        resp.raise_for_status()
        return resp.json()


async def _api_delete(path: str) -> dict:
    """DELETE a FastAPI endpoint and return parsed JSON."""
    import httpx
    async with httpx.AsyncClient(timeout=10.0) as c:
        resp = await c.delete(f"{API_BASE}{path}")
        resp.raise_for_status()
        return resp.json()


# ── Resource checks ────────────────────────────────────────────────────────────

async def check_server_status() -> dict:
    """Get full status of all containers."""
    return await _api_get("/status")


async def check_system_stats() -> dict:
    """Get MQTT telemetry (CPU, GPU, VRAM, disk)."""
    return await _api_get("/system_stats")


async def check_benchmark_running() -> bool:
    """Return True if a benchmark is currently executing."""
    try:
        status = await _api_get("/api/benchmarks/status")
        return status.get("running", False) or status.get("queue_running", False)
    except Exception:
        return False


async def check_generation_running() -> bool:
    """Return True if the ComfyUI generation queue is active."""
    try:
        queue = await _api_get("/api/generate/queue")
        for item in queue.get("queue", []):
            if item.get("status") in ("queued", "running"):
                return True
        return False
    except Exception:
        return False


async def check_disk_space_gb() -> float:
    """Return estimated free disk space in GB."""
    try:
        stats = await check_system_stats()
        free_gb = stats.get("storage_free_gb", 0.0)
        if free_gb:
            return free_gb
        # Fallback: compute from percent
        used_pct = stats.get("storage_percent", 0.0)
        if used_pct > 0:
            return round(HOST_STORAGE_TOTAL_GB * (100 - used_pct) / 100, 1)
        return HOST_STORAGE_TOTAL_GB
    except Exception:
        return HOST_STORAGE_TOTAL_GB  # Optimistic fallback


async def check_model_size_gb(filename: str) -> Optional[float]:
    """Return the size of a model file in GB, or None if not found."""
    path = os.path.join(MODELS_DIR, filename)
    if os.path.exists(path):
        return round(os.path.getsize(path) / (1024 ** 3), 2)
    return None


async def check_vram_gb(server: str = "primary") -> Optional[float]:
    """Return the current VRAM usage in GB for a given server."""
    stats = await check_system_stats()
    if server == "secondary":
        vram_pct = stats.get("vram_percent_gtx", 0.0)
        if vram_pct:
            return round((vram_pct / 100) * VRAM_TOTAL_SECONDARY_GB, 2)
        return None
    # Primary: prefer absolute vram_used_gb
    vram_used = stats.get("vram_used_gb")
    if vram_used and vram_used > 0:
        return round(vram_used, 2)
    vram_pct = stats.get("vram_percent", 0.0)
    if vram_pct:
        return round((vram_pct / 100) * VRAM_TOTAL_PRIMARY_GB, 2)
    return None


async def get_loaded_model(server: str = "primary") -> Optional[str]:
    """Return the currently loaded model ID on a server, or None."""
    try:
        endpoint = "/api/llm/models" if server == "primary" else "/api/llm-mini/models"
        data = await _api_get(endpoint)
        for m in data.get("data", []):
            s = m.get("status")
            if s == "loaded" or (isinstance(s, dict) and s.get("value") == "loaded"):
                return m.get("id")
        return None
    except Exception:
        return None


async def check_model_fits_vram(filename: str, server: str = "primary") -> tuple[bool, str]:
    """Check if a model file is small enough to fit in the server's VRAM.

    Returns (fits: bool, reason: str).
    """
    size_gb = await check_model_size_gb(filename)
    if size_gb is None:
        return False, f"Model file '{filename}' not found in {MODELS_DIR}"

    if server == "secondary":
        max_model = VRAM_TOTAL_SECONDARY_GB - VRAM_SAFE_MARGIN_GTX_GB
        if size_gb > max_model:
            return False, (
                f"Model {filename} is {size_gb:.1f} GB but GTX 1060 only has "
                f"{VRAM_TOTAL_SECONDARY_GB} GB total. Max model size with margin: {max_model:.1f} GB. "
                f"Try a smaller quant (Q4_K_M or lower) or use the primary server."
            )
        return True, f"Model {filename} ({size_gb:.1f} GB) fits on secondary GPU"

    # Primary server
    current_vram = await check_vram_gb("primary") or 0
    free_vram = VRAM_TOTAL_PRIMARY_GB - current_vram
    max_model = VRAM_TOTAL_PRIMARY_GB - VRAM_SAFE_MARGIN_GB

    if size_gb > max_model:
        return False, (
            f"Model {filename} is {size_gb:.1f} GB but Tesla P100 has "
            f"{VRAM_TOTAL_PRIMARY_GB} GB total. Max model size with margin: {max_model:.1f} GB. "
            f"Try a smaller quant (Q4_K_M or lower)."
        )

    if size_gb > free_vram:
        loaded = await get_loaded_model("primary")
        return False, (
            f"Model {filename} ({size_gb:.1f} GB) requires more VRAM than currently free "
            f"({free_vram:.1f} GB). Current loaded model: {loaded or 'none'}. "
            f"Unload the current model first to free VRAM."
        )

    return True, f"Model {filename} ({size_gb:.1f} GB) fits on primary GPU"


async def list_gguf_files() -> list[str]:
    """List all .gguf files in the models directory."""
    if not os.path.exists(MODELS_DIR):
        return []
    return sorted(
        f for f in os.listdir(MODELS_DIR)
        if f.lower().endswith(".gguf") and os.path.isfile(os.path.join(MODELS_DIR, f))
    )