# TODO — Modularization of Large Files

> Goal: Split the largest `.py` (service layer) and `.js` (Lit components) files
> into smaller, single-responsibility modules **without changing behavior, API
> contracts, route paths, or visual design.**
>
> This is a refactor (Phase J), not a feature change. Reference `AGENTS.md`
> Phase I rules — same constraints apply here.

---

## 0. Guard Rails (MUST follow every step)

These exist so the app never breaks mid-refactor. Every PR/commit must pass them.

### G1 — Backend verification gate
After **every** Python file move/split, run:
```bash
cd /home/nui/dev/llmMobile
python -c "import app.main"          # import smoke test (no server start)
pytest -q tests/                      # all endpoint tests must stay green
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
- `judge_svc.parse_judge_json`'s ` Reasoning tag-stripping regex must remain
  untouched.
- Path resolution must keep using `utils/common.py` Docker/host fallbacks — no
  new hardcoded paths.
- Database idempotency (delete historical `test_runs` + cascade) stays in
  `benchmark` logic wherever it lands.
- Empty-response retry (3×, 5s) and 10s GPU cooldown stay in benchmark runners.

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

---

## 1. Candidates (by size, largest first)

| File | Lines | Type | Action |
|---|---|---|---|
| `src/components/benchmark-tab.js` | 1293 | JS  | Split |
| `src/components/chat-tab.js`       | 1231 | JS  | Split |
| `src/components/gallery-tab.js`    | 915  | JS  | Split |
| `services/benchmark_svc.py`        | 864  | PY  | Split |
| `src/components/server-tab.js`     | 731  | JS  | Split |
| `services/comfy_svc.py`            | 705  | PY  | Split |
| `src/llm-app.js`                   | 654  | JS  | Split |
| `src/components/model-downloader.js`| 580 | JS  | Split |
| `services/download_svc.py`         | 489  | PY  | Split |
| `src/components/models-config-editor.js` | 480 | JS | Split |
| `src/components/generator-tab.js`  | 460  | JS  | Split |
| `services/judge_svc.py`            | 331  | PY  | Review (borderline — only split if natural seams exist) |

Files **not** targeted: `app/main.py` (already a thin façade per AGENTS.md Phase G),
small services (`chat_svc.py`, `sse_svc.py`, `docker_svc.py`, `gallery_svc.py`,
`push_svc.py`, `model_svc.py`), primitives, and utils.

---

## 2. Backend Plan (services/*.py)

### 2A. `services/benchmark_svc.py` → `services/benchmark/` package
Seams observed (function groups):
- **logging** — `log_benchmark_progress`, `log_benchmark_error`, `log_benchmark`
- **state** — `get_benchmark_progress/running/lock`, `set_benchmark_running`
- **runner** — `run_benchmark_task`, `run_benchmark_queue_task` (retry + cooldown + idempotency live here — G5)
- **readers** — `get_benchmarks`, `get_benchmark_details`, `get_benchmark_logs`, `get_benchmark_outputs`
- **api entry** — `run_benchmark`, `run_benchmark_queue`

Proposed package:
```
services/benchmark/
  __init__.py        # re-exports every public name (compat shim for benchmark_svc)
  logging.py
  state.py
  runner.py          # run_benchmark_task, run_benchmark_queue_task
  reader.py          # get_benchmarks, details, logs, outputs
  api.py             # run_benchmark, run_benchmark_queue
services/benchmark_svc.py  # kept as thin re-export shim (G4), deleted only at cleanup
```
`app/main.py` keeps `from services.benchmark_svc import ...` unchanged → zero router edits.

### 2B. `services/comfy_svc.py` → `services/comfy/` package
Seams:
- **client** — `get_comfy_http`, `set_comfy_http`
- **workflow** — `_load_workflow`, `_build_workflow`
- **comfyio** — `_free_comfy_cache`, `_queue_comfy`, `_wait_comfy`, `_get_comfy_history`, `_write_sidecar`
- **queue_state** — locks, `is_queue_running`, snapshot, persist (load/save), SSE subscribers, `broadcast_queue`
- **worker** — `_run_subtask`, `check_llama_cpp_idle`, `swap_vram_for_generation`, `queue_worker`
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
Seams:
- **state** — `init_download_queue`, queue, progress dicts
- **worker** — `download_queue_worker`, `_download_model_task`
- **hf** — `search_hf_models`, `get_hf_model_details`, `get_quantization_from_name`
- **api** — `download_model`, `get_downloads_status`, `stop/resume/cancel_download`, `clear_finished_downloads`, `scan_and_register_models`

Proposed:
```
services/download/
  __init__.py        # re-export shim
  state.py
  worker.py
  hf.py
  api.py
services/download_svc.py  # thin re-export shim
```

