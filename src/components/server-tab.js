import { LitElement, html, css } from 'lit';

export class ServerTab extends LitElement {
  static properties = {
    stats: { type: Object },
    status: { type: Object },
    models: { type: Array },
    activeModel: { type: String },
    loadingModel: { type: Boolean },
    switcherExpanded: { type: Boolean },
    actionPending: { type: Boolean },
    statusMessage: { type: String }
  };

  static styles = css`
    :host {
      display: block;
      padding: 16px;
      padding-bottom: 32px;
    }

    .container {
      display: flex;
      flex-direction: column;
      gap: 16px;
      max-width: 600px;
      margin: 0 auto;
    }

    /* Cards */
    .card {
      background: var(--bg-card);
      backdrop-filter: blur(var(--blur));
      -webkit-backdrop-filter: blur(var(--blur));
      border: 1px solid var(--border-color);
      border-radius: var(--radius-lg);
      padding: 20px;
      box-shadow: var(--shadow-lg);
      transition: var(--transition);
    }

    .card:hover {
      border-color: var(--border-active);
      box-shadow: 0 10px 25px -5px var(--primary-glow);
    }

    .card-title {
      font-family: var(--font-title);
      font-size: 1.1rem;
      font-weight: 600;
      color: var(--text-primary);
      margin-bottom: 16px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    /* Status badge */
    .status-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 10px;
      border-radius: var(--radius-full);
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: capitalize;
    }

    .status-running {
      background: var(--success-glow);
      color: var(--success);
      border: 1px solid rgba(16, 185, 129, 0.2);
    }

    .status-stopped {
      background: var(--danger-glow);
      color: var(--danger);
      border: 1px solid rgba(239, 68, 68, 0.2);
    }

    .status-unknown, .status-not_found {
      background: rgba(255, 255, 255, 0.05);
      color: var(--text-muted);
      border: 1px solid rgba(255, 255, 255, 0.1);
    }

    /* Stats Grid */
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 16px;
    }

    .stat-box {
      background: rgba(255, 255, 255, 0.02);
      border: 1px solid rgba(255, 255, 255, 0.04);
      border-radius: var(--radius-md);
      padding: 12px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .stat-header {
      display: flex;
      justify-content: space-between;
      font-size: 0.75rem;
      font-weight: 500;
      color: var(--text-secondary);
    }

    .stat-value {
      font-family: var(--font-title);
      font-size: 1.25rem;
      font-weight: 700;
      color: var(--text-primary);
    }

    .stat-progress {
      height: 6px;
      background: rgba(255, 255, 255, 0.08);
      border-radius: var(--radius-full);
      overflow: hidden;
      position: relative;
    }

    .stat-bar {
      height: 100%;
      border-radius: var(--radius-full);
      transition: width 0.5s ease-out;
    }

    /* Alert levels for progress bars */
    .bar-normal { background: var(--success); }
    .bar-warning { background: var(--warning); }
    .bar-danger { background: var(--danger); }

    .full-width {
      grid-column: span 2;
    }

    /* Model Switcher */
    .switcher-header {
      cursor: pointer;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .arrow-icon {
      font-size: 0.8rem;
      transition: var(--transition);
    }

    .arrow-expanded {
      transform: rotate(180deg);
    }

    .switcher-body {
      max-height: 0;
      overflow: hidden;
      transition: max-height 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    }

    .switcher-body.expanded {
      max-height: 400px;
      margin-top: 16px;
    }

    .active-model-info {
      background: rgba(99, 102, 241, 0.06);
      border: 1px solid rgba(99, 102, 241, 0.15);
      border-radius: var(--radius-md);
      padding: 12px;
      margin-bottom: 16px;
      font-size: 0.85rem;
    }

    .select-label {
      font-size: 0.8rem;
      font-weight: 500;
      color: var(--text-secondary);
      margin-bottom: 8px;
    }

    select {
      width: 100%;
      padding: 12px;
      background: rgba(0, 0, 0, 0.2);
      border: 1px solid var(--border-color);
      border-radius: var(--radius-md);
      color: var(--text-primary);
      font-family: var(--font-sans);
      font-size: 0.9rem;
      outline: none;
      cursor: pointer;
      appearance: none;
      -webkit-appearance: none;
      background-image: url("data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%239ca3af' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E");
      background-repeat: no-repeat;
      background-position: right 12px center;
      background-size: 16px;
      padding-right: 40px;
      transition: var(--transition);
    }

    select:focus {
      border-color: var(--primary);
    }

    .btn-group {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
      margin-top: 16px;
    }

    button {
      padding: 12px 20px;
      border-radius: var(--radius-md);
      font-family: var(--font-sans);
      font-size: 0.9rem;
      font-weight: 600;
      cursor: pointer;
      transition: var(--transition);
      display: flex;
      justify-content: center;
      align-items: center;
      gap: 8px;
    }

    button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .btn-primary {
      background: var(--primary);
      color: #fff;
      border: none;
      box-shadow: 0 4px 14px var(--primary-glow);
    }

    .btn-primary:not(:disabled):hover {
      background: #4f46e5;
    }

    .btn-secondary {
      background: rgba(255, 255, 255, 0.05);
      color: var(--text-primary);
      border: 1px solid var(--border-color);
    }

    .btn-secondary:not(:disabled):hover {
      background: rgba(255, 255, 255, 0.1);
    }

    .btn-danger {
      background: var(--danger-glow);
      color: var(--danger);
      border: 1px solid rgba(239, 68, 68, 0.3);
    }

    .btn-danger:not(:disabled):hover {
      background: rgba(239, 68, 68, 0.25);
    }

    /* Toast/Message */
    .status-msg {
      margin-top: 12px;
      font-size: 0.85rem;
      text-align: center;
      color: var(--success);
      font-weight: 500;
      animation: fadeIn 0.2s ease-out;
    }

    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(-4px); }
      to { opacity: 1; transform: translateY(0); }
    }
  `;

