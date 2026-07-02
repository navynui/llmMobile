# TODO.md — VRAM Integration & Interactive Bubble Chart (Unified)

## Objective
Enhance the existing LLM benchmark web application to collect, store, and visualize VRAM usage.
Render an interactive 2D Bubble Chart above the benchmark data table mapping:
- **X-Axis:** VRAM (GB)
- **Y-Axis:** Overall Score
- **Color:** Inference Speed (15 → 85 token/s sequential gradient)
- **Stroke:** `status == 'good'` (solid) vs `status == 'testing'` (dashed)

*Constraints:* Do **not** alter the current Rankings table column layout. Any extra model data (VRAM, status, etc.) must be displayed as additional chips/badges inside the existing single Model column, not as new columns.

---

## 1. Database Schema Migration

- [ ] 1.1 Create migration file `migrations/001_add_vram_gb_and_status.sql`
  - Add column `vram_gb REAL` to `models` table (nullable).
  - Ensure `status` column exists on `models` with default `'testing'` (normalize to lowercase for API consistency).
- [ ] 1.2 Run migration against the active SQLite database (`llm_bench.db`).
  - Dev path: `/home/nui/llmaCPP/llm_bench.db`
  - Docker path: `/app/llm_bench.db`
- [ ] 1.3 Update `utils/db_utils.py` `consolidate_database()` so the deduplication INSERT preserves the newly added `vram_gb` and `status` columns.

---

## 2. Backend VRAM Collection Service (Unified)

*Rationale:* The app already maintains live `vram_percent` in `docker_svc.py` via `_local_stats_poller()` and MQTT. **Do not** duplicate this by spawning new `nvidia-smi` processes. Instead, read from the existing `get_system_stats()` source-of-truth, compute GB, and store per-model via a centralized VRAM service.

### 2.1 Create `services/vram_svc.py` — Centralized VRAM Management

- [ ] Implement `get_model_vram_gb()` helper:
  - Call the existing `get_system_stats()` from `docker_svc.py`.
  - Extract `vram_percent` (if missing or `0.0`, return `None`).
  - Compute `vram_gb = (vram_percent / 100) * VRAM_TOTAL_GB` (configurable via `utils/common.py`).
  - Return the computed `vram_gb`.
- [ ] Implement `capture_and_store_vram(model_id, status='good')` helper:
  - Call `get_model_vram_gb()`.
  - Update the `models` table row for `model_id` with `vram_gb` and `status`.
  - Handle DB fallback paths via `utils/db_utils.py`.
  - **Idempotent:** Only captures once per model transition to idle state.

### 2.2 Add Idle Log Trigger Monitor (Unified)

- [ ] Create `await wait_for_idle_trigger(log_client, timeout=120)` coroutine in `services/vram_svc.py` or `services/docker_svc.py`:
  - Poll the server logs (via `get_logs()` or streaming) for `"update_slots: all slots are idle"` or `"all slots are idle"`.
  - Return `True` when trigger is found, `False` on timeout.
  - **Unifies:** The duplicated waiting logic currently planned for both `model_svc.py` and `benchmark_svc.py`.

### 2.3 Integrate VRAM Capture into Benchmark Flow

- [ ] Update `services/benchmark_svc.py` `run_benchmark_task`:
  - **Remove** any separate log-trigger waiting code.
  - **After** the initial active-model validation and before starting rounds:
    1. Call `await wait_for_idle_trigger(...)`.
    2. Wait 2–3 seconds for VRAM allocation to settle.
    3. Call `await capture_and_store_vram(model_id, status='good')`.
  - **Remove** the 10-second cooldown between rounds (already present, keep as-is).
- [ ] Update `services/benchmark_svc.py` `run_benchmark_queue_task`:
  - **Remove** any separate log-trigger waiting code.
  - **After** the existing `for _ in range(60)` loop confirms the model is loaded and *before* starting the benchmark rounds:
    1. Call `await wait_for_idle_trigger(...)`.
    2. Wait 2 seconds for VRAM allocation to settle.
    3. Call `await capture_and_store_vram(model_id, status='good')`.
  - Keep the existing 10-second cooldown between models in the queue.

### 2.4 Integrate VRAM Capture into Model Load Flow

