#!/usr/bin/env python3
"""
Restore deleted benchmark run history from the raw JSON files in
benchmark_results/.

Problem
----
The `test_runs` table used to keep several runs per model so the Benchmarks
tab could compute μ ± σ (avg_total_score, score_stddev, runs_count). At some
point all historical rows except the most recent one per model were deleted,
so every model's score_stddev == 0.0 / runs_count == 1 and the stddev chip
never shows again (even after new runs, unless you re-run the benchmark many
times — which is slow).

This script re-inserts the *metadata* rows from the saved JSON files:
  * for every benchmark_<uuid>.json whose run is missing from test_runs
    a row is inserted (run_id, model_id, timestamp, raw_output_path,
    server, execution_mode, temperature=0.7, run_number=1, run_group_id=NULL)
  * retention window: only the newest `--max-keep` runs per model are kept
    (default 5, matching prune_old_runs() in utils/db_utils.py)
  * server is guessed from the model's existing DB rows (fallback primary)
  * execution_mode is inferred from the JSON round count (3 → fast_screen)

NOTE: the JSON files contain responses + speed metrics only, NOT the
AI-Judge scores. After this script, run scripts/regrade_restored_runs.py to
re-run the judge over the restored runs so their round_scores (and therefore
the per-model aggregates / stddev) are restored.

Usage
----
    python scripts/restore_benchmark_runs.py                # dry-run (default)
    python scripts/restore_benchmark_runs.py --apply        # write rows
    python scripts/restore_benchmark_runs.py --max-keep 5
    python scripts/restore_benchmark_runs.py --only-model gemma-4-e4b-it-wat-ud-q4_k_xl

Run from the repo root (it imports the project's utils package).
"""
import argparse
import glob
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from utils.db_utils import get_db_conn, _clean_model_id  # noqa: E402
from utils.common import get_quantization_from_name  # noqa: E402


def benchmark_results_dir() -> str:
    if os.path.isdir("/app/benchmark_results"):
        return "/app/benchmark_results"
    return "/home/nui/llmaCPP/benchmark_results"


def load_json(path: str):
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        print(f"  [warn] cannot parse {os.path.basename(path)}: {e}")
        return None


def collect_file_runs(bdir: str):
    """Return list of dicts for every parseable benchmark_*.json in bdir."""
    runs = []
    for path in sorted(glob.glob(os.path.join(bdir, "benchmark_*.json"))):
        base = os.path.basename(path)
        if not (base.startswith("benchmark_") and base.endswith(".json")):
            continue
        run_id = base[len("benchmark_"):-len(".json")]
        data = load_json(path)
        if not data:
            continue
        model_id = _clean_model_id(data.get("model_id") or data.get("model_name") or "")
        if not model_id:
            print(f"  [warn] {base}: no model_id / model_name — skipped")
            continue
        runs.append({
            "run_id": run_id,
            "model_id": model_id,
            "model_name": data.get("model_name") or model_id,
            "timestamp": data.get("timestamp") or "",
            "raw_output_path": path,
            "n_rounds": len(data.get("rounds", []) or []),
        })
    return runs


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--apply", action="store_true",
                    help="write rows (default is a dry-run)")
    ap.add_argument("--max-keep", type=int, default=5,
                    help="newest runs per model to keep (default 5)")
    ap.add_argument("--only-model", default=None,
                    help="only restore this model (clean model_id form)")
    ap.add_argument("--bench-dir", default=None,
                    help="benchmark_results dir (default auto-detected)")
    args = ap.parse_args()

    bdir = args.bench_dir or benchmark_results_dir()
    file_runs = collect_file_runs(bdir)

    conn = get_db_conn()
    cur = conn.cursor()

    # runs already present in the DB
    cur.execute("SELECT run_id, model_id, server FROM test_runs")
    existing = {(r[0], r[1]) for r in cur.fetchall()}

    # per-model server preference (first row wins; deterministic)
    cur.execute("SELECT model_id, server FROM test_runs WHERE server IS NOT NULL")
    model_server = {}
    for mid, srv in cur.fetchall():
        if mid not in model_server:
            model_server[mid] = srv

    # known models so we can insert missing model rows
    cur.execute("SELECT model_id, name, quantization FROM models")
    known_models = {r[0]: (r[1], r[2]) for r in cur.fetchall()}

    # group file runs by model
    by_model = {}
    for r in file_runs:
        by_model.setdefault(r["model_id"], []).append(r)

    candidates = []       # (run dict, server, execution_mode)
    model_upserts = []    # (model_id, name, quantization)

    for model_id in sorted(by_model):
        if args.only_model and model_id != args.only_model:
            continue
        runs = sorted(by_model[model_id], key=lambda r: (r["timestamp"], r["run_id"]))
        if len(runs) > args.max_keep:
            runs = runs[-args.max_keep:]  # keep the newest args.max_keep

        server = model_server.get(model_id, "primary")
        for r in runs:
            if (r["run_id"], model_id) in existing:
                continue
            mode = "fast_screen" if r["n_rounds"] == 3 else "full"
            candidates.append((r, server, mode))

        if model_id not in known_models:
            # newest run's model_name is the best display name we have
            name = runs[-1]["model_name"]
            model_upserts.append((model_id, name, get_quantization_from_name(name)))

    # ---- summary ----
    ins_by_model = {}
    for r, _, _ in candidates:
        ins_by_model[r["model_id"]] = ins_by_model.get(r["model_id"], 0) + 1

    print(f"Parsed {len(file_runs)} JSON runs from {bdir}")
    print(f"Models with file history: {len(by_model)}")
    print(f"Existing test_runs rows:  {len(existing)}")
    print(f"Runs to INSERT (window max_keep={args.max_keep}): {len(candidates)}")
    print(f"Models missing from models table: {len(model_upserts)}")
    print()
    print(f"{'model':<62} {'restore':>7} {'server':>9}")
    for model_id in sorted(ins_by_model, key=lambda m: -ins_by_model[m]):
        server = next(srv for r, srv, _ in candidates if r["model_id"] == model_id)
        print(f"{model_id:<62} {ins_by_model[model_id]:>7} {server:>9}")
    if model_upserts:
        print("\nModels that will be inserted:")
        for m, name, q in model_upserts:
            print(f"  {m}  ({name}, quant={q})")

    if not args.apply:
        print("\n[dry-run] nothing written. Re-run with --apply to write.")
        return

    # ---- write ----
    # models first: test_runs has a FK to models (model_id)
    for m, name, q in model_upserts:
        try:
            conn.execute(
                """
                INSERT INTO models (model_id, name, quantization, status, notes)
                VALUES (?, ?, ?, 'testing', 'Restored from benchmark_results JSON')
                """,
                (m, name, q),
            )
        except Exception as e:
            print(f"  [error] inserting model {m}: {e}")
    for r, srv, mode in candidates:
        try:
            cur.execute(
                """
                INSERT INTO test_runs
                    (run_id, model_id, timestamp, raw_output_path, server,
                     run_number, run_group_id, execution_mode, temperature)
                VALUES (?, ?, ?, ?, ?, 1, NULL, ?, ?)
                """,
                (r["run_id"], r["model_id"], r["timestamp"], r["raw_output_path"],
                 srv, mode, 0.7),
            )
        except Exception as e:
            print(f"  [error] inserting run {r['run_id']}: {e}")
    conn.commit()
    conn.close()

    print(f"[apply] inserted {len(candidates)} test_runs rows, "
          f"{len(model_upserts)} model rows")


if __name__ == "__main__":
    main()