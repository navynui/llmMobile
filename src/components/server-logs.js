import { LitElement, html, css } from 'lit';
import { cardStyles, buttonStyles } from './_primitives.js';

export class ServerLogs extends LitElement {
  static properties = {
    logsText: { type: String },
    logContainer: { type: String },
    logLimit: { type: Number },
    logsLoading: { type: Boolean },
    logsExpanded: { type: Boolean }
  };

  static styles = css`
    ${cardStyles}
    ${buttonStyles}

    .arrow-icon {
      font-size: 0.8rem;
      transition: var(--transition);
      color: var(--text-secondary);
    }

    .arrow-expanded {
      transform: rotate(180deg);
    }

    .switcher-header {
      cursor: pointer;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .switcher-body {
      max-height: 0;
      overflow: hidden;
      transition: max-height 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    }

    .switcher-body.expanded {
      max-height: none;
      margin-top: 16px;
    }

    .logs-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 12px;
    }

    .logs-tabs {
      display: flex;
      background: rgba(0, 0, 0, 0.2);
      border: 1px solid var(--border-color);
      border-radius: var(--radius-sm);
      padding: 2px;
    }

    .logs-tab-btn {
      background: transparent;
      border: none;
      color: var(--text-secondary);
      padding: 6px 12px;
      font-size: 0.75rem;
      font-weight: 600;
      border-radius: calc(var(--radius-sm) - 1px);
      cursor: pointer;
    }

    .logs-tab-btn.active {
      background: rgba(255, 255, 255, 0.05);
      color: var(--text-primary);
    }

    .logs-terminal {
      background: #05070f;
      border: 1px solid var(--border-color);
      border-radius: var(--radius-md);
      padding: 12px;
      font-family: 'Courier New', Courier, monospace;
      font-size: 0.75rem;
      color: #38bdf8;
      height: 250px;
      overflow-y: auto;
      white-space: pre-wrap;
      word-break: break-all;
      margin-top: 12px;
    }

    select {
      padding: 6px 10px;
      background: rgba(0, 0, 0, 0.2);
      border: 1px solid var(--border-color);
      border-radius: var(--radius-md);
      color: var(--text-primary);
      font-family: var(--font-sans);
      font-size: 0.85rem;
      outline: none;
      cursor: pointer;
    }

    /* Loader */
    .loader {
      width: 12px;
      height: 12px;
      border: 2px solid rgba(255, 255, 255, 0.1);
      border-top-color: var(--primary);
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
      display: inline-block;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }
  `;

  constructor() {
    super();
    this.logsText = '';
    this.logContainer = 'llm-server';
    this.logLimit = 50;
    this.logsLoading = false;
    this.logsExpanded = false;
  }

  toggleLogs() {
    this.logsExpanded = !this.logsExpanded;
    if (this.logsExpanded && !this.logsText) {
      this._handleRefresh();
    }
  }

  _switchLogsTab(container) {
    this.dispatchEvent(new CustomEvent('container-change', {
      detail: { container }
    }));
  }

  _handleLogLimitChange(e) {
    this.dispatchEvent(new CustomEvent('limit-change', {
      detail: { limit: parseInt(e.target.value) }
    }));
  }

  _handleRefresh() {
    this.dispatchEvent(new CustomEvent('refresh'));
  }

  updated(changedProperties) {
    if (changedProperties.has('logsText')) {
      setTimeout(() => {
        const terminal = this.shadowRoot?.querySelector('.logs-terminal');
        if (terminal) {
          terminal.scrollTop = terminal.scrollHeight;
        }
      }, 50);
    }
  }

  render() {
    return html`
      <div class="card">
        <div class="switcher-header" @click="${this.toggleLogs}">
          <div class="card-title" style="margin-bottom: 0;">🖥️ Real-Time System Logs</div>
          <div class="arrow-icon ${this.logsExpanded ? 'arrow-expanded' : ''}">▼</div>
        </div>

        <div class="switcher-body ${this.logsExpanded ? 'expanded' : ''}">
          <span class="card-subtitle" style="display: block; font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 12px; line-height: 1.4;">
            Inspect outputs, exceptions, or load cycles printed by your chosen container.
          </span>

          <div style="display: flex; gap: 16px; align-items: center; flex-wrap: wrap; margin-top: 10px;">
            <div class="logs-tabs">
              <button 
                class="logs-tab-btn ${this.logContainer === 'llm-server' ? 'active' : ''}" 
                @click="${() => this._switchLogsTab('llm-server')}"
              >
                LLM Server
              </button>
              <button 
                class="logs-tab-btn ${this.logContainer === 'llm-mobile' ? 'active' : ''}" 
                @click="${() => this._switchLogsTab('llm-mobile')}"
              >
                Manager
              </button>
            </div>

            <div style="display: flex; gap: 6px; align-items: center; font-size: 0.85rem;">
              <span>Lines:</span>
              <select .value="${this.logLimit.toString()}" @change="${this._handleLogLimitChange}">
                <option value="20">20</option>
                <option value="50">50</option>
                <option value="100">100</option>
                <option value="200">200</option>
              </select>
            </div>

            <button 
              class="btn btn-secondary" 
              style="padding: 6px 12px; font-size: 0.8rem;" 
              @click="${this._handleRefresh}"
              ?disabled="${this.logsLoading}"
            >
              ${this.logsLoading ? html`<span class="loader"></span>` : '⟳ Refresh Logs'}
            </button>
          </div>

          <div class="logs-terminal">${this.logsText || 'Click refresh to pull container logs...'}</div>
        </div>
      </div>
    `;
  }
}

customElements.define('server-logs', ServerLogs);