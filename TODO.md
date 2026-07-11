# TODO — Tool-Enabled Chat (Function Calling for llama.cpp)

Add **tool/function-calling** support to the Chat tab so the model can search the web, read/write files in a sandboxed workspace, and edit files — all orchestrated server-side.

---

## 🗺️ Architecture Overview

```
Frontend sends {messages, tools, stream: true}
  │
  ▼
Backend (services/tools/chat.py) intercepts, forwards to llama-server
  │
  ▼  model responds with tool_calls ──► Backend executes tool
  │                                       ├─ web_search(query)
  │                                       ├─ write_file(path, content)
  │                                       ├─ read_file(path)
  │                                       └─ edit_file(path, old, new)
  │                                     results injected as new messages
  │                                     loop until finish_reason == "stop"
  ▼
Stream final assistant response to frontend
```

### Sandbox: `/mnt/dashboard/`

- **NFS mount** from `192.168.31.243:/home/nui/dashboard` (remote dashboard webserver)
- Already **rw** mounted on host at `/mnt/dashboard`, symlinked at `/home/nui/dashboard`
- **Git-tracked** with `.gitignore` that ignores `*.md`, `*.html`, `*.csv` (future files of these types remain untracked)
- **Browser-accessible** — files the model generates (reports, visualizations, data exports) are immediately viewable
- **✅ Docker mount** — `- /home/nui/dashboard:/mnt/dashboard:rw` added to `llm-mobile`

---

## 📦 Phase 1 — Infrastructure & Dependencies

### 1.1 Mount sandbox into container

**File:** `docker-compose.yml` (at `/home/nui/llmaCPP/docker-compose.yml`)

Add to `llm-mobile` volumes:
```yaml
- /home/nui/dashboard:/mnt/dashboard:rw
```

Also add to `llama-server` and `llama-server-mini` if we want the model's built-in `read_file` tool to access the sandbox (optional, Phase 1 can skip this).

### 1.2 Enable llama-server built-in tools

Add to both `llama-server` and `llama-server-mini` command flags:
```yaml
command: >
  ...
  --tools all
```

This enables the server-native tools (`read_file`, `file_glob_search`, `grep_search`). Our custom tools (`web_search`, `write_file`, `edit_file`) run on the backend, not inside llama-server.

### 1.3 Add Python dependency

**File:** `requirements.txt`
```
duckduckgo_search>=7.5.0
```

Free, no API key needed. Used for `web_search` tool.

### 1.4 Docker rebuild

```bash
cd /home/nui/llmaCPP
docker compose build llm-mobile
docker compose up -d --no-deps llm-mobile
```

If `--tools` flag was added to llama-server, also rebuild those:
```bash
docker compose up -d --no-deps llama-server llama-server-mini
```

**Files to touch:**
- [x] `docker-compose.yml` — sandbox mount + `--tools all`
- [x] `requirements.txt` — add `curl_cffi`

---

## ⚙️ Phase 2 — Backend Tool Definitions (`services/tools/`)

New sub-package following the Phase J pattern:

### 2.1 Tool registry — `services/tools/registry.py`

Define four tools as OpenAI function-calling JSON schemas:

| Tool | Description | Parameters |
|---|---|---|
| `web_search` | Search the internet for current information | `query` (str required), `num_results` (int, default 5) |
| `write_file` | Write content to a file in the sandbox | `path` (str required), `content` (str required), `mode` ("overwrite" \| "append") |
| `read_file` | Read contents of an existing file | `path` (str required) |
| `edit_file` | Edit a file by replacing text (first occurrence) | `path` (str required), `old_string` (str required), `new_string` (str required) |

Export `TOOL_DEFINITIONS` list for injection into chat requests.

### 2.2 Tool executor — `services/tools/executor.py`

**`web_search(query, num_results)`**
- Uses `curl_cffi` with `impersonate="chrome120"` — no API key
- Returns JSON with `title`, `url`, `snippet` for each result
- Timeout: 15s

**`write_file(path, content, mode)`**
- Resolves path against sandbox root: `/mnt/dashboard/`
- Strict path sanitization — `os.path.realpath()` boundary check
- Creates parent directories if needed
- Mode: `"overwrite"` (truncate) or `"append"` (append to end)
- Returns `{success, path, size}`

**`read_file(path)`**
- Same sanitization as write
- Returns `{success, content, size}` or error

**`edit_file(path, old_string, new_string)`**
- Read → `str.replace(old, new, 1)` → write back
- Returns `{success, path, replaced: bool}`

