# TODO: Modularize `main.py` (3000 lines → smaller files)

## Overview
Refactor the monolithic `main.py` into a cohesive package of focused modules. The goal is **no feature regression** — every endpoint must still work identically after refactoring. Work bottom-up: extract pure logic first, then wire them back in.

---

## Phase 1: Preparation & Guard Rails (0 days)

- [ ] `A1` Create the package directory structure:
    ```
    main.py                        # thin entry point (imports + app.mount)
    models/                        # Pydantic schemas / request/response types
    services/                      # business logic functions
      ├── docker_svc.py            # Docker container management
      ├── model_svc.py             # Model loading proxy, preset resolution
      ├── chat_svc.py              # SSE streaming chat proxy
      ├── comfy_svc.py             # ComfyUI workflow & image pipeline
      ├── gallery_svc.py           # Gallery CRUD operations
      ├── download_svc.py          # HuggingFace model downloads
      ├── benchmark_svc.py         # Benchmark execution engine (single + queue)
      └── judge_svc.py             # AI Judge grading, scoring, DB persistence
    utils/                         # shared utilities
      ├── db_utils.py              # SQLite helpers, consolidation
      ├── bench_log.py             # Benchmark logging & file I/O
      ├── push_svc.py              # VAPID / web-push notifications
      └── common.py                # _clean_model_id, get_gold_key, etc.
    ```
- [ ] `A2` Run the full test suite (or at minimum: hit every `/api/…` endpoint manually) and capture baseline behavior — screenshots or curl outputs for each route. Do this **before** touching any code.

---

## Phase 2: Extract Pure Utility Functions (~0.5 days)

These have no dependencies on the FastAPI `app` object, so they are safe to move first.

- [ ] `B1` Move `_clean_model_id()` and `_deep_copy()` into `utils/common.py`.
- [ ] `B2` Move `get_db_conn()`, `consolidate_database()` into `utils/db_utils.py`.
- [ ] `B3` Move `safe_join()` into `utils/common.py`.
- [ ] `B4` Move all benchmark logging helpers (`log_benchmark`, `_rotate_benchmark_log_if_needed`, etc.) into `utils/bench_log.py`. **Keep the same global log file path constants.**
- [ ] `B5` Move `parse_judge_json()`, `get_gold_key()`, `get_quantization_from_name()`, `load_raw_json()` into `utils/common.py` or `judge_svc.py`.
- [ ] `B6` Move `get_llm_server_url()`, `get_gold_answers()` into `utils/common.py`.
- [ ] `B7` Move VAPID / push notification helpers (`_init_vapid_keys`, `_load_subscriptions`, `_save_subscriptions`, `_send_push_notification`) into `services/push_svc.py`. **Keep the global subscriptions and queue state variables as module-level imports from this file.**

---

## Phase 3: Extract Docker / Server Management (~0.5 days)

- [ ] `C1` Move `_container_info()` into `services/docker_svc.py`.
- [ ] `C2` Move `get_status()`, `get_system_stats()`, `start_llm()`, `stop_llm()` into `services/docker_svc.py`. **Keep the module-level `docker_client` variable.**

---

## Phase 4: Extract Model Loading / Preset Resolution (~0.5 days)

- [ ] `D1` Move `_get_preset_id_for_model()`, `_clean_model_id()` (already in B1), `_get_loaded_model()` into `services/model_svc.py`.
- [ ] `D2` Move the `_add_to_models_ini()` and `_remove_from_models_ini()` helpers into `services/model_svc.py`.
- [ ] `D3` Keep the Pydantic model `ModelActionRequest` in `models/requests.py`.

---

## Phase 5: Extract Chat Proxy (~0.5 days)

- [ ] `E1` Move `_get_loaded_model()` and the `/api/chat/completions` proxy endpoint into `services/chat_svc.py`.
- [ ] `E2` The streaming SSE handler is async — keep it in `chat_svc.py` with its own `httpx.AsyncClient` context.

---

## Phase 6: Extract SSE Log Monitor (~0.5 days)

- [ ] `F1` Move the `/events/status` SSE endpoint, `_sse_subscribers`, `broadcast_notification()`, and `log_monitor_task()` into `services/sse_svc.py`.
- [ ] `F2` Keep the module-level `_sse_subscribers` list as a shared import.

---

## Phase 7: Extract ComfyUI Image Pipeline (~1 day)

This is the largest remaining block (workflow loading, queuing, gallery browsing).

- [ ] `G1` Move workflow helpers (`_load_workflow`, `_build_workflow`) into `services/comfy_svc.py`.
- [ ] `G2` Move ComfyUI queue helpers (`_queue_comfy`, `_wait_comfy`, `_get_comfy_history`, `_write_sidecar`) into `services/comfy_svc.py`. **Keep the module-level `_COMFY_HTTP` client and node IDs.**
- [ ] `G3` Move gallery browsing functions (`browse_gallery`, `get_all_folders`, `_read_sidecar`, `_get_queue_snapshot`, persistence helpers) into `services/gallery_svc.py`. **Keep the queue state variables (`_queue_lock`, `_gen_queue`, etc.) as module-level imports from this file.**
- [ ] `G4` Move gallery CRUD endpoints (`gallery_mkdir`, `gallery_move`, `gallery_delete`) into `services/gallery_svc.py`.

