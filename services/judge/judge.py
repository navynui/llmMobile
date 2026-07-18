import asyncio
import re
import time
import traceback
from typing import Optional

import httpx
from fastapi import HTTPException

from utils.db_utils import get_db_conn
from utils.common import get_quantization_from_name
from models.requests import JudgeRequest
from .gold import get_gold_key, get_gold_answers, load_raw_json

def get_llm_server_url() -> str:
    try:
        import socket
        socket.gethostbyname("llm-server")
        return "http://llm-server:8080"
    except Exception:
        return "http://localhost:8080"


def parse_judge_json(raw_text: str) -> dict:
    """Strip <think> blocks then extract first JSON object."""
    clean_text = re.sub(r'<think>.*?</think>', '', raw_text, flags=re.DOTALL)
    start_idx = clean_text.find('{')
    end_idx = clean_text.rfind('}')
    if start_idx == -1 or end_idx == -1:
        raise ValueError(f"No JSON object found in response: {raw_text[:200]}")
    json_str = clean_text[start_idx:end_idx + 1]
    import json
    return json.loads(json_str)


async def query_judge_model(judge_model: str, system_prompt: str, user_prompt: str) -> str:
    from services.model_svc import _get_preset_id_for_model
    from services.benchmark.logging import log_benchmark, log_benchmark_error

    url = f"{get_llm_server_url()}/v1/chat/completions"
    preset_id = await _get_preset_id_for_model(judge_model)
    log_benchmark(f"Grading round using Judge model: {preset_id}...")
    payload = {
        "model": preset_id,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ],
        "temperature": 0.1,
        "max_tokens": 4096,
        "stream": False
    }

    # Retry up to 2 times on timeout with exponential backoff.
    # max_tokens=4096 prevents runaway generation while giving enough
    # room for verbose preamble + JSON object. 600s timeout is safety net.
    max_retries = 2
    retry_delays = [5.0, 15.0]
    for attempt in range(max_retries + 1):
        try:
            async with httpx.AsyncClient(timeout=600.0) as client:
                response = await client.post(url, json=payload)
                response.raise_for_status()
                res_data = response.json()
                log_benchmark(f"Grading round completed for Judge model: {preset_id}")
                return res_data["choices"][0]["message"]["content"]
        except (httpx.ReadTimeout, httpx.TimeoutException) as e:
            if attempt < max_retries:
                delay = retry_delays[attempt]
                log_benchmark_error(f"Judge request timed out, retry {attempt+1}/{max_retries} in {delay}s...")
                await asyncio.sleep(delay)
            else:
                log_benchmark_error(f"Judge request timed out after {max_retries+1} attempts, raising")
                raise


