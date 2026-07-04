import os
import re

with open("services/download_svc.py", "r") as f:
    content = f.read()

# state.py is already created
# hf.py is already created

# Extract worker.py
worker_start = content.find("async def download_queue_worker():")
api_start = content.find("# ── Public API functions")

worker_code = content[worker_start:api_start]

worker_py = f"""import os
import time
import shutil
import asyncio
import httpx
from utils.common import MODELS_DIR, MODES_INI_PATH
from utils.db_utils import get_db_conn, _clean_model_id
from services.model_svc import _add_to_models_ini
from .state import _downloads_lock, _active_downloads, _download_queue

{worker_code}"""

with open("services/download/worker.py", "w") as f:
    f.write(worker_py)

# Extract api.py
api_code = content[api_start:]

api_py = f"""import os
import re
import urllib.parse
from fastapi import HTTPException
from utils.common import MODELS_DIR, MODES_INI_PATH, get_quantization_from_name
from utils.db_utils import get_db_conn, _clean_model_id
from models.requests import DownloadRequest
from services.model_svc import _add_to_models_ini
from services.sse_svc import broadcast_notification
from .state import _downloads_lock, _active_downloads, _download_queue

{api_code}"""

# Remove search_hf_models and get_hf_model_details from api_code as they are in hf.py
api_py = re.sub(r'async def search_hf_models.*?async def get_hf_model_details.*?def download_model', 'def download_model', api_py, flags=re.DOTALL)


with open("services/download/api.py", "w") as f:
    f.write(api_py)

init_py = """from .state import init_download_queue
from .hf import search_hf_models, get_hf_model_details
from .worker import download_queue_worker, _download_model_task
from .api import download_model, get_downloads_status, scan_and_register_models, stop_download, resume_download, cancel_download, clear_finished_downloads
from utils.common import get_quantization_from_name # re-export
"""

with open("services/download/__init__.py", "w") as f:
    f.write(init_py)

shim_py = """from services.download import *
"""

with open("services/download_svc.py", "w") as f:
    f.write(shim_py)
