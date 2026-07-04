# TODO — Modularization of Large Files

> Goal: Split the largest `.py` (service layer) and `.js` (Lit components) files
> into smaller, single-responsibility modules **without changing behavior, API
> contracts, route paths, or visual design.**
>
> This is a refactor (Phase J), not a feature change. Reference `AGENTS.md`
> Phase I rules — same constraints apply here.
>
> **Current gate status:** `python -c "import app.main"` ✅, `pytest -q tests/`
> **9 passed** ✅, `npm run build` ✅. Any split must keep these green.

---

## 0. Guard Rails (MUST follow every step)

These exist so the app never breaks mid-refactor. Every PR/commit must pass them.

### G1 — Backend verification gate
After **every** Python file move/split, run:
```bash
cd /home/nui/dev/llmMobile
python -c "import app.main"          # import smoke test (no server start)
python -m pytest -q tests/            # all endpoint tests must stay green
```
- Baseline test count: **9** tests in `tests/test_endpoints.py`. Count must not drop.
- If `import app.main` raises, the commit is broken — revert immediately.
- Never change route paths, HTTP methods, or response JSON shapes during a split.

### G2 — Frontend verification gate
After **every** `.js` file move/split, run:
```bash
cd /home/nui/dev/llmMobile
npm run build                         # Vite must bundle with zero errors
```
- Then manually check the browser console for Lit warnings (unclosed templates,
  duplicate attribute bindings). Fix before continuing.
- Never alter a component's tag name (`customElements.define`), public properties,
  or emitted `CustomEvent` `detail` payloads.

### G3 — One-file-at-a-time
Split **one** large file per commit. Run G1/G2 after each. Do not batch multiple
file splits into a single commit — if the gate fails, bisect is impossible.

### G4 — Preserve re-export shims
When moving a function/class out of a large file, **leave a re-export** in the
original module so existing callers keep working:
```python
# services/benchmark_svc.py  (after extraction)
from services.benchmark.runner import run_benchmark_task  # noqa: F401 (compat shim)
```
```js
// src/components/benchmark-tab.js  (after extraction)
export { runBenchmarkQueue } from './benchmark-tab/_logic.js';
```
Shims may be removed only in a final cleanup pass *after* all callers are migrated
and the gate passes.

### G5 — Import invariants (from AGENTS.md)
- `import traceback` stays at the top of `app/main.py` and any service that logs
  exceptions.
- `judge_svc.parse_judge_json`'s `<think>...</think>` tag-stripping regex must
  remain untouched.
- Path resolution must keep using `utils/common.py` Docker/host fallbacks — no
  new hardcoded paths.
- Database idempotency (delete historical `test_runs` + cascade) stays in
  `benchmark` logic wherever it lands.
- Empty-response retry (3×, 5 s) and 10 s GPU cooldown stay in benchmark runners.
- VRAM capture/idle-trigger logic lives in `services/vram_svc.py`; keep it as a
  shared dependency — do not duplicate it inside other services.

### G6 — Snapshot diff
Before splitting a file, capture a behavior snapshot:
```bash
git stash list   # ensure clean tree
# record the public surface
grep -nE "^(def |async def |class |customElements.define|@app\.)" <file> > /tmp/<file>.surface.before
```
After the split, regenerate and diff — the public surface must be byte-identical.

### G7 — Docker rebuild gate (final)
Before considering the phase done:
```bash
cd /home/nui/llmaCPP
docker compose build llm-mobile
docker compose up -d --no-deps llm-mobile
# hit a couple endpoints to confirm runtime wiring:
curl -s localhost:8080/status   # via the app's reverse proxy as configured
```

### G8 — Respect already-extracted Phase I components
Some refactor work has already landed. Do **not** re-absorb these into their
parents unless you are splitting their internals:
- `src/components/server-status-card.js` and `server-logs.js` (children of `server-tab`)
- `src/components/benchmark-bubble-chart.js` (child of `benchmark-tab`)
- `src/components/data-table.js` (already generic; only split if it grows)
- `src/utils/op-queue.js` (already a standalone offline-operation utility)

---

## 1. Candidates (by size, largest first)

