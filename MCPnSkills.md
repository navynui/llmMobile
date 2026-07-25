# MCP Servers & Skills — Implementation Plan for llmMobile

> **Goal:** Identify all FastAPI backend actions, classify them by risk profile (security / OOM / crash), and recommend which should be wrapped in **MCP servers** (for safe, structured LLM invocation) and which should have **Skills** (procedural guides for correct multi-step execution).

---

## 1. Complete Action Inventory

All actions are grouped by domain. Each entry shows:

- **Endpoint(s)** — HTTP method + path
- **Risk Profile** — 🟢 Low / 🟡 Medium / 🔴 High
- **OOM Risk** — Could this exhaust GPU VRAM or trigger OOM?
- **Security Risk** — Could this delete data, consume disk, or reach the filesystem unsafely?

### 1.1 Server Control

| # | Action | Endpoint | Risk | OOM | Security | Notes |
|---|--------|----------|------|-----|----------|-------|
| 1 | Get status (all containers) | `GET /status` | 🟢 | No | No | Read-only |
| 2 | Get system stats (MQTT telemetry) | `GET /system_stats` | 🟢 | No | No | Read-only |
| 3 | Get server slots (inference activity) | `GET /api/servers/slots` | 🟢 | No | No | Read-only |
| 4 | Start primary llama-server | `POST /start` | 🟡 | Medium | Low | Launches Docker container |
| 5 | Stop primary llama-server | `POST /stop` | 🟡 | Low | Low | Stops Docker container |
| 6 | Start llama-server by name | `POST /servers/{name}/start` | 🟡 | Medium | Low | Launches Docker container by logical name |
| 7 | Stop llama-server by name | `POST /servers/{name}/stop` | 🟡 | Low | Low | Stops Docker container by logical name |
| 8 | Restart llama-server by name | `POST /servers/{name}/restart` | 🟡 | Medium | Low | Combined stop+start |

### 1.2 Model Management

| # | Action | Endpoint | Risk | OOM | Security | Notes |
|---|--------|----------|------|-----|----------|-------|
| 9 | List models (from models.ini) | `GET /models` | 🟢 | No | No | Read-only INI parse |
| 10 | List mini models (from modelg.ini) | `GET /models-mini` | 🟢 | No | No | Read-only INI parse |
| 11 | Delete a GGUF file | `DELETE /models/{filename}` | 🔴 | No | **High** | **Filesystem delete** — permanent data loss |
| 12 | Delete model from mini | `DELETE /models-mini/{filename}` | 🔴 | No | **High** | **Filesystem delete** |
| 13 | Get models.ini content | `GET /api/models_ini` | 🟢 | No | No | Read-only |
| 14 | Save models.ini content | `POST /api/models_ini` | 🟡 | No | **Medium** | Overwrites config file |
| 15 | Get modelg.ini content | `GET /api/models_mini_ini` | 🟢 | No | No | Read-only |
| 16 | Save modelg.ini content | `POST /api/models_mini_ini` | 🟡 | No | **Medium** | Overwrites config file |
| 17 | Proxy active models from llama-server | `GET /api/llm/models` | 🟢 | No | No | Read-only upstream proxy |
| 18 | Proxy mini active models | `GET /api/llm-mini/models` | 🟢 | No | No | Read-only upstream proxy |
| 19 | Load model on primary server | `POST /api/llm/models/load` | 🔴 | **High** | Medium | **VRAM exhaustion** — loads GGUF into GPU memory |
| 20 | Unload model on primary server | `POST /api/llm/models/unload` | 🟡 | **Medium** | Low | Triggers VRAM release, may fail if model is busy |
| 21 | Load model on secondary server | `POST /api/llm-mini/models/load` | 🔴 | **High** | Medium | GTX 1060 has only 6 GB VRAM |
| 22 | Unload model on secondary server | `POST /api/llm-mini/models/unload` | 🟡 | **Medium** | Low | Triggers VRAM release |
| 23 | Scan & register models (primary INI) | `POST /api/models/scan_and_register` | 🟢 | No | Low | Writes to INI file |
| 24 | Scan & register models (mini INI) | `POST /api/models-mini/scan_and_register` | 🟢 | No | Low | Writes to INI file |
| 25 | Vision capabilities (primary) | `GET /models/vision-capabilities` | 🟢 | No | No | Read-only upstream proxy |
| 26 | Vision capabilities (mini) | `GET /models-mini/vision-capabilities` | 🟢 | No | No | Read-only upstream proxy |

