"""
MCP tools for image generation via ComfyUI queue.
"""

import json
from mcp.server.fastmcp import FastMCP

from mcp_server.utils import (
    _api_get, _api_post, _api_delete, check_generation_running,
    check_benchmark_running, get_loaded_model,
)


def register_tools(mcp: FastMCP):
    """Register all image generation tools."""

    # ── generate_image ──────────────────────────────────────────────────────

    @mcp.tool(
        name="generate_image",
        description=(
            "Submit an image generation prompt to the ComfyUI pipeline. "
            "The system automatically handles VRAM: if llama-server has a model loaded, "
            "it will be unloaded before ComfyUI runs, then reloaded after generation."
            "\n\n"
            "WARNING: Image generation takes 30s–5min depending on resolution, "
            "workflow, and GPU load. The system includes a cooldown period (180s) "
            "before reloading the LLM model to let GPU memory settle."
            "\n\n"
            "Parameters:\n"
            "- prompt: text description of the image to generate\n"
            "- resolution: image dimensions (e.g. '1920x1088', '1024x1024', '768x1344')\n"
            "- num_images: number of images to generate (1–16, default 1)\n"
            "- model: workflow model — 'zimage' (z-image-turbo, default), "
            "'krea2-turbo', 'boogu-turbo', or 'both' for side-by-side comparison\n"
            "- force_generate: if True, skip the VRAM check and generate even if "
            "llama-server is busy (default False)"
        ),
    )
    async def generate_image_tool(
        prompt: str,
        resolution: str = "1920x1088",
        num_images: int = 1,
        model: str = "zimage",
        force_generate: bool = False,
    ) -> str:
        """Submit an image generation request to the queue."""
        if not prompt.strip():
            return json.dumps({
                "status": "error",
                "error": "Prompt cannot be empty.",
            })

        # Clamp num_images
        num_images = max(1, min(num_images, 16))

        # Check generation queue state
        if await check_generation_running() and not force_generate:
            return json.dumps({
                "status": "ok",
                "message": (
                    "Generation is already running. Your request has been queued "
                    "and will start when the current generation completes."
                ),
            })

        body = {
            "prompt": prompt,
            "resolution": resolution,
            "num_images": num_images,
            "model": model,
            "force_generate": force_generate,
        }

        try:
            result = await _api_post("/api/generate/queue", body)
            queue_id = result.get("queue_id", "unknown")
            return json.dumps({
                "status": "ok",
                "message": (
                    f"Generation queued successfully (ID: {queue_id})."
                    f"\nPrompt: {prompt[:80]}{'...' if len(prompt) > 80 else ''}"
                    f"\nResolution: {resolution}"
                    f"\nModel: {model}"
                    f"\nImages: {num_images}"
                    f"\n\nUse check_generation_status to monitor progress."
                    f"\nGenerated images appear in the gallery."
                ),
                "queue_id": queue_id,
                "prompt": prompt,
                "resolution": resolution,
                "model": model,
                "num_images": num_images,
                "detail": result,
            })
        except Exception as e:
            return json.dumps({
                "status": "error",
                "error": f"Failed to queue generation: {str(e)}",
                "prompt": prompt[:100],
            })

    # ── check_generation_status ─────────────────────────────────────────────

    @mcp.tool(
        name="check_generation_status",
        description=(
            "Check the status of the image generation queue. "
            "Shows queued, running, completed, and failed items with progress."
        ),
    )
    async def check_generation_status_tool() -> str:
        """Get the current generation queue status."""
        try:
            data = await _api_get("/api/generate/queue")
            queue = data.get("queue", [])
            if not queue:
                return json.dumps({
                    "status": "idle",
                    "message": "Generation queue is empty.",
                })

            # Summarize
            status_counts = {}
            for item in queue:
                s = item.get("status", "unknown")
                status_counts[s] = status_counts.get(s, 0) + 1

            running_item = None
            for item in queue:
                if item.get("status") in ("queued", "running"):
                    running_item = {
                        "id": item.get("id"),
                        "prompt": item.get("prompt", "")[:60],
                        "status": item.get("status"),
                        "progress": item.get("progress", 0),
                        "model": item.get("model"),
                        "image_count": len(item.get("image_ids", [])),
                    }
                    break

            return json.dumps({
                "status": "active",
                "total_items": len(queue),
                "status_summary": status_counts,
                "current_item": running_item,
                "queue": queue,
            })
        except Exception as e:
            return json.dumps({
                "status": "error",
                "error": f"Failed to get generation status: {str(e)}",
            })

    # ── cancel_generation ───────────────────────────────────────────────────

    @mcp.tool(
        name="cancel_generation",
        description=(
            "Cancel a queued or running image generation by its queue ID."
            "\n\n"
            "Parameters:\n"
            "- queue_id: the queue ID returned by generate_image (e.g. 'qa1b2c3d')"
        ),
    )
    async def cancel_generation_tool(queue_id: str) -> str:
        """Cancel a generation queue item."""
        try:
            result = await _api_delete(f"/api/generate/queue/{queue_id}")
            return json.dumps({
                "status": "ok",
                "message": f"Generation {queue_id} cancelled.",
                "detail": result,
            })
        except Exception as e:
            return json.dumps({
                "status": "error",
                "error": f"Failed to cancel generation: {str(e)}",
                "queue_id": queue_id,
            })