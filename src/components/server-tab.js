import { LitElement, html } from 'lit';
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
