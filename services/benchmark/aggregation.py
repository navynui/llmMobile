import math
import traceback
from typing import Dict, Any, Optional

from utils.db_utils import get_db_conn, _clean_model_id


CATEGORY_LABELS = {
    "speed_first": "⚡ Speed-First",
    "reasoning": "🧠 Reasoning",
    "vram_efficient": "🔋 VRAM-Efficient",
    "balanced": "⚖️ Balanced",
    "specialized": "🎯 Specialized",
    "unclassified": "❓ Unclassified",
}


def classify_model(avg_speed_tps: float, avg_reasoning: float, avg_code: float, vram_gb: Optional[float] = None) -> str:
    """Categorize model based on aggregated benchmark metrics.
    
    Categories (from category.md & categorization_plan.md):
    - Speed-First: >= 60 TPS
    - Reasoning/Analysis: avg_reasoning >= 14/18 and avg_code >= 14/18 and VRAM < 16GB
    - VRAM-Efficient: VRAM < 12GB and avg_reasoning >= 10/18
    - Balanced: 15 <= TPS < 60 and 12 <= avg_reasoning <= 17
    - Specialized: avg_reasoning >= 16 or avg_code >= 16
    """
    speed = avg_speed_tps or 0.0
    reasoning = avg_reasoning or 0.0
    code = avg_code or 0.0
    vram = vram_gb or 0.0

    if speed >= 60.0:
        return "speed_first"
    elif reasoning >= 14.0 and code >= 14.0 and (vram == 0.0 or vram < 16.0):
        return "reasoning"
    elif 0.0 < vram < 12.0 and reasoning >= 10.0:
        return "vram_efficient"
    elif 15.0 <= speed <= 60.0 and 12.0 <= reasoning <= 17.0:
        return "balanced"
    elif reasoning >= 16.0 or code >= 16.0:
        return "specialized"
    return "unclassified"


def calculate_and_store_model_aggregates(model_id: str) -> Dict[str, Any]:
    """Compute multi-run statistics (mean, stddev, TPS, category) and store in DB."""
    clean_id = _clean_model_id(model_id)
    try:
        conn = get_db_conn()
        cursor = conn.cursor()

        # 1. Fetch all test runs for this model
        cursor.execute("""
            SELECT run_id, timestamp, server, vram_gb
            FROM test_runs
            WHERE model_id = ?
            ORDER BY timestamp DESC
        """, (clean_id,))
        run_rows = cursor.fetchall()

        if not run_rows:
            conn.close()
            return {"model_id": clean_id, "runs_count": 0, "status": "no_runs"}

        run_ids = [r["run_id"] for r in run_rows]
        placeholders = ",".join(["?"] * len(run_ids))

        # 2. Fetch round scores for all runs
        cursor.execute(f"""
            SELECT run_id, round_name, score, speed_tps
            FROM round_scores
            WHERE run_id IN ({placeholders})
        """, run_ids)
        score_rows = cursor.fetchall()

        # Group scores by run
        run_scores = {rid: [] for rid in run_ids}
        run_tps = {rid: [] for rid in run_ids}
        reasoning_scores = []
        code_scores = []

        for row in score_rows:
            rid = row["run_id"]
            rn = row["round_name"]
            score = row["score"] or 0
            tps = row["speed_tps"] or 0.0

            run_scores[rid].append(score)
            if tps > 0:
                run_tps[rid].append(tps)

            if rn in ("abstract_logic", "technical_reasoning"):
                reasoning_scores.append(score)
            elif rn == "code_generation":
                code_scores.append(score)

        # 3. Compute per-run total scores and average TPS
        total_scores = [sum(scores) for scores in run_scores.values() if scores]
        all_tps = [sum(t) / len(t) for t in run_tps.values() if t]

        n = len(total_scores)
        if n == 0:
            conn.close()
            return {"model_id": clean_id, "runs_count": 0, "status": "empty_scores"}

        avg_score = sum(total_scores) / n
        avg_tps = sum(all_tps) / len(all_tps) if all_tps else 0.0

        if n > 1:
            variance = sum((s - avg_score) ** 2 for s in total_scores) / (n - 1)
            stddev = math.sqrt(variance)
        else:
            stddev = 0.0

        avg_reasoning = (sum(reasoning_scores) / len(reasoning_scores)) if reasoning_scores else 0.0
        avg_code = (sum(code_scores) / len(code_scores)) if code_scores else 0.0

        # Get latest run's VRAM
        cursor.execute("SELECT vram_gb FROM models WHERE model_id = ?", (clean_id,))
        model_row = cursor.fetchone()
        vram_gb = model_row["vram_gb"] if model_row else None

        category = classify_model(avg_tps, avg_reasoning, avg_code, vram_gb)

        # 4. Store aggregates back into models table
        cursor.execute("""
            UPDATE models
            SET category = ?,
                avg_total_score = ?,
                avg_tps = ?,
                score_stddev = ?,
                runs_count = ?
            WHERE model_id = ?
        """, (category, round(avg_score, 2), round(avg_tps, 2), round(stddev, 2), n, clean_id))

        conn.commit()
        conn.close()

        return {
            "model_id": clean_id,
            "runs_count": n,
            "avg_total_score": round(avg_score, 2),
            "score_stddev": round(stddev, 2),
            "avg_tps": round(avg_tps, 2),
            "category": category,
            "category_label": CATEGORY_LABELS.get(category, "❓ Unclassified"),
            "status": "success"
        }
    except Exception as e:
        traceback.format_exc()
        print(f"[Aggregation] Error calculating aggregates for {clean_id}: {e}")
        return {"model_id": clean_id, "error": str(e), "status": "error"}
