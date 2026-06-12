# Mobile-First App Spec v0.2 — llm-mobile

## 1. Vision & Goals

A **mobile-first** web app that lets you manage your local LLM inference server and ComfyUI image generation from a phone or tablet with equal ease as desktop. Key improvements over the current app:

- **Touch-optimized**: Large tap targets (min 48px), swipe gestures, no hover-dependent UI
- **Progressive disclosure**: No dense dashboards — one task at a time, deep-dive only when needed
- **Background work that actually notifies you**: Better than polling-based status pages
- **Offline-resilient**: Queues operations during disconnects, auto-replays on reconnect
- **Fast startup**: Lazy-load non-critical code, no massive JS bundles

## 2. Architecture Decisions

### Backend (unchanged — FastAPI)
- Keep the existing FastAPI backend as-is or refactor into a clean API-first design
- New WebSocket/SSE endpoints for real-time updates (see §7)
- No breaking changes to existing REST endpoints — mobile app consumes them identically

### Frontend
- **PWA-only** — no browser version. The entire experience is an installable progressive web app.
- **Vanilla JS + Web Components** or **LitElement** for component-based architecture (lighter than React, proper encapsulation)
- **No SPA routing library** — use `hash` navigation (`#/server`, `#/images`) with URL fragment matching
- **CSS custom properties** for theming instead of Tailwind CDN (no runtime CSS parsing)
- **Service Worker** registered at startup — caches all JS/CSS/fonts/images, serves from cache offline

### Why not React/Vue?
The current app is vanilla JS and it works. Adding a framework adds ~150KB minimum. Mobile users on 3G/4G will feel the difference. If we want component lifecycle management, LitElement gives us web standards compliance with zero build step.

## 3. Navigation & Information Architecture

### Tab Bar (Bottom)
Only **5 tabs** — everything else is accessible from within:

| Tab | Icon | Route | Purpose |
|-----|------|-------|---------|
| Server | ⚡ | `#/server` | Container status, model switcher, system stats |
| Chat | 💬 | `#/chat` | AI chat interface (WebSocket-based) |
| Generator | 🎨 | `#/generate` | Image generation with ComfyUI |
| Gallery | 🖼️ | `#/gallery` | Browse and manage images |
| More | ••• | `#/more` | Model downloader, benchmarks, settings, logs |

### Desktop Adaptation (same codebase)
- Bottom tab bar stays at bottom on mobile
- On tablets/desktop (>768px): tabs become a **left sidebar**, main content area expands accordingly
- No separate desktop/mobile apps — one responsive codebase

## 4. Server Tab (`#/server`)

### Compact Dashboard Card (always visible)
```
┌─────────────────────────────┐
│ ⚡ LLM Dashboard            │
├──────────┬──────────────────┤
│ llama-server:  ● Running   │
│ llm-manager:   ● Running   │
├──────────┴──────────────────┤
│ CPU 12°C ████░ GPU 45°C ███│
│ RAM  67% ████████░         │
│ VRAM 82% ██████████░       │
│ Stor 34% ████             │
└─────────────────────────────┘
```

### Model Switcher (expandable)
- Tapping the header or a "Switch Model" button expands to show:
  - Current model badge with unload button
  - Dropdown of available models from disk/API
  - Load Now / Set Default buttons
- **Smart loading**: Auto-unloads current model before loading new one, shows progress bar

### Logs
- Collapsed by default (just a "View Logs" pill)
- Tap expands inline — no separate modal needed
- Shows last ~50 lines from WebSocket stream

## 5. Chat Tab (`#/chat`)

WebSocket-based chat interface:
- Message bubbles (user right-aligned, AI left-aligned)
- Auto-scroll to bottom on new messages
- Typing indicator when LLM is generating
- **Mobile keyboard**: Sticky bottom input with send button, auto-dismisses virtual keyboard when sending
- Conversation persistence via localStorage (last 100 messages cached locally)

## 6. Generator Tab (`#/generate`) — Revised

