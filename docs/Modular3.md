# Fail-Proof Modularization Plan – `main.py` (v3)

> **Purpose** — Split the 3047-line monolith into focused modules while guaranteeing zero API regressions. No frontend changes permitted.

---

## 🚨 What Went Wrong Before: Root-Cause Analysis

### TODO.md Flaws
1. **"No endpoint removal" rule was never enforced as a code-level check** — The plan said "do not remove endpoints" but relied on human discipline rather than automated verification. A missing import or typo would silently break the frontend without anyone noticing.
2. **Global state ownership was ambiguous** — Variables like `_COMFY_HTTP`, `_queue_lock`, `_downloads_list` were mentioned as "keep module-level imports" but no one file *owns* them, so two services importing different copies creates race conditions (observed bug).
3. **The benchmark engine was too large to extract in one shot** — `run_benchmark_task` alone is 180+ lines; moving it into a new file while keeping the retry loop intact requires surgical precision that's error-prone without automated testing.

### TODO2.md Flaws
4. **No explicit dependency graph between modules** — Without knowing which module imports what, refactoring in the wrong order causes circular import errors (e.g., `judge_svc.py` needs `_get_preset_id_for_model` from `model_svc.py`, but if both are imported by main.py simultaneously they can't reference each other).
5. **No rollback strategy** — The plan assumes everything goes smoothly; when a module doesn't work, the only option is "revert everything." This means you lose hours of incremental progress and have to redo it all manually.
6. **"Test-first checkpoint" was theoretical** — There were no actual test files or snapshot comparison scripts provided. A baseline test suite was promised but never materialized.

### Both Plans' Common Flaws
7. **No atomic commit boundaries** — Extracting a module and wiring it back in are two separate steps that can fail independently. If step 2 fails, you can't undo just the wire-back; you have to revert everything back to main.py.
8. **Missing explicit file boundary documentation** — Which variables go where? What does each extracted module export vs. what is private? This was hand-waved.

---

## ✅ Fail-Proof Design Principles

### 1. Global State Ownership – One File Per Shared Variable
Every shared mutable global must have exactly one owner:

| Global Variable | Owner Module |
|----------------|-------------|
| `docker_client` | `services/docker_svc.py` |
| `_COMFY_HTTP` | `services/comfy_svc.py` |
| `_queue_lock`, `_gen_queue`, `_queue_running`, `_queue_sse_subscribers` | `services/queue_svc.py` |
| `_workflow_cache`, `_workflow_lock` | `services/comfy_svc.py` (same file as _COMFY_HTTP) |
| `_downloads_lock`, `_active_downloads`, `_download_queue` | `services/download_svc.py` |
| `_sse_subscribers` | `services/sse_svc.py` |
| `_stats_cache`, `_stats_lock` | `utils/common.py` (read-only shared access) |
| `_benchmark_running`, `_benchmark_lock`, `_benchmark_progress` | `services/benchmark_svc.py` |
| VAPID keys, subscriptions | `services/push_svc.py` |

**Rule:** No service file may import a global from another service file. Instead, the owner module exports it as a **named constant/function**. Other files get references through the owner's public API:
```python
# In services/queue_svc.py (owner)
_gen_queue = []  # ← defined here

def get_queue_snapshot() -> list: ...
def broadcast_queue() -> None: ...
# No need to export _gen_queue directly — other files call the functions above
```

### 2. Thin Router Pattern – main.py Is a Facade, Not an Orchestration Hub
`main.py` contains **only**:
- `app = FastAPI(...)` creation
- Route definitions that delegate to service functions
- Static file mounts and PWA manifest
- Startup event (which only calls service-level init functions)

**Every route must call exactly one imported function.** No inline logic.

### 3. Strict Dependency Order – Bottom-Up, Layered
```
Phase A: Pure utilities (no dependencies on FastAPI or other services)
    → utils/common.py
    → utils/db_utils.py
    → utils/bench_log.py

Phase B: Service layer (depends only on Phase A utilities)
    → services/docker_svc.py
    → services/model_svc.py
    → services/chat_svc.py
    → services/comfy_svc.py
    → services/gallery_svc.py
    → services/download_svc.py
    → services/benchmark_svc.py
    → services/judge_svc.py
    → services/sse_svc.py
    → services/push_svc.py

Phase C: Thin router (depends on Phase B)
    → app/main.py
```

### 4. Atomic Module Extraction – One File at a Time, Full End-to-End Test
**Never extract half a module.** When you move `services/benchmark_svc.py`:
1. Extract ALL functions and state from main.py for that domain
2. Wire them into the new file completely
3. Update main.py to import and delegate
4. **Test every affected endpoint** (not just the ones directly related)

### 5. Automated API Contract Verification – No Manual Testing
After each phase, run the full pytest suite inside Docker — **this is the only verification that matters**:

```bash
docker compose exec llm-mobile python -m pytest tests/ -v --tb=short
```

The inline AST check from earlier plans was fragile. The real contract is: *every route returns a valid HTTP response with the expected keys*. That's what `tests/test_endpoints.py` validates — no exceptions.

**Per-phase verification checklist:**
1. Build image (if adding new imports): `docker compose build llm-mobile`
2. Run tests: `docker compose exec llm-mobile python -m pytest tests/ -v --tb=short`
3. If any route returns a 404, it means an import is missing or the function wasn't wired up — **stop and fix before proceeding**.

### 6. Rollback Strategy – Per-Phase Git Commits
Each phase is a single git commit. If Phase B fails, you revert **only** the last N commits (the ones in that phase), not the entire refactor. The main.py from before the refactor is preserved as `main.py.bak` in each working directory.

---

## 📂 Final Directory Structure

```
llmMobile/
├─ app/
│  ├─ __init__.py              # Empty — package marker
│  └─ main.py                  # Thin router: imports + route delegations only
│
├─ services/
│  ├─ __init__.py              # Empty
│  ├─ docker_svc.py            # _container_info, get_status, start_llm, stop_llm, get_system_stats
│  ├─ model_svc.py             # _get_preset_id_for_model, _clean_model_id, proxy_llm_load/unload, 
│  │                              _add_to_models_ini, _remove_from_models_ini
│  ├─ chat_svc.py              # proxy_chat (streaming), get_vision_capabilities
│  ├─ comfy_svc.py             # _COMFY_HTTP (owned global), _workflow_cache,
│  │                              _load_workflow, _build_workflow, _queue_comfy,
│  │                              _wait_comfy, _get_comfy_history, _write_sidecar
│  ├─ gallery_svc.py           # browse_gallery, get_all_folders, gallery_mkdir/move/delete,
│  │                              _read_sidecar
│  ├─ download_svc.py          # _downloads_lock (owned global), _active_downloads,
│  │                              _download_queue, _download_queue_worker, _download_model_task,
│  │                              search_hf_models, get_hf_model_details, download_model,
│  │                              get_downloads_status, scan_and_register_models
│  ├─ benchmark_svc.py         # _benchmark_running (owned global), _benchmark_lock,
│  │                              _benchmark_progress, log_benchmark/log_benchmark_error/progress,
│  │                              run_benchmark_task, run_benchmark_queue_task
│  ├─ judge_svc.py             # query_judge_model, parse_judge_json, get_gold_key, 
│  │                              get_quantization_from_name, judge_benchmark
│  ├─ sse_svc.py               # _sse_subscribers (owned global), broadcast_notification,
│  │                              log_monitor_task, stream_status, broadcast_queue_snapshot
│  └─ push_svc.py              # VAPID keys, subscriptions, _send_push_notification,
│  │                              _init_vapid_keys, _load_subscriptions, _save_subscriptions
│  └─ queue_svc.py             # _queue_lock (owned global), _gen_queue, _queue_running,
│  │                              _queue_sse_subscribers, _get_queue_snapshot,
│  │                              _load_persisted_queue, _save_queue_to_disk,
│  │                              _broadcast_queue, _queue_worker, submit_to_queue,
│  │                              get_queue, cancel_queue_item, clear_completed,
│  │                              stream_queue
│
├─ utils/
│  ├─ __init__.py              # Empty
│  ├─ common.py                # safe_join, _deep_copy, get_local_stats,
│  │                              MQTT_CONFIG (read-only), VAPID keys stubs,
│  │                              LLM_COMPOSE_DIR, COMFYUI_HOST, etc. (constants)
│  ├─ db_utils.py              # get_db_conn(), consolidate_database()
│  └─ bench_log.py             # BENCHMARK_LOG_DIR, BENCHMARK_EXECUTION_LOG,
│                               _rotate_benchmark_log_if_needed
│
├─ models/
│  ├─ __init__.py              # Empty
│  ├─ requests.py              # All Pydantic request models: ModelActionRequest, ModelsIniRequest,
│  │                              GenerateRequest, MkdirRequest, MoveRequest, DeleteRequest,
│  │                              DownloadRequest, BenchmarkRunRequest, BenchmarkQueueRequest,
│  │                              JudgeRequest
│  └─ responses.py             # Empty for now — add response schemas later if needed
│
├─ tests/                       # Docker-internal test suite (see Phase A)
│  ├─ __init__.py              # Empty
│  ├─ conftest.py              # Pytest fixtures — patches docker_client, HTTP clients
│  └─ test_endpoints.py         # Automated endpoint verification — runs inside Docker container
│
├─ main.py.bak                  # Backup of original main.py (preserved before any changes)
```

---

## 📋 Phase-by-Phase Execution Plan

### Phase A: Baseline & Guard Rails (0.5 day) ⚠️ Do NOT skip this phase

**Goal:** Establish automated verification so refactoring cannot silently break the API contract.
**All tests run inside the Docker container** — same image, same environment, same network config as production.

#### Prerequisites: Add to `Dockerfile`
```dockerfile
# In your existing Dockerfile, add these lines after pip install dependencies:
RUN pip install --no-cache-dir pytest httpx requests-mock
COPY tests/ /app/tests/
```

#### Step 1: Create test infrastructure (on host)
1. Copy `main.py` → `main.py.bak`
2. Create `tests/conftest.py` — fixtures that patch docker_client and HTTP clients:

```python
import sys, os
from unittest.mock import MagicMock, patch
from httpx import ASGITransport, AsyncClient
from fastapi.testclient import TestClient
import docker as _docker_module

def pytest_collection_modifyitems(config, items):
    skip = pytest.mark.skip(reason="Docker socket not mounted in test container")
    for item in items:
        if "needs_docker" in item.keywords:
            item.add_marker(pytest.mark.xfail(
                os.environ.get("CI_SKIP_DOCKER_TESTS", "") == "1",
                reason="Docker daemon not available"
            ))

@pytest.fixture(scope="module")
def mock_docker():
    """Patch docker_client to simulate both containers running."""
    docker_mock = MagicMock()
    container_mock = MagicMock()
    container_mock.logs.return_value = b"container log output\n"
    container_mock.status = "running"
    docker_mock.containers.get.return_value = container_mock
    with patch.dict(sys.modules, {'docker': MagicMock(DockerClient=lambda *a, **k: docker_mock)}):
        yield docker_mock
```
3. Create `tests/test_endpoints.py` — verify every route exists and returns expected status codes:

```python
from fastapi.testclient import TestClient

def test_status_endpoint(mock_docker):
    from app.main import app as fastapi_app
    client = TestClient(fastapi_app)
    resp = client.get("/status")
    assert resp.status_code in (200, 400)  # depends on container state
    data = resp.json()
    assert "server" in data or "error" in data
```

#### Step 2: Build and run tests inside Docker
```bash
# Build the image with test dependencies
docker compose build llm-mobile

# Run tests from outside — uses exec, no login needed
docker compose exec llm-mobile python -m pytest tests/ -v --tb=short

# Or for interactive debugging:
docker compose exec llm-mobile python -m pytest tests/ -v --capture=no
```

**Key advantage over host-based testing:** When Docker socket is mounted (`/var/run/docker.sock` in the container), `docker_client` actually connects to the daemon. So `/status`, `/system_stats`, `/start`, `/stop` return **real data** — no mocking needed for those endpoints. ComfyUI access also works because `COMFYUI_HOST=host.docker.internal:8188` is already configured in the container.

#### Step 3: Capture baseline
Run the test suite against the original main.py. If all routes return expected status codes, you have your green-light gate for Phase B onward.

**Success criterion:** All 30+ endpoints return expected status codes without import errors or routing errors when run inside Docker against the original main.py.

> **Important:** The `tests/` directory and its contents must be committed to the repo. They are copied into the Docker image by `COPY tests/ /app/tests/` in the Dockerfile, so they live alongside your source code — not as an afterthought. Treat them like any other production artifact.

#### Endpoints to verify:
> **Note:** Status codes below are for the *original main.py* run inside Docker. Some endpoints that return 502 on host (no llm-server available) will actually work here because `docker_client` connects to the real daemon and `/api/llm/*` routes proxy to a running container.

| Method | Path | Expected Status Code | Notes |
|--------|------|---------------------|-------|
| GET | /status | 200 | Real Docker data — both containers visible |
| GET | /system_stats | 200 | Real CPU/RAM from running container |
| POST | /start | 200 or 409 (already running) | Works because docker_client is real |
| POST | /stop | 200 | Works because docker_client is real |
| GET | /models | 200 | Lists models from the loaded container |
| DELETE | /models/{filename} | 200 or 404 (not found) | Depends on whether file exists |
| GET | /api/models_ini | 200 | Reads config file directly, always works |
| POST | /api/models_ini | 200 | Writes config file directly, always works |
| GET | /api/llm/models | 200 or 503 (llm-server not running) | Depends on llm-server container state |
| POST | /api/llm/models/load | 200 or 409 (already loaded) | Proxies to actual llm-server |
| POST | /api/llm/models/unload | 200 or 400 (nothing to unload) | Proxies to actual llm-server |
| GET | /models/vision-capabilities | 200 or 503 | Depends on llm-server container state |
| GET | /events/status | 200 | SSE — always returns immediately with current status |
| GET | /events/queue | 200 | SSE — always returns immediately (may be empty) |
| POST | /api/generate/queue | 200 or 400 | Depends on ComfyUI availability, but route exists |
| GET | /api/generate/queue | 200 | Always works — reads queue file from disk |
| DELETE | /api/generate/queue/{queue_id} | 200 or 404 | Route always exists |
| DELETE | /api/generate/queue | 200 | Route always exists, may have nothing to clear |
| GET | /api/gallery/browse | 200 | Reads image files from disk, no external deps |
| GET | /api/gallery/all_folders | 200 | Same as above |
| POST | /api/gallery/mkdir | 200 or 409 (already exists) | Filesystem operation, always works |
| POST | /api/gallery/move | 200 or 400 | Filesystem operation |
| POST | /api/gallery/delete | 200 or 400 | Filesystem operation |
| GET | /api/models/search | 200 | Queries HuggingFace, may be slow but route works |
| GET | /api/models/details | 200 or 503 | Depends on llm-server availability |
| POST | /api/models/download | 200 | Downloads a file to disk, always works |
| GET | /api/models/downloads | 200 | Reads download state from memory/disk |
| POST | /api/models/scan_and_register | 200 | Scans filesystem for .gguf files |
| GET | /api/benchmarks | 200 | Reads from SQLite database |
| GET | /api/benchmarks/details | 200 or 404 | Depends on whether a run exists in DB |
| POST | /api/benchmarks/run | 400 (no model loaded) | Route works, but needs llm-server to be running |
| POST | /api/benchmarks/queue/run | 400 (no model loaded) | Same as above |
| GET | /api/benchmarks/status | 200 | Returns in-memory progress dict |
| GET | /api/benchmarks/logs | 200 | Reads log file from disk |
| GET | /api/benchmarks/outputs | 200 | Lists JSON output files from disk |
| POST | /api/benchmarks/judge | 400 (no model loaded) | Route works, needs llm-server for grading |
| GET | /api/logs | 200 or 500 | Depends on docker_client availability |
| GET | /manifest.json | 200 | Static JSON response, always works |

---

### Phase B: Pure Utilities (~0.75 day)

**Goal:** Extract functions with zero dependencies on FastAPI or other services. These are the safest to move first.

#### Module 1: `utils/common.py`
Extract from main.py lines ~40-205:
```python
# Constants (module-level, read-only)
LLM_COMPOSE_DIR = os.environ.get("LLM_COMPOSE_DIR", "/llm-server")
COMFYUI_HOST    = os.environ.get("COMFYUI_HOST", "host.docker.internal:8188")
COMFY_CLIENT_ID = "llm-mobile"
NODE_PROMPT_TEXT = "57:27"
NODE_RESOLUTION  = "57:13"
NODE_KSAMPLER    = "57:3"

VRAM_CRITICAL_THRESHOLD  = 90.0
VRAM_EMERGENCY_THRESHOLD = 95.0

MQTT_CONFIG = { ... }  # read-only

def safe_join(base_dir: str, *path_parts: str) -> str: ...
def _deep_copy(d: dict) -> dict: ...
def get_local_stats() -> dict: ...
def _on_mqtt_message(client, userdata, msg): ...
def _start_mqtt_listener(): ...
async def _local_stats_poller(): ...
```

**IMPORTANT:** The constants `LLM_COMPOSE_DIR`, `COMFYUI_HOST`, `COMFY_CLIENT_ID` are used by both main.py AND services/comfy_svc.py. Both files import from `utils.common`. This is the one place where shared state ownership works: `utils/common.py` owns the definitions, all other modules read them.

#### Module 2: `utils/db_utils.py`
```python
DB_PATH = "/app/llm_bench.db" if os.path.exists("/app") else "/home/nui/llmaCPP/llm_bench.db"

def get_db_conn() -> sqlite3.Connection: ...

# consolidate_database() — move entirely here. It's ~80 lines but has NO dependencies on
# any other service. It only calls _clean_model_id (import from utils/common.py).
```

#### Module 3: `utils/bench_log.py`
```python
BENCHMARK_LOG_DIR = "/app/benchmark_results" if os.path.exists("/app") else "/home/nui/llmaCPP/benchmark_results"
BENCHMARK_EXECUTION_LOG = os.path.join(BENCHMARK_LOG_DIR, "benchmark_execution.log")

def _rotate_benchmark_log_if_needed(): ...
```

#### Module 4: `models/requests.py`
Move ALL Pydantic models here — this is critical because other service files need to import them. No more importing from main.py:
```python
from pydantic import BaseModel
class ModelActionRequest(BaseModel): model: str
class ModelsIniRequest(BaseModel): content: str
class GenerateRequest(BaseModel): prompt: str; resolution: str = "1920x1088"; num_images: int = 1; seed: Optional[int] = None
class MkdirRequest(BaseModel): current_path: str; folder_name: str
class MoveRequest(BaseModel): current_path: str; filenames: list; destination: str
class DeleteRequest(BaseModel): current_path: str; filenames: list; folders: list
class DownloadRequest(BaseModel): repo_id: str; filename: str
class BenchmarkRunRequest(BaseModel): judge_model_id: Optional[str] = None
class BenchmarkQueueRequest(BaseModel): models: list[str]; judge_model_id: str
class JudgeRequest(BaseModel): run_id: Optional[str] = None; judge_model_id: Optional[str] = None
```

#### Validation after Phase B:
- `python -c "import utils.common"` — no import errors
- `python -c "from models.requests import ModelActionRequest"` — works
- All existing routes still work (pytest check)

---

### Phase C: Service Layer – Docker & Model (~0.75 day)

#### Module 1: `services/docker_svc.py`
**Owns:** `docker_client` global, `_stats_cache`, `_stats_lock`, MQTT listeners

```python
import docker as _docker_module

# OWNED GLOBAL — no other file may import this directly from main.py
_docker_client = None
try:
    _docker_client = _docker_module.DockerClient(base_url="unix://var/run/docker.sock")
except Exception as e:
    print(f"Error connecting to Docker socket: {e}")

_stats_cache: dict = {"data": {...}}  # same structure, initialized here
_stats_lock = threading.Lock()

def get_docker_client() -> _docker_module.DockerClient | None:
    return _docker_client

def set_docker_client(client): ...  # for testing only

# Container/status helpers
def _container_info(name: str) -> dict: ...
def get_status(): ...
def get_system_stats(): ...
def start_llm(): ...
def stop_llm(): ...
```

**Key difference from TODO2:** `_stats_cache` and `_stats_lock` are OWNED here, not in utils/common.py. The `get_local_stats()` function is a pure utility (no dependencies) so it stays in utils/common.py as read-only — but the cache itself lives here because startup_event writes to it.

#### Module 2: `services/model_svc.py`
**Owns:** `_get_preset_id_for_model`, `_clean_model_id`, model INI helpers, LLM proxy functions

```python
# OWNED GLOBALS — none of these live in main.py anymore
def _get_preset_id_for_model(model_id: str) -> str: ...
def _clean_model_id(mid: str) -> str: ...
def _add_to_models_ini(filename: str): ...
def _remove_from_models_ini(filename: str): ...

# LLM proxy endpoints (these are the only FastAPI-adjacent functions; they import from models.requests)
async def proxy_llm_load(req: ModelActionRequest): ...
async def proxy_llm_unload(req: ModelActionRequest): ...
async def get_vision_capabilities(): ...
```

**Key difference:** `_get_preset_id_for_model` is a pure function with NO dependencies. It only calls `httpx.AsyncClient`. Move it entirely to this module. The LLM server URL logic (`get_llm_server_url()`) is also here since it's model-specific infrastructure.

#### Validation after Phase C:
- All routes that call `_container_info`, `get_status`, `start_llm`, `stop_llm` still work
- Pydantic models import cleanly from `models.requests`

---

### Phase D: Service Layer – Chat & SSE (~0.5 day)

#### Module 1: `services/chat_svc.py`
```python
from fastapi import Request
from fastapi.responses import StreamingResponse

async def proxy_chat(request: Request): ...
# Already uses httpx.AsyncClient internally, no external dependencies beyond models.requests for validation
```

**IMPORTANT:** The `_get_loaded_model()` function is here because it depends on the LLM server and is only used by the chat endpoint. Move both together.

#### Module 2: `services/sse_svc.py`
**Owns:** `_sse_subscribers` global, broadcast_notification, log_monitor_task

```python
_sse_subscribers = []  # OWNED GLOBAL — no other file touches this directly

def broadcast_notification(message: str): ...
async def log_monitor_task(): ...
async def stream_status(request: Request, since: str = "0"): ...

# Also owns the startup_event hook for SSE init — main.py just calls sse_svc.startup()
```

---

### Phase E: Service Layer – ComfyUI & Gallery (~1.5 day) ⚠️ Complex

#### Module 1: `services/comfy_svc.py`
**Owns:** `_COMFY_HTTP`, `_workflow_cache`, `_workflow_lock`

```python
import httpx as _httpx_module

_COMFY_HTTP = _httpx_module.Client(base_url=f"http://{utils.common.COMFYUI_HOST}", timeout=60)  # OWNED GLOBAL

def get_comfy_http() -> httpx.Client: ...
def set_comfy_http(client): ...  # for testing only

_workflow_cache: Optional[dict] = None
_workflow_lock = threading.Lock()

def _load_workflow() -> dict: ...
def _build_workflow(prompt, resolution, seed, queue_id, img_index) -> dict: ...
def _queue_comfy(wf: dict) -> tuple[str, list]: ...
def _wait_comfy(prompt_id, on_progress=None, timeout=300): ...
def _get_comfy_history(prompt_id) -> Optional[dict]: ...
def _write_sidecar(image_filename, prompt, resolution, seed, queue_id, model="z-image-turbo"): ...
```

#### Module 2: `services/gallery_svc.py`
```python
from utils.common import safe_join as _safe_join

def _read_sidecar(image_path: str) -> dict: ...
def browse_gallery(path="", page=1, limit=24): ...
def get_all_folders(): ...
def gallery_mkdir(req: MkdirRequest): ...
def gallery_move(req: MoveRequest): ...
def gallery_delete(req: DeleteRequest): ...
```

#### Module 3: `services/queue_svc.py` ⚠️ This is the big one — owns all queue state

**Owns:** `_queue_lock`, `_gen_queue`, `_queue_running`, `_queue_sse_subscribers`, disk persistence, VAPID keys, subscriptions, push notifications, queue worker

```python
# OWNED GLOBALS — ALL of these live here, nowhere else
_QUEUE_LOCK = threading.Lock()  # renamed from _queue_lock for clarity in ownership
_gen_queue: list = []
_queue_running = False
_queue_sse_subscribers: list = []

_QUEUE_PERSIST_PATH = os.path.join(utils.common.IMAGE_GEN_OUTPUT, "generation_queue.json")

# Also owns VAPID key state (these are queue-service-adjacent globals)
VAPID_PUBLIC_KEY = ""
VAPID_PRIVATE_KEY = ""
VAPID_KEYS_FILE = os.path.join(IMAGE_GEN_OUTPUT, "vapid_keys.json")
_push_subscriptions: list = []
SUBS_FILE_PATH = os.path.join(IMAGE_GEN_OUTPUT, "push_subscriptions.json")

# Queue worker (async)
async def _queue_worker(): ...
def get_queue_snapshot() -> list: ...
def load_persisted_queue(): ...
def save_queue_to_disk(): ...
def broadcast_queue_snapshot(): ...

# VAPID / push helpers
def init_vapid_keys(): ...
def load_subscriptions(): ...
def save_subscriptions(): ...
def send_push_notification(title, body): ...

# SSE queue streaming
async def stream_queue(request: Request): ...

# API endpoints (these are the only FastAPI-adjacent functions in this file)
class GenerateRequest(BaseModel): ...  # or import from models.requests
async def submit_to_queue(req: GenerateRequest): ...
def get_queue(): ...
async def cancel_queue_item(queue_id: str): ...
async def clear_completed(): ...
```

---

### Phase F: Service Layer – Download, Benchmark & Judge (~2.5 day) ⚠️ Critical

#### Module 1: `services/download_svc.py`
**Owns:** `_downloads_lock`, `_active_downloads`, `_download_queue`

```python
import asyncio as _asyncio_module

# OWNED GLOBALS
_downloads_lock = threading.Lock()
_active_downloads: Dict[str, Dict[str, Any]] = {}
_download_queue = _asyncio_module.Queue()

async def download_queue_worker(): ...
async def download_model_task(repo_id, filename): ...
def search_hf_models(q: str): ...  # FastAPI-adjacent — imports models.requests
def get_hf_model_details(repo_id: str): ...  # FastAPI-adjacent
def download_model(req: DownloadRequest): ...  # FastAPI-adjacent
def get_downloads_status(): ...
def scan_and_register_models(): ...  # FastAPI-adjacent
```

#### Module 2: `services/benchmark_svc.py` ⚠️ Critical — owns benchmark state
**Owns:** `_benchmark_running`, `_benchmark_lock`, `_benchmark_progress`, all logging functions, both execution tasks

```python
import asyncio as _asyncio_module
from fastapi import BackgroundTasks, HTTPException  # FastAPI imports needed for route signatures

# OWNED GLOBALS
_benchmark_running = False
_benchmark_lock = _asyncio_module.Lock()
_benchmark_progress: dict = { ... }  # initialized here with defaults

def log_benchmark(msg: str): ...
def log_benchmark_error(msg: str): ...
def log_benchmark_progress(msg: str): ...

# Both execution functions — move entirely, keep retry loop intact
async def run_benchmark_task(run_id, model_id, judge_model_id): ...
async def run_benchmark_queue_task(models, judge_model_id): ...
```

#### Module 3: `services/judge_svc.py`
**Owns:** judge-related pure functions and the /judge endpoint

```python
# Pure utility (no FastAPI deps) — these are called by benchmark_svc.py AND the judge endpoint
def parse_judge_json(raw_text: str) -> dict: ...
def get_gold_key(round_name: str): ...
def get_quantization_from_name(name: str): ...
async def query_judge_model(judge_model, system_prompt, user_prompt): ...

# FastAPI-adjacent — imports models.requests for JudgeRequest
def judge_benchmark(req: JudgeRequest): ...
```

---

### Phase G: Thin Router (1 day)

**Goal:** main.py becomes a facade. Every route delegates to exactly one service function.

#### Steps:
1. Copy `main.py.bak` → `app/main.py.new` (new file, don't overwrite old yet)
2. Write imports for ALL extracted modules and functions
3. For each original `@app.get/post/delete`, replace the body with a call to the appropriate service function
4. Keep static mounts and PWA manifest at the end

#### Key rules:
- **No route is removed.** Even if it's now one line: `async def proxy_chat(request): return await chat_svc.proxy_chat(request)`
- **No new routes are added.**
- **Route signatures match exactly** — same parameter names, same types (from models.requests)
- **Exception handling stays in main.py** for HTTPException re-raising if needed

#### Example route delegation:
```python
# Before (main.py):
@app.get("/status")
def get_status():
    if not docker_client:
        raise HTTPException(status_code=500, detail="Docker client not initialized.")
    return {"server": _container_info("llm-server"), "manager": _container_info("llm-mobile")}

# After (app/main.py):
from services.docker_svc import get_status as docker_get_status
@app.get("/status")
def get_status():
    return docker_get_status()  # The service function now owns the logic
```

---

### Phase H: Automated Verification (0.5 day) ⚠️ Required before merging

1. Run `pytest tests/` — all endpoint status code checks must pass
2. Verify Docker build succeeds: `docker compose build llm-mobile && docker compose up -d`
3. Manual smoke test of every route that requires real resources (Docker, ComfyUI)
4. Git commit with message: "Phase X complete: [description]"

---

## 🔑 Critical Guardrails (Non-Negotiable)

1. **No global variable may be defined in two places.** Every shared mutable state has exactly one owner listed in the table at the top of this document.

2. **No service file may import a global from another service file.** The only cross-module dependencies are:
   - `services/*` → `utils/common.py` (constants, safe_join, _deep_copy)
   - `services/*` → `models/requests.py` (Pydantic models)
   - `services/benchmark_svc.py` → `services/judge_svc.py` (judge functions called during execution)

3. **Every route in main.py must call exactly one imported function.** No inline logic, no duplicate code paths.

4. **Phase A (automated verification) cannot be skipped.** It's the only thing that prevents silent API breakage. Tests run inside Docker — if you skip it and a route breaks after refactoring, debugging becomes impossible because you don't know what changed.

5. **Docker-internal testing is the primary verification method.** Host-based manual testing or curl commands are secondary; they confirm behavior but cannot catch import errors, missing functions, or broken wiring that only manifest inside the container's environment. Every phase must pass `docker compose exec llm-mobile python -m pytest tests/` before proceeding.

6. **Each phase is an atomic git commit.** Never have two partial phases in your working tree simultaneously.

7. **The backup file `main.py.bak` must be preserved throughout the entire process.** If Phase F fails catastrophically (e.g., benchmark engine breaks), you revert to main.py.bak and start over — but this time with a smaller scope for that phase.

8. **No frontend changes are permitted.** The API contract is sacred. If a route returns different JSON structure, it's a bug, not an opportunity to update the UI.

---

## 📊 Estimated Timeline

| Phase | Duration | Cumulative |
|-------|----------|------------|
| A: Baseline & Guard Rails | 0.5 day | 0.5 |
| B: Pure Utilities | 0.75 day | 1.25 |
| C: Docker + Model Services | 0.75 day | 2.0 |
| D: Chat + SSE Services | 0.5 day | 2.5 |
| E: ComfyUI + Gallery + Queue | 1.5 day | 4.0 |
| F: Download + Benchmark + Judge | 2.5 day | 6.5 |
| G: Thin Router | 1.0 day | 7.5 |
| H: Automated Verification | 0.5 day | 8.0 |

**Total estimated effort: ~8 days** (assuming one person working full-time)

---

*End of `TODO3.md`*
