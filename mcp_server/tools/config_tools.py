"""
MCP tools for reading/writing server INI configuration files.
"""

import json
from mcp.server.fastmcp import FastMCP

from mcp_server.utils import _api_get, _api_post


def register_tools(mcp: FastMCP):
    """Register all config management tools."""

    # ── get_ini_config ──────────────────────────────────────────────────────

    @mcp.tool(
        name="get_ini_config",
        description=(
            "Read the current contents of a server's model INI config file. "
            "This shows which models are configured and their load settings."
            "\n\n"
            "Parameters:\n"
            "- server: 'primary' (models.ini) or 'secondary' (modelg.ini)"
        ),
    )
    async def get_ini_config_tool(server: str = "primary") -> str:
        """Read the server's INI config file."""
        endpoint = "/api/models_ini" if server == "primary" else "/api/models_mini_ini"
        try:
            data = await _api_get(endpoint)
            content = data.get("content", "")
            return json.dumps({
                "status": "ok",
                "server": server,
                "config_file": "models.ini" if server == "primary" else "modelg.ini",
                "content": content,
            })
        except Exception as e:
            return json.dumps({
                "status": "error",
                "error": f"Failed to read config: {str(e)}",
                "server": server,
            })

    # ── save_ini_config ─────────────────────────────────────────────────────

    @mcp.tool(
        name="save_ini_config",
        description=(
            "Save new content to a server's model INI config file. "
            "The config defines model presets with their paths, GPU layers, "
            "and load-on-startup settings. Changes take effect after a server restart."
            "\n\n"
            "WARNING: Invalid INI syntax can prevent the server from starting. "
            "Always read the current config first, make minimal changes, and "
            "restart the server to apply."
            "\n\n"
            "Parameters:\n"
            "- server: 'primary' (models.ini) or 'secondary' (modelg.ini)\n"
            "- content: the full INI file content to write"
        ),
    )
    async def save_ini_config_tool(server: str = "primary", content: str = "") -> str:
        """Save INI config content to a server."""
        if not content.strip():
            return json.dumps({
                "status": "error",
                "error": "Content cannot be empty.",
            })

        endpoint = "/api/models_ini" if server == "primary" else "/api/models_mini_ini"
        config_file = "models.ini" if server == "primary" else "modelg.ini"

        # Basic validation: ensure each section has a model= line
        import re
        sections = re.findall(r'^\[(.+?)\]', content, re.MULTILINE)
        for section in sections:
            if not re.search(rf'^\s*model\s*=', content[content.index(f"[{section}]"):], re.MULTILINE):
                return json.dumps({
                    "status": "error",
                    "error": (
                        f"Section [{section}] is missing a 'model = /models/...' line. "
                        f"Each section must have at least a model path."
                    ),
                })

        try:
            result = await _api_post(endpoint, {"content": content})
            return json.dumps({
                "status": "ok",
                "message": (
                    f"{config_file} updated successfully. "
                    f"Restart the server with restart_server to apply changes."
                ),
                "server": server,
                "config_file": config_file,
                "sections_found": len(sections),
                "detail": result,
            })
        except Exception as e:
            return json.dumps({
                "status": "error",
                "error": f"Failed to save config: {str(e)}",
                "server": server,
            })