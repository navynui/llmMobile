import os
import re

with open("services/comfy_svc.py", "r") as f:
    content = f.read()

# Define common imports to inject into each file. It's safer to include most of them
common_imports = """import os
import json
import asyncio
import datetime
import threading
import traceback
import httpx
import websocket as ws_client
from typing import Optional
import uuid

from fastapi import Request
from fastapi.responses import StreamingResponse

from models.requests import GenerateRequest
from utils.common import (
    WORKFLOW_PATH,
    KREA_WORKFLOW_PATH,
    COMFYUI_HOST,
    COMFY_CLIENT_ID,
    NODE_PROMPT_TEXT,
    NODE_RESOLUTION,
    NODE_KSAMPLER,
    NODE_KREA_PROMPT_TEXT,
    NODE_KREA_RESOLUTION,
    NODE_KREA_KSAMPLER,
    MODEL_ZIMAGE,
    MODEL_KREA,
    IMAGE_GEN_OUTPUT,
    _deep_copy,
)
"""

os.makedirs("services/comfy", exist_ok=True)

# 1. client.py
client_code = content[content.find("# ───────────────────────────────────────────────\n# ComfyUI HTTP client"):content.find("# ───────────────────────────────────────────────\n# Workflow helpers")]
with open("services/comfy/client.py", "w") as f:
    f.write("import httpx\nfrom utils.common import COMFYUI_HOST\n")
    f.write(client_code)

# 2. workflow.py
workflow_code = content[content.find("# ───────────────────────────────────────────────\n# Workflow helpers"):content.find("# ComfyUI /free endpoint")]
with open("services/comfy/workflow.py", "w") as f:
    f.write(common_imports)
    f.write(workflow_code)

# 3. comfyio.py
comfyio_code = content[content.find("# ComfyUI /free endpoint"):content.find("# ───────────────────────────────────────────────\n# Queue state")]
with open("services/comfy/comfyio.py", "w") as f:
    f.write(common_imports)
    f.write("from .client import _COMFY_HTTP\n")
    f.write(comfyio_code)

# 4. queue_state.py
queue_state_code = content[content.find("# ───────────────────────────────────────────────\n# Queue state"):content.find("# ───────────────────────────────────────────────\n# Queue worker")]
with open("services/comfy/queue_state.py", "w") as f:
    f.write(common_imports)
    f.write(queue_state_code)

# 5. worker.py
worker_code = content[content.find("# ───────────────────────────────────────────────\n# Queue worker"):content.find("# ───────────────────────────────────────────────\n# Queue route endpoints")]
with open("services/comfy/worker.py", "w") as f:
    f.write(common_imports)
    f.write("from .workflow import _build_workflow\n")
    f.write("from .comfyio import _queue_comfy, _wait_comfy, _write_sidecar, _free_comfy_cache\n")
    f.write("from .queue_state import _queue_lock, _gen_queue, _queue_running, broadcast_queue\n")
    f.write(worker_code)

# 6. api.py
api_code = content[content.find("# ───────────────────────────────────────────────\n# Queue route endpoints"):]
with open("services/comfy/api.py", "w") as f:
    f.write(common_imports)
    f.write("from .client import _COMFY_HTTP\n")
    f.write("from .queue_state import _queue_lock, _gen_queue, is_queue_running, set_queue_running, get_queue_snapshot, broadcast_queue, _queue_sse_subscribers\n")
    f.write("from .worker import queue_worker, _cancel_pending_cooldown\n")
    f.write(api_code)

# 7. __init__.py
init_code = """from .client import get_comfy_http, set_comfy_http
from .workflow import _load_workflow, _build_workflow
from .comfyio import _free_comfy_cache, _queue_comfy, _wait_comfy, _get_comfy_history, _write_sidecar
from .queue_state import get_queue_lock, get_gen_queue, is_queue_running, set_queue_running, get_queue_sse_subscribers, get_queue_snapshot, save_queue_to_disk, load_persisted_queue, broadcast_queue
from .worker import _run_subtask, _cancel_pending_cooldown, check_llama_cpp_idle, swap_vram_for_generation, _reload_llama_model, _post_queue_cleanup, queue_worker
from .api import submit_to_queue, get_queue, cancel_queue_item, clear_completed, stream_queue
"""
with open("services/comfy/__init__.py", "w") as f:
    f.write(init_code)

# 8. services/comfy_svc.py (shim)
with open("services/comfy_svc.py", "w") as f:
    f.write("from services.comfy import *\n")

