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
    iniExpanded: { type: Boolean },

    // Migrated Downloader States
    hfSearchQuery: { type: String },
    hfSearchLoading: { type: Boolean },
    hfSearchResults: { type: Array },
    hfSelectedRepo: { type: String },
    hfRepoDetails: { type: Object },
    hfDetailsLoading: { type: Boolean },
    hfActiveDownloads: { type: Array },
    downloaderExpanded: { type: Boolean },
    logsExpanded: { type: Boolean },

    // Migrated System Logs States
    logContainer: { type: String },
    logsText: { type: String },
    logsLoading: { type: Boolean },
    logLimit: { type: Number }
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
      max-height: none;
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

    .model-file-name {
      font-size: 0.85rem;
      font-weight: 500;
      color: var(--text-primary);
      word-break: break-all;
    }

    .model-file-size {
      font-size: 0.72rem;
      color: var(--text-secondary);
      flex-shrink: 0;
    }

    /* Input group */
    .input-group {
      display: flex;
      gap: 8px;
      width: 100%;
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

    /* Downloads List */
    .downloads-container {
      margin-top: 8px;
    }

    .download-item {
      background: rgba(99, 102, 241, 0.04);
      border: 1px solid rgba(99, 102, 241, 0.2);
      border-radius: var(--radius-md);
      padding: 14px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin-bottom: 10px;
    }

    .download-info {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 0.85rem;
    }

    .download-filename {
      font-weight: 600;
      color: var(--text-primary);
      word-break: break-all;
      flex: 1;
      margin-right: 8px;
    }

    .download-speed {
      color: var(--success);
      font-weight: 500;
      white-space: nowrap;
    }

    .progress-track {
      width: 100%;
      height: 4px;
      background: rgba(255, 255, 255, 0.06);
      border-radius: 2px;
      overflow: hidden;
    }

    .progress-fill {
      height: 100%;
      background: linear-gradient(90deg, var(--primary), #a5b4fc);
      transition: width 0.3s ease-out;
      border-radius: 2px;
    }

    .download-eta {
      font-size: 0.72rem;
      color: var(--text-secondary);
      white-space: nowrap;
    }

    /* System Logs Terminal */
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
    }

    /* Repo list styling */
    .repo-list {
      display: flex;
      flex-direction: column;
      gap: 10px;
      margin-top: 8px;
    }

    .repo-item {
      background: rgba(255, 255, 255, 0.02);
      border: 1px solid var(--border-color);
      border-radius: var(--radius-md);
      padding: 14px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      cursor: pointer;
      transition: var(--transition);
    }

    .repo-item:hover {
      background: rgba(255, 255, 255, 0.04);
      border-color: rgba(99, 102, 241, 0.4);
    }

    /* Left-aligned model file cards (Models Config + Available GGUF)
       Override the shared .repo-item centering rules for these sections */
    .model-file-item {
      display: flex !important;
      align-items: center !important;
      gap: 10px !important;
      justify-content: flex-start !important;
      padding: 12px 14px !important;
    }

    .search-result-item {
      cursor: pointer;
      transition: var(--transition);
    }

    .search-result-item:hover {
      background: rgba(99, 102, 241, 0.06);
      border-color: rgba(99, 102, 241, 0.3);
    }

    .repo-meta {
      display: flex;
      gap: 8px;
      font-size: 0.75rem;
      color: var(--text-secondary);
    }

    .repo-header {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .repo-title {
      font-weight: 600;
      font-size: 0.95rem;
      color: var(--text-primary);
      word-break: break-all;
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
    this.downloaderExpanded = false;
    this.logsExpanded = false;

    // Migrated Downloader states
    this.hfSearchQuery = '';
    this.hfSearchLoading = false;
    this.hfSearchResults = [];
    this.hfSelectedRepo = '';
    this.hfRepoDetails = null;
    this.hfDetailsLoading = false;
    this.hfActiveDownloads = [];

    // Migrated System Logs states
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
    
    // Automatically load migrated configurations on mount
    this.fetchModelsIni();
    // Start download polling
    this.startDownloadPolling();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this.activeModelPoll) {
      clearInterval(this.activeModelPoll);
    }
    this.stopDownloadPolling();
  }

  // --- Migrated Downloader Methods ---
  startDownloadPolling() {
    if (this.downloadPollInterval) clearInterval(this.downloadPollInterval); // ensure only one interval
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
      // Persist to localStorage for survive-refresh
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
      // Only use persisted state if it's recent (less than 6 hours old)
      const payload = JSON.parse(raw);
      if (!payload || !Array.isArray(payload.active)) return;
      const ageSecs = (Date.now() - (payload.ts || 0)) / 1000;
      if (ageSecs > 6 * 3600) {
        // Stale data — clear it
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
        // Sort by downloads descending (highest first)
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

  // --- Migrated System Logs Methods ---
  async fetchLogs() {
    this.logsLoading = true;
    this.logsText = 'Fetching logs...';
    try {
      const res = await fetch(`/api/logs?container_name=${this.logContainer}&lines=${this.logLimit}`);
      if (res.ok) {
        const data = await res.json();
        this.logsText = data.logs || 'No logs found.';
        setTimeout(() => {
          const terminal = this.shadowRoot?.querySelector('.logs-terminal');
          if (terminal) terminal.scrollTop = terminal.scrollHeight;
        }, 100);
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
    this.logLimit = parseInt(e.target.value);
    this.fetchLogs();
  }

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

  toggleDownloader() {
    this.downloaderExpanded = !this.downloaderExpanded;
  }

  toggleLogs() {
    this.logsExpanded = !this.logsExpanded;
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

  async handleRestart() {
    if (!this.status?.server?.status || this.status.server.status !== 'running') return;

    this.actionPending = true;
    this.showStatus('Stopping LLM server...');

    try {
      // Step 1: stop
      const res1 = await fetch('/stop', { method: 'POST' });
      if (!res1.ok) throw new Error('Failed to stop server');
      
      this.showStatus('Starting LLM server...');
      
      // Step 2: start (with 10s cooldown as per AGENTS.md)
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
          <div style="display: grid; gap: 8px; margin-top: 12px;">
            <button 
              class="${isServerRunning ? 'btn-danger' : 'btn-primary'}" 
              @click="${this.handleServerToggle}"
              ?disabled="${this.actionPending}"
              style="width: 100%; justify-content: center; padding: 12px 8px;"
            >
              ${isServerRunning ? 'Stop Server' : 'Start Server'}
            </button>
            <button 
              class="${isServerRunning ? 'btn-secondary' : 'btn-primary'}" 
              @click="${this.handleRestart}"
              ?disabled="${this.actionPending || !isServerRunning}"
              style="width: 100%; justify-content: center; padding: 12px 8px; border-color: rgba(99,102,241,0.3); background: rgba(99,102,241,0.04); color: var(--text-primary);"
            >
              ⟳ Restart Server
            </button>
          </div>
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
                    <div class="model-file-item">
                      <button 
                        class="btn btn-danger" 
                        style="padding: 6px 12px; font-size: 0.8rem; flex-shrink: 0;"
                        @click="${() => this.showDeleteModelConfirm(m.filename)}"
                      >
                        🗑️ Delete
                      </button>
                      <div style="display: flex; flex-direction: column; gap: 4px; text-align: left;">
                        <span class="model-file-name">${m.filename}</span>
                        <div style="display: flex; gap: 6px; align-items: center;">
                          ${m.size ? html`<span class="meta-badge">${m.size}</span>` : ''}
                          ${m.is_default ? html`<span class="meta-badge" style="background: rgba(99,102,241,0.15); color: #a5b4fc; border-color: rgba(99,102,241,0.25);">⭐ Default</span>` : ''}
                        </div>
                      </div>
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

        <!-- HuggingFace Model Downloader Card -->
        <div class="card">
          <div class="switcher-header" @click="${this.toggleDownloader}">
            <div class="card-title" style="margin-bottom: 0;">📦 Hugging Face Model Downloader</div>
            <div class="arrow-icon ${this.downloaderExpanded ? 'arrow-expanded' : ''}">▼</div>
          </div>

          <div class="switcher-body ${this.downloaderExpanded ? 'expanded' : ''}">
            <span class="card-subtitle" style="display: block; font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 12px; line-height: 1.4;">Search and download GGUF models directly from the Hub.</span>

            <!-- Search Bar -->
          <div class="input-group">
            <input 
              type="text" 
              class="text-input" 
              placeholder="Search HuggingFace (e.g., llama.cpp)"
              .value="${this.hfSearchQuery}"
              @input="${e => this.hfSearchQuery = e.target.value}"
              @keydown="${e => e.key === 'Enter' && this.handleHfSearch()}"
            >
            <button 
              class="btn btn-secondary" 
              style="padding: 8px 14px; font-size: 0.85rem;" 
              @click="${() => { this.handleHfSearch(); }}"
              ?disabled="${this.hfSearchLoading}"
            >
              🔍 Search
            </button>
          </div>

          <!-- Loading State -->
          ${this.hfSearchLoading ? html`
            <div style="text-align: center; padding: 30px 0; display: flex; flex-direction: column; align-items: center; gap: 10px;">
              <span class="loader" style="border-top-color: var(--primary);"></span>
              Loading...
            </div>
          ` : ''}

          <!-- Search Results -->
          ${!this.hfSearchLoading && this.hfSearchResults.length > 0 ? html`
            <h3 style="font-size: 0.9rem; margin-bottom: 8px; color: var(--text-primary);">🔎 Search Results</h3>
            <div class="repo-list">
              ${this.hfSearchResults.map(repo => html`
                <div class="search-result-item" @click="${() => this.selectHfRepo(repo.id)}">
                  <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 6px; text-align: left;">
                    <span style="font-size: 0.75rem; color: var(--text-secondary); flex-shrink: 0;">⭐ ${repo.likes || 0}</span>
                    <span style="font-size: 0.75rem; color: var(--text-muted); flex-shrink: 0;">📥 ${repo.downloads || 0}</span>
                  </div>
                  <div class="repo-title">${repo.id}</div>
                </div>
              `)}
            </div>
          ` : ''}

          <!-- Repository Details -->
          ${!this.hfSearchLoading && this.hfSelectedRepo ? html`
            <div style="margin-top: 16px; padding-top: 12px; border-top: 1px solid var(--border-color);">
              <h3 style="font-size: 0.9rem; margin-bottom: 8px; color: #a5b4fc;">📂 Repository: ${this.hfSelectedRepo}</h3>
              
              <!-- Repo Info -->
              <div style="display: flex; gap: 6px; font-size: 0.72rem; margin-bottom: 12px; flex-wrap: wrap;">
                ${this.hfRepoDetails ? html`
                  <span class="meta-badge">📥 ${this.hfRepoDetails.downloads || 0} downloads</span>
                  <span class="meta-badge">⬆️ Last updated: ${this.hfRepoDetails.last_modified || 'N/A'}</span>
                ` : ''}
              </div>

              <!-- Loading for repo details -->
              ${!this.hfSearchLoading && this.hfSelectedRepo && this.hfDetailsLoading ? html`
                <div style="text-align: center; padding: 20px;"><span class="loader" style="border-top-color: var(--primary);"></span> Loading repo files...</div>
              ` : ''}

              <!-- Model Files -->
              ${this.hfRepoDetails && this.hfRepoDetails.gguf_files ? html`
                <h4 style="font-size: 0.8rem; margin-bottom: 6px; color: var(--text-secondary);">Available GGUF Files (sorted by size, largest first):</h4>
                <div class="repo-list">
                  ${this.hfRepoDetails.gguf_files.sort((a, b) => (b.size || 0) - (a.size || 0)).map(file => html`
                    <div class="model-file-item">
                      <button 
                        class="btn btn-primary" 
                        style="padding: 6px 12px; font-size: 0.75rem; white-space: nowrap; flex-shrink: 0;"
                        @click="${() => this.triggerHfDownload(file.filename)}"
                      >
                        ⬇️ Download
                      </button>
                      ${file.size ? html`<span class="model-file-size">⚖️ ${(file.size / (1024 * 1024 * 1024)).toFixed(2)} GB</span>` : ''}
                      <span class="model-file-name">${file.filename}</span>
                    </div>
                  `)}
                </div>
              ` : ''}

              <!-- Active Downloads -->
              ${this.hfActiveDownloads.length > 0 ? html`
                <h4 style="font-size: 0.8rem; margin-top: 16px; color: var(--text-secondary);">📡 Active Downloads:</h4>
                <div class="downloads-container">
                  ${this.hfActiveDownloads.map(d => {
                    const speedMatch = (d.speed || '').match(/([\d.]+)\s*(KB\/s|MB\/s)/);
                    const speedBps = speedMatch ? parseFloat(speedMatch[1]) * (speedMatch[2] === 'KB/s' ? 1024 : 1048576) : 0;
                    const remainingBytes = Math.max(0, d.total - (d.downloaded || 0));
                    let etaSec = null;
                    if (speedBps > 0 && remainingBytes > 0) {
                      etaSec = Math.ceil(remainingBytes / speedBps);
                    }
                    const etaStr = etaSec !== null ? this.formatEta(etaSec) : '';
                    return html`
                      <div class="download-item">
                        <div class="download-info">
                          <span class="download-filename">${d.filename || d.repo_id + '/' + (d.filename || '')}</span>
                          <span class="download-speed" style="color: var(--success);">✓ ${d.status || 'Complete'}</span>
                        </div>
                        <div class="progress-track">
                          <div class="progress-fill" style="width: ${(d.progress * 100).toFixed(1)}%"></div>
                        </div>
                        <div class="download-eta">
                          ${Math.round(d.progress * 100)}% — Speed: ${d.speed || 'N/A'}${etaStr ? ` — ETA: ${etaStr}` : ''}
                        </div>
                        ${d.error ? html`<div style="color: var(--danger); font-size: 0.72rem; margin-top: 2px;">Error: ${d.error}</div>` : ''}
                      </div>
                    `;
                  })}
                </div>
              ` : ''}
            </div>
          ` : ''}
          </div>
        </div>

        <!-- Real-Time System Logs Card -->
        <div class="card">
          <div class="switcher-header" @click="${this.toggleLogs}">
            <div class="card-title" style="margin-bottom: 0;">🖥️ Real-Time System Logs</div>
            <div class="arrow-icon ${this.logsExpanded ? 'arrow-expanded' : ''}">▼</div>
          </div>

          <div class="switcher-body ${this.logsExpanded ? 'expanded' : ''}">
            <span class="card-subtitle" style="display: block; font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 12px; line-height: 1.4;">Inspect outputs, exceptions, or load cycles printed by your chosen container.</span>

            <div style="display: flex; gap: 16px; align-items: center; flex-wrap: wrap; margin-top: 10px;">
            <div class="logs-tabs">
              <button class="logs-tab-btn ${this.logContainer === 'llm-server' ? 'active' : ''}" @click="${() => this.switchLogsTab('llm-server')}">LLM Server</button>
              <button class="logs-tab-btn ${this.logContainer === 'llm-mobile' ? 'active' : ''}" @click="${() => this.switchLogsTab('llm-mobile')}">Manager</button>
            </div>

            <div style="display: flex; gap: 6px; align-items: center; font-size: 0.85rem;">
              <span>Lines:</span>
              <select class="select-input" style="padding: 4px 8px;" .value="${(this.logLimit ?? '').toString()}" @change="${() => this.handleLogLimitChange(event)}">
                <option value="20">20</option>
                <option value="50">50</option>
                <option value="100">100</option>
                <option value="200">200</option>
              </select>
            </div>

            <button 
              class="btn btn-secondary" 
              style="padding: 6px 12px; font-size: 0.8rem;"
              @click="${() => this.fetchLogs()}"
              ?disabled="${this.logsLoading}"
            >
              ${this.logsLoading ? html`<span class="loader"></span>` : '⟳ Refresh Logs'}
            </button>
          </div>

          <div class="logs-terminal">${this.logsText || 'Click refresh to pull container logs...'}</div>
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

  formatEta(seconds) {
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins < 60) return `${mins}m ${secs}s`;
    const hrs = Math.floor(mins / 60);
    const remMins = mins % 60;
    return `${hrs}h ${remMins}m`;
  }
}

customElements.define('server-tab', ServerTab);
