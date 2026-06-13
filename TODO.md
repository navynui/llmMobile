# 📋 llmMobile — Benchmarking & Container Portal TODO

This document details the roadmap, architectural requirements, and design patterns for implementing model download queues, automatic `models.ini` preset generation, and cleanup hooks in the next development session.

---

## 🚀 Upcoming Session Tasks

### 1. Sequential Model Download Queue
* **Objective:** Implement an asynchronous, single-concurrency download queue for Hugging Face (HF) GGUF files to maximize bandwidth utilization and avoid HF speed throttling.
* **Problem:** Downloading multiple multi-gigabyte models concurrently splits the host's network bandwidth and triggers Hugging Face rate limits or parallel speed degradation.
* **Technical Design:**
  * **Asynchronous Queue (`asyncio.Queue`):** Introduce a global async download queue manager inside `main.py` that processes exactly one download task at a time (FIFO).
  * **Background Worker:** A long-running async background worker task that retrieves items from the queue, executes the download with chunk-based progress reporting, and transitions to the next item when done.
  * **Database States:** Enhance the downloading database states (`status` column in `models` table) to support:
    * `QUEUED`: Waiting in the download queue.
    * `DOWNLOADING`: Active download (with current progress metrics like percentage/speed updated).
    * `COMPLETED`: Finished downloading and registered.
    * `FAILED`: Errored out during download.
  * **WebSocket / SSE Updates:** Ensure that download queue state transitions and real-time active download percentages are regularly broadcast via server-sent events (`/events/status`) to update the frontend reactive UI.

---

### 2. Automatic `models.ini` Preset Registration
* **Objective:** Once a model file is successfully downloaded, automatically write its custom configuration block into `models/models.ini` to register it as an active preset.
* **Why:** This ensures downloaded models are immediately loadable by `llama-server` without manual configuration editing.
* **Parameters to Write:**
  * **Section Name:** `[<model_filename>]` (e.g., `[gemma-2-9b-it-Q4_K_M.gguf]`)
  * **Configuration Presets:**
    ```ini
    [gemma-2-9b-it-Q4_K_M.gguf]
    model = /models/gemma-2-9b-it-Q4_K_M.gguf
    n-gpu-layers = -1
    ```
  * **Critical Setting:** `n-gpu-layers = -1` is mandatory to offload all computational layers to the active GPU automatically.
  * **Implementation:** Use Python's built-in `configparser` (with case-sensitive option names) or direct line-by-line block writing to append the section cleanly to `MODELS_INI_PATH`.

---

### 3. Automated `models.ini` Cleanup on Deletion
* **Objective:** Remove corresponding preset blocks from `models/models.ini` when a model is deleted through the web interface.
* **Why:** Prevents `llama-server` from keeping obsolete references to missing model files, which would otherwise result in load failures.
* **Implementation Flow:**
  * When a delete request is processed:
    1. Parse the existing `models.ini` configuration.
    2. Identify the matching section (e.g., `[gemma-2-9b-it-Q4_K_M.gguf]`).
    3. Remove the entire section block including all its parameter lines.
    4. Write the updated config back to `MODELS_INI_PATH` safely.
    5. Delete the actual `.gguf` file from the host filesystem `/models/` directory.
    6. Prune relevant entries from the database to keep the system in sync.

---

### 4. Chat Tab: Interactive Model Thinking Rendering
* **Objective:** Parse and render the model's `<think>...</think>` block in the chat tab dynamically while streaming, and hide or collapse it once the thinking phase is complete.
* **Why:** Newer reasoning models (such as DeepSeek-R1) stream their chain-of-thought inside `<think>` tags. The chat tab should render this thinking segment in a distinct style (similar to a blockquote or terminal) to maintain transparency, and then smoothly hide/collapse it when the final response begins streaming.
* **Technical Design:**
  * Parse `<think>` and `</think>` tags on the fly during streaming inside `chat-tab.js`.
  * Display a collapsible or styled "Thinking..." section in the UI during this state.
  * Once `</think>` is received or completed, transition to rendering the standard markdown response and collapse/hide the thinking block.

---

### 5. Server Tab: Control Panel Layout Consolidation
* **Objective:** Relocate the "Models Config" and "Edit models.ini" panels from Settings/Stub-Tabs to the primary Server tab, positioned below the "Active LLM Model" control card.
* **UI Features:**
  * Add the ability to expand and collapse (hide/show) both the **"Models Config"** and **"Edit models.ini"** cards individually, matching the look and feel of the "Active LLM Model" card.
  * This keeps all server-related model configuration in a single unified view rather than splitting it between the "Settings" tab and other tabs.
