# llm-manager Container Web App — Complete Feature & Function Audit

## Architecture Overview

The llm-web app is a **FastAPI** backend + vanilla JS frontend (no React/Vue/Angular) that provides an admin dashboard for managing:
- **LLM inference server** (`llama.cpp` via Docker container)
- **ComfyUI image generation** (Docker container)
- **System monitoring** (GPU VRAM, CPU temp, RAM, storage)

### Infrastructure
- Single `docker-compose.yml` deploying the manager on port 8000 with GPU passthrough
- Mounts: `/var/run/docker.sock`, model directories, ComfyUI output, PROMPTS file
- Depends on `llama-server` container being healthy before starting
- PWA-ready (Web App Manifest for installable app)

---

## 1. Server Control & Container Management

### Endpoints
| Method | Path | Description |
|--------|------|-------------|
| GET | `/status` | Returns status of `llm-server` and `manager` containers (running/not_found/uptime/image) |
| POST | `/stop` | Stop the llm-server container |
| POST | `/start` | Start the llm-server container |

### Frontend Functions (`server_ctrl.js`)
- **`fetchStatus()`** — Fetches and renders container status badge (Running/Stopped), image, uptime
- **`toggleServer()`** — Starts or stops based on current status
- **`stopServer()`** / **`startServer()`** — Individual start/stop with UI feedback
- **`fetchSystemStats()`** — Polls `/system_stats` every 2 seconds (CPU temp/util, GPU temp/util, RAM%, VRAM%, Storage%)

### Key Details
- Container name: `llm-server`
- Manager container name: `llm-manager`
- System stats cached at module level, updated every 2 seconds via polling

---

## 2. Model Management (llama.cpp Server API)

### Backend Endpoints
| Method | Path | Description |
|--------|------|-------------|
| GET | `/models` | List all GGUF models on disk |
| POST | `/api/llm/models/load` | Load a specific model into VRAM |
| POST | `/api/llm/models/unload` | Unload a specific model from VRAM |
| GET | `/api/llm/models` | Get current loaded models with status |
| DELETE | `/models/{filename}` | Delete a GGUF model file from disk |

### Frontend Functions (`server_ctrl.js`)
- **`fetchModels()`** — Fetches model list; attempts router API first, falls back to disk listing
- **`loadModelNow()`** — Loads selected model, automatically unloads previously loaded models to free VRAM, polls for completion (5-min timeout)
- **`unloadModelNow()`** — Unloads the selected model
- **`setDefaultModel()`** — Edits `models.ini` to add `load-on-startup = true` to a section
- **`deleteModel()`** — Deletes selected model file from disk with confirmation dialog
- **`copyModelName()`** — Copies selected model filename to clipboard

### Key Details
- Models stored in `/models/` directory (mapped into Docker)
- Model status tracked via badges: Loaded / Idle / Auto (load-on-startup)
- VRAM management is automatic: loading a new model unloads existing ones first
- Router mode uses FastAPI's `/api/v1/models` endpoint from llama.cpp server

---

## 3. Configuration File Management

### Backend Endpoints
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/models_ini` | Read current `models.ini` content |
| POST | `/api/models_ini` | Save models.ini content (requires container restart) |
| POST | `/api/models_ini/sync` | Scan disk for new GGUF models and append to INI |
| GET | `/current_config` | Get currently loaded model name |

### Frontend Functions (`server_ctrl.js`)
- **`refreshModelsIni()`** — Loads `models.ini` into editor, parses sections and load-on-startup flags
- **`saveModelsIni()`** — Saves edited content back to server
- **`syncModelsIni()`** — Backend scans `/models/` for new files not in INI, adds them

### Key Details
- Editor is a simple `<textarea>` with syntax highlighting
- Changes require container restart to take effect (noted to user)
- Parse logic handles `[modelname]` sections and `load-on-startup = true/false` lines

---

## 4. System Monitoring Dashboard

### Backend Endpoints
| Method | Path | Description |
|--------|------|-------------|
| GET | `/system_stats` | Returns cached system stats (CPU temp, CPU util%, GPU temp, GPU util%, RAM%, VRAM%, Storage%) |

### Frontend Functions (`server_ctrl.js`)
- **`fetchSystemStats()`** — Polls every 2 seconds, updates:
  - CPU temperature (with color coding: green <60°C, amber <80°C, red ≥80°C)
  - GPU temperature (same color scale)
  - CPU utilization (Braille Unicode block rendering with color coding)
  - GPU utilization (Braille Unicode + color coding)
  - RAM usage bar and percentage
  - VRAM usage bar and percentage

### UI Elements (`ui_core.js`)
- **`UICore.utilToBraille(pct)`** — Converts percentage to Braille Unicode character for compact visualization
- **`UICore.utilColor(pct)`** — Returns color based on utilization level (green <50, amber <75, orange <90, red ≥90)
- **`UICore.showMessage(msg, colorClass)`** — Flash notification messages
- **`UICore.setLoading(isLoading, text, color)`** — Button loading state

---

## 5. Image Generation (ComfyUI Integration)

### Backend Endpoints
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/comfy/generate` | Generate image(s) via ComfyUI workflow |
| GET | `/image/prompts` | Read prompts from PROMPTS file |
| POST | `/image/prompts` | Save prompts to PROMPTS file |
| GET | `/api/comfy/status` | Get generation state (active/idle, mode, logs) |

