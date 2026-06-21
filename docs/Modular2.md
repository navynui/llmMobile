# Revised Refactoring Plan – `main.py` Modularisation (v2)

> **Purpose** – Turn the 3 000‑line monolith into a clean, testable package while **preserving every existing API contract**.  
> The new plan addresses the gaps that caused the previous failure: unclear boundaries, missing tests, mutable global state scattered across files, and no guard‑rails for DB migrations.

---

## 1️⃣  High‑Level Architecture

```
llmMobile/
├─ app/                     # FastAPI entry point
│   ├─ __init__.py
│   └─ main.py              # thin router + app creation
│
├─ api/                     # API route definitions (one file per domain)
│   ├─ status.py
│   ├─ chat.py
│   ├─ models.py
│   ├─ comfy.py
│   ├─ gallery.py
│   ├─ benchmarks.py
│   └─ judge.py
│
├─ services/                # Business‑logic “service” layer
│   ├─ docker_svc.py        # container lifecycle, stats
│   ├─ model_svc.py         # preset resolution, load/unload helpers
│   ├─ chat_svc.py          # SSE streaming & direct chat proxy
│   ├─ comfy_svc.py         # workflow loading, image generation pipeline
│   ├─ gallery_svc.py       # CRUD + queue management for the gallery
│   ├─ download_svc.py      # HF model download & registration
│   ├─ benchmark_svc.py     # single‑model & queue execution engine
│   ├─ judge_svc.py         # AI‑Judge query, answer parsing, scoring
│   └─ sse_svc.py           # status‑SSE broadcast & subscriber mgmt
│
├─ utils/                   # pure helpers / shared constants
│   ├─ common.py            # _clean_model_id, get_gold_key, etc.
│   ├─ db_utils.py          # SQLite connection wrapper, migrations
│   ├─ bench_log.py         # benchmark log file rotation & I/O helpers
│   └─ push_svc.py          # VAPID key handling + web‑push helper
│
├─ models/                  # Pydantic request / response schemas
│   ├─ requests.py
│   └─ responses.py
│
└─ tests/                   # test suite (pytest)
    ├─ conftest.py
    ├─ test_status.py
    ├─ test_chat.py
    └─ ... (one file per route)
```

---

## 2️⃣  What Went Wrong in the First Attempt?

| Symptom | Root Cause |
|---------|------------|
| **Endpoint removal broke the frontend** | The original plan removed routes *before* confirming they were still needed. Front‑end expects exact route signatures. |
| **State leaks / race conditions** | Global mutable variables (`_queue_lock`, `_sse_subscribers`) lived in different modules without a clear import contract, causing occasional duplicate instances. |
| **No automated verification** | The test suite was run only *after* the whole refactor; any regression was discovered late, forcing a rollback. |
| **Over‑large “move” tasks** | Extracting 130‑line `judge_benchmark()` into one file created a new single point of failure and made reviews impossible. |
| **Missing documentation & type hints** | New modules lacked docstrings or type annotations, making onboarding error‑prone. |
| **Database migration ambiguity** | Moving DB helpers introduced duplicate connection logic; the previous plan didn’t enforce `ON DELETE CASCADE` checks before inserting new benchmark rows. |

---

## 3️⃣  Guardrails for This Refactor

1. **API Contract Freeze** – Every existing endpoint must still be importable from `/api/*.py`. No route may disappear until the final validation step.
2. **Immutable Public Interface** – Service modules expose only functions declared in `services/__init__.py`. All internal helpers stay private (`_`‑prefixed) and are not imported outside their module.
3. **Database Transaction Discipline**  
   * All writes go through `db_utils.execute()` which wraps the transaction in a `BEGIN … COMMIT` block.  
   * Before inserting a new benchmark row, we automatically purge older rows for the same `model_id` (via foreign‑key cascade).  
4. **Test‑First Checkpoint** – Before touching any code, run the baseline test suite and store the output in `tests/baseline_snapshots/`. After each refactor phase, compare against these snapshots.
5. **Type & Docstring Enforcement** – Every public function gets a docstring and type hints (`def foo(bar: str) -> dict:`). A linter step fails the CI if any public API lacks them.
6. **No Direct Global Imports** – Shared mutable state lives in `utils/common.py` (e.g., `_COMFY_HTTP`). Other modules import it explicitly:
   ```python
   from utils.common import shared_http_client as _COMFY_HTTP
   ```
7. **CI Gate** – The CI pipeline runs:
   * `pytest -q` (all new tests must pass)  
   * `flake8` + `black --check` (no style violations)  
   * `docker compose build llm-mobile && docker compose up -d` sanity check.

---

## 4️⃣  Step‑by‑Step Execution Plan

### Phase 0 – Baseline Capture (0.5 day)
- Run the full test suite (`pytest`) and store each endpoint’s raw response in `tests/baseline_snapshots/`.
- Verify Docker compose builds without errors.

### Phase 1 – Package Skeleton (0.25 day)
- Create the folder structure above.
- Add an empty `__init__.py` to every package.
- Write a **thin** `app/main.py` that only:
  ```python
  from fastapi import FastAPI
  from api.status import router as status_router
  from api.chat import router as chat_router
  # … include all other routers …
  app = FastAPI()
  app.include_router(status_router)
  # … mount the rest …
  ```
- Ensure `docker compose build llm-mobile` still succeeds (no code changes yet).