| File | Lines | Type | Status / Action |
|---|---|---|---|
| `src/components/benchmark-tab.js` | 1367 | JS  | Split — largest component; imports `benchmark-bubble-chart.js` |
| `src/components/chat-tab.js`    | 1231 | JS  | Split |
| `src/components/gallery-tab.js` | 915  | JS  | Split |
| `services/benchmark_svc.py`     | 898  | PY  | Split — highest backend risk (G5) |
| `services/comfy_svc.py`         | 797  | PY  | Split — shared state caution |
| `src/llm-app.js`                | 654  | JS  | Split — router + SSE blast radius |
| `src/components/server-tab.js`  | 726  | JS  | Split — already an orchestrator; extract styles/logic/templates only |
| `services/download_svc.py`      | 489  | PY  | Split — cleanest seams; good pilot |
| `src/components/model-downloader.js` | 580 | JS | Split |
| `src/components/models-config-editor.js` | 480 | JS | Split |
| `src/components/generator-tab.js` | 478 | JS  | Split — smallest JS candidate |
| `src/components/benchmark-bubble-chart.js` | 291 | JS | Optional — split into `_data.js`/`_templates.js` if refactored |
| `src/components/data-table.js`  | 247  | JS  | Keep whole (generic and already small) |
| `services/judge_svc.py`         | 331  | PY  | Optional — only if regex stays untouched; otherwise document as kept |
| `services/vram_svc.py`          | 155  | PY  | Keep whole (small shared dependency) |
| `app/main.py`                   | 340  | PY  | Keep whole (thin façade); convert to `APIRouter`s only if it grows |
| `main.py` (repo root)           | —    | PY  | Keep whole; appears to be a launcher stub |

Files **not** targeted: small services (`chat_svc.py`, `sse_svc.py`, `docker_svc.py`,
`gallery_svc.py`, `push_svc.py`, `model_svc.py`), primitives, and most utils.

### 1A. Cross-cutting clean-ups to do first
These make the targeted splits cleaner and are safe because they only move code,
not behavior.

1. **Deduplicate `get_quantization_from_name`**  
   It currently exists in both `services/download_svc.py` and `services/judge_svc.py`.
   Move the canonical implementation to `utils/common.py` (or a new
   `utils/model_naming.py`), then re-export it from both services as a compat shim
   (G4). This lets `download/` and `judge/` packages import the same helper without
   cross-imports.

2. **Clarify `services/vram_svc.py` as a shared leaf**  
   `benchmark_svc`, `model_svc`, and `sse_svc` already import from it. Any new
   package must keep importing `vram_svc` as a leaf; never import `benchmark`
   from `vram_svc` or vice-versa, to avoid circular dependencies.

---

## 2. Backend Plan (services/*.py)

### 2A. `services/benchmark_svc.py` → `services/benchmark/` package
Current public surface:
```text
log_benchmark_progress, log_benchmark_error, log_benchmark
get_benchmark_progress, get_benchmark_running, get_benchmark_lock, set_benchmark_running
run_benchmark_task
run_benchmark_queue_task
get_benchmarks, get_benchmark_details, get_benchmark_logs, get_benchmark_outputs
run_benchmark, run_benchmark_queue
```

Seams:
- **logging** — `log_benchmark_progress`, `log_benchmark_error`, `log_benchmark`
- **state** — `get_benchmark_progress/running/lock`, `set_benchmark_running`
- **runner** — `run_benchmark_task`, `run_benchmark_queue_task`
  (retry + cooldown + DB idempotency live here — G5)
- **reader** — `get_benchmarks`, `get_benchmark_details`, `get_benchmark_logs`, `get_benchmark_outputs`
- **api entry** — `run_benchmark`, `run_benchmark_queue`

Dependencies to preserve:
- `runner.py` imports `services.vram_svc.capture_and_store_vram`, `wait_for_idle_trigger`
- `runner.py` imports `services.chat_svc._get_loaded_model`
- `runner.py` imports `services.model_svc._get_preset_id_for_model`
- `api.py` uses `fastapi.BackgroundTasks`
- shared `get_quantization_from_name` moves to `utils` after clean-up #1

Proposed package:
```
services/benchmark/
  __init__.py        # re-exports every public name (compat shim for benchmark_svc)
  logging.py
  state.py
  runner.py
  reader.py
  api.py
services/benchmark_svc.py  # kept as thin re-export shim (G4), deleted only at cleanup
```
`app/main.py` keeps `from services.benchmark_svc import ...` unchanged → zero router edits.

