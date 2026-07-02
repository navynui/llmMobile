"""
services/benchmark_svc.py
Owns: _benchmark_running, _benchmark_lock, _benchmark_progress
Handles: logging helpers, run_benchmark_task, run_benchmark_queue_task, query helpers, route wrappers
"""

import os
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
from services.judge_svc import get_quantization_from_name

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
    "queue_running": False,
    "queue": [],
    "queue_completed": [],
    "queue_current_index": 0
}


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


# ── Benchmark execution tasks ──────────────────────────────────────────────────

async def run_benchmark_task(run_id: str, model_id: str, judge_model_id: Optional[str]):
    global _benchmark_running
    from services.judge_svc import judge_benchmark, get_gold_key, get_llm_server_url
    from services.model_svc import _get_preset_id_for_model

    _benchmark_progress["running"] = True
    _benchmark_progress["model_id"] = model_id
    _benchmark_progress["current_round"] = "Initializing..."
    _benchmark_progress["rounds_completed"] = 0
    _benchmark_progress["logs"] = []

    log_benchmark(f"Starting benchmark sequence for model: {model_id}")

    prompts = {
        "Round 1: Knowledge QA": "What is the full formal name of Bangkok, Thailand? Please include the Thai script and official English translation.",
        "Round 2: Technical Reasoning / Domain Knowledge": "Explain how llama.cpp handles KV cache allocation dynamically during continuous batching on consumer GPUs. Compare paged attention vs. static buffers, and discuss VRAM fragmentation risks.",
        "Round 3: Code Generation": "Write a complete, highly optimized Python script using asyncio and aiohttp to concurrently scrape metadata from 50 URLs. Include a custom token bucket rate limiter, proper connection pooling, exponential backoff for 5xx errors, and clean handling of TaskGroup or gather exceptions.",
        "Round 4: Abstract Reasoning": "A matrix is rotated 90 degrees clockwise, then reflected horizontally across its center vertical axis, and finally rotated 180 degrees counter-clockwise. Describe the final state of an element originally at position (i, j) in an N x N matrix relative to its initial coordinates, showing step-by-step mathematical transformations.",
        "Round 5: Creative Writing": "Write a 500-word short story about a solo network engineer monitoring a globally distributed routing infrastructure in the year 2042 during an undocumented, silent anomaly. The style should be cyberpunk hard-boiled, told from a first-person perspective, emphasizing the psychological weight of isolation and technical minutiae."
    }

    rounds_list = []
    server_url = get_llm_server_url()
    api_url = f"{server_url}/v1/chat/completions"

    # Capture VRAM after model is confirmed loaded and idle.
    log_benchmark("Waiting for server to be idle before capturing VRAM...")
    await wait_for_idle_trigger()
    await asyncio.sleep(2)
    vram_gb = await capture_and_store_vram(model_id, status="good")
    if vram_gb is not None:
        log_benchmark(f"Captured VRAM for {model_id}: {vram_gb} GB")

    try:
        async with httpx.AsyncClient(timeout=600.0) as client:
            for idx, (round_name, prompt_text) in enumerate(prompts.items(), 1):
                _benchmark_progress["current_round"] = round_name
                log_benchmark(f"Executing {round_name}...")

                preset_id = await _get_preset_id_for_model(model_id)
                payload = {
                    "model": preset_id,
                    "messages": [{"role": "user", "content": prompt_text}],
                    "temperature": 0.7,
                    "stream": False,
                    "max_tokens": 4096
                }

                start_time = time.time()
                content = ""
                tokens_predicted = 0
                speed_tps = 0.0
                duration = 0.0

                def _parse_response(response):
                    nonlocal content, tokens_predicted, speed_tps, duration
                    if response.status_code == 200:
                        res_data = response.json()
                        choice = res_data.get("choices", [{}])[0]
                        content = choice.get("message", {}).get("content", "")
                        usage = res_data.get("usage", {})
                        tokens_predicted = usage.get("completion_tokens", 0)
                        timings = res_data.get("timings", {})
                        speed_tps = timings.get("predicted_per_second", 0)

                        if tokens_predicted == 0 and content:
                            tokens_predicted = len(content) // 4

                        if speed_tps == 0 and duration > 0 and tokens_predicted > 0:
                            speed_tps = tokens_predicted / duration
                    else:
                        log_benchmark(f"HTTP error {response.status_code} in {round_name}: {response.text[:200]}")

                has_server_error = False
                try:
                    response = await client.post(api_url, json=payload)
                    _parse_response(response)
                    if response.status_code != 200:
                        content = ""
                        has_server_error = True
                except Exception as round_err:
                    traceback.format_exc()
                    log_benchmark_error(f"Model: {model_id}, Round: {round_name}, Error: {round_err}")
                    content = ""
                    has_server_error = True

                # Retry on empty (not on server errors)
                retry_count = 0
                max_retries = 3
                while not content and retry_count < max_retries and not has_server_error:
                    retry_count += 1
                    log_benchmark(f"{round_name}: Empty response, retry {retry_count}/{max_retries}...")
                    await asyncio.sleep(5)
                    try:
                        start_time = time.time()
                        response = await client.post(api_url, json=payload)
                        _parse_response(response)
                        if not content and response.status_code == 200 and tokens_predicted > 0:
                            log_benchmark(f"{round_name}: Retry {retry_count} succeeded")
                    except Exception as retry_err:
                        traceback.format_exc()
                        log_benchmark_error(f"Model: {model_id}, Round: {round_name}, Retry error: {retry_err}")

                # Determine final outcome
                if not content and has_server_error:
                    log_benchmark(f"{round_name}: Server error — no retries")
                    rounds_list.append({
                        "round_name": get_gold_key(round_name) or round_name,
                        "error": "Server error (non-200 response), no content"
                    })
                elif not content and retry_count >= max_retries:
                    log_benchmark(f"{round_name}: Exhausted all retries — empty response persisted")
                    rounds_list.append({
                        "round_name": get_gold_key(round_name) or round_name,
                        "error": f"Empty response after {max_retries} retries"
                    })
                elif content:
                    duration = time.time() - start_time
                    log_benchmark(f"Completed {round_name} in {duration:.2f}s | {tokens_predicted} tokens | {speed_tps:.2f} t/s")
                    rounds_list.append({
                        "round_name": get_gold_key(round_name) or round_name,
                        "prompt": prompt_text,
                        "response": content,
                        "metrics": {
                            "duration_seconds": round(duration, 2),
                            "tokens_generated": tokens_predicted,
                            "tokens_per_second": round(speed_tps, 2)
                        }
                    })

                _benchmark_progress["rounds_completed"] = idx

                if idx < len(prompts):
                    log_benchmark("Cooling down for 10 seconds to prevent VRAM locks...")
                    await asyncio.sleep(10)

        # Save raw JSON
        results = {
            "model_id": model_id,
            "model_name": os.path.basename(model_id),
            "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
            "rounds": rounds_list
        }

        out_dir = "/app/benchmark_results" if os.path.exists("/app") else "/home/nui/llmaCPP/benchmark_results"
        os.makedirs(out_dir, exist_ok=True)
        raw_output_path = os.path.join(out_dir, f"benchmark_{run_id}.json")

        with open(raw_output_path, "w", encoding="utf-8") as f:
            json.dump(results, f, indent=4, ensure_ascii=False)

        log_benchmark(f"Saved raw results to {raw_output_path}")

        # Trigger judge
        log_benchmark("Starting AI Judge grading sequence...")
        _benchmark_progress["current_round"] = "AI Judge Grading..."

        req = JudgeRequest(run_id=run_id, judge_model_id=judge_model_id)
        try:
            await judge_benchmark(req)
            log_benchmark("AI Judge grading sequence completed successfully!")
        except Exception as j_err:
            traceback.format_exc()
            log_benchmark_error(f"Judge grading failed: {j_err}")

    except Exception as run_err:
        traceback.format_exc()
        log_benchmark_error(f"Model: {model_id}, Benchmark failed: {run_err}")
        try:
            conn = get_db_conn()
            cursor = conn.cursor()
            cursor.execute("""
            INSERT INTO models (model_id, name, quantization, status, notes)
            VALUES (?, ?, ?, 'failed', ?)
            ON CONFLICT(model_id) DO UPDATE SET
                status = 'failed',
                notes = ?
            """, (model_id, os.path.basename(model_id), get_quantization_from_name(model_id),
                  f"Failed: {str(run_err)}", f"Failed: {str(run_err)}"))
            conn.commit()
            conn.close()
        except Exception as db_err:
            log_benchmark_error(f"Model: {model_id}, Failed to record failure in DB: {db_err}")
    finally:
        async with _benchmark_lock:
            global _benchmark_running
            _benchmark_running = False
            _benchmark_progress["running"] = False
        _benchmark_progress["current_round"] = "Finished"


