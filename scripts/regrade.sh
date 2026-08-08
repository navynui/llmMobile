#!/usr/bin/env bash
#
# Re-grade restored benchmark runs with a single AI judge model:
#   nvidia-nemotron-labs-3-elastic-12b-a2b.i1-q5_k_m
#
# WHY: scripts/restore_benchmark_runs.py re-inserted test_runs rows from the
# raw JSON files in benchmark_results/, but the judge scores (round_scores)
# were deleted with the old rows. This runs the judge over each of those
# restored runs so the per-model aggregates (avg, stddev, runs_count) come
# back and the Benchmarks tab shows the μ ± σ chip again.
#
# HOW: it reuses the project's judge_benchmark() pipeline (same gold answers,
# prompts, parse/retry logic). It is safe to re-run — runs that already have
# round_scores are skipped, so Ctrl-C / failures simply resume next time.
#
# USAGE (from /home/nui/dev/llmMobile):
#   scripts/regrade.sh                                     # grade everything missing
#   scripts/regrade.sh --redo                              # also re-grade runs with failed scores (after a 400/timeout)
#   scripts/regrade.sh --dry-run                          # just list what would be graded
#   scripts/regrade.sh --only-model agents-a1-iq4_xs      # one model
#   scripts/regrade.sh --limit 3                          # first 3 runs (smoke test)
#
# NOTES:
#   * Judge model is loaded on the primary llama-server (GPU 0, P100) if not
#     already live. This job is GPU-bound and takes hours for the full set.
#   * Uses localhost:8080 — run from the HOST (not inside the container).
set -euo pipefail

cd "$(dirname "$0")/.."          # repo root (/home/nui/dev/llmMobile)

JUDGE_MODEL="nvidia-nemotron-labs-3-elastic-12b-a2b.i1-q5_k_m"

echo "==> Regrading restored benchmark runs with judge: $JUDGE_MODEL"
python3 scripts/regrade_restored_runs.py \
    --judge-model "$JUDGE_MODEL" \
    --server-url http://localhost:8080 \
    "$@"

echo "==> Done. Check the Benchmarks tab — restored models should now show ★ μ ± σ and ⟲ N runs."