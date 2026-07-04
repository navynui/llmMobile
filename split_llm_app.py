import os

with open("src/llm-app.js", "r") as f:
    content = f.read()

os.makedirs("src/llm-app", exist_ok=True)

# 1. _styles.js
styles_code = "import { css } from 'lit';\n\nexport const appStyles = " + content[content.find("css`"):content.find("`;", content.find("css`")) + 2] + "\n"
with open("src/llm-app/_styles.js", "w") as f:
    f.write(styles_code)

# 2. _router.js
router_code = """
export function handleRoute(ctx) {
  const hash = window.location.hash || '#/server';
  ctx.currentRoute = hash;
}
"""
with open("src/llm-app/_router.js", "w") as f:
    f.write(router_code)

# 3. _sse.js
sse_code = """
export function startSSEStream(ctx) {
  if (ctx.evtSource) ctx.stopSSEStream();

  const lastEventId = localStorage.getItem('last_event_id') || '0';
  ctx.evtSource = new EventSource(`/events/status?since=${lastEventId}`);
  
  ctx.evtSource.onopen = () => {
    ctx.sseConnected = true;
  };

  ctx.evtSource.onerror = () => {
    ctx.sseConnected = false;
  };

  ctx.evtSource.addEventListener('stats', (e) => {
    try {
      const payload = JSON.parse(e.data);
      ctx.sseData = payload;
      
      if (e.lastEventId) {
        localStorage.setItem('last_event_id', e.lastEventId);
      }
    } catch (err) {
      console.error("Failed to parse SSE payload", err);
    }
  });

  ctx.evtSource.addEventListener('notification', (e) => {
    try {
      const payload = JSON.parse(e.data);
      if (payload.message) {
        ctx.showToast(payload.message);
      }
    } catch (err) {
      console.error("Failed to parse notification payload", err);
    }
  });
}

export function stopSSEStream(ctx) {
  if (ctx.evtSource) {
    ctx.evtSource.close();
    ctx.evtSource = null;
    ctx.sseConnected = false;
  }
}

export function startQueueStream(ctx) {
  if (ctx.queueSse) ctx.stopQueueStream();

  ctx.queueSse = new EventSource('/events/queue');
  
  ctx.queueSse.addEventListener('queue', (e) => {
    try {
      const payload = JSON.parse(e.data);
      const newQueue = payload.queue || [];
      ctx.checkQueueCompletions(ctx.queue, newQueue);
      ctx.queue = newQueue;
    } catch (err) {
      console.error("Failed to parse queue SSE payload", err);
    }
  });

  ctx.queueSse.onerror = () => {
    if (ctx.queueSse) {
      ctx.queueSse.close();
      ctx.queueSse = null;
    }
    setTimeout(() => ctx.startQueueStream(), 5000);
  };
}

export function stopQueueStream(ctx) {
  if (ctx.queueSse) {
    ctx.queueSse.close();
    ctx.queueSse = null;
  }
}

export function stopAllStreams(ctx) {
  ctx.stopSSEStream();
  ctx.stopQueueStream();
}
"""
with open("src/llm-app/_sse.js", "w") as f:
    f.write(sse_code)