- [ ] Update `services/model_svc.py` `proxy_llm_load`:
  - After receiving a **200 OK** response, spawn a lightweight background coroutine that:
    1. Calls `await wait_for_idle_trigger(...)`.
    2. Waits 2–3 seconds for VRAM allocation to settle.
    3. Calls `await capture_and_store_vram(model_id, status='good')`.
  - **Track** which models have already captured VRAM to avoid redundant updates.

### 2.5 Update API Response Payloads

- [ ] Update `services/benchmark_svc.py` `get_benchmarks(show_all)`:
  - Modify the CTE query to explicitly `SELECT m.vram_gb, m.status`.
  - Include `vram_gb` and `status` in every object returned in the `benchmarks` array.
  - Example payload addition per item:
    ```json
    {
      "model_id": "...",
      "model": "...",
      "platform": "...",
      "quant": "...",
      "tokens_sec": 42.5,
      "score": 87,
      "vram_gb": 8.2,
      "status": "good",
      "is_ready": true,
      "is_tested": true
    }
    ```

### 2.6 Normalize `status` Values

- [ ] Map existing DB values (`TESTING`, `FAILED`, `completed`) to lowercase API contract (`testing`, `failed`, `completed`, `good`).
- [ ] Ensure frontend checks use the lowercase contract specified in the brief (`'good'`, `'testing'`).

---

## 3. Frontend — Chart Library Bootstrap

- [ ] 3.1 Add `chart.js` to `package.json` dependencies.
- [ ] 3.2 Run `npm install` to install Chart.js.
- [ ] 3.3 Verify `npm run build` succeeds after dependency addition.

---

## 4. Frontend — Bubble Chart Component

- [ ] 4.1 Create `src/components/benchmark-bubble-chart.js`
  - Extend `LitElement`.
  - Import `Chart` from `chart.js/auto`.
  - Properties: `benchmarks` (Array), `highlightedModelId` (String).
- [ ] 4.2 Implement Chart.js configuration inside `render()` / `createChart()`:
  - Type: `'bubble'` (or `'scatter'` with fixed `pointRadius`).
  - X-axis: `vram_gb` (GB). Handle `null` by filtering out or placing at `x: 0`.
  - Y-axis: `score` (overall score). Handle `null` gracefully.
  - Bubble radius: constant `10px` (do not scale by speed).
  - Bubble background color: continuous sequential gradient mapped from `tokens_sec`:
    - 15 token/s → pale/light tone (e.g., `#e5e7eb`)
    - 85 token/s → deep green/teal (e.g., `#0d9488` or `#14b8a6`)
    - Interpolate linearly based on `tokens_sec`.
  - Bubble border width/style:
    - `status === 'good'` → solid border, width `1.5`.
    - `status === 'testing'` → dashed/dotted border (`[5, 5]` dash pattern), distinct style.
  - Tooltips: display `model_name` (full verbose string), `quantization`, `vram_gb`, `score`, `tokens_sec` without line-wrapping constraints.
- [ ] 4.3 Add interaction handlers:
  - `onClick` on bubbles: dispatch `CustomEvent('bubble-click', { detail: { model_id }, bubbles: true, composed: true })`.
  - `onHover` (or Chart.js `onHover`): update `highlightedModelId` property to enable dimming from the table side.

---

## 5. Frontend — Benchmark Tab Integration

- [ ] 5.1 Update `src/components/benchmark-tab.js`
  - Import `BenchmarkBubbleChart` from `./benchmark-bubble-chart.js`.
  - Import any new icons from `src/assets/icons.js` if needed.
- [ ] 5.2 Layout change in `renderBenchmarksView()`:
  - Insert `<benchmark-bubble-chart>` directly above the `<div class="card">` containing the ranking table.
  - Bind `.benchmarks="${list}"` and `@bubble-click="${this.handleBubbleClick}"`.
  - Bind `.highlightedModelId="${this.highlightedModelId}"` (new property).
- [ ] 5.3 Add new properties to `BenchmarkTab`:
  - `highlightedModelId: { type: String }` — tracks which bubble/row is active.
