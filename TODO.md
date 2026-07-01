# TODO.md — VRAM Integration & Interactive Bubble Chart

## Objective
Enhance the existing LLM benchmark web application to collect, store, and visualize VRAM usage.
Render an interactive 2D Bubble Chart above the benchmark data table mapping:
- **X-Axis:** VRAM (GB)
- **Y-Axis:** Overall Score
- **Color:** Inference Speed (15 → 85 token/s sequential gradient)
- **Stroke:** `status == 'good'` (solid) vs `status == 'testing'` (dashed)

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

- [ ] 2.1 Create `services/vram_svc.py`
  - Implement `get_gpu_memory_used_gb() -> float | None` using `nvidia-smi --query-gpu=memory.used --format=csv,noheader,nounits`.
  - Return `None` on failure (non-NVIDIA host / nvidia-smi missing).
- [ ] 2.2 Update `services/model_svc.py` `proxy_llm_load`
  - After successful HTTP 200 from `http://llm-server:8080/models/load`, pause briefly (e.g., 2–3s) for allocation to settle.
  - Call `get_gpu_memory_used_gb()` and UPDATE the `models` table row for the loaded `model_id` with `vram_gb` and `status = 'good'` (or `status = 'testing'` if still in queue).
- [ ] 2.3 Update `services/benchmark_svc.py`
  - In `run_benchmark_queue_task`, after each model load, capture VRAM and update the same `models` row.
  - In `run_benchmark_task`, after model load, capture VRAM and update the same `models` row.
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
- [ ] 2.6 Calculate VRAM usage as a percentage of the total 16GB capacity and store it alongside `vram_gb`.
    - Run this calculation only after the model is fully loaded and the system reports an idle state (e.g., `status == 'good'` with no pending inference).
- [ ] 2.7 Persist the computed VRAM percentage in the database for reporting and visualization.

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

## 7. Additional VRAM Integration Improvements

- [ ] 7.1 Ensure the VRAM percentage is computed against the full 16GB capacity and reflected in UI tooltips.
- [ ] 7.2 Validate that the percentage calculation only triggers after confirming model idle status (no ongoing requests).
- [ ] 7.3 Confirm that only models listed in `models.ini` are displayed as bubbles in the chart; filter out any entries not present in the INI file.

## 8. Positioning of Bubble Chart

- [ ] 8.1 Place the bubble chart container immediately above the LLM Benchmark Scores & Rankings container.
- [ ] 8.2 Ensure the new container does not disrupt existing layout or scrolling behavior.
- [ ] 8.3 Verify that the chart updates dynamically when `models.ini` changes (e.g., after adding/removing models).

## 9. Rankings Table Structure Preservation

- [ ] Keep the current Rankings table column structure unchanged; do **not** add new columns.
- [ ] Any additional model information should be displayed via expandable chips, tooltips, or badge components rather than by extending the table schema.
- [ ] Ensure sorting, filtering, and pagination logic remain intact and continue to operate on the original column set.
