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
from utils.common import get_quantization_from_name
from services.sse_svc import broadcast_notification
from .state import _benchmark_progress, _benchmark_lock, _benchmark_running, set_benchmark_running, get_benchmark_lock, get_benchmark_running
from .logging import log_benchmark, log_benchmark_error, log_benchmark_progress

# ── Token-budget ramp for empty-response retries ───────────────────────────────
# Initial attempt + 3 retries, each step widens the output budget so the model
# has room to finish (esp. during long-form reasoning, code generation, or
# creative writing rounds). 4096 (baseline) → 6144 → 8192 → 12288.
RETRY_MAX_TOKENS_RAMP = (4096, 6144, 8192, 12288)
RETRY_MAX_ATTEMPTS = len(RETRY_MAX_TOKENS_RAMP) - 1  # = 3
RETRY_PAUSE_SECONDS = 5

# ── Benchmark execution tasks ──────────────────────────────────────────────────

async def run_benchmark_task(run_id: str, model_id: str, judge_model_id: Optional[str]):
    from services.judge import judge_benchmark, get_gold_key, get_llm_server_url
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
                broadcast_notification(f"📊 Round {idx}/5: {round_name}")

                preset_id = await _get_preset_id_for_model(model_id)
                payload = {
                    "model": preset_id,
                    "messages": [{"role": "user", "content": prompt_text}],
                    "temperature": 0.7,
                    "stream": False,
                    "max_tokens": RETRY_MAX_TOKENS_RAMP[0]  # 4096 baseline
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

                # Retry on empty (not on server errors) with stepped token budget
                retry_count = 0
                max_retries = RETRY_MAX_ATTEMPTS
                while not content and retry_count < max_retries and not has_server_error:
                    retry_count += 1
                    next_budget = RETRY_MAX_TOKENS_RAMP[retry_count]
                    log_benchmark(f"{round_name}: Empty response, retry {retry_count}/{max_retries} — bumping max_tokens to {next_budget}...")
                    await asyncio.sleep(RETRY_PAUSE_SECONDS)
                    try:
                        start_time = time.time()
                        payload["max_tokens"] = next_budget
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
            broadcast_notification(f"✅ Benchmark complete for {model_id}")
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
            set_benchmark_running(False)
            _benchmark_progress["running"] = False
        _benchmark_progress["current_round"] = "Finished"


async def run_benchmark_queue_task(models: list, judge_model_id: str):
    import json
    from services.judge import (
        judge_benchmark, get_gold_key, get_llm_server_url
    )
    from utils.common import get_quantization_from_name
    from services.chat_svc import _get_loaded_model
    _benchmark_progress["running"] = True
    _benchmark_progress["queue_running"] = True
    _benchmark_progress["queue"] = models
    _benchmark_progress["queue_completed"] = []
    _benchmark_progress["queue_current_index"] = 0
    _benchmark_progress["logs"] = []

    log_benchmark(f"Initializing automated benchmark queue for {len(models)} models using Judge: {judge_model_id}")
    broadcast_notification(f"📊 Benchmark queue started with {len(models)} models")

    try:
        for idx, model_id in enumerate(models):
            _benchmark_progress["queue_current_index"] = idx
            log_benchmark(f"--- Queue Progress: {idx+1}/{len(models)} | Starting Model: {model_id} ---")
            broadcast_notification(f"📊 Benchmark queue progress: {idx+1}/{len(models)} - Testing {model_id}")

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
                        "max_tokens": RETRY_MAX_TOKENS_RAMP[0]  # 4096 baseline
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

                    # Retry on empty (not on server errors) with stepped token budget
                    retry_count = 0
                    max_retries = RETRY_MAX_ATTEMPTS
                    while not content and retry_count < max_retries and not has_server_error:
                        retry_count += 1
                        next_budget = RETRY_MAX_TOKENS_RAMP[retry_count]
                        log_benchmark(f"{round_name}: Empty response, retry {retry_count}/{max_retries} — bumping max_tokens to {next_budget}...")
                        await asyncio.sleep(RETRY_PAUSE_SECONDS)
                        try:
                            start_time = time.time()
                            payload["max_tokens"] = next_budget
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
                broadcast_notification(f"✅ Benchmark complete for {model_id}")
            except Exception as judge_err:
                traceback.format_exc()
                log_benchmark_error(f"Judge: Grading failed for model {model_id}: {judge_err}")

            # 10s cooldown between models
            if idx < len(models) - 1:
                log_benchmark("Cooling down 10 seconds before next model in queue...")
                await asyncio.sleep(10)

        log_benchmark("--- Automated Benchmark Queue Completed Successfully! ---")
        broadcast_notification(f"🏁 Benchmark queue completed successfully for {len(models)} models")

    except Exception as queue_err:
        traceback.format_exc()
        log_benchmark_error(f"Benchmark queue execution failed: {queue_err}")
    finally:
        broadcast_notification(f"🏁 All {len(models)} benchmark models completed")
        async with _benchmark_lock:
            set_benchmark_running(False)
        _benchmark_progress["running"] = False
        _benchmark_progress["queue_running"] = False
        _benchmark_progress["current_round"] = "Finished"

