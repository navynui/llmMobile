import json
import httpx
from fastapi import Request
from fastapi.responses import StreamingResponse
from typing import Optional

from services.model_svc import _get_preset_id_for_model

async def _get_loaded_model() -> Optional[str]:
    try:
        async with httpx.AsyncClient() as c:
            data = (await c.get("http://llm-server:8080/models", timeout=3)).json()
            for m in data.get("data", []):
                s = m.get("status")
                if s == "loaded" or (isinstance(s, dict) and s.get("value") == "loaded"):
                    return m.get("id")
    except Exception:
        pass
    return None

async def proxy_chat(request: Request):
    from services.llm_lifecycle import touch_activity
    touch_activity("llama-server")
    body = await request.body()
    try:
        data = json.loads(body) if body else {}
    except Exception:
        data = {}
    if not str(data.get("model", "")).strip():
        data["model"] = await _get_loaded_model() or "default"
    else:
        data["model"] = await _get_preset_id_for_model(data["model"])
    body = json.dumps(data).encode()

    async def _stream():
        async with httpx.AsyncClient(timeout=httpx.Timeout(None, connect=10.0)) as c:
            try:
                async with c.stream("POST", "http://llm-server:8080/v1/chat/completions",
                                    content=body, headers={"Content-Type": "application/json"}) as r:
                    async for chunk in r.aiter_bytes():
                        yield chunk
            except Exception as e:
                yield json.dumps({"error": {"message": str(e), "type": "proxy_error"}}).encode()

    return StreamingResponse(_stream(), media_type="text/event-stream")

# ── llama-server-mini ───────────────────────────────────────────────────────

async def _get_loaded_mini_model() -> Optional[str]:
    try:
        async with httpx.AsyncClient() as c:
            data = (await c.get("http://llm-server-mini:8080/models", timeout=3)).json()
            for m in data.get("data", []):
                s = m.get("status")
                if s == "loaded" or (isinstance(s, dict) and s.get("value") == "loaded"):
                    return m.get("id")
    except Exception:
        pass
    return None

async def proxy_chat_mini(request: Request):
    from services.llm_lifecycle import touch_activity
    touch_activity("llama-server-mini")
    body = await request.body()
    try:
        data = json.loads(body) if body else {}
    except Exception:
        data = {}
    if not str(data.get("model", "")).strip():
        data["model"] = await _get_loaded_mini_model() or "default"
    else:
        data["model"] = await _get_preset_id_for_model(data["model"])
    body = json.dumps(data).encode()

    async def _stream():
        async with httpx.AsyncClient(timeout=httpx.Timeout(None, connect=10.0)) as c:
            try:
                async with c.stream("POST", "http://llm-server-mini:8080/v1/chat/completions",
                                    content=body, headers={"Content-Type": "application/json"}) as r:
                    async for chunk in r.aiter_bytes():
                        yield chunk
            except Exception as e:
                yield json.dumps({"error": {"message": str(e), "type": "proxy_error"}}).encode()

    return StreamingResponse(_stream(), media_type="text/event-stream")
