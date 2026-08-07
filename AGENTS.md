# 🤖 AGENTS.md — AI Agent Guidelines for llmMobile

> This document outlines coding standards, structural rules, and critical invariants for AI coding assistants working in the `llmMobile` repository.
>
> **Status:** All planned development phases (A–S) are complete. The repository is fully modular, test-covered, and supports dual independent inference servers on separate GPUs with multi-run statistical aggregation and automated model categorization.

---

## 🔍 What This Repository Is

`llmMobile` is a mobile-first controller, streaming client, image generator interface, and automated benchmarking portal. It operates in tandem with:

1. **`llama-server`** (Inference container, Port 8080)
2. **`ComfyUI`** (Image generation container, Port 8188)
3. **`llm_bench.db`** (SQLite database for models and benchmarking runs)

It is deployed as a Docker container (`llm-mobile`) defined in the `/home/nui/llmaCPP/docker-compose.yml` file.

### Tool-Calling Architecture
The app supports **server-side tool/function-calling** when the Chat tab's 🛠️ Tools toggle is enabled:

| Tool | Description | Backend Function |
|---|---|---|
| `web_search` | DuckDuckGo search via `curl_cffi` Chrome 120 impersonation | `executor.py` → `_web_search()` |
| `write_file` | Write text to `/mnt/dashboard/` sandbox | `executor.py` → `_write_file()` |
| `read_file` | Read text from `/mnt/dashboard/` sandbox | `executor.py` → `_read_file()` |
| `edit_file` | Edit text in `/mnt/dashboard/` sandbox (old→new string) | `executor.py` → `_edit_file()` |

All tool orchestration happens in `services/tools/chat.py` → `chat_with_tools()`. Tool rounds use non-streaming requests; the **final** assistant response is always streamed token-by-token with full `reasoning_content` preservation.

### Multi-Server Architecture
The app manages **two independent `llama-server` instances**:

| Server | Container | Port | GPU | INI File |
|---|---|---|---|---|
| **Primary** | `llm-server` | 8080 | GPU 0 (Tesla P100) | `models.ini` |
| **Secondary** | `llm-server-mini` | 8081 | GPU 1 (GTX 1060) | `modelg.ini` |

Both servers share the `/models` volume but maintain separate preset configs and can load different models simultaneously.

### ComfyUI On-Demand Lifecycle
ComfyUI (the `comfyui` container, port 8188) is managed on demand via the Docker SDK (`services/comfy/lifecycle.py`):

- **Auto-start on submit**: `queue_worker` calls `ensure_comfy_ready()` before generation — it starts the container if it is off and polls `/system_stats` (up to 180s) until HTTP-ready.
- **Manual control**: `/api/comfyui/start`, `/api/comfyui/stop`, `/api/comfyui/status`. The Generator tab shows a live status chip (`off` / `starting` / `ready`) with Start/Stop buttons (4s polling).
- **Idle watchdog**: `_idle_watchdog_loop()` stops the container after `IDLE_TIMEOUT_SECONDS = 600` (10 minutes) of no generation activity, checked every 30s. It is skipped while the queue is running or has queued/running items. Activity is recorded via `touch_activity()` on submit, completion, start, and readiness.
- **VRAM-first design**: generation unloads the loaded llama.cpp model first (`swap_vram_for_generation`), frees ComfyUI VRAM afterwards (`_free_comfy_cache`), then reloads the LLM after `COMFY_IDLE_COOLDOWN_SECONDS` (default 180s).

---

## 📂 Layout & Core Architecture

### 1. Backend (Service Layer)

The backend is a **thin FastAPI router** (`app/main.py`) that delegates all business logic to dedicated service modules under `services/`. After Phase J modularization, the four large service domains are sub-packages (benchmark, comfy, download, judge); smaller services remain single files. Legacy top-level `*_svc.py` compat files were removed after all callers were migrated.

**Sub-packages (Phase J splits):**

* **`services/benchmark/`** — Benchmark sequence execution, score consolidation, database idempotency:
  - `__init__.py` — re-export shim (public surface unchanged)
  - `logging.py` — `log_benchmark_progress`, `log_benchmark_error`, `log_benchmark`
  - `state.py` — progress/running/lock getters & setters
  - `runner.py` — `run_benchmark_task`, `run_benchmark_queue_task` (retry + cooldown + execution mode filtering)
  - `reader.py` — `get_benchmarks`, `get_benchmark_details`, `get_benchmark_logs`, `get_benchmark_outputs`
  - `api.py` — `run_benchmark`, `run_benchmark_queue` (FastAPI entry points)
  - `aggregation.py` — `calculate_and_store_model_aggregates`, `classify_model`, `CATEGORY_LABELS` (Phase S)

* **`services/comfy/`** — ComfyUI workflow validation, prompt injection, image generation queue, on-demand container lifecycle:
  - `__init__.py` — re-export shim
  - `client.py` — `get_comfy_http`, `set_comfy_http`
  - `workflow.py` — `_load_workflow`, `_build_workflow`, `_build_edit_workflow`
  - `comfyio.py` — `_free_comfy_cache`, `_queue_comfy`, `_wait_comfy`, `_get_comfy_history`, `_write_sidecar`
  - `queue_state.py` — locks, running flag, snapshot, persist (load/save), SSE subscribers, `broadcast_queue`
  - `worker.py` — `_run_subtask`, `queue_worker`, VRAM swap helpers
  - `api.py` — `submit_to_queue`, `get_queue`, `cancel_queue_item`, `clear_completed`, `stream_queue`
  - `lifecycle.py` — `start_comfy`/`stop_comfy`, `ensure_comfy_ready`, `touch_activity`, 10-min idle watchdog

