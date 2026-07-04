import os

with open("src/components/server-tab.js", "r") as f:
    content = f.read()

os.makedirs("src/components/server-tab", exist_ok=True)

# 1. _styles.js
styles_code = "import { css } from 'lit';\n\nexport const serverTabStyles = " + content[content.find("css`"):content.find("`;", content.find("css`")) + 2] + "\n"
with open("src/components/server-tab/_styles.js", "w") as f:
    f.write(styles_code)

# 2. _logic.js
logic_code = """
export async function pollDownloads(ctx) {
  try {
    const res = await fetch('/api/models/downloads');
    const data = await res.json();
    ctx.hfActiveDownloads = data.downloads || [];
    ctx.saveDownloadsToStorage();
  } catch (err) {
    console.error("Failed to poll downloads", err);
  }
}

export async function handleHfSearch(ctx) {
  if (!ctx.hfSearchQuery.trim()) return;
  ctx.hfSearchLoading = true;
  ctx.hfSearchResults = [];
  ctx.hfSelectedRepo = '';
  ctx.hfRepoDetails = null;

  try {
    const res = await fetch(`/api/models/search?q=${encodeURIComponent(ctx.hfSearchQuery)}`);
    if (res.ok) {
      const results = await res.json();
      ctx.hfSearchResults = [...results].sort((a, b) => (b.downloads || 0) - (a.downloads || 0));
    } else {
      ctx.dispatchEvent(new CustomEvent('op-queue-notification', {
        detail: { message: 'Failed to search HuggingFace Hub' },
        bubbles: true,
        composed: true
      }));
    }
  } catch (err) {
    console.error(err);
  } finally {
    ctx.hfSearchLoading = false;
  }
}

export async function selectHfRepo(ctx, repoId) {
  ctx.hfSelectedRepo = repoId;
  ctx.hfDetailsLoading = true;
  ctx.hfRepoDetails = null;

  try {
    const res = await fetch(`/api/models/details?repo_id=${encodeURIComponent(repoId)}`);
    if (res.ok) {
      ctx.hfRepoDetails = await res.json();
    } else {
      ctx.dispatchEvent(new CustomEvent('op-queue-notification', {
        detail: { message: 'Failed to fetch repository details' },
        bubbles: true,
        composed: true
      }));
    }
  } catch (err) {
    console.error(err);
  } finally {
    ctx.hfDetailsLoading = false;
  }
}

export async function triggerHfDownload(ctx, filename) {
  try {
    const res = await fetch('/api/models/download', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        repo_id: ctx.hfSelectedRepo,
        filename: filename
      })
    });

    if (res.ok) {
      const data = await res.json();
      ctx.dispatchEvent(new CustomEvent('op-queue-notification', {
        detail: { message: data.detail || 'Download started in background' },
        bubbles: true,
        composed: true
      }));
    } else {
      const errData = await res.json();
      ctx.dispatchEvent(new CustomEvent('op-queue-notification', {
        detail: { message: errData.detail || 'Failed to start download' },
        bubbles: true,
        composed: true
      }));
    }
  } catch (err) {
    console.error(err);
  }
}

export async function handleStopDownload(ctx, key) {
  try {
    const res = await fetch(`/api/models/downloads/${encodeURIComponent(key)}/stop`, { method: 'POST' });
    const data = await res.json();
    ctx.dispatchEvent(new CustomEvent('op-queue-notification', { detail: { message: data.detail || 'Stopped' }, bubbles: true, composed: true }));
    ctx.pollDownloads();
  } catch (err) {
    console.error(err);
    ctx.dispatchEvent(new CustomEvent('op-queue-notification', { detail: { message: 'Failed to stop download' }, bubbles: true, composed: true }));
  }
}

export async function handleResumeDownload(ctx, key) {
  try {
    const res = await fetch(`/api/models/downloads/${encodeURIComponent(key)}/resume`, { method: 'POST' });
    const data = await res.json();
    ctx.dispatchEvent(new CustomEvent('op-queue-notification', { detail: { message: data.detail || 'Resumed' }, bubbles: true, composed: true }));
    ctx.pollDownloads();
  } catch (err) {
    console.error(err);
    ctx.dispatchEvent(new CustomEvent('op-queue-notification', { detail: { message: 'Failed to resume download' }, bubbles: true, composed: true }));
  }
}

export async function handleCancelDownload(ctx, key) {
  try {
    const res = await fetch(`/api/models/downloads/${encodeURIComponent(key)}/cancel`, { method: 'POST' });
    const data = await res.json();
    ctx.dispatchEvent(new CustomEvent('op-queue-notification', { detail: { message: data.detail || 'Cancelled' }, bubbles: true, composed: true }));
    ctx.pollDownloads();
  } catch (err) {
    console.error(err);
    ctx.dispatchEvent(new CustomEvent('op-queue-notification', { detail: { message: 'Failed to cancel download' }, bubbles: true, composed: true }));
  }
}

export async function fetchLogs(ctx) {
  ctx.logsLoading = true;
  ctx.logsText = 'Fetching logs...';
  try {
    const res = await fetch(`/api/logs?container_name=${ctx.logContainer}&lines=${ctx.logLimit}`);
    if (res.ok) {
      const data = await res.json();
      ctx.logsText = data.logs || 'No logs found.';
    } else {
      ctx.logsText = 'Failed to fetch logs.';
    }
  } catch (err) {
    ctx.logsText = `Error: ${err.message}`;
  } finally {
    ctx.logsLoading = false;
  }
}

export async function fetchModelsList(ctx) {
  try {
    const res = await fetch('/models');
    if (res.ok) {
      const data = await res.json();
      ctx.models = data.models || [];
    }
  } catch (e) {
    console.error("Failed to list models", e);
  }
}

export async function fetchActiveModel(ctx) {
  try {
    const res = await fetch('/api/llm/models');
    if (res.ok) {
      const data = await res.json();
      const loadedModel = data.data?.find(m => m.status === 'loaded' || m.status?.value === 'loaded');
      ctx.activeModel = loadedModel ? loadedModel.id : '';
    }
  } catch (e) {
    console.warn("Failed to check loaded models", e);
  }
}

export async function handleServerToggle(ctx) {
  ctx.actionPending = true;
  const isRunning = ctx.status?.server?.status === 'running';
  const endpoint = isRunning ? '/stop' : '/start';
  ctx.showStatus(isRunning ? 'Stopping LLM server...' : 'Starting LLM server...');

  try {
    const res = await fetch(endpoint, { method: 'POST' });
    const data = await res.json();
    ctx.showStatus(data.detail || 'Success!');
    
    if (!isRunning) {
      setTimeout(() => {
        ctx.fetchModelsList();
        ctx.fetchActiveModel();
      }, 3000);
    } else {
      ctx.activeModel = '';
    }
  } catch (e) {
    ctx.showStatus('Error executing request: ' + e.message, true);
  } finally {
    ctx.actionPending = false;
  }
}

export async function handleRestart(ctx) {
  if (!ctx.status?.server?.status || ctx.status.server.status !== 'running') return;

  ctx.actionPending = true;
  ctx.showStatus('Stopping LLM server...');

  try {
    const res1 = await fetch('/stop', { method: 'POST' });
    if (!res1.ok) throw new Error('Failed to stop server');
    
    ctx.showStatus('Starting LLM server...');
    
    await new Promise(r => setTimeout(r, 10000));
    const res2 = await fetch('/start', { method: 'POST' });
    if (!res2.ok) throw new Error('Failed to start server');
    
    ctx.showStatus('Server restarted successfully!');
  } catch (e) {
    ctx.showStatus('Error restarting server: ' + e.message, true);
  } finally {
    ctx.actionPending = false;
  }
}

export async function handleModelLoad(ctx, modelName = '') {
  const targetModel = modelName;
  if (!targetModel) return;

  ctx.actionPending = true;
  ctx.loadingModel = true;
  ctx.showStatus(`Loading model ${targetModel}...`);

  try {
    const res = await fetch('/api/llm/models/load', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: targetModel })
    });
    const data = await res.json();
    if (res.ok) {
      ctx.activeModel = targetModel;
      ctx.showStatus(`Loaded model successfully!`);
    } else {
      ctx.showStatus(`Failed: ${data.detail || 'Unknown error'}`, true);
    }
  } catch (e) {
    ctx.showStatus('Error: ' + e.message, true);
  } finally {
    ctx.actionPending = false;
    ctx.loadingModel = false;
  }
}

export async function handleModelUnload(ctx) {
  if (!ctx.activeModel) return;

  ctx.actionPending = true;
  ctx.showStatus(`Unloading model ${ctx.activeModel}...`);

  try {
    const res = await fetch('/api/llm/models/unload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: ctx.activeModel })
    });
    const data = await res.json();
    if (res.ok) {
      ctx.activeModel = '';
      ctx.showStatus(`Unloaded model successfully!`);
    } else {
      ctx.showStatus(`Failed: ${data.detail || 'Unknown error'}`, true);
    }
  } catch (e) {
    ctx.showStatus('Error: ' + e.message, true);
  } finally {
    ctx.actionPending = false;
  }
}

export async function fetchModelsIni(ctx) {
  ctx.modelsIniLoading = true;
  try {
    const res = await fetch('/api/models_ini');
    if (res.ok) {
      const data = await res.json();
      ctx.modelsIniText = data.content || '';
    }
  } catch (err) {
    console.error(err);
  } finally {
    ctx.modelsIniLoading = false;
  }
}

export async function saveModelsIni(ctx) {
  ctx.modelsIniLoading = true;
  try {
    const res = await fetch('/api/models_ini', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: ctx.modelsIniText })
    });
    if (res.ok) {
      ctx.dispatchEvent(new CustomEvent('op-queue-notification', {
        detail: { message: 'models.ini saved successfully' },
        bubbles: true,
        composed: true
      }));
      ctx.fetchModelsList();
    } else {
      const err = await res.text();
      ctx.dispatchEvent(new CustomEvent('op-queue-notification', {
        detail: { message: `Save failed: ${err}` },
        bubbles: true,
        composed: true
      }));
    }
  } catch (err) {
    console.error(err);
  } finally {
    ctx.modelsIniLoading = false;
  }
}

export async function handleScanAndRegister(ctx) {
  ctx.modelsIniLoading = true;
  try {
    const res = await fetch('/api/models/scan_and_register', { method: 'POST' });
    if (res.ok) {
      const data = await res.json();
      ctx.dispatchEvent(new CustomEvent('op-queue-notification', {
        detail: { message: data.detail || 'Scan complete!' },
        bubbles: true,
        composed: true
      }));
      ctx.fetchModelsList();
      ctx.fetchModelsIni();
    } else {
      const err = await res.text();
      ctx.dispatchEvent(new CustomEvent('op-queue-notification', {
        detail: { message: `Scan failed: ${err}` },
        bubbles: true,
        composed: true
      }));
    }
  } catch (err) {
    console.error(err);
  } finally {
    ctx.modelsIniLoading = false;
  }
}

export async function executeDeleteModel(ctx, filename) {
  if (!filename) return;

  try {
    const res = await fetch(`/models/${encodeURIComponent(filename)}`, {
      method: 'DELETE'
    });
    if (res.ok) {
      const data = await res.json();
      ctx.dispatchEvent(new CustomEvent('op-queue-notification', {
        detail: { message: data.detail || `Deleted ${filename}` },
        bubbles: true,
        composed: true
      }));
      ctx.fetchModelsList();
      ctx.fetchModelsIni();
    } else {
      const err = await res.text();
      ctx.dispatchEvent(new CustomEvent('op-queue-notification', {
        detail: { message: `Delete failed: ${err}` },
        bubbles: true,
        composed: true
      }));
    }
  } catch (err) {
    console.error(err);
  }
}

export async function handleFreeComfyUI(ctx) {
  ctx.actionPending = true;
  ctx.showStatus('Freeing ComfyUI VRAM...');
  try {
    const res = await fetch('/api/comfy/free', { method: 'POST' });
    const data = await res.json();
    if (res.ok) {
      ctx.showStatus('ComfyUI memory freed');
    } else {
      ctx.showStatus(data.detail || 'Failed to free ComfyUI', true);
    }
  } catch (e) {
    console.error(e);
    ctx.showStatus(`Error: ${e.message}`, true);
  } finally {
    ctx.actionPending = false;
  }
}
"""
with open("src/components/server-tab/_logic.js", "w") as f:
    f.write(logic_code)