# 4. _templates.js
templates_code = """import { html } from 'lit';

export function renderMenuLink(ctx, route, icon, label) {
  const isActive = ctx.currentRoute === route;
  return html`
    <a href="${route}" class="menu-item ${isActive ? 'active' : ''}">
      <span class="logo-icon">${icon}</span>
      <span>${label}</span>
    </a>
  `;
}

export function renderTabLink(ctx, route, icon, label) {
  const isActive = ctx.currentRoute === route;
  return html`
    <a href="${route}" class="tab-item ${isActive ? 'active' : ''}">
      <span class="tab-icon">${icon}</span>
      <span>${label}</span>
    </a>
  `;
}

export function renderActiveTabContent(ctx) {
  const stats = ctx.sseData?.stats;
  const status = ctx.sseData?.status;

  switch (ctx.currentRoute) {
    case '#/server':
      return html`<server-tab .stats="${stats}" .status="${status}"></server-tab>`;
    case '#/chat':
      return html`<chat-tab></chat-tab>`;
    case '#/generate':
      return html`<generator-tab .queue="${ctx.queue}"></generator-tab>`;
    case '#/gallery':
      return html`<gallery-tab></gallery-tab>`;
    case '#/benchmarks':
      return html`<benchmark-tab></benchmark-tab>`;
    default:
      return html`<server-tab .stats="${stats}" .status="${status}"></server-tab>`;
  }
}

export function renderApp(ctx) {
  return html`
    ${ctx.updateAvailable ? html`
      <div class="update-banner">
        <span>New update available! Reload to apply.</span>
        <button class="reload-btn" @click="${() => ctx.triggerUpdateReload()}">Reload</button>
      </div>
    ` : ''}

    <div class="app-layout">
      <!-- Sidebar Navigation (Desktop/Tablet) -->
      <aside class="sidebar">
        <div class="sidebar-header">
          <span class="logo-icon">⚡</span>
          <span class="sidebar-title">LLM Mobile</span>
        </div>

        <nav class="sidebar-menu">
          ${renderMenuLink(ctx, '#/server', '⚡', 'Server')}
          ${renderMenuLink(ctx, '#/chat', '💬', 'Chat')}
          ${renderMenuLink(ctx, '#/generate', '🎨', 'Generator')}
          ${renderMenuLink(ctx, '#/gallery', '🖼️', 'Gallery')}
          ${renderMenuLink(ctx, '#/benchmarks', '📊', 'Benchmarks')}
        </nav>

        <div class="connection-badge">
          <div class="dot-indicator ${ctx.sseConnected ? 'dot-connected' : 'dot-disconnected'}"></div>
          <span>${ctx.sseConnected ? 'Connected (Live)' : 'Disconnected'}</span>
        </div>
      </aside>

      <!-- Main Workspace -->
      <main class="main-content ${ctx.currentRoute === '#/chat' ? 'chat-route' : ''}">
        ${renderActiveTabContent(ctx)}
      </main>

      <!-- Bottom Tab Bar (Mobile) -->
      <nav class="tab-bar">
        ${renderTabLink(ctx, '#/server', '⚡', 'Server')}
        ${renderTabLink(ctx, '#/chat', '💬', 'Chat')}
        ${renderTabLink(ctx, '#/generate', '🎨', 'Generator')}
        ${renderTabLink(ctx, '#/gallery', '🖼️', 'Gallery')}
        ${renderTabLink(ctx, '#/benchmarks', '📊', 'Benchmarks')}
      </nav>
    </div>

    <!-- Toast Container -->
    ${ctx.toastMessage ? html`
      <div class="toast-container">
        <div class="toast">
          <span>ℹ️ ${ctx.toastMessage}</span>
        </div>
      </div>
    ` : ''}
  `;
}
"""
with open("src/llm-app/_templates.js", "w") as f:
    f.write(templates_code)