* **`services/download/`** — Model download queue, progress tracking, HuggingFace search:
  - `__init__.py` — re-export shim
  - `state.py` — `init_download_queue`, queue state dicts
  - `hf.py` — `search_hf_models`, `get_hf_model_details`
  - `worker.py` — `download_queue_worker`, `_download_model_task`
  - `api.py` — `download_model`, `get_downloads_status`, `stop/resume/cancel_download`, `clear_finished_downloads`, `scan_and_register_models`

* **`services/judge/`** — AI-as-a-Judge scoring, rubric evaluation:
  - `__init__.py` — re-export shim
  - `gold.py` — `get_gold_key`, `get_gold_answers`, `load_raw_json`
  - `judge.py` — `parse_judge_json` (resilient `<think>` tag stripping — G5), `query_judge_model`, `judge_benchmark`

**Single-file services (intentionally kept whole):**

* **`docker_svc.py`**: Container lifecycle (start/stop/restart for both `llama-server` and `llama-server-mini`), system stats via MQTT (Tesla P100 + GTX 1060), log retrieval, self-healing MQTT telemetry listener (reconnect + stale-data watchdog).
* **`llm_lifecycle.py`**: LLM idle-unload watchdog — unloads the loaded model from each llama-server after `LLM_IDLE_UNLOAD_SECONDS` (default 600s) of no inference activity to free VRAM per GPU; guarded against benchmarks and active ComfyUI generation. Mirrors the ComfyUI idle-watchdog pattern.
* **`model_svc.py`**: Model scanning, loading, INI management (`models.ini` + `modelg.ini`), weight deletion — supports both primary and mini servers.
* **`chat_svc.py`**: Multi-round LLM prompt orchestration, streaming responses — supports both primary (`/api/chat/completions`) and mini (`/api/chat-mini/completions`) servers.
* **`sse_svc.py`**: Server-Sent Event subscription management.
* **`gallery_svc.py`**: Image gallery CRUD, metadata extraction, file cleanup.
* **`push_svc.py`**: Push notification dispatching.
* **`vram_svc.py`**: VRAM capture, idle-trigger detection — shared leaf dependency; never split.

**Tools package (server-side tool calling):**

* **`services/tools/`** — Server-side tool/function-calling orchestration:
  - `__init__.py` — re-export shim
  - `registry.py` — `TOOL_DEFINITIONS` list (4 tools: `web_search`, `write_file`, `read_file`, `edit_file`)
  - `executor.py` — `execute_tool_call()` dispatches to DuckDuckGo web search (via `curl_cffi` Chrome impersonation) or sandboxed file operations under `/mnt/dashboard/`
  - `chat.py` — `chat_with_tools()` orchestrates up to 10 tool iterations; tool rounds use non-streaming requests for proper detection; the final response is streamed token-by-token via `_stream_final_response()` which forwards raw SSE bytes from llama-server

Shared utilities live in `utils/` (`common.py` — path resolution + `get_quantization_from_name`, `db_utils.py`, `bench_log.py`), and Pydantic schemas in `models/requests.py`.

### 2. Frontend (`src/`)

A modular Single Page Application (SPA) utilizing **Lit (Reactive Web Components)** and compiled with **Vite**. After Phase J modularization, each large component is split into a `_styles.js` / `_logic.js` / `_templates.js` sibling folder. When `_logic.js` grows large, it may be further split into focused sub-modules (e.g. `_api.js`, `_formatting.js`, `_tools.js`) with a thin barrel re-export from `_logic.js`. The main class file imports those modules and owns the `customElements.define` call.

**SPA shell:**
* **`src/llm-app.js`**: SPA shell class, `<toast-host>` mount point. Imports from `src/llm-app/`:
  - `_styles.js` — top-level app styles
  - `_router.js` — view-switching logic
  - `_templates.js` — nav bar + view render helpers
  - `_sse.js` — global SSE client wiring

**Shared primitives & utilities:**
* **`src/assets/icons.js`**: Centralized SVG icon set (zero inline `<svg>` allowed elsewhere).
* **`src/components/_primitives.js`**: Shared CSS primitives (`.card`, `.btn-primary`, `.btn-secondary`, `.btn-danger`, `.pill`, `.text-input`, `.modal-overlay`, `.spinner`, `.slide-in`, `.fade-in`).
* **`src/components/_confirm.js`**: Async confirmation dialog primitive (`Confirm.show()`).
* **`src/components/data-table.js`**: Generic sortable, filterable, paginated data table component.
* **`src/components/toast-host.js`**: Global toast notification singleton consumed by `Toast.show()`.
* **`src/utils/api.js`**: Centralized fetch wrapper (`apiFetch`, `apiPost`, `apiDelete`) with built-in toast and loading state support.
* **`src/utils/polling.js`**: Safe polling mixin with concurrency guards and disconnect cleanup.
* **`src/utils/state-mixin.js`**: Reusable loading/error state management for tab components.
* **`src/utils/toast.js`**: Static `Toast.show()` service wrapping the toast-host.
* **`src/utils/op-queue.js`**: Standalone offline-operation queue utility.

**Tab components (each split into a sibling folder):**