# 3. _templates.js
templates_code = """import { html } from 'lit';

export function renderServerTab(ctx) {
  return html`
    <div class="server-tab">
      <!-- Status Card (Server status + Metrics) -->
      <server-status-card
        .stats="${ctx.stats}"
        .status="${ctx.status}"
        .actionPending="${ctx.actionPending}"
        @start="${() => ctx.handleServerToggle()}"
        @stop="${() => ctx.handleServerToggle()}"
        @restart="${() => ctx.handleRestart()}"
        @free-comfy="${() => ctx.handleFreeComfyUI()}"
      >
      </server-status-card>

      <!-- Models Configuration Manager -->
      <models-config-editor
        .models="${ctx.models}"
        .activeModel="${ctx.activeModel}"
        .loadingModel="${ctx.loadingModel}"
        .actionPending="${ctx.actionPending}"
        .modelsIniText="${ctx.modelsIniText}"
        .modelsIniLoading="${ctx.modelsIniLoading}"
        .isServerRunning="${ctx.status?.server?.status === 'running'}"
        @select-model-change="${(e) => ctx.handleSelectModelChange(e)}"
        @load-model="${(e) => ctx.handleModelLoad(e.detail.model)}"
        @unload-model="${() => ctx.handleModelUnload()}"
        @delete-model="${(e) => ctx.executeDeleteModel(e.detail.filename)}"
        @change="${(e) => ctx.modelsIniText = e.detail.text}"
        @scan="${() => ctx.handleScanAndRegister()}"
        @reload="${() => ctx.fetchModelsIni()}"
        @save="${() => ctx.saveModelsIni()}"
      >
      </models-config-editor>

      <!-- HF Downloader -->
      <model-downloader
        .hfSearchQuery="${ctx.hfSearchQuery}"
        .hfSearchLoading="${ctx.hfSearchLoading}"
        .hfSearchResults="${ctx.hfSearchResults}"
        .hfSelectedRepo="${ctx.hfSelectedRepo}"
        .hfRepoDetails="${ctx.hfRepoDetails}"
        .hfDetailsLoading="${ctx.hfDetailsLoading}"
        .hfActiveDownloads="${ctx.hfActiveDownloads}"
        @query-change="${(e) => ctx.hfSearchQuery = e.detail.query}"
        @search="${() => ctx.handleHfSearch()}"
        @select-repo="${(e) => ctx.selectHfRepo(e.detail.repoId)}"
        @download="${(e) => ctx.triggerHfDownload(e.detail.filename)}"
        @stop-download="${(e) => ctx.handleStopDownload(e.detail.key)}"
        @resume-download="${(e) => ctx.handleResumeDownload(e.detail.key)}"
        @cancel-download="${(e) => ctx.handleCancelDownload(e.detail.key)}"
        @clear-finished="${() => ctx._handleClearFinishedDownloads()}"
      >
      </model-downloader>

      <!-- Server Logs -->
      <server-logs
        .logsText="${ctx.logsText}"
        .logContainer="${ctx.logContainer}"
        .logLimit="${ctx.logLimit}"
        .logsLoading="${ctx.logsLoading}"
        @refresh="${() => ctx.fetchLogs()}"
        @container-change="${(e) => ctx.switchLogsTab(e.detail.container)}"
        @limit-change="${(e) => ctx.handleLogLimitChange(e)}"
      >
      </server-logs>

      <!-- Status Message Feed -->
      ${ctx.statusMessage ? html`<div class="status-msg">${ctx.statusMessage}</div>` : ''}
    </div>
  `;
}
"""
with open("src/components/server-tab/_templates.js", "w") as f:
    f.write(templates_code)

