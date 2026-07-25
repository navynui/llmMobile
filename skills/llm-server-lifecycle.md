# SKILL: llm-server-lifecycle

## Purpose
Manage the lifecycle of the llama-server Docker containers — start, stop, restart, and monitor server health. Also covers fetching logs and system stats for diagnostics.

## MCP Tools Used
- `get_server_status` — comprehensive container status
- `get_system_stats` — hardware telemetry
- `start_server` — start a server
- `stop_server` — stop a server
- `restart_server` — restart a server
- `get_server_logs` — fetch Docker logs
- `check_benchmark_status` — avoid interrupting benchmarks

## Prerequisites
- Docker daemon must be accessible (it is inside the llm-mobile container)

## Procedure

### 1. Check Current State
```
get_server_status()
```
Returns:
- `manager` — llm-mobile container status
- `servers` — list of managed servers (llama-server, llama-server-mini) with status and uptime
- `comfyui` — ComfyUI container status

### 2. Check Hardware Resources
```
get_system_stats()
```
Returns:
- CPU temperature, utilization
- RAM usage percentage
- Tesla P100 GPU temp, utilization, VRAM
- GTX 1060 GPU temp, utilization, VRAM
- Storage used/total

### 3. Start a Server
```
start_server(server="llama-server")
```
or
```
start_server(server="llama-server-mini")
```
Wait 10–30 seconds for the server to initialize. Use `get_server_status()` to verify it's running.

### 4. Monitor Server Health
```
get_server_status()
```
Watch for `status: "running"` with a non-null `uptime`.

### 5. Stop a Server
```
stop_server(server="llama-server", force=False)
```
⚠️ If a benchmark is running, the tool will reject the stop unless `force=True`.

### 6. Restart a Server
```
restart_server(server="llama-server", force=False)
```
Use this after modifying `models.ini` or `modelg.ini` to apply changes.

### 7. Diagnose Issues
```
get_server_logs(container="llm-server", lines=100)
```
Available containers:
- `llm-server` — primary llama-server
- `llm-server-mini` — secondary llama-server
- `llm-mobile` — this dashboard
- `comfyui` — image generation server

## Safety Checks
| Check | When | How |
|-------|------|-----|
| Benchmark running | Before stop/restart | `stop_server`/`restart_server` check benchmark status |
| Valid server name | Before any action | Rejects invalid names (only "llama-server" and "llama-server-mini") |

## Edge Cases
- **Server already running**: Starting again returns error message
- **Server not running**: Stopping returns success with "not running" message
- **Container crashed**: Status will show "exited" — restart with `restart_server()`
- **Docker socket unavailable**: All server operations return Docker error — check the container's Docker socket mount

## Recovery
- If a server won't start, check logs with `get_server_logs(container="llm-server")` for errors
- Common startup failures: bad INI config, missing model file, GPU driver issues
- If the server crashes repeatedly, try loading a smaller model or different quantization