async def run_benchmark_queue_task(models: list, judge_model_id: str):
    global _benchmark_running
    import json
    from services.judge_svc import (
        judge_benchmark, get_gold_key, get_quantization_from_name, get_llm_server_url
    )
    from services.chat_svc import _get_loaded_model
    _benchmark_progress["running"] = True
    _benchmark_progress["queue_running"] = True
    _benchmark_progress["queue"] = models
    _benchmark_progress["queue_completed"] = []
    _benchmark_progress["queue_current_index"] = 0
    _benchmark_progress["logs"] = []

    log_benchmark(f"Initializing automated benchmark queue for {len(models)} models using Judge: {judge_model_id}")

    try:
        for idx, model_id in enumerate(models):
            _benchmark_progress["queue_current_index"] = idx
            log_benchmark(f"--- Queue Progress: {idx+1}/{len(models)} | Starting Model: {model_id} ---")

            # 1. Load the test model via the server API
            preset_id = await _get_preset_id_for_model(model_id)
            log_benchmark(f"Queue: Requesting server to load test model: {model_id} (preset: {preset_id})")
            async with httpx.AsyncClient() as client:
                try:
                    load_res = await client.post("http://llm-server:8080/models/load", json={"model": preset_id}, timeout=30)
                    if load_res.status_code != 200:
                        try:
                            res_json = load_res.json()
                            error_msg = res_json.get("error", {}).get("message", "")
                            if "already running" in error_msg or "already loaded" in error_msg:
                                log_benchmark(f"Queue: {model_id} is already loaded and running.")
                            else:
                                traceback.format_exc()
                                log_benchmark_error(f"Model: {model_id}, Server returned {load_res.status_code}: {error_msg}")
                                continue
                        except Exception as e:
                            traceback.format_exc()
                            log_benchmark_error(f"Model: {model_id}, Server HTTP error {load_res.status_code}")
                            continue
                except Exception as e:
                    traceback.format_exc()
                    log_benchmark_error(f"Model: {model_id}, Exception loading: {e}")
                    continue

            # 2. Wait for model to load
            log_benchmark(f"Queue: Waiting for {model_id} to load...")
            loaded = False
            for _ in range(60):  # wait up to 120 seconds
                await asyncio.sleep(2)
                curr_loaded = await _get_loaded_model()
                if curr_loaded and _clean_model_id(curr_loaded) == _clean_model_id(model_id):
                    loaded = True
                    break

            if not loaded:
                log_benchmark_error(f"Model: {model_id}, Timeout loading model")
                continue

            # Capture VRAM after confirming the model is loaded and idle.
            log_benchmark(f"Queue: Waiting for server to be idle before capturing VRAM...")
            await wait_for_idle_trigger()
            await asyncio.sleep(2)
            vram_gb = await capture_and_store_vram(model_id, status="good")
            if vram_gb is not None:
                log_benchmark(f"Queue: Captured VRAM for {model_id}: {vram_gb} GB")

            # 3. Create run_id and run benchmark rounds
            run_id = str(uuid.uuid4())
            timestamp = time.strftime("%Y-%m-%d %H:%M:%S")
            out_dir = "/app/benchmark_results" if os.path.exists("/app") else "/home/nui/llmaCPP/benchmark_results"
            raw_output_path = os.path.join(out_dir, f"benchmark_{run_id}.json")

            norm_model_id = _clean_model_id(model_id)
            display_name = os.path.basename(model_id)

            try:
                conn = get_db_conn()
                cursor = conn.cursor()
                cursor.execute("""
                INSERT INTO models (model_id, name, quantization, status, notes)
                VALUES (?, ?, ?, 'testing', ?)
                ON CONFLICT(model_id) DO UPDATE SET
                    status = 'testing',
                    notes = ?
                """, (norm_model_id, display_name, get_quantization_from_name(model_id),
                      f"Queue run initiated at {timestamp}", f"Queue run initiated at {timestamp}"))

                cursor.execute("SELECT run_id FROM test_runs WHERE model_id = ?", (norm_model_id,))
                for old_run in cursor.fetchall():
                    cursor.execute("DELETE FROM test_runs WHERE run_id = ?", (old_run["run_id"],))

                cursor.execute("""
                INSERT INTO test_runs (run_id, model_id, timestamp, raw_output_path)
                VALUES (?, ?, ?, ?)
                """, (run_id, norm_model_id, timestamp, raw_output_path))
                conn.commit()
                conn.close()
                model_id = norm_model_id
            except Exception as db_err:
                traceback.format_exc()
                log_benchmark_error(f"Model: {model_id}, Queue DB Error: {db_err}")
                continue

            prompts = {
                "Round 1: Knowledge QA": "What is the full formal name of Bangkok, Thailand? Please include the Thai script and official English translation.",
                "Round 2: Technical Reasoning / Domain Knowledge": "Explain how llama.cpp handles KV cache allocation dynamically during continuous batching on consumer GPUs. Compare paged attention vs. static buffers, and discuss VRAM fragmentation risks.",
                "Round 3: Code Generation": "Write a complete, highly optimized Python script using asyncio and aiohttp to concurrently scrape metadata from 50 URLs. Include a custom token bucket rate limiter, proper connection pooling, exponential backoff for 5xx errors, and clean handling of TaskGroup or gather exceptions.",
                "Round 4: Abstract Reasoning": "A matrix is rotated 90 degrees clockwise, then reflected horizontally across its center vertical axis, and finally rotated 180 degrees counter-clockwise. Describe the final state of an element originally at position (i, j) in an N x N matrix relative to its initial coordinates, showing step-by-step mathematical transformations.",
                "Round 5: Creative Writing": "Write a 500-word short story about a solo network engineer monitoring a globally distributed routing infrastructure in the year 2042 during an undocumented, silent anomaly. The style should be cyberpunk hard-boiled, told from a first-person perspective, emphasizing the psychological weight of isolation and technical minutiae."
            }

            rounds_list = []
            server_url = get_llm_server_url()
            api_url = f"{server_url}/v1/chat/completions"

            async with httpx.AsyncClient(timeout=600.0) as client:
                for r_idx, (round_name, prompt_text) in enumerate(prompts.items(), 1):
                    _benchmark_progress["current_round"] = f"Model {idx+1}/{len(models)}: {round_name}"
                    _benchmark_progress["rounds_completed"] = r_idx - 1

                    preset_id = await _get_preset_id_for_model(model_id)
                    log_benchmark(f"Executing {round_name} on {model_id} (preset: {preset_id})...")
                    payload = {
                        "model": preset_id,
                        "messages": [{"role": "user", "content": prompt_text}],
                        "temperature": 0.7,
                        "stream": False,
                        "max_tokens": 4096
                    }
                    start_time = time.time()
                    content = ""
                    tokens_predicted = 0
                    speed_tps = 0.0
                    duration = 0.0

                    def _parse_response(response):
                        nonlocal content, tokens_predicted, speed_tps, duration
                        if response.status_code == 200:
                            res_data = response.json()
                            choice = res_data.get("choices", [{}])[0]
                            content = choice.get("message", {}).get("content", "")
                            usage = res_data.get("usage", {})
                            tokens_predicted = usage.get("completion_tokens", 0)
                            timings = res_data.get("timings", {})
                            speed_tps = timings.get("predicted_per_second", 0)
                            if tokens_predicted == 0 and content:
                                tokens_predicted = len(content) // 4
                            if speed_tps == 0 and duration > 0 and tokens_predicted > 0:
                                speed_tps = tokens_predicted / duration
                        else:
                            log_benchmark(f"HTTP error {response.status_code} in {round_name}: {response.text[:200]}")

                    has_server_error = False
                    try:
                        response = await client.post(api_url, json=payload)
                        _parse_response(response)
                        if response.status_code != 200:
                            content = ""
                            has_server_error = True
                    except Exception as round_err:
                        traceback.format_exc()
                        log_benchmark_error(f"Model: {model_id}, Round: {round_name}, Error: {round_err}")
                        content = ""
                        has_server_error = True

                    retry_count = 0
                    max_retries = 3
                    while not content and retry_count < max_retries and not has_server_error:
                        retry_count += 1
                        log_benchmark(f"{round_name}: Empty response, retry {retry_count}/{max_retries}...")
                        await asyncio.sleep(5)
                        try:
                            start_time = time.time()
                            response = await client.post(api_url, json=payload)
                            _parse_response(response)
                            if not content and response.status_code == 200 and tokens_predicted > 0:
                                log_benchmark(f"{round_name}: Retry {retry_count} succeeded")
                        except Exception as retry_err:
                            traceback.format_exc()
                            log_benchmark_error(f"Model: {model_id}, Round: {round_name}, Retry error: {retry_err}")

                    if not content and has_server_error:
                        log_benchmark(f"{round_name}: Server error — no retries")
                        rounds_list.append({
                            "round_name": get_gold_key(round_name) or round_name,
                            "error": "Server error (non-200 response), no content"
                        })
                    elif not content and retry_count >= max_retries:
                        log_benchmark(f"{round_name}: Exhausted all retries — empty response persisted")
                        rounds_list.append({
                            "round_name": get_gold_key(round_name) or round_name,
                            "error": f"Empty response after {max_retries} retries"
                        })
                    elif content:
                        duration = time.time() - start_time
                        log_benchmark(f"Completed {round_name} in {duration:.2f}s | {tokens_predicted} tokens | {speed_tps:.2f} t/s")
                        rounds_list.append({
                            "round_name": get_gold_key(round_name) or round_name,
                            "prompt": prompt_text,
                            "response": content,
                            "metrics": {
                                "duration_seconds": round(duration, 2),
                                "tokens_generated": tokens_predicted,
                                "tokens_per_second": round(speed_tps, 2)
                            }
                        })

                    _benchmark_progress["rounds_completed"] = r_idx
                    if r_idx < len(prompts):
                        log_benchmark("Cooling down for 10 seconds to prevent VRAM locks...")
                        await asyncio.sleep(10)

            # Save raw JSON results
            results = {
                "model_id": model_id,
                "model_name": os.path.basename(model_id),
                "timestamp": timestamp,
                "rounds": rounds_list
            }
            os.makedirs(out_dir, exist_ok=True)
            with open(raw_output_path, "w", encoding="utf-8") as f:
                json.dump(results, f, indent=4, ensure_ascii=False)
            log_benchmark("Saved raw test results.")

            # 4. Switch to Judge Model for evaluation
            preset_id = await _get_preset_id_for_model(judge_model_id)
            log_benchmark(f"Queue: Requesting server to load Judge model: {judge_model_id} (preset: {preset_id})")
            async with httpx.AsyncClient() as client:
                try:
                    load_res = await client.post("http://llm-server:8080/models/load", json={"model": preset_id}, timeout=30)
                    if load_res.status_code != 200:
                        try:
                            res_json = load_res.json()
                            error_msg = res_json.get("error", {}).get("message", "")
                            if "already running" in error_msg or "already loaded" in error_msg:
                                log_benchmark(f"Queue: Judge model {judge_model_id} is already loaded and running.")
                            else:
                                traceback.format_exc()
                                log_benchmark_error(f"Judge: Server returned {load_res.status_code}: {error_msg}")
                                continue
                        except Exception as e:
                            traceback.format_exc()
                            log_benchmark_error(f"Judge: HTTP error {load_res.status_code}")
                            continue
                except Exception as e:
                    traceback.format_exc()
                    log_benchmark_error(f"Judge: Exception loading: {e}")
                    continue

            # Wait for Judge model to load
            log_benchmark("Queue: Waiting for Judge model to load...")
            judge_loaded = False
            for _ in range(60):
                await asyncio.sleep(2)
                curr_loaded = await _get_loaded_model()
                if curr_loaded and _clean_model_id(curr_loaded) == _clean_model_id(judge_model_id):
                    judge_loaded = True
                    break

            if not judge_loaded:
                log_benchmark_error(f"Judge: Timeout loading model {judge_model_id}")
                continue

            # 5. Execute AI Judge evaluation
            log_benchmark("Queue: Starting AI Judge grading sequence...")
            _benchmark_progress["current_round"] = "AI Judge Grading..."
            try:
                req = JudgeRequest(run_id=run_id, judge_model_id=judge_model_id)
                await judge_benchmark(req)
                log_benchmark(f"Queue: AI Judge grading completed successfully for {model_id}!")
                _benchmark_progress["queue_completed"].append(model_id)
            except Exception as judge_err:
                traceback.format_exc()
                log_benchmark_error(f"Judge: Grading failed for model {model_id}: {judge_err}")

            # 10s cooldown between models
            if idx < len(models) - 1:
                log_benchmark("Cooling down 10 seconds before next model in queue...")
                await asyncio.sleep(10)

        log_benchmark("--- Automated Benchmark Queue Completed Successfully! ---")

    except Exception as queue_err:
        traceback.format_exc()
        log_benchmark_error(f"Benchmark queue execution failed: {queue_err}")
    finally:
        async with _benchmark_lock:
            _benchmark_running = False
        _benchmark_progress["running"] = False
        _benchmark_progress["queue_running"] = False
        _benchmark_progress["current_round"] = "Finished"

