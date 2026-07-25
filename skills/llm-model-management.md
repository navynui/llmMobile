# SKILL: llm-model-management

## Purpose
Manage the full lifecycle of GGUF models on the dual llama-server instances. Use this whenever you need to load, unload, list, or delete models.

## MCP Tools Used
- `list_models` — discover available models
- `get_server_models` — check what's loaded on a server
- `load_model` — load a model onto a server
- `unload_model` — unload model from a server
- `delete_model` — permanently delete a model file
- `get_system_stats` — check VRAM usage
- `get_server_status` — check if servers are running

## Prerequisites
- At least one llama-server instance must be running (check with `get_server_status`)

## Procedure

### 1. Discover Available Models
```
list_models()
```
Returns all `.gguf` files on disk with sizes. Note which models are available.

### 2. Check Current State
```
get_server_models(server="primary")
get_server_models(server="secondary")
```
Shows what's currently loaded on each server.

### 3. Check System Resources
```
get_system_stats()
```
Check VRAM — primary GPU has 16 GB, secondary has 6 GB.

### 4. Load a Model
```
load_model(model="Model-Name.Q4_K_M.gguf", server="primary")
```
The tool automatically:
- Validates the model file exists
- Checks it fits in available VRAM (with 2 GB safety margin on primary, 1 GB on secondary)
- Verifies no benchmark is running
- Unloads any current model first
- Polls to confirm the load succeeded

### 5. Unload a Model
```
unload_model(server="primary")
```
The tool automatically:
- Identifies the currently loaded model
- Sends the unload request
- Polls to confirm VRAM is freed

### 6. Delete a Model (⚠️ Destructive)
```
delete_model(model="Model-Name.Q4_K_M.gguf", server="primary", confirm=True)
```
Only proceed if:
- The model is NOT currently loaded (the tool prevents deletion of loaded models)
- You are absolutely sure the file should be permanently removed
- Pass `confirm=True` explicitly — the tool rejects without it

## Safety Checks
| Check | When | How |
|-------|------|-----|
| VRAM fits | Before load | `load_model` checks model size vs GPU VRAM with margin |
| No benchmark running | Before load | `load_model` checks `/api/benchmarks/status` |
| File exists | Before load/delete | Tool checks `/models/` directory |
| Model not loaded | Before delete | `delete_model` checks both servers |
| Unload verified | After unload | Polls `/api/llm/models` until no loaded model |

## Edge Cases
- **Model already loaded**: `load_model` returns success immediately saying "already loaded"
- **No model loaded**: `unload_model` returns success with "nothing to unload"
- **Model too large for GPU**: Returns clear error with size and max recommendation
- **Server not running**: Returns error — start the server first with `start_server`
- **Benchmark in progress**: Returns error — wait for benchmark to finish

## Recovery
- If a model load fails, check `get_server_logs(container="llm-server")` for error details
- Common causes: file corruption, insufficient VRAM (try a smaller quant), server crashed
- After crash, use `restart_server(server="llama-server")` to recover