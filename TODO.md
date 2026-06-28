# TODO.md — llmMobile Feature Backlog

> **Dev Workflow (apply to every checklist below)**
> 1. Implement the change.
> 2. Run `npm run build` (front-end) / run relevant backend tests.
> 3. Confirm build + tests pass.
> 4. Commit with a clear message, then push.
> 5. Mark the checklist item `[x]` only after the push is confirmed.

---

## Standard Checklist For Each Item

- [ ] Backend / service changes implemented
- [ ] Front-end changes implemented (if applicable)
- [ ] `npm run build` passes (front-end changes only)
- [ ] Backend tests pass
- [ ] Manual smoke test completed (end-to-end flow works)
- [ ] Code committed (`git commit`)
- [ ] Code pushed (`git push`)
- [ ] Checklist item verified complete

---

## 1. Server Tab — HF Download Controls

**Priority:** Medium | **Status:** Not Started | **Complexity:** Medium

### Requirements

In the **server tab → HuggingFace download section**, add front-end controls to manage the active download queue:

| Control | Behavior |
|---|---|
| **Stop** | Pause an in-progress download without removing it from the queue |
| **Resume** | Continue a paused (or previously failed) download from where it left off |
| **Cancel** | Remove a download from the queue entirely and delete the partial file |
| **Clear Finished** | Remove all completed downloads from the UI queue in one action |

### Safety Concerns & Edge Cases

- **Partial file cleanup:** When canceling, the `.part` / incomplete file must be deleted on both the host (`/home/nui/llmaCPP/models/`) and inside the Docker container (`/models/`) to prevent disk bloat and false "already downloaded" detections on the next scan.
- **Race condition on Stop/Resume:** A download may be actively writing to disk when the user hits Stop. The stop signal must reach `download_svc.py` before the next chunk write, or the chunk completes and the queue state becomes inconsistent. Use a `threading.Event` or `asyncio.CancelledError` guard checked before each chunk write.
- **State drift:** The front-end queue must re-sync with the backend on tab-focus or SSE reconnect; a manual "Refresh" button should also be provided as a fallback.
- **Double-cancel protection:** Hitting Cancel twice must not trigger a `FileNotFoundError` on the cleanup path.
- **Rate-limit handling:** If the HF API returns 429, the existing retry logic should remain intact; manual Stop/Cancel should still abort the wait-and-retry loop.
- **Disk-full scenario:** If the host volume is full, the download worker may crash silently. Surface a clear error toast and mark the item as `"error": "disk_full"` so the user sees it in the queue.

### Item Checklist

- [x] Backend: `stop_download`, `resume_download`, `cancel_download` endpoints implemented in `services/download_svc.py`
- [x] Backend: Partial file cleanup verified on both host + container paths
- [x] Front-end: Stop / Resume / Cancel / Clear Finished controls added to download UI
- [x] Front-end: `npm run build` passes
- [x] Smoke test: Cancel + re-add same file does not create duplicates
- [x] Backend tests pass
- [x] Committed and pushed

---

## 1a. Server Tab — Persistent Download Queue Visibility

**Priority:** Medium | **Status:** Completed | **Complexity:** Low-Medium

### Requirements

The active download queue must remain visible and up-to-date when the user switches away from and back to the server tab.

| Requirement | Behavior |
|---|---|
| **Persistent state** | The queue UI must not reset to empty on tab switch; it must retain the last known queue snapshot until refreshed. |
| **Auto-refresh on focus** | When the server tab gains focus, issue a lightweight re-sync (poll SSE or an endpoint) so any changes made while the tab was hidden are reflected immediately. |
| **SSE-driven updates** | Prefer subscribing to the existing download SSE stream on tab mount so progress updates continue in the background, independent of active tab visibility. |
| **Manual refresh fallback** | Provide a small refresh control in the download section so users can force a re-sync without adding a new download. |
| **Empty-state clarity** | If the queue is legitimately empty (no active, paused, or completed items), show a clear empty-state message rather than a blank panel, so the user knows the state is accurate. |

### Safety Concerns & Edge Cases

- **Drift vs. reset:** The UI must distinguish between "truly empty queue" and "stale snapshot awaiting refresh"; never silently drop items on tab switch.
- **Background SSE cleanup:** Ensure SSE subscriptions for the download stream are torn down when leaving the server tab to avoid leaking connections on repeated navigation.
- **Long-lived tab behavior:** If the server tab is left open but inactive for a long time, the UI should still recover gracefully on the next focus without requiring a full page reload.
- **Concurrent edits:** If the user has the server tab open in two browser contexts, both should converge to the same queue state on their respective refreshes without conflicting writes from the front end.

### Item Checklist

