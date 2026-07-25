#!/usr/bin/env python3
"""
llmMobile MCP Server — Background worker that exposes guarded tools to LLM agents.

This server runs as a standalone FastMCP process on port 8001 (configurable via
MCP_SERVER_PORT env var). It wraps all dangerous FastAPI actions with:
  - Pre-flight validation (VRAM, disk, state checks)
  - Post-flight verification (did it actually work?)
  - Clear, structured error messages

Usage:
    python mcp_server/server.py              # Starts MCP SSE server on :8001
    python mcp_server/server.py --stdio      # Starts MCP stdio server (for Claude Desktop)
"""

import os
import sys
import json
import asyncio
import argparse

# Import FastMCP from the installed 'mcp' library directly
# to avoid conflicts with the local 'mcp_server' package name.
from mcp.server.fastmcp import FastMCP

from mcp_server.tools import register_all
from mcp_server.utils import MCP_SERVER_HOST, MCP_SERVER_PORT


# ── Server name used by the agent to identify this MCP server ──────────────
MCP_SERVER_NAME = "llm-mobile-manager"

# ── Create MCP server ─────────────────────────────────────────────────────
mcp = FastMCP(
    MCP_SERVER_NAME,
)


def create_sse_app():
    """Create the SSE transport ASGI app for serving with uvicorn."""
    register_all(mcp)
    return mcp.sse_app()


def main():
    """Entry point: register tools and start the MCP server."""
    parser = argparse.ArgumentParser(description="llmMobile MCP Server")
    parser.add_argument(
        "--stdio",
        action="store_true",
        help="Run in stdio mode (for Claude Desktop / agent subprocess)",
    )
    args = parser.parse_args()

    # Register all tools
    register_all(mcp)
    num_tools = len(mcp._tool_manager._tools)
    print(f"[MCP Server] Starting '{MCP_SERVER_NAME}' with {num_tools} tools registered.")

    if args.stdio:
        print("[MCP Server] Running in stdio mode.")
        mcp.run(transport="stdio")
    else:
        host = MCP_SERVER_HOST
        port = MCP_SERVER_PORT
        print(f"[MCP Server] Running SSE server on {host}:{port}")
        import uvicorn
        app = mcp.sse_app()
        uvicorn.run(app, host=host, port=port, log_level="info")


if __name__ == "__main__":
    main()