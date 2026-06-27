# 🤖 AGENTS.md — AI Agent Guidelines for llmMobile

> This document outlines coding standards, structural rules, and critical invariants for AI coding assistants working in the `llmMobile` repository.
>
> **Status:** All planned development phases (A–I) are complete. The repository is fully modular, test-covered, and follows strict separation of concerns on both backend and frontend.

---

## 🔍 What This Repository Is

`llmMobile` is a mobile-first controller, streaming client, image generator interface, and automated benchmarking portal. It operates in tandem with:

1. **`llama-server`** (Inference container, Port 8080)
2. **`ComfyUI`** (Image generation container, Port 8188)
3. **`llm_bench.db`** (SQLite database for models and benchmarking runs)

It is deployed as a Docker container (`llm-mobile`) defined in the `/home/nui/llmaCPP/docker-compose.yml` file.

---

## 📂 Layout & Core Architecture

### 1. Backend (Service Layer)

The backend is a **thin FastAPI router** (`app/main.py`) that delegates all business logic to dedicated service modules under `services/`:

* **`docker_svc.py`**: Container lifecycle (start/stop/restart), system stats, log retrieval.
* **`model_svc.py`**: Model scanning, loading, INI management, weight deletion.
* **`chat_svc.py`**: Multi-round LLM prompt orchestration, streaming responses.
* **`sse_svc.py`**: Server-Sent Event subscription management.
* **`comfy_svc.py`**: ComfyUI workflow validation, prompt injection, image generation triggers.
* **`queue_svc.py`**: Benchmark queue orchestration, round-robin model swapping.
* **`gallery_svc.py`**: Image gallery CRUD, metadata extraction, file cleanup.
* **`push_svc.py`**: Push notification dispatching.
* **`download_svc.py`**: Model download queue, progress tracking, file validation.
* **`benchmark_svc.py`**: Benchmark sequence execution, score consolidation, database idempotency.
* **`judge_svc.py`**: AI-as-a-Judge scoring, resilient `<think>` tag stripping, rubric evaluation.

Shared utilities live in `utils/` (`common.py`, `db_utils.py`, `bench_log.py`), and Pydantic schemas in `models/requests.py`.

### 2. Frontend (`src/`)

A modular Single Page Application (SPA) utilizing **Lit (Reactive Web Components)** and compiled with **Vite**. The frontend has been refactored from monolithic tabs into a library of reusable, single-responsibility components:

* **`src/llm-app.js`**: SPA shell, view router, SSE client, global `<toast-host>` mount point.
* **`src/assets/icons.js`**: Centralized SVG icon set (replaces all inline SVGs).
* **`src/components/_primitives.js`**: Shared CSS primitives (`.card`, `.btn-primary`, `.btn-secondary`, `.btn-danger`, `.pill`, `.text-input`, `.modal-overlay`, `.spinner`, `.slide-in`, `.fade-in`).
* **`src/components/_confirm.js`**: Async confirmation dialog primitive (`Confirm.show()`).
* **`src/components/_data-table.js`**: Generic sortable, filterable, paginated data table component.
* **`src/components/toast-host.js`**: Global toast notification singleton consumed by `Toast.show()`.
* **`src/components/server-tab.js`**: Thin orchestrator composing:
  - `<server-status-card>` — health display & start/stop/restart controls.
  - `<models-config-editor>` — `models.ini` editor with scan/save/delete.
  - `<model-downloader>` — HuggingFace search & download queue UI.
  - `<server-logs>` — Live log viewer with container selector & auto-scroll.
* **`src/components/chat-tab.js`**: Markdown-rendered streaming assistant with context preservation.
* **`src/components/generator-tab.js`**: ComfyUI parameter sliders, prompt input, aspect-ratio presets.
* **`src/components/gallery-tab.js`**: Responsive image grid, full-screen viewer, metadata inspector.
* **`src/components/benchmark-tab.js`**: Thin orchestrator composing:
  - `<benchmark-table>` — Sortable/filterable results table.
  - `<benchmark-runner>` — Queue builder, run/cancel controls, progress bar, live log stream.
* **`src/components/models-config.js`**: Database inspector, model file deletion, INI management.
* **`src/utils/api.js`**: Centralized fetch wrapper (`apiFetch`, `apiPost`, `apiDelete`) with built-in toast and loading state support.
* **`src/utils/polling.js`**: Safe polling mixin with concurrency guards and disconnect cleanup.
* **`src/utils/state-mixin.js`**: Reusable loading/error state management for tab components.
* **`src/utils/toast.js`**: Static `Toast.show()` service wrapping the toast-host.

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

* Always preserve the custom regex stripper in `services/judge_svc.py`:
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

If a model returns an empty response (typically hitting its token limit during long-form reasoning), the system retries the same prompt up to **3 times** with a 5-second pause between attempts in both `run_benchmark_task` and `run_benchmark_queue_task`.

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

---

## 💾 Path Configuration Guide

When writing or editing filesystem operations, always map paths according to the environment context (Docker vs. Local Host):

| Entity | Path inside Docker (`llm-mobile`) | Path on Host (`/home/nui`) |
|---|---|---|
| **SQLite DB** | `/app/llm_bench.db` | `/home/nui/llmaCPP/llm_bench.db` |
| **GGUF Models** | `/models/` | `/home/nui/llmaCPP/models/` |
| **Models INI** | `/models/models.ini` | `/home/nui/llmaCPP/models/models.ini` |
| **Benchmark Results** | `/app/benchmark_results/` | `/home/nui/llmaCPP/benchmark_results/` |
| **Gold Standard Answers** | `/app/answers1.json` | `/home/nui/llmaCPP/answers1.json` |

Always use the Python fallback routines already present in `utils/common.py` to auto-detect and resolve these paths:

```python
DB_PATH = "/app/llm_bench.db" if os.path.exists("/app") else "/home/nui/llmaCPP/llm_bench.db"
```

Do not hardcode a single path without checking for fallback options.

---

## 🏗️ Frontend Refactor Rules (Phase I)

The frontend has been refactored from monolithic tabs into reusable components. New code must follow these constraints:

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
* The Phase I refactor was a zero-feature-change initiative. Do not alter behavior, API contracts, or visual design when extracting or splitting components.

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

All phases have been completed, resulting in a fully modular, test-covered codebase with strict separation of concerns on both the backend and frontend.