- [x] Front-end: Queue state preserved across tab switch (verified not resetting to empty)
- [x] Front-end: Auto-refresh on tab focus implemented
- [x] Front-end: Background SSE subscription lifecycle managed (subscribe on mount, unsubscribe on leave)
- [x] Front-end: Manual refresh button added
- [x] Front-end: Empty-state message shown when queue is truly empty
- [x] Front-end: `npm run build` passes
- [x] Smoke test: Switch tabs, add download in background, switch back — queue updates correctly
- [x] Committed and pushed

---

## 2. Generator Tab — VRAM-Aware Model Swapping

**Priority:** High | **Status:** Completed | **Complexity:** High

### Requirements

When the user presses **Generate** in the generator tab:

1. **Idle-check llama.cpp server** — poll `/api/health` or an existing idle-status endpoint to confirm the server is not currently processing a chat request.
2. **Unload the currently loaded model** — send the unload / `/unload` command (or equivalent) to the llama.cpp server to free VRAM before starting the ComfyUI image-generation workflow.
3. **Run the ComfyUI workflow** — launch the generation request against `http://localhost:8188`.
4. **After all queued generations finish** — automatically reload the previously unloaded model into llama.cpp so the chat experience is not disrupted.

### Safety Concerns & Edge Cases

- **VRAM leakage on unload failure:** If the unload call returns an error, the system must **not** proceed to ComfyUI. Show an explicit error toast ("Cannot free VRAM — generation aborted") and halt. Starting ComfyUI with the model still loaded risks OOM on the GPU.
- **Server state detection reliability:** The idle check must have a **timeout** (e.g., 30 s). If the server does not respond, treat it as "busy" rather than blocking the UI indefinitely. Provide a "Force Generate (skip VRAM swap)" override for power users who want to attempt generation anyway.
- **Model reload failure recovery:** If the reload after generation fails, the user is left with no model loaded on next chat visit. Implement a:
  - **Hard fallback:** On next chat send, auto-attempt to reload the last known model name.
  - **Soft fallback:** Show a persistent banner in the UI: "Model was not reloaded. [Reload Now]".
- **Queue serialization:** While a generation workflow + model swap is in flight, **block** new generation requests and disable the Generate button to prevent:
  - Two simultaneous ComfyUI workflows fighting for VRAM.
  - A second unload signal racing with the first reload.
- **State persistence across refresh:** Store the `(previous_model_name, previous_model_path)` in `sessionStorage` before unloading so a hard browser refresh mid-workflow does not orphan the reload target.
- **Workflow timeout:** The ComfyUI prompt-submission endpoint must have a client-side timeout (e.g., 120 s). On timeout, treat it as a failure, **still reload the model**, and surface the error.
- **Concurrent chat protection:** Disable the chat input / send button during the model-swap window so a user does not submit a prompt to a server that has no model loaded.
- **Docker network latency:** The unload and reload calls go through the Docker network. Add a short retry (1 retry, 3 s delay) for transient 502/504 responses from llama.cpp during the swap, but do **not** retry ComfyUI calls the same way (they should fail fast and surface the error).
- **Metrics / logging:** Log each swap event (`unloaded_at`, `reloaded_at`, `model_name`, `success`, `error`) to a new `vram_swaps` table or append to existing benchmark logging so operators can audit VRAM savings.

### Item Checklist

- [x] Backend: `swap_vram_for_generation` helper implemented in `services/comfy_svc.py` or `services/model_svc.py`
- [x] Backend: Idle-check with timeout implemented
- [x] Backend: Unload + reload orchestration with retry logic added
- [x] Backend: Client-side timeout for ComfyUI prompt submission added
- [x] Front-end: Generate button disabled during swap; Force Generate override added
- [x] Front-end: Chat input disabled during model-swap window
- [x] Front-end: sessionStorage persistence for `(previous_model_name, previous_model_path)` added
- [x] Front-end: Reload-failure banner implemented
- [x] Front-end: `npm run build` passes
- [x] Smoke test: Full generate → swap → reload flow works; Verify chat is usable after generation
- [x] Smoke test: Unload failure shows toast and halts (no ComfyUI launch)
- [x] Backend tests pass
- [x] Committed and pushed

---

## Implementation Notes

- Backend changes for downloads live in `services/download_svc.py`; expose new `stop_download`, `resume_download`, `cancel_download` endpoints.
- Backend changes for model swapping live in `services/comfy_svc.py` (orchestrate the swap) and `services/model_svc.py` (actual load/unload calls); add a `swap_vram_for_generation(previous_model_info)` context-manager-style helper.
- Front-end changes for downloads live in `src/components/model-downloader.js` (or the download section of `server-tab.js`).
- Front-end changes for generator live in `src/components/generator-tab.js`.
- Run `npm run build` after any front-end edit; run the backend test suite before Docker rebuild.

---

*Generated: 2026-06-27*
