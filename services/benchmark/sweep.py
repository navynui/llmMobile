"""Temperature sweep: test a model at multiple temperatures, grade with judge.

Run via POST /api/benchmarks/temperature-sweep. Uses the currently loaded
model, runs one prompt (Technical Reasoning) at each temperature, then
batch-grades all responses with the designated judge model.
"""
import os
import json
import time
import asyncio
import traceback
from typing import Optional

import httpx
from fastapi import BackgroundTasks, HTTPException

from utils.db_utils import get_db_conn, _clean_model_id
from services.chat_svc import _get_loaded_model
from services.model_svc import _get_preset_id_for_model
from services.vram_svc import wait_for_idle_trigger, capture_and_store_vram
from services.judge.gold import get_gold_key, get_gold_answers
from services.judge.judge import query_judge_model, parse_judge_json, get_llm_server_url
from services.sse_svc import broadcast_notification
from utils.bench_log import BENCHMARK_EXECUTION_LOG, _rotate_benchmark_log_if_needed
from utils.common import get_quantization_from_name
from .state import get_benchmark_lock, get_benchmark_progress, set_benchmark_running
from .logging import log_benchmark, log_benchmark_error

# ── Constants ──────────────────────────────────────────────────────────────────

TECH_REASONING_PROMPT = (
    "Explain how llama.cpp handles KV cache allocation dynamically "
    "during continuous batching on consumer GPUs. Compare paged attention "
    "vs. static buffers, and discuss VRAM fragmentation risks."
)

DEFAULT_TEMPERATURES = [0.3, 0.5, 0.7, 1.0, 1.3]

# The known gold key for Technical Reasoning
GOLD_KEY = "technical_reasoning"


# ── Sweep runner ───────────────────────────────────────────────────────────────