* **`src/components/benchmark-tab.js`** + **`benchmark-tab/`**:
  - `_styles.js`, `_logic.js` (queue building, status polling, SSE, bubble-click handlers), `_templates.js` (table, runner, progress, log, details modal)
  - Composes `<benchmark-bubble-chart>` (kept whole at 291 lines)

* **`src/components/chat-tab.js`** + **`chat-tab/`**:
  - `_styles.js`, `_logic.js` (barrel re-export), `_tools.js` (TOOL_DEFINITIONS, TOOL_ICONS constants), `_formatting.js` (markdown/math rendering, thinking parsing, prompt extraction), `_api.js` (server-aware API routing, sendMessage streaming, model status polling, vision check, image handling, message state), `_templates.js` (messages, input, composer, thinking box, tool call indicators, per-prompt 🎨 buttons, server selector pills with loaded model name, 🛠️ Tools toggle)

* **`src/components/gallery-tab.js`** + **`gallery-tab/`**:
  - `_styles.js`, `_logic.js` (folder browsing, metadata fetch, delete/move), `_templates.js` (grid, viewer, inspector)

* **`src/components/server-tab.js`** + **`server-tab/`**:
  - `_styles.js`, `_logic.js` (status polling, SSE, server actions, INI save/scan for both primary and mini), `_templates.js` (dual-server status, dual model config editors, downloader, logs)
  - Composes `<server-status-card>` (dual LLM servers with per-server Start/Stop/Restart), `<models-config-editor>` (reused for both `models.ini` and `modelg.ini`), `<model-downloader>`, `<server-logs>` (children kept whole)

* **`src/components/model-downloader.js`** + **`model-downloader/`**:
  - `_styles.js`, `_logic.js` (HF search, download queue polling), `_templates.js`

* **`src/components/models-config-editor.js`** + **`models-config-editor/`**:
  - `_styles.js`, `_logic.js` (INI parse/serialize, scan/delete), `_templates.js`

* **`src/components/generator-tab.js`** + **`generator-tab/`**:
  - `_styles.js`, `_logic.js` (workflow param mapping, aspect-ratio presets, queue submit), `_templates.js`

**Standalone child components (kept whole, no sub-folder):**
* `src/components/server-status-card.js` — health display & start/stop/restart controls
* `src/components/server-logs.js` — live log viewer with container selector & auto-scroll
* `src/components/benchmark-bubble-chart.js` — D3/Canvas bubble chart for benchmark results

---

## ⚠️ Critical Rules for AI Agents

### 1. Validate Lit/Vite Compilation on every edit

Lit template literals are highly sensitive to unclosed tags or duplicate blocks.

* After editing any `.js` file in `src/`, **always** run:
  ```bash
  npm run build
  ```
* If Vite fails to bundle, immediately revert or repair the syntax error before continuing. Do not leave the frontend in an uncompiled state.

### 2. Strip Thinking Blocks Before JSON Parsing

Reasoning LLMs (like DeepSeek-R1) generate reasoning streams inside `<think>...</think>` tags before returning JSON outputs. Simple JSON parsers will crash when reading this text.

* Always preserve the custom regex stripper in `services/judge/judge.py`:
  ```python
  def parse_judge_json(raw_text: str) -> dict:
      clean_text = re.sub(r'<think>.*?</think>', '', raw_text, flags=re.DOTALL)
      start_idx = clean_text.find('{')
      end_idx = clean_text.rfind('}')
      if start_idx == -1 or end_idx == -1:
          raise ValueError(...)
      json_str = clean_text[start_idx:end_idx+1]
      return json.loads(json_str)
  ```
* Do not replace this with a standard `json.loads` statement on direct raw outputs.

### 3. Multi-Run Retention Policy & Aggregation Trigger

To prevent orphaned scores and stale statistics, benchmark run management now uses a **retention window** instead of hard-deleting all history:

* Call `prune_old_runs(model_id, max_keep=5)` (in `utils/db_utils.py`) to keep the last 5 runs per model/server. Do **not** use `DELETE FROM test_runs WHERE model_id = ?` which would destroy multi-run history.
* Rely on foreign key cascading constraints (`ON DELETE CASCADE` on `round_scores` and `model_hallucinations`) to automatically prune scores and hallucination records for pruned runs.
* Always call `calculate_and_store_model_aggregates(model_id)` (from `services/benchmark/aggregation.py`) after grading completes — this recalculates `avg_total_score`, `score_stddev`, `avg_tps`, `runs_count`, and `category` in the `models` table.
* Execute database updates in a clean, committed transaction.

### 4. Empty Response Retry Logic

If a model returns an empty response (typically hitting its token limit during long-form reasoning), the system retries the same prompt up to **3 times** with a 5-second pause between attempts in both `run_benchmark_task` and `run_benchmark_queue_task` (both live in `services/benchmark/runner.py`).

* Server errors (non-200 HTTP responses) are **not retried** — they result in an error entry like `{"error": "Server error (non-200 response), no content"}` instead of empty strings.
* After exhausting retries, the round is saved with `"error": "Empty response after 3 retries"` to prevent silent empty-string scoring by the AI Judge.

### 5. GPU Cooldown Protection

Evaluating LLMs or swapping models on a single GPU can trigger cascading VRAM locks or memory segmentation faults if requests hit the server too fast.

* Always maintain a **10-second cooldown** (`await asyncio.sleep(10)`) between qualitative rounds and between test models in a queue.
* This allows the driver to release allocated memory handlers and prevents server locks.