### 1.3 Chat / Inference

| # | Action | Endpoint | Risk | OOM | Security | Notes |
|---|--------|----------|------|-----|----------|-------|
| 27 | Chat completions (primary) | `POST /api/chat/completions` | 🟡 | **Medium** | Low | Proxied to llama-server; OOM if context grows unbounded |
| 28 | Chat completions (mini) | `POST /api/chat-mini/completions` | 🟡 | **Medium** | Low | Proxied to llama-server-mini (6 GB VRAM limit) |
| 29 | Chat with tools (primary) | `POST /api/chat/completions` (with `tools`) | 🟡 | **Medium** | **Medium** | Can execute web search + file ops in sandbox |
| 30 | Chat with tools (mini) | `POST /api/chat-mini/completions` (with `tools`) | 🟡 | **Medium** | **Medium** | Same tool capability |

### 1.4 Image Generation (ComfyUI)

| # | Action | Endpoint | Risk | OOM | Security | Notes |
|---|--------|----------|------|-----|----------|-------|
| 31 | Submit to generation queue | `POST /api/generate/queue` | 🔴 | **High** | Low | **VRAM swap** — unloads llama, runs ComfyUI, reloads llama |
| 32 | Free ComfyUI cache | `POST /api/comfy/free` | 🟡 | **Medium** | Low | Frees ComfyUI GPU memory |
| 33 | Get generation queue | `GET /api/generate/queue` | 🟢 | No | No | Read-only |
| 34 | Cancel queue item | `DELETE /api/generate/queue/{queue_id}` | 🟢 | Low | Low | Interrupts ComfyUI if running |
| 35 | Clear completed items | `DELETE /api/generate/queue` | 🟢 | No | No | Removes finished items from queue |

### 1.5 Gallery (Image File Management)

| # | Action | Endpoint | Risk | OOM | Security | Notes |
|---|--------|----------|------|-----|----------|-------|
| 36 | Browse gallery | `GET /api/gallery/browse` | 🟢 | No | No | Read-only directory listing |
| 37 | List all folders | `GET /api/gallery/all_folders` | 🟢 | No | No | Read-only |
| 38 | Create directory | `POST /api/gallery/mkdir` | 🟢 | No | Low | Filesystem mkdir |
| 39 | Move files | `POST /api/gallery/move` | 🟡 | No | **Medium** | Filesystem move (within image output dir) |
| 40 | Delete files/folders | `POST /api/gallery/delete` | 🔴 | No | **High** | **Filesystem delete** — permanent data loss |

### 1.6 Model Download (HuggingFace)

| # | Action | Endpoint | Risk | OOM | Security | Notes |
|---|--------|----------|------|-----|----------|-------|
| 41 | Search HuggingFace models | `GET /api/models/search` | 🟢 | No | No | Read-only upstream API |
| 42 | Get model details from HF | `GET /api/models/details` | 🟢 | No | No | Read-only upstream API |
| 43 | Start model download | `POST /api/models/download` | 🔴 | No | **High** | **Disk filling** — can fill 464 GB root partition |
| 44 | Stop download | `POST /api/models/downloads/{key}/stop` | 🟢 | No | Low | Pauses active download |
| 45 | Resume download | `POST /api/models/downloads/{key}/resume` | 🟢 | No | Low | Resumes paused download |
| 46 | Cancel download | `POST /api/models/downloads/{key}/cancel` | 🟢 | No | Low | Deletes partial file on disk |
| 47 | Get download status | `GET /api/models/downloads` | 🟢 | No | No | Read-only |
| 48 | Clear finished downloads | `POST /api/models/downloads/clear-finished` | 🟢 | No | No | Removes from in-memory list |