### 2B. `services/comfy_svc.py` → `services/comfy/` package
Current public surface:
```text
get_comfy_http, set_comfy_http
_load_workflow, _build_workflow
_free_comfy_cache, _queue_comfy, _wait_comfy, _get_comfy_history, _write_sidecar
get_queue_lock, get_gen_queue
is_queue_running, set_queue_running
get_queue_sse_subscribers
get_queue_snapshot
save_queue_to_disk, load_persisted_queue
broadcast_queue
_run_subtask, _cancel_pending_cooldown
check_llama_cpp_idle, swap_vram_for_generation
_reload_llama_model, _post_queue_cleanup
queue_worker
submit_to_queue, get_queue, cancel_queue_item, clear_completed, stream_queue
```

Seams:
- **client** — `get_comfy_http`, `set_comfy_http`
- **workflow** — `_load_workflow`, `_build_workflow`
- **comfyio** — `_free_comfy_cache`, `_queue_comfy`, `_wait_comfy`, `_get_comfy_history`, `_write_sidecar`
- **queue_state** — locks, `is_queue_running`, snapshot, persist (load/save), SSE subscribers, `broadcast_queue`, `get_gen_queue`, `get_queue_lock`
- **worker** — `_run_subtask`, `_cancel_pending_cooldown`, `check_llama_cpp_idle`, `swap_vram_for_generation`, `_reload_llama_model`, `_post_queue_cleanup`, `queue_worker`
- **api** — `submit_to_queue`, `get_queue`, `cancel_queue_item`, `clear_completed`, `stream_queue`

Proposed package:
```
services/comfy/
  __init__.py        # re-export shim
  client.py
  workflow.py
  comfyio.py
  queue_state.py
  worker.py
  api.py
services/comfy_svc.py  # thin re-export shim
```
Note: shared module-level state (`_http_client`, `_queue`, locks) must live in
**one** module (`queue_state.py` / `client.py`) and be imported, not duplicated.

### 2C. `services/download_svc.py` → `services/download/` package
Current public surface:
```text
init_download_queue
get_quantization_from_name   # → move to utils (see §1A) and re-export
search_hf_models, get_hf_model_details
download_queue_worker, _download_model_task
download_model, get_downloads_status
stop_download, resume_download, cancel_download, clear_finished_downloads
scan_and_register_models
```

Seams:
- **state** — `init_download_queue`, queues, progress dicts
- **hf** — `search_hf_models`, `get_hf_model_details`
- **worker** — `download_queue_worker`, `_download_model_task`
- **api** — `download_model`, `get_downloads_status`, `stop/resume/cancel_download`, `clear_finished_downloads`, `scan_and_register_models`

Proposed:
```
services/download/
  __init__.py        # re-export shim
  state.py
  hf.py
  worker.py
  api.py
services/download_svc.py  # thin re-export shim
```

### 2D. `services/judge_svc.py` (optional, low priority)
Current public surface:
```text
get_llm_server_url
get_gold_key, get_gold_answers, load_raw_json
get_quantization_from_name   # → move to utils (see §1A) and re-export
parse_judge_json             # DO NOT TOUCH (G5)
query_judge_model
judge_benchmark
```

If splitting, use this seam:
- **gold** — `get_gold_key`, `get_gold_answers`, `load_raw_json`
- **judge** — `parse_judge_json`, `query_judge_model`, `judge_benchmark`

Proposed:
```
services/judge/
  __init__.py
  gold.py
  judge.py
services/judge_svc.py  # thin re-export shim
```
**Skip entirely** if any edit risks touching the `parse_judge_json` regex. Leave
a note in this file documenting the decision.

### 2E. Files intentionally kept whole
- `services/vram_svc.py` — small leaf dependency used by multiple services; no
  need to split.
- `services/model_svc.py` (239 lines) — already chunked enough; splitting is optional.
- `app/main.py` — thin router; keep façade to avoid route churn. If it grows
  past 500 lines, consider per-domain FastAPI `APIRouter`s in a future phase.

---

## 3. Frontend Plan (src/components/*.js)

### General split pattern for Lit components
For a component `X-tab.js`, extract into a sibling folder `X-tab/`:
```
src/components/X-tab.js           # main class: state + render() + lifecycle
src/components/X-tab/_styles.js   # static styles (css`...`)
src/components/X-tab/_logic.js    # pure helper functions (api calls, transforms)
src/components/X-tab/_templates.js# render sub-templates (functions returning html`...`)
```
Rules:
- Main class file imports `_styles`, `_logic`, `_templates`.
- `_templates.js` functions take explicit args (no closures over `this`). Pass
  needed state/handlers as parameters to keep them pure and testable.
