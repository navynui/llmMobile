"""Tool execution: web search, file read/write/edit with sandbox safety."""

import json
import os
import traceback
# ── Sandbox configuration ──────────────────────────────────────────────────
ALLOWED_BASE = "/mnt/dashboard"


def _resolve_sandbox_path(user_path: str) -> str:
    """Resolve a user-provided path against the sandbox root and validate it.

    Raises PermissionError if the path escapes the sandbox.
    """
    # Strip leading separators to prevent absolute-path shenanigans
    safe = user_path.lstrip("/")
    full = os.path.realpath(os.path.join(ALLOWED_BASE, safe))
    if not full.startswith(os.path.realpath(ALLOWED_BASE)):
        raise PermissionError(
            f"Path traversal blocked: '{user_path}' resolves outside sandbox"
        )
    return full


# ── Web Search ─────────────────────────────────────────────────────────────

async def _web_search(query: str, num_results: int = 5) -> str:
    """Search the web via DuckDuckGo with browser impersonation."""
    try:
        from curl_cffi import requests as curl_req
        import re as _re
        from urllib.parse import quote, unquote, urlparse, parse_qs

        resp = curl_req.get(
            f"https://html.duckduckgo.com/html/?q={quote(query)}",
            impersonate="chrome120",
            timeout=15,
        )
        html = resp.text

        results: list[dict[str, str]] = []
        for block in _re.finditer(
            (
                r'<div[^>]*class="result[^"]*results_links'
                r'[^"]*web-result[^"]*"[^>]*>.*?'
                r'<div[^>]*class="[^"]*result__body[^"]*"[^>]*>'
                r'(.*?)'
                r'</div>\s*</div>\s*</div>'
            ),
            html,
            _re.DOTALL,
        ):
            if len(results) >= min(num_results, 10):
                break

            block_html = block.group(1)

            # Title
            tm = _re.search(
                r'class="result__a"[^>]*>(.*?)</a>', block_html, _re.DOTALL
            )
            if not tm:
                continue
            title = _re.sub(r"<[^>]+>", "", tm.group(1)).strip()

            # URL
            um = _re.search(
                r'class="result__a"[^>]*href="(//[^"]+)"', block_html
            )
            if not um:
                continue
            parsed = urlparse(f"https:{um.group(1)}")
            qs = parse_qs(parsed.query)
            encoded = qs.get("uddg", [""])[0]
            real_url = unquote(encoded) if encoded else ""

            # Snippet
            sm = _re.search(
                r'class="result__snippet[^"]*"[^>]*>(.*?)</a>',
                block_html,
                _re.DOTALL,
            )
            snippet = ""
            if sm:
                snippet = _re.sub(r"<[^>]+>", "", sm.group(1)).strip()

            if title and real_url:
                results.append({
                    "title": title,
                    "url": real_url,
                    "snippet": snippet,
                })

        return json.dumps({"status": "ok", "query": query, "results": results})

    except ImportError:
        return json.dumps({
            "status": "error",
            "error": "Web search unavailable (curl_cffi not installed).",
            "query": query,
        })
    except Exception as exc:
        return json.dumps({
            "status": "error",
            "error": f"Search failed: {exc}",
            "query": query,
        })


# ── File operations ────────────────────────────────────────────────────────

def _write_file(path: str, content: str, mode: str = "overwrite") -> str:
    """Write content to a file inside the sandbox."""
    try:
        full = _resolve_sandbox_path(path)
        os.makedirs(os.path.dirname(full), exist_ok=True)
        file_mode = "w" if mode == "overwrite" else "a"
        with open(full, file_mode, encoding="utf-8") as f:
            f.write(content)
        return json.dumps({
            "status": "ok",
            "path": path,
            "mode": mode,
            "size": len(content),
        })
    except PermissionError as e:
        return json.dumps({"status": "error", "error": str(e), "path": path})
    except Exception as exc:
        return json.dumps({"status": "error", "error": str(exc), "path": path})


def _read_file(path: str) -> str:
    """Read the full contents of a file inside the sandbox."""
    try:
        full = _resolve_sandbox_path(path)
        if not os.path.isfile(full):
            return json.dumps({"status": "error", "error": "File not found", "path": path})
        with open(full, "r", encoding="utf-8") as f:
            content = f.read()
        return json.dumps({
            "status": "ok",
            "path": path,
            "content": content,
            "size": len(content),
        })
    except PermissionError as e:
        return json.dumps({"status": "error", "error": str(e), "path": path})
    except Exception as exc:
        return json.dumps({"status": "error", "error": str(exc), "path": path})


def _edit_file(path: str, old_string: str, new_string: str) -> str:
    """Replace the first occurrence of old_string with new_string in a file."""
    try:
        full = _resolve_sandbox_path(path)
        if not os.path.isfile(full):
            return json.dumps({"status": "error", "error": "File not found", "path": path})
        with open(full, "r", encoding="utf-8") as f:
            content = f.read()
        if old_string not in content:
            return json.dumps({
                "status": "error",
                "error": f"Could not find the specified text in '{path}'",
                "path": path,
            })
        new_content = content.replace(old_string, new_string, 1)
        with open(full, "w", encoding="utf-8") as f:
            f.write(new_content)
        return json.dumps({
            "status": "ok",
            "path": path,
            "replaced": old_string != new_string,
        })
    except PermissionError as e:
        return json.dumps({"status": "error", "error": str(e), "path": path})
    except Exception as exc:
        return json.dumps({"status": "error", "error": str(exc), "path": path})


# ── Generate image (review mode — does NOT queue) ─────────────────────────

# ── Public dispatch ────────────────────────────────────────────────────────

TOOL_DISPATCH = {
    "web_search": _web_search,
    "write_file": _write_file,
    "read_file": _read_file,
    "edit_file": _edit_file,
}


async def execute_tool_call(tool_call: dict) -> str:
    """Execute a single tool call from the model response.

    *tool_call* is expected to have the OpenAI structure:
        {"id": "...", "function": {"name": "...", "arguments": "..."}}
    Returns the result as a JSON string (for injection as tool content).
    """
    func_name = tool_call.get("function", {}).get("name", "")
    raw_args = tool_call.get("function", {}).get("arguments", "{}")

    try:
        args = json.loads(raw_args) if isinstance(raw_args, str) else raw_args
    except json.JSONDecodeError:
        return json.dumps({"status": "error", "error": "Invalid JSON in tool arguments"})

    handler = TOOL_DISPATCH.get(func_name)
    if handler is None:
        return json.dumps({"status": "error", "error": f"Unknown tool '{func_name}'"})

    try:
        if func_name == "web_search":
            return await handler(args.get("query", ""), args.get("num_results", 5))
        elif func_name == "write_file":
            return handler(args.get("path", ""), args.get("content", ""), args.get("mode", "overwrite"))
        elif func_name == "read_file":
            return handler(args.get("path", ""))
        elif func_name == "edit_file":
            return handler(args.get("path", ""), args.get("old_string", ""), args.get("new_string", ""))
        else:
            return json.dumps({"status": "error", "error": f"Unhandled tool '{func_name}'"})
    except Exception:
        tb = traceback.format_exc()
        return json.dumps({"status": "error", "error": f"Tool execution failed", "traceback": tb})
