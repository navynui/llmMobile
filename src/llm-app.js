import { LitElement, html } from 'lit';
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

  async hardRefresh() {
    this.showToast('🧹 Clearing cache and reloading app...');

    // 1. Unregister all service workers
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      for (const reg of registrations) {
        await reg.unregister();
      }
    }

    // 2. Clear all caches
    if ('caches' in window) {
      const keys = await caches.keys();
      for (const key of keys) {
        await caches.delete(key);
      }
    }

    // 3. Force reload from server (no cache)
    window.location.reload();
  }

  render() {
    return renderApp(this);
  }
}

customElements.define('llm-app', LlmApp);
