# 📊 LLM Multi-Run Benchmark Routine & Statistical Aggregation Plan

This document outlines the architecture, database migrations, high-efficiency benchmarking routines, post-processing statistical aggregation engine, auto-categorization system, and UI/UX enhancements for recording and displaying **multi-run average scores** in `llmMobile`.

---

## 🎯 Strategic Objectives

1. **Multi-Run Score Aggregation & History:** Track multiple benchmark runs per model without overwriting previous historical runs, displaying aggregated metrics ($\text{Mean} \pm \text{StdDev}$, Min/Max, and run count $N$).
2. **High Efficiency & Speed ("Resultful numbers in less time"):** Reduce total benchmarking time by offering fast screening modes, speed sampling multi-passes, and optimized AI Judge batching—getting reliable statistics in a fraction of the time.
3. **Automated Categorization System:** Integrate the categorization framework from `category.md` and `categorization_plan.md` directly into the database and UI (`⚡ Speed-First`, `🧠 Reasoning`, `🔋 VRAM-Efficient`, `⚖️ Balanced`, `🎯 Specialized`).
4. **Enhanced UI/UX:** Render score confidence bands, category pills, run history breakdowns, and multi-run comparison charts in Lit components.

---

## 🏗️ Architectural Overview

```
 ┌────────────────────────────────────────────────────────────────────────┐
 │                        llmMobile UI (Lit SPA)                          │
 │  - Main Table: Avg Score ± StdDev, Category Pill, Run Count Badge      │
 │  - Details Modal: Multi-Run History, Per-Round Variance, Mode Selector │
 │  - Bubble Chart: Toggle Latest vs. Aggregated Multi-Run Averages       │
 └───────────────────────────────────┬────────────────────────────────────┘
                                     │ API Requests
                                     ▼
 ┌────────────────────────────────────────────────────────────────────────┐
 │                      FastAPI Backend Router                            │
 │  - POST /api/benchmark/run (supports mode: full|fast_screen|speed_multi)│
 │  - GET  /api/benchmark/models/{id}/aggregate (stats & category)        │
 └───────────────────┬────────────────────────────────┬───────────────────┘
                     │                                │
                     ▼                                ▼
 ┌───────────────────────────────┐   ┌───────────────────────────────────┐
 │   Multi-Run Execution Engine  │   │  Post-Processing Aggregator Svc   │
 │   (services/benchmark/runner) │   │  (services/benchmark/aggregation) │
 │  - Fast Screen Mode (3 mins)  │   │  - Mean score, StdDev, Min/Max    │
 │  - Speed Multi-Pass (1 min)   │   │  - Stability / Variance Index     │
 │  - Full Multi-Run (N passes)  │   │  - Auto Categorization Rules      │
 └───────────────┬───────────────┘   └────────────────┬──────────────────┘
                 │                                    │
                 └──────────────────┬─────────────────┘
                                    ▼
 ┌────────────────────────────────────────────────────────────────────────┐
 │                       SQLite Database (llm_bench.db)                   │
 │  - models: category, avg_score, avg_tps, score_stddev, runs_count       │
 │  - test_runs: run_number, run_group_id, execution_mode, temperature    │
 │  - round_scores & model_hallucinations (FOREIGN KEY ... ON DELETE CASCADE)│
 └────────────────────────────────────────────────────────────────────────┘
```

---

## 📦 Phase 1 — Database Schema & Migration Infrastructure

### 1.1 DB Schema Migration (`utils/db_utils.py`)
Add columns to support multi-run retention, execution modes, statistical summaries, and model categories while preserving full backwards compatibility.

**Files to modify:**
- [x] `utils/db_utils.py` — Update `run_migrations()` and `consolidate_database()`

**Schema Changes:**
```sql
-- 1. Extend test_runs table for multi-run tracking
ALTER TABLE test_runs ADD COLUMN run_number INTEGER DEFAULT 1;
ALTER TABLE test_runs ADD COLUMN run_group_id TEXT;
ALTER TABLE test_runs ADD COLUMN execution_mode TEXT DEFAULT 'full'; -- 'full', 'fast_screen', 'speed_multi'
ALTER TABLE test_runs ADD COLUMN temperature REAL DEFAULT 0.7;

-- 2. Extend models table for aggregated metrics & categorization
ALTER TABLE models ADD COLUMN category TEXT DEFAULT 'unclassified';
ALTER TABLE models ADD COLUMN avg_total_score REAL;
ALTER TABLE models ADD COLUMN avg_tps REAL;
ALTER TABLE models ADD COLUMN score_stddev REAL;
ALTER TABLE models ADD COLUMN runs_count INTEGER DEFAULT 0;
```