# 4. server-tab.js (main)
main_code = """import { LitElement, html } from 'lit';
import './server-status-card.js';
import './models-config-editor.js';
import './model-downloader.js';
import './server-logs.js';
import { serverTabStyles } from './server-tab/_styles.js';
import { renderServerTab } from './server-tab/_templates.js';
import * as logic from './server-tab/_logic.js';

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

  static styles = serverTabStyles;

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

  // Bind logic methods to `this` instance
  async pollDownloads() { return logic.pollDownloads(this); }
  async handleHfSearch() { return logic.handleHfSearch(this); }
  async selectHfRepo(repoId) { return logic.selectHfRepo(this, repoId); }
  async triggerHfDownload(filename) { return logic.triggerHfDownload(this, filename); }
  async handleStopDownload(key) { return logic.handleStopDownload(this, key); }
  async handleResumeDownload(key) { return logic.handleResumeDownload(this, key); }
  async handleCancelDownload(key) { return logic.handleCancelDownload(this, key); }
  async fetchLogs() { return logic.fetchLogs(this); }
  async fetchModelsList() { return logic.fetchModelsList(this); }
  async fetchActiveModel() { return logic.fetchActiveModel(this); }
  async handleServerToggle() { return logic.handleServerToggle(this); }
  async handleRestart() { return logic.handleRestart(this); }
  async handleModelLoad(modelName) { return logic.handleModelLoad(this, modelName); }
  async handleModelUnload() { return logic.handleModelUnload(this); }
  async fetchModelsIni() { return logic.fetchModelsIni(this); }
  async saveModelsIni() { return logic.saveModelsIni(this); }
  async handleScanAndRegister() { return logic.handleScanAndRegister(this); }
  async executeDeleteModel(filename) { return logic.executeDeleteModel(this, filename); }
  async handleFreeComfyUI() { return logic.handleFreeComfyUI(this); }

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

  async handleSelectModelChange(e) {
    const selected = e.detail.model;
    if (selected) {
      await this.handleModelLoad(selected);
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

  async _handleClearFinishedDownloads() {
      // Stub or dispatch event, there's no native clear finished downloads in logic, 
      // original code had a refreshDownloads stub or polled.
      this.dispatchEvent(new CustomEvent('clear-finished'));
      this.pollDownloads();
  }

  render() {
    return renderServerTab(this);
  }
}

customElements.define('server-tab', ServerTab);
"""
with open("src/components/server-tab.js", "w") as f:
    f.write(main_code)
