import { LitElement, html, css } from 'lit';
import './server-status-card.js';
import './models-config-editor.js';
import './model-downloader.js';
import './server-logs.js';

export class ServerTab extends LitElement {
  static properties = {
    stats: { type: Object },
    status: { type: Object },
    models: { type: Array },
    activeModel: { type: String },
    loadingModel: { type: Boolean },
    actionPending: { type: Boolean },
    statusMessage: { type: String },
    
    // Models Config Parameters
    modelsIniText: { type: String },
    modelsIniLoading: { type: Boolean },

    // Downloader States
    hfSearchQuery: { type: String },
    hfSearchLoading: { type: Boolean },
    hfSearchResults: { type: Array },
    hfSelectedRepo: { type: String },
    hfRepoDetails: { type: Object },
    hfDetailsLoading: { type: Boolean },
    hfActiveDownloads: { type: Array },

    // System Logs States
    logContainer: { type: String },
    logsText: { type: String },
    logsLoading: { type: Boolean },
    logLimit: { type: Number }
  };

  static styles = css`
    :host {
      display: block;
      padding: 16px;
      color: var(--text-primary);
      background-color: var(--bg-color);
      min-height: calc(var(--app-dvh) - 80px);
      box-sizing: border-box;
    }

    .server-tab {
      display: flex;
      flex-direction: column;
      gap: 20px;
      max-width: 800px;
      margin: 0 auto;
      padding-bottom: 40px;
    }
    


    server-status-card, models-config-editor, model-downloader, server-logs {
      width: 100%;
    }

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
    this.actionPending = false;
    this.statusMessage = '';
    
    // Models Config Parameters
    this.modelsIniText = '';
    this.modelsIniLoading = false;

    // Downloader States
    this.hfSearchQuery = '';
    this.hfSearchLoading = false;
    this.hfSearchResults = [];
    this.hfSelectedRepo = '';
    this.hfRepoDetails = null;
    this.hfDetailsLoading = false;
    this.hfActiveDownloads = [];

    // System Logs States
    this.logContainer = 'llm-server';
    this.logsText = '';
    this.logsLoading = false;
    this.logLimit = 50;

    // Restore persisted downloads/queue from localStorage
    this.restoreDownloadsFromStorage();
  }

  connectedCallback() {
    super.connectedCallback();
    this.activeModelPoll = setInterval(() => {
      if (this.status?.server?.status === 'running') {
        this.fetchActiveModel();
      }
    }, 4000);
    
    this.fetchModelsIni();
    this.startDownloadPolling();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this.activeModelPoll) {
      clearInterval(this.activeModelPoll);
    }
    this.stopDownloadPolling();
  }

  // --- Downloader Methods ---
  startDownloadPolling() {
    if (this.downloadPollInterval) clearInterval(this.downloadPollInterval);
    this.downloadPollInterval = setInterval(() => this.pollDownloads(), 1500);
  }

  stopDownloadPolling() {
    if (this.downloadPollInterval) {
      clearInterval(this.downloadPollInterval);
      this.downloadPollInterval = null;
    }
  }

  async pollDownloads() {
    try {
      const res = await fetch('/api/models/downloads');
      const data = await res.json();
      this.hfActiveDownloads = data.downloads || [];
      this.saveDownloadsToStorage();
    } catch (err) {
      console.error("Failed to poll downloads", err);
    }
  }

  saveDownloadsToStorage() {
    try {
      const payload = { active: this.hfActiveDownloads, ts: Date.now() };
      localStorage.setItem('hf_downloads', JSON.stringify(payload));
    } catch (e) { /* silent */ }
  }

  restoreDownloadsFromStorage() {
    try {
      const raw = localStorage.getItem('hf_downloads');
      if (!raw) return;
      const payload = JSON.parse(raw);
      if (!payload || !Array.isArray(payload.active)) return;
      const ageSecs = (Date.now() - (payload.ts || 0)) / 1000;
      if (ageSecs > 6 * 3600) {
        localStorage.removeItem('hf_downloads');
        return;
      }
      this.hfActiveDownloads = payload.active;
    } catch (e) { /* silent */ }
  }

  async handleHfSearch() {
    if (!this.hfSearchQuery.trim()) return;
    this.hfSearchLoading = true;
    this.hfSearchResults = [];
    this.hfSelectedRepo = '';
    this.hfRepoDetails = null;

    try {
      const res = await fetch(`/api/models/search?q=${encodeURIComponent(this.hfSearchQuery)}`);
      if (res.ok) {
        const results = await res.json();
        this.hfSearchResults = [...results].sort((a, b) => (b.downloads || 0) - (a.downloads || 0));
      } else {
        this.dispatchEvent(new CustomEvent('op-queue-notification', {
          detail: { message: 'Failed to search HuggingFace Hub' },
          bubbles: true,
          composed: true
        }));
      }
    } catch (err) {
      console.error(err);
    } finally {
      this.hfSearchLoading = false;
    }
  }

  async selectHfRepo(repoId) {
    this.hfSelectedRepo = repoId;
    this.hfDetailsLoading = true;
    this.hfRepoDetails = null;

    try {
      const res = await fetch(`/api/models/details?repo_id=${encodeURIComponent(repoId)}`);
      if (res.ok) {
        this.hfRepoDetails = await res.json();
      } else {
        this.dispatchEvent(new CustomEvent('op-queue-notification', {
          detail: { message: 'Failed to fetch repository details' },
          bubbles: true,
          composed: true
        }));
      }
    } catch (err) {
      console.error(err);
    } finally {
      this.hfDetailsLoading = false;
    }
  }

  async triggerHfDownload(filename) {
    try {
      const res = await fetch('/api/models/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repo_id: this.hfSelectedRepo,
          filename: filename
        })
      });

      if (res.ok) {
        const data = await res.json();
        this.dispatchEvent(new CustomEvent('op-queue-notification', {
          detail: { message: data.detail || 'Download started in background' },
          bubbles: true,
          composed: true
        }));
      } else {
        const errData = await res.json();
        this.dispatchEvent(new CustomEvent('op-queue-notification', {
          detail: { message: errData.detail || 'Failed to start download' },
          bubbles: true,
          composed: true
        }));
      }
    } catch (err) {
      console.error(err);
    }
  }

  // --- System Logs Methods ---
  async fetchLogs() {
    this.logsLoading = true;
    this.logsText = 'Fetching logs...';
    try {
      const res = await fetch(`/api/logs?container_name=${this.logContainer}&lines=${this.logLimit}`);
      if (res.ok) {
        const data = await res.json();
        this.logsText = data.logs || 'No logs found.';
      } else {
        this.logsText = 'Failed to fetch logs.';
      }
    } catch (err) {
      this.logsText = `Error: ${err.message}`;
    } finally {
      this.logsLoading = false;
    }
  }

  switchLogsTab(container) {
    this.logContainer = container;
    this.fetchLogs();
  }

  handleLogLimitChange(e) {
    this.logLimit = e.detail.limit;
    this.fetchLogs();
  }

  _handleVisibilityChange() { if (document.visibilityState === 'visible') { this.pollDownloads(); } }

firstUpdated() {
    this.fetchModelsList();
    this.fetchActiveModel();
    this.pollDownloads();
    this.startDownloadPolling();
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

  async handleStopDownload(key) {
        try {
            const res = await fetch(`/api/models/downloads/${encodeURIComponent(key)}/stop`, { method: 'POST' });
            const data = await res.json();
            this.dispatchEvent(new CustomEvent('op-queue-notification', { detail: { message: data.detail || 'Stopped' }, bubbles: true, composed: true }));
            this.pollDownloads();
        } catch (err) {
            console.error(err);
            this.dispatchEvent(new CustomEvent('op-queue-notification', { detail: { message: 'Failed to stop download' }, bubbles: true, composed: true }));
        }
    }
    async handleResumeDownload(key) {
        try {
            const res = await fetch(`/api/models/downloads/${encodeURIComponent(key)}/resume`, { method: 'POST' });
            const data = await res.json();
            this.dispatchEvent(new CustomEvent('op-queue-notification', { detail: { message: data.detail || 'Resumed' }, bubbles: true, composed: true }));
            this.pollDownloads();
        } catch (err) {
            console.error(err);
            this.dispatchEvent(new CustomEvent('op-queue-notification', { detail: { message: 'Failed to resume download' }, bubbles: true, composed: true }));
        }
    }
    async handleCancelDownload(key) {
        try {
            const res = await fetch(`/api/models/downloads/${encodeURIComponent(key)}/cancel`, { method: 'POST' });
            const data = await res.json();
            this.dispatchEvent(new CustomEvent('op-queue-notification', { detail: { message: data.detail || 'Cancelled' }, bubbles: true, composed: true }));
            this.pollDownloads();
        } catch (err) {
            console.error(err);
            this.dispatchEvent(new CustomEvent('op-queue-notification', { detail: { message: 'Failed to cancel download' }, bubbles: true, composed: true }));
        }
    }
    async refreshDownloads() {
        await this.pollDownloads();
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

  async handleServerToggle() {
    this.actionPending = true;
    const isRunning = this.status?.server?.status === 'running';
    const endpoint = isRunning ? '/stop' : '/start';
    this.showStatus(isRunning ? 'Stopping LLM server...' : 'Starting LLM server...');

    try {
      const res = await fetch(endpoint, { method: 'POST' });
      const data = await res.json();
      this.showStatus(data.detail || 'Success!');
      
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

  async handleRestart() {
    if (!this.status?.server?.status || this.status.server.status !== 'running') return;

    this.actionPending = true;
    this.showStatus('Stopping LLM server...');

    try {
      const res1 = await fetch('/stop', { method: 'POST' });
      if (!res1.ok) throw new Error('Failed to stop server');
      
      this.showStatus('Starting LLM server...');
      
      await new Promise(r => setTimeout(r, 10000));
      const res2 = await fetch('/start', { method: 'POST' });
      if (!res2.ok) throw new Error('Failed to start server');
      
      this.showStatus('Server restarted successfully!');
    } catch (e) {
      this.showStatus('Error restarting server: ' + e.message, true);
    } finally {
      this.actionPending = false;
    }
  }

  async handleModelLoad(modelName = '') {
    const targetModel = modelName;
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
    const selected = e.detail.model;
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

  // --- Config manager methods ---
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

  async executeDeleteModel(filename) {
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

  async handleStopServer() {
    if (!this.status?.server?.status || this.status.server.status !== 'running') return;
    this.actionPending = true;
    this.showStatus('Stopping LLM server...');
    try {
      const res = await fetch('/stop', {method:'POST'});
      if (!res.ok) throw new Error('Failed to stop');
      this.showStatus('Server stopped');
      this.activeModel = '';
    } catch (e) {
      this.showStatus('Error stopping server: '+e.message, true);
    } finally {
      this.actionPending = false;
    }
  }

  async handleRestartServer() {
    // reuse existing handleRestart which already manages actionPending
    await this.handleRestart();
  }

  async handleFreeComfyUI() {
    this.actionPending = true;
    this.showStatus('Freeing ComfyUI VRAM...');
    try {
      const res = await fetch('/api/comfy/free', { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        this.showStatus('ComfyUI memory freed');
      } else {
        this.showStatus(data.detail || 'Failed to free ComfyUI', true);
      }
    } catch (e) {
      console.error(e);
      this.showStatus(`Error: ${e.message}`, true);
    } finally {
      this.actionPending = false;
    }
  }

  render() {
    return html`
      <div class="server-tab">
        <!-- Status Card (Server status + Metrics) -->
        <server-status-card
          .stats="${this.stats}"
          .status="${this.status}"
          .actionPending="${this.actionPending}"
          @start="${this.handleServerToggle}"
          @stop="${this.handleServerToggle}"
          @restart="${this.handleRestart}"
          @free-comfy="${this.handleFreeComfyUI}"
        >
        </server-status-card>

