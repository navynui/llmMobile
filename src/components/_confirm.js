import { LitElement, html, css } from 'lit';

export class Confirm extends LitElement {
  static properties = {
    message: { type: String },
    details: { type: String }
  };

  static styles = css`
    :host {
      display: block;
    }

    .confirm-overlay {
      position: fixed;
      inset: 0;
      z-index: 9999;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(0, 0, 0, 0.55);
      backdrop-filter: blur(4px);
      -webkit-backdrop-filter: blur(4px);
      animation: overlayIn 0.15s ease-out;
    }

    @keyframes overlayIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }

    .confirm-modal {
      background: var(--surface, #1e2130);
      border: 1px solid var(--border, rgba(255,255,255,0.1));
      border-radius: 12px;
      padding: 1.5rem;
      min-width: 280px;
      max-width: 420px;
      width: 90%;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
      animation: modalIn 0.18s cubic-bezier(0.34, 1.56, 0.64, 1);
    }

    @keyframes modalIn {
      from { opacity: 0; transform: scale(0.9) translateY(-10px); }
      to { opacity: 1; transform: scale(1) translateY(0); }
    }

    h3 {
      margin: 0 0 0.5rem;
      font-size: 1rem;
      font-weight: 600;
      color: var(--text, #e2e8f0);
    }

    p {
      margin: 0 0 1rem;
      font-size: 0.875rem;
      color: var(--text-muted, #94a3b8);
    }

    .confirm-actions {
      display: flex;
      gap: 0.75rem;
      justify-content: flex-end;
      margin-top: 1.25rem;
    }

    button {
      padding: 0.5rem 1.1rem;
      border-radius: 8px;
      border: none;
      font-size: 0.875rem;
      font-weight: 500;
      cursor: pointer;
      transition: opacity 0.15s, transform 0.1s;
    }

    button:hover {
      opacity: 0.85;
      transform: translateY(-1px);
    }

    button:active {
      transform: scale(0.97);
    }

    .btn-cancel {
      background: var(--surface2, rgba(255,255,255,0.08));
      color: var(--text-muted, #94a3b8);
    }

    .btn-confirm {
      background: var(--danger, #ef4444);
      color: #fff;
    }
  `;

  constructor() {
    super();
    this.message = '';
    this.details = '';
  }

  // Static method to show confirm dialog — prevents stacking by reusing existing
  static async show(message, details = '') {
    // If a dialog is already open, don't stack another one
    if (document.querySelector('confirm-dialog')) {
      return false;
    }

    try {
      const confirmEl = document.createElement('confirm-dialog');
      confirmEl.message = message;
      confirmEl.details = details;
      document.body.appendChild(confirmEl);

      return new Promise((resolve) => {
        const handleConfirm = (e) => {
          resolve(e.detail.confirmed);
          confirmEl.remove();
        };
        confirmEl.addEventListener('confirm', handleConfirm, { once: true });
      });
    } catch (error) {
      console.warn('Confirm dialog failed, falling back to window.confirm:', error);
      return window.confirm(message);
    }
  }

  render() {
    return html`
      <div class="confirm-overlay" @click="${this._handleOverlayClick}">
        <div class="confirm-modal" role="dialog" aria-modal="true" aria-labelledby="confirm-title" @click="${(e) => e.stopPropagation()}">
          <h3 id="confirm-title">${this.message}</h3>
          ${this.details ? html`<p>${this.details}</p>` : ''}
          <div class="confirm-actions">
            <button type="button" class="btn-cancel" @click="${this._handleCancel}">Cancel</button>
            <button type="button" class="btn-confirm" @click="${this._handleConfirm}">Confirm</button>
          </div>
        </div>
      </div>
    `;
  }

  _handleOverlayClick() {
    // Click outside the modal = cancel
    this._handleCancel();
  }

  _handleConfirm() {
    this.dispatchEvent(new CustomEvent('confirm', { detail: { confirmed: true } }));
  }

  _handleCancel() {
    this.dispatchEvent(new CustomEvent('confirm', { detail: { confirmed: false } }));
  }
}

if (!customElements.get('confirm-dialog')) {
  customElements.define('confirm-dialog', Confirm);
}