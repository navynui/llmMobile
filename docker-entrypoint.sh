#!/bin/bash
# Entrypoint script for llm-mobile container.
# Starts the FastAPI backend and the MCP server as a background worker.

set -e

echo "[Entrypoint] Starting MCP server on port ${MCP_SERVER_PORT:-8001}..."
python -m mcp_server.server &
MCP_PID=$!
echo "[Entrypoint] MCP server PID: $MCP_PID"

echo "[Entrypoint] Starting FastAPI on port 8000..."
exec uvicorn main:app --host 0.0.0.0 --port 8000