### 6. Docker Rebuilds are Required for Code Updates

The `llm-mobile` container is built using a multi-stage Docker image where Vite pre-builds the static bundle and Python copies the workspace.

* Changes in `app/main.py`, `services/`, or `src/` are **not** fully hot-reloaded inside the production Docker stack automatically.
* To apply code changes, navigate to the compose directory `/home/nui/llmaCPP` and execute:
  ```bash
  docker compose build llm-mobile
  docker compose up -d --no-deps llm-mobile
  ```

### 7. `traceback` Must Be Imported at Module Top

The `traceback` module **must** be imported at the top of `app/main.py` (and any service module that logs exceptions). If it is missing, any secondary error handler (e.g., during exception re-raising or logging) will fail with `NameError: name 'traceback' is not defined`, causing cascading failures that mask the real underlying issue.

* Always verify `import traceback` exists at the top of backend entry points. If it's missing, error traces inside `except` blocks are swallowed.

### 8. System Stats Must Come From MQTT Only

The `/system_stats` endpoint serves hardware telemetry (CPU temp/util, RAM, GPU/VRAM, storage) sourced **exclusively from Home Assistant via MQTT**. Local hardware queries (e.g., `nvidia-smi`, `psutil`) must **never** be used to populate system stats.

* The MQTT listener (`_on_mqtt_message` in `services/docker_svc.py`) writes incoming values directly into `_stats_cache["data"]`. The async poller that previously fell back to local nvidia-smi parsing has been removed — do not reintroduce it.
* Home Assistant publishes the correct per-GPU values (e.g., Tesla P100 VRAM, GPU utilization) via its own MQTT topics. Rely on those rather than trying to parse `nvidia-smi` output locally, which is unreliable with multi-GPU setups.
* The listener is **self-healing**: `_start_mqtt_listener()` registers `on_connect`/`on_disconnect` callbacks, enables paho auto-reconnect (`reconnect_delay_set(1, 30)`), and configures the `paho.mqtt` logger so broker failures are visible in container logs. A daemon watchdog (`start_mqtt_watchdog()` → `_mqtt_watchdog_loop()`, started in `app/main.py` startup) restarts the listener if no telemetry message has arrived for **90 seconds** (checked every 30s), because paho's `loop_start()` thread can die silently and leave `_stats_cache` frozen (VRAM bars stuck at stale values).

### 9. Tool Orchestrator Final Response Must Stream

When `chat_with_tools()` detects a normal completion (no more tool calls), the final assistant response **must** be streamed token-by-token from llama-server, not emitted as a single blob.

* Use `_stream_final_response()` which makes a streaming request to llama-server **without** the `tools` parameter and forwards raw SSE bytes.
* This preserves `reasoning_content` in the delta chunks so the frontend can show real-time reasoning text in the thinking box.
* Do NOT reconstruct individual `_sse_delta()` calls with the full content — that defeats the purpose of streaming.
* The frontend parser already handles `reasoning_content` from the delta; no frontend changes are needed for the backend to emit it.

### 10. Thinking Box Relies on `m.done`, Not `isThinking`

The thinking box (`🧠 Thinking Process...`) visibility in the assistant message template must be governed by `!response && !m.done`, not by `parseThinkingAndContent()`'s `isThinking` return value.

* The outer guard in `_templates.js` must be `m.content || m.thinking || !m.done` so the IIFE renders even when both `content` and `thinking` are empty (initial placeholder state).
* The thinking box condition inside the IIFE: `${!response && !m.done ? html`<thinking-box>` : ''}`
* The typing dots condition: `${!response && m.done && !m.toolCalls?.length ? html`<dots>` : ''}`
* These conditions ensure the thinking box shows immediately when a message is sent, without relying on `isThinking` flag values that can be cleared before Lit renders.

### 11. `ctx.isGenerating` Must Be Set Before Fetch

In `sendMessage()` (`chat-tab/_api.js`), `ctx.isGenerating` must be set to `true` right before the `await fetch()` call to prevent double-sends and enable UI indicators.

* Set it after placeholder creation and request body construction, before the `try` block.
* The `finally` block already sets `ctx.isGenerating = false`.
* Do not rely on `parseThinkingAndContent()`'s `isThinking` for UI state — use `ctx.isGenerating` for send prevention and `m.done` for rendering.

### 12. URL Clickability & Per-Prompt Image Buttons

`formatMessage()` in `chat-tab/_formatting.js` wraps bare URLs with `<a href="..." target="_blank">` tags after protecting code block placeholders and existing markdown links. The CSS for `.bubble a` uses `#818cf8` color with hover underline and visited state.

Per-prompt 🎨 buttons are rendered for lines starting with `>` (or after `Prompt:`). `extractPrompts()` parses the response for these patterns, and clicking a button calls `promptGenerateImage()` which saves the prompt to `localStorage` and switches to `#/generate`.

### 13. Service Worker Cache Bumping

When the frontend is updated and changes aren't reflected in production, the service worker cache in `public/sw.js` is likely stale.

* Bump `CACHE_NAME` (e.g., `'llm-mobile-v2'` → `'llm-mobile-v3'`) to force a fresh cache on the next service worker update.
* Users may need to unregister the old service worker in DevTools → Application → Service Workers to clear the stale cache immediately.
* Always verify the new JS bundle hash in Docker (`/app/dist/assets/`) matches what the browser loads.

