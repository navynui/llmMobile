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
    statusMessage: { type: String },
    
    // Migrated Models Config & Edit models.ini States
    modelsIniText: { type: String },
    modelsIniLoading: { type: Boolean },
    modelToDelete: { type: String },
    configExpanded: { type: Boolean },
    iniExpanded: { type: Boolean }
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

    /* Collapsible Sections */
    .switcher-header {
      cursor: pointer;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .arrow-icon {
      font-size: 0.8rem;
      transition: var(--transition);
      color: var(--text-secondary);
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
      max-height: 1000px;
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

    option {
      background: #0f172a;
      color: #ffffff;
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

    /* Text Inputs for edit models.ini */
    .text-input {
      flex: 1;
      background: rgba(0, 0, 0, 0.3);
      border: 1px solid var(--border-color);
      border-radius: var(--radius-md);
      padding: 12px 14px;
      color: var(--text-primary);
      font-size: 0.9rem;
      font-family: var(--font-sans);
      outline: none;
      transition: var(--transition);
    }

    .text-input:focus {
      border-color: var(--primary);
      box-shadow: 0 0 0 2px var(--primary-glow);
    }

    /* file list & downloaded items styling */
    .file-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin-bottom: 16px;
    }

    .repo-item {
      background: rgba(255, 255, 255, 0.02);
      border: 1px solid var(--border-color);
      border-radius: var(--radius-md);
      padding: 12px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      transition: var(--transition);
    }

    .repo-item:hover {
      background: rgba(255, 255, 255, 0.04);
      border-color: rgba(255, 255, 255, 0.1);
    }

    .meta-badge {
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.08);
      color: var(--text-secondary);
      border-radius: var(--radius-sm);
      padding: 2px 6px;
      font-size: 0.72rem;
      font-weight: 500;
    }

    /* Modal dialog */
    .modal-backdrop {
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0, 0, 0, 0.7);
      backdrop-filter: blur(4px);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
      padding: 20px;
      animation: fadeIn 0.2s ease;
    }

    .modal {
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      border-radius: var(--radius-lg);
      padding: 24px;
      max-width: 400px;
      width: 100%;
      box-shadow: var(--shadow-2xl);
      display: flex;
      flex-direction: column;
      gap: 16px;
      animation: scaleIn 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    }

    .modal-title {
      font-family: var(--font-title);
      font-size: 1.15rem;
      color: var(--text-primary);
      margin: 0;
    }

    .modal-body {
      font-size: 0.88rem;
      color: var(--text-secondary);
      line-height: 1.4;
      margin: 0;
    }

    .modal-actions {
      display: flex;
      gap: 12px;
      justify-content: flex-end;
    }

    @keyframes scaleIn {
      from { transform: scale(0.95); opacity: 0; }
      to { transform: scale(1); opacity: 1; }
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

    /* Loader */
    .loader {
      width: 16px;
      height: 16px;
      border: 2px solid rgba(255, 255, 255, 0.1);
      border-top-color: var(--primary);
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
      display: inline-block;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
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
    
    // Migrated Config parameters
    this.modelsIniText = '';
    this.modelsIniLoading = false;
    this.modelToDelete = null;
    this.configExpanded = false;
    this.iniExpanded = false;
  }

  connectedCallback() {
    super.connectedCallback();
    this.activeModelPoll = setInterval(() => {
      if (this.status?.server?.status === 'running') {
        this.fetchActiveModel();
      }
    }, 4000);
    
    // Automatically load migrated configurations on mount
    this.fetchModelsIni();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this.activeModelPoll) {
      clearInterval(this.activeModelPoll);
    }
  }

  firstUpdated() {
    this.fetchModelsList();
    this.fetchActiveModel();
  }

  updated(changedProperties) {
    if (changedProperties.has('activeModel')) {
      const oldActive = changedProperties.get('activeModel');
      const newActive = this.activeModel;
      
      if (newActive && newActive !== oldActive) {
        this.dispatchEvent(new CustomEvent('op-queue-notification', {
          detail: { message: `🟢 Model Loaded: "${newActive}" is ready for inference!` },
          bubbles: true,
          composed: true
        }));
      } else if (!newActive && oldActive) {
        this.dispatchEvent(new CustomEvent('op-queue-notification', {
          detail: { message: `⚪ Model Unloaded: VRAM cleared.` },
          bubbles: true,
          composed: true
        }));
      }
    }
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

  toggleConfig() {
    this.configExpanded = !this.configExpanded;
  }

  toggleIni() {
    this.iniExpanded = !this.iniExpanded;
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

  // --- Migrated config-manager methods ---
  async fetchModelsIni() {
    this.modelsIniLoading = true;
    try {
      const res = await fetch('/api/models_ini');
      if (res.ok) {
        const data = await res.json();
        this.modelsIniText = data.content || '';
      }
    } catch (err) {
      console.error(err);
    } finally {
      this.modelsIniLoading = false;
    }
  }

  async saveModelsIni() {
    this.modelsIniLoading = true;
    try {
      const res = await fetch('/api/models_ini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: this.modelsIniText })
      });
      if (res.ok) {
        this.dispatchEvent(new CustomEvent('op-queue-notification', {
          detail: { message: 'models.ini saved successfully' },
          bubbles: true,
          composed: true
        }));
        // Reload local models lists
        this.fetchModelsList();
      } else {
        const err = await res.text();
        this.dispatchEvent(new CustomEvent('op-queue-notification', {
          detail: { message: `Save failed: ${err}` },
          bubbles: true,
          composed: true
        }));
      }
    } catch (err) {
      console.error(err);
    } finally {
      this.modelsIniLoading = false;
    }
  }

  async handleScanAndRegister() {
    this.modelsIniLoading = true;
    try {
      const res = await fetch('/api/models/scan_and_register', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        this.dispatchEvent(new CustomEvent('op-queue-notification', {
          detail: { message: data.detail || 'Scan complete!' },
          bubbles: true,
          composed: true
        }));
        // Reload models list and editor content
        this.fetchModelsList();
        this.fetchModelsIni();
      } else {
        const err = await res.text();
        this.dispatchEvent(new CustomEvent('op-queue-notification', {
          detail: { message: `Scan failed: ${err}` },
          bubbles: true,
          composed: true
        }));
      }
    } catch (err) {
      console.error(err);
    } finally {
      this.modelsIniLoading = false;
    }
  }

  showDeleteModelConfirm(filename) {
    this.modelToDelete = filename;
  }

  closeDeleteModelConfirm() {
    this.modelToDelete = null;
  }

  async executeDeleteModel() {
    const filename = this.modelToDelete;
    this.closeDeleteModelConfirm();
    if (!filename) return;

    try {
      const res = await fetch(`/models/${encodeURIComponent(filename)}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        const data = await res.json();
        this.dispatchEvent(new CustomEvent('op-queue-notification', {
          detail: { message: data.detail || `Deleted ${filename}` },
          bubbles: true,
          composed: true
        }));
        // Refresh local models and configuration editor
        this.fetchModelsList();
        this.fetchModelsIni();
      } else {
        const err = await res.text();
        this.dispatchEvent(new CustomEvent('op-queue-notification', {
          detail: { message: `Delete failed: ${err}` },
          bubbles: true,
          composed: true
        }));
      }
    } catch (err) {
      console.error(err);
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

        <!-- Migrated Models Config (GGUF File Manager) Card -->
        <div class="card">
          <div class="switcher-header" @click="${this.toggleConfig}">
            <div class="card-title" style="margin-bottom: 0;">📁 Models Config</div>
            <div class="arrow-icon ${this.configExpanded ? 'arrow-expanded' : ''}">▼</div>
          </div>

          <div class="switcher-body ${this.configExpanded ? 'expanded' : ''}">
            <span class="card-subtitle" style="display: block; font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 12px; line-height: 1.4;">
              Inspect, edit, save, and reload your model configurations (<code>models.ini</code>), or delete unused GGUF files.
            </span>
            <div style="margin-top: 4px;">
              <h3 style="font-size: 0.9rem; margin-bottom: 12px; color: var(--text-primary); display: flex; align-items: center; gap: 6px;">
                💾 Downloaded GGUF Files on Disk
              </h3>
              ${this.models.length === 0 ? html`
                <p style="font-size: 0.85rem; color: var(--text-secondary); font-style: italic; margin-bottom: 12px; padding: 8px 12px; background: rgba(255,255,255,0.02); border-radius: var(--radius-sm);">
                  No downloaded GGUF files found on disk or listed in models.ini.
                </p>
              ` : html`
                <div class="file-list">
                  ${this.models.map(m => html`
                    <div class="repo-item" style="cursor: default;">
                      <div style="display: flex; flex-direction: column; gap: 4px; flex: 1; margin-right: 12px;">
                        <span style="font-size: 0.85rem; font-weight: 500; word-break: break-all;">${m.filename}</span>
                        <div style="display: flex; gap: 6px; align-items: center;">
                          ${m.size ? html`<span class="meta-badge">${m.size}</span>` : ''}
                          ${m.is_default ? html`<span class="meta-badge" style="background: rgba(99,102,241,0.15); color: #a5b4fc; border-color: rgba(99,102,241,0.25);">⭐ Default</span>` : ''}
                        </div>
                      </div>
                      <button 
                        class="btn btn-danger" 
                        style="padding: 6px 12px; font-size: 0.8rem;" 
                        @click="${() => this.showDeleteModelConfirm(m.filename)}"
                      >
                        🗑️ Delete
                      </button>
                    </div>
                  `)}
                </div>
              `}
            </div>
          </div>
        </div>

        <!-- Migrated Edit models.ini Card -->
        <div class="card">
          <div class="switcher-header" @click="${this.toggleIni}">
            <div class="card-title" style="margin-bottom: 0;">📝 Edit models.ini</div>
            <div class="arrow-icon ${this.iniExpanded ? 'arrow-expanded' : ''}">▼</div>
          </div>

          <div class="switcher-body ${this.iniExpanded ? 'expanded' : ''}">
            <div style="display: flex; flex-direction: column; gap: 8px;">
              <textarea 
                class="text-input" 
                style="font-family: var(--font-mono); font-size: 0.8rem; line-height: 1.5; min-height: 250px; resize: vertical; background: rgba(0, 0, 0, 0.4); border: 1px solid var(--border-color); color: #22c55e; padding: 12px; border-radius: var(--radius-md);" 
                .value="${this.modelsIniText}"
                @input="${e => this.modelsIniText = e.target.value}"
                ?disabled="${this.modelsIniLoading}"
                placeholder="Loading models.ini..."
              ></textarea>
              
              <div style="display: flex; gap: 8px; justify-content: flex-end; margin-top: 4px; flex-wrap: wrap;">
                <button 
                  class="btn btn-secondary" 
                  style="padding: 8px 16px; font-size: 0.85rem; border-color: rgba(99,102,241,0.25); color: #a5b4fc; background: rgba(99,102,241,0.04);" 
                  @click="${this.handleScanAndRegister}"
                  ?disabled="${this.modelsIniLoading}"
                >
                  🔍 Scan & Auto-Add Missing
                </button>
                <button 
                  class="btn btn-secondary" 
                  style="padding: 8px 16px; font-size: 0.85rem;" 
                  @click="${this.fetchModelsIni}"
                  ?disabled="${this.modelsIniLoading}"
                >
                  ⟳ Reload
                </button>
                <button 
                  class="btn btn-primary" 
                  style="padding: 8px 16px; font-size: 0.85rem;" 
                  @click="${this.saveModelsIni}"
                  ?disabled="${this.modelsIniLoading}"
                >
                  💾 Save Config
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Notification Feed -->
        ${this.statusMessage ? html`<div class="status-msg">${this.statusMessage}</div>` : ''}
      </div>

      <!-- Migrated GGUF Model Delete Confirmation Dialog -->
      ${this.modelToDelete ? html`
        <div class="modal-backdrop">
          <div class="modal">
            <h3 class="modal-title">Delete GGUF Model</h3>
            <p class="modal-body">
              Are you sure you want to delete <strong>${this.modelToDelete}</strong>?
              This will permanently delete the GGUF file from disk and automatically remove its configuration block from <code>models.ini</code>.
            </p>
            <div class="modal-actions">
              <button class="btn btn-secondary" style="padding: 8px 16px;" @click="${this.closeDeleteModelConfirm}">Cancel</button>
              <button class="btn btn-danger" style="padding: 8px 16px;" @click="${this.executeDeleteModel}">
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      ` : ''}
    `;
  }
}

customElements.define('server-tab', ServerTab);
