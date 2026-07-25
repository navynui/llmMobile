# SKILL: llm-benchmark-execution

## Purpose
Run the full automated benchmark suite on one or multiple models. Each model is tested with 5 rounds (Knowledge QA, Technical Reasoning, Code Generation, Abstract Reasoning, Creative Writing), then graded by an AI Judge against gold-standard answers.

## MCP Tools Used
- `run_benchmark` — single model benchmark
- `run_benchmark_queue` — multi-model benchmark queue
- `run_temperature_sweep` — find optimal temperature
- `check_benchmark_status` — monitor progress
- `get_benchmark_results` — retrieve scores
- `list_benchmarks` — overview of all benchmarked models
- `load_model` — ensure the test model is loaded
- `get_server_models` — verify model loaded

## Prerequisites
- A model must be loaded on the target server (for single benchmarks)
- The target server must be running
- Sufficient VRAM for the model

## Procedure

### Single Model Benchmark
```
1. list_models()                    # Choose a model
2. load_model(model="...", server="primary")  # Load it
3. run_benchmark(server="primary", judge_model_id="Judge-Model.gguf", auto_grade=True)
```

The tool returns a confirmation. The benchmark runs in the background (5–30 min).

### Monitor Progress
```
check_benchmark_status()
```
Returns:
- `current_round` — which round is executing
- `rounds_completed` — how many rounds done (out of 5)
- `running` — whether still in progress

Poll every 30–60 seconds until `running: false`.

### Review Results
```
get_benchmark_results(model_id="Model-Name.Q4_K_M.gguf", server="primary")
list_benchmarks(show_all=False)
```

Results include:
- Per-round scores (0–100 for each of 5 rounds)
- Speed score (0–25 based on tokens/second)
- Hallucination detections
- Overall score and pass/fail status

### Multi-Model Queue Benchmark
```
run_benchmark_queue(
    models=["Model-A.gguf", "Model-B.gguf", "Model-C.gguf"],
    judge_model_id="Judge-Model.gguf",
    server="primary"
)
```

The queue:
1. Loads each model automatically
2. Waits for it to be ready
3. Runs all 5 rounds
4. Moves to the next model (10s cooldown between models)
5. After all models complete, loads the Judge and grades everything batch-wise

### Temperature Sweep
```
run_temperature_sweep(
    judge_model_id="Judge-Model.gguf",
    server="primary",
    temperatures=[0.3, 0.5, 0.7, 1.0, 1.3]
)
```
Tests Technical Reasoning prompt at each temperature, grades all responses, and recommends the best temperature.

## Safety Checks
| Check | When | How |
|-------|------|-----|
| No concurrent benchmark | Before start | `run_benchmark` checks `/api/benchmarks/status` |
| Model is loaded | Before start | Checks the server's loaded model |
| All models exist | Before queue start | Validates each filename against disk |
| Speed threshold | During run | Auto-aborts if tokens/sec < 10 (model too slow for practical use) |
| Cooldown between rounds | During run | Built-in 10s pause between rounds |
| Cooldown between models | During queue | Built-in 10s pause between model swaps |

## Edge Cases
- **Too slow**: Models below 10 t/s are aborted and recorded as "too slow" rather than failing
- **Empty responses**: Up to 3 retries with expanded token budget (4096→6144→8192→12288)
- **Server errors**: Not retried — logged with HTTP error code
- **Judge model fails to load**: Queue continues but grading is skipped for that batch
- **Container crash**: The benchmark fails with an error entry; check `get_server_logs()`

## Recovery
- If a benchmark seems stuck (>30 min without progress), check `check_benchmark_status()` and `get_server_logs(container="llm-server")`
- If the server crashed during benchmarking, restart it with `restart_server(server="llama-server")` before trying again
- To re-run a benchmark on the same model, simply call `run_benchmark()` again — old results are cleared