import os
import time
import traceback
from utils.bench_log import BENCHMARK_LOG_DIR, BENCHMARK_EXECUTION_LOG, _rotate_benchmark_log_if_needed
from .state import _benchmark_progress
# ── Logging helpers ────────────────────────────────────────────────────────────

def log_benchmark_progress(msg: str):
    print(msg)
    _benchmark_progress["logs"].append(f"[{time.strftime('%H:%M:%S')}] {msg}")
    if len(_benchmark_progress["logs"]) > 200:
        _benchmark_progress["logs"].pop(0)

    try:
        os.makedirs(BENCHMARK_LOG_DIR, exist_ok=True)
        _rotate_benchmark_log_if_needed()
        with open(BENCHMARK_EXECUTION_LOG, "a", encoding="utf-8") as f:
            f.write(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] {msg}\n")
    except Exception:
        pass


def log_benchmark_error(msg: str):
    """Write an error-level benchmark log with full traceback."""
    ts = time.strftime("%Y-%m-%d %H:%M:%S")
    line = f"[{ts}] ERROR: {msg}"
    print(line)

    try:
        os.makedirs(BENCHMARK_LOG_DIR, exist_ok=True)
        _rotate_benchmark_log_if_needed()
        with open(BENCHMARK_EXECUTION_LOG, "a", encoding="utf-8") as f:
            f.write(f"{line}\n")
            tb_lines = traceback.format_exc().split("\n")
            if len(tb_lines) > 1 and tb_lines[-1].strip() == "":
                f.write("Traceback:\n")
                for l in tb_lines[:-1]:
                    f.write(f"  {l}\n")
            else:
                for l in tb_lines:
                    if l.strip():
                        f.write(f"  {l}\n")
    except Exception:
        pass


def log_benchmark(msg: str):
    """Write a benchmark progress message to both console and persistent file."""
    print(msg)
    _benchmark_progress["logs"] = getattr(_benchmark_progress, "logs", [])
    if isinstance(_benchmark_progress.get("logs"), list) and len(_benchmark_progress["logs"]) < 200:
        _benchmark_progress["logs"].append(f"[{time.strftime('%H:%M:%S')}] {msg}")

    try:
        os.makedirs(BENCHMARK_LOG_DIR, exist_ok=True)
        _rotate_benchmark_log_if_needed()
        with open(BENCHMARK_EXECUTION_LOG, "a", encoding="utf-8") as f:
            f.write(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] {msg}\n")
    except Exception:
        pass


