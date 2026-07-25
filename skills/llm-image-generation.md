# SKILL: llm-image-generation

## Purpose
Generate images using the ComfyUI pipeline. The system handles VRAM swapping between llama-server and ComfyUI automatically.

## MCP Tools Used
- `generate_image` — submit a generation request
- `check_generation_status` — monitor queue progress
- `cancel_generation` — cancel a queued/running generation
- `browse_gallery` — view generated images
- `get_system_stats` — check system state

## Prerequisites
- ComfyUI container must be running (check with `get_server_status`)
- The generation queue is independent of llama-server state (models are swapped automatically)

## Procedure

### 1. Submit a Generation
```
generate_image(
    prompt="A serene mountain landscape at sunset, digital art style",
    resolution="1920x1088",
    num_images=1,
    model="zimage",
    force_generate=False
)
```

Parameters explained:
- `prompt`: Text description of the image you want
- `resolution`: `1920x1088` (default landscape), `1024x1024` (square), `768x1344` (portrait)
- `num_images`: 1–16 images to generate (default 1)
- `model`: `zimage` (z-image-turbo, fast), `krea2-turbo` (KREA), `boogu-turbo`, or `both` (side-by-side comparison)
- `force_generate`: Skip VRAM check if llama-server is busy (default False)

### 2. Monitor Progress
```
check_generation_status()
```
Returns:
- `current_item.status` — "queued", "running", or "completed"
- `current_item.progress` — 0.0 to 1.0 (for running items)
- `current_item.prompt` — truncated prompt for identification

Poll every 5 seconds until `status_summary` shows "completed".

### 3. View Results
```
browse_gallery(path="", page=1, limit=24)
```
Generated images appear in the gallery root folder. Each image has a sidecar `.json` file with generation metadata (prompt, seed, resolution, model used).

### 4. Cancel if Needed
```
cancel_generation(queue_id="qa1b2c3d")
```
Only works if the generation is still queued or running. The queue ID is returned by `generate_image`.

## VRAM Swap Behavior
When you submit a generation:
1. The system checks if llama-server has a loaded model
2. If so, it waits for the model to be idle (polls `/slots` up to 30 seconds)
3. Unloads the model from llama-server to free VRAM
4. Runs ComfyUI to generate the image
5. After generation, frees ComfyUI memory
6. Waits 180 seconds (configurable cooldown) then reloads the llama-server model

## Safety Checks
| Check | When | How |
|-------|------|-----|
| Prompt non-empty | Before queue | `generate_image` rejects empty prompts |
| Image count clamped | Before queue | Clamped to 1–16 |
| llama-server idle | Before swap | Polls `/slots` up to 30s before unloading |
| Model reload after gen | After generation | Cooldown + retry logic for model reload |

## Edge Cases
- **llama-server busy**: If the server is processing a chat request, the generation waits up to 30s for idle. Set `force_generate=True` to skip this wait
- **Model fails to reload after generation**: The system retries twice with 3s pauses. If still failing, check `get_server_logs(container="llm-server")`
- **Generation cancelled mid-way**: Partial images are discarded. The interrupted ComfyUI workflow is cleaned up
- **Both models (krea2 + zimage)**: Two images are generated with a 15s pause between them. The first uses krea2-turbo, the second uses z-image-turbo

## Recovery
- If generation fails, check `check_generation_status()` for the error message
- If ComfyUI crashed, check `get_server_logs(container="comfyui")`
- If llama-server model fails to reload after generation, use `load_model()` to reload it manually