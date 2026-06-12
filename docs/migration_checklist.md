# Migration Checklist — Phase 0

This document outlines the configurations, volumes, and network settings required to migrate/decouple from the legacy `llm-manager` to the new `llm-mobile` stack.

## 1. Environment Variables

Ensure these environment variables are set in the docker-compose service definition or a `.env` file:
* `LLM_COMPOSE_DIR=/llm-server`: Points to the directory where the master `docker-compose.yml` resides (inside the container context).
* `LLM_PROJECT_NAME=llmacpp`: Used by docker CLI commands to target the correct container project.
* `COMFYUI_HOST=host.docker.internal:8188`: Hostname/port of the ComfyUI image generator backend.

## 2. Volume Mounts

The following volumes are required to match the capabilities of the legacy manager:
* `/var/run/docker.sock:/var/run/docker.sock` (access to host docker socket)
* `/home/nui/llmaCPP:/llm-server` (project/compose context)
* `/home/nui/llmaCPP/models:/models` (storage folder for LLM GGUF models)
* `/home/nui/llmaCPP/llm_bench.db:/app/llm_bench.db` (benchmark results database)
* `/home/nui/llmaCPP/benchmark_results:/app/benchmark_results` (raw benchmark files)
* `/home/nui/.hermes:/mnt/hermes` (auxiliary/tool directory)
* `/home/nui/.pi:/mnt/pi:rw` (auxiliary/tool directory)
* `/home/nui/.local/share/uv:/home/nui/.local/share/uv:ro` (read-only uv package tool cache)
* `/home/nui/dev/ComfyUI/output:/comfyui-output` (ComfyUI generated images directory)
* `/home/nui/dev/llmMobile/PROMPTS:/app/PROMPTS` (local prompts sidecar source)

## 3. Network and Port Configuration

* **Port Mapping**: Map host port `8001` to container port `8000` (`8001:8000`) so it runs alongside the legacy manager (`8000:8000`) without collision.
* **Extra Hosts**: Add `host.docker.internal:host-gateway` to `extra_hosts` to enable the container to communicate with ComfyUI running on the host system.

## 4. Hardware/GPU Acceleration

* **GPU Passthrough**: Configure reservations for Nvidia GPU (with `gpu` and `utility` capabilities) so the container can monitor GPU usage, VRAM, and temperature.

## 5. Startup & Healthcheck Chain

* **depends_on**: Set `llama-server` dependency with the condition `service_healthy`. This ensures the manager does not start up until the main inference backend is responsive.

## 6. Hardcoded Application Configurations

Ensure the following hardcoded configs from `/home/nui/dev/llmWEB/main.py` are carried over or refactored into environmental variables:
* **MQTT Telemetry Config**:
  ```python
  MQTT_CONFIG = {
      "broker": "192.168.31.182",
      "user": "mqttuser",
      "pass": "mqttpass",
      "topics": {
          "home/129/sensor/cpu_temp": "cpu_temp",
          "home/129/sensor/tesla_p100_temp": "gpu_temp",
          "home/129/sensor/cpu_utilization": "cpu_util",
          "home/129/sensor/ram_utilization": "ram_percent",
          "home/129/sensor/vram_utilization": "vram_percent",
          "home/129/sensor/gpu_utilization": "gpu_util",
          "home/129/sensor/disk_utilization_root": "storage_percent"
      }
  }
  ```