### 1.2 Migration & Data Retention Policy
- Replace destructive `DELETE FROM test_runs WHERE model_id = ?` with a configurable **run retention window** (keep last $N=5$ runs per model/server).
- Preserve existing foreign key `ON DELETE CASCADE` behavior for clean cleanup when pruning runs beyond retention window.

---

## ⚡ Phase 2 — High-Efficiency Multi-Run Execution Engine

### 2.1 Benchmarking Execution Modes (`services/benchmark/runner.py`)
To obtain meaningful numbers efficiently, implement 3 target execution modes:

| Mode | Duration | Description & Prompt Subset | Target Use Case |
|---|---|---|---|
| **`fast_screen`** | ~3–4 mins | Runs 3 core rounds: Speed Metric + Knowledge QA + Code Generation. Fast AI Judge evaluation. | Rapid model screening & instant initial category assignment |
| **`speed_multi`** | ~1 min extra | Runs 1 qualitative pass + 3 rapid back-to-back TPS measurements without re-grading text. | Precise speed/TPS metrics with minimal GPU time |
| **`full_multi`** | Configurable ($N \times 3$ mins) | Runs $N$ full qualitative + quantitative passes (default $N=3$) with 10s GPU cooldown between passes. | High-confidence benchmarking & variance measurement |

**Files to modify:**
- [x] `models/requests.py` — Add `execution_mode: str = "full"` and `run_count: int = 1` to `BenchmarkRunRequest` & `BenchmarkQueueRequest`.
- [x] `services/benchmark/runner.py` — Implement execution mode filtering in `run_benchmark_task()` and multi-run iteration loops with adaptive cooldown.
- [x] `services/benchmark/api.py` — Accept mode/run parameters and propagate to task runner.

### 2.2 Adaptive VRAM Cooldown Optimization
- Reduce inter-round cooldown from static 10s to dynamic **5s** when VRAM utilization is $<70\%$.
- Keep 10s cooldown for heavy $>14\text{GB}$ models to prevent VRAM fragmentation.

---

## 📈 Phase 3 — Post-Processing & Statistical Aggregation Service

### 3.1 Aggregation Core Engine (`services/benchmark/aggregation.py`)
Create a dedicated sub-module `services/benchmark/aggregation.py` to calculate multi-run statistical metrics.

**Files to create:**
- [x] `services/benchmark/aggregation.py` — Re-calculate model summary statistics and category upon run completion.

**Statistical Formulations:**
- **Mean Score ($\mu$):**
  $$\mu = \frac{1}{N} \sum_{i=1}^{N} S_i$$
- **Standard Deviation ($\sigma$):**
  $$\sigma = \sqrt{\frac{1}{N-1} \sum_{i=1}^{N} (S_i - \mu)^2}$$
- **Score Range:** $[S_{\min}, S_{\max}]$
- **Per-Round Means:** $\mu_{r}$ for each of the 5 qualitative/quantitative rounds.
- **Hallucination Frequency:** Percentage of runs where hallucinations were detected ($H_{\text{freq}} = \frac{\text{Hallucinated Runs}}{N}$).

### 3.2 Automated Categorization Rules
Implement the exact rules defined in `category.md` & `categorization_plan.md`:

```python
def classify_model(avg_speed_tps: float, avg_reasoning: float, avg_code: float, vram_gb: float) -> str:
    """
    Categorize model based on aggregated multi-run benchmark results.
    - avg_reasoning: avg score of abstract_logic & technical_reasoning (max 18)
    - avg_code: code_generation score (max 18)
    - avg_speed_tps: speed metric TPS
    """
    if avg_speed_tps >= 60.0:
        return "speed_first"
    elif avg_reasoning >= 14.0 and avg_code >= 14.0 and (vram_gb or 0) < 16.0:
        return "reasoning"
    elif (vram_gb or 0) > 0 and (vram_gb or 0) < 12.0 and avg_reasoning >= 10.0:
        return "vram_efficient"
    elif 15.0 <= avg_speed_tps <= 60.0 and 12.0 <= avg_reasoning <= 17.0:
        return "balanced"
    elif avg_reasoning >= 16.0 or avg_code >= 16.0:
        return "specialized"
    return "unclassified"
```

---

