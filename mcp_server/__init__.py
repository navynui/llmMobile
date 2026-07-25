"""
MCP Server for llmMobile — Safe, structured LLM agent access to server actions.

Provides guarded tool wrappers over the FastAPI backend, with pre-flight
validation (VRAM, disk, state checks) and post-flight verification.
"""

__version__ = "1.0.0"