**Path safety rules (critical) — ✅ implemented:**
```python
ALLOWED_BASE = "/mnt/dashboard"
# Reject if realpath doesn't start with ALLOWED_BASE
# Strip leading separators to prevent absolute-path shenanigans
```

### 2.3 Chat orchestrator — `services/tools/chat.py`

The core loop:

```python
async def chat_with_tools(request, server_url):
    data = await request.json()
    tools = data.pop("tools", None)
    
    if not tools:
        return await passthrough_chat(data, server_url)  # fallback to normal
    
    messages = data["messages"]
    
    for iteration in range(MAX_TOOL_ITERATIONS):  # 10 max
        response = await llama_chat_completion(messages, tools, server_url)
        choice = response["choices"][0]
        
        if choice["finish_reason"] != "tool_calls":
            return stream_final_response(choice)  # done
        
        # Process each tool call
        for tc in choice["message"]["tool_calls"]:
            yield SSE_event("tool_call", tc)        # notify frontend
            result = await execute_tool_call(tc)    # run the tool
            messages.append(tool_result_message(tc, result))
    
    yield error("Max tool call iterations reached")
```

**Key design choices — ✅ all implemented:**
- Tool rounds use **non-streaming** requests (we need synchronous execution)
- Only the **final** assistant response is streamed (preserves existing frontend SSE parsing)
- Tool calls emitted as SSE events: `tool_call`, `tool_result_done`, `tool_history`, `timings`
- Tool results truncated at **4096 characters** to prevent context overflow
- Tool history persisted in `ctx.messages` for follow-up context

### 2.4 Re-export shim — `services/tools/__init__.py`

```python
from .registry import TOOL_DEFINITIONS
from .executor import execute_tool_call
from .chat import chat_with_tools
```

### 2.5 Wire into FastAPI — `app/main.py`

Add new route alongside existing chat proxy:
```python
from services.tools import chat_with_tools

@app.post("/api/chat/completions")
async def route_chat(request: Request):
    body = await request.body()
    data = json.loads(body) if body else {}
    if "tools" in data:
        return await chat_with_tools(request, "http://llm-server:8080")
    return await proxy_chat(request)  # existing passthrough
```

Same for the mini endpoint:
```python
@app.post("/api/chat-mini/completions")
async def route_chat_mini(request: Request):
    body = await request.body()
    data = json.loads(body) if body else {}
    if "tools" in data:
        return await chat_with_tools(request, "http://llm-server-mini:8080")
    return await proxy_chat_mini(request)
```

**Files to create:**
- [x] `services/tools/__init__.py`
- [x] `services/tools/registry.py`
- [x] `services/tools/executor.py`
- [x] `services/tools/chat.py`

**Files to modify:**
- [x] `app/main.py` — route dispatch for tool requests
- [x] `requirements.txt` — add curl_cffi

---

## 🌐 Phase 3 — Frontend Integration

### 3.1 Minimal (works invisibly)

The frontend already sends `{messages, stream: "true"}`. If the backend detects `tools` in the request body, it handles the loop. **No frontend changes needed** for a working MVP — just send the `tools` array.

To test: hardcode `tools` in `sendMessage()` in `chat-tab/_logic.js`:
```javascript
body: JSON.stringify({
  messages: apiMessages,
  stream: true,
  tools: TOOL_DEFINITIONS  // imported from a static definition
})
```

### 3.2 Tool usage indicators — `chat-tab/_templates.js`

Add visual feedback for tool calls in the assistant message bubble:

```
🤖 Let me search for that...
🔍 Searching the web for "latest AI news 2026"... [done]
📝 Writing result to research.md... [done]
🧠 Based on my research, here's what I found:
    ...
```

Tool call events from SSE are parsed and rendered as lightweight inline blocks.

### 3.3 Tool toggles — `chat-tab/_templates.js` + `chat-tab/_logic.js`

Add a toolbar row in the composer area:
```
[🔍 Web Search ✓] [📝 Write Files ✓] [📖 Read Files ✓] [✏️ Edit Files ✓]
```

Each pill toggles whether that tool definition is included in the request. Disabled tools are stripped from the `tools` array.

### 3.4 Stream parser update — `chat-tab/_logic.js`

The `sendMessage()` SSE parser needs to detect custom events:
```javascript
// In the stream parsing loop:
if (parsed.type === "tool_call") {
  // Update assistant message with tool call indicator
  // Don't stop the stream — the tool is being executed on the backend
  continue;
}
```

**Files to modify:**
- [x] `chat-tab/_logic.js` — send tools param, parse tool_call/tool_history/timings events, tool context persistence, markdown links, URL clickability
- [x] `chat-tab/_templates.js` — tool usage rendering, Tools ON/OFF toggle pill
- [x] `chat-tab/_styles.js` — tool bubble styling, link styling

