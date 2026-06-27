import { LitElement, html, css } from 'lit';

export class ToastHost extends LitElement {
  static styles = css`
    :host {
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 9999;
      display: flex;
      flex-direction: column;
      gap: 8px;
      max-width: 350px;
    }

    .toast {
      position: relative;
      padding: 16px 20px;
      border-radius: var(--radius-md);
      background: rgba(255, 255, 255, 0.95);
      box-shadow: var(--shadow-lg);
      color: var(--text-primary);
      font-size: 0.875rem;
      line-height: 1.4;
      transform: translateY(100%);
      opacity: 0;
      transition: all 0.3s ease-out;
      animation: fadeInOut 5s forwards;
    }

    .toast.show {
      transform: translateY(0);
      opacity: 1;
    }

    .toast.info { background: rgba(255, 255, 255, 0.95); }
    .toast.success { background: rgba(16, 185, 129, 0.2); }
    .toast.error { background: rgba(239, 68, 68, 0.2); }
    .toast.warning { background: rgba(245, 158, 72, 0.2); }

    @keyframes fadeInOut {
      0% { opacity: 0; transform: translateY(100%); }
      10% { opacity: 1; transform: translateY(0); }
      90% { opacity: 1; transform: translateY(0); }
      100% { opacity: 0; transform: translateY(-100%); }
    }

    .toast-close {
      position: absolute;
      top: 8px;
      right: 8px;
      background: none;
      border: none;
      color: inherit;
      cursor: pointer;
      font-size: 16px;
    }
    
    @keyframes slideIn {
      from { transform: translateY(20px); opacity: 0; }
      to { transform: translateY(0); opacity: 1; }
    }

    .toast-enter {
      animation: slideIn 0.3s ease-out;
    }
  `;

  constructor() {
    super();
    this.toasts = [];
  }

  connectedCallback() {
    super.connectedCallback();
    
    // Listen for toast events
    this.addEventListener('toast', (e) => {
      this._addToast(e.detail.message, e.detail.type, e.detail.duration);
    });
  }

  disconnectedCallback() {
    super.disconnectedCallback();
  }

  render() {
    return html`
      ${this.toasts.map((toast, index) => html`
        <div 
          class="toast ${toast.type} toast-enter" 
          @click="${() => this._dismissToast(toast.id)}"
        >
          ${toast.message}
          <button 
            class="toast-close"
            aria-label="Dismiss"
            @click="${(e) => { e.stopPropagation(); this._dismissToast(toast.id); }}"
          >
            ×
          </button>
        </div>
      `)}
    `;
  }

  _addToast(message, type = 'info', duration = 4000) {
    const id = Date.now() + Math.random();
    
    // Create toast object with metadata
    this.toasts = [
      ...this.toasts,
      { id, message, type }
    ];
    
    // Remove after timeout
    if (duration > 0) {
      setTimeout(() => {
        this._dismissToast(id);
      }, duration);
    }

    // Re-render to show new toast
    this.requestUpdate();
  }

  _dismissToast(id) {
    this.toasts = this.toasts.filter(toast => toast.id !== id);
    this.requestUpdate();
  }
}

customElements.define('toast-host', ToastHost);