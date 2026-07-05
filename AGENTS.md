# 🤖 AGENTS.md — AI Agent Guidelines for llmMobile

> This document outlines coding standards, structural rules, and critical invariants for AI coding assistants working in the `llmMobile` repository.
>
> **Status:** All planned development phases (A–K) are complete. The repository is fully modular, test-covered, and supports dual independent inference servers on separate GPUs.

---

## 🔍 What This Repository Is

`llmMobile` is a mobile-first controller, streaming client, image generator interface, and automated benchmarking portal. It operates in tandem with:

1. **`llama-server`** (Inference container, Port 8080)
2. **`ComfyUI`** (Image generation container, Port 8188)
3. **`llm_bench.db`** (SQLite database for models and benchmarking runs)

It is deployed as a Docker container (`llm-mobile`) defined in the `/home/nui/llmaCPP/docker-compose.yml` file.

### Multi-Server Architecture
The app manages **two independent `llama-server` instances**:

| Server | Container | Port | GPU | INI File |
|---|---|---|---|---|
| **Primary** | `llm-server` | 8080 | GPU 0 (Tesla P100) | `models.ini` |
| **Secondary** | `llm-server-mini` | 8081 | GPU 1 (GTX 1060) | `modelg.ini` |

Both servers share the `/models` volume but maintain separate preset configs and can load different models simultaneously.

---

## 📂 Layout & Core Architecture

### 1. Backend (Service Layer)

The backend is a **thin FastAPI router** (`app/main.py`) that delegates all business logic to dedicated service modules under `services/`. After Phase J modularization, the four large service domains are sub-packages (benchmark, comfy, download, judge); smaller services remain single files. Legacy top-level `*_svc.py` compat files were removed after all callers were migrated.

**Sub-packages (Phase J splits):**

* **`services/benchmark/`** — Benchmark sequence execution, score consolidation, database idempotency:
  - `__init__.py` — re-export shim (public surface unchanged)
  - `logging.py` — `log_benchmark_progress`, `log_benchmark_error`, `log_benchmark`
  - `state.py` — progress/running/lock getters & setters
  - `runner.py` — `run_benchmark_task`, `run_benchmark_queue_task` (retry + cooldown + DB idempotency — G5)
  - `reader.py` — `get_benchmarks`, `get_benchmark_details`, `get_benchmark_logs`, `get_benchmark_outputs`
  - `api.py` — `run_benchmark`, `run_benchmark_queue` (FastAPI entry points)

* **`services/comfy/`** — ComfyUI workflow validation, prompt injection, image generation queue:
  - `__init__.py` — re-export shim
  - `client.py` — `get_comfy_http`, `set_comfy_http`
  - `workflow.py` — `_load_workflow`, `_build_workflow`
  - `comfyio.py` — `_free_comfy_cache`, `_queue_comfy`, `_wait_comfy`, `_get_comfy_history`, `_write_sidecar`
  - `queue_state.py` — locks, running flag, snapshot, persist (load/save), SSE subscribers, `broadcast_queue`
  - `worker.py` — `_run_subtask`, `queue_worker`, VRAM swap helpers
  - `api.py` — `submit_to_queue`, `get_queue`, `cancel_queue_item`, `clear_completed`, `stream_queue`

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

* **`docker_svc.py`**: Container lifecycle (start/stop/restart for both `llama-server` and `llama-server-mini`), system stats via MQTT (Tesla P100 + GTX 1060), log retrieval.
* **`model_svc.py`**: Model scanning, loading, INI management (`models.ini` + `modelg.ini`), weight deletion — supports both primary and mini servers.
* **`chat_svc.py`**: Multi-round LLM prompt orchestration, streaming responses — supports both primary (`/api/chat/completions`) and mini (`/api/chat-mini/completions`) servers.
* **`sse_svc.py`**: Server-Sent Event subscription management.
* **`gallery_svc.py`**: Image gallery CRUD, metadata extraction, file cleanup.
* **`push_svc.py`**: Push notification dispatching.
* **`vram_svc.py`**: VRAM capture, idle-trigger detection — shared leaf dependency; never split.

Shared utilities live in `utils/` (`common.py` — path resolution + `get_quantization_from_name`, `db_utils.py`, `bench_log.py`), and Pydantic schemas in `models/requests.py`.

### 2. Frontend (`src/`)

A modular Single Page Application (SPA) utilizing **Lit (Reactive Web Components)** and compiled with **Vite**. After Phase J modularization, each large component is split into a `_styles.js` / `_logic.js` / `_templates.js` sibling folder. The main class file imports those modules and owns the `customElements.define` call.

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
  - `_styles.js`, `_logic.js` (stream parsing, context/messages state, send logic, markdown rendering, server-aware API routing via `_api()` helper), `_templates.js` (messages, input, composer, server selector pills with loaded model name)

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

### 3. Maintain Database Idempotency & Clean Cleansing

To prevent orphaned scores and hallucinations, any new benchmark run or import for an existing `model_id` must prune historical runs:

* Delete historical `test_runs` where the `model_id` matches.
* Rely on foreign key cascading constraints (`ON DELETE CASCADE` on `round_scores` and `model_hallucinations`) to automatically prune related tables.
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
