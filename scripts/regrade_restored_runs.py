#!/usr/bin/env python3
"""
Re-grade restored benchmark runs with the AI Judge so their round_scores
(and therefore per-model aggregates + stddev) come back.

Background
----------
scripts/restore_benchmark_runs.py re-inserts test_runs rows for runs whose
raw JSON still exists in benchmark_results/. But the JSON only holds the
model's responses + speed metrics — the 0..N scores were produced by the
AI-Judge and lived only in round_scores, which were deleted. This script
re-runs that judge step for every test_runs row that has no round_scores,
using the project's existing judge_benchmark() pipeline (same prompts, gold
answers, parse/retry logic as the real benchmark flow).

A single judge model should be used for all runs so the recovered scores are
comparable across runs (the original runs used whatever model happened to be
loaded at the time).

Usage
-----
    # load a judge model first (or pass --judge-model to load it here)
    python scripts/regrade_restored_runs.py --judge-model qwopus3.6-35b-a3b-v1-iq4_xs
    # use whatever model is already loaded on llama-server:
    python scripts/regrade_restored_runs.py
    # limit to one model / a few runs (smoke test):
    python scripts/regrade_restored_runs.py --judge-model ... --only-model gemma-4-e4b-it-qat-ud-q4_k_xl
    python scripts/regrade_restored_runs.py --judge-model ... --limit 3
    # re-run runs whose previous judge round reported 'Grading failed':
    python scripts/regrade_restored_runs.py --judge-model ... --redo

Run from the repo root. It talks to llama-server (port 8080) as the judge
backend and writes to the same SQLite DB used by the app.
"""
import argparse
import asyncio
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from utils.db_utils import get_db_conn, _clean_model_id  # noqa: E402


# --------------------------------------------------------------------------
# judge model loading (mirrors the queue flow in services/benchmark/runner.py)
# --------------------------------------------------------------------------

async def ensure_judge_model(judge_model_id: str, server_url: str = "http://localhost:8080"):
    """Load judge_model_id on the given llama-server, waiting until ready.

    Returns the resolved **preset id** (exact /v1/models id, e.g.
    "...Q5_K_M.gguf"). That id is passed back into the judge pipeline so
    query_judge_model's own preset lookup (which uses the container hostname
    'llm-server') degrades gracefully to a valid id when run from the host.
    """
    import httpx
    from services.model_svc import _get_preset_id_for_model

    preset_id = await _get_preset_id_for_model(judge_model_id, server_url=server_url)
    print(f"[judge] loading {judge_model_id} (preset {preset_id}) on {server_url} ...")

    async with httpx.AsyncClient() as client:
        try:
            res = await client.post(f"{server_url}/models/load", json={"model": preset_id}, timeout=30)
            if res.status_code != 200:
                err = res.text[:200]
                if "already" not in err.lower():
                    print(f"[judge] load returned {res.status_code}: {err}")
        except Exception as e:
            print(f"[judge] load request failed: {e}")

        # Wait until the model shows as loaded via /models (the /slots endpoint
        # requires a ?model= param and only works once a model is active)
        norm = _clean_model_id(judge_model_id)
        for _ in range(60):
            await asyncio.sleep(2)
            try:
                models = (await client.get(f"{server_url}/models", timeout=5)).json().get("data", [])
                for m in models:
                    st = m.get("status")
                    status_ok = st == "loaded" or (isinstance(st, dict) and st.get("value") == "loaded")
                    if status_ok and _clean_model_id(m.get("id", "")) == norm:
                        print(f"[judge] {judge_model_id} is loaded.")
                        return preset_id
            except Exception:
                pass
        print(f"[judge] WARNING: could not confirm {judge_model_id} is loaded; continuing anyway")
        return preset_id


def _failed_run_ids() -> set:
    """run_ids whose round_scores contain a 'Grading failed' reasoning entry."""
    try:
        conn = get_db_conn()
        rows = conn.execute(
            "SELECT DISTINCT run_id FROM round_scores WHERE reasoning LIKE '%Grading failed%'"
        ).fetchall()
        conn.close()
        return {r[0] for r in rows}
    except Exception:
        return set()


def _resolve_path(db_path: str) -> str:
    """Find the raw JSON file; DB stores container paths but we may run on host."""
    if db_path and os.path.exists(db_path):
        return db_path
    if db_path:
        base = os.path.basename(db_path)
        for alt in (
            "/home/nui/llmaCPP/benchmark_results",
            "/app/benchmark_results",
            "/llm-server/benchmark_results",
        ):
            cand = os.path.join(alt, base)
            if os.path.exists(cand):
                return cand
    return db_path