---

## Phase 8: Extract Model Downloads & Search (~0.5 days)

- [ ] `H1` Keep the Pydantic model `DownloadRequest` in `models/requests.py`.
- [ ] `H2` Move `download_model()`, `get_downloads_status()`, `scan_and_register_models()` into `services/download_svc.py`. **Keep the module-level `_downloads_lock` and `_downloads_list` variables.**

---

## Phase 9: Extract Benchmark Engine (~1.5 days) ⚠️ Complex

This is the most complex section — it contains retry logic, queue execution, progress tracking, and DB persistence. It must be split into **two** files to stay readable.

### 9a — Execution engine (`services/benchmark_svc.py`)
- [ ] `I1` Move `_get_preset_id_for_model()` (already in D1), the retry loop with `_parse_response`, progress tracking variables (`_benchmark_progress`, `_benchmark_running`, `_benchmark_lock`), and both execution functions into `services/benchmark_svc.py`:
    - `run_benchmark_task()` — single model benchmark
    - `run_benchmark_queue_task()` — queue benchmark (loops through models + judge)
- [ ] `I2` Move the Pydantic models `BenchmarkRunRequest`, `BenchmarkQueueRequest` into `models/requests.py`.

### 9b — Grading / AI Judge (`services/judge_svc.py`)
- [ ] `J1` Move `query_judge_model()`, `parse_judge_json()` (already in B5) into `services/judge_svc.py`.
- [ ] `J2` Move the entire `/api/benchmarks/judge` endpoint function `judge_benchmark()` into `services/judge_svc.py`. **This is a ~130-line function — moving it out of main.py is the single biggest readability win.**

---

## Phase 10: Wire Everything Back In (~1 day)

- [ ] `K1` Re-create `main.py` as a thin entry point:
    ```python
    # main.py
    from fastapi import FastAPI, BackgroundTasks, HTTPException, Request, Response
    from fastapi.responses import HTMLResponse, StreamingResponse, JSONResponse
    from fastapi.staticfiles import StaticFiles
    
    # --- Import all extracted logic ---
    from services.docker_svc import get_status, start_llm, stop_llm, get_system_stats
    from services.model_svc import _get_preset_id_for_model, proxy_llm_load, proxy_llm_unload
    from services.chat_svc import proxy_chat
    from services.sse_svc import broadcast_notification, log_monitor_task
    # ... etc.
    
    app = FastAPI()
    
    # --- Re-register all API routes ---
    @app.get("/status")
    def get_status(): ...
    # ... replicate every @app route, delegating to the extracted functions
    
    # --- Keep static mounts and PWA manifest as-is ---
    ```
- [ ] `K2` **Do NOT remove** any endpoint from the original. Every single `@app.get / @app.post / @app.delete` must still exist in `main.py`, even if it just calls into a service function. This is critical — removing endpoints breaks the frontend's API contract.
- [ ] `K3` Keep the PWA manifest and static file mounts at the bottom of `main.py` (they have no dependencies to extract).

---

## Phase 11: Cleanup & Polish (~0.5 days)

- [ ] `L1` Remove duplicate code that was previously duplicated between `run_benchmark_task` and `run_benchmark_queue_task` (e.g., the retry loop, response parsing).
- [ ] `L2` Add docstrings to all extracted module-level functions.
- [ ] `L3` Update imports in all extracted files so they don't reference `main.py`. For example:
    - `services/benchmark_svc.py` should import `log_benchmark` from `utils.bench_log`, not define it inline.
    - `services/judge_svc.py` should import `_get_preset_id_for_model` from `services.model_svc`, not duplicate it.
- [ ] `L4` Verify that the Docker build still works: `docker compose build llm-mobile && docker compose up -d`.

---

## Phase 12: Final Validation (~0.5 days)

- [ ] `M1` Repeat the baseline test from Phase A — hit every `/api/…` endpoint and verify identical behavior.
- [ ] `M2` Run a full benchmark (single + queue) end-to-end and verify:
    - Benchmark execution completes with retries working for empty responses
    - AI Judge grading produces correct scores in the database
    - Log files are written correctly
- [ ] `M3` Verify Docker logs show no new errors from refactored modules.

---

## Risks & Notes

1. **Global state variables** — Many functions share module-level mutable state (`_sse_subscribers`, `_queue_lock`, `_downloads_list`, etc.). Moving them to separate files means those files become shared imports. If two services both import the same global, they'll see the same instance — which is correct, but worth documenting.
2. **The retry loop** is ~40 lines of async logic with `nonlocal` variable capture. Keep it intact; don't over-abstract it into a generic "retry helper" since its behavior (skip server errors, re-send exact payload) is benchmark-specific.
3. **Endpoint removal is forbidden.** The frontend expects these exact routes to exist. Even if an endpoint becomes a single-line pass-through to a service function, keep the `@app` decorator and route in `main.py`.