async def judge_benchmark(req: JudgeRequest):
    import os, time
    from services.chat_svc import _get_loaded_model
    from services.benchmark.logging import log_benchmark, log_benchmark_error

    model_id = None  # initialise for error handler scope
    try:
        conn = get_db_conn()
        cursor = conn.cursor()

        # 1. Determine run_id and model_id
        if req.run_id:
            cursor.execute("SELECT run_id, model_id, raw_output_path FROM test_runs WHERE run_id = ?", (req.run_id,))
            run_row = cursor.fetchone()
        else:
            cursor.execute("SELECT run_id, model_id, raw_output_path FROM test_runs ORDER BY timestamp DESC LIMIT 1")
            run_row = cursor.fetchone()

        if not run_row:
            conn.close()
            raise HTTPException(status_code=404, detail="No test run found to grade")

        run_id = run_row["run_id"]
        model_id = run_row["model_id"]
        raw_output_path = run_row["raw_output_path"]

        # 2. Determine Judge model
        judge_model = req.judge_model_id or await _get_loaded_model()
        if not judge_model:
            conn.close()
            raise HTTPException(status_code=400, detail="No active model loaded to act as Judge. Please load a model first.")

        # 3. Load raw JSON results
        raw_data = load_raw_json(raw_output_path)
        gold = get_gold_answers()

        # 4. Compute average TPS and Speed score
        tps_list = []
        for r in raw_data.get("rounds", []):
            metrics = r.get("metrics", {})
            tps = metrics.get("tokens_per_second") or 0.0
            if not tps:
                dur = metrics.get("duration_seconds") or 0.0
                tok = metrics.get("tokens_generated") or 0.0
                if dur > 0:
                    tps = tok / dur
            if tps > 0:
                tps_list.append(tps)

        avg_tps = sum(tps_list) / len(tps_list) if tps_list else 0.0
        speed_score = min(25, int((avg_tps / 60.0) * 25))

        # 5. Grade qualitative rounds sequentially
        graded_rounds = []
        hallucinations = []

        for r in raw_data.get("rounds", []):
            round_name = r.get("round") or r.get("round_name") or ""
            model_response = r.get("response", "")
            gold_key = get_gold_key(round_name)

            if not gold_key or gold_key not in gold:
                print(f"Skipping unmappable round: {round_name}")
                continue

            gold_round = gold[gold_key]
            correct_answer = gold_round.get("correct_answer", "")
            key_points = gold_round.get("key_points", [])
            max_points = gold_round.get("max_points", 0)
            key_points_str = "\n".join([f"- {kp}" for kp in key_points])

            system_prompt = "You are an expert, objective AI Benchmark Judge."
            user_prompt = f"""You are grading a local LLM's response to a specific benchmark round.
Compare the model's response against the provided Gold Standard and verify which key points were addressed.

### Grading Rubric & Max Points:
- Category: {gold_key}
- Max Points: {max_points}

### Gold Standard Ground Truth:
{correct_answer}

### Key Points to Verify:
{key_points_str}

### Model Response Under Test:
\"\"\"
{model_response}
\"\"\"

### Grading Instructions:
1. Evaluate the model response strictly based on factual accuracy, correctness, and adherence to the key points.
2. Award points up to the maximum ({max_points} pts). Be fair but strict.
3. Deduced scores should be integers.
4. Auditing Hallucinations:
   - If this is "Round 1: Knowledge QA" (knowledge_qa), check if the model fabricated, invented, or hallucinated facts, spelling, or etymology (e.g. fabricating parts of Bangkok's name, inventing Thai words, or providing wrong English translations).
   - If a hallucination is detected, you MUST set "hallucination_detected" to true and provide a description.

You must return a JSON object exactly matching this structure (do not output any other text or markdown outside of the JSON):
{{
    "score": <integer_score>,
    "reasoning": "<concise_explanation_of_the_assigned_score>",
    "hallucination_detected": <true_or_false>,
    "hallucination_description": "<description_if_detected_else_empty>"
}}"""

            print(f"Grading round: {gold_key} using judge {judge_model}...")
            log_benchmark(f"Grading round: {gold_key} using judge {judge_model}")
            try:
                judge_response = await query_judge_model(judge_model, system_prompt, user_prompt)
                grades = parse_judge_json(judge_response)

                score = grades.get("score") or 0
                reasoning = grades.get("reasoning") or ""
                hallucinated = grades.get("hallucination_detected") or False
                hallucination_desc = grades.get("hallucination_description") or ""

                round_tps = r.get("metrics", {}).get("tokens_per_second") or avg_tps

                graded_rounds.append({
                    "round_name": gold_key,
                    "score": min(max_points, int(score)),
                    "reasoning": reasoning,
                    "speed_tps": round_tps
                })

                if hallucinated and hallucination_desc:
                    hallucinations.append({
                        "round_name": round_name,
                        "description": hallucination_desc
                    })
            except ValueError as parse_err:
                # JSON parsing failed — retry once with a minimal JSON-only prompt
                # to sidestep verbose preamble that may exceed max_tokens.
                log_benchmark_error(f"Judge: JSON parse failed for {gold_key}, retrying with minimal prompt...")
                try:
                    retry_system = "You are a strict JSON-only judge. Return ONLY the JSON object, no other text."
                    retry_prompt = f"""Return ONLY a valid JSON object with these exact keys:
- score (integer 0-{max_points})
- reasoning (string)
- hallucination_detected (true/false)
- hallucination_description (string, empty if none)

Model response to grade:
\"\"\"
{model_response}
\"\"\"

JSON:"""
                    judge_response = await query_judge_model(judge_model, retry_system, retry_prompt)
                    grades = parse_judge_json(judge_response)

                    score = grades.get("score") or 0
                    reasoning = grades.get("reasoning") or ""
                    hallucinated = grades.get("hallucination_detected") or False
                    hallucination_desc = grades.get("hallucination_description") or ""
                    round_tps = r.get("metrics", {}).get("tokens_per_second") or avg_tps

                    graded_rounds.append({
                        "round_name": gold_key,
                        "score": min(max_points, int(score)),
                        "reasoning": reasoning,
                        "speed_tps": round_tps
                    })
                    if hallucinated and hallucination_desc:
                        hallucinations.append({
                            "round_name": round_name,
                            "description": hallucination_desc
                        })
                    log_benchmark(f"Judge: JSON retry succeeded for {gold_key}")
                except Exception as retry_err:
                    traceback.format_exc()
                    print(f"Failed to grade round {gold_key}: {retry_err}")
                    log_benchmark_error(f"Judge: Grading failed for round {gold_key} after retry: {str(retry_err)}")
                    graded_rounds.append({
                        "round_name": gold_key,
                        "score": 0,
                        "reasoning": f"Grading failed after retry: {str(retry_err)}",
                        "speed_tps": 0.0
                    })
            except Exception as grading_err:
                traceback.format_exc()
                print(f"Failed to grade round {gold_key}: {grading_err}")
                log_benchmark_error(f"Judge: Grading failed for round {gold_key}: {str(grading_err)}")
                graded_rounds.append({
                    "round_name": gold_key,
                    "score": 0,
                    "reasoning": f"Grading failed: {str(grading_err)}",
                    "speed_tps": 0.0
                })

        # 6. Save results to Database
        cursor.execute("SELECT run_id FROM test_runs WHERE model_id = ? AND run_id != ?", (model_id, run_id))
        old_runs = cursor.fetchall()
        for old_run in old_runs:
            cursor.execute("DELETE FROM test_runs WHERE run_id = ?", (old_run["run_id"],))

        cursor.execute("DELETE FROM model_hallucinations WHERE model_id = ?", (model_id,))
        cursor.execute("DELETE FROM round_scores WHERE run_id = ?", (run_id,))

        model_name = raw_data.get("model_name") or model_id
        quant = get_quantization_from_name(model_name)
        status = "failed" if hallucinations else "good"

        cursor.execute("""
        INSERT INTO models (model_id, name, quantization, status, notes)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(model_id) DO UPDATE SET
            name = excluded.name,
            quantization = excluded.quantization,
            status = excluded.status,
            notes = excluded.notes
        """, (model_id, model_name, quant, status, f"Graded by {judge_model} on {time.strftime('%Y-%m-%d %H:%M:%S')}"))

        cursor.execute("""
        INSERT INTO round_scores (run_id, round_name, score, reasoning, speed_tps)
        VALUES (?, 'speed_metric', ?, ?, ?)
        """, (run_id, speed_score, f"Observed average TPS: {avg_tps:.2f}", avg_tps))

        for gr in graded_rounds:
            cursor.execute("""
            INSERT INTO round_scores (run_id, round_name, score, reasoning, speed_tps)
            VALUES (?, ?, ?, ?, ?)
            """, (run_id, gr["round_name"], gr["score"], gr["reasoning"], gr["speed_tps"]))

        for h in hallucinations:
            cursor.execute("""
            INSERT INTO model_hallucinations (model_id, round_name, description, severity)
            VALUES (?, ?, ?, 'warning')
            """, (model_id, h["round_name"], h["description"]))

        log_benchmark(f"All {len(graded_rounds)} qualitative rounds graded. Hallucinations: {len(hallucinations)}")
        conn.commit()
        conn.close()

        return {
            "status": "success",
            "model_id": model_id,
            "run_id": run_id,
            "average_tps": round(avg_tps, 2),
            "speed_score": speed_score,
            "graded_rounds": graded_rounds,
            "hallucinations_detected": len(hallucinations)
        }
    except Exception as e:
        traceback.format_exc()
        from services.benchmark.logging import log_benchmark_error
        log_benchmark_error(f"Judge grading error for model {model_id}: {e}")
        print(f"Error in judge_benchmark: {e}")
        raise HTTPException(status_code=500, detail=str(e))
