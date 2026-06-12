# Mobile-First App Spec — llm-mobile

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
- **Smart loading**: Auto-unloads current model before loading new one, shows progress bar with percentage

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

## 6. Generator Tab (`#/generate`)

### Single Mode (default — mobile first)
```
┌─────────────────────────────┐
│ Z-Image-Turbo               │
│ High-Speed Image Generation │
├─────────────────────────────┤
│ Resolution                  │
│ [ 1920×1088 ▼ ]           │
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
│ Sampling step 3/4           │
└─────────────────────────────┘
```

### Batch Mode (accessible via toggle)
- Same layout but textarea expands for multiple prompts
- "Save Prompt List" button writes to PROMPTS file

### Results Display
- After generation: show image in a full-width card with swipe gesture for next/previous
- Tap and hold on image → action sheet (save, delete, share)
- Swipe left/right to navigate between generated images

## 7. Gallery Tab (`#/gallery`)

### Compact Grid View
- 2-column grid by default (4 on tablets)
- Each cell: thumbnail + filename snippet (truncated)
- Long press enters selection mode — tap multiple items, then bulk actions appear

### Folder Navigation
- Breadcrumbs at top: `root > comfyui-output`
- Tap folder to navigate in; back arrow to go up
- New folder button opens a native-style sheet with input

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
| Operation queue | In-memory dict with localStorage sync on mobile clients |
| Push notifications | `web-push` Python library + FCM server key |

## 14. Phased Implementation Plan

### Phase 1 — Core Server Management (~2 weeks)
- [ ] PWA scaffolding (service worker, manifest, install prompts)
- [ ] Tab bar navigation with hash routing
- [ ] Server control tab: container status, model switcher, system stats via SSE
- [ ] Chat interface (reuse existing WebSocket code)

### Phase 2 — Image Generation (~1.5 weeks)
- [ ] Generator tab with single/batch mode UI
- [ ] SSE generation progress stream (bridge ComfyUI WS → SSE)
- [ ] Gallery tab: compact grid, folder navigation, bulk selection

### Phase 3 — Notifications & Resilience (~1 week)
- [ ] Operation queue system (offline persistence + auto-retry)
- [ ] Notification API integration
- [ ] Push notification setup with FCM
- [ ] Event replay on reconnect (Server-Sent Events with Last-Event-ID)

### Phase 4 — Polish & Deep Features (~1 week)
- [ ] Model downloader UI
- [ ] Benchmarks tab
- [ ] Settings panel
- [ ] Touch gesture optimization (swipe actions, long press menus)
- [ ] Performance tuning: lazy loading of JS modules, code splitting