### 1.7 Benchmarks

| # | Action | Endpoint | Risk | OOM | Security | Notes |
|---|--------|----------|------|-----|----------|-------|
| 49 | Run single benchmark | `POST /api/benchmarks/run` | 🔴 | **High** | Low | 5-round prompt sequence + AI Judge = long-running + high VRAM |
| 50 | Run benchmark queue | `POST /api/benchmarks/queue/run` | 🔴 | **High** | Low | Tests multiple models sequentially (hours) |
| 51 | Run temperature sweep | `POST /api/benchmarks/temperature-sweep` | 🔴 | **High** | Low | Multiple inference passes + Judge calls |
| 52 | Get benchmark list | `GET /api/benchmarks` | 🟢 | No | No | Read-only DB query |
| 53 | Get benchmark details | `GET /api/benchmarks/details` | 🟢 | No | No | Read-only DB query |
| 54 | Get benchmark status | `GET /api/benchmarks/status` | 🟢 | No | No | Read-only progress state |
| 55 | Get benchmark logs | `GET /api/benchmarks/logs` | 🟢 | No | No | Read-only log file |
| 56 | Get benchmark outputs | `GET /api/benchmarks/outputs` | 🟢 | No | No | Read-only file listing |
| 57 | AI Judge grading | `POST /api/benchmarks/judge` | 🟡 | **Medium** | Low | Loads judge model, grades responses |

### 1.8 Logs & SSE

| # | Action | Endpoint | Risk | OOM | Security | Notes |
|---|--------|----------|------|-----|----------|-------|
| 58 | Get Docker logs | `GET /api/logs` | 🟢 | No | No | Read-only |
| 59 | SSE status stream | `GET /events/status` | 🟢 | No | No | Read-only event stream |
| 60 | SSE queue stream | `GET /events/queue` | 🟢 | No | No | Read-only event stream |

### 1.9 Push Notifications

| # | Action | Endpoint | Risk | OOM | Security | Notes |
|---|--------|----------|------|-----|----------|-------|
| 61 | Get VAPID public key | `GET /api/notifications/vapid-key` | 🟢 | No | No | Read-only |
| 62 | Subscribe to push | `POST /api/notifications/subscribe` | 🟢 | No | Low | Persists subscription |
| 63 | PWA manifest | `GET /manifest.json` | 🟢 | No | No | Static config |

---

## 2. Action Classification Matrix

### 2.1 Actions Requiring an MCP Server

> **MCP (Model Context Protocol)** servers wrap dangerous or complex endpoints with structured validation, resource checks, rate-limiting, and safe defaults so an LLM can invoke them without crashing the system.

#### 🔴 MUST HAVE MCP — Security-Critical (Filesystem Data Loss)

| # | Action | Why |
|---|--------|-----|
| 11 | `DELETE /models/{filename}` | **Permanent GGUF deletion** — GB-sized files, no trash, no undo. MCP must confirm filename, check disk, and require explicit user consent. |
| 12 | `DELETE /models-mini/{filename}` | Same as above — deletes from shared `/models/` directory. |
| 40 | `POST /api/gallery/delete` | **Gallery image deletion** — MCP must list what will be deleted and require confirmation. |
| 43 | `POST /api/models/download` | **Disk-filling danger** — models can be 2–40+ GB. MCP must check available disk space, validate filename against known model repos, and warn of space impact. |

#### 🔴 MUST HAVE MCP — OOM/VRAM-Critical (GPU Crash Risk)