### 14. ComfyUI Lifecycle: docker SDK `stop()` Is Keyword-Only

docker SDK 7.x defines `Container.stop(self, **kwargs)` — `timeout` must be passed as a **keyword argument**.

* Never call `c.stop(30)` or `asyncio.to_thread(c.stop, 30)` — the positional timeout raises `TypeError: Container.stop() takes 1 positional argument but 2 were given`, which is swallowed by the watchdog's `except` and silently leaves ComfyUI running.
* Always use `c.stop(timeout=30)`. In async watchdog code use `await asyncio.to_thread(lambda: c.stop(timeout=30))` (`asyncio.to_thread` only forwards positional args, so a lambda is required).
* The idle watchdog in `services/comfy/lifecycle.py` (`_idle_watchdog_loop`) stops the `comfyui` container after `IDLE_TIMEOUT_SECONDS = 600` of no generation activity; do not remove or reorder its guards (container running, queue not running, no queued/running items, idle timeout elapsed).

The `/system_stats` endpoint serves hardware telemetry (CPU temp/util, RAM, GPU/VRAM, storage) sourced **exclusively from Home Assistant via MQTT**. Local hardware queries (e.g., `nvidia-smi`, `psutil`) must **never** be used to populate system stats.

* The MQTT listener (`_on_mqtt_message` in `services/docker_svc.py`) writes incoming values directly into `_stats_cache["data"]`. The async poller that previously fell back to local nvidia-smi parsing has been removed — do not reintroduce it.
* Home Assistant publishes the correct per-GPU values (e.g., Tesla P100 VRAM, GPU utilization) via its own MQTT topics. Rely on those rather than trying to parse `nvidia-smi` output locally, which is unreliable with multi-GPU setups.
* The listener is **self-healing**: `_start_mqtt_listener()` registers `on_connect`/`on_disconnect` callbacks, enables paho auto-reconnect (`reconnect_delay_set(1, 30)`), and configures the `paho.mqtt` logger so broker failures are visible in container logs. A daemon watchdog (`start_mqtt_watchdog()` → `_mqtt_watchdog_loop()`, started in `app/main.py` startup) restarts the listener if no telemetry message has arrived for **90 seconds** (checked every 30s), because paho's `loop_start()` thread can die silently and leave `_stats_cache` frozen (VRAM bars stuck at stale values).

### 15. Multi-Run Aggregation & Categorization Invariants

The statistical aggregation engine in `services/benchmark/aggregation.py` must not be bypassed.

* **`calculate_and_store_model_aggregates(model_id)`** must be called in `services/judge/judge.py` after every successful grading round. Do not skip this call or move it — it is the single point where `avg_total_score`, `score_stddev`, `avg_tps`, `runs_count`, and `category` are written back to the `models` table.
* **`classify_model(avg_speed_tps, avg_reasoning, avg_code, vram_gb)`** implements fixed threshold rules from `category.md`. Do not change the thresholds without updating this document:
  - `speed_first`: TPS ≥ 60.0
  - `reasoning`: avg_reasoning ≥ 14.0 **and** avg_code ≥ 14.0 **and** VRAM < 16.0
  - `vram_efficient`: 0 < VRAM < 12.0 **and** avg_reasoning ≥ 10.0
  - `balanced`: 15.0 ≤ TPS ≤ 60.0 **and** 12.0 ≤ avg_reasoning ≤ 17.0
  - `specialized`: avg_reasoning ≥ 16.0 **or** avg_code ≥ 16.0
* **`CATEGORY_LABELS`** maps raw category keys to display emoji strings. Always import from `services/benchmark/aggregation.py` — never redefine inline.
* **Execution modes:** `fast_screen` runs 3 rounds (Knowledge QA + Code Generation + Abstract Reasoning). `full` runs all 5 rounds. `run_count`/`execution_mode`/`temperature` are forwarded to the **queue** (`run_benchmark_queue_task`), which runs N passes per model (each own `test_runs` row + `run_number`/`run_group_id`) and batch-grades them. `speed_multi` is currently unimplemented in the runner (falls through to `full`). Do not rename these modes without updating `runner.py`, `api.py`, `models/requests.py`, and the frontend `_logic.js`.

---

## 💾 Path Configuration Guide

When writing or editing filesystem operations, always map paths according to the environment context (Docker vs. Local Host):

| Entity | Path inside Docker (`llm-mobile`) | Path on Host (`/home/nui`) |
|---|---|---|
| **SQLite DB** | `/app/llm_bench.db` | `/home/nui/llmaCPP/llm_bench.db` |
| **GGUF Models** | `/models/` | `/home/nui/llmaCPP/models/` |
| **Models INI (Primary)** | `/models/models.ini` | `/home/nui/llmaCPP/models/models.ini` |
| **Models INI (Secondary)** | `/models/modelg.ini` | `/home/nui/llmaCPP/models/modelg.ini` |
| **Benchmark Results** | `/app/benchmark_results/` | `/home/nui/llmaCPP/benchmark_results/` |
| **Gold Standard Answers** | `/app/answers1.json` | `/home/nui/llmaCPP/answers1.json` |

Always use the Python fallback routines already present in `utils/common.py` to auto-detect and resolve these paths:

```python
DB_PATH = "/app/llm_bench.db" if os.path.exists("/app") else "/home/nui/llmaCPP/llm_bench.db"
```

Do not hardcode a single path without checking for fallback options.