### Single Mode (default — mobile first)
```
┌─────────────────────────────┐
│ Z-Image-Turbo               │
│ High-Speed Image Generation │
├─────────────────────────────┤
│ Resolution                  │
│ [ 1920×1088 ▼ ]           │
├─────────────────────────────┤
│ Images to generate          │
│ [ 4 ▼ ]                    │  ← new field! (each uses a different seed)
├─────────────────────────────┤
│ Prompt                      │
│ ┌───────────────────────┐  │
│ │ A macro close-up photo...│  │
│ └───────────────────────┘  │
├─────────────────────────────┤
│ [ Generate ]                │
├─────────────────────────────┤
│ Progress                    │
│ █████████░░░ 75%            │
│ Image 2/4 · Step 3/4        │
└─────────────────────────────┘
```

### Queue System (Sequential, replaces Batch Mode)

**Why sequential queue instead of batch?** The current batch system requires editing a file with all prompts before generating. The new queue is more intuitive on mobile:

- Submit one prompt at a time — it enters the queue immediately
- While item 1 generates, user can add items 2 and 3 to the queue without waiting
- Each queue item has its own status badge (Queued / Running / Completed / Error)
- Users can cancel individual items from the queue mid-generation
- Progress is per-item: "Image 2 of 4" for multi-image prompts, "Prompt 3/5" in a sequence

**Queue state model:**
```json
{
  "queue": [
    {
      "id": "q1",
      "prompt": "A sunset over mountains",
      "status": "completed",
      "image_ids": ["z-image-20250614-143022-0a2b", "z-image-20250614-143022-1c3d"],
      "num_images": 2,
      "submitted_at": "...",
      "started_at": "...",
      "completed_at": "..."
    },
    {
      "id": "q2",
      "prompt": "Portrait of a samurai warrior",
      "status": "running",
      "image_num": 2,
      "total_images": 4,
      "progress": 0.75,
      "submitted_at": "...",
      "started_at": "..."
    },
    {
      "id": "q3",
      "prompt": "A cyberpunk cityscape at night",
      "status": "queued",
      "position": 1,
      "num_images": 1,
      "submitted_at": "..."
    }
  ]
}
```

**Queue list UI (shown when items are queued):**
```
┌─────────────────────────────┐
│ Generation Queue            │
├─────────────────────────────┤
│ ● Completed                 │
│   A sunset over mountains   │
│   [2 images]                │
├─────────────────────────────┤
│ ⟳ Running                   │
│   Portrait of samurai       │
│   Image 3/4 · 75%           │
├─────────────────────────────┤
│ ● Queued (1)                │
│   Cyberpunk cityscape       │
│                             │
│ [ + Add Prompt ]            │
└─────────────────────────────┘
```

### Multi-Image Generation Per Prompt

When submitting a prompt, the user specifies **how many variations** they want — each with a different random seed:

```
┌─────────────────────────────┐
│ Resolution                  │
│ [ 1920×1088 ▼ ]           │
├─────────────────────────────┤
│ Images to generate          │
│ [ 4 ▼ ]                    │
│ (Each uses a different seed)│
├─────────────────────────────┤
│ Prompt                      │
│ ┌───────────────────────┐  │
│ │ A macro close-up photo...│  │
│ └───────────────────────┘  │
├─────────────────────────────┤
│ [ Generate ]                │
└─────────────────────────────┘
```

**How it works:**
1. User specifies N = number of images per prompt (default: 4)
2. The backend generates a random seed for each image iteration
3. All N images are generated sequentially within that single queue item's turn
4. Progress shows per-image progress: "Image 2/4" with overall progress bar

**Backend changes:**
- On `/api/comfy/generate`, add `num_images` parameter (default 1)
- Backend loops through generation N times, each with a new random seed
- Each image gets its own filename suffix: `z-image-{ts}-0a2b`, `z-image-{ts}-1c3d`, etc.

**SSE events for multi-image progress:**
```
event: generation_image
data: {"image_num": 3, "total_images": 4, "progress": 0.85}
```

### Results Display (Multi-Image)

After generation completes with multiple images:
```
┌─────────────────────────────┐
│ Image 2 of 4                │
├─────────────────────────────┤
│                             │
│     [ large image ]         │
│                             │
├─────────────────────────────┤
│ ◄ Prev    Next ►           │  ← swipe to view all variations
└─────────────────────────────┘
```

