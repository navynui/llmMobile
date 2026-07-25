"""
MCP tools for gallery management (browse, organize, delete images).
"""

import json
from mcp.server.fastmcp import FastMCP

from mcp_server.utils import (
    _api_get, _api_post, _api_delete,
)


def register_tools(mcp: FastMCP):
    """Register all gallery management tools."""

    # ── browse_gallery ──────────────────────────────────────────────────────

    @mcp.tool(
        name="browse_gallery",
        description=(
            "Browse the generated image gallery. Returns folders, images, "
            "and metadata at a given path."
            "\n\n"
            "Parameters:\n"
            "- path: subfolder path (default '' for root)\n"
            "- page: page number for pagination (default 1)\n"
            "- limit: images per page (default 24)"
        ),
    )
    async def browse_gallery_tool(path: str = "", page: int = 1, limit: int = 24) -> str:
        """Browse the generated images gallery."""
        from urllib.parse import quote
        params = f"path={quote(path)}&page={page}&limit={limit}"
        try:
            data = await _api_get(f"/api/gallery/browse?{params}")
            images = data.get("images", [])
            folders = data.get("folders", [])
            total = data.get("total_images", 0)
            pages = data.get("total_pages", 0)

            # Summarize
            image_summary = []
            for img in images[:10]:
                image_summary.append({
                    "filename": img.get("filename"),
                    "prompt": (img.get("prompt") or "")[:50],
                    "model": img.get("model"),
                    "seed": img.get("seed"),
                })

            return json.dumps({
                "status": "ok",
                "current_path": data.get("current_path", path),
                "folders": folders,
                "images": image_summary,
                "total_images": total,
                "page": page,
                "total_pages": pages,
                "has_more": len(images) > 10,
            })
        except Exception as e:
            return json.dumps({
                "status": "error",
                "error": f"Failed to browse gallery: {str(e)}",
                "path": path,
            })

    # ── get_gallery_folders ─────────────────────────────────────────────────

    @mcp.tool(
        name="get_gallery_folders",
        description=(
            "List all folders in the gallery. Use this to navigate the gallery "
            "structure before browsing."
        ),
    )
    async def get_gallery_folders_tool() -> str:
        """Get all gallery folders."""
        try:
            folders = await _api_get("/api/gallery/all_folders")
            return json.dumps({
                "status": "ok",
                "folders": folders if isinstance(folders, list) else folders.get("folders", []),
            })
        except Exception as e:
            return json.dumps({
                "status": "error",
                "error": f"Failed to get folders: {str(e)}",
            })

    # ── delete_gallery_images ───────────────────────────────────────────────

    @mcp.tool(
        name="delete_gallery_images",
        description=(
            "⚠️ DESTRUCTIVE: Permanently delete images from the gallery. "
            "This cannot be undone. Provide explicit confirmation."
            "\n\n"
            "Parameters:\n"
            "- filenames: list of image filenames to delete\n"
            "- folders: list of folder names to delete (deletes all contents)\n"
            "- current_path: the gallery subfolder path where files are located\n"
            "- confirm: MUST be True to execute"
        ),
    )
    async def delete_gallery_images_tool(
        filenames: list[str],
        current_path: str = "",
        folders: list[str] = None,
        confirm: bool = False,
    ) -> str:
        """Delete images/folders from the gallery with explicit confirmation."""
        if not confirm:
            items = []
            if filenames:
                items.extend(f"  - images: {filenames}")
            if folders:
                items.extend(f"  - folders: {folders} (and all contents)")
            return json.dumps({
                "status": "error",
                "error": (
                    "Safety confirmation required. Set confirm=True to proceed. "
                    "This will permanently delete the following:\n" + "\n".join(items)
                ),
            })

        body = {
            "current_path": current_path,
            "filenames": filenames,
            "folders": folders or [],
        }

        try:
            result = await _api_post("/api/gallery/delete", body)
            return json.dumps({
                "status": "ok",
                "message": f"Deleted {len(filenames)} files and {len(folders or [])} folders.",
                "detail": result,
            })
        except Exception as e:
            return json.dumps({
                "status": "error",
                "error": f"Failed to delete: {str(e)}",
            })

    # ── create_gallery_folder ───────────────────────────────────────────────

    @mcp.tool(
        name="create_gallery_folder",
        description=(
            "Create a new folder in the gallery for organizing images."
            "\n\n"
            "Parameters:\n"
            "- folder_name: name of the new folder\n"
            "- current_path: parent path (default '' for root)"
        ),
    )
    async def create_gallery_folder_tool(folder_name: str, current_path: str = "") -> str:
        """Create a new folder in the gallery."""
        body = {
            "current_path": current_path,
            "folder_name": folder_name,
        }
        try:
            result = await _api_post("/api/gallery/mkdir", body)
            return json.dumps({
                "status": "ok",
                "message": f"Folder '{folder_name}' created in '{current_path or 'root'}'.",
                "detail": result,
            })
        except Exception as e:
            return json.dumps({
                "status": "error",
                "error": f"Failed to create folder: {str(e)}",
            })