---

## 🏗️ Frontend & Backend Modularization Rules (Phases I & J)

The entire codebase has been refactored from monolithic files into focused, single-responsibility modules. New code must follow these constraints:

**1. Primitives First**
* All shared CSS must be extracted into `src/components/_primitives.js`.
* Do not define `.card`, `.btn-primary`, `.btn-secondary`, `.btn-danger`, `.pill`, `.text-input`, `.modal-overlay`, `.spinner`, `.slide-in`, or `.fade-in` in any other component file.

**2. Centralized Fetching & State**
* All API calls must use `src/utils/api.js` (`apiFetch`, `apiPost`, `apiDelete`, `apiFetchWithToast`, `apiFetchWithLoading`).
* Do not inline `await fetch(...)` + `await res.json()` patterns in component files.
* Loading and error states should use `StateMixin` or manual property toggling consistent with `apiFetchWithLoading`.

**3. Component Contracts**
* Child components must receive data via **property binding** (`.prop=${value}`), not shared stores.
* Child components must emit events with `detail` payloads **byte-identical** to what the parent previously emitted or what downstream listeners expect.
* Parent components retain all reactive state; children are dumb renderers + event forwarders.

**4. Icon Centralization**
* All icons must be imported from `src/assets/icons.js` and rendered via Lit `html` template literals.
* Zero inline `<svg` tags are allowed in component files.

**5. Build Safety**
* After editing any `.js` file under `src/`, run `npm run build` and fix any Vite/Lit template errors immediately.
* Check browser console for Lit warnings (unclosed templates, duplicate blocks) before considering work complete.

**6. No Feature Creep**
* Phase I and Phase J were zero-feature-change initiatives. Do not alter behavior, API contracts, or visual design when extracting or splitting components.

**7. Phase J — Sub-folder Modularization Pattern (JS)**
* Each large Lit component is split into a sibling folder `<component-name>/` containing `_styles.js`, `_logic.js`, and `_templates.js`.
* When `_logic.js` exceeds ~500 lines, it should be further split into focused sub-modules (e.g. `_api.js`, `_formatting.js`, `_tools.js`) with `_logic.js` becoming a thin barrel re-export. No import-site changes needed — callers continue to `import * as logic from './component/_logic.js'`.
* The main class file (`<component-name>.js`) owns the `customElements.define` call and imports from the sub-folder — no new `customElements.define` calls in sub-folder files.
* `_templates.js` functions take explicit args (no closures over `this`). Pass state/handlers as parameters to keep them pure and testable.
* `llm-app.js` is split via `src/llm-app/` containing `_styles.js`, `_router.js`, `_templates.js`, and `_sse.js`.

**8. Phase J — Sub-package Modularization Pattern (Python)**
* Large services are split into `services/<name>/` packages with an `__init__.py` that re-exports the full public surface (compat shim).
* `app/main.py` continues to `from services.<name>_svc import ...` via the shim — no route edits required.
* Module-level shared state lives in **one** sub-module only (e.g., `queue_state.py`, `state.py`) and is imported everywhere else — never duplicated.
* `get_quantization_from_name` is canonical in `utils/common.py` — import from there, not from service modules.
* `services/vram_svc.py` is a shared leaf — never import `benchmark` or `comfy` from it; the dependency arrow is one-way.
* Legacy `services/<name>_svc.py` compat files were removed after callers were migrated; imports should now target the sub-package modules directly (e.g., `from services.benchmark.api import run_benchmark`).

---

## 📜 Full Roadmap

This repository implements the complete roadmap for the `llmMobile` project:

### Backend Modularization (Phases A–H)
- **Phase A – Baseline & Guard Rails**: Setup automated verification via `tests/` and Docker build pipeline.
- **Phase B – Pure Utilities**: Extracted constants, helpers, DB utilities.
- **Phase C – Service Layer (Docker & Model)**: Created `docker_svc.py`, `model_svc.py`.
- **Phase D – Service Layer (Chat & SSE)**: Added `chat_svc.py`, `sse_svc.py`.
- **Phase E – Service Layer (ComfyUI, Queue, Gallery, Push)**: Built `comfy_svc.py`, `queue_svc.py`, `gallery_svc.py`, `push_svc.py`.
- **Phase F – Service Layer (Download, Benchmark, Judge)**: Added `download_svc.py`, `benchmark_svc.py`, `judge_svc.py`.
- **Phase G – Thin Router**: `app/main.py` refactored into a pure façade delegating to services.
- **Phase H – Automated Verification**: Added comprehensive endpoint tests and verified Docker builds.

### Frontend Refactor (Phase I)
- **Phase I – Component Extraction**: Decomposed monolithic tabs into reusable primitives (`_primitives.js`, `_confirm.js`, `_data-table.js`, `toast-host.js`), shared utilities (`utils/api.js`, `utils/polling.js`, `utils/state-mixin.js`), and clean child-component trees for `server-tab` and `benchmark-tab`. Centralized icons in `assets/icons.js`.

### Large-File Modularization (Phase J)
- **Phase J – Sub-package & Sub-folder Splits**: Centralized `get_quantization_from_name` in `utils/common.py`. Split `download_svc.py` → `services/download/` (state, hf, worker, api). Split `comfy_svc.py` → `services/comfy/` (client, workflow, comfyio, queue_state, worker, api). Split `benchmark_svc.py` → `services/benchmark/` (logging, state, runner, reader, api). Split `judge_svc.py` → `services/judge/` (gold, judge). Split all large Lit components (`generator-tab`, `models-config-editor`, `model-downloader`, `server-tab`, `llm-app`, `gallery-tab`, `chat-tab`, `benchmark-tab`) into `_styles.js`/`_logic.js`/`_templates.js` sub-folder pattern. Removed all compat shims after callers were migrated.

