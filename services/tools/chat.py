"""Smart chat proxy that orchestrates tool/function calling with llama-server.

Flow:
  1. Frontend sends {messages, tools, stream: true}
  2. Backend forwards to llama-server with tools attached (non-streaming for tool rounds)
  3. If response contains tool_calls, execute them and re-query the model
  4. Repeat until finish_reason == "stop" (max 10 iterations)
  5. Stream the final assistant response to the frontend
  6. Emit SSE events for tool calls so the frontend can show progress
"""

import json
import traceback

import httpx
from fastapi import Request
from fastapi.responses import StreamingResponse

from .executor import execute_tool_call
from .registry import TOOL_DEFINITIONS

MAX_TOOL_ITERATIONS = 10
TRUNCATE_TOOL_RESULT_CHARS = 4096


async def _llama_chat_completion(
    messages: list,
    tools: list | None,
    server_url: str,
    *,
    model: str | None = None,
    stream: bool = False,
    **extra_params,
):
    """Make a single request to llama-server's /v1/chat/completions.

    If stream=True, returns the raw httpx response for streaming.
    If stream=False, returns the decoded JSON dict.
    """
    body = {
        "messages": messages,
        "stream": stream,
        **extra_params,
    }
    if model:
        body["model"] = model
    if tools:
        body["tools"] = tools

    async with httpx.AsyncClient(timeout=httpx.Timeout(None, connect=10.0)) as c:
        resp = await c.post(
            f"{server_url}/v1/chat/completions",
            json=body,
            headers={"Content-Type": "application/json"},
        )
        resp.raise_for_status()
        if stream:
            return resp  # return raw response for streaming
        return resp.json()


async def _stream_final_response(
    messages: list,
    server_url: str,
    *,
    model: str | None = None,
):
    """Stream the final assistant response from llama-server (no tools).

    Yields raw SSE bytes exactly as received from llama-server, so the
    frontend receives real-time token-by-token output including
    reasoning_content if the model supports it.
    """
    body = {
        "messages": messages,
        "stream": True,
    }
    if model:
        body["model"] = model

    async with httpx.AsyncClient(timeout=httpx.Timeout(None, connect=10.0)) as c:
        try:
            async with c.stream(
                "POST",
                f"{server_url}/v1/chat/completions",
                json=body,
                headers={"Content-Type": "application/json"},
            ) as resp:
                async for chunk in resp.aiter_bytes():
                    yield chunk
        except Exception as e:
            yield json.dumps({"error": {"message": str(e)}}).encode()


async def chat_with_tools(request: Request, server_url: str) -> StreamingResponse:
    """Handle a chat request that may include tool definitions."""
    body = await request.body()
    try:
        data = json.loads(body) if body else {}
    except json.JSONDecodeError:
        data = {}

    # Resolve model — same logic as proxy_chat / proxy_chat_mini
    from services.model_svc import _get_preset_id_for_model

    raw_model = data.get("model", "") or ""
    is_mini = "mini" in server_url

    if not str(raw_model).strip():
        # Ask the server what's currently loaded
        if is_mini:
            from services.chat_svc import _get_loaded_mini_model
            loaded = await _get_loaded_mini_model()
        else:
            from services.chat_svc import _get_loaded_model
            loaded = await _get_loaded_model()
        data["model"] = loaded or "default"
    else:
        resolved = await _get_preset_id_for_model(raw_model)
        data["model"] = resolved or raw_model

    # Pull tools out so we don't pass them blindly on every iteration
    tools = data.pop("tools", None)

    messages = data.get("messages", [])
    stream = data.get("stream", True)

    # ── No tools → passthrough to regular streaming ───────────────────
    if not tools:
        body = json.dumps(data).encode()
        return StreamingResponse(
            _passthrough_stream(body, server_url),
            media_type="text/event-stream",
        )

    # ── Tool loop ─────────────────────────────────────────────────────
    async def _orchestrate():
        nonlocal messages
        iteration = 0

        while iteration < MAX_TOOL_ITERATIONS:
            iteration += 1

            # Non-streaming request for tool rounds
            try:
                result = await _llama_chat_completion(
                    messages, tools, server_url,
                    model=data.get("model", "default"),
                    stream=False,
                )
            except Exception as e:
                yield _sse_error(f"llama-server request failed: {e}")
                return

            choice = result.get("choices", [{}])[0]
            finish_reason = choice.get("finish_reason", "")
            msg = choice.get("message", {})

            # ── Normal completion (no more tool calls) ────────────────
            if finish_reason != "tool_calls" or not msg.get("tool_calls"):
                if stream:
                    # 1. Emit tool history so frontend can persist it
                    tool_msgs = [
                        m for m in messages
                        if m.get("role") in ("tool",) or m.get("tool_calls")
                    ]
                    orig_len = len(data.get("messages", []))
                    tool_history_msgs = messages[orig_len:]
                    if tool_history_msgs:
                        yield _sse_tool_history(tool_history_msgs)

                    # 2. Stream the final response in real-time (token by token)
                    #    This preserves reasoning_content and gives the user
                    #    immediate feedback instead of a single delayed blob.
                    async for chunk in _stream_final_response(
                        messages,
                        server_url,
                        model=data.get("model", "default"),
                    ):
                        yield chunk
                else:
                    yield json.dumps(result).encode()
                return

            # ── Tool call(s) detected ─────────────────────────────────
            assistant_content = msg.get("content") or ""
            raw_tool_calls = msg["tool_calls"]

            # Append assistant message with tool_calls to history
            assistant_msg = {"role": "assistant", "content": assistant_content}
            assistant_msg["tool_calls"] = [
                {
                    "id": tc.get("id", f"call_{i}"),
                    "type": "function",
                    "function": {
                        "name": tc["function"]["name"],
                        "arguments": tc["function"]["arguments"],
                    },
                }
                for i, tc in enumerate(raw_tool_calls)
            ]
            messages.append(assistant_msg)

            # Execute each tool and collect results
            for tc in raw_tool_calls:
                tc_id = tc.get("id", f"call_{iteration}")
                func_name = tc.get("function", {}).get("name", "unknown")
                raw_args = tc.get("function", {}).get("arguments", "{}")

                # Notify frontend about the tool call
                yield _sse_tool_call(tc_id, func_name, raw_args)

                # Execute
                result_str = await execute_tool_call(tc)

                # Truncate very large results
                if len(result_str) > TRUNCATE_TOOL_RESULT_CHARS:
                    truncated = result_str[:TRUNCATE_TOOL_RESULT_CHARS]
                    truncated += f'\n\n[Result truncated at {TRUNCATE_TOOL_RESULT_CHARS} characters]'
                    result_str = truncated

                # Append tool result as a new message
                messages.append({
                    "role": "tool",
                    "tool_call_id": tc_id,
                    "content": result_str,
                })

            # ── End of tool result ────────────────────────────────────
            yield _sse_tool_result()

        # Exhausted max iterations
        yield _sse_error("Maximum tool call iterations reached without completion.")

    return StreamingResponse(_orchestrate(), media_type="text/event-stream")