**Benefits:**
1. **Prompt engineering** — generate multiple variations and pick the best one, rather than guessing the right prompt on first try
2. **Batch efficiency** — generating 4 images from one prompt is more VRAM-efficient than submitting 4 separate queue items (same resolution model loaded once)
3. **Seed exploration** — see how different seeds affect the same prompt

### Batch Mode Legacy Support

The old batch mode (`/api/comfy/generate` with `mode="batch"`) remains available for backward compatibility but is hidden behind a "Legacy Batch" toggle in Settings, disabled by default. The new queue system is the primary generation flow.

## 7. Gallery Tab — Revised (`#/gallery`)

### Compact Grid View
- 2-column grid by default (4 on tablets)
- Each cell: thumbnail + filename snippet (truncated)
- Long press enters selection mode — tap multiple items, then bulk actions appear

### Folder Navigation
- Breadcrumbs at top: `root > comfyui-output`
- Tap folder to navigate in; back arrow to go up
- New folder button opens a native-style sheet with input

### Prompt Persistence — Sidecar JSON Files

**The Problem:** When you generate an image, the prompt text is sent as JSON to ComfyUI and never stored alongside the output file. The gallery later shows no way to know what prompt generated a specific image.

**Solution: Save sidecar `.json` files alongside each generated image.**

```
comfyui-output/
├── z-image-20250614-143022-0a2b.png          ← generated image
├── z-image-20250614-143022-0a2b.json         ← prompt metadata sidecar
└── ...
```

**Sidecar JSON content:**
```json
{
  "prompt": "A macro close-up photo of a dewdrop on a flower petal",
  "resolution": [1920, 1088],
  "seed": 42,
  "model": "z-image-turbo",
  "timestamp": "2025-06-14T14:30:22Z",
  "generation_id": "gen_7f3a9b"
}
```

**How it works:**
1. When generation completes (after all N images for that prompt are done), the backend writes a sidecar JSON file next to each image output
2. The gallery API reads these sidecars when listing images — adds `prompt`, `seed`, `model`, and `timestamp` fields to each entry
3. Gallery cells show prompt text below the thumbnail (truncated with "..." for long prompts)

**Gallery cell UI:**
```
┌───────────────────────┐
│ [ z-image-thumb.jpg ] │
│ Prompt: A macro close...│  ← shown below thumbnail
│ ────                     │
│ Seed: 42 · Model: z-turbo│
│ Jun 14, 2025 2:30 PM    │
└───────────────────────┘
```

**Long press → "Copy Prompt"** — copies just the prompt text to clipboard. Tapping it expands for full readability.

### Grouped Results (Multi-Image Prompts)

When a multi-image generation completes, gallery groups the images under one card:
- Shows first image as thumbnail with "4 images" label overlay
- Tapping opens an image carousel/swiper showing all 4 variations side by side
- The prompt/seed/model info is shown once for the whole group (not repeated per image)

```
┌─────────────────────────────┐
│ [ z-image-thumb ] [2]       │ ← swipe between images in this group
│ Prompt: A macro close-up... │
│ ────                          │
│ 4 images · Seed: 42         │
└─────────────────────────────┘

[Swipe carousel view:]
┌────────────┬────────────┐
│ Image 1/4  │  Image 2/4 │    ← horizontal swipe to browse
└────────────┴────────────┘
```

## 8. More Tab (`#/more`) — Secondary Features

Everything that doesn't fit in the main flow:

### Model Downloader
- Search HuggingFace GGUF models (one-line search, no results shown inline)
- Results open in a **sheet** or new view with model details
- Download progress shows as a persistent notification card at top of sheet

### Benchmarks
- Simple table with sortable columns
- Filter by quantization type and platform

### System Logs
- Full WebSocket log stream viewer (same as Server tab but standalone)

### Settings
- LLM server start/stop toggle with confirmation dialog
- Model auto-load on startup toggle
- Log level, polling interval preferences
- Legacy batch mode toggle (shown when enabled for backward compatibility)

## 9. Background Work Update Mechanism — New Design

This is the **biggest architectural improvement**. The current app has several problems:

1. **Polling-based stats** (every 2 seconds) — wasteful on mobile, drains battery
2. **Generation status survives in-memory only** — if you close the tab and come back later, the state is gone
3. **No push notifications for long-running operations** — you must keep the page open and hope to see updates
4. **Download progress not visible outside the active tab**

