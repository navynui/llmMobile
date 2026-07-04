import asyncio
import threading
from typing import Dict, Any

_downloads_lock = threading.Lock()
_active_downloads: Dict[str, Dict[str, Any]] = {}  # key: "{repo_id}/{filename}"
_download_queue: asyncio.Queue = None  # initialised in init_download_queue()

def init_download_queue() -> asyncio.Queue:
    """Create the asyncio Queue and store it; returns it for task creation."""
    global _download_queue
    print("[Download Queue] Initializing download queue...")
    _download_queue = asyncio.Queue()
    print(f"[Download Queue] Download queue initialized: {type(_download_queue).__name__}")
    return _download_queue