### 2D. `services/judge_svc.py` (borderline)
Only split if a clean seam exists between **gold-answer loading** (`get_gold_*`,
`load_raw_json`, `get_gold_answers`) and **judge execution** (`parse_judge_json`,
`query_judge_model`, `judge_benchmark`). Keep `parse_judge_json` exactly as-is (G5).
Proposed:
```
services/judge/
  __init__.py
  gold.py
  judge.py
services/judge_svc.py  # thin re-export shim
```
If the split risks touching the regex, **skip** this file and leave a note.

---

## 3. Frontend Plan (src/components/*.js)

### General split pattern for Lit components
For a component `X-tab.js`, extract into a sibling folder `X-tab/`:
```
src/components/X-tab.js           # main class: state + render() + lifecycle (kept)
src/components/X-tab/_styles.js   # static styles (css`...`) — exported, imported
src/components/X-tab/_logic.js    # pure helper functions (api calls, transforms)
src/components/X-tab/_templates.js# render sub-templates (functions returning html`...`)
```
Rules:
- Main class file imports `_styles`, `_logic`, `_templates`.
- `_templates.js` functions take explicit args (no closures over `this`) — pass
  needed state/handlers as params. Keeps them pure & testable.
- No new `customElements.define` calls; the tag stays in the main file.
- Keep using `apiFetch/apiPost/apiDelete` from `src/utils/api.js` (AGENTS Phase I #2).
- Icons stay imported from `src/assets/icons.js` (no inline SVG).

### 3A. `benchmark-tab.js` (1293)
- `_styles.js`, `_logic.js` (queue building, status polling, SSE handling),
  `_templates.js` (`renderTable`, `renderRunner`, `renderProgress`, `renderLog`).
- Main file keeps `<benchmark-tab>` orchestration + `<benchmark-table>`/`<benchmark-runner>` composition.

### 3B. `chat-tab.js` (1231)
- `_styles.js`, `_logic.js` (stream parsing, context/messages state, send logic),
  `_templates.js` (`renderMessages`, `renderInput`, `renderComposer`).
- Markdown rendering helper extracted to `_logic.js`.

### 3C. `gallery-tab.js` (915)
- `_styles.js`, `_logic.js` (folder browsing, metadata fetch, delete/move),
  `_templates.js` (`renderGrid`, `renderViewer`, `renderInspector`).

### 3D. `server-tab.js` (731)
- `_styles.js`, `_logic.js` (status polling, SSE, INI save/scan),
  `_templates.js` (`renderStatus`, `renderModelsConfig`, `renderDownloader`, `renderLogs`).
- Already composes child components — keep delegation, just extract templates/styles/logic.

### 3E. `llm-app.js` (654) — SPA shell
- `_styles.js`, `_router.js` (view switching logic), `_templates.js` (nav + view
  render), `_sse.js` (global SSE client wiring).
- Keep `LlmApp` class + `<toast-host>` mount in main file.

### 3F. `model-downloader.js` (580)
- `_styles.js`, `_logic.js` (HF search, download queue polling), `_templates.js`.

### 3G. `models-config-editor.js` (480)
- `_styles.js`, `_logic.js` (INI parse/serialize, scan/delete), `_templates.js`.

### 3H. `generator-tab.js` (460)
- `_styles.js`, `_logic.js` (workflow param mapping, aspect-ratio presets, queue submit),
  `_templates.js`.

---

## 4. Execution Order (do smallest risk first)

1. **Backend: `download_svc.py`** (cleanest seams, isolated) — validate G1 pattern.
2. **Backend: `comfy_svc.py`** — shared state caution; validate shim pattern.
3. **Backend: `benchmark_svc.py`** — retry/cooldown/idempotency (G5); highest care.
4. **Backend: `judge_svc.py`** — only if regex stays untouched; else skip.
5. **Frontend: `generator-tab.js`** — smallest JS, validate split pattern.
6. **Frontend: `models-config-editor.js`**, then `model-downloader.js`.
7. **Frontend: `llm-app.js`** — router extraction; high blast radius, do with care.
8. **Frontend: `server-tab.js`**, `gallery-tab.js`, `chat-tab.js`, `benchmark-tab.js` (largest last).
9. **Final cleanup**: remove compat shims (G4) once all callers migrated, re-run G1+G2+G7.
10. Update `AGENTS.md` Layout section to reflect new module tree.

---

## 5. Definition of Done

- [ ] Every original large file either split into a package/folder **or** documented as intentionally kept.
- [ ] `python -c "import app.main"` clean.
- [ ] `pytest -q tests/` — 9/9 green (or more, never fewer).
- [ ] `npm run build` — zero Vite errors; zero Lit console warnings.
- [ ] Public surface diff (G6) identical for every split file.
- [ ] Route paths, HTTP methods, response shapes, component tag names, event payloads unchanged.
- [ ] Docker rebuild (G7) succeeds and app boots.
- [ ] `AGENTS.md` layout section updated.
- [ ] No compat shims remain (or, if kept, explicitly listed as intentional).
