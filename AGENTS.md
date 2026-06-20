# 🤖 AGENTS.md — AI Agent Guidelines for llmMobile
> This document outlines coding standards, structural rules, and critical invariants for AI coding assistants working in the `llmMobile` repository.

---

## 🔍 What This Repository Is

`llmMobile` is a mobile-first controller, streaming client, image generator interface, and automated benchmarking portal.
It operates in tandem with:
1. **`llama-server`** (Inference container, Port 8080)
2. **`ComfyUI`** (Image generation container, Port 8188)
3. **`llm_bench.db`** (SQLite database for models and benchmarking runs)

It is deployed as a Docker container (`llm-mobile`) defined in the `/home/nui/llmaCPP/docker-compose.yml` file.

---

## 📂 Layout & Core Architecture

### 1. Backend (`main.py`)
A single, highly optimized async FastAPI application orchestrating:
* System-level calls (via Docker SDK) to restart or read logs of `llama-server`.
* Multi-round LLM prompts and real-time outputs over HTTP.
* SQL transactions with SQLite (`llm_bench.db`).
* Sequential prompt submission to a designated Judge LLM.

### 2. Frontend (`src/`)
A modular Single Page Application (SPA) utilizing **Lit (Reactive Web Components)** and compiled with **Vite**:
* `src/llm-app.js`: Main shell, view state manager, EventSource/SSE subscriber, and notification toast trigger.
* `src/components/server-tab.js`: Controller card for the local container status, log viewer, and `models.ini` text editor.
* `src/components/chat-tab.js`: Markdown-rendered streaming assistant window with session context preservation.
* `src/components/generator-tab.js`: Sliders, prompts, and aspect ratio selectors mapped to ComfyUI's JSON payload structures.
* `src/components/gallery-tab.js`: Image photo grid and metadata inspector.
* `src/components/stub-tabs.js`:
  - **Benchmarks Tab:** Reactive table with speed/quality scores, Judge model selector, queue builder, and live benchmark logs.
  - **Models Config:** Config file editor, database inspector, and file-deletion controls.
  - **Settings:** General variables and polling switches.

---

## ⚠️ Critical Rules for AI Agents

### 1. Validate Lit/Vite Compilation on every edit
Lit template literals are highly sensitive to unclosed tags or duplicate blocks.
* After editing any `.js` file in `src/`, **always** run:
  ```bash
  npm run build
  ```
  If Vite fails to bundle, immediately revert or repair the syntax error before continuing. Do not leave the frontend in an uncompiled state.

### 2. Strip Thinking Blocks Before JSON Parsing
Reasoning LLMs (like DeepSeek-R1) generate reasoning streams inside `<think>...</think>` tags before returning JSON outputs. Simple JSON parsers will crash when reading this text.
* Always preserve the custom regex stripper in `main.py`:
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
* Changes in `main.py` or `src/` are **not** fully hot-reloaded inside the production Docker stack automatically.
* To apply code changes, navigate to the compose directory `/home/nui/llmaCPP` and execute:
  ```bash
  docker compose build llm-mobile
  docker compose up -d --no-deps llm-mobile
  ```

### 7. `traceback` Must Be Imported at Module Top
The `traceback` module **must** be imported at the top of `main.py`. If it is missing, any secondary error handler (e.g., during exception re-raising or logging) will fail with `NameError: name 'traceback' is not defined`, causing cascading failures that mask the real underlying issue.
* Always verify `import traceback` exists on line 12 of `main.py`. If it's missing, error traces inside `except` blocks are swallowed.

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

Always use the Python fallback routines already present in `main.py` to auto-detect and resolve these paths:
```python
DB_PATH = "/app/llm_bench.db" if os.path.exists("/app") else "/home/nui/llmaCPP/llm_bench.db"
```
Do not hardcode a single path without checking for fallback options.

### 9. Repository Architecture Evolution (Phase G)
The core backend (`app/main.py`) has been refactored into a **thin router**. All functional logic resides in dedicated service modules under `services/`. This fully modularizes the codebase, improves testability, and enforces strict separation of concerns. Phase H verification tests have been added to ensure endpoint contract compliance.