| # | Action | Why |
|---|--------|-----|
| 19 | `POST /api/llm/models/load` | **VRAM exhaustion** — loads arbitrary GGUF into Tesla P100 (16 GB). MCP must: (1) check model size vs free VRAM, (2) ensure no benchmark/generation is running, (3) unload current model first, (4) set timeout for load. |
| 20 | `POST /api/llm/models/unload` | **Half-unload risk** — MCP should verify unload succeeded via `/models` polling; retry or emergency-free if stuck. |
| 21 | `POST /api/llm-mini/models/load` | **Critical VRAM** — GTX 1060 only has 6 GB. MCP must reject models >5 GB (leaving room for KV cache). |
| 22 | `POST /api/llm-mini/models/unload` | Same unload-verification concern as primary. |
| 31 | `POST /api/generate/queue` | **VRAM swap chain** — unloads llama, loads ComfyUI, generates, unloads ComfyUI, reloads llama. MCP must: (1) confirm llama is idle, (2) handle cooldown, (3) detect failed reload and auto-restore. |
| 49 | `POST /api/benchmarks/run` | **Long-running + VRAM-intensive** — 5 rounds + Judge. MCP must: (1) verify enough VRAM for model + KV cache, (2) check no other benchmark is running, (3) set expected duration, (4) monitor progress and abort on stall. |
| 50 | `POST /api/benchmarks/queue/run` | **Hours-long queue** — loads/unloads multiple models. MCP must: (1) validate all models exist, (2) estimate total time, (3) enforce 10s cooldown between models, (4) abort on first low-speed trigger. |
| 51 | `POST /api/benchmarks/temperature-sweep` | **Multiple inference passes + Judge** — same concerns as benchmark queue. |

#### 🟡 SHOULD HAVE MCP — Convenience & Guardrails

| # | Action | Why |
|---|--------|-----|
| 4 | `POST /start` (primary server) | Should check if already running, check Docker health after start. |
| 6–8 | `POST /servers/{name}/start/stop/restart` | Should validate server name enum, check Docker connectivity, verify state after operation. |
| 14 | `POST /api/models_ini` | Config overwrite — MCP should validate INI syntax, show diff, require confirmation. |
| 16 | `POST /api/models_mini_ini` | Same as above for secondary server. |
| 29–30 | Chat with tools | Sandbox escaped-path detection already exists, but MCP should also enforce tool-call limits and timeout. |
| 57 | `POST /api/benchmarks/judge` | Judge model must already be loaded; MCP should check this and load if needed. |

### 2.2 Actions NOT Needing an MCP Server

All **read-only GET endpoints** with no side effects are safe for direct use:

- Status/stats/slots/SSE (1, 2, 3, 59, 60)
- Model listings (9, 10, 17, 18)
- Config reads (13, 15)
- Vision checks (25, 26)
- Queue reads (33)
- Gallery browse/list (36, 37)
- Search and details (41, 42)
- Download status (47)
- Benchmark reads (52–56)
- Logs (58)
- Push keys (61)
- Manifest (63)

Also safe without MCP:
- Simple idempotent operations with no data-loss risk (38 mkdir, 39 move)
- Download controls (44 stop, 45 resume, 46 cancel, 48 clear finished)
- Free ComfyUI cache (32)
- Queue management (34 cancel, 35 clear completed)
- Push subscribe (62)
- Scan & register (23, 24)

---

## 3. Skills Required

> **Skills** are structured procedural documents that tell an LLM agent **how** to perform multi-step or high-stakes actions correctly, with proper sequencing, error handling, and state verification.

### 3.1 🔴 Must-Have Skills

| Skill Name | Covers Actions | Purpose |
|---|---|---|
| **model-management** | 9–26 (all model ops) | INI edit → load sequence → VRAM verification → unload sequence. Prevents stale config, ensures model actually loaded before use. |
| **server-lifecycle** | 1–8 (all server ops) | Start → verify health via Docker + status endpoint → stop → confirm stopped. Prevents orphan containers. |
| **image-generation** | 31–35 (queue submit + manage) | Prompt → submit → monitor queue SSE → wait for completion → verify output. Handles VRAM swap transparently. |
| **benchmark-execution** | 49–57 (run + monitor + judge) | Model load check → start benchmark → poll status SSE → wait for completion → read results → trigger judge if needed. Handles cooldowns. |
| **model-download** | 41–48 (HF search → download → register) | Search → get size → check disk space → download → wait for completion → scan & register → verify in INI. |
| **gallery-management** | 36–40 (browse/move/delete) | Browse with page awareness → confirm deletion targets → execute → verify. Prevents accidental mass deletion. |
| **disk-management** | 11, 12, 43 (delete/download) | Check disk space before download → warn on low space → verify filename → confirm delete. Prevents full-disk crash. |