  constructor() {
    super();
    this.stats = {
      cpu_temp: 0, cpu_util: 0, ram_percent: 0,
      gpu_temp: 0, gpu_util: 0, vram_percent: 0,
      storage_percent: 0, storage_used_gb: 0,
      storage_total_gb: 0
    };
    this.status = {
      server: { status: 'stopped', image: null, uptime: null },
      manager: { status: 'running', image: null, uptime: null }
    };
    this.models = [];
    this.activeModel = '';
    this.loadingModel = false;
    this.switcherExpanded = false;
    this.actionPending = false;
    this.statusMessage = '';
  }

  firstUpdated() {
    this.fetchModelsList();
    this.fetchActiveModel();
  }

  async fetchModelsList() {
    try {
      const res = await fetch('/models');
      if (res.ok) {
        const data = await res.json();
        this.models = data.models || [];
      }
    } catch (e) {
      console.error("Failed to list models", e);
    }
  }

  async fetchActiveModel() {
    try {
      const res = await fetch('/api/llm/models');
      if (res.ok) {
        const data = await res.json();
        const loadedModel = data.data?.find(m => m.status === 'loaded' || m.status?.value === 'loaded');
        this.activeModel = loadedModel ? loadedModel.id : '';
      }
    } catch (e) {
      console.warn("Failed to check loaded models", e);
    }
  }

  getUtilColorClass(percent) {
    if (percent < 50) return 'bar-normal';
    if (percent < 85) return 'bar-warning';
    return 'bar-danger';
  }

  getTempColorClass(temp) {
    if (temp < 60) return 'bar-normal';
    if (temp < 80) return 'bar-warning';
    return 'bar-danger';
  }

  toggleSwitcher() {
    this.switcherExpanded = !this.switcherExpanded;
  }

  async handleServerToggle() {
    this.actionPending = true;
    const isRunning = this.status?.server?.status === 'running';
    const endpoint = isRunning ? '/stop' : '/start';
    this.showStatus(isRunning ? 'Stopping LLM server...' : 'Starting LLM server...');

    try {
      const res = await fetch(endpoint, { method: 'POST' });
      const data = await res.json();
      this.showStatus(data.detail || 'Success!');
      
      // Fetch models listing again in case server is back up
      if (!isRunning) {
        setTimeout(() => {
          this.fetchModelsList();
          this.fetchActiveModel();
        }, 3000);
      } else {
        this.activeModel = '';
      }
    } catch (e) {
      this.showStatus('Error executing request: ' + e.message, true);
    } finally {
      this.actionPending = false;
    }
  }