# ── SSE helpers ────────────────────────────────────────────────────────────

def _sse_delta(content: str, finish_reason: str | None) -> bytes:
    """Standard OpenAI-style SSE delta chunk."""
    payload = {
        "choices": [{
            "delta": {"content": content} if content else {},
            "finish_reason": finish_reason,
        }]
    }
    return f"data: {json.dumps(payload)}\n\n".encode()


def _sse_reasoning_delta(reasoning: str) -> bytes:
    """SSE delta chunk with reasoning_content for models that emit it."""
    payload = {
        "choices": [{
            "delta": {
                "content": "",
                "reasoning_content": reasoning,
            },
            "finish_reason": None,
        }]
    }
    return f"data: {json.dumps(payload)}\n\n".encode()


def _sse_tool_call(tc_id: str, func_name: str, raw_args: str) -> bytes:
    """Custom SSE event notifying the frontend of a tool call."""
    payload = {
        "type": "tool_call",
        "tool_call": {
            "id": tc_id,
            "function": {"name": func_name, "arguments": raw_args},
        },
    }
    return f"data: {json.dumps(payload)}\n\n".encode()


def _sse_tool_result() -> bytes:
    """Custom SSE event signalling tool execution is complete."""
    return f"data: {json.dumps({'type': 'tool_result_done'})}\n\n".encode()


def _sse_error(msg: str) -> bytes:
    return f"data: {json.dumps({'error': {'message': msg}})}\n\n".encode()



def _sse_tool_history(tool_msgs: list) -> bytes:
    """Emit tool_call/tool_result messages so frontend can persist context."""
    return f"data: {json.dumps({'type': 'tool_history', 'messages': tool_msgs})}\n\n".encode()


def _sse_timings(timings: dict) -> bytes:
    """Emit timing metadata (tokens/s) for the assistant message."""
    return f"data: {json.dumps({'type': 'timings', 'timings': timings})}\n\n".encode()

# ── Passthrough streamer (no tools) ────────────────────────────────────────

async def _passthrough_stream(body: bytes, server_url: str):
    """Stream the raw response from llama-server when no tools are used."""
    async with httpx.AsyncClient(timeout=httpx.Timeout(None, connect=10.0)) as c:
        try:
            async with c.stream(
                "POST",
                f"{server_url}/v1/chat/completions",
                content=body,
                headers={"Content-Type": "application/json"},
            ) as r:
                async for chunk in r.aiter_bytes():
                    yield chunk
        except Exception as e:
            yield json.dumps({"error": {"message": str(e)}}).encode()
