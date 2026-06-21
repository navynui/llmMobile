import { LitElement, html, css } from 'lit';
import './components/server-tab.js';
import './components/chat-tab.js';
import './components/generator-tab.js';
import './components/gallery-tab.js';
import './components/benchmark-tab.js';


export class LlmApp extends LitElement {
  static properties = {
    currentRoute: { type: String },
    sseData: { type: Object },
    sseConnected: { type: Boolean },
    updateAvailable: { type: Boolean },
    queue: { type: Array },
    toastMessage: { type: String }
  };

  static styles = css`
    :host {
      display: block;
      height: var(--app-dvh);
      min-height: var(--app-dvh);
      max-height: var(--app-dvh);
      overflow: hidden;
      font-family: var(--font-sans);
      background-color: var(--bg-color);
      color: var(--text-primary);
    }

    .app-layout {
      display: flex;
      height: 100%;
      width: 100%;
      position: relative;
    }

    /* Main Content Area */
    .main-content {
      flex: 1;
      height: 100%;
      overflow-y: auto;
      position: relative;
      background: radial-gradient(circle at top right, rgba(99, 102, 241, 0.03), transparent 40%);
    }

    .main-content.chat-route {
      overflow: hidden;
    }

    /* Update Banner */
    .update-banner {
      background: var(--primary);
      color: #fff;
      padding: 10px 16px;
      font-size: 0.85rem;
      font-weight: 500;
      display: flex;
      justify-content: space-between;
      align-items: center;
      box-shadow: var(--shadow-md);
      z-index: 100;
      position: relative;
      animation: bannerSlideDown 0.3s ease-out;
    }

    @keyframes bannerSlideDown {
      from { transform: translateY(-100%); }
      to { transform: translateY(0); }
    }

    .reload-btn {
      background: rgba(255, 255, 255, 0.2);
      border: 1px solid rgba(255, 255, 255, 0.3);
      padding: 4px 10px;
      border-radius: var(--radius-sm);
      color: #fff;
      font-weight: 600;
      font-size: 0.75rem;
      cursor: pointer;
      transition: var(--transition);
    }

    .reload-btn:hover {
      background: rgba(255, 255, 255, 0.3);
    }

    /* Sidebar Navigation (Desktop/Tablet) */
    .sidebar {
      width: 240px;
      height: 100%;
      background: rgba(17, 24, 39, 0.85);
      border-right: 1px solid var(--border-color);
      display: flex;
      flex-direction: column;
      padding: 24px 16px;
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      z-index: 50;
    }

    .sidebar-header {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 32px;
      padding-left: 8px;
    }

    .logo-icon {
      font-size: 1.5rem;
    }

    .sidebar-title {
      font-family: var(--font-title);
      font-size: 1.15rem;
      font-weight: 700;
      background: linear-gradient(135deg, #a5b4fc, #6366f1);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }

    .sidebar-menu {
      display: flex;
      flex-direction: column;
      gap: 8px;
      flex: 1;
    }

    .menu-item {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 16px;
      border-radius: var(--radius-md);
      color: var(--text-secondary);
      text-decoration: none;
      font-weight: 500;
      font-size: 0.95rem;
      transition: var(--transition);
      border: 1px solid transparent;
    }

    .menu-item:hover {
      color: var(--text-primary);
      background: rgba(255, 255, 255, 0.03);
    }

    .menu-item.active {
      color: var(--primary);
      background: var(--primary-glow);
      border-color: rgba(99, 102, 241, 0.15);
      font-weight: 600;
    }

    .connection-badge {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 0.75rem;
      color: var(--text-muted);
      padding: 12px 8px 0;
      border-top: 1px solid rgba(255, 255, 255, 0.05);
    }

    .dot-indicator {
      width: 8px;
      height: 8px;
      border-radius: 50%;
    }

    .dot-connected { background: var(--success); }
    .dot-disconnected { background: var(--danger); }

    /* Bottom Tab Bar (Mobile Only) */
    .tab-bar {
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      height: 60px;
      background: rgba(17, 24, 39, 0.85);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      border-top: 1px solid var(--border-color);
      display: flex;
      justify-content: space-around;
      align-items: center;
      padding-bottom: env(safe-area-inset-bottom);
      z-index: 50;
    }

    .tab-item {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      color: var(--text-secondary);
      text-decoration: none;
      font-size: 0.65rem;
      font-weight: 500;
      gap: 4px;
      flex: 1;
      height: 100%;
      transition: var(--transition);
    }

    .tab-icon {
      font-size: 1.25rem;
      transition: var(--transition);
    }

    .tab-item.active {
      color: var(--primary);
    }

    .tab-item.active .tab-icon {
      transform: translateY(-2px);
    }

    /* Responsive Utilities */
    @media (max-width: 768px) {
      .sidebar {
        display: none;
      }
      .main-content {
        height: calc(100% - 60px); /* Leave room for bottom navigation */
      }
    }

    @media (min-width: 769px) {
      .tab-bar {
        display: none;
      }
    }

    /* Toast Notification */
    .toast-container {
      position: fixed;
      bottom: 80px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 10000;
      display: flex;
      flex-direction: column;
      gap: 8px;
      pointer-events: none;
      width: 90%;
      max-width: 380px;
    }
    
    .toast {
      background: rgba(17, 24, 39, 0.9);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      border: 1px solid var(--border-color);
      color: var(--text-primary);
      padding: 12px 16px;
      border-radius: var(--radius-md);
      font-size: 0.85rem;
      font-weight: 500;
      box-shadow: var(--shadow-lg);
      display: flex;
      align-items: center;
      justify-content: space-between;
      animation: toastSlideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1);
      pointer-events: auto;
    }
    
    @keyframes toastSlideUp {
      from { transform: translateY(20px); opacity: 0; }
      to { transform: translateY(0); opacity: 1; }
    }
  `;

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
  }

  connectedCallback() {
    super.connectedCallback();
    
    // 1. Initialize hash router
    window.addEventListener('hashchange', this.handleRoute.bind(this));
    this.handleRoute();

    // 2. Start SSE Streams
    this.startSSEStream();
    this.startQueueStream();

    // 3. Register visibility listeners to manage battery and socket lifecycle
    document.addEventListener('visibilitychange', this.handleVisibilityChange.bind(this));
    window.addEventListener('pagehide', this.stopAllStreams.bind(this));

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
    window.removeEventListener('hashchange', this.handleRoute.bind(this));
    document.removeEventListener('visibilitychange', this.handleVisibilityChange.bind(this));
    this.stopAllStreams();
  }

  handleRoute() {
    const hash = window.location.hash || '#/server';
    this.currentRoute = hash;
  }

  startSSEStream() {
    if (this.evtSource) this.stopSSEStream();

    const lastEventId = localStorage.getItem('last_event_id') || '0';
    this.evtSource = new EventSource(`/events/status?since=${lastEventId}`);
    
    this.evtSource.onopen = () => {
      this.sseConnected = true;
    };

    this.evtSource.onerror = () => {
      this.sseConnected = false;
    };

    this.evtSource.addEventListener('stats', (e) => {
      try {
        const payload = JSON.parse(e.data);
        this.sseData = payload;
        
        // Save Last-Event-ID for reconnect replay resilience
        if (e.lastEventId) {
          localStorage.setItem('last_event_id', e.lastEventId);
        }
      } catch (err) {
        console.error("Failed to parse SSE payload", err);
      }
    });

    this.evtSource.addEventListener('notification', (e) => {
      try {
        const payload = JSON.parse(e.data);
        if (payload.message) {
          this.showToast(payload.message);
        }
      } catch (err) {
        console.error("Failed to parse notification payload", err);
      }
    });
  }

  stopSSEStream() {
    if (this.evtSource) {
      this.evtSource.close();
      this.evtSource = null;
      this.sseConnected = false;
    }
  }

  startQueueStream() {
    if (this.queueSse) this.stopQueueStream();

    this.queueSse = new EventSource('/events/queue');
    
    this.queueSse.addEventListener('queue', (e) => {
      try {
        const payload = JSON.parse(e.data);
        const newQueue = payload.queue || [];
        this.checkQueueCompletions(this.queue, newQueue);
        this.queue = newQueue;
      } catch (err) {
        console.error("Failed to parse queue SSE payload", err);
      }
    });

    this.queueSse.onerror = () => {
      if (this.queueSse) {
        this.queueSse.close();
        this.queueSse = null;
      }
      setTimeout(() => this.startQueueStream(), 5000);
    };
  }

  stopQueueStream() {
    if (this.queueSse) {
      this.queueSse.close();
      this.queueSse = null;
    }
  }

  stopAllStreams() {
    this.stopSSEStream();
    this.stopQueueStream();
  }

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
      body: `${body}\nPrompt: ${item.prompt.substring(0, 60)}...`,
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
      .replace(/\-/g, '+')
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

  renderMenuLink(route, icon, label) {
    const isActive = this.currentRoute === route;
    return html`
      <a href="${route}" class="menu-item ${isActive ? 'active' : ''}">
        <span class="logo-icon">${icon}</span>
        <span>${label}</span>
      </a>
    `;
  }

  renderTabLink(route, icon, label) {
    const isActive = this.currentRoute === route;
    return html`
      <a href="${route}" class="tab-item ${isActive ? 'active' : ''}">
        <span class="tab-icon">${icon}</span>
        <span>${label}</span>
      </a>
    `;
  }

  renderActiveTabContent() {
    const stats = this.sseData?.stats;
    const status = this.sseData?.status;

    switch (this.currentRoute) {
      case '#/server':
        return html`<server-tab .stats="${stats}" .status="${status}"></server-tab>`;
      case '#/chat':
        return html`<chat-tab></chat-tab>`;
      case '#/generate':
        return html`<generator-tab .queue="${this.queue}"></generator-tab>`;
      case '#/gallery':
        return html`<gallery-tab></gallery-tab>`;
      case '#/benchmarks':
        return html`<benchmark-tab></benchmark-tab>`;
      default:
        return html`<server-tab .stats="${stats}" .status="${status}"></server-tab>`;
    }
  }

  render() {
    return html`
      ${this.updateAvailable ? html`
        <div class="update-banner">
          <span>New update available! Reload to apply.</span>
          <button class="reload-btn" @click="${this.triggerUpdateReload}">Reload</button>
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
            ${this.renderMenuLink('#/server', '⚡', 'Server')}
            ${this.renderMenuLink('#/chat', '💬', 'Chat')}
            ${this.renderMenuLink('#/generate', '🎨', 'Generator')}
            ${this.renderMenuLink('#/gallery', '🖼️', 'Gallery')}
            ${this.renderMenuLink('#/benchmarks', '📊', 'Benchmarks')}
          </nav>

          <div class="connection-badge">
            <div class="dot-indicator ${this.sseConnected ? 'dot-connected' : 'dot-disconnected'}"></div>
            <span>${this.sseConnected ? 'Connected (Live)' : 'Disconnected'}</span>
          </div>
        </aside>

        <!-- Main Workspace -->
        <main class="main-content ${this.currentRoute === '#/chat' ? 'chat-route' : ''}">
          ${this.renderActiveTabContent()}
        </main>

        <!-- Bottom Tab Bar (Mobile) -->
        <nav class="tab-bar">
          ${this.renderTabLink('#/server', '⚡', 'Server')}
          ${this.renderTabLink('#/chat', '💬', 'Chat')}
          ${this.renderTabLink('#/generate', '🎨', 'Generator')}
          ${this.renderTabLink('#/gallery', '🖼️', 'Gallery')}
          ${this.renderTabLink('#/benchmarks', '📊', 'Benchmarks')}
        </nav>
      </div>

      <!-- Toast Container -->
      ${this.toastMessage ? html`
        <div class="toast-container">
          <div class="toast">
            <span>ℹ️ ${this.toastMessage}</span>
          </div>
        </div>
      ` : ''}
    `;
  }
}

customElements.define('llm-app', LlmApp);