### Phase 2 – Extract Pure Utilities (0.5 day)
| Module | Tasks |
|--------|-------|
| `utils/common.py` | Move `_clean_model_id`, `_deep_copy`, `get_gold_key`, `parse_judge_json`, VAPID helpers. Add type hints and docstrings. |
| `utils/db_utils.py` | Centralised `get_connection()`, `execute(query, params)`, `run_migration()`; enforce foreign‑key cascade handling. |
| `utils/bench_log.py` | All benchmark log rotation / file I/O helpers. Keep constants (`LOG_DIR = "/app/benchmark_results"`). |
| `utils/push_svc.py` | VAPID key loading, subscription list management, `send_push_notification()`. |

*All extracted functions are **pure** (no FastAPI imports) – safe to move first.*

### Phase 3 – Docker / Server Service (0.5 day)
- Move `_container_info`, `start_llm`, `stop_llm`, `get_system_stats` into `services/docker_svc.py`.  
- Keep a single module‑level `docker_client = docker.from_env()`; expose only the public functions.

### Phase 4 – Model / Preset Service (0.5 day)
- Relocate model preset resolution, `_add_to_models_ini`, `_remove_from_models_ini` into `services/model_svc.py`.  
- Export Pydantic schemas (`ModelLoadRequest`) from `models/requests.py`.

### Phase 5 – Chat & SSE Services (0.75 day)
- **Chat**: Move `/api/chat/completions` proxy + streaming logic to `services/chat_svc.py`. Keep the async context manager but expose only `proxy_chat(request: Request) -> StreamingResponse`.
- **SSE**: Move status‑event handler, subscriber list, broadcast function into `services/sse_svc.py`. Export a singleton `sse_subscribers` for debugging.

### Phase 6 – ComfyUI Image Pipeline (1.25 day)
- Split responsibilities:
  * Workflow loading / building → `comfy_svc.py`
  * Queue management (`_queue_lock`, `_gen_queue`) → `comfy_svc.py` with explicit lock export.
  * Gallery CRUD and side‑car read/write helpers → `gallery_svc.py`.
- Each file only imports what it needs from `utils/common.py` or other service modules.

### Phase 7 – Download & Model Registry (0.5 day)
- Move download request validation, `download_model()`, status tracking into `services/download_svc.py`.  
- Keep the global `_downloads_lock` and `_downloads_list` as module‑level constants exported via `__all__`.

### Phase 8 – Benchmark Engine Refactor (2 days) ⚠️ Critical

**8a – Execution Core (`benchmark_svc.py`)**
- Move `run_benchmark_task()` and `run_benchmark_queue_task()` **exactly as they are**, preserving retry logic, empty‑response handling, and cooldown enforcement.  
- Extract the **retry loop** into a private helper `_execute_with_retries(payload)` that returns either parsed JSON or raises a custom `BenchmarkError`.

**8b – Grading / Judge Service (`judge_svc.py`)**
- Move `query_judge_model()`, `parse_judge_json()` (already in utils) and the entire `/api/benchmarks/judge` endpoint implementation here.  
- This file now contains **all judge‑related logic** but does **not** import any FastAPI request objects; it receives raw strings from `benchmark_svc`.

### Phase 9 – Wire‑Back & Validation (1.5 day)
1. Re‑import each service module in `app/main.py` and expose the original endpoint functions:
   ```python
   @app.get("/status")
   async def status():
       return await docker_svc.get_status()
   # … repeat for every route …
   ```
2. **No new routes are added**; we only replace the function bodies.
3. Run the baseline snapshot comparison (`pytest -q --snapshot-update` – update only if expected output truly changed).
4. Execute a full end‑to‑end benchmark run and verify:
   * All retries succeed for empty responses.  
   * AI‑Judge scoring populates `model_hallucinations` correctly.  
   * Database constraints (`ON DELETE CASCADE`) prune old runs automatically.
5. Run the Docker build sanity check again.

### Phase 10 – Cleanup & Documentation (0.5 day)
- Remove any dead code leftovers from previous monolithic version.  
- Add docstrings to every public function in each service module.  
- Update `README.md` with the new folder layout diagram.

---

## 5️⃣  Checklist Before Merging

| ✅ | Item |
|----|------|
| 1 | All existing API routes still present and returning identical JSON as baseline snapshots. |
| 2 | `docker compose build llm-mobile && docker compose up -d` finishes without errors. |
| 3 | CI passes (`pytest`, `flake8`, `black`). |
| 4 | Database migration script runs cleanly; old benchmark rows for a given `model_id` are pruned before insertion. |
| 5 | No module imports another service’s internal mutable globals directly – all shared state flows through explicit imports from `utils/common.py`. |
| 6 | Documentation (`docs/ARCHITECTURE.md`) reflects the new folder boundaries and migration rules. |

---

## 6️⃣  TL;DR – What to Do Next

1. **Create the directory scaffold** (run `mkdir -p app/api services/utils models tests && touch ...`).  
2. **Copy the baseline snapshots** into `tests/baseline_snapshots/`.  
3. **Implement Phase 1‑Phase 4** tasks in order, committing after each successful Docker rebuild.  
4. After each phase, run the **snapshot comparison test**; if it fails, revert and fix before proceeding.  

Following this disciplined, step‑wise approach eliminates the pitfalls that caused the earlier failure—especially the risk of breaking API contracts and losing visibility into state changes.

--- 

*End of `TODO2.md`* 