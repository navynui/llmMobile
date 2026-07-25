"""
MCP tools for server lifecycle (start/stop/restart containers).
"""

import json
from mcp.server.fastmcp import FastMCP

from mcp_server.utils import (
    _api_post, _api_get, check_benchmark_running, check_generation_running,
    get_loaded_model,
)

VALID_SERVERS = ["llama-server", "llama-server-mini"]


def register_tools(mcp: FastMCP):
    """Register all server lifecycle tools."""

    # ── get_server_status ───────────────────────────────────────────────────

    @mcp.tool(
        name="get_server_status",
        description=(
            "Get the status of all managed containers: llm-mobile (the dashboard), "
            "llama-server (primary, port 8080, Tesla P100), "
            "llama-server-mini (secondary, port 8081, GTX 1060), "
            "and comfyui (image generation)."
        ),
    )
    async def get_server_status_tool() -> str:
        """Get comprehensive status of all servers."""
        try:
            status = await _api_get("/status")
            servers = status.get("servers", [])
            manager = status.get("manager", {})
            comfyui = status.get("comfyui", {})

            return json.dumps({
                "status": "ok",
                "manager": {
                    "container": "llm-mobile",
                    "status": manager.get("status"),
                    "uptime": manager.get("uptime"),
                },
                "servers": [
                    {
                        "name": s.get("name"),
                        "container": s.get("container"),
                        "label": s.get("label"),
                        "status": s.get("status"),
                        "uptime": s.get("uptime"),
                    }
                    for s in servers
                ],
                "comfyui": {
                    "container": "comfyui",
                    "status": comfyui.get("status"),
                    "uptime": comfyui.get("uptime"),
                },
            })
        except Exception as e:
            return json.dumps({
                "status": "error",
                "error": f"Failed to get server status: {str(e)}",
            })

    # ── start_server ────────────────────────────────────────────────────────

    @mcp.tool(
        name="start_server",
        description=(
            "Start a llama-server instance. The server will begin listening for "
            "chat completions and model loading requests."
            "\n\n"
            "Parameters:\n"
            "- server: 'llama-server' (primary, Tesla P100) or "
            "'llama-server-mini' (secondary, GTX 1060)"
        ),
    )
    async def start_server_tool(server: str = "llama-server") -> str:
        """Start a llama-server Docker container."""
        if server not in VALID_SERVERS:
            return json.dumps({
                "status": "error",
                "error": f"Invalid server '{server}'. Valid: {VALID_SERVERS}",
            })
        try:
            result = await _api_post(f"/servers/{server}/start")
            return json.dumps({
                "status": "ok",
                "message": f"Server '{server}' started.",
                "detail": result,
                "note": "It may take 10–30 seconds for the model to load. Use get_server_status to verify.",
            })
        except Exception as e:
            return json.dumps({
                "status": "error",
                "error": f"Failed to start server '{server}': {str(e)}",
                "server": server,
            })

    # ── stop_server ─────────────────────────────────────────────────────────

    @mcp.tool(
        name="stop_server",
        description=(
            "Stop a llama-server instance. The container is stopped and removed. "
            "Any loaded model is unloaded from GPU memory."
            "\n\n"
            "WARNING: If a benchmark is running, stopping the server will cause "
            "the benchmark to fail. Check benchmark status first."
            "\n\n"
            "Parameters:\n"
            "- server: 'llama-server' or 'llama-server-mini'\n"
            "- force: if True, stop even if a benchmark is running (default False)"
        ),
    )
    async def stop_server_tool(server: str = "llama-server", force: bool = False) -> str:
        """Stop a llama-server Docker container."""
        if server not in VALID_SERVERS:
            return json.dumps({
                "status": "error",
                "error": f"Invalid server '{server}'. Valid: {VALID_SERVERS}",
            })

        # Check if benchmark is running
        if await check_benchmark_running() and not force:
            return json.dumps({
                "status": "error",
                "error": (
                    f"A benchmark is currently running on this server. "
                    f"Set force=True to stop anyway (will abort the benchmark)."
                ),
            })

        try:
            result = await _api_post(f"/servers/{server}/stop")
            return json.dumps({
                "status": "ok",
                "message": f"Server '{server}' stopped. GPU VRAM freed.",
                "detail": result,
            })
        except Exception as e:
            return json.dumps({
                "status": "error",
                "error": f"Failed to stop server '{server}': {str(e)}",
                "server": server,
            })

    # ── restart_server ──────────────────────────────────────────────────────

    @mcp.tool(
        name="restart_server",
        description=(
            "Restart a llama-server instance (stop + start). "
            "Use this after changing the server's INI config to apply changes."
            "\n\n"
            "WARNING: Interrupts any active inference. Check benchmark status first."
            "\n\n"
            "Parameters:\n"
            "- server: 'llama-server' or 'llama-server-mini'\n"
            "- force: if True, restart even if a benchmark is running (default False)"
        ),
    )
    async def restart_server_tool(server: str = "llama-server", force: bool = False) -> str:
        """Restart a llama-server Docker container."""
        if server not in VALID_SERVERS:
            return json.dumps({
                "status": "error",
                "error": f"Invalid server '{server}'. Valid: {VALID_SERVERS}",
            })

        if await check_benchmark_running() and not force:
            return json.dumps({
                "status": "error",
                "error": (
                    f"A benchmark is running. Set force=True to restart anyway "
                    f"(will abort the benchmark)."
                ),
            })

        try:
            result = await _api_post(f"/servers/{server}/restart")
            return json.dumps({
                "status": "ok",
                "message": f"Server '{server}' restarted.",
                "detail": result,
            })
        except Exception as e:
            return json.dumps({
                "status": "error",
                "error": f"Failed to restart server '{server}': {str(e)}",
                "server": server,
            })

    # ── get_server_logs ─────────────────────────────────────────────────────

    @mcp.tool(
        name="get_server_logs",
        description=(
            "Get recent logs from a Docker container. Useful for debugging "
            "model loading failures, server crashes, or inference issues."
            "\n\n"
            "Parameters:\n"
            "- container: container name — 'llm-server', 'llm-server-mini', "
            "'llm-mobile', or 'comfyui' (default 'llm-server')\n"
            "- lines: number of log lines to fetch (default 100)"
        ),
    )
    async def get_server_logs_tool(container: str = "llm-server", lines: int = 100) -> str:
        """Get Docker container logs."""
        from urllib.parse import quote
        try:
            data = await _api_get(f"/api/logs?container_name={quote(container)}&lines={lines}")
            log_text = data.get("logs", "")
            # Truncate if too long
            if len(log_text) > 10000:
                log_text = log_text[-10000:]
            return json.dumps({
                "status": "ok",
                "container": container,
                "lines_requested": lines,
                "logs": log_text,
            })
        except Exception as e:
            return json.dumps({
                "status": "error",
                "error": f"Failed to get logs for '{container}': {str(e)}",
                "container": container,
            })

    # ── get_system_stats ────────────────────────────────────────────────────

    @mcp.tool(
        name="get_system_stats",
        description=(
            "Get live hardware telemetry from the system: CPU temperature and "
            "utilization, RAM usage, GPU temperature and utilization, VRAM usage "
            "for both Tesla P100 and GTX 1060, and disk storage. "
            "Data is sourced from Home Assistant via MQTT."
        ),
    )
    async def get_system_stats_tool() -> str:
        """Get hardware telemetry."""
        try:
            stats = await _api_get("/system_stats")
            return json.dumps({
                "status": "ok",
                "stats": {
                    "cpu": {
                        "temperature_c": stats.get("cpu_temp"),
                        "utilization_pct": stats.get("cpu_util"),
                    },
                    "ram": {
                        "used_pct": stats.get("ram_percent"),
                    },
                    "gpu_primary": {
                        "name": "Tesla P100",
                        "temperature_c": stats.get("gpu_temp"),
                        "utilization_pct": stats.get("gpu_util"),
                        "vram_pct": stats.get("vram_percent"),
                        "vram_total_gb": 16.0,
                    },
                    "gpu_secondary": {
                        "name": "GTX 1060",
                        "temperature_c": stats.get("gpu_temp_gtx"),
                        "utilization_pct": stats.get("gpu_util_gtx"),
                        "vram_pct": stats.get("vram_percent_gtx"),
                        "vram_total_gb": 6.0,
                    },
                    "storage": {
                        "total_gb": stats.get("storage_total_gb"),
                        "used_gb": stats.get("storage_used_gb"),
                        "used_pct": stats.get("storage_percent"),
                    },
                },
            })
        except Exception as e:
            return json.dumps({
                "status": "error",
                "error": f"Failed to get system stats: {str(e)}",
            })