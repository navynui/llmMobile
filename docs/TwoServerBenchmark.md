# TODO — Benchmark Support for llama-server-mini (Secondary GPU)

Add a `server` discriminator throughout the benchmark pipeline so models running on the secondary GPU (GTX 1060 / `llama-server-mini`) can be benchmarked, scored, and displayed alongside primary results — with visual distinction in the bubble chart.

---

## 🗃️ Phase 1 — Database Migration

- [x] `ALTER TABLE test_runs ADD COLUMN server TEXT DEFAULT 'primary'`
  - Existing rows default to `'primary'`
  - All new inserts set `server` to either `'primary'` or `'secondary'`

---

## ⚙️ Phase 2 — Backend Helpers (`services/benchmark/runner.py`)

- [x] Add a `_server_config(server: str) -> dict` helper returning:
  - `server_url`: `"http://llm-server:8080"` or `"http://llm-server-mini:8080"`
  - `ini_path`: `MODES_INI_PATH` or `MINI_MODELS_INI`
  - Model-loading function targeting the right server
- [x] **Refactor `run_benchmark_task`** — accept `server: str = "primary"`
  - When `server == "secondary"`: target `llm-server-mini:8080`, use `modelg.ini` presets
  - Judge always targets `llm-server:8080` (unchanged)
  - Insert `server` value into `test_runs` row
- [x] **Refactor `run_benchmark_queue_task`** — accept `server: str = "primary"`
  - Pass `server` down to each iteration
  - Model load/unload uses mini endpoints when `server == "secondary"`
  - Store `server` in DB

---

## 🌐 Phase 3 — API Layer (`services/benchmark/api.py` + `models/requests.py`)

- [x] **Add `server: str = "primary"`** to `BenchmarkRunRequest`
- [x] **Add `server: str = "primary"`** to `BenchmarkQueueRequest`
- [x] Pass `server` through route handlers → runner tasks
- [x] Include `server` in the run response payload

---

## 📖 Phase 4 — Reader (`services/benchmark/reader.py`)

- [x] Include `tr.server` in the `test_runs` join query
- [x] Add `server` + `platform` (per-server label) to each benchmark dict
- [x] Add optional `server` query parameter filter on `/api/benchmarks`
- [x] Scan `MINI_MODELS_INI` for untested (ready) models alongside `MODES_INI_PATH`

---

## 📊 Phase 5 — Benchmark Progress State (`services/benchmark/state.py`)

- [x] Add `"server": "primary"` to `_benchmark_progress`
- [x] Expose `server` in the `/api/benchmarks/status` response

---

## 🎨 Phase 6 — Frontend: Benchmark Tab (`src/components/benchmark-tab/`)

### `_logic.js`
- [x] Add `ctx.selectedBenchmarkServer` state (`'primary'` | `'secondary'`)
- [x] Pass `server` field in `/api/benchmarks/run` POST body
- [x] Pass `server` in `/api/benchmarks/queue/run` POST body
- [x] Fetch and display `server` from benchmark list data

### `_templates.js`
- [x] Server selector pills (Primary / Secondary) next to "Run Benchmark" button
- [x] Show server badge in benchmark table rows
- [x] Show current server in the progress section during a run
- [x] Toggle to populate queue from `modelg.ini` models (secondary) vs `models.ini`

---

## 🔵 Phase 7 — Bubble Chart (`src/components/benchmark-bubble-chart.js`)

- [x] Pass `server` to each data point
- [x] **Dual color scheme:**
  - Primary (Tesla P100): teal/sea-green gradient (current)
  - Secondary (GTX 1060): amber/orange gradient
- [x] Border: solid for primary, dashed for secondary
- [x] Add legend explaining server colors
- [x] Include `server` in tooltip

---

## 📋 Files to Touch

| File | Change |
|---|---|
| `utils/db_utils.py` | Migration SQL for new column |
| `models/requests.py` | `server` field on `BenchmarkRunRequest`, `BenchmarkQueueRequest` |
| `services/benchmark/runner.py` | Parameterize with `server` |
| `services/benchmark/api.py` | Pass `server` through routes |
| `services/benchmark/state.py` | Track `server` in progress |
| `services/benchmark/reader.py` | Return `server`, add filter, scan secondary INI |
| `app/main.py` | Add `server` query param to `/api/benchmarks` |
| `src/components/benchmark-tab/_logic.js` | Server state + API routing |
| `src/components/benchmark-tab/_templates.js` | Server pills, badges, queue toggle |
| `src/components/benchmark-bubble-chart.js` | Dual colors, legend, tooltip |