        <!-- Models Configuration Manager -->
        <models-config-editor
          .models="${this.models}"
          .activeModel="${this.activeModel}"
          .loadingModel="${this.loadingModel}"
          .actionPending="${this.actionPending}"
          .modelsIniText="${this.modelsIniText}"
          .modelsIniLoading="${this.modelsIniLoading}"
          .isServerRunning="${this.status?.server?.status === 'running'}"
          @select-model-change="${this.handleSelectModelChange}"
          @load-model="${(e) => this.handleModelLoad(e.detail.model)}"
          @unload-model="${this.handleModelUnload}"
          @delete-model="${(e) => this.executeDeleteModel(e.detail.filename)}"
          @change="${(e) => this.modelsIniText = e.detail.text}"
          @scan="${this.handleScanAndRegister}"
          @reload="${this.fetchModelsIni}"
          @save="${this.saveModelsIni}"
        >
        </models-config-editor>

        <!-- HF Downloader -->
        <model-downloader
          .hfSearchQuery="${this.hfSearchQuery}"
          .hfSearchLoading="${this.hfSearchLoading}"
          .hfSearchResults="${this.hfSearchResults}"
          .hfSelectedRepo="${this.hfSelectedRepo}"
          .hfRepoDetails="${this.hfRepoDetails}"
          .hfDetailsLoading="${this.hfDetailsLoading}"
          .hfActiveDownloads="${this.hfActiveDownloads}"
          @query-change="${(e) => this.hfSearchQuery = e.detail.query}"
          @search="${this.handleHfSearch}"
          @select-repo="${(e) => this.selectHfRepo(e.detail.repoId)}"
          @download="${(e) => this.triggerHfDownload(e.detail.filename)}"
 @stop-download="${(e) => this.handleStopDownload(e.detail.key)}"
 @resume-download="${(e) => this.handleResumeDownload(e.detail.key)}"
 @cancel-download="${(e) => this.handleCancelDownload(e.detail.key)}"
 @clear-finished="${this._handleClearFinishedDownloads}"
        >
        </model-downloader>

        <!-- Server Logs -->
        <server-logs
          .logsText="${this.logsText}"
          .logContainer="${this.logContainer}"
          .logLimit="${this.logLimit}"
          .logsLoading="${this.logsLoading}"
          @refresh="${this.fetchLogs}"
          @container-change="${(e) => this.switchLogsTab(e.detail.container)}"
          @limit-change="${this.handleLogLimitChange}"
        >
        </server-logs>

        <!-- Status Message Feed -->
        ${this.statusMessage ? html`<div class="status-msg">${this.statusMessage}</div>` : ''}
      </div>
    `;
  }
}

customElements.define('server-tab', ServerTab);