import os
import time
import shutil
import threading

BENCHMARK_LOG_DIR = "/app/benchmark_results" if os.path.exists("/app") else "/home/nui/llmaCPP/benchmark_results"
BENCHMARK_EXECUTION_LOG = os.path.join(BENCHMARK_LOG_DIR, "benchmark_execution.log")

_log_rotation_lock = threading.Lock()

def _rotate_benchmark_log_if_needed():
    """Keep the benchmark execution log under ~10MB by rotating it."""
    try:
        with _log_rotation_lock:
            if os.path.exists(BENCHMARK_EXECUTION_LOG):
                size = os.path.getsize(BENCHMARK_EXECUTION_LOG)
                max_size = 10 * 1024 * 1024  # 10 MB
                if size > max_size:
                    ts = time.strftime("%Y%m%d_%H%M%S")
                    rotated_name = BENCHMARK_EXECUTION_LOG.replace(
                        ".log", f"_{ts}.bak"
                    )
                    shutil.move(BENCHMARK_EXECUTION_LOG, rotated_name)
    except Exception as e:
        print(f"[Benchmark Log Rotation] Error: {e}")