### 3.2 🟡 Nice-to-Have Skills

| Skill Name | Covers Actions | Purpose |
|---|---|---|
| **chat-management** | 27–30 (chat + tools) | Set appropriate context limits, monitor token usage, handle tool errors gracefully. |
| **push-notifications** | 61–63 (subscribe + manage) | Subscribe → verify subscription → test send. |
| **config-management** | 13–16 (INI read/write) | Read current → show diff → write → verify. |

### 3.3 Actions That Don't Need Skills

All read-only queries that return data without side effects:
- Any `GET` endpoint that doesn't write files, change state, or consume resources
- SSE event streams
- VAPID key retrieval
- PWA manifest

These are self-documenting — the OpenAPI schema is sufficient.

---

## 4. Implementation Plan

### Phase 1 — MCP Server for Model Loading (Highest Priority)

This is the **single most dangerous operation** because loading a model that's too large for the GPU causes an instant llama-server crash, followed by Docker restart loops and cascading failures.

**MCP Tool: `load_model`**

```
Input:
  - model_filename (string, must end with .gguf)
  - server (enum: "primary" | "secondary")

Validation:
  1. File exists in /models/
  2. File size < available VRAM:
     - Primary: max(14 GB) out of 16 GB (leave 2 GB for KV cache)
     - Secondary: max(5 GB) out of 6 GB (leave 1 GB for KV cache)
  3. No benchmark is currently running (GET /api/benchmarks/status)
  4. No generation queue is running (GET /api/generate/queue)
  5. Server container is running (status from /status)

Execution:
  1. If another model is loaded, unload it first (POST /api/llm/models/unload)
  2. Wait for unload confirmation (poll /api/llm/models until no loaded model)
  3. Load the new model (POST /api/llm/models/load)
  4. Wait for load confirmation (poll /api/llm/models until loaded + idle)
  5. Capture VRAM usage (the existing vram_svc mechanism)
  6. Return {loaded: true, model: filename, vram_gb: number}

Error Handling:
  - If load fails, log the error, check Docker logs, recommend a smaller quant
  - If VRAM capture times out, still report success but flag VRAM as unknown
  - If server crashes during load, restart the container
```

### Phase 2 — MCP Server for Benchmark Execution

**MCP Tool: `run_benchmark`**

```
Input:
  - model_id (string, optional — defaults to currently loaded)
  - server (enum: "primary" | "secondary", default "primary")
  - judge_model_id (string, optional)
  - run_as_queue (boolean, default false — runs all models in queue)

Validation:
  1. No other benchmark is running (check /api/benchmarks/status)
  2. Model is loaded (if single model run)
  3. Model is not too small (skip if < 1B params)

Execution:
  1. POST /api/benchmarks/run (or queue variant)
  2. Subscribe to SSE /events/status to monitor progress
  3. Poll /api/benchmarks/status every 5s
  4. On timeout (>30 min per model), abort with partial results
  5. On completion: read /api/benchmarks/details for model_id
  6. Optionally trigger Judge
```

### Phase 3 — MCP Server for Model Download & Disk Management

**MCP Tool: `download_model`**

```
Input:
  - repo_id (string, e.g. "QuantFactory/Meta-Llama-3.1-8B-Instruct-GGUF")
  - filename (string, e.g. "Meta-Llama-3.1-8B-Instruct.Q4_K_M.gguf")
  - target_server (enum: "both" | "primary" | "secondary", default "primary")

Validation:
  1. Not already downloaded (check /models/ for file)
  2. Check HuggingFace API for file size first
  3. Verify sufficient disk space (df / — 464 GB total)
  4. Warn if remaining space < 2× file size (safety margin)
  5. Check if file is small enough for secondary GPU (< 5 GB)

Execution:
  1. POST /api/models/download
  2. Poll /api/models/downloads every 2s for progress
  3. On completion: POST /api/models/scan_and_register
  4. If target includes secondary: POST /api/models-mini/scan_and_register
```

