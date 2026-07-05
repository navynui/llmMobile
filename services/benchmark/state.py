import asyncio
# ── Owned globals ──────────────────────────────────────────────────────────────
_benchmark_running = False
_benchmark_lock = asyncio.Lock()
_benchmark_progress: dict = {
    "running": False,
    "model_id": "",
    "current_round": "",
    "rounds_completed": 0,
    "total_rounds": 5,
    "logs": [],
    "server": "primary",
    "queue_running": False,
    "queue": [],
    "queue_completed": [],
    "queue_current_index": 0
}


# ── Public getters (used by main.py route handlers) ────────────────────────────

def get_benchmark_progress() -> dict:
    return _benchmark_progress


def get_benchmark_running() -> bool:
    return _benchmark_running


def get_benchmark_lock() -> asyncio.Lock:
    return _benchmark_lock


def set_benchmark_running(value: bool):
    global _benchmark_running
    _benchmark_running = value


