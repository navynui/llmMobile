"""
MCP tools for downloading models from HuggingFace with disk-space safety checks.
"""

import json
from mcp.server.fastmcp import FastMCP

from mcp_server.utils import (
    _api_get, _api_post, check_disk_space_gb, list_gguf_files,
    HOST_STORAGE_TOTAL_GB, STORAGE_SAFE_MARGIN_GB, MODELS_DIR,
)


def register_tools(mcp: FastMCP):
    """Register all download-related tools."""

    # ── search_huggingface_models ───────────────────────────────────────────

    @mcp.tool(
        name="search_huggingface_models",
        description=(
            "Search HuggingFace for GGUF models available for download. "
            "Returns model repo IDs and available files."
            "\n\n"
            "Parameters:\n"
            "- query: search string (e.g. 'Llama-3.2-3B GGUF')\n"
            "- max_results: maximum results to return (default 10)"
        ),
    )
    async def search_huggingface_models_tool(query: str, max_results: int = 10) -> str:
        """Search HuggingFace for GGUF models."""
        try:
            data = await _api_get(f"/api/models/search?q={query}")
            results = data if isinstance(data, list) else data.get("results", data.get("models", []))
            # Limit results
            results = results[:max_results]
            return json.dumps({
                "status": "ok",
                "query": query,
                "results": results,
                "total_found": len(results),
            })
        except Exception as e:
            return json.dumps({
                "status": "error",
                "error": f"Search failed: {str(e)}",
                "query": query,
            })

    # ── get_model_details ───────────────────────────────────────────────────

    @mcp.tool(
        name="get_model_details",
        description=(
            "Get detailed information about a specific HuggingFace model repo, "
            "including file sizes, quantizations available, and download URLs."
            "\n\n"
            "Parameters:\n"
            "- repo_id: HuggingFace repo ID (e.g. 'QuantFactory/Meta-Llama-3.1-8B-Instruct-GGUF')"
        ),
    )
    async def get_model_details_tool(repo_id: str) -> str:
        """Get details about a model repo on HuggingFace."""
        try:
            data = await _api_get(f"/api/models/details?repo_id={repo_id}")
            return json.dumps({
                "status": "ok",
                "repo_id": repo_id,
                "details": data,
            })
        except Exception as e:
            return json.dumps({
                "status": "error",
                "error": f"Failed to get details: {str(e)}",
                "repo_id": repo_id,
            })

    # ── download_model ──────────────────────────────────────────────────────

    @mcp.tool(
        name="download_model",
        description=(
            "Download a GGUF model from HuggingFace. WARNING: Models can be "
            "2–40+ GB and will use significant disk space (root partition: "
            f"{HOST_STORAGE_TOTAL_GB} GB total). "
            "The tool checks available disk space before starting."
            "\n\n"
            "Parameters:\n"
            "- repo_id: HuggingFace repo ID (e.g. 'QuantFactory/Meta-Llama-3.1-8B-Instruct-GGUF')\n"
            "- filename: the .gguf file to download (e.g. 'Meta-Llama-3.1-8B-Instruct.Q4_K_M.gguf')\n"
            "- target_server: 'primary', 'secondary', or 'both' — which INI to auto-register in (default 'primary')"
        ),
    )
    async def download_model_tool(
        repo_id: str,
        filename: str,
        target_server: str = "primary",
    ) -> str:
        """Download a model from HuggingFace with disk space safety checks."""
        if not filename.endswith(".gguf"):
            return json.dumps({
                "status": "error",
                "error": f"Filename must end with .gguf. Got: '{filename}'",
            })

        # Check if already downloaded
        existing_models = await list_gguf_files()
        if filename in existing_models:
            return json.dumps({
                "status": "ok",
                "message": f"Model '{filename}' is already downloaded. Use load_model to load it.",
                "filename": filename,
            })

        # Check disk space
        free_gb = await check_disk_space_gb()
        if free_gb < STORAGE_SAFE_MARGIN_GB + 5:
            return json.dumps({
                "status": "error",
                "error": (
                    f"Low disk space: only {free_gb:.1f} GB free on root partition "
                    f"({HOST_STORAGE_TOTAL_GB} GB total). "
                    f"Need at least {STORAGE_SAFE_MARGIN_GB + 5:.0f} GB free for safe download. "
                    f"Use delete_model to remove unused models first."
                ),
                "free_gb": free_gb,
            })

        # Start the download
        try:
            result = await _api_post("/api/models/download", {
                "repo_id": repo_id,
                "filename": filename,
            })
            return json.dumps({
                "status": "ok",
                "message": f"Download queued for {filename} from {repo_id}.",
                "filename": filename,
                "repo_id": repo_id,
                "free_disk_gb": free_gb,
                "target_server": target_server,
                "detail": result,
                "note": "Use check_download_status to monitor progress.",
            })
        except Exception as e:
            return json.dumps({
                "status": "error",
                "error": f"Failed to queue download: {str(e)}",
                "repo_id": repo_id,
                "filename": filename,
            })

    # ── check_download_status ───────────────────────────────────────────────

    @mcp.tool(
        name="check_download_status",
        description=(
            "Check the status of all active and recent model downloads. "
            "Use this after download_model to monitor progress."
        ),
    )
    async def check_download_status_tool() -> str:
        """Return the status of all downloads."""
        try:
            data = await _api_get("/api/models/downloads")
            downloads = data.get("downloads", [])
            if not downloads:
                return json.dumps({
                    "status": "ok",
                    "downloads": [],
                    "message": "No active or recent downloads.",
                })

            return json.dumps({
                "status": "ok",
                "downloads": downloads,
                "active_count": sum(1 for d in downloads if d.get("status") in ("downloading", "queued")),
            })
        except Exception as e:
            return json.dumps({
                "status": "error",
                "error": f"Failed to get download status: {str(e)}",
            })

    # ── cancel_download ─────────────────────────────────────────────────────

    @mcp.tool(
        name="cancel_download",
        description=(
            "Cancel a download that is in progress and clean up any partial file. "
            "\n\n"
            "Parameters:\n"
            "- repo_id: HuggingFace repo ID\n"
            "- filename: the .gguf filename being downloaded"
        ),
    )
    async def cancel_download_tool(repo_id: str, filename: str) -> str:
        """Cancel an active download and remove partial files."""
        key = f"{repo_id}/{filename}"
        try:
            result = await _api_post(f"/api/models/downloads/{key}/cancel")
            return json.dumps({
                "status": "ok",
                "message": f"Download cancelled and partial files removed.",
                "filename": filename,
                "detail": result,
            })
        except Exception as e:
            return json.dumps({
                "status": "error",
                "error": f"Failed to cancel download: {str(e)}",
                "filename": filename,
            })

    # ── scan_and_register_models ────────────────────────────────────────────

    @mcp.tool(
        name="scan_and_register_models",
        description=(
            "Scan the /models/ directory for any GGUF files that aren't yet "
            "registered in the server's INI config and add them. "
            "Use this after downloading a model manually or to fix missing registry entries."
            "\n\n"
            "Parameters:\n"
            "- server: 'primary' (models.ini) or 'secondary' (modelg.ini) or 'both'"
        ),
    )
    async def scan_and_register_models_tool(server: str = "both") -> str:
        """Scan disk and register unlisted models."""
        results = {}
        errors = []

        try:
            if server in ("primary", "both"):
                resp = await _api_post("/api/models/scan_and_register")
                results["primary"] = resp
        except Exception as e:
            errors.append(f"Primary scan failed: {e}")

        try:
            if server in ("secondary", "both"):
                resp = await _api_post("/api/models-mini/scan_and_register")
                results["secondary"] = resp
        except Exception as e:
            errors.append(f"Secondary scan failed: {e}")

        if not results and errors:
            return json.dumps({"status": "error", "errors": errors})

        return json.dumps({
            "status": "ok",
            "results": results,
            "errors": errors if errors else None,
        })