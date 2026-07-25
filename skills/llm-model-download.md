# SKILL: llm-model-download

## Purpose
Download GGUF models from HuggingFace to the local models directory, register them with the server's INI configuration, and verify they're ready to use.

## MCP Tools Used
- `search_huggingface_models` — find models on HuggingFace
- `get_model_details` — inspect model files and sizes
- `download_model` — queue a download with disk space check
- `check_download_status` — monitor progress
- `cancel_download` — cancel actively downloading model
- `scan_and_register_models` — register downloaded models in INI
- `list_models` — verify registration
- `get_system_stats` — check available disk space

## Prerequisites
- Internet access to HuggingFace
- At least 5 GB + model size of free disk space (root partition: 464 GB total)

## Procedure

### 1. Search for Models
```
search_huggingface_models(query="Llama-3.2-3B GGUF", max_results=10)
```
Returns repo IDs with descriptions. Look for well-known quantizers like `QuantFactory`, `bartowski`, `mradermacher`.

### 2. Inspect a Repo
```
get_model_details(repo_id="QuantFactory/Meta-Llama-3.1-8B-Instruct-GGUF")
```
Returns file list with sizes. Choose a quantization that fits your target GPU:
- **Primary (Tesla P100, 16 GB)**: Models up to ~14 GB → Q4_K_M, Q5_K_M, IQ4_XS
- **Secondary (GTX 1060, 6 GB)**: Models up to ~5 GB → Q4_K_M or smaller for 7B models

### 3. Check Disk Space
```
get_system_stats()
```
Check `storage.used_pct` and `storage.total_gb`. You need at least model_size + 5 GB free.

### 4. Download the Model
```
download_model(
    repo_id="QuantFactory/Meta-Llama-3.1-8B-Instruct-GGUF",
    filename="Meta-Llama-3.1-8B-Instruct.Q4_K_M.gguf",
    target_server="primary"
)
```
The tool automatically:
- Checks if the file is already downloaded
- Checks available disk space (rejects if < 25 GB free for safety)
- Queues the download to the background worker
- Returns a confirmation with the download key

### 5. Monitor Download
```
check_download_status()
```
Polls every 5–10 seconds. Look for `status: "downloading"` or `status: "completed"`. Download speed depends on your internet connection and HuggingFace load.

### 6. Register Downloaded Models
```
scan_and_register_models(server="both")
```
This scans the `/models/` directory and adds any unregistered GGUF files to the server's INI configuration.

### 7. Verify
```
list_models()
```
Confirm the model appears in the list. Then use `load_model()` to load it.

## Safety Checks
| Check | When | How |
|-------|------|-----|
| Already downloaded | Before download | `download_model` checks `/models/` for existing file |
| Disk space | Before download | `download_model` checks available space vs 25 GB minimum |
| Valid filename | Before download | Must end with `.gguf` |
| Cancel + cleanup | On cancel | `cancel_download` removes partial `.download` file |

## Edge Cases
- **Download fails mid-way**: Status shows `failed` with error message. Use `check_download_status()`, then retry by calling `download_model()` again (will overwrite partial)
- **Disk full during download**: Download fails, partial file is left as `.download`. Use `cancel_download()` to clean up, then free space by deleting unused models
- **Network timeout**: The download has built-in retry. If it persists, try a different time or smaller model
- **Model too large for secondary GPU**: The download still works, just can't be loaded on secondary. Use `load_model(server="primary")` instead

## Recovery
- If download fails, check `get_server_logs(container="llm-mobile")` for error messages
- If disk is full, use `delete_model()` with `confirm=True` to remove old/unused models
- After a successful download, always run `scan_and_register_models()` before trying to load