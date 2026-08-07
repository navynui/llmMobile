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
from .state import get_benchmark_lock, get_benchmark_running, set_benchmark_running, get_benchmark_progress
from .runner import run_benchmark_task, run_benchmark_queue_task


async def _check_and_set_running():
    """Check if a benchmark is running. Auto-heal if flags are out of sync."""
    if get_benchmark_running():
        progress = get_benchmark_progress()
        # If the task flag is True but progress says False, the previous task
        # crashed before its finally block — auto-heal and allow the new request.
        if not progress.get("running"):
            set_benchmark_running(False)
        else:
            raise HTTPException(status_code=400, detail="A benchmark is already actively running. Please wait for it to complete.")
    set_benchmark_running(True)


async def run_benchmark(req: BenchmarkRunRequest, background_tasks: BackgroundTasks) -> dict:
    """Route handler for single benchmark run: validate, record to DB, start background task."""
    async with get_benchmark_lock():
        await _check_and_set_running()
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
            
            mode = req.execution_mode or "full"
            temp = req.temperature if req.temperature is not None else 0.7
            cursor.execute("""
                INSERT INTO test_runs (run_id, model_id, timestamp, raw_output_path, server, execution_mode, temperature)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (run_id, model_id, timestamp, raw_output_path, req.server, mode, temp))
            conn.commit()
            conn.close()

            background_tasks.add_task(
                run_benchmark_task,
                run_id,
                model_id,
                req.judge_model_id,
                req.server,
                mode,
                req.run_count or 1,
                temp
            )
            return {
                "status": "success",
                "message": f"Benchmark sequence ({mode} mode) initiated successfully in the background.",
                "run_id": run_id,
                "model_id": model_id,
                "execution_mode": mode,
            }
        except Exception as e:
            async with get_benchmark_lock():
                set_benchmark_running(False)
            raise HTTPException(status_code=500, detail=str(e))


async def run_benchmark_queue(req: BenchmarkQueueRequest, background_tasks: BackgroundTasks) -> dict:
    """Route handler for benchmark queue: validate, then start background queue task."""
    async with get_benchmark_lock():
        await _check_and_set_running()
        try:
            background_tasks.add_task(
                run_benchmark_queue_task,
                req.models,
                req.judge_model_id,
                req.server,
                req.execution_mode or "full",
                req.run_count or 1,
                req.temperature if req.temperature is not None else 0.7,
            )
            return {
                "status": "success",
                "message": "Automated benchmark queue initiated successfully in the background.",
                "queue_size": len(req.models),
            }
        except Exception as e:
            async with get_benchmark_lock():
                set_benchmark_running(False)
            raise HTTPException(status_code=500, detail=str(e))