### WebSocket Endpoints
| Path | Description |
|------|-------------|
| `/ws/image_gen` | Real-time ComfyUI generation status feed — sends progress updates, logs, success/error notifications |

### Backend Functions (`main.py`)
- **`load_comfyui_workflow()`** — Loads `MyZimage_turbo.json` from disk
- **`modify_comfyui_workflow(workflow, prompt, resolution)`** — Mutates workflow copy for specific request: updates CLIP text (prompt), resolution (width/height), random seed per generation, filename prefix with timestamp
- **`queue_comfyui_prompt(workflow)`** — POST to ComfyUI `/prompt`, returns `(prompt_id, save_image_node_ids)`
- **`wait_for_comfyui_completion(prompt_id, on_progress, timeout=120s)`** — WebSocket listener for ComfyUI completion, sends progress callback events (sampling %, executing node names)
- **`_get_comfyui_history(prompt_id)`** — GET `/history/{id}`, extracts image metadata from SaveImage outputs
- **`run_image_generation(mode, prompt, resolution)`** — Main generation runner: pre-flight VRAM check → load/modify workflow → queue → wait for completion → broadcast results
- **`ensure_vram_available()`** — Emergency shutdown if VRAM > threshold (kills LLM server to free GPU)

### Generation Modes
1. **Single mode** (`mode="single"`) — One prompt, one image
2. **Batch mode** (`mode="batch"`) — Reads all prompts from `/app/PROMPTS` file, generates each sequentially with VRAM checks between items

### Key Details
- ComfyUI host: `host.docker.internal:8188` (from docker-compose)
- Workflow template: `MyZimage_turbo.json`
- Default resolution: `1920x1088`
- Filename prefix: `z-image-{timestamp}` to prevent cache collisions
- Generation state is decoupled from WebSocket connections — survives page refreshes via in-memory global state
- VRAM thresholds trigger automatic memory cleanup (unload models → restart ComfyUI) or emergency LLM server shutdown

---

## 6. Image Gallery & File Management

### Backend Endpoints
| Method | Path | Description |
|--------|------|-------------|
| GET | `/image/gallery` | List generated images in output directory (newest first) |
| GET | `/image/saved` | List saved/archived images |
| POST | `/image/save` | Move images from output to save folder (207 Multi-Status, partial success) |
| DELETE | `/image/saved/{filename}` | Delete a saved image |
| GET | `/api/gallery/browse?path=&page=1&limit=24` | Full gallery browser with pagination, subfolder navigation, path traversal protection |
| GET | `/api/gallery/all_folders` | List all folders recursively in the output directory |
| POST | `/api/gallery/mkdir` | Create a new folder (with safe_join path validation) |
| POST | `/api/gallery/move` | Move files to another folder |
| POST | `/api/gallery/delete` | Delete images and/or folders |

### Security Features
- **Path traversal protection** via `safe_join()` — resolves real paths, rejects anything outside the base directory
- Filename validation on save (rejects filenames with `os.sep` or starting with `.`)
- Hidden files/directories excluded from gallery browsing

### Key Details
- Image directories: `/comfyui-output/` and subdirectories
- Supported formats: `.png`, `.jpg`, `.jpeg`, `.webp`
- Pagination: configurable (default 24 per page)
- URL encoding for paths with special characters via `urllib.parse.quote()`

---

## 7. HuggingFace Model Discovery & Download

### Backend Endpoints
| Method | Path | Description |
|--------|------|-------------|
| GET | `/hf/search?q=...` | Search HuggingFace models with GGUF tag (limit 10) |
| GET | `/hf/files?repo_id=...` | List all `.gguf` files in a repo with sizes |
| POST | `/downloads/start` | Start background download of a model file |
| GET | `/downloads/status` | Get progress of active downloads (progress%, downloaded bytes, ETA) |
| DELETE | `/downloads/clear` | Clear completed/error downloads from tracking |
| DELETE | `/downloads/{dl_id}` | Clear a specific download entry |

### Download Progress Tracking (`main.py`)
- Downloads run in background threads with thread-safe locking
- Real-time progress updates: percentage, downloaded bytes, total bytes, speed (bytes/sec), ETA (seconds)
- Statuses: `Downloading` / `Completed` / `Error: {message}`
- Uses `httpx.Client(follow_redirects=True)` for streaming downloads

### Key Details
- HuggingFace API: `huggingface_hub` library's `hf_api.list_models()` and `.list_repo_tree()`
- Models saved to `/models/` directory (mapped into Docker)

---