## 🌐 Phase 4 — Backend API Extensions

### 4.1 New & Enhanced Endpoints (`services/benchmark/api.py` & `reader.py`)

**Files to modify:**
- [x] `services/benchmark/reader.py` — Include aggregated score ($\mu \pm \sigma$), `category`, and `runs_count` in `/api/benchmarks` response.
- [x] `services/benchmark/api.py` — Add `/api/benchmark/models/{model_id}/aggregate` endpoint to trigger post-processing or fetch multi-run run history.

**API Response Schema (`/api/benchmarks`):**
```json
{
  "benchmarks": [
    {
      "model_id": "qwen2.5-7b-instruct-q8_0",
      "model": "qwen2.5-7b-instruct-q8_0.gguf",
      "platform": "Tesla P100 (16GB)",
      "server": "primary",
      "score": 84,
      "avg_score": 84.5,
      "score_stddev": 2.1,
      "runs_count": 3,
      "tokens_sec": 42.8,
      "category": "balanced",
      "category_label": "⚖️ Balanced",
      "is_tested": true
    }
  ]
}
```

---

## 🎨 Phase 5 — Frontend UI/UX Integration

### 5.1 Main Benchmark Table Enhancements (`src/components/benchmark-tab/`)
- Display aggregated score format: **`84.5 ± 2.1`** with a **`3 runs`** badge.
- Add colored category badges (`⚡ Speed-First`, `🧠 Reasoning`, `🔋 VRAM-Efficient`, `⚖️ Balanced`, `🎯 Specialized`).
- Add a Category Filter dropdown in the benchmark toolbar.

**Files to modify:**
- [x] `src/components/benchmark-tab/_templates.js` — Render category pills, multi-run average score badges, and mode selector UI.
- [x] `src/components/benchmark-tab/_logic.js` — Handle execution mode parameters when triggering single/queue benchmarks.
- [x] `src/components/benchmark-tab/_styles.js` — CSS styles for category badges, variance pills, and multi-run stats.

### 5.2 Model Benchmark Details Modal
- **Multi-Run History Tab:** Displays table of past $N$ runs with individual timestamps, TPS, total scores, and server platform.
- **Statistical Summary Card:** Highlights Mean, Median, StdDev, Score Range ($[S_{\min}, S_{\max}]$), and Consistency Rating (High / Medium / Low variance).
- **Benchmark Launch Options:** Modal toggle to choose Execution Mode (`Fast Screen`, `Speed Multi-Pass`, `Full Benchmark`) and target run count $N$.

### 5.3 Benchmark Bubble Chart (`src/components/benchmark-bubble-chart.js`)
- Toggle switch: "Latest Run" vs "Multi-Run Aggregated Average".
- Color node borders by category.

---

## 🧪 Phase 6 — Testing & Empirical Verification

### 6.1 Backend & Database Verification
- [x] Verify `run_migrations()` correctly applies new columns to `test_runs` and `models`.
- [x] Test multi-run retention policy: verify $N$ historical runs persist in `test_runs` while cascading foreign keys clean up correctly.
- [x] Test statistical aggregation engine with 1, 3, and 5 benchmark runs.
- [x] Test auto-categorization logic against edge cases (zero VRAM, aborted runs, single-pass runs).

### 6.2 Frontend Compilation & UI Verification
- [x] Verify Lit/Vite build completes with zero bundling errors (`npm run build`).
- [x] Verify category pills, multi-run score display, and modal history render cleanly in mobile and desktop layouts.
- [x] Verify Docker container rebuild (`docker compose build llm-mobile && docker compose up -d --no-deps llm-mobile`).

---

## 📅 Task Checklist & Execution Order

- [x] **Step 1:** Update `utils/db_utils.py` schema migrations & retention policy.
- [x] **Step 2:** Implement `services/benchmark/aggregation.py` post-processing statistics & auto-categorization engine.
- [x] **Step 3:** Extend `models/requests.py`, `services/benchmark/runner.py`, and `services/benchmark/api.py` for multi-mode execution (`fast_screen`, `speed_multi`, `full_multi`).
- [x] **Step 4:** Update `services/benchmark/reader.py` to return multi-run averages, stddev, category, and run counts.
- [x] **Step 5:** Modify frontend `benchmark-tab` components (`_templates.js`, `_logic.js`, `_styles.js`) and `benchmark-bubble-chart.js`.
- [x] **Step 6:** Run `npm run build` & Docker rebuild, and execute verification test.