### Phase 4 — Skills Writing

Write the following Skills as structured `.md` files in `.pi/agent/skills/`:

| Skill File | Purpose |
|---|---|
| `llmmodel-manage.md` | Full model lifecycle: list → inspect → load → verify → use → unload |
| `llmbenchmark.md` | Benchmark lifecycle: select model → single run vs queue → monitor → review results → judge |
| `llmdownload.md` | Download lifecycle: search → inspect size → check space → queue → monitor → register → verify |
| `llmgallery.md` | Gallery operations: browse → organize → delete safely |
| `llmserver.md` | Server lifecycle: check status → start → verify → stop/restart |

Each Skill should follow the same template:

```markdown
# SKILL: llm-<name>

## Purpose
Short description of what this skill does and when to use it.

## Prerequisites
- Required services, models, or state
- Minimum disk space / VRAM

## Procedure
1. Step-by-step instructions
2. Each step references specific API endpoints
3. Include expected outputs and how to verify

## Safety Checks
- What to verify before each destructive action
- How to abort mid-way

## Edge Cases
- Model too large
- Disk full
- Server not running
- Benchmark already in progress

## Recovery
- How to restore from a failed state
- Logs to check
- Emergency commands
```

### Phase 5 — Integration & Testing

1. **Wire MCP tools into an MCP server process** alongside the FastAPI backend (separate process or mount as sub-app)
2. **Test each MCP tool** with deliberately bad inputs to confirm guardrails work
3. **Test Skills** by feeding them to the LLM and verifying it produces correct curl/httpie commands
4. **Validate Docker build** still compiles after any changes

---

## 5. Summary Table

| Priority | Action Category | MCP Server? | Skill? | Why |
|----------|----------------|-------------|--------|-----|
| P0 | **Model Load/Unload** (primary & secondary) | ✅ MUST | ✅ Must | VRAM exhaustion = server crash = cascading failures |
| P0 | **Model Download** (HF → disk) | ✅ MUST | ✅ Must | Disk filling = container crash, no recovery without manual cleanup |
| P0 | **Benchmark Run/Queue** | ✅ MUST | ✅ Must | Hours-long execution, VRAM swap, multi-model queue |
| P0 | **File/Model Delete** | ✅ MUST | ✅ Must | Permanent data loss, no undo |
| P1 | **Image Generation Queue** | ✅ MUST | ✅ Must | VRAM swap between llama and ComfyUI, multi-step process |
| P1 | **Gallery Delete** | ✅ MUST | ✅ Must | Permanent image loss |
| P1 | **Server Lifecycle** (start/stop/restart) | 🟡 Should | 🟡 Nice-to | Validates server health after state change |
| P1 | **Temperature Sweep** | 🟡 Should | (covered by benchmark skill) | Long-running, multi-pass |
| P2 | **Config Save** (INI files) | 🟡 Should | (covered by model skill) | Can break server config if malformed |
| P2 | **Chat with Tools** | No | 🟡 Nice-to | Sandbox already prevents escape; skill adds tool-use best practices |
| P3 | **Read-only GETs** | No | No | Self-documenting via OpenAPI |

---

## 6. Key Architectural Decision

**MCP servers should live in a new `mcp/` directory** at `/home/nui/dev/llmMobile/mcp/`, each as a standalone Python module that:

1. Imports `services/` utilities for state checks (VRAM, disk, lock status)
2. Exposes tools via the **FastMCP** library or a lightweight MCP-compatible transport
3. Registers with the LLM agent's MCP configuration

**Skills should live in** `/home/nui/.pi/agent/skills/` following the existing pattern.

The MCP servers are **not** replacements for the FastAPI endpoints — they are **wrappers** that:
- Call the same FastAPI endpoints via HTTP
- Add pre-flight validation (resource checks, state checks)
- Add post-flight verification (did it actually work?)
- Provide structured error messages the LLM can understand and act on