async def run_temperature_sweep_task(
    judge_model_id: Optional[str],
    server: str = "primary",
    temperatures: Optional[list[float]] = None,
):
    """Background task: run one prompt at each temp, then grade all with judge."""
    from services.model_svc import _get_preset_id_for_model as get_preset

    if temperatures is None:
        temperatures = DEFAULT_TEMPERATURES

    progress = get_benchmark_progress()
    server_url = "http://llm-server:8080" if server == "primary" else "http://llm-server-mini:8081"
    api_url = f"{server_url}/v1/chat/completions"
    results = []

    try:
        # 1. Get loaded model
        raw_model_id = await _get_loaded_model()
        if not raw_model_id:
            raise RuntimeError("No active model loaded")

        model_id = _clean_model_id(raw_model_id)
        preset_id = await get_preset(model_id, server_url=server_url)
        log_benchmark(f"Temperature sweep starting for {model_id} with {len(temperatures)} temps: {temperatures}")
        broadcast_notification(f"🌡️ Temperature sweep started for {model_id}")

        progress["sweep_running"] = True
        progress["sweep_progress"] = 0
        progress["sweep_total"] = len(temperatures)
        progress["sweep_current_temp"] = None
        progress["sweep_results"] = None

        # 2. Run prompt at each temperature
        async with httpx.AsyncClient(timeout=600.0) as client:
            for i, temp in enumerate(temperatures):
                progress["sweep_current_temp"] = temp
                log_benchmark(f"Sweep temp {temp}: sending Technical Reasoning prompt...")
                payload = {
                    "model": preset_id,
                    "messages": [{"role": "user", "content": TECH_REASONING_PROMPT}],
                    "temperature": temp,
                    "stream": False,
                    "max_tokens": 4096,
                }

                start_time = time.time()
                content = ""
                tokens_generated = 0
                speed_tps = 0.0

                try:
                    resp = await client.post(api_url, json=payload)
                    if resp.status_code == 200:
                        data = resp.json()
                        choice = data.get("choices", [{}])[0]
                        content = choice.get("message", {}).get("content", "")
                        usage = data.get("usage", {})
                        tokens_generated = usage.get("completion_tokens", 0)
                        timings = data.get("timings", {})
                        speed_tps = timings.get("predicted_per_second", 0)
                        if tokens_generated == 0 and content:
                            tokens_generated = len(content) // 4
                        duration = time.time() - start_time
                        if speed_tps == 0 and duration > 0 and tokens_generated > 0:
                            speed_tps = tokens_generated / duration
                        log_benchmark(f"Sweep temp {temp}: {tokens_generated} tokens, {speed_tps:.1f} t/s")
                    else:
                        log_benchmark_error(f"Sweep temp {temp}: HTTP {resp.status_code}")
                        content = ""
                except Exception as e:
                    log_benchmark_error(f"Sweep temp {temp}: {e}")
                    content = ""

                results.append({
                    "temperature": temp,
                    "response": content,
                    "tokens_generated": tokens_generated,
                    "tokens_per_second": round(speed_tps, 2),
                    "duration_seconds": round(time.time() - start_time, 2),
                })

                progress["sweep_progress"] = i + 1

                # Brief cooldown between temps
                if i < len(temperatures) - 1:
                    await asyncio.sleep(5)

        # 3. Grade all responses with judge
        effective_judge = judge_model_id or model_id
        log_benchmark(f"Sweep: Loading judge model {effective_judge}...")

        judge_preset = await get_preset(effective_judge, server_url="http://llm-server:8080")
        async with httpx.AsyncClient() as load_client:
            try:
                load_res = await load_client.post(
                    "http://llm-server:8080/models/load",
                    json={"model": judge_preset},
                    timeout=30,
                )
                if load_res.status_code != 200:
                    err = load_res.json().get("error", {}).get("message", "")
                    if "already" not in err:
                        log_benchmark_error(f"Sweep judge load: {err}")
            except Exception as e:
                log_benchmark_error(f"Sweep judge load exception: {e}")

        # Wait for judge to load
        for _ in range(60):
            await asyncio.sleep(2)
            curr = await _get_loaded_model()
            if curr and _clean_model_id(curr) == _clean_model_id(effective_judge):
                break
        await asyncio.sleep(2)

        # Get gold standard for Technical Reasoning
        gold = get_gold_answers()
        gold_round = gold.get(GOLD_KEY, {})
        correct_answer = gold_round.get("correct_answer", "")
        key_points = gold_round.get("key_points", [])
        max_points = gold_round.get("max_points", 25)
        key_points_str = "\n".join([f"- {kp}" for kp in key_points])

        # Grade each response
        for r in results:
            if not r["response"]:
                r["score"] = 0
                r["reasoning"] = "Empty response — no content to grade"
                r["hallucination_detected"] = False
                continue

            system_prompt = "You are an expert, objective AI Benchmark Judge."
            user_prompt = (
                f"You are grading a local LLM's response to a specific benchmark round.\n"
                f"Compare the model's response against the provided Gold Standard and verify which key points were addressed.\n\n"
                f"### Grading Rubric & Max Points:\n"
                f"- Category: technical_reasoning\n"
                f"- Max Points: {max_points}\n\n"
                f"### Gold Standard Ground Truth:\n"
                f"{correct_answer}\n\n"
                f"### Key Points to Verify:\n"
                f"{key_points_str}\n\n"
                f"### Model Response Under Test:\n"
                f'"""\n'
                f"{r['response']}\n"
                f'"""\n\n'
                f"### Grading Instructions:\n"
                f"1. Evaluate the model response strictly based on factual accuracy, correctness, and adherence to the key points.\n"
                f"2. Award points up to the maximum ({max_points} pts). Be fair but strict.\n"
                f"3. Deduced scores should be integers.\n\n"
                f"You must return a JSON object exactly matching this structure "
                f"(do not output any other text or markdown outside of the JSON):\n"
                f'{{"score": <integer_score>, '
                f'"reasoning": "<concise_explanation_of_the_assigned_score>", '
                f'"hallucination_detected": <true_or_false>, '
                f'"hallucination_description": "<description_if_detected_else_empty>"}}'
            )

            log_benchmark(f"Sweep: Grading temp {r['temperature']}...")
            try:
                judge_response = await query_judge_model(effective_judge, system_prompt, user_prompt)
                grades = parse_judge_json(judge_response)
                r["score"] = grades.get("score", 0)
                r["reasoning"] = grades.get("reasoning", "")
                r["hallucination_detected"] = grades.get("hallucination_detected", False)
            except Exception as parse_err:
                log_benchmark_error(f"Sweep grade failed for temp {r['temperature']}: {parse_err}")
                r["score"] = 0
                r["reasoning"] = f"Grading error: {parse_err}"
                r["hallucination_detected"] = False

            # Brief cooldown between judge calls
            await asyncio.sleep(3)

        # 4. Compute best temperature
        for r in results:
            tps = r.get("tokens_per_second", 0)
            speed_component = min(25, int((tps / 60.0) * 25))
            r["combined"] = (r.get("score", 0) or 0) + speed_component

        best = max(results, key=lambda r: r["combined"])
        progress["sweep_results"] = {
            "model_id": model_id,
            "judge_model": effective_judge,
            "temperatures_tested": len(results),
            "best_temperature": best["temperature"],
            "best_score": best.get("score", 0),
            "best_combined": best["combined"],
            "recommendation": (
                f"Temperature {best['temperature']} gives the best combined score "
                f"({best['combined']}) with score={best.get('score', 0)} "
                f"at {best.get('tokens_per_second', 0)} t/s"
            ),
            "sweeps": results,
        }

        log_benchmark(
            f"Sweep complete for {model_id}. Best temp: {best['temperature']} "
            f"(combined={best['combined']}, score={best.get('score', 0)})"
        )
        broadcast_notification(f"🌡️ Sweep complete — best temperature: {best['temperature']}")

    except Exception as e:
        traceback.format_exc()
        log_benchmark_error(f"Temperature sweep failed: {e}")
        progress["sweep_results"] = {"error": str(e)}
    finally:
        progress["sweep_running"] = False
        progress["sweep_progress"] = 0


async def run_temperature_sweep(req, background_tasks: BackgroundTasks) -> dict:
    """Route handler: validate and start sweep background task."""
    from .api import _check_and_set_running

    async with get_benchmark_lock():
        await _check_and_set_running()
        try:
            raw = await _get_loaded_model()
            if not raw:
                async with get_benchmark_lock():
                    set_benchmark_running(False)
                raise HTTPException(
                    status_code=400,
                    detail="No active model loaded. Please load a model first.",
                )
            background_tasks.add_task(
                run_temperature_sweep_task,
                req.judge_model_id,
                req.server,
                req.temperatures,
            )
            return {
                "status": "success",
                "message": "Temperature sweep initiated in the background.",
            }
        except Exception as e:
            async with get_benchmark_lock():
                set_benchmark_running(False)
            raise HTTPException(status_code=500, detail=str(e))