- No new `customElements.define` calls; the tag stays in the main file.
- Keep using `apiFetch/apiPost/apiDelete` from `src/utils/api.js` (AGENTS Phase I #2).
- Icons stay imported from `src/assets/icons.js` (no inline SVG).
- Do **not** duplicate primitives that already live in `_primitives.js`.

### 3A. `benchmark-tab.js` (1367 lines)
- `_styles.js`, `_logic.js` (queue building, status polling, SSE handling, bubble-click handlers),
  `_templates.js` (`renderTable`, `renderRunner`, `renderProgress`, `renderLog`, details modal).
- Main file keeps `<benchmark-tab>` orchestration and the child `<benchmark-bubble-chart>`
  composition; do not re-inline the chart (G8).

### 3B. `chat-tab.js` (1231 lines)
- `_styles.js`, `_logic.js` (stream parsing, context/messages state, send logic),
  `_templates.js` (`renderMessages`, `renderInput`, `renderComposer`).
- Markdown rendering helper extracted to `_logic.js`.

### 3C. `gallery-tab.js` (915 lines)
- `_styles.js`, `_logic.js` (folder browsing, metadata fetch, delete/move),
  `_templates.js` (`renderGrid`, `renderViewer`, `renderInspector`).

### 3D. `server-tab.js` (726 lines)
- `_styles.js`, `_logic.js` (status polling, SSE, INI save/scan),
  `_templates.js` (`renderStatus`, `renderModelsConfig`, `renderDownloader`, `renderLogs`).
- Already composes child components (`server-status-card`, `models-config-editor`,
  `model-downloader`, `server-logs`) — keep delegation, just extract its own
  styles/logic/templates.

### 3E. `llm-app.js` (654 lines) — SPA shell
- `_styles.js`, `_router.js` (view switching logic), `_templates.js` (nav + view
  render), `_sse.js` (global SSE client wiring).
- Keep `LlmApp` class + `<toast-host>` mount in main file.

### 3F. `model-downloader.js` (580 lines)
- `_styles.js`, `_logic.js` (HF search, download queue polling), `_templates.js`.

### 3G. `models-config-editor.js` (480 lines)
- `_styles.js`, `_logic.js` (INI parse/serialize, scan/delete), `_templates.js`.

### 3H. `generator-tab.js` (478 lines)
- `_styles.js`, `_logic.js` (workflow param mapping, aspect-ratio presets, queue submit),
  `_templates.js`.

### 3I. Files intentionally kept whole
- `src/components/data-table.js` (247 lines) — already generic and focused.
- `src/utils/op-queue.js` (104 lines) — already a standalone utility.
- `src/components/_primitives.js`, `_confirm.js`, `toast-host.js` — primitive
  components by design.

---

## 4. Execution Order (do smallest risk first)

Always run G1 or G2 after each step.

1. **Cross-cutting:** centralize `get_quantization_from_name` in `utils/` (§1A).
2. **Backend: `download_svc.py`** (cleanest seams, isolated) — validate G1 pattern.
3. **Backend: `comfy_svc.py`** — shared state caution; validate shim pattern.
4. **Backend: `benchmark_svc.py`** — retry/cooldown/idempotency (G5); highest care.
5. **Backend (optional): `judge_svc.py`** — only if regex stays untouched; else skip.
6. **Frontend: `generator-tab.js`** — smallest JS, validate split pattern.
7. **Frontend: `models-config-editor.js`**, then `model-downloader.js`.
8. **Frontend: `server-tab.js`** — templates/styles only; child components already extracted.
9. **Frontend: `llm-app.js`** — router extraction; high blast radius, do with care.
10. **Frontend: `gallery-tab.js`**, `chat-tab.js`.
11. **Frontend: `benchmark-tab.js`** (largest last; chart already extracted).
12. **Final cleanup**: remove compat shims (G4) once all callers migrated, re-run
    G1 + G2 + G7.
13. Update `AGENTS.md` Layout section to reflect the new module tree.

---

## 5. Definition of Done

- [x] Cross-cutting cleanup from §1A applied and gates pass.
- [x] Every original large file either split into a package/folder **or** documented as intentionally kept.
- [x] `python -c "import app.main"` clean.
- [x] `python -m pytest -q tests/` — 9/9 green (or more, never fewer).
- [x] `npm run build` — zero Vite errors; zero Lit console warnings.
- [x] Public surface diff (G6) identical for every split file.
- [x] Route paths, HTTP methods, response shapes, component tag names, event payloads unchanged.
- [x] Docker rebuild (G7) succeeds and app boots.
- [x] `AGENTS.md` layout section updated.
- [x] No compat shims remain (or, if kept, explicitly listed as intentional).