# 5. llm-app.js (main)
main_code = """import { LitElement, html } from 'lit';
import './components/server-tab.js';
import './components/chat-tab.js';
import './components/generator-tab.js';
import './components/gallery-tab.js';
import './components/benchmark-tab.js';
import { appStyles } from './llm-app/_styles.js';
import * as router from './llm-app/_router.js';
import * as sse from './llm-app/_sse.js';
import { renderApp } from './llm-app/_templates.js';

export class LlmApp extends LitElement {
  static properties = {
    currentRoute: { type: String },
    sseData: { type: Object },
    sseConnected: { type: Boolean },
    updateAvailable: { type: Boolean },
    queue: { type: Array },
    toastMessage: { type: String }
  };

  static styles = appStyles;

  constructor() {
    super();
    this.currentRoute = '#/server';
    this.sseData = null;
    this.sseConnected = false;
    this.updateAvailable = false;
    this.evtSource = null;
    this.queue = [];
    this.toastMessage = '';
    this.queueSse = null;
    this.toastTimeout = null;
    this.handleRouteBound = () => this.handleRoute();
    this.handleVisibilityChangeBound = () => this.handleVisibilityChange();
    this.stopAllStreamsBound = () => this.stopAllStreams();
  }

  connectedCallback() {
    super.connectedCallback();
    
    // 1. Initialize hash router
    window.addEventListener('hashchange', this.handleRouteBound);
    this.handleRoute();

    // 2. Start SSE Streams
    this.startSSEStream();
    this.startQueueStream();

    // 3. Register visibility listeners to manage battery and socket lifecycle
    document.addEventListener('visibilitychange', this.handleVisibilityChangeBound);
    window.addEventListener('pagehide', this.stopAllStreamsBound);

    // 4. Register PWA Service Worker & detect updates
    this.registerServiceWorker();

    // 5. Request notifications permission
    this.initNotifications();

    // 6. Listen to offline operation queue events
    window.addEventListener('op-queue-notification', (e) => {
      this.showToast(e.detail.message);
    });
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener('hashchange', this.handleRouteBound);
    document.removeEventListener('visibilitychange', this.handleVisibilityChangeBound);
    window.removeEventListener('pagehide', this.stopAllStreamsBound);
    this.stopAllStreams();
  }

  handleRoute() { router.handleRoute(this); }
  startSSEStream() { sse.startSSEStream(this); }
  stopSSEStream() { sse.stopSSEStream(this); }
  startQueueStream() { sse.startQueueStream(this); }
  stopQueueStream() { sse.stopQueueStream(this); }
  stopAllStreams() { sse.stopAllStreams(this); }

  checkQueueCompletions(oldQueue, newQueue) {
    if (!oldQueue || oldQueue.length === 0) return;
    for (const newItem of newQueue) {
      const oldItem = oldQueue.find(o => o.id === newItem.id);
      if (oldItem && oldItem.status === 'running' && (newItem.status === 'completed' || newItem.status === 'error')) {
        this.showLocalNotification(newItem);
      }
    }
  }

  showLocalNotification(item) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    
    const isSuccess = item.status === 'completed';
    const title = isSuccess ? '🎨 Image Generation Complete' : '⚠️ Image Generation Failed';
    const body = isSuccess 
      ? `Generated ${item.image_ids?.length || 0} images successfully.`
      : `Error: ${item.error || 'Unknown error'}`;

    new Notification(title, {
      body: `${body}\\nPrompt: ${item.prompt.substring(0, 60)}...`,
      icon: '/favicon.svg',
      badge: '/favicon.svg',
      tag: 'task-generation',
      data: { url: '/#/generate' }
    });
  }

  async initNotifications() {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'default') {
      await Notification.requestPermission();
    }
    if (Notification.permission === 'granted') {
      this.subscribePush();
    }
  }

  async subscribePush() {
    if (!('serviceWorker' in navigator)) return;
    try {
      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (sub) {
        await this.sendSubscriptionToBackend(sub);
        return;
      }

      const res = await fetch('/api/notifications/vapid-key');
      const data = await res.json();
      if (!data.public_key || data.public_key === 'BEl6mABClg1401306C9V8t-mC9c-L6121401306C9V8t-mC9c-L6121401306C') {
        return; // Dev-fallback or public key missing
      }

      const convertedKey = this.urlBase64ToUint8Array(data.public_key);
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: convertedKey
      });

      await this.sendSubscriptionToBackend(sub);
    } catch (err) {
      console.warn('Push subscription failed:', err);
    }
  }

  async sendSubscriptionToBackend(sub) {
    try {
      await fetch('/api/notifications/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sub)
      });
    } catch (err) {
      console.error('Failed to send push subscription to backend', err);
    }
  }

  urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
      .replace(/\\-/g, '+')
      .replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  }

  showToast(msg) {
    this.toastMessage = msg;
    if (this.toastTimeout) clearTimeout(this.toastTimeout);
    this.toastTimeout = setTimeout(() => {
      this.toastMessage = '';
      this.requestUpdate();
    }, 4000);
    this.requestUpdate();
  }

  handleVisibilityChange() {
    if (document.visibilityState === 'visible') {
      this.startSSEStream(); // Re-establish and replay
      this.startQueueStream();
    } else {
      this.stopAllStreams(); // Hibernate to save battery and socket descriptors
    }
  }

  registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').then((reg) => {
        // Track updates
        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing;
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              this.updateAvailable = true;
            }
          });
        });
      }).catch((err) => {
        console.warn('Service worker registration failed: ', err);
      });
    }
  }

  triggerUpdateReload() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistration().then((reg) => {
        if (reg && reg.waiting) {
          reg.waiting.postMessage({ type: 'SKIP_WAITING' });
          window.location.reload();
        } else {
          window.location.reload();
        }
      });
    } else {
      window.location.reload();
    }
  }

  render() {
    return renderApp(this);
  }
}

customElements.define('llm-app', LlmApp);
"""
with open("src/llm-app.js", "w") as f:
    f.write(main_code)