# ── Query endpoints ─────────────────────────────────────────────────────────────

def get_benchmarks(show_all: bool = False) -> dict:
    """Return benchmark list (fulfills /api/benchmarks)."""
    try:
        local_ready_filenames = set()
        if os.path.exists(MODES_INI_PATH):
            try:
                with open(MODES_INI_PATH) as f:
                    for line in f:
                        line = line.strip()
                        if not line or line.startswith(";"):
                            continue
                        m = re.match(r'^\[(.+?)\]$', line)
                        if m:
                            raw_name = m.group(1)
                            if raw_name == "*":
                                continue
                            if raw_name.lower().endswith(".gguf"):
                                base_name = raw_name[:-5]
                            else:
                                base_name = raw_name
                            filename = base_name + ".gguf"
                            if os.path.exists(os.path.join(MODELS_DIR, filename)):
                                local_ready_filenames.add(filename.lower())
                                local_ready_filenames.add(base_name.lower())
            except Exception as e:
                print(f"[Benchmarks API] Failed to parse models INI: {e}")

        conn = get_db_conn()
        cursor = conn.cursor()
        query = """
            WITH latest_runs AS (
                SELECT tr.model_id, tr.run_id, tr.timestamp,
                       ROW_NUMBER() OVER (PARTITION BY tr.model_id ORDER BY tr.timestamp DESC) as rn
                FROM test_runs tr
            ),
            run_scores_agg AS (
                SELECT lr.model_id, lr.run_id, lr.timestamp,
                       SUM(rs.score) as total_score,
                       MAX(CASE WHEN rs.round_name = 'speed_metric' THEN rs.speed_tps END) as avg_tps
                FROM latest_runs lr
                JOIN round_scores rs ON lr.run_id = rs.run_id
                WHERE lr.rn = 1
                GROUP BY lr.model_id, lr.run_id, lr.timestamp
            )
            SELECT m.model_id, m.name, m.quantization, LOWER(m.status) as status, m.notes,
                   m.vram_gb,
                   rsa.run_id, rsa.timestamp, rsa.total_score, rsa.avg_tps,
                   (SELECT COUNT(*) FROM model_hallucinations mh WHERE mh.model_id = m.model_id) as hallucination_count
            FROM models m
            JOIN run_scores_agg rsa ON m.model_id = rsa.model_id
            ORDER BY rsa.total_score DESC;
        """
        cursor.execute(query)
        rows = cursor.fetchall()
        conn.close()

        benchmarks = []
        tested_names_lower = set()

        for r in rows:
            avg_tps = r["avg_tps"] or 0.0
            total_score = r["total_score"] or 0
            hallucinated = r["hallucination_count"] > 0
            model_name = r["name"]
            name_low = model_name.lower()
            tested_names_lower.add(name_low)
            if name_low.endswith(".gguf"):
                tested_names_lower.add(name_low[:-5])
            else:
                tested_names_lower.add(name_low + ".gguf")
            tested_names_lower.add(r["model_id"].lower())
            is_model_ready = (name_low in local_ready_filenames) or (r["model_id"].lower() in local_ready_filenames)
            if not show_all:
                if avg_tps < 20.0 or hallucinated or total_score < 50:
                    if not is_model_ready:
                        continue
            benchmarks.append({
                "model_id": r["model_id"],
                "model": model_name,
                "platform": "Tesla P100 (16GB)",
                "quant": r["quantization"] or "Unknown",
                "tokens_sec": round(avg_tps, 1),
                "score": total_score,
                "vram_gb": r["vram_gb"] if (r and r["vram_gb"] is not None) else None,
                "status": r["status"] if (r and r["status"]) else "testing",
                "is_ready": is_model_ready,
                "is_tested": True,
            })

        if os.path.exists(MODES_INI_PATH):
            try:
                with open(MODES_INI_PATH) as f:
                    for line in f:
                        line = line.strip()
                        if not line or line.startswith(";"):
                            continue
                        m = re.match(r'^\[(.+?)\]$', line)
                        if m:
                            raw_name = m.group(1)
                            if raw_name == "*":
                                continue
                            if raw_name.lower().endswith(".gguf"):
                                base_name = raw_name[:-5]
                            else:
                                base_name = raw_name
                            filename = base_name + ".gguf"
                            if filename.lower() in local_ready_filenames and filename.lower() not in tested_names_lower:
                                # Fetch vram_gb and status from DB for this model
                                try:
                                    conn = get_db_conn()
                                    cursor = conn.cursor()
                                    cursor.execute(
                                        "SELECT LOWER(status) as status, vram_gb FROM models WHERE model_id = ?",
                                        (filename.lower(),)
                                    )
                                    db_row = cursor.fetchone()
                                    conn.close()
                                except Exception:
                                    db_row = None

                                benchmarks.append({
                                    "model_id": filename,
                                    "model": filename,
                                    "platform": "Ready",
                                    "quant": get_quantization_from_name(filename),
                                    "tokens_sec": None,
                                    "score": None,
                                    "vram_gb": db_row["vram_gb"] if db_row else None,
                                    "status": db_row["status"] if (db_row and db_row["status"]) else "testing",
                                    "is_ready": True,
                                    "is_tested": False,
                                })
            except Exception as e:
                print(f"[Benchmarks API] Failed to append ready models: {e}")

        return {"benchmarks": benchmarks}
    except Exception as e:
        print(f"Error querying benchmarks database: {e}")
        return {"benchmarks": [], "error": str(e)}


