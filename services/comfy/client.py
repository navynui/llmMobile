import httpx
from utils.common import COMFYUI_HOST
# ───────────────────────────────────────────────
# ComfyUI HTTP client
# ───────────────────────────────────────────────
_COMFY_HTTP = httpx.Client(base_url=f"http://{COMFYUI_HOST}", timeout=60)


def get_comfy_http() -> httpx.Client:
    return _COMFY_HTTP


def set_comfy_http(client):
    global _COMFY_HTTP
    _COMFY_HTTP = client