### Multi-Server Support (Phase K)
- **Phase K – Dual llama-server Management**: Added per-server status/control (Start/Stop/Restart) for both `llama-server` and `llama-server-mini` via the Server tab. Full `modelg.ini` model management (load/unload/scan/delete) alongside the existing `models.ini` support. Chat tab server selector (Primary/Secondary) with corresponding streaming chat endpoints and vision capability detection on both servers. GTX secondary GPU telemetry (temperature, utilization, VRAM) via MQTT.

All phases have been completed, resulting in a fully modular, test-covered codebase with strict separation of concerns on both the backend and frontend, now supporting dual independent inference servers on separate GPUs.

### Tool-Enabled Chat (Phase L)
- **Phase L – Tool-Calling & Streaming Improvements**: Implemented server-side tool/function-calling orchestration in `services/tools/`. Added 4 tools (web search via DuckDuckGo/`curl_cffi`, read/write/edit file in sandboxed `/mnt/dashboard/` workspace). Tool rounds use non-streaming requests; final response switches to streaming for real-time token delivery including `reasoning_content`. Frontend: thinking box (`!response && !m.done`), URL clickability with styled `<a>` tags, per-prompt 🎨 image generation buttons, and service worker cache management.

### Live Server Activity & Further Code Splitting (Phase M)
- **Phase M – Chat-tab Logic Splitting & Inference Activity Indicator**: Further split `chat-tab/_logic.js` (923 → 35 lines) into `_tools.js`, `_formatting.js`, and `_api.js` with a barrel re-export. Added live `○ Idle`/`● Inferring…` per-server activity badge on the Server tab by proxying llama-server's `/slots` endpoint, polled every 2.5s. All files in the repository are now under 550 lines.

### MCP Server Integration (Phase N)
- **Phase N – MCP Server for Safe LLM Agent Access**: Added `mcp_server/` package with 32 guarded tools wrapping all FastAPI endpoints. The MCP server runs as a background worker (port 8002 — 8001 is taken by kokoro-tts on the host) alongside the main FastAPI server (port 8000), started by `docker-entrypoint.sh`. Each tool includes pre-flight validation (VRAM checks, disk space checks, state conflict detection) and post-flight verification. Written skills for all critical operations: model lifecycle, benchmarks, downloads, image generation, gallery management, server lifecycle. See `MCPnSkills.md` for the full implementation plan.

### On-Demand ComfyUI Lifecycle & Image Workflow Expansion (Phase O)
- **Phase O – On-Demand ComfyUI Lifecycle & Image Workflow Expansion**: Added `services/comfy/lifecycle.py` — docker-SDK start/stop, HTTP readiness probing, generation-activity tracking, and a 10-minute idle watchdog that stops the ComfyUI container when no generation has run. Queue worker auto-starts ComfyUI and waits for readiness before unload/generation; the edit flow returns 409 when ComfyUI is off. New endpoints `/api/comfyui/status|start|stop`; the Generator tab shows a status chip + Start/Stop button (4s polling). Also added **Krea2 Identity Edit** workflows (single-image text-guided edit + dual-image subject transfer via `/api/generate/edit`), **Boogu Image Turbo** T2I, and checkbox-based multi-workflow selection (`selected_workflows`) in the Generator tab.

### Benchmark & UX Enhancements (Phase P)
- **Phase P – Benchmark & UX Enhancements**: Added Temperature Sweep (`/api/benchmarks/temperature-sweep`, background task, JSON-retry grading) with a button on the Benchmarks tab; optional Telegram notification when a benchmark queue finishes (`TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID`); low-speed benchmark abort info persisted in the DB and shown in model details; logical INI preset names marked ready in the rank table; Chat tab model selector dropdown with glow-until-ready loading indicator; Tools toggle defaults to OFF; gallery mobile lightbox layout; floating ⚡ hard-refresh (PWA cache-bust) button on the server card; MCP server port corrected to 8002.

### MQTT Telemetry Resilience (Phase Q)
- **Phase Q – Self-Healing MQTT Telemetry**: Hardened the MQTT telemetry pipeline after the Server-tab VRAM bars were observed stuck at stale values (P100 showing 0% while `nvidia-smi` reported ~97%) because paho's `loop_start()` thread had died silently and `_stats_cache` froze. `_start_mqtt_listener()` now tears down any previous client, registers `on_connect`/`on_disconnect` logging callbacks, enables paho auto-reconnect (`reconnect_delay_set(1, 30)`), and configures the `paho.mqtt` logger so broker failures appear in container logs. Added `start_mqtt_watchdog()` (daemon thread, wired into `app/main.py` startup) which restarts the listener when no telemetry has arrived for 90s (checked every 30s). Stats continue to come **exclusively from Home Assistant via MQTT** — no `nvidia-smi`/`psutil` fallback was reintroduced.