  async handleModelLoad(modelName = '') {
    const selectEl = this.shadowRoot.querySelector('#model-select');
    const targetModel = modelName || (selectEl ? selectEl.value : '');
    if (!targetModel) return;

    this.actionPending = true;
    this.loadingModel = true;
    this.showStatus(`Loading model ${targetModel}...`);

    try {
      const res = await fetch('/api/llm/models/load', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: targetModel })
      });
      const data = await res.json();
      if (res.ok) {
        this.activeModel = targetModel;
        this.showStatus(`Loaded model successfully!`);
        if (selectEl) {
          selectEl.value = targetModel;
        }
      } else {
        this.showStatus(`Failed: ${data.detail || 'Unknown error'}`, true);
      }
    } catch (e) {
      this.showStatus('Error: ' + e.message, true);
    } finally {
      this.actionPending = false;
      this.loadingModel = false;
    }
  }

  async handleSelectModelChange(e) {
    const selected = e.target.value;
    if (selected) {
      await this.handleModelLoad(selected);
    }
  }

  async handleModelUnload() {
    if (!this.activeModel) return;

    this.actionPending = true;
    this.showStatus(`Unloading model ${this.activeModel}...`);

    try {
      const res = await fetch('/api/llm/models/unload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: this.activeModel })
      });
      const data = await res.json();
      if (res.ok) {
        this.activeModel = '';
        this.showStatus(`Unloaded model successfully!`);
      } else {
        this.showStatus(`Failed: ${data.detail || 'Unknown error'}`, true);
      }
    } catch (e) {
      this.showStatus('Error: ' + e.message, true);
    } finally {
      this.actionPending = false;
    }
  }

  showStatus(msg, isError = false) {
    this.statusMessage = msg;
    const msgEl = this.shadowRoot.querySelector('.status-msg');
    if (msgEl) {
      msgEl.style.color = isError ? 'var(--danger)' : 'var(--success)';
    }
    setTimeout(() => {
      if (this.statusMessage === msg) {
        this.statusMessage = '';
      }
    }, 5000);
  }

  render() {
    const status = this.status || {};
    const stats = this.stats || {};
    const serverStatus = status.server || {};
    const isServerRunning = serverStatus.status === 'running';

    return html`
      <div class="container">
        <!-- Server Status Card -->
        <div class="card">
          <div class="card-title">
            <span>⚡ LLM Service Status</span>
            <span class="status-badge status-${serverStatus.status || 'stopped'}">
              ● ${serverStatus.status || 'Stopped'}
            </span>
          </div>
          <div style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 16px;">
            <div><strong>Image:</strong> ${serverStatus.image || 'N/A'}</div>
            ${isServerRunning ? html`<div><strong>Uptime:</strong> ${serverStatus.uptime || 'N/A'}</div>` : ''}
          </div>
          <button 
            class="${isServerRunning ? 'btn-danger' : 'btn-primary'}" 
            @click="${this.handleServerToggle}"
            ?disabled="${this.actionPending}"
          >
            ${isServerRunning ? 'Stop Server' : 'Start Server'}
          </button>
        </div>

        <!-- Telemetry Stats Card -->
        <div class="card">
          <div class="card-title">System Metrics</div>
          <div class="stats-grid">
            <!-- CPU Util -->
            <div class="stat-box">
              <div class="stat-header">
                <span>CPU Utility</span>
                <span>${Math.round(stats.cpu_util || 0)}%</span>
              </div>
              <div class="stat-progress">
                <div class="stat-bar ${this.getUtilColorClass(stats.cpu_util || 0)}" style="width: ${stats.cpu_util || 0}%"></div>
              </div>
            </div>

            <!-- CPU Temp -->
            <div class="stat-box">
              <div class="stat-header">
                <span>CPU Temp</span>
                <span>${Math.round(stats.cpu_temp || 0)}°C</span>
              </div>
              <div class="stat-progress">
                <div class="stat-bar ${this.getTempColorClass(stats.cpu_temp || 0)}" style="width: ${stats.cpu_temp || 0}%"></div>
              </div>
            </div>

            <!-- GPU Util -->
            <div class="stat-box">
              <div class="stat-header">
                <span>GPU Utility</span>
                <span>${Math.round(stats.gpu_util || 0)}%</span>
              </div>
              <div class="stat-progress">
                <div class="stat-bar ${this.getUtilColorClass(stats.gpu_util || 0)}" style="width: ${stats.gpu_util || 0}%"></div>
              </div>
            </div>

            <!-- GPU Temp -->
            <div class="stat-box">
              <div class="stat-header">
                <span>GPU Temp</span>
                <span>${Math.round(stats.gpu_temp || 0)}°C</span>
              </div>
              <div class="stat-progress">
                <div class="stat-bar ${this.getTempColorClass(stats.gpu_temp || 0)}" style="width: ${stats.gpu_temp || 0}%"></div>
              </div>
            </div>

            <!-- RAM Usage -->
            <div class="stat-box full-width">
              <div class="stat-header">
                <span>System RAM Usage</span>
                <span>${Math.round(stats.ram_percent || 0)}%</span>
              </div>
              <div class="stat-progress">
                <div class="stat-bar ${this.getUtilColorClass(stats.ram_percent || 0)}" style="width: ${stats.ram_percent || 0}%"></div>
              </div>
            </div>

            <!-- VRAM Usage -->
            <div class="stat-box full-width">
              <div class="stat-header">
                <span>GPU VRAM Usage</span>
                <span>${Math.round(stats.vram_percent || 0)}%</span>
              </div>
              <div class="stat-progress">
                <div class="stat-bar ${this.getUtilColorClass(stats.vram_percent || 0)}" style="width: ${stats.vram_percent || 0}%"></div>
              </div>
            </div>

            <!-- Storage Usage -->
            <div class="stat-box full-width">
              <div class="stat-header">
                <span>Host Storage (${stats.storage_used_gb || 0}GB / ${stats.storage_total_gb || 0}GB)</span>
                <span>${Math.round(stats.storage_percent || 0)}%</span>
              </div>
              <div class="stat-progress">
                <div class="stat-bar ${this.getUtilColorClass(stats.storage_percent || 0)}" style="width: ${stats.storage_percent || 0}%"></div>
              </div>
            </div>
          </div>
        </div>

        <!-- Model Switcher Card -->
        <div class="card">
          <div class="switcher-header" @click="${this.toggleSwitcher}">
            <div class="card-title" style="margin-bottom: 0;">🤖 Active LLM Model</div>
            <div class="arrow-icon ${this.switcherExpanded ? 'arrow-expanded' : ''}">▼</div>
          </div>

          <div class="switcher-body ${this.switcherExpanded ? 'expanded' : ''}">
            <div class="active-model-info">
              <strong>Currently Loaded:</strong> 
              <span style="color: var(--primary); font-weight: 600;">
                ${this.activeModel || 'None (No model loaded in VRAM)'}
              </span>
            </div>

            ${isServerRunning ? html`
              <div class="select-label">Select GGUF model from models.ini:</div>
              <select id="model-select" ?disabled="${this.actionPending}" @change="${this.handleSelectModelChange}">
                <option value="">-- Choose a Model --</option>
                ${this.models.map(m => html`
                  <option value="${m.filename}" ?selected="${this.activeModel === m.filename}">
                    ${m.filename} ${m.is_default ? '⭐ (Default)' : ''}
                  </option>
                `)}
              </select>

              <div class="btn-group">
                <button 
                  class="btn-primary" 
                  @click="${() => this.handleModelLoad()}"
                  ?disabled="${this.actionPending || this.loadingModel}"
                >
                  ${this.loadingModel ? 'Loading...' : 'Load Model'}
                </button>
                <button 
                  class="btn-secondary" 
                  @click="${this.handleModelUnload}"
                  ?disabled="${this.actionPending || !this.activeModel}"
                >
                  Unload
                </button>
              </div>
            ` : html`
              <div style="color: var(--text-muted); font-size: 0.85rem; text-align: center; padding: 16px 0;">
                Please start the llama-server to load models.
              </div>
            `}
          </div>
        </div>

        <!-- Notification Feed -->
        ${this.statusMessage ? html`<div class="status-msg">${this.statusMessage}</div>` : ''}
      </div>
    `;
  }
}

customElements.define('server-tab', ServerTab);