### Proposed Solution: Server-Sent Events (SSE) + Local Event Queue

#### Step 1: Replace WebSockets with SSE for status updates

```python
@app.get("/events/status")
def stream_status():
    """Stream system stats and container status as SSE events."""
    def event_generator():
        while True:
            yield f"event: stats\nretry: 3000\ndata: {json.dumps(stats)}\n\n"
            await asyncio.sleep(2)
    return StreamingResponse(event_generator(), media_type="text/event-stream")
```

**Why SSE over WebSockets?**
- SSE is simpler (one-directional, HTTP-based)
- Auto-reconnect built-in via `retry:` field
- Works through proxies/firewalls more reliably
- Native browser support for event parsing
- Lower overhead per connection (~50 bytes vs ~1KB+ WebSocket frames)

#### Step 2: Dedicated Event Endpoints for Background Work

```python
@app.get("/events/generation")
def stream_generation_status(prompt_id: str = None):
    """Stream generation progress events. If prompt_id is omitted, streams 
    ALL current generations (useful when you re-open the app and want to see 
    what's running)."""

@app.get("/events/downloads")
def stream_download_status():
    """Stream download progress for all active downloads."""

@app.get("/events/queue")
def stream_queue_status():
    """Stream queue position updates — tells user where they are in the generation queue."""
```

#### Step 3: Client-Side Event Queue with Replay

```javascript
// When connecting, fetch missed events since last known event ID
const lastEventId = localStorage.getItem('last_event_id');
const evtSource = new EventSource('/events/status?since=' + lastEventId);
evtSource.addEventListener('stats', (e) => {
    const data = JSON.parse(e.data);
    // Update UI immediately — no polling needed
});

// When reconnecting after disconnect, the browser auto-replays missed events
// based on Last-Event-ID header. We also manually replay from local storage.
```

#### Step 4: Notification API for Long-Running Operations

When a generation or download completes (or fails), send a **system notification**:

```javascript
function notifyBackgroundCompletion(title, body) {
    if (!('Notification' in window)) return;
    if (Notification.permission !== 'granted') {
        Notification.requestPermission();
    }
    new Notification(title, { body, icon: '/icon-192.png', tag: 'bg-work' });
}
```

**Push notifications when app is not open:**
For this we need a **push notification service**. Options:
- **Firebase Cloud Messaging (FCM)** — free, works on Android and Chrome/Edge
- **Web Push Protocol + VAPID keys** — self-hosted option using `web-push` library

When background work completes while the app is not open (user has closed the tab), send a push notification via FCM with:
- Title: "Image Generation Complete" or "Model Download Finished"
- Body: filename, timestamp, action to view results
- **Tapping the notification opens the specific tab** (`#/generate` for generation complete, `#/more` for download)

#### Step 5: Operation Queue (Offline Resilience)

```javascript
class OperationQueue {
    constructor() {
        this.queue = [];
        this.isProcessing = false;
    }
    
    push(operation) {
        this.queue.push({ ...operation, status: 'pending', timestamp: Date.now() });
        localStorage.setItem('op_queue', JSON.stringify(this.queue));
        
        if (!this.isProcessing) this.processNext();
    }
    
    async processNext() {
        while (this.queue.length > 0 && this.isProcessing === false) {
            const op = this.queue.find(o => o.status === 'pending');
            if (!op || !navigator.onLine) break;
            
            op.status = 'processing';
            localStorage.setItem('op_queue', JSON.stringify(this.queue));
            
            try {
                await apiClient[op.api](...op.args);
                op.status = 'completed';
            } catch (err) {
                op.status = 'error';
                op.error = err.message;
            }
            localStorage.setItem('op_queue', JSON.stringify(this.queue));
            
            this.isProcessing = false;
        }
    }
}
```

**Why this matters for mobile:** Users will often initiate a generation or download while on the go, then close the app. The queue ensures:
1. Operations are persisted to localStorage
2. Auto-retry when network returns
3. Progress is visible in a persistent notification card even if the tab isn't open

## 10. Mobile-Specific UX Patterns

### Gesture Support
- **Swipe left on model list items** → reveal Unload/Delete actions (like iOS Mail)
- **Swipe down on image thumbnails** → refresh gallery
- **Long press on any element** → context menu with relevant actions
- **Two-finger swipe** on chat → clear conversation

