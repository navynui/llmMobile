"""
Tool registrations — each module registers its tools with the FastMCP server.
"""

from mcp_server.tools import model_tools
from mcp_server.tools import download_tools
from mcp_server.tools import benchmark_tools
from mcp_server.tools import generation_tools
from mcp_server.tools import gallery_tools
from mcp_server.tools import server_tools
from mcp_server.tools import config_tools


def register_all(mcp):
    """Register all tool modules with the MCP server."""
    model_tools.register_tools(mcp)
    download_tools.register_tools(mcp)
    benchmark_tools.register_tools(mcp)
    generation_tools.register_tools(mcp)
    gallery_tools.register_tools(mcp)
    server_tools.register_tools(mcp)
    config_tools.register_tools(mcp)