- [ ] 5.4 Implement `handleBubbleClick(e)`:
  - Read `e.detail.model_id`.
  - Set `this.highlightedModelId = model_id`.
  - Scroll the corresponding `<tr>` in the table into view using `scrollIntoView({ behavior: 'smooth', block: 'center' })`.
  - Apply temporary visual highlight (e.g., add a CSS class that flashes background) and clear after 1.5s.
- [ ] 5.5 Implement table → chart hover linkage:
  - Add `@mouseenter` and `@mouseleave` on each `<tr>` in the benchmark table.
  - On `mouseenter`, set `this.highlightedModelId = b.model_id`.
  - On `mouseleave`, set `this.highlightedModelId = ''`.
  - In `benchmark-bubble-chart`, dim non-highlighted bubbles (lower opacity) when `highlightedModelId` is set.
- [ ] 5.6 Add CSS for highlight/dim effects in `benchmark-tab.js`:
  - `.row-highlighted` with a subtle teal/primary glow.
  - Chart dimming via opacity transition on non-active points.

---

## 6. Build Safety & Verification

- [ ] 6.1 Run `npm run build` and fix any Vite / Lit template errors.
- [ ] 6.2 Run backend test suite (`pytest` or equivalent) to ensure no regressions in `app/main.py` or service imports.
- [ ] 6.3 Start the FastAPI server and call `GET /api/benchmarks` to confirm `vram_gb` and `status` appear in the JSON.
- [ ] 6.4 Load a model via the UI and verify VRAM is captured and persisted to SQLite.
- [ ] 6.5 Verify the bubble chart renders above the table with correct colors, axes, and stroke styles.
- [ ] 6.6 Verify bidirectional highlighting (chart click → table scroll, table hover → chart dim).

---

## 7. Bubble Chart Scope & Filtering

- [ ] 7.1 **Filter data source to `models.ini` only.** The chart should not display all historical models; only those currently listed in `models.ini` should appear as bubbles.
- [ ] 7.2 Keep the chart reactive: when `models.ini` changes (models added/removed), the bubble chart should re-render with the updated set.
- [ ] 7.3 Ensure the chart gracefully handles models that are listed in `models.ini` but have no benchmark data yet (e.g., hide or show at origin with a different style).

---

## 8. Rankings Table Structure Preservation

- [ ] 8.1 **Do not add new columns** to the existing LLM Benchmark Scores & Rankings table.
- [ ] 8.2 Any additional model info (VRAM, status, etc.) must be rendered as extra chips/badges inside the existing single Model column, alongside the current Quant / Speed / Score chips.
- [ ] 8.3 Ensure none of the new chips break sorting, filtering, or pagination logic on the original column set.

---

## Unified Optimization Notes

### Code Deduplication Summary

| Original TODO Item(s) | Unified In | Change |
|----------------------|------------|--------|
| 2.1 (helper in docker_svc or vram_svc) | **2.1 `services/vram_svc.py`** | Created dedicated VRAM service |
| 2.2 (model_svc.py VRAM capture) | **2.4 `proxy_llm_load` integration** | Background coroutine pattern |
| 2.3 (benchmark_svc.py queue + single) | **2.3 `benchmark_svc.py` unified** | Both tasks use same `wait_for_idle_trigger()` and `capture_and_store_vram()` |
| Duplicate log-trigger waiting | **2.2 `wait_for_idle_trigger()`** | Single reusable coroutine |
| Duplicate retry logic | **Already in code** | No change needed (existing 3x retry pattern) |
| Duplicate DB cleanup | **Already in code** | No change needed (existing CASCADE pattern) |

### Key Invariants to Maintain

1. **GPU Cooldown Protection:** Keep 10-second cooldown between qualitative rounds and between test models (`asyncio.sleep(10)`).
2. **Empty Response Retry:** Maintain 3-retries-with-5-second-pause logic for empty responses (already in `run_benchmark_task` and `run_benchmark_queue_task`).
3. **Database Idempotency:** Always delete historical `test_runs` for a `model_id` before inserting new runs; rely on `ON DELETE CASCADE` foreign keys.
4. **Path Fallbacks:** Always use `utils/common.py` fallback patterns for Docker vs. host paths.
5. **Status Normalization:** All status values must be lowercase (`'good'`, `'testing'`, `'failed'`, `'completed'`) for frontend consistency.

---