---

## 🔒 Phase 4 — Safety & Guard Rails

### 4.1 Path traversal prevention — ✅ implemented

```python
ALLOWED_BASE = "/mnt/dashboard"
def _resolve_sandbox_path(user_path):
    safe = user_path.lstrip("/")
    full = os.path.realpath(os.path.join(ALLOWED_BASE, safe))
    if not full.startswith(os.path.realpath(ALLOWED_BASE)):
        raise PermissionError("Path traversal blocked")
    return full
```

### 4.2 Tool iteration limit — ✅ implemented

`MAX_TOOL_ITERATIONS = 10` in `chat.py`.

### 4.3 Token / context size management — ✅ implemented

- Tool results truncated at `TRUNCATE_TOOL_RESULT_CHARS = 4096`
- Timings metadata streamed to frontend via `type: "timings"` SSE event

### 4.4 Web search rate limiting — ❌ not yet

### 4.5 Model compatibility — ❌ not yet

### 4.6 Gitignore awareness — ✅ no action needed

---

## 🧪 Phase 5 — Testing

### 5.1 Unit tests — `services/tools/`

- [ ] `test_registry.py` — Tool schemas are valid JSON Schema
- [ ] `test_executor.py` — Web search returns results (mock DDGS)
- [ ] `test_executor.py` — Write file creates content correctly
- [ ] `test_executor.py` — Edit file replaces correctly
- [ ] `test_executor.py` — Path traversal attacks are blocked (`../../../etc/passwd`)
- [ ] `test_executor.py` — Path outside sandbox is blocked
- [ ] `test_executor.py` — Empty content, very large content edge cases

### 5.2 Integration test — `services/tools/`

- [ ] `test_chat.py` — Dispatch tools vs no-tools
- [ ] `test_chat.py` — Tool call → execute → re-query loop (with mocked server)

### 5.3 Frontend test

- [ ] Verify SSE stream with tool_call events renders correctly in chat UI
- [ ] Verify tool toggle pills enable/disable correctly

---

## 🚀 Phase 6 — Polish & Future Enhancements

### 6.1 File browser in chat UI

Let the user browse `/mnt/dashboard/` from within the chat composer:
- Dropdown or file tree next to the input box
- Select a file → its path is inserted for the model to read/edit

### 6.2 More tools

| Tool | Use case |
|---|---|
| `list_files(path)` | List directory contents in sandbox |
| `delete_file(path)` | Remove a file from sandbox |
| `run_code(code)` | Execute Python/JS in a sandboxed runner (high risk — careful!) |
| `fetch_url(url)` | Fetch a specific URL (complements web_search) |

### 6.3 Streaming tool results

Instead of non-streaming tool rounds, stream partial tool results as they execute:
```
🤖 Let me check...  (streaming text)
🔍 Searching...     (tool call event - status)
📄 Reading file...  (tool call event - status)
And here's what I found: ...  (continue streaming)
```

### 6.4 Per-conversation workspace

Each chat conversation gets a subdirectory:
```
/mnt/dashboard/chat_<uuid>/
```
So different conversations don't step on each other's files.

---

## 📋 Full File Change Summary

| File | Action | Phase |
|---|---|---|
| `docker-compose.yml` | Add `- /home/nui/dashboard:/mnt/dashboard:rw` | 1 | ✅
| `docker-compose.yml` | Add `--tools all` to llama-server & llama-server-mini | 1 | ✅
| `requirements.txt` | Add `curl_cffi>=0.15.0` | 1 | ✅
| `services/tools/__init__.py` | **Create** — re-export shim | 2 | ✅
| `services/tools/registry.py` | **Create** — tool definitions | 2 | ✅
| `services/tools/executor.py` | **Create** — tool implementations + path safety | 2 | ✅
| `services/tools/chat.py` | **Create** — tool orchestration loop + tool_history + timings | 2 | ✅
| `app/main.py` | Route dispatch: tools → chat_with_tools, else → proxy_chat | 2 | ✅
| `TODO.md` | Implementation plan | — | ✅
| `chat-tab/_logic.js` | Add `tools` to request body, parse tool_call/tool_history/timings, markdown links, URL clickability | 3 | ✅
| `chat-tab/_templates.js` | Tool usage indicators, Tools ON/OFF toggle pill | 3 | ✅
| `chat-tab/_styles.js` | Tool bubble styling, link styling | 3 | ✅
| `tests/test_tools_executor.py` | **Create** — unit tests | 5 | ❌
| `tests/test_tools_chat.py` | **Create** — integration tests | 5 | ❌