### Touch Optimization
- Minimum tap target: 48×48px (WCAG AA compliant)
- No hover-dependent interactions — everything must work without hover
- All buttons have `touch-action: manipulation` to disable double-tap zoom
- Form inputs use appropriate keyboards (`<input type="tel">`, etc.)

### State Persistence
- All UI preferences stored in localStorage: tab position, collapsed panels, theme
- Last used generation settings (resolution, mode) persisted across sessions
- Chat history persists locally for offline viewing

## 11. Performance Targets

| Metric | Current App | Target |
|--------|-------------|--------|
| Initial JS load | ~50KB+ (all modules at once) | <20KB initial, lazy-load rest |
| Memory usage (idle) | High (all modules loaded) | <10MB on mobile |
| Polling frequency | 2 seconds for stats only | Event-driven (0 polling), fallback to 30s if no events received in 60s |
| PWA installability | Partial (manifest but no SW) | Full — installable, works offline |

## 12. Security Considerations

- **No auth** on the current app — same for mobile (this is a local-only service)
- **CSP headers**: Restrict `connect-src` to only known API endpoints
- **XSS protection**: All user input from PROMPTS file and chat must be escaped before rendering
- **Rate limiting**: On `/api/comfy/generate` — max 10 requests per minute from a single IP

## 13. Technical Implementation Stack

### Frontend
| Component | Choice | Rationale |
|-----------|--------|-----------|
| Framework | LitElement (Web Components) | Lightweight, no build step, proper encapsulation |
| Styling | CSS custom properties + scoped styles | No Tailwind dependency at runtime, themable |
| State Management | Custom event bus + localStorage | No Redux/Zustand overhead; local storage is the source of truth |
| Navigation | URL hash with History API | Simple, works offline |
| Service Worker | Workbox (via SW precache) | Auto-cache all assets, handle offline fallback pages |

### Backend Additions
| Feature | Implementation |
|---------|---------------|
| SSE status stream | `StreamingResponse` from FastAPI |
| SSE generation stream | WebSocket → SSE proxy (bridge ComfyUI WS to client SSE) |
| SSE queue stream | Dedicated `/events/queue` for sequential queue progress |
| Sidecar JSON writer | Write `.json` files next to generated images on completion |
| Operation queue | In-memory dict with localStorage sync on mobile clients |
| Push notifications | `web-push` Python library + FCM server key |

## 14. Phased Implementation Plan

### Phase 1 — Core Server Management (~2 weeks)
- [ ] PWA scaffolding (service worker, manifest, install prompts)
- [ ] Tab bar navigation with hash routing
- [ ] Server control tab: container status, model switcher, system stats via SSE
- [ ] Chat interface (reuse existing WebSocket code)

### Phase 2 — Image Generation (~2 weeks) — Revised from ~1.5 weeks
- [ ] Generator tab with multi-image generation UI (images-per-prompt field)
- [ ] Sequential queue system: new `/api/generate/queue` endpoint, SSE queue stream (`/events/queue`)
- [ ] SSE generation progress stream (bridge ComfyUI WS → SSE), including `generation_image` events for multi-image prompts
- [ ] Sidecar JSON writer — persist prompt metadata alongside generated images on completion
- [ ] Gallery tab: compact grid with sidecar prompt display, folder navigation, bulk selection

### Phase 3 — Multi-Image & Prompt Features (~1 week)
- [ ] Image carousel/swiper for multi-image results in gallery (grouped cards)
- [ ] Long press actions in gallery: "Copy Prompt", regenerate single image from a queue item
- [ ] Queue management: cancel individual items, re-run specific prompts

### Phase 4 — Notifications & Resilience (~1 week)
- [ ] Operation queue system (offline persistence + auto-retry)
- [ ] Notification API integration
- [ ] Push notification setup with FCM
- [ ] Event replay on reconnect (Server-Sent Events with Last-Event-ID)

### Phase 5 — Polish & Deep Features (~1 week)
- [ ] Model downloader UI
- [ ] Benchmarks tab
- [ ] Settings panel
- [ ] Touch gesture optimization (swipe actions, long press menus)
- [ ] Performance tuning: lazy loading of JS modules, code splitting