## 8. WebSocket Log Streams

| Path | Description |
|------|-------------|
| `/ws/logs` | Stream Docker container logs for `llm-server` — reconnects on container restart, waits for container if not running |
| `/ws/manager-logs` | Stream manager's own log messages via async queue |

### Key Details
- `/ws/logs`: Reconnects automatically when container stops/restarts (2-second backoff)
- `/ws/manager-logs`: Uses `asyncio.Queue` for non-Docker log delivery
- Both handle disconnection gracefully with try/catch on WebSocket close

---

## 9. MQTT Telemetry Integration

### Backend Setup (`main.py`)
- Connects to MQTT broker at startup (configurable via environment variables)
- Subscribes to configured topics
- On message: updates `_stats_cache` with telemetry data
- Uses `paho-mqtt` library with `loop_start()` for background processing

### Key Details
- Config from `MQTT_CONFIG` dict (broker, user, pass, topics)
- Telemetry used for system stats beyond just docker-inspect metrics
- Likely receives GPU/CPU/temperature data from Frigate/NVR sensors

---

## 10. Markdown File Management

### Backend Endpoints
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/md-files` | List all `.md` files in the compose directory (supports glob patterns) |

### Key Details
- Supports file pattern matching via `glob.glob()`
- Returns full paths of discovered markdown files

---

## 11. Benchmark System

### Backend Endpoints (`benchmark_router.py`)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/benchmarks/rankings` | Get benchmark rankings sorted by score |
| GET | `/api/benchmarks/models?platform=...&quant=` | Filter benchmarks by platform and quantization |
| DELETE | `/api/benchmarks/model/{name}` | Delete a model's benchmark data |

### Frontend (`bench_ui.js`)
- **`loadRankings()`** — Fetches and renders ranking table with scores, quantization, performance metrics
- Color-coded score indicators (green for high performers)
- Filtering controls for platform/quantization type

---

## 12. Compose Content Viewer

### Backend Endpoints
| Method | Path | Description |
|--------|------|-------------|
| GET | `/compose_content` | Read docker-compose.yml content as plain text |

### Frontend (`server_ctrl.js`)
- **`fetchComposeContent()`** — Displays raw compose file in a viewer div
- Toggle visibility of compose content and models.ini editor (persisted to localStorage)

---

## 13. PWA Support

### Endpoints
| Method | Path | Description |
|--------|------|-------------|
| GET | `/manifest.json` | Web App Manifest for installable PWA support |

### Manifest Details
- Name: "LLM Server Manager"
- Short name: "LLM Mgr"
- Display mode: standalone
- Theme color: `#6366f1` (indigo)
- Dark background: `#0f172a`
- SVG icons (192x192 and 512x512) with lightning bolt design

---

## 14. Memory Management & Recovery

### Backend Functions (`main.py`)
- **`perform_memory_cleanup(reason)`** — Three-step cleanup:
  1. Unload ComfyUI models via API (`/unload_models`, `/free`)
  2. System RAM cleanup (gc.collect + malloc_trim)
  3. Restart ComfyUI container to fully release host memory

- **`ensure_vram_available()`** — Checks VRAM percentage:
  - If > emergency threshold → kills LLM server entirely
  - If > critical threshold → triggers memory cleanup
  - Thresholds defined as `VRAM_EMERGENCY_THRESHOLD` and `VRAM_CRITICAL_THRESHOLD` constants

---

## Summary of All Frontend JavaScript Modules

| File | Purpose |
|------|---------|
| `server_ctrl.js` | Server control, model management, system stats polling, INI editing — **core module** |
| `ui_core.js` | Shared UI utilities: showMessage, setLoading, Braille visualization, color helpers |
| `router.js` | Tab navigation (llama-cpp / image-gen / gallery / chat / benchmarks) |
| `chat_ctrl.js` | WebSocket-based AI chat interface |
| `gallery_ctrl.js` | Image gallery browsing and file operations |
| `bench_ui.js` | Benchmark data visualization and filtering |
| `downloader_ctrl.js` | Download progress tracking UI |

---

## Key Technical Observations for Mobile App Design

1. **No SPA framework** — All JS is vanilla, no state management library, minimal routing
2. **WebSocket-first real-time updates** — Generation status, logs, stats all use WebSockets or polling
3. **No auth layer** — No authentication/authorization anywhere in the stack
4. **Docker-in-Docker pattern** — Manager talks to Docker daemon via mounted socket
5. **VRAM is the primary resource constraint** — Everything (model loading, image generation) guards against VRAM exhaustion
6. **ComfyUI uses fixed client_id = "llm-manager"** for pipeline state reuse
7. **Generation state survives page refreshes** — Global in-memory state + WebSocket replay on reconnect
8. **No database** — Configuration stored as INI files and plain text, benchmarks in JSON files
9. **Mobile-first considerations missing**: No responsive layout optimization visible, no touch gestures, no offline PWA service worker registration (manifest exists but no SW)