async def grade_one(run_id: str, judge_model_id: str):
    """Grade a single run via the project's judge pipeline; returns its result dict."""
    from models.requests import JudgeRequest
    from services.judge import judge_benchmark

    req = JudgeRequest(run_id=run_id, judge_model_id=judge_model_id)
    return await judge_benchmark(req)


async def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--judge-model", default=None,
                    help="model id to use as the AI Judge (default: whatever is loaded)")
    ap.add_argument("--only-model", default=None,
                    help="only grade runs for this model (clean model_id form)")
    ap.add_argument("--limit", type=int, default=0,
                    help="max number of runs to grade in this invocation (0 = all)")
    ap.add_argument("--server-url", default="http://localhost:8080",
                    help="llama-server base URL used as judge backend")
    ap.add_argument("--dry-run", action="store_true",
                    help="only list runs that need grading, do not grade")
    ap.add_argument("--redo", action="store_true",
                    help="also re-grade runs whose current round_scores record a grading failure "
                         "(e.g. rounds that got 0 after a 400/timeout)")
    args = ap.parse_args()

    conn = get_db_conn()
    cur = conn.cursor()

    # Runs that exist but have no round_scores yet
    cur.execute("""
        SELECT tr.run_id, tr.model_id, tr.timestamp, tr.raw_output_path,
               (SELECT COUNT(*) FROM round_scores rs WHERE rs.run_id = tr.run_id) AS score_count
        FROM test_runs tr
        ORDER BY tr.model_id, tr.timestamp
    """)
    rows = cur.fetchall()
    conn.close()

    redo_ids = _failed_run_ids() if args.redo else set()

    def _resolve_path(db_path: str):
        if db_path and os.path.exists(db_path):
            return db_path
        if db_path:
            base = os.path.basename(db_path)
            for alt in (
                "/home/nui/llmaCPP/benchmark_results",
                "/app/benchmark_results",
                "/llm-server/benchmark_results",
            ):
                cand = os.path.join(alt, base)
                if os.path.exists(cand):
                    return cand
        return db_path

    # filter + group
    by_model = {}
    for run_id, model_id, ts, path, score_count in rows:
        if args.only_model and model_id != args.only_model:
            continue
        if score_count > 0 and run_id not in redo_ids:
            continue  # already scored, not flagged for redo
        path = _resolve_path(path)
        if not path or not os.path.exists(path):
            print(f"  [skip] {run_id}: raw JSON missing ({path})")
            continue
        by_model.setdefault(model_id, []).append((run_id, ts, path))

    total = sum(len(v) for v in by_model.values())
    print(f"Runs needing re-grading: {total} across {len(by_model)} models")
    for m, v in sorted(by_model.items(), key=lambda kv: -len(kv[1])):
        print(f"  {m:<62} {len(v):>3}")

    if args.dry_run:
        print("\n[dry-run] nothing graded.")
        return

    # resolve + load the judge model once; returns the exact preset id for chat calls
    judge_model_id = args.judge_model
    resolved_preset = None
    if args.judge_model:
        resolved_preset = await ensure_judge_model(args.judge_model, server_url=args.server_url)

    graded = 0
    for model_id, runs in sorted(by_model.items()):
        print(f"\n=== {model_id} ({len(runs)} runs) ===")
        for run_id, ts, path in runs:
            if args.limit and graded >= args.limit:
                print(f"[limit] stopped after {graded} graded runs.")
                return
            print(f"  grading {run_id} (ts={ts}) ...")
            t0 = time.time()
            try:
                # Use the resolved preset id (exact server id) instead of the
                # raw user-facing id — avoids the host/container hostname mixup.
                res = await grade_one(run_id, resolved_preset or judge_model_id)
                agg = res.get("aggregates") or {}
                print(f"    OK in {time.time()-t0:.0f}s | runs={agg.get('runs_count')} "
                      f"avg={agg.get('avg_total_score')} stddev={agg.get('score_stddev')} "
                      f"category={agg.get('category')}")
            except Exception as e:
                print(f"    FAILED: {e}")
            graded += 1
        # 10s cooldown between models (GPU protection, AGENTS rule 5)
        if graded < total:
            print("  cooling down 10s ...")
            await asyncio.sleep(10)

    print(f"\nDone. Graded {graded} runs.")


if __name__ == "__main__":
    asyncio.run(main())