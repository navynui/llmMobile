"""Tools package — function-calling orchestration for the Chat tab."""

from .registry import TOOL_DEFINITIONS
from .executor import execute_tool_call
from .chat import chat_with_tools

__all__ = ["TOOL_DEFINITIONS", "execute_tool_call", "chat_with_tools"]