def get_benchmark_details(model_id: str) -> dict:
    """Return detailed benchmark results for a specific model."""
    try:
        model_id = _clean_model_id(model_id)
        conn = get_db_conn()
        cursor = conn.cursor()
        cursor.execute("SELECT model_id, name, quantization, LOWER(status) as status, vram_gb, notes FROM models WHERE model_id = ?", (model_id,))
        model_row = cursor.fetchone()
        if not model_row:
            conn.close()
            raise HTTPException(status_code=404, detail="Model benchmark record not found")
        cursor.execute("SELECT run_id, timestamp FROM test_runs WHERE model_id = ? ORDER BY timestamp DESC LIMIT 1", (model_id,))
        run_row = cursor.fetchone()
        rounds = []
        hallucinations = []
        timestamp = None
        run_id = None
        if run_row:
            run_id = run_row["run_id"]
            timestamp = run_row["timestamp"]
            cursor.execute("SELECT round_name, score, reasoning, speed_tps FROM round_scores WHERE run_id = ? ORDER BY id ASC", (run_id,))
            rounds = [dict(row) for row in cursor.fetchall()]
            cursor.execute("SELECT round_name, description FROM model_hallucinations WHERE model_id = ?", (model_id,))
            hallucinations = [dict(row) for row in cursor.fetchall()]
        conn.close()
        return {
            "model_id": model_row["model_id"],
            "name": model_row["name"],
            "quantization": model_row["quantization"],
            "status": model_row["status"] if (model_row and model_row["status"]) else "testing",
            "vram_gb": model_row["vram_gb"] if (model_row and model_row["vram_gb"] is not None) else None,
            "notes": model_row["notes"],
            "run_id": run_id,
            "timestamp": timestamp,
            "rounds": rounds,
            "hallucinations": hallucinations,
        }
    except HTTPException as he:
        raise he
    except Exception as e:
        print(f"Error fetching benchmark details for {model_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


def get_benchmark_logs(lines: int = 200) -> dict:
    """Return the persistent benchmark execution log file."""
    try:
        if not os.path.exists(BENCHMARK_EXECUTION_LOG):
            return {"logs": ""}
        with open(BENCHMARK_EXECUTION_LOG, "r", encoding="utf-8") as f:
            all_lines = f.readlines()
        tail = all_lines[-lines:] if len(all_lines) > lines else all_lines
        return {"logs": "".join(tail)}
    except Exception as e:
        print(f"[Logs] Error reading benchmark log file: {e}")
        return {"logs": f"Error: {str(e)}"}


def get_benchmark_outputs() -> dict:
    """List all saved raw JSON output files."""
    try:
        os.makedirs(BENCHMARK_LOG_DIR, exist_ok=True)
        outputs = []
        for f_name in sorted(os.listdir(BENCHMARK_LOG_DIR)):
            full_path = os.path.join(BENCHMARK_LOG_DIR, f_name)
            if not os.path.isfile(full_path):
                continue
            if f_name == "benchmark_execution.log":
                continue
            stat_info = os.stat(full_path)
            outputs.append({
                "filename": f_name,
                "size_bytes": stat_info.st_size,
                "modified_at": time.strftime("%Y-%m-%d %H:%M:%S", time.gmtime(stat_info.st_mtime)),
            })
        return {"outputs": outputs}
    except Exception as e:
        print(f"[Outputs] Error listing benchmark outputs: {e}")
        return {"outputs": [], "error": str(e)}


async def run_benchmark(req: BenchmarkRunRequest, background_tasks: BackgroundTasks) -> dict:
    """Route handler for single benchmark run: validate, record to DB, start background task."""
    async with get_benchmark_lock():
        if get_benchmark_running():
            raise HTTPException(status_code=400, detail="A benchmark is already actively running. Please wait for it to complete.")
        set_benchmark_running(True)
        try:
            raw_model_id = await _get_loaded_model()
            if not raw_model_id:
                async with get_benchmark_lock():
                    set_benchmark_running(False)
                raise HTTPException(status_code=400, detail="No active model is loaded in the server. Please load a model before running benchmarks.")
            model_id = _clean_model_id(raw_model_id)
            display_name = os.path.basename(raw_model_id)
            run_id = str(uuid.uuid4())
            timestamp = time.strftime("%Y-%m-%d %H:%M:%S")
            out_dir = "/app/benchmark_results" if os.path.exists("/app") else "/home/nui/llmaCPP/benchmark_results"
            raw_output_path = os.path.join(out_dir, f"benchmark_{run_id}.json")
            conn = get_db_conn()
            cursor = conn.cursor()
            cursor.execute("""
                INSERT INTO models (model_id, name, quantization, status, notes)
                VALUES (?, ?, ?, 'testing', ?)
                ON CONFLICT(model_id) DO UPDATE SET
                    status = 'testing',
                    notes = ?
            """, (model_id, display_name, get_quantization_from_name(raw_model_id),
                  f"Testing run initiated at {timestamp}", f"Testing run initiated at {timestamp}"))
            cursor.execute("SELECT run_id FROM test_runs WHERE model_id = ?", (model_id,))
            old_runs = cursor.fetchall()
            for old_run in old_runs:
                cursor.execute("DELETE FROM test_runs WHERE run_id = ?", (old_run["run_id"],))
            cursor.execute("""
                INSERT INTO test_runs (run_id, model_id, timestamp, raw_output_path)
                VALUES (?, ?, ?, ?)
            """, (run_id, model_id, timestamp, raw_output_path))
            conn.commit()
            conn.close()
            background_tasks.add_task(run_benchmark_task, run_id, model_id, req.judge_model_id)
            return {
                "status": "success",
                "message": "Benchmark sequence initiated successfully in the background.",
                "run_id": run_id,
                "model_id": model_id,
            }
        except Exception as e:
            async with get_benchmark_lock():
                set_benchmark_running(False)
            raise HTTPException(status_code=500, detail=str(e))


async def run_benchmark_queue(req: BenchmarkQueueRequest, background_tasks: BackgroundTasks) -> dict:
    """Route handler for benchmark queue: validate, then start background queue task."""
    async with get_benchmark_lock():
        if get_benchmark_running():
            raise HTTPException(status_code=400, detail="A benchmark or queue is already actively running. Please wait for it to complete.")
        set_benchmark_running(True)
        try:
            background_tasks.add_task(run_benchmark_queue_task, req.models, req.judge_model_id)
            return {
                "status": "success",
                "message": "Automated benchmark queue initiated successfully in the background.",
                "queue_size": len(req.models),
            }
        except Exception as e:
            async with get_benchmark_lock():
                set_benchmark_running(False)
            raise HTTPException(status_code=500, detail=str(e))
