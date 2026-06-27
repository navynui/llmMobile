import os

# --- Patch README.md ---
with open('README.md', 'r', encoding='utf-8') as f:
    readme = f.read()

old_layout = """``` llmMobile/
├── main.py # Primary FastAPI application (Server controls, SQLite integration, API)
├── Dockerfile # Multi-stage Dockerfile (Stage 1: Vite Build, Stage 2: Python environment)
├── package.json # Frontend dependencies and Vite build scripts
├── requirements.txt # Python requirements (FastAPI, Docker, httpx, etc.)
├── MyZimage_turbo.json # Turbo Image Generator template
├── PROMPTS # Predefined prompt templates
├── benchmark.md # System implementation plan and references
├── public/ # Static frontend assets (icons, images)
└── src/ # Frontend source code
    ├── index.css # Core styling tokens, animations, and typography
    ├── llm-app.js # SPA entry point, state controller, SSE client
    ├── components/ # Reusable Lit web components
    │   ├── server-tab.js # llama-server manager, logs, models.ini panel
    │   ├── chat-tab.js # Streaming OpenAI chat client
    │   ├── generator-tab.js # Image generation prompt/slider console
    │   ├── gallery-tab.js # Responsive photo gallery & metadata inspector
    │   └── stub-tabs.js # Benchmarks, models config, and settings panels
    └── utils/ # Helper classes and formatting routines
```"""

new_layout = """``` llmMobile/
├── app/
│   └── main.py # Thin FastAPI router — delegates all logic to services/
├── services/ # Backend service layer (modular business logic)
│   ├── docker_svc.py # Container lifecycle & system stats
│   ├── model_svc.py # Model loading, scanning, deletion
│   ├── chat_svc.py # Streaming chat orchestration
│   ├── sse_svc.py # Server-Sent Event management
│   ├── comfy_svc.py # ComfyUI image pipeline integration
│   ├── queue_svc.py # Benchmark queue orchestration
│   ├── gallery_svc.py # Image gallery & metadata handling
│   ├── push_svc.py # Push notification service
│   ├── download_svc.py # Model download management
│   ├── benchmark_svc.py # Benchmark run & scoring logic
│   └── judge_svc.py # AI-as-a-Judge evaluation & JSON parsing
├── utils/ # Shared utilities
│   ├── common.py # Constants, paths, helpers
│   ├── db_utils.py # SQLite connection & transaction helpers
│   └── bench_log.py # Benchmark logging & rotation
├── models/
│   └── requests.py # Pydantic request schemas
├── tests/ # Automated verification (Phase H)
│   ├── conftest.py
│   └── test_endpoints.py
├── main.py # Re-exports app for Uvicorn
├── Dockerfile # Multi-stage Dockerfile (Vite build + Python env)
├── package.json # Frontend dependencies & Vite scripts
├── requirements.txt # Python dependencies
├── MyZimage_turbo.json # Turbo Image Generator template
├── PROMPTS # Predefined prompt templates
├── benchmark.md # System implementation plan
├── public/ # Static frontend assets
└── src/ # Frontend source code (Lit + Vite)
    ├── index.css # Core styling tokens, animations, and typography
    ├── llm-app.js # SPA shell, view router, SSE client, toast host
    ├── assets/
    │   └── icons.js # Centralized SVG icon set
    ├── components/ # Lit web components
    │   ├── _primitives.js # Shared CSS primitives (card, buttons, etc.)
    │   ├── _confirm.js # Async confirm-dialog primitive
    │   ├── _data-table.js # Generic sortable/paginated data table
    │   ├── server-tab.js # Thin orchestrator for server sub-components
    │   ├── server-status-card.js # Status display & start/stop/restart
    │   ├── models-config-editor.js # models.ini editor with save/scan/delete
    │   ├── model-downloader.js # Model search & download queue UI
    │   ├── server-logs.js # Live log viewer with auto-scroll
    │   ├── chat-tab.js # Streaming chat interface
    │   ├── generator-tab.js # ComfyUI prompt & parameter console
    │   ├── gallery-tab.js # Responsive image gallery & inspector
    │   ├── toast-host.js # Global toast notification singleton
    │   ├── benchmark-tab.js # Thin orchestrator for benchmark sub-components
    │   ├── benchmark-table.js # Sortable/filterable benchmark results
    │   ├── benchmark-runner.js # Queue builder & live progress tracker
    │   └── models-config.js # Database inspector & file management
    └── utils/
        ├── api.js # Centralized fetch wrapper with toast/loading support
        ├── polling.js # Polling mixin/hook with concurrency guards
        ├── state-mixin.js # Loading/error state mixin
        └── toast.js # Toast.show() static service
```"""

assert old_layout in readme, 'Layout block not found in README.md'
readme = readme.replace(old_layout, new_layout)

# --- Patch 2: Architectural Evolution section ---
old_arch = """## 🏗️ Architectural Evolution (Phase G)
The core backend (`app/main.py`) has been refactored into a **thin router**. All functional logic now resides in dedicated service modules under `services/`. This fully modularizes the codebase, improves testability, and enforces strict separation of concerns.
Phase H verification tests have been added to ensure endpoint contract compliance."""

new_arch = """## 🏗️ Architectural Evolution
### Phase G — Thin Router & Service Layer
The core backend (`app/main.py`) has been refactored into a **thin router**. All functional logic now resides in dedicated service modules under `services/`. This fully modularizes the codebase, improves testability, and enforces strict separation of concerns.
Phase H verification tests have been added to ensure endpoint contract compliance.

### Phase I — Frontend Component Refactor
The monolithic frontend tabs have been decomposed into a library of reusable, single-responsibility components:
- **Shared Primitives:** `_primitives.js` consolidates CSS (cards, buttons, pills, modals) into one source of truth.
- **Generic Widgets:** `_data-table` (sort/paginate), `_confirm` (async confirmation), `toast-host` (global notifications).
- **Split Tabs:** `server-tab` and `benchmark-tab` are now thin orchestrators composing child elements (`<server-status-card>`, `<models-config-editor>`, `<model-downloader>`, `<server-logs>`, `<benchmark-table>`, `<benchmark-runner>`).
- **Shared Utilities:** `utils/api.js` centralizes fetch logic with built-in toast/loading support; `utils/polling.js` manages safe async intervals; `utils/state-mixin.js` standardizes loading/error state patterns.
- **Asset Centralization:** `assets/icons.js` replaces inline SVGs across every component.

All changes are build-safe (`npm run build` passes), visually pixel-identical to the pre-refactor baseline, and fully backward-compatible with existing backend APIs."""

assert old_arch in readme, 'Arch Evolution block not found in README.md'
readme = readme.replace(old_arch, new_arch)

with open('README.md', 'w', encoding='utf-8') as f:
    f.write(readme)

print('README.md patched successfully')
