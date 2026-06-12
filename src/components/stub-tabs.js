import { LitElement, html, css } from 'lit';

export class MoreTab extends LitElement {
  static properties = {
    activeSubTab: { type: String }, // 'downloader', 'benchmarks', 'settings'
    
    // Downloader state
    searchQuery: { type: String },
    searchLoading: { type: Boolean },
    searchResults: { type: Array },
    selectedRepo: { type: String },
    repoDetails: { type: Object },
    detailsLoading: { type: Boolean },
    activeDownloads: { type: Array },
    downloadPollInterval: { type: Object },

    // Benchmarks state
    benchmarks: { type: Array },
    benchmarksLoading: { type: Boolean },
    sortField: { type: String },
    sortAscending: { type: Boolean },
    filterQuery: { type: String },
    platformFilter: { type: String },

    // Settings & Logs state
    serverStatus: { type: String }, // 'running', 'stopped', 'loading'
    managerStatus: { type: String },
    autoLoadModel: { type: Boolean },
    pollingInterval: { type: Number },
    legacyBatch: { type: Boolean },
    logContainer: { type: String }, // 'llm-server', 'llm-mobile'
    logsText: { type: String },
    logsLoading: { type: Boolean },
    logLimit: { type: Number },
    confirmAction: { type: String }, // 'start', 'stop', null
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

    .container {
      max-width: 800px;
      margin: 0 auto;
      display: flex;
      flex-direction: column;
      gap: 20px;
      padding-bottom: 40px;
    }

    /* Sub-tab Pills Navigation */
    .sub-tab-nav {
      display: flex;
      background: rgba(17, 24, 39, 0.6);
      border: 1px solid var(--border-color);
      border-radius: var(--radius-lg);
      padding: 4px;
      gap: 4px;
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
    }

    .sub-tab-btn {
      flex: 1;
      background: transparent;
      border: none;
      color: var(--text-secondary);
      padding: 10px 8px;
      font-size: 0.85rem;
      font-weight: 600;
      border-radius: var(--radius-md);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      transition: var(--transition);
      outline: none;
      -webkit-tap-highlight-color: transparent;
    }

    .sub-tab-btn:active {
      transform: scale(0.97);
    }

    .sub-tab-btn.active {
      background: var(--primary);
      color: #ffffff;
      box-shadow: var(--shadow-md);
    }

    /* View transition animation container */
    .sub-view {
      animation: fadeIn 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    }

    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(8px); }
      to { opacity: 1; transform: translateY(0); }
    }

    /* Cards */
    .card {
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      border-radius: var(--radius-lg);
      padding: 20px;
      box-shadow: var(--shadow-lg);
      display: flex;
      flex-direction: column;
      gap: 16px;
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
    }

    h2 {
      font-family: var(--font-title);
      color: var(--text-primary);
      font-size: 1.1rem;
      margin: 0;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .card-subtitle {
      font-size: 0.85rem;
      color: var(--text-secondary);
      margin-top: -8px;
      line-height: 1.4;
    }

    /* Inputs & Buttons */
    .input-group {
      display: flex;
      gap: 8px;
      width: 100%;
    }

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

    .btn {
      background: var(--primary);
      color: #fff;
      border: none;
      padding: 12px 18px;
      border-radius: var(--radius-md);
      font-weight: 600;
      font-size: 0.9rem;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      transition: var(--transition);
      outline: none;
      -webkit-tap-highlight-color: transparent;
    }

    .btn:hover:not(:disabled) {
      background: var(--primary-hover, #4f46e5);
    }

    .btn:active:not(:disabled) {
      transform: scale(0.97);
    }

    .btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .btn-secondary {
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid var(--border-color);
      color: var(--text-primary);
    }

    .btn-secondary:hover:not(:disabled) {
      background: rgba(255, 255, 255, 0.1);
    }

    .btn-danger {
      background: var(--danger);
    }

    .btn-danger:hover:not(:disabled) {
      background: #b91c1c;
    }

    /* Download/Repo Lists */
    .repo-list, .file-list {
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

    .repo-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 8px;
    }

    .repo-title {
      font-weight: 600;
      font-size: 0.95rem;
      color: var(--text-primary);
      word-break: break-all;
    }

    .repo-meta {
      display: flex;
      gap: 12px;
      font-size: 0.75rem;
      color: var(--text-secondary);
    }

    .meta-badge {
      background: rgba(255, 255, 255, 0.05);
      padding: 2px 6px;
      border-radius: var(--radius-sm);
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
      color: var(--primary);
      font-weight: 500;
      white-space: nowrap;
    }

    .progress-track {
      width: 100%;
      height: 6px;
      background: rgba(255, 255, 255, 0.05);
      border-radius: 3px;
      overflow: hidden;
      position: relative;
    }

    .progress-fill {
      height: 100%;
      background: linear-gradient(90deg, var(--primary), #a5b4fc);
      border-radius: 3px;
      transition: width 0.3s ease;
    }

    .download-details {
      display: flex;
      justify-content: space-between;
      font-size: 0.75rem;
      color: var(--text-secondary);
    }

    /* Benchmarks View */
    .benchmarks-header {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      justify-content: space-between;
      align-items: center;
    }

    .filter-pills {
      display: flex;
      gap: 6px;
      overflow-x: auto;
      padding-bottom: 2px;
      scrollbar-width: none;
    }
    
    .filter-pills::-webkit-scrollbar {
      display: none;
    }

    .pill {
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid var(--border-color);
      color: var(--text-secondary);
      padding: 6px 12px;
      border-radius: 100px;
      font-size: 0.75rem;
      font-weight: 600;
      cursor: pointer;
      white-space: nowrap;
      transition: var(--transition);
      outline: none;
      -webkit-tap-highlight-color: transparent;
    }

    .pill:active {
      transform: scale(0.95);
    }

    .pill.active {
      background: var(--primary-glow);
      color: var(--primary);
      border-color: rgba(99, 102, 241, 0.4);
    }

    .table-wrapper {
      overflow-x: auto;
      border: 1px solid var(--border-color);
      border-radius: var(--radius-md);
      background: rgba(0, 0, 0, 0.1);
    }

    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.85rem;
      text-align: left;
    }

    th {
      background: rgba(17, 24, 39, 0.6);
      padding: 12px 14px;
      font-weight: 600;
      color: var(--text-secondary);
      border-bottom: 1px solid var(--border-color);
      cursor: pointer;
      user-select: none;
      transition: background 0.2s;
    }

    th:hover {
      background: rgba(255, 255, 255, 0.02);
    }

    td {
      padding: 12px 14px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.03);
      color: var(--text-primary);
    }

    tr:last-child td {
      border-bottom: none;
    }

    tr:hover td {
      background: rgba(255, 255, 255, 0.01);
    }

    .td-model {
      font-weight: 500;
      color: var(--text-primary);
    }

    .td-plat {
      color: var(--text-secondary);
      font-size: 0.8rem;
    }

    .td-speed {
      font-weight: 600;
      color: var(--success);
    }

    .td-score {
      font-weight: 600;
      color: var(--primary);
    }

    /* Settings & Logs View */
    .settings-list {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .settings-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 16px;
      padding-bottom: 14px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.04);
    }

    .settings-item:last-child {
      border-bottom: none;
      padding-bottom: 0;
    }

    .settings-info {
      display: flex;
      flex-direction: column;
      gap: 4px;
      flex: 1;
    }

    .settings-label {
      font-weight: 600;
      font-size: 0.95rem;
      color: var(--text-primary);
    }

    .settings-desc {
      font-size: 0.75rem;
      color: var(--text-secondary);
      line-height: 1.3;
    }

    /* Custom Toggles */
    .switch {
      position: relative;
      display: inline-block;
      width: 44px;
      height: 24px;
      flex-shrink: 0;
    }

    .switch input {
      opacity: 0;
      width: 0;
      height: 0;
    }

    .slider {
      position: absolute;
      cursor: pointer;
      top: 0; left: 0; right: 0; bottom: 0;
      background-color: rgba(255, 255, 255, 0.1);
      transition: .3s;
      border-radius: 24px;
      border: 1px solid var(--border-color);
    }

    .slider:before {
      position: absolute;
      content: "";
      height: 16px;
      width: 16px;
      left: 3px;
      bottom: 3px;
      background-color: #fff;
      transition: .3s;
      border-radius: 50%;
    }

    input:checked + .slider {
      background-color: var(--primary);
      border-color: rgba(99, 102, 241, 0.4);
    }

    input:checked + .slider:before {
      transform: translateX(20px);
    }

    /* Dropdowns in Settings */
    .select-input {
      background: rgba(0, 0, 0, 0.3);
      border: 1px solid var(--border-color);
      color: var(--text-primary);
      padding: 8px 12px;
      border-radius: var(--radius-sm);
      outline: none;
      font-size: 0.85rem;
      font-family: var(--font-sans);
    }

    /* Logs Terminal */
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

    /* Confirmation Modal */
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

    @keyframes scaleIn {
      from { transform: scale(0.95); opacity: 0; }
      to { transform: scale(1); opacity: 1; }
    }

    .modal-title {
      font-family: var(--font-title);
      font-size: 1.1rem;
      font-weight: 700;
      margin: 0;
    }

    .modal-body {
      font-size: 0.9rem;
      color: var(--text-secondary);
      line-height: 1.4;
    }

    .modal-actions {
      display: flex;
      justify-content: flex-end;
      gap: 10px;
    }

    /* Utility classes */
    .loader {
      display: inline-block;
      width: 16px;
      height: 16px;
      border: 2px solid rgba(255, 255, 255, 0.2);
      border-radius: 50%;
      border-top-color: #fff;
      animation: spin 0.8s linear infinite;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    .badge-success {
      background: rgba(16, 185, 129, 0.1);
      color: var(--success);
      border: 1px solid rgba(16, 185, 129, 0.2);
      padding: 2px 8px;
      border-radius: 100px;
      font-size: 0.75rem;
      font-weight: 600;
    }

    .badge-error {
      background: rgba(239, 68, 68, 0.1);
      color: var(--danger);
      border: 1px solid rgba(239, 68, 68, 0.2);
      padding: 2px 8px;
      border-radius: 100px;
      font-size: 0.75rem;
      font-weight: 600;
    }

    .status-tag {
      font-size: 0.8rem;
      font-weight: 600;
    }
    .status-running { color: var(--success); }
    .status-stopped { color: var(--text-muted); }
  `;

  constructor() {
    super();
    this.activeSubTab = 'downloader';
    
    // Downloader
    this.searchQuery = '';
    this.searchLoading = false;
    this.searchResults = [];
    this.selectedRepo = '';
    this.repoDetails = null;
    this.detailsLoading = false;
    this.activeDownloads = [];
    this.downloadPollInterval = null;

    // Benchmarks
    this.benchmarks = [];
    this.benchmarksLoading = false;
    this.sortField = 'score';
    this.sortAscending = false;
    this.filterQuery = '';
    this.platformFilter = 'all';

    // Settings & Logs
    this.serverStatus = 'stopped';
    this.managerStatus = 'running';
    this.autoLoadModel = localStorage.getItem('auto_load_model') === 'true';
    this.pollingInterval = parseInt(localStorage.getItem('polling_interval') || '2');
    this.legacyBatch = localStorage.getItem('legacy_batch') === 'true';
    this.logContainer = 'llm-server';
    this.logsText = '';
    this.logsLoading = false;
    this.logLimit = 50;
    this.confirmAction = null;
  }

  connectedCallback() {
    super.connectedCallback();
    this.startDownloadPolling();
    this.fetchBenchmarks();
    this.fetchServerStatus();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.stopDownloadPolling();
  }

  // --- Downloader Logic ---
  startDownloadPolling() {
    this.pollDownloads();
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
      this.activeDownloads = data.downloads || [];
    } catch (err) {
      console.error("Failed to poll downloads", err);
    }
  }

  async handleSearch() {
    if (!this.searchQuery.trim()) return;
    this.searchLoading = true;
    this.searchResults = [];
    this.selectedRepo = '';
    this.repoDetails = null;

    try {
      const res = await fetch(`/api/models/search?q=${encodeURIComponent(this.searchQuery)}`);
      if (res.ok) {
        this.searchResults = await res.json();
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
      this.searchLoading = false;
    }
  }

  async selectRepo(repoId) {
    this.selectedRepo = repoId;
    this.detailsLoading = true;
    this.repoDetails = null;

    try {
      const res = await fetch(`/api/models/details?repo_id=${encodeURIComponent(repoId)}`);
      if (res.ok) {
        this.repoDetails = await res.json();
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
      this.detailsLoading = false;
    }
  }

  async triggerDownload(filename) {
    try {
      const res = await fetch('/api/models/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repo_id: this.selectedRepo,
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
        this.pollDownloads();
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

  // --- Benchmarks Logic ---
  async fetchBenchmarks() {
    this.benchmarksLoading = true;
    try {
      const res = await fetch('/api/benchmarks');
      if (res.ok) {
        const data = await res.json();
        this.benchmarks = data.benchmarks || [];
      }
    } catch (err) {
      console.error(err);
    } finally {
      this.benchmarksLoading = false;
    }
  }

  handleSort(field) {
    if (this.sortField === field) {
      this.sortAscending = !this.sortAscending;
    } else {
      this.sortField = field;
      this.sortAscending = true;
    }
  }

  getFilteredAndSortedBenchmarks() {
    let list = [...this.benchmarks];

    // Filter by query
    if (this.filterQuery.trim()) {
      const q = this.filterQuery.toLowerCase();
      list = list.filter(b => 
        b.model.toLowerCase().includes(q) || 
        b.platform.toLowerCase().includes(q)
      );
    }

    // Filter by platform group
    if (this.platformFilter !== 'all') {
      const p = this.platformFilter.toLowerCase();
      list = list.filter(b => b.platform.toLowerCase().includes(p));
    }

    // Sort
    list.sort((a, b) => {
      let valA = a[this.sortField];
      let valB = b[this.sortField];

      if (typeof valA === 'string') {
        valA = valA.toLowerCase();
        valB = valB.toLowerCase();
      }

      if (valA < valB) return this.sortAscending ? -1 : 1;
      if (valA > valB) return this.sortAscending ? 1 : -1;
      return 0;
    });

    return list;
  }

  // --- Settings & Logs Logic ---
  async fetchServerStatus() {
    try {
      const res = await fetch('/status');
      if (res.ok) {
        const data = await res.json();
        this.serverStatus = data.server?.status || 'stopped';
        this.managerStatus = data.manager?.status || 'running';
      }
    } catch (err) {
      console.error("Failed to fetch server status", err);
    }
  }

  showConfirm(action) {
    this.confirmAction = action;
  }

  closeConfirm() {
    this.confirmAction = null;
  }

  async executeServerAction() {
    const action = this.confirmAction;
    this.closeConfirm();
    if (!action) return;

    this.serverStatus = 'loading';
    try {
      const res = await fetch(`/${action}`, { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        this.dispatchEvent(new CustomEvent('op-queue-notification', {
          detail: { message: data.detail || `Server ${action}ed` },
          bubbles: true,
          composed: true
        }));
      } else {
        const err = await res.text();
        this.dispatchEvent(new CustomEvent('op-queue-notification', {
          detail: { message: `Action failed: ${err}` },
          bubbles: true,
          composed: true
        }));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setTimeout(() => this.fetchServerStatus(), 2000);
    }
  }

  handleToggleSetting(key, currentVal) {
    const newVal = !currentVal;
    if (key === 'autoLoadModel') {
      this.autoLoadModel = newVal;
      localStorage.setItem('auto_load_model', newVal);
    } else if (key === 'legacyBatch') {
      this.legacyBatch = newVal;
      localStorage.setItem('legacy_batch', newVal);
    }
    this.dispatchEvent(new CustomEvent('op-queue-notification', {
      detail: { message: 'Preference saved successfully' },
      bubbles: true,
      composed: true
    }));
  }

  handlePollingChange(e) {
    const val = parseInt(e.target.value);
    this.pollingInterval = val;
    localStorage.setItem('polling_interval', val);
    this.dispatchEvent(new CustomEvent('op-queue-notification', {
      detail: { message: `Polling interval set to ${val}s` },
      bubbles: true,
      composed: true
    }));
  }

  async fetchLogs() {
    this.logsLoading = true;
    this.logsText = 'Fetching logs...';
    try {
      const res = await fetch(`/api/logs?container_name=${this.logContainer}&lines=${this.logLimit}`);
      if (res.ok) {
        const data = await res.json();
        this.logsText = data.logs || 'No logs found.';
        // Auto-scroll the terminal block
        setTimeout(() => {
          const terminal = this.shadowRoot.querySelector('.logs-terminal');
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

  // --- Renders ---
  renderDownloaderView() {
    return html`
      <div class="sub-view">
        ${this.activeDownloads.length > 0 ? html`
          <div class="card" style="border-color: rgba(99, 102, 241, 0.4)">
            <h2>⏳ Active Downloads (${this.activeDownloads.length})</h2>
            <div class="downloads-container">
              ${this.activeDownloads.map(d => html`
                <div class="download-item">
                  <div class="download-info">
                    <span class="download-filename">${d.filename}</span>
                    <span class="download-speed">${d.speed}</span>
                  </div>
                  <div class="progress-track">
                    <div class="progress-fill" style="width: ${d.progress * 100}%"></div>
                  </div>
                  <div class="download-details">
                    <span>${Math.round(d.progress * 100)}% Completed</span>
                    <span>Status: <strong style="text-transform: capitalize;">${d.status}</strong></span>
                  </div>
                  ${d.error ? html`<div class="badge-error" style="margin-top: 4px;">Error: ${d.error}</div>` : ''}
                </div>
              `)}
            </div>
          </div>
          <div style="height: 16px;"></div>
        ` : ''}

        <div class="card">
          <h2>📦 HF Model Downloader</h2>
          <span class="card-subtitle">Search and download optimized GGUF sibling files directly into your local storage.</span>
          
          <div class="input-group">
            <input 
              type="text" 
              class="text-input" 
              placeholder="e.g. Llama-3, Qwen-2, bartowski..."
              .value="${this.searchQuery}"
              @input="${e => this.searchQuery = e.target.value}"
              @keydown="${e => e.key === 'Enter' && this.handleSearch()}"
            >
            <button class="btn" @click="${this.handleSearch}" ?disabled="${this.searchLoading}">
              ${this.searchLoading ? html`<span class="loader"></span>` : 'Search'}
            </button>
          </div>

          ${this.searchResults.length > 0 ? html`
            <div class="repo-list">
              <h3>Search Results:</h3>
              ${this.searchResults.map(r => html`
                <div class="repo-item" @click="${() => this.selectRepo(r.id)}">
                  <div class="repo-header">
                    <span class="repo-title">${r.id}</span>
                    <span class="arrow" style="color: var(--primary);">➔</span>
                  </div>
                  <div class="repo-meta">
                    <span class="meta-badge">Likes: ${r.likes || 0}</span>
                    <span class="meta-badge">Downloads: ${r.downloads || 0}</span>
                  </div>
                </div>
              `)}
            </div>
          ` : ''}

          ${this.detailsLoading ? html`<div style="text-align: center; padding: 20px;"><span class="loader"></span> Loading repo files...</div>` : ''}

          ${this.repoDetails ? html`
            <div class="file-list" style="margin-top: 16px; border-top: 1px solid var(--border-color); padding-top: 16px;">
              <h3 style="margin-bottom: 8px;">Available GGUF Files in ${this.repoDetails.repo_id}:</h3>
              ${this.repoDetails.gguf_files.length === 0 ? html`
                <p style="font-size: 0.85rem; color: var(--text-secondary);">No .gguf sibling files found in this repository.</p>
              ` : this.repoDetails.gguf_files.map(f => html`
                <div class="repo-item" style="cursor: default; display: flex; flex-direction: row; justify-content: space-between; align-items: center;">
                  <div style="flex: 1; margin-right: 12px; display: flex; flex-direction: column; gap: 4px;">
                    <span style="font-size: 0.85rem; font-weight: 500; word-break: break-all;">${f.filename}</span>
                    ${f.size ? html`
                      <span style="font-size: 0.75rem; color: var(--text-secondary); display: flex; align-items: center; gap: 4px;">
                        ⚖️ <span class="meta-badge">${(f.size / (1024 * 1024 * 1024)).toFixed(2)} GB</span>
                      </span>
                    ` : ''}
                  </div>
                  <button class="btn btn-secondary" style="padding: 6px 12px; font-size: 0.8rem;" @click="${() => this.triggerDownload(f.filename)}">
                    Download
                  </button>
                </div>
              `)}
            </div>
          ` : ''}

        </div>
      </div>
    `;
  }

  renderBenchmarksView() {
    const list = this.getFilteredAndSortedBenchmarks();
    return html`
      <div class="sub-view">
        <div class="card">
          <div class="benchmarks-header">
            <h2>📊 LLM Benchmark Scores</h2>
            <button class="btn btn-secondary" style="padding: 6px 12px; font-size: 0.8rem;" @click="${this.fetchBenchmarks}">⟳ Refresh</button>
          </div>
          <span class="card-subtitle">Inference speeds and efficiency scoring across local GGUF models and GPU configurations.</span>

          <div class="input-group">
            <input 
              type="text" 
              class="text-input" 
              placeholder="Search by model or platform..."
              .value="${this.filterQuery}"
              @input="${e => this.filterQuery = e.target.value}"
            >
          </div>

          <div class="filter-pills">
            <button class="pill ${this.platformFilter === 'all' ? 'active' : ''}" @click="${() => this.platformFilter = 'all'}">All Platforms</button>
            <button class="pill ${this.platformFilter === 'tesla' ? 'active' : ''}" @click="${() => this.platformFilter = 'tesla'}">Tesla GPUs</button>
            <button class="pill ${this.platformFilter === 'rtx' ? 'active' : ''}" @click="${() => this.platformFilter = 'rtx'}">RTX GPUs</button>
          </div>

          <div class="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th @click="${() => this.handleSort('model')}">Model ${this.sortField === 'model' ? (this.sortAscending ? '▲' : '▼') : ''}</th>
                  <th @click="${() => this.handleSort('platform')}">Platform ${this.sortField === 'platform' ? (this.sortAscending ? '▲' : '▼') : ''}</th>
                  <th @click="${() => this.handleSort('quant')}">Quant ${this.sortField === 'quant' ? (this.sortAscending ? '▲' : '▼') : ''}</th>
                  <th @click="${() => this.handleSort('tokens_sec')}">Speed ${this.sortField === 'tokens_sec' ? (this.sortAscending ? '▲' : '▼') : ''}</th>
                  <th @click="${() => this.handleSort('score')}">Score ${this.sortField === 'score' ? (this.sortAscending ? '▲' : '▼') : ''}</th>
                </tr>
              </thead>
              <tbody>
                ${this.benchmarksLoading ? html`
                  <tr>
                    <td colspan="5" style="text-align: center; padding: 30px;">
                      <span class="loader" style="border-top-color: var(--primary);"></span> Loading benchmarking scores...
                    </td>
                  </tr>
                ` : list.length === 0 ? html`
                  <tr>
                    <td colspan="5" style="text-align: center; padding: 30px; color: var(--text-secondary);">
                      No benchmark matches your criteria.
                    </td>
                  </tr>
                ` : list.map(b => html`
                  <tr>
                    <td class="td-model">${b.model}</td>
                    <td class="td-plat">${b.platform}</td>
                    <td><span class="meta-badge">${b.quant}</span></td>
                    <td class="td-speed">${b.tokens_sec} t/s</td>
                    <td class="td-score">${b.score}</td>
                  </tr>
                `)}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  }

  renderSettingsView() {
    return html`
      <div class="sub-view">
        <div class="card">
          <h2>⚙️ System Control & Settings</h2>
          <span class="card-subtitle">Manage local backend services and configure frontend behavior.</span>
          
          <div class="settings-list">
            <!-- Server Status & Control -->
            <div class="settings-item">
              <div class="settings-info">
                <span class="settings-label">Local Inference Server</span>
                <span class="settings-desc">Run or terminate the local llama.cpp backend container.</span>
                <div style="margin-top: 4px;">
                  Status: 
                  ${this.serverStatus === 'running' ? html`<span class="badge-success">Running</span>` :
                    this.serverStatus === 'loading' ? html`<span class="loader"></span>` :
                    html`<span class="badge-error">Stopped</span>`}
                </div>
              </div>
              <div class="input-group" style="width: auto; gap: 6px;">
                <button 
                  class="btn btn-secondary" 
                  style="padding: 8px 14px; font-size: 0.8rem;" 
                  ?disabled="${this.serverStatus === 'running' || this.serverStatus === 'loading'}"
                  @click="${() => this.showConfirm('start')}"
                >
                  Start
                </button>
                <button 
                  class="btn btn-danger" 
                  style="padding: 8px 14px; font-size: 0.8rem;" 
                  ?disabled="${this.serverStatus === 'stopped' || this.serverStatus === 'loading'}"
                  @click="${() => this.showConfirm('stop')}"
                >
                  Stop
                </button>
              </div>
            </div>

            <!-- Auto Load -->
            <div class="settings-item">
              <div class="settings-info">
                <span class="settings-label">Auto-Load Model</span>
                <span class="settings-desc">Instantly load your configured default model on startup.</span>
              </div>
              <label class="switch">
                <input type="checkbox" ?checked="${this.autoLoadModel}" @change="${() => this.handleToggleSetting('autoLoadModel', this.autoLoadModel)}">
                <span class="slider"></span>
              </label>
            </div>

            <!-- Polling Interval -->
            <div class="settings-item">
              <div class="settings-info">
                <span class="settings-label">Metrics Polling Interval</span>
                <span class="settings-desc">Specify fallback polling duration when live SSE events drop.</span>
              </div>
              <select class="select-input" .value="${this.pollingInterval.toString()}" @change="${this.handlePollingChange}">
                <option value="1">1 Second (Real-Time)</option>
                <option value="2">2 Seconds (Default)</option>
                <option value="5">5 Seconds (Balanced)</option>
                <option value="10">10 Seconds (Power-Saving)</option>
              </select>
            </div>

            <!-- Legacy Batch Mode Toggle -->
            <div class="settings-item">
              <div class="settings-info">
                <span class="settings-label">Legacy Batch Mode</span>
                <span class="settings-desc">Enable standard old prompt batch workflows in generation panels.</span>
              </div>
              <label class="switch">
                <input type="checkbox" ?checked="${this.legacyBatch}" @change="${() => this.handleToggleSetting('legacyBatch', this.legacyBatch)}">
                <span class="slider"></span>
              </label>
            </div>
          </div>
        </div>

        <div style="height: 16px;"></div>

        <!-- Terminal Logs -->
        <div class="card">
          <div class="logs-header">
            <h2>🖥️ Real-Time System Logs</h2>
            <div class="logs-tabs">
              <button class="logs-tab-btn ${this.logContainer === 'llm-server' ? 'active' : ''}" @click="${() => this.switchLogsTab('llm-server')}">LLM Server</button>
              <button class="logs-tab-btn ${this.logContainer === 'llm-mobile' ? 'active' : ''}" @click="${() => this.switchLogsTab('llm-mobile')}">Manager</button>
            </div>
          </div>
          <span class="card-subtitle">Inspect outputs, exceptions, or load cycles printed by your chosen container.</span>

          <div style="display: flex; gap: 8px; align-items: center; justify-content: space-between;">
            <div style="display: flex; gap: 6px; align-items: center; font-size: 0.8rem;">
              <span>Lines:</span>
              <select class="select-input" style="padding: 4px 8px;" .value="${this.logLimit.toString()}" @change="${this.handleLogLimitChange}">
                <option value="20">20</option>
                <option value="50">50</option>
                <option value="100">100</option>
                <option value="200">200</option>
              </select>
            </div>
            <button class="btn btn-secondary" style="padding: 6px 12px; font-size: 0.8rem;" @click="${this.fetchLogs}" ?disabled="${this.logsLoading}">
              ${this.logsLoading ? html`<span class="loader"></span>` : '⟳ Refresh Logs'}
            </button>
          </div>

          <div class="logs-terminal">${this.logsText || 'Click refresh to pull container logs...'}</div>
        </div>
      </div>
    `;
  }

  render() {
    return html`
      <div class="container">
        <!-- Sub-tab pill selectors -->
        <nav class="sub-tab-nav">
          <button class="sub-tab-btn ${this.activeSubTab === 'downloader' ? 'active' : ''}" @click="${() => this.activeSubTab = 'downloader'}">
            <span>📦 Downloader</span>
          </button>
          <button class="sub-tab-btn ${this.activeSubTab === 'benchmarks' ? 'active' : ''}" @click="${() => this.activeSubTab = 'benchmarks'}">
            <span>📊 Benchmarks</span>
          </button>
          <button class="sub-tab-btn ${this.activeSubTab === 'settings' ? 'active' : ''}" @click="${() => this.activeSubTab = 'settings'}">
            <span>⚙️ Settings</span>
          </button>
        </nav>

        <!-- Sub-views -->
        ${this.activeSubTab === 'downloader' ? this.renderDownloaderView() : ''}
        ${this.activeSubTab === 'benchmarks' ? this.renderBenchmarksView() : ''}
        ${this.activeSubTab === 'settings' ? this.renderSettingsView() : ''}
      </div>

      <!-- Action Confirmation Dialog -->
      ${this.confirmAction ? html`
        <div class="modal-backdrop">
          <div class="modal">
            <h3 class="modal-title">Confirm Action</h3>
            <p class="modal-body">
              Are you sure you want to <strong>${this.confirmAction}</strong> the local llama-server container?
              This will interrupt any active LLM generation processes.
            </p>
            <div class="modal-actions">
              <button class="btn btn-secondary" @click="${this.closeConfirm}">Cancel</button>
              <button class="btn ${this.confirmAction === 'start' ? '' : 'btn-danger'}" @click="${this.executeServerAction}">
                Confirm ${this.confirmAction}
              </button>
            </div>
          </div>
        </div>
      ` : ''}
    `;
  }
}

customElements.define('more-tab', MoreTab);
