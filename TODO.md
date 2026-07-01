# TODO.md — VRAM Integration & Interactive Bubble Chart

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

## 2. Backend VRAM Collection Service

*Rationale:* The app already maintains live `vram_percent` in `docker_svc.py` via `_local_stats_poller()` and MQTT. **Do not** duplicate this by spawning new `nvidia-smi` processes. Instead, read from the existing `get_system_stats()` source-of-truth, compute GB, and store per-model.

- [ ] 2.1 Add a helper (e.g., in `services/docker_svc.py` or a lightweight `services/vram_svc.py`) `get_model_v中兴` function:
  - Call the existing `get_system_stats()`.
  - Extract `vram_percent` (if missing or `0.0`, return `None`).
  - Compute `vram_gb = (vram_percent / 100) * 16` (total VRAM is 16GB).
  - Return the computed `vram_gb`.
- [ ] 2.2 Update `services/model_svc.py` `proxy_llm_load`
  - After receiving a **200 OK** response, start a lightweight background coroutine that:
    1. Listens for the log line containing either `"update_slots: all slots are idle"` or `"all slots are idle"` (the trigger used by the monitor to signal model readiness).
    2. Once the trigger appears, wait an additional 2–3 seconds to allow VRAM allocation to settle.
    3. Capture VRAM via the helper from **2.1** and store `vram_gb` together with `status = 'good'` for the corresponding `model_id` in the `models` table.
    4. **Note:** This VRAM capture and status update should happen only once per model transition (i.e., when the model first becomes idle), not on every subsequent idle cycle.
- [ ] 2.3 Update `services/benchmark_svc.py`
  - In `run_benchmark_queue_task`, **after** the existing `for _ in range(60)` loop confirms the model is loaded and *before* starting the benchmark rounds:
    - Wait for the **"update_slots: all slots are idle"** or **"all slots are idle"** log trigger (the same condition used by the monitor).
    - After the trigger fires, wait 2 seconds, capture VRAM via the helper from **2.1**, and update the `models` row for this `model_id` with `vram_gb`.
  - In `run_benchmark_task`, after the initial active-model validation and before starting rounds:
    - Verify that the currently loaded model matches `model_id`.
    - Wait for the **"update_slots: all slots are idle"** or **"all slots are idle"** trigger, then wait 2 seconds, capture VRAM via the helper from **2.1**, and update the same `models` row with `vram_gb`.
- [ ] 2.4 Update `services/benchmark_svc.py` `get_benchmarks(show_all)`
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
- [ ] 2.5 Normalize `status` values
  - Map existing DB values (`TESTING`, `FAILED`, `completed`) to lowercase API contract (`testing`, `failed`, `completed`, `good`).
  - Ensure frontend checks use the lowercase contract specified in the brief (`'good'`, `'testing'`).
- [ ] 2.6 Persist the computed VRAM percentage alongside `vram_gb` for reporting and visualization (e.g., store percent too, or compute on the fly from the 16GB baseline).

## 3. Frontend — Chart Library Bootstrap

- [ ] 3.1 Add `chart.js` to `package.json` dependencies.
- [ ] 3.2 Run `npm install` to install Chart.js.
- [ ] 3.3 Verify `npm run build` succeeds after dependency addition.

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

## 6. Build Safety & Verification

- [ ] 6.1 Run `npm run build` and fix any Vite / Lit template errors.
- [ ] 6.2 Run backend test suite (`pytest` or equivalent) to ensure no regressions in `app/main.py` or service imports.
- [ ] 6.3 Start the FastAPI server and call `GET /api/benchmarks` to confirm `vram_gb` and `status` appear in the JSON.
- [ ] 6.4 Load a model via the UI and verify VRAM is captured and persisted to SQLite.
- [ ] 6.5 Verify the bubble chart renders above the table with correct colors, axes, and stroke styles.
- [ ] 6.6 Verify bidirectional highlighting (chart click → table scroll, table hover → chart dim).

## 7. Bubble Chart Scope & Filtering

- [ ] 7.1 **Filter data source to `models.ini` only.** The chart should not display all historical models; only those currently listed in `models.ini` should appear as bubbles.
- [ ] 7.2 Keep the chart reactive: when `models.ini` changes (models added/removed), the bubble chart should re-render with the updated set.
- [ ] 7.3 Ensure the chart gracefully handles models that are listed in `models.ini` but have no benchmark data yet (e.g., hide or show at origin with a different style).

## 8. Rankings Table Structure Preservation

- [ ] 8.1 **Do not add new columns** to the existing LLM Benchmark Scores & Rankings table.
- [ ] 8.2 Any additional model info (VRAM, status, etc.) must be rendered as extra chips/badges inside the existing single Model column, alongside the current Quant / Speed / Score chips.
- [ ] 8.3 Ensure none of the new chips break sorting, filtering, or pagination logic on the original column set.

## 9. Additional VRAM Integration Notes

- [ ] 9.1 If the system-stats `vram_percent` ever reports `0.0` or is stale (e.g., no stats within the last 5 seconds), the helper should fall back to a direct low-overhead `nvidia-smi` call so the capture is never missed.
- [ ] 9.2 Ensure the 16GB total is configurable (e.g., a constant `VRAM_TOTAL_GB = 16` in `utils/common.py`), so the calculation is easy to adjust if the hardware changes.
