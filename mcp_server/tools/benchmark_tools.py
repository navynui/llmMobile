"""
MCP tools for benchmark execution, temperature sweeps, and results retrieval.
"""

import json
from mcp.server.fastmcp import FastMCP

from mcp_server.utils import (
    _api_get, _api_post, check_benchmark_running, check_generation_running,
    get_loaded_model, check_model_size_gb, list_gguf_files,
)


def register_tools(mcp: FastMCP):
    """Register all benchmark-related tools."""

    # ── run_benchmark ───────────────────────────────────────────────────────

    @mcp.tool(
        name="run_benchmark",
        description=(
            "Run the full 5-round automated benchmark on the currently loaded model. "
            "WARNING: This takes 5–30+ minutes. It runs 5 prompt rounds (Knowledge QA, "
            "Technical Reasoning, Code Generation, Abstract Reasoning, Creative Writing), "
            "then optionally runs AI Judge grading."
            "\n\n"
            "Parameters:\n"
            "- judge_model_id: optional model ID to use as the Judge (defaults to current loaded model)\n"
            "- server: 'primary' or 'secondary' (default 'primary')\n"
            "- auto_grade: if True, triggers AI Judge grading after benchmark (default True)"
        ),
    )
    async def run_benchmark_tool(
        judge_model_id: str = "",
        server: str = "primary",
        auto_grade: bool = True,
    ) -> str:
        """Start a single-model benchmark with safety checks."""
        if await check_benchmark_running():
            return json.dumps({
                "status": "error",
                "error": "A benchmark is already running. Wait for it to complete or check status.",
            })

        loaded = await get_loaded_model(server)
        if not loaded:
            return json.dumps({
                "status": "error",
                "error": (
                    f"No model is loaded on {server}. "
                    f"Load a model first with load_model."
                ),
                "server": server,
            })

        body = {
            "server": server,
            "judge_model_id": judge_model_id or None,
        }

        try:
            result = await _api_post("/api/benchmarks/run", body)
            return json.dumps({
                "status": "ok",
                "message": (
                    f"Benchmark started for '{loaded}' on {server}. "
                    f"Estimated time: 5–30 minutes depending on model speed."
                    f"\n\nUse check_benchmark_status to monitor progress."
                    f"\nUse get_benchmark_results when complete."
                ),
                "model": loaded,
                "server": server,
                "auto_grade": auto_grade,
                "detail": result,
            })
        except Exception as e:
            return json.dumps({
                "status": "error",
                "error": f"Failed to start benchmark: {str(e)}",
                "model": loaded,
                "server": server,
            })

    # ── run_benchmark_queue ─────────────────────────────────────────────────

    @mcp.tool(
        name="run_benchmark_queue",
        description=(
            "Run benchmarks for MULTIPLE models in sequence. Each model is loaded, "
            "tested with 5 rounds, and optionally graded before moving to the next. "
            "WARNING: This can take HOURS depending on the number of models. "
            "Includes 10s cooldowns between models to prevent VRAM locks."
            "\n\n"
            "Parameters:\n"
            "- models: list of .gguf filenames to test\n"
            "- judge_model_id: model ID to use as the Judge (required)\n"
            "- server: 'primary' or 'secondary' (default 'primary')"
        ),
    )
    async def run_benchmark_queue_tool(
        models: list[str],
        judge_model_id: str,
        server: str = "primary",
    ) -> str:
        """Start a multi-model benchmark queue."""
        if await check_benchmark_running():
            return json.dumps({
                "status": "error",
                "error": "A benchmark is already running. Wait for it to complete.",
            })

        # Validate all models exist on disk
        available = set(await list_gguf_files())
        missing = [m for m in models if m not in available and not any(
            a.lower() == m.lower() for a in available
        )]
        if missing:
            return json.dumps({
                "status": "error",
                "error": f"Models not found on disk: {missing}. Use list_models to see available models.",
                "missing": missing,
            })

        # Estimate total time
        est_min_per_model = 15
        total_est_min = len(models) * est_min_per_model

        body = {
            "models": models,
            "judge_model_id": judge_model_id,
            "server": server,
        }

        try:
            result = await _api_post("/api/benchmarks/queue/run", body)
            return json.dumps({
                "status": "ok",
                "message": (
                    f"Benchmark queue started for {len(models)} models on {server}."
                    f"\nEstimated time: ~{total_est_min} minutes ({len(models)} models × ~{est_min_per_model} min each)."
                    f"\n\nUse check_benchmark_status to monitor progress."
                ),
                "models": models,
                "server": server,
                "judge_model": judge_model_id,
                "estimated_minutes": total_est_min,
                "detail": result,
            })
        except Exception as e:
            return json.dumps({
                "status": "error",
                "error": f"Failed to start benchmark queue: {str(e)}",
            })

    # ── check_benchmark_status ─────────────────────────────────────────────

    @mcp.tool(
        name="check_benchmark_status",
        description=(
            "Get live progress of the current benchmark run or queue. "
            "Reports which round is executing, how many rounds completed, "
            "and the current model being tested."
        ),
    )
    async def check_benchmark_status_tool() -> str:
        """Check benchmark progress."""
        try:
            status = await _api_get("/api/benchmarks/status")
            running = status.get("running", False)
            queue_running = status.get("queue_running", False)

            if not running and not queue_running:
                return json.dumps({
                    "status": "idle",
                    "message": "No benchmark is currently running.",
                })

            return json.dumps({
                "status": "running",
                "model": status.get("model_id", "unknown"),
                "current_round": status.get("current_round", ""),
                "rounds_completed": status.get("rounds_completed", 0),
                "server": status.get("server", "primary"),
                "queue_running": queue_running,
                "queue_current_index": status.get("queue_current_index"),
                "queue_total": len(status.get("queue", [])),
                "queue_completed": len(status.get("queue_completed", [])),
            })
        except Exception as e:
            return json.dumps({
                "status": "error",
                "error": f"Failed to get benchmark status: {str(e)}",
            })

    # ── get_benchmark_results ───────────────────────────────────────────────

    @mcp.tool(
        name="get_benchmark_results",
        description=(
            "Get benchmark results for a specific model. Returns scores for each "
            "of the 5 rounds (Knowledge QA, Technical Reasoning, Code Generation, "
            "Abstract Reasoning, Creative Writing), speed metrics, and hallucination "
            "detection. Also includes the overall quality assessment."
            "\n\n"
            "Parameters:\n"
            "- model_id: model identifier (e.g. 'Meta-Llama-3.1-8B-Instruct.Q4_K_M.gguf')\n"
            "- server: 'primary' or 'secondary' (default 'primary')"
        ),
    )
    async def get_benchmark_results_tool(model_id: str, server: str = "primary") -> str:
        """Get benchmark results for a specific model."""
        try:
            data = await _api_get(f"/api/benchmarks/details?model_id={model_id}&server={server}")
            return json.dumps({
                "status": "ok",
                "model_id": model_id,
                "server": server,
                "results": data,
            })
        except Exception as e:
            return json.dumps({
                "status": "error",
                "error": f"Failed to get results: {str(e)}",
                "model_id": model_id,
            })

    # ── list_benchmarks ─────────────────────────────────────────────────────

    @mcp.tool(
        name="list_benchmarks",
        description=(
            "List all benchmarked models with their overall scores. "
            "Shows which models have been tested and their performance summary."
            "\n\n"
            "Parameters:\n"
            "- show_all: if True, shows all runs including failures (default False)\n"
            "- server: 'primary' or 'secondary' or None for both"
        ),
    )
    async def list_benchmarks_tool(show_all: bool = False, server: str = "") -> str:
        """List all benchmarked models."""
        params = f"show_all={str(show_all).lower()}"
        if server:
            params += f"&server={server}"
        try:
            data = await _api_get(f"/api/benchmarks?{params}")
            return json.dumps({
                "status": "ok",
                "benchmarks": data,
            })
        except Exception as e:
            return json.dumps({
                "status": "error",
                "error": f"Failed to list benchmarks: {str(e)}",
            })

    # ── run_temperature_sweep ───────────────────────────────────────────────

    @mcp.tool(
        name="run_temperature_sweep",
        description=(
            "Run a temperature sweep on the currently loaded model: test the "
            "Technical Reasoning prompt at multiple temperatures, then grade "
            "all responses to find the optimal temperature. "
            "WARNING: This takes 5–15 minutes."
            "\n\n"
            "Parameters:\n"
            "- judge_model_id: model ID for grading (optional, defaults to current model)\n"
            "- server: 'primary' or 'secondary' (default 'primary')\n"
            "- temperatures: list of temperatures to test (default [0.3, 0.5, 0.7, 1.0, 1.3])"
        ),
    )
    async def run_temperature_sweep_tool(
        judge_model_id: str = "",
        server: str = "primary",
        temperatures: list[float] = None,
    ) -> str:
        """Start a temperature sweep on the loaded model."""
        if await check_benchmark_running():
            return json.dumps({
                "status": "error",
                "error": "A benchmark is already running. Wait for it to complete.",
            })

        loaded = await get_loaded_model(server)
        if not loaded:
            return json.dumps({
                "status": "error",
                "error": f"No model loaded on {server}. Load one first.",
            })

        if temperatures is None:
            temperatures = [0.3, 0.5, 0.7, 1.0, 1.3]

        body = {
            "judge_model_id": judge_model_id or None,
            "server": server,
            "temperatures": temperatures,
        }

        try:
            result = await _api_post("/api/benchmarks/temperature-sweep", body)
            return json.dumps({
                "status": "ok",
                "message": (
                    f"Temperature sweep started for '{loaded}' on {server} with "
                    f"{len(temperatures)} temperatures: {temperatures}."
                    f"\nUse check_benchmark_status to monitor."
                ),
                "model": loaded,
                "server": server,
                "temperatures": temperatures,
                "detail": result,
            })
        except Exception as e:
            return json.dumps({
                "status": "error",
                "error": f"Failed to start temperature sweep: {str(e)}",
            })