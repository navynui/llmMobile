import { LitElement, html, css } from 'lit';
import './components/server-tab.js';
import './components/chat-tab.js';
import './components/generator-tab.js';
import './components/gallery-tab.js';
import './components/stub-tabs.js';


export class LlmApp extends LitElement {
  static properties = {
    currentRoute: { type: String },
    sseData: { type: Object },
    sseConnected: { type: Boolean },
    updateAvailable: { type: Boolean }
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
  `;

  constructor() {
    super();
    this.currentRoute = '#/server';
    this.sseData = null;
    this.sseConnected = false;
    this.updateAvailable = false;
    this.evtSource = null;
  }

  connectedCallback() {
    super.connectedCallback();
    
    // 1. Initialize hash router
    window.addEventListener('hashchange', this.handleRoute.bind(this));
    this.handleRoute();

    // 2. Start SSE Stream
    this.startSSEStream();

    // 3. Register visibility listeners to manage battery and socket lifecycle
    document.addEventListener('visibilitychange', this.handleVisibilityChange.bind(this));
    window.addEventListener('pagehide', this.stopSSEStream.bind(this));

    // 4. Register PWA Service Worker & detect updates
    this.registerServiceWorker();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener('hashchange', this.handleRoute.bind(this));
    document.removeEventListener('visibilitychange', this.handleVisibilityChange.bind(this));
    this.stopSSEStream();
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
  }

  stopSSEStream() {
    if (this.evtSource) {
      this.evtSource.close();
      this.evtSource = null;
      this.sseConnected = false;
    }
  }

  handleVisibilityChange() {
    if (document.visibilityState === 'visible') {
      this.startSSEStream(); // Re-establish and replay
    } else {
      this.stopSSEStream(); // Hibernate to save battery and socket descriptors
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
        return html`<generator-tab></generator-tab>`;
      case '#/gallery':
        return html`<gallery-tab></gallery-tab>`;
      case '#/more':
        return html`<more-tab></more-tab>`;
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
            ${this.renderMenuLink('#/more', '•••', 'More')}
          </nav>

          <div class="connection-badge">
            <div class="dot-indicator ${this.sseConnected ? 'dot-connected' : 'dot-disconnected'}"></div>
            <span>${this.sseConnected ? 'Connected (Live)' : 'Disconnected'}</span>
          </div>
        </aside>

        <!-- Main Workspace -->
        <main class="main-content">
          ${this.renderActiveTabContent()}
        </main>

        <!-- Bottom Tab Bar (Mobile) -->
        <nav class="tab-bar">
          ${this.renderTabLink('#/server', '⚡', 'Server')}
          ${this.renderTabLink('#/chat', '💬', 'Chat')}
          ${this.renderTabLink('#/generate', '🎨', 'Generator')}
          ${this.renderTabLink('#/gallery', '🖼️', 'Gallery')}
          ${this.renderTabLink('#/more', '•••', 'More')}
        </nav>
      </div>
    `;
  }
}

customElements.define('llm-app', LlmApp);
