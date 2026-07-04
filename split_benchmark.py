import os
import re

with open("services/benchmark_svc.py", "r") as f:
    content = f.read()

os.makedirs("services/benchmark", exist_ok=True)

common_imports = """import os
import re
import json
import time
import uuid
import asyncio
import traceback
from typing import Optional
import httpx
from fastapi import BackgroundTasks, HTTPException

from utils.db_utils import get_db_conn, _clean_model_id
from services.vram_svc import capture_and_store_vram, wait_for_idle_trigger
from utils.bench_log import BENCHMARK_LOG_DIR, BENCHMARK_EXECUTION_LOG, _rotate_benchmark_log_if_needed
from utils.common import MODES_INI_PATH, MODELS_DIR
from models.requests import JudgeRequest, BenchmarkRunRequest, BenchmarkQueueRequest
from services.chat_svc import _get_loaded_model
from services.model_svc import _get_preset_id_for_model
from utils.common import get_quantization_from_name
"""

# state.py
state_code = content[content.find("# ── Owned globals"):content.find("# ── Logging helpers")]
state_getters = content[content.find("# ── Public getters"):content.find("# ── Benchmark execution tasks")]
with open("services/benchmark/state.py", "w") as f:
    f.write("import asyncio\n")
    f.write(state_code)
    f.write(state_getters)

# logging.py
logging_code = content[content.find("# ── Logging helpers"):content.find("# ── Public getters")]
with open("services/benchmark/logging.py", "w") as f:
    f.write("import os\nimport time\nimport traceback\nfrom utils.bench_log import BENCHMARK_LOG_DIR, BENCHMARK_EXECUTION_LOG, _rotate_benchmark_log_if_needed\nfrom .state import _benchmark_progress\n")
    f.write(logging_code)

# runner.py
runner_code = content[content.find("# ── Benchmark execution tasks"):content.find("# ── Query endpoints")]
# runner_code has some internal imports that we can adjust, or leave them since they might just work.
# Actually, runner_code refers to `get_benchmark_lock`, `get_benchmark_running` etc. It also modifies `_benchmark_progress`.
with open("services/benchmark/runner.py", "w") as f:
    f.write(common_imports)
    f.write("from .state import _benchmark_progress, _benchmark_lock, _benchmark_running, set_benchmark_running, get_benchmark_lock, get_benchmark_running\n")
    f.write("from .logging import log_benchmark, log_benchmark_error, log_benchmark_progress\n")
    f.write(runner_code)

# reader.py
reader_code = content[content.find("# ── Query endpoints"):content.find("async def run_benchmark(")]
with open("services/benchmark/reader.py", "w") as f:
    f.write(common_imports)
    f.write(reader_code)

# api.py
api_code = content[content.find("async def run_benchmark("):]
with open("services/benchmark/api.py", "w") as f:
    f.write(common_imports)
    f.write("from .state import get_benchmark_lock, get_benchmark_running, set_benchmark_running\n")
    f.write("from .runner import run_benchmark_task, run_benchmark_queue_task\n")
    f.write(api_code)

# __init__.py
init_code = """from .state import get_benchmark_progress, get_benchmark_running, get_benchmark_lock, set_benchmark_running
from .logging import log_benchmark_progress, log_benchmark_error, log_benchmark
from .runner import run_benchmark_task, run_benchmark_queue_task
from .reader import get_benchmarks, get_benchmark_details, get_benchmark_logs, get_benchmark_outputs
from .api import run_benchmark, run_benchmark_queue
"""
with open("services/benchmark/__init__.py", "w") as f:
    f.write(init_code)

shim_code = """from services.benchmark import (
    log_benchmark_progress, log_benchmark_error, log_benchmark,
    get_benchmark_progress, get_benchmark_running, get_benchmark_lock, set_benchmark_running,
    run_benchmark_task, run_benchmark_queue_task,
    get_benchmarks, get_benchmark_details, get_benchmark_logs, get_benchmark_outputs,
    run_benchmark, run_benchmark_queue
)
"""
with open("services/benchmark_svc.py", "w") as f:
    f.write(shim_code)
