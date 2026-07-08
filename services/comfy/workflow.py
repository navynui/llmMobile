import os
import json
import asyncio
import datetime
import threading
import traceback
import httpx
import websocket as ws_client
from typing import Optional
import uuid

from fastapi import Request
from fastapi.responses import StreamingResponse

from models.requests import GenerateRequest
from utils.common import (
    WORKFLOW_PATH,
    KREA_WORKFLOW_PATH,
    COMFYUI_HOST,
    COMFY_CLIENT_ID,
    NODE_PROMPT_TEXT,
    NODE_RESOLUTION,
    NODE_KSAMPLER,
    NODE_KREA_PROMPT_TEXT,
    NODE_KREA_RESOLUTION,
    NODE_KREA_KSAMPLER,
    MODEL_ZIMAGE,
    MODEL_KREA,
    IMAGE_GEN_OUTPUT,
    _deep_copy,
)
# ───────────────────────────────────────────────
# Workflow helpers
# ───────────────────────────────────────────────
_workflow_cache: Optional[dict] = None
_workflow_cache_krea: Optional[dict] = None
_workflow_lock = threading.Lock()


def _load_workflow(path: str = WORKFLOW_PATH) -> dict:
    global _workflow_cache, _workflow_cache_krea
    cache = _workflow_cache if path == WORKFLOW_PATH else _workflow_cache_krea
    with _workflow_lock:
        if cache is None:
            with open(path) as f:
                cache = json.load(f)
            if path == WORKFLOW_PATH:
                _workflow_cache = cache
            else:
                _workflow_cache_krea = cache
        return _deep_copy(cache)


def _build_workflow(
    prompt: str,
    resolution: str,
    seed: int,
    queue_id: str,
    img_index: int,
    workflow: str = "zimage",
    krea_multiplier: Optional[float] = None,
    enhancer_strength: Optional[float] = None,
) -> dict:
    if workflow in ("krea2", "krea2-turbo"):
        wf = _load_workflow(KREA_WORKFLOW_PATH)
        if NODE_KREA_PROMPT_TEXT in wf:
            wf[NODE_KREA_PROMPT_TEXT]["inputs"]["text"] = prompt
        w, h = resolution.split("x")
        if NODE_KREA_RESOLUTION in wf:
            wf[NODE_KREA_RESOLUTION]["inputs"]["width"] = int(w)
            wf[NODE_KREA_RESOLUTION]["inputs"]["height"] = int(h)
        if NODE_KREA_KSAMPLER in wf:
            wf[NODE_KREA_KSAMPLER]["inputs"]["seed"] = seed
        # Apply krea-specific overrides (node 10: ConditioningKrea2Rebalance, node 11: Enhancer)
        for nid, node in wf.items():
            if not isinstance(node, dict):
                continue
            ct = node.get("class_type", "")
            if ct == "ConditioningKrea2Rebalance" and krea_multiplier is not None:
                node["inputs"]["multiplier"] = krea_multiplier
            elif ct == "ComfyUI-Krea2T-Enhancer" and enhancer_strength is not None:
                node["inputs"]["strength"] = enhancer_strength

        # Identify key nodes by class_type for potential bypass rewiring
        ksampler_id = None
        clip_encode_id = None
        unet_loader_id = None
        for nid, node in wf.items():
            if not isinstance(node, dict):
                continue
            ct = node.get("class_type", "")
            if ct == "KSampler":
                ksampler_id = nid
            elif ct == "CLIPTextEncode":
                clip_encode_id = nid
            elif ct == "UnetLoaderGGUF":
                unet_loader_id = nid

        # Bypass nodes when their control value is zero (skip rewiring only)
        if krea_multiplier is not None and krea_multiplier == 0:
            # Bypass ConditioningKrea2Rebalance: wire CLIPTextEncode directly to KSampler
            if ksampler_id and clip_encode_id:
                wf[ksampler_id]["inputs"]["positive"] = [clip_encode_id, 0]
        if enhancer_strength is not None and enhancer_strength == 0:
            # Bypass ComfyUI-Krea2T-Enhancer: wire UnetLoaderGGUF directly to KSampler
            if ksampler_id and unet_loader_id:
                wf[ksampler_id]["inputs"]["model"] = [unet_loader_id, 0]

        for node in wf.values():
            if isinstance(node, dict) and node.get("class_type") == "SaveImage":
                node["inputs"]["filename_prefix"] = (
                    f"krea2-{queue_id}-{img_index}"
                )
        return wf

    wf = _load_workflow(WORKFLOW_PATH)
    if NODE_PROMPT_TEXT in wf:
        wf[NODE_PROMPT_TEXT]["inputs"]["text"] = prompt
    w, h = resolution.split("x")
    if NODE_RESOLUTION in wf:
        wf[NODE_RESOLUTION]["inputs"]["width"] = int(w)
        wf[NODE_RESOLUTION]["inputs"]["height"] = int(h)
    if NODE_KSAMPLER in wf:
        wf[NODE_KSAMPLER]["inputs"]["seed"] = seed
    for node in wf.values():
        if isinstance(node, dict) and node.get("class_type") == "SaveImage":
            node["inputs"]["filename_prefix"] = f"z-image-{queue_id}-{img_index}"
    return wf


