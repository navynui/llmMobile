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
    // Models Config Parameters (primary / models.ini)
    modelsIniText: { type: String },
    modelsIniLoading: { type: Boolean },
    // Mini Model Config Parameters (mini / modelg.ini)
    modelsMini: { type: Array },
    activeModelMini: { type: String },
    loadingModelMini: { type: Boolean },
    modelsMiniIniText: { type: String },
    modelsMiniIniLoading: { type: Boolean },
    // Downloader States
    hfSearchQuery: { type: String },
    hfSearchLoading: { type: Boolean },
    hfSearchResults: { type: Array },
    hfSelectedRepo: { type: String },
    hfRepoDetails: { type: Object },
    hfDetailsLoading: { type: Boolean },
    hfActiveDownloads: { type: Array },
    // Slots (inference activity)
    slotInfo: { type: Array },
    // System Logs States
    logContainer: { type: String },
    logsText: { type: String },
    logsLoading: { type: Boolean },
    logLimit: { type: Number },
  };
  static styles = serverTabStyles;
  constructor() {
    super();
    this.stats = {
      cpu_temp: 0, cpu_util: 0, ram_percent: 0, gpu_temp: 0,
      gpu_util: 0, vram_percent: 0, storage_percent: 0,
      storage_used_gb: 0, storage_total_gb: 0,
    };
    this.status = {
      server: { status: 'stopped', image: null, uptime: null },
      manager: { status: 'running', image: null, uptime: null },
      servers: [
        { name: 'llama-server', container: 'llm-server', label: 'Primary (llama-server)', status: 'stopped', image: null, uptime: null },
        { name: 'llama-server-mini', container: 'llm-server-mini', label: 'Secondary (llama-server-mini)', status: 'stopped', image: null, uptime: null },
      ],
    };
    this.models = [];
    this.activeModel = '';
    this.loadingModel = false;
    this.actionPending = false;
    this.statusMessage = '';
    this.modelsIniText = '';
    this.modelsIniLoading = false;
    // Mini (modelg.ini)
    this.modelsMini = [];
    this.activeModelMini = '';
    this.loadingModelMini = false;
    this.modelsMiniIniText = '';
    this.modelsMiniIniLoading = false;
    // Downloader States
    this.hfSearchQuery = '';
    this.hfSearchLoading = false;
    this.hfSearchResults = [];
    this.hfSelectedRepo = '';
    this.hfRepoDetails = null;
    this.hfDetailsLoading = false;
    this.hfActiveDownloads = [];
    // Slots (inference activity)
    this.slotInfo = [];
    // System Logs States
    this.logContainer = 'llm-server';
    this.logsText = '';
    this.logsLoading = false;
    this.logLimit = 50;
    this.restoreDownloadsFromStorage();
  }
  connectedCallback() {
    super.connectedCallback();
    this.activeModelPoll = setInterval(() => {
      if (this.status?.server?.status === 'running') this.fetchActiveModel();
    }, 4000);
    this.activeModelMiniPoll = setInterval(() => {
      if (this.status?.servers?.[1]?.status === 'running') this.fetchActiveMiniModel();
    }, 4000);
    this.fetchModelsIni();
    this.fetchModelsMiniIni();
    this.startDownloadPolling();
    this.startSlotPolling();
  }
  disconnectedCallback() {
    super.disconnectedCallback();
    if (this.activeModelPoll) { clearInterval(this.activeModelPoll); }
    if (this.activeModelMiniPoll) { clearInterval(this.activeModelMiniPoll); }
    this.stopDownloadPolling();
    this.stopSlotPolling();
  }
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
  async handleServerAction(serverName, action) { return logic.handleServerAction(this, serverName, action); }
  async handleModelLoad(modelName) { return logic.handleModelLoad(this, modelName); }
  async handleModelUnload() { return logic.handleModelUnload(this); }
  async fetchModelsIni() { return logic.fetchModelsIni(this); }
  async saveModelsIni() { return logic.saveModelsIni(this); }
  async handleScanAndRegister() { return logic.handleScanAndRegister(this); }
  async executeDeleteModel(filename) { return logic.executeDeleteModel(this, filename); }
  async handleFreeComfyUI() { return logic.handleFreeComfyUI(this); }
  async handleUnloadKokoro() { return logic.handleUnloadKokoro(this); }
  async handleAppAction(appName, action) { return logic.handleAppAction(this, appName, action); }
  // Mini (modelg.ini) handlers
  async fetchModelsMiniList() { return logic.fetchModelsMiniList(this); }
  async fetchActiveMiniModel() { return logic.fetchActiveMiniModel(this); }
  async handleModelMiniLoad(modelName) { return logic.handleModelMiniLoad(this, modelName); }
  async handleModelMiniUnload() { return logic.handleModelMiniUnload(this); }
  async fetchModelsMiniIni() { return logic.fetchModelsMiniIni(this); }
  async saveModelsMiniIni() { return logic.saveModelsMiniIni(this); }
  async handleScanMiniAndRegister() { return logic.handleScanMiniAndRegister(this); }
  async executeDeleteModelMini(filename) { return logic.executeDeleteModelMini(this, filename); }
  async fetchSlotStatus() {
    try {
      const res = await fetch('/api/servers/slots');
      if (res.ok) {
        this.slotInfo = await res.json();
      }
    } catch (e) {
      console.warn('Failed to poll slot status', e);
    }
  }
  startSlotPolling() {
    this.fetchSlotStatus();
    if (this.slotPollInterval) clearInterval(this.slotPollInterval);
    this.slotPollInterval = setInterval(() => this.fetchSlotStatus(), 2500);
  }
  stopSlotPolling() {
    if (this.slotPollInterval) { clearInterval(this.slotPollInterval); this.slotPollInterval = null; }
  }
  startDownloadPolling() {
    if (this.downloadPollInterval) clearInterval(this.downloadPollInterval);
    this.downloadPollInterval = setInterval(() => this.pollDownloads(), 1500);
  }
  stopDownloadPolling() {
    if (this.downloadPollInterval) { clearInterval(this.downloadPollInterval); this.downloadPollInterval = null; }
  }
  saveDownloadsToStorage() {
    try { const payload = { active: this.hfActiveDownloads, ts: Date.now() }; localStorage.setItem('hf_downloads', JSON.stringify(payload)); } catch (e) { /* silent */ }
  }
  restoreDownloadsFromStorage() {
    try {
      const raw = localStorage.getItem('hf_downloads');
      if (!raw) return;
      const payload = JSON.parse(raw);
      if (!payload || !Array.isArray(payload.active)) return;
      if ((Date.now() - (payload.ts || 0)) / 1000 > 6 * 3600) { localStorage.removeItem('hf_downloads'); return; }
      this.hfActiveDownloads = payload.active;
    } catch (e) { /* silent */ }
  }
  switchLogsTab(container) { this.logContainer = container; this.fetchLogs(); }
  handleLogLimitChange(e) { this.logLimit = e.detail.limit; this.fetchLogs(); }
  _handleVisibilityChange() { if (document.visibilityState === 'visible') this.pollDownloads(); }
  firstUpdated() {
    this.fetchModelsList();
    this.fetchActiveModel();
    this.fetchModelsMiniList();
    this.fetchActiveMiniModel();
    this.pollDownloads();
    this.startDownloadPolling();
  }
  updated(changedProperties) {
    if (changedProperties.has('activeModel')) {
      const oldActive = changedProperties.get('activeModel');
      const newActive = this.activeModel;
      if (newActive && newActive !== oldActive) {
        this.dispatchEvent(new CustomEvent('op-queue-notification', { detail: { message: `🟢 Model Loaded: "${newActive}" is ready for inference!` }, bubbles: true, composed: true }));
      } else if (!newActive && oldActive) {
        this.dispatchEvent(new CustomEvent('op-queue-notification', { detail: { message: '⚪ Model Unloaded: VRAM cleared.' }, bubbles: true, composed: true }));
      }
    }
    if (changedProperties.has('activeModelMini')) {
      const oldMini = changedProperties.get('activeModelMini');
      const newMini = this.activeModelMini;
      if (newMini && newMini !== oldMini) {
        this.dispatchEvent(new CustomEvent('op-queue-notification', { detail: { message: `🟢 Mini Model Loaded: "${newMini}" ready on secondary GPU!` }, bubbles: true, composed: true }));
      } else if (!newMini && oldMini) {
        this.dispatchEvent(new CustomEvent('op-queue-notification', { detail: { message: '⚪ Mini Model Unloaded: secondary GPU VRAM cleared.' }, bubbles: true, composed: true }));
      }
    }
  }
  async handleSelectModelChange(e) {
    const selected = e.detail.model;
    if (selected) await this.handleModelLoad(selected);
  }
  async handleSelectModelChangeMini(e) {
    const selected = e.detail.model;
    if (selected) await this.handleModelMiniLoad(selected);
  }
  showStatus(msg, isError = false) {
    this.statusMessage = msg;
    const msgEl = this.shadowRoot.querySelector('.status-msg');
    if (msgEl) { msgEl.style.color = isError ? 'var(--danger)' : 'var(--success)'; }
    setTimeout(() => { if (this.statusMessage === msg) this.statusMessage = ''; }, 5000);
  }
  async _handleClearFinishedDownloads() {
    try {
      const res = await fetch('/api/models/downloads/clear-finished', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        this.dispatchEvent(new CustomEvent('op-queue-notification', {
          detail: { message: data.detail || 'Cleared finished downloads' },
          bubbles: true, composed: true
        }));
      }
    } catch (err) {
      console.error('Failed to clear finished downloads', err);
    }
    this.pollDownloads();
  }
  render() { return renderServerTab(this); }
}

customElements.define('server-tab', ServerTab);