### LLM Idle Unload (Phase R)
- **Phase R – LLM Idle Unload to Free VRAM**: Added `services/llm_lifecycle.py` — a watchdog (mirroring the ComfyUI idle pattern) that unloads the loaded model from each llama-server independently after **10 minutes** (default) of no inference activity, freeing VRAM per GPU. Activity = any busy `/slots` slot (probed every 30s via `get_server_slots_status()`), plus explicit `touch_activity()` calls from model-load (`model_svc`) and chat send paths (`chat_svc`, `services/tools/chat.py`) so short requests between probes aren't missed. Guards: skipped while a benchmark is running or the ComfyUI generation queue has queued/running items. `get_server_slots_status()` now returns `loaded_model` so the watchdog knows what to unload. Config: `LLM_IDLE_UNLOAD_ENABLED` (default `1`) and `LLM_IDLE_UNLOAD_SECONDS` (default `600`). Unloads are logged to the container log (`[LLM Idle] …`); no frontend countdown/toast.

### Multi-Run Benchmarking & Statistical Aggregation (Phase S)
- **Phase S – Multi-Run Score Averaging, High-Efficiency Execution & Auto-Categorization**: Implemented a full multi-run benchmarking pipeline:
  - **DB Schema** (`utils/db_utils.py`): Extended `test_runs` with `run_number`, `run_group_id`, `execution_mode`, `temperature`; extended `models` with `category`, `avg_total_score`, `avg_tps`, `score_stddev`, `runs_count`. Replaced hard-delete with `prune_old_runs(model_id, max_keep=5)` retention window.
  - **Execution Modes** (`services/benchmark/runner.py`): `fast_screen` selects 3 core rounds (~3–4 mins); `full` runs all 5 rounds. Dynamic VRAM cooldown: 5s for models < 11 GB VRAM, 10s otherwise.
  - **Multi-Pass Queue**: `run_benchmark_queue_task(models, judge_model_id, server, execution_mode, run_count, temperature)` runs up to N passes per model (each with its own `test_runs` row and a shared `run_group_id`), then batch-grades all passes with the Judge once. Use the Benchmarks tab **Mode** dropdown + **Run Count** + **🚀 Run Automated Queue Benchmark** for overnight multi-run benchmarking. `speed_multi` mode and single-path `run_count` remain unimplemented (see `docs/MultiRunPhaseS.md`).
  - **Aggregation Engine** (`services/benchmark/aggregation.py`): `calculate_and_store_model_aggregates()` computes $\mu$, $\sigma$, avg TPS, run count; auto-triggered by the AI Judge after grading. `classify_model()` assigns one of 5 categories based on speed and score thresholds from `category.md`.
  - **API** (`services/benchmark/api.py`, `app/main.py`): `execution_mode` + `temperature` params passed through to the runner; new `POST /api/benchmarks/aggregate` endpoint for manual recalculation. `GET /api/benchmarks` now returns `avg_score`, `score_stddev`, `category_label`, and `runs_count`.
  - **Frontend** (`benchmark-tab/`): Score column shows `★ μ ± σ` chip + `🔄 N runs` badge. Toolbar has category filter pills (`⚡ Speed`, `🧠 Reasoning`, `🔋 VRAM`, `⚖️ Balanced`, `🎯 Specialized`). Model details modal displays statistical summary card and historical runs list.

---

## 🔧 MCP Server Critical Rules

### 1. MCP Tools Must Always Validate Before Acting

Every MCP tool in `mcp_server/tools/` must perform resource checks before calling FastAPI endpoints:
- **Before loading a model**: check VRAM availability, check no benchmark is running, check file exists
- **Before downloading**: check disk space, check not already downloaded
- **Before deleting**: require explicit `confirm=True` parameter, check if model is currently loaded

### 2. MCP Tools Must Verify After Acting

After calling a FastAPI endpoint, the tool must confirm the expected state change occurred:
- After loading: poll the server's `/models` until the model shows as loaded
- After unloading: poll until no loaded model shows
- After download: scan and verify the file is registered

### 3. MCP Tool Names Are Fixed

Do not rename MCP tools without updating the LLM agent's skill documentation in `.pi/agent/skills/`. The 32 registered tools are:

**Model Management**: `list_models`, `load_model`, `unload_model`, `delete_model`, `get_server_models`
**Download**: `search_huggingface_models`, `get_model_details`, `download_model`, `check_download_status`, `cancel_download`, `scan_and_register_models`
**Benchmark**: `run_benchmark`, `run_benchmark_queue`, `run_temperature_sweep`, `check_benchmark_status`, `get_benchmark_results`, `list_benchmarks`
**Generation**: `generate_image`, `check_generation_status`, `cancel_generation`
**Gallery**: `browse_gallery`, `get_gallery_folders`, `delete_gallery_images`, `create_gallery_folder`
**Server**: `get_server_status`, `get_system_stats`, `start_server`, `stop_server`, `restart_server`, `get_server_logs`
**Config**: `get_ini_config`, `save_ini_config`

### 4. Docker Rebuild Required After MCP Changes

The MCP server runs inside the `llm-mobile` container. After any change to `mcp_server/`, `requirements.txt`, or `docker-entrypoint.sh`:
```bash
cd /home/nui/llmaCPP
docker compose build llm-mobile
docker compose up -d --no-deps llm-mobile
```

### 5. The `mcp_server` Package Name Is Intentional

The package is named `mcp_server` (not `mcp`) to avoid conflicts with the installed `mcp` library (`from mcp.server.fastmcp import FastMCP`). All internal imports use `from mcp_server.xxx import yyy` — never `from ..xxx import yyy`.
