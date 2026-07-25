"""
MCP tools for model lifecycle: list, load, unload, delete model files.
"""

import json
import os
from mcp.server.fastmcp import FastMCP

from mcp_server.utils import (
    check_model_fits_vram, check_model_size_gb, get_loaded_model,
    check_benchmark_running, check_generation_running, list_gguf_files,
    check_disk_space_gb, _api_post, _api_get, _api_delete,
    MODELS_DIR,
)


def register_tools(mcp: FastMCP):
    """Register all model management tools."""

    # ── list_models ────────────────────────────────────────────────────────

    @mcp.tool(
        name="list_models",
        description=(
            "List all GGUF model files available on disk and their registration "
            "status in the server's INI configuration. Use this first to discover "
            "what models are available to load."
        ),
    )
    async def list_models_tool() -> str:
        """Return all available models with their file sizes and registration status."""
        gguf_files = await list_gguf_files()
        if not gguf_files:
            return json.dumps({
                "status": "ok",
                "models": [],
                "message": "No .gguf files found in /models/. Use download_model to get one.",
            })

        models_info = []
        for fname in gguf_files:
            size_gb = await check_model_size_gb(fname)
            models_info.append({
                "filename": fname,
                "size_gb": size_gb,
            })

        # Check which model is currently loaded
        loaded_primary = await get_loaded_model("primary")
        loaded_secondary = await get_loaded_model("secondary")

        return json.dumps({
            "status": "ok",
            "models": models_info,
            "loaded_primary": loaded_primary,
            "loaded_secondary": loaded_secondary,
            "total_models": len(models_info),
        })

    # ── load_model ──────────────────────────────────────────────────────────

    @mcp.tool(
        name="load_model",
        description=(
            "Load a GGUF model onto one of the llama-server instances. "
            "CRITICAL: This action loads a model into GPU memory. "
            "If the model is too large for the GPU, the server will crash. "
            "ALWAYS verify VRAM before loading. The tool performs automatic "
            "VRAM checks and will reject models that don't fit."
            "\n\n"
            "Parameters:\n"
            "- model: filename of the .gguf file (e.g. 'Meta-Llama-3.1-8B-Instruct.Q4_K_M.gguf')\n"
            "- server: 'primary' (Tesla P100, 16 GB) or 'secondary' (GTX 1060, 6 GB)"
        ),
    )
    async def load_model_tool(
        model: str,
        server: str = "primary",
    ) -> str:
        """Load a model onto the specified server with VRAM safety checks."""
        # ── Validate server ─────────────────────────────────────────────────
        if server not in ("primary", "secondary"):
            return json.dumps({
                "status": "error",
                "error": f"Invalid server '{server}'. Must be 'primary' or 'secondary'.",
            })

        # ── Validate filename ───────────────────────────────────────────────
        if not model.endswith(".gguf"):
            return json.dumps({
                "status": "error",
                "error": f"Model filename must end with .gguf. Got: '{model}'",
            })
        if "/" in model or "\\" in model:
            return json.dumps({
                "status": "error",
                "error": "Model filename must not contain path separators.",
            })

        # ── Check model exists on disk ──────────────────────────────────────
        size_gb = await check_model_size_gb(model)
        if size_gb is None:
            return json.dumps({
                "status": "error",
                "error": (
                    f"Model '{model}' not found in {MODELS_DIR}. "
                    f"Use download_model first or check the filename."
                ),
                "available_models": await list_gguf_files(),
            })

        # ── VRAM check ──────────────────────────────────────────────────────
        fits, reason = await check_model_fits_vram(model, server)
        if not fits:
            return json.dumps({
                "status": "error",
                "error": f"VRAM check failed: {reason}",
                "model": model,
                "size_gb": size_gb,
                "server": server,
            })

        # ── Check no benchmark/generation running ──────────────────────────
        if await check_benchmark_running():
            return json.dumps({
                "status": "error",
                "error": (
                    "A benchmark is currently running. Wait for it to complete "
                    "before loading a different model."
                ),
            })

        # ── Unload current model first if needed ────────────────────────────
        loaded = await get_loaded_model(server)
        if loaded:
            if loaded.lower() == model.lower():
                return json.dumps({
                    "status": "ok",
                    "message": f"Model '{model}' is already loaded on {server}.",
                    "model": model,
                    "server": server,
                })
            # Unload first
            unload_endpoint = "/api/llm/models/unload" if server == "primary" else "/api/llm-mini/models/unload"
            try:
                await _api_post(unload_endpoint, {"model": loaded})
            except Exception as e:
                return json.dumps({
                    "status": "error",
                    "error": f"Failed to unload current model '{loaded}': {str(e)}. Try unloading manually first.",
                })

        # ── Load the model ─────────────────────────────────────────────────
        load_endpoint = "/api/llm/models/load" if server == "primary" else "/api/llm-mini/models/load"
        try:
            result = await _api_post(load_endpoint, {"model": model})

            # Verify the model actually loaded
            import asyncio
            await asyncio.sleep(2)

            new_loaded = await get_loaded_model(server)
            if new_loaded and new_loaded.lower() == model.lower():
                return json.dumps({
                    "status": "ok",
                    "message": f"Model '{model}' ({size_gb:.1f} GB) loaded successfully on {server}.",
                    "model": model,
                    "server": server,
                    "size_gb": size_gb,
                    "details": result,
                })
            else:
                return json.dumps({
                    "status": "warning",
                    "message": f"Load request sent but could not verify model '{model}' is loaded on {server}.",
                    "model": model,
                    "server": server,
                    "currently_loaded": new_loaded,
                    "response": result,
                })
        except Exception as e:
            return json.dumps({
                "status": "error",
                "error": f"Failed to load model '{model}' on {server}: {str(e)}",
                "model": model,
                "server": server,
                "size_gb": size_gb,
            })

    # ── unload_model ────────────────────────────────────────────────────────

    @mcp.tool(
        name="unload_model",
        description=(
            "Unload the currently loaded model from a llama-server instance, "
            "freeing GPU VRAM. Always call this before loading a different model "
            "to avoid VRAM exhaustion."
            "\n\n"
            "Parameters:\n"
            "- server: 'primary' (Tesla P100) or 'secondary' (GTX 1060)"
        ),
    )
    async def unload_model_tool(server: str = "primary") -> str:
        """Unload the current model from the specified server."""
        if server not in ("primary", "secondary"):
            return json.dumps({
                "status": "error",
                "error": f"Invalid server '{server}'. Must be 'primary' or 'secondary'.",
            })

        loaded = await get_loaded_model(server)
        if not loaded:
            return json.dumps({
                "status": "ok",
                "message": f"No model is currently loaded on {server}. Nothing to unload.",
                "server": server,
            })

        endpoint = "/api/llm/models/unload" if server == "primary" else "/api/llm-mini/models/unload"
        try:
            result = await _api_post(endpoint, {"model": loaded})

            # Verify the model actually unloaded
            import asyncio
            await asyncio.sleep(2)

            still_loaded = await get_loaded_model(server)
            if still_loaded and still_loaded.lower() == loaded.lower():
                return json.dumps({
                    "status": "warning",
                    "message": f"Unload request sent but model '{loaded}' still appears loaded on {server}.",
                    "model": loaded,
                    "server": server,
                    "response": result,
                })

            return json.dumps({
                "status": "ok",
                "message": f"Model '{loaded}' unloaded successfully from {server}. VRAM freed.",
                "model": loaded,
                "server": server,
            })
        except Exception as e:
            return json.dumps({
                "status": "error",
                "error": f"Failed to unload model from {server}: {str(e)}",
                "model": loaded,
                "server": server,
            })

    # ── delete_model ────────────────────────────────────────────────────────

    @mcp.tool(
        name="delete_model",
        description=(
            "⚠️ DESTRUCTIVE: Permanently delete a GGUF model file from disk. "
            "This cannot be undone — the file will be gone permanently. "
            "The tool will remove the model file AND clean up its INI configuration entry."
            "\n\n"
            "Parameters:\n"
            "- model: filename of the .gguf file to delete\n"
            "- server: 'primary' (models.ini) or 'secondary' (modelg.ini) — which INI to clean up\n"
            "- confirm: MUST be set to True to execute. This is a safety measure."
        ),
    )
    async def delete_model_tool(
        model: str,
        server: str = "primary",
        confirm: bool = False,
    ) -> str:
        """Permanently delete a model file and its INI config. Requires explicit confirmation."""
        if not confirm:
            return json.dumps({
                "status": "error",
                "error": (
                    "Safety confirmation required. Set confirm=True to proceed. "
                    "This will permanently delete the model file."
                ),
                "model": model,
            })

        if not model.endswith(".gguf"):
            return json.dumps({
                "status": "error",
                "error": f"Model filename must end with .gguf. Got: '{model}'",
            })

        # Check if the model exists
        size_gb = await check_model_size_gb(model)
        if size_gb is None:
            return json.dumps({
                "status": "error",
                "error": f"Model '{model}' not found on disk. Nothing to delete.",
            })

        # Check if the model is currently loaded — warn but allow
        loaded_primary = await get_loaded_model("primary")
        loaded_secondary = await get_loaded_model("secondary")
        is_loaded = (
            (loaded_primary and loaded_primary.lower() == model.lower()) or
            (loaded_secondary and loaded_secondary.lower() == model.lower())
        )

        if is_loaded:
            return json.dumps({
                "status": "error",
                "error": (
                    f"Model '{model}' ({size_gb:.1f} GB) is currently loaded on a server. "
                    f"Unload it first before deleting."
                ),
                "model": model,
                "loaded_primary": loaded_primary,
                "loaded_secondary": loaded_secondary,
            })

        # Perform the deletion
        try:
            endpoint = f"/models/{model}" if server == "primary" else f"/models-mini/{model}"
            result = await _api_delete(endpoint)
            return json.dumps({
                "status": "ok",
                "message": f"Model '{model}' ({size_gb:.1f} GB) permanently deleted.",
                "model": model,
                "size_gb": size_gb,
                "detail": result,
            })
        except Exception as e:
            return json.dumps({
                "status": "error",
                "error": f"Failed to delete model '{model}': {str(e)}",
                "model": model,
            })

    # ── get_server_models ───────────────────────────────────────────────────

    @mcp.tool(
        name="get_server_models",
        description=(
            "Get the list of models currently known to a llama-server instance "
            "(loaded and available presets). Use this to check what the server "
            "has loaded or what presets are available."
            "\n\n"
            "Parameters:\n"
            "- server: 'primary' or 'secondary'"
        ),
    )
    async def get_server_models_tool(server: str = "primary") -> str:
        """Return the model status from llama-server's /models endpoint."""
        if server not in ("primary", "secondary"):
            return json.dumps({
                "status": "error",
                "error": f"Invalid server '{server}'.",
            })

        endpoint = "/api/llm/models" if server == "primary" else "/api/llm-mini/models"
        try:
            data = await _api_get(endpoint)
            models_list = []
            for m in data.get("data", []):
                mid = m.get("id", "unknown")
                status = m.get("status", "unknown")
                models_list.append({
                    "id": mid,
                    "status": str(status.get("value", status)) if isinstance(status, dict) else str(status),
                })
            return json.dumps({
                "status": "ok",
                "server": server,
                "models": models_list,
            })
        except Exception as e:
            return json.dumps({
                "status": "error",
                "error": f"Failed to get models from {server}: {str(e)}",
                "server": server,
            })