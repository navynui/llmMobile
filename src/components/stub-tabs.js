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
    showAllBenchmarks: { type: Boolean },
    benchmarkProgress: { type: Object },
    activeModelId: { type: String },
    selectedJudgeModelId: { type: String },
    benchmarkQueue: { type: Array },

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

    // Models config state
    modelsIniText: { type: String },
    modelsIniLoading: { type: Boolean },
    localModels: { type: Array },
    localModelsLoading: { type: Boolean },
    modelToDelete: { type: String },
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
    this.showAllBenchmarks = false;
    this.benchmarkProgress = {
      running: false,
      model_id: '',
      current_round: '',
      rounds_completed: 0,
      total_rounds: 5,
      logs: []
    };
    this.activeModelId = '';
    this.selectedJudgeModelId = '';
    this.benchmarkQueue = [];
    this.benchmarkPollInterval = null;

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

    // Models config
    this.modelsIniText = '';
    this.modelsIniLoading = false;
    this.localModels = [];
    this.localModelsLoading = false;
    this.modelToDelete = null;
  }

  connectedCallback() {
    super.connectedCallback();
    this.startDownloadPolling();
    this.fetchBenchmarks();
    this.fetchServerStatus();
    this.fetchLocalModels();
    this.fetchModelsIni();
    this.fetchActiveModelId();
    this.startBenchmarkPolling();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.stopDownloadPolling();
    this.stopBenchmarkPolling();
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
      const res = await fetch(`/api/benchmarks?show_all=${this.showAllBenchmarks}`);
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

  startBenchmarkPolling() {
    if (this.benchmarkPollInterval) return;
    this.fetchBenchmarkStatus();
    this.benchmarkPollInterval = setInterval(() => this.fetchBenchmarkStatus(), 1500);
  }

  stopBenchmarkPolling() {
    if (this.benchmarkPollInterval) {
      clearInterval(this.benchmarkPollInterval);
      this.benchmarkPollInterval = null;
    }
  }

  async fetchBenchmarkStatus() {
    try {
      const res = await fetch('/api/benchmarks/status');
      if (res.ok) {
        const data = await res.json();
        const wasRunning = this.benchmarkProgress && this.benchmarkProgress.running;
        this.benchmarkProgress = data;
        
        if (wasRunning && !data.running) {
          this.fetchBenchmarks();
          this.fetchLocalModels();
        }
      }
    } catch (err) {
      console.error("Failed to fetch benchmark status:", err);
    }
  }

  async fetchActiveModelId() {
    try {
      const res = await fetch('/api/llm/models');
      if (res.ok) {
        const data = await res.json();
        const loadedModel = data.data?.find(m => m.status === 'loaded' || m.status?.value === 'loaded');
        this.activeModelId = loadedModel ? loadedModel.id : '';
        if (this.activeModelId && !this.selectedJudgeModelId) {
          this.selectedJudgeModelId = this.activeModelId;
        }
      }
    } catch (err) {
      console.warn("Failed to check active model:", err);
    }
  }

  async runBenchmark() {
    if (this.benchmarkProgress && this.benchmarkProgress.running) {
      alert("A benchmark is already in progress!");
      return;
    }
    if (!this.activeModelId) {
      alert("No active model loaded. Please load a model in the Server tab first.");
      return;
    }
    
    try {
      const res = await fetch('/api/benchmarks/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          judge_model_id: this.selectedJudgeModelId || this.activeModelId
        })
      });
      const data = await res.json();
      if (res.ok) {
        this.startBenchmarkPolling();
        this.benchmarkProgress = {
          ...this.benchmarkProgress,
          running: true,
          current_round: "Initializing...",
          rounds_completed: 0,
          logs: ["[UI] Benchmark run requested..."]
        };
      } else {
        alert(data.detail || "Failed to start benchmark.");
      }
    } catch (err) {
      console.error("Error triggering benchmark:", err);
      alert("An error occurred while attempting to start the benchmark.");
    }
  }

  async runJudge() {
    if (!this.activeModelId) {
      alert("No active model loaded to act as Judge. Please load a model in the Server tab first.");
      return;
    }
    try {
      const res = await fetch('/api/benchmarks/judge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          judge_model_id: this.selectedJudgeModelId || this.activeModelId
        })
      });
      const data = await res.json();
      if (res.ok) {
        alert("Judge evaluation completed successfully! Data upserted.");
        this.fetchBenchmarks();
      } else {
        alert(data.detail || "Failed to run judge evaluation.");
      }
    } catch (err) {
      console.error("Error running judge evaluation:", err);
      alert("An error occurred while attempting to run the judge evaluation.");
    }
  }

  async runQueueBenchmark() {
    if (this.benchmarkProgress && this.benchmarkProgress.running) {
      alert("A benchmark is already in progress!");
      return;
    }
    if (this.benchmarkQueue.length === 0) {
      alert("Please select at least one model to benchmark.");
      return;
    }
    if (!this.selectedJudgeModelId) {
      alert("Please designate a Judge LLM.");
      return;
    }
    
    try {
      const res = await fetch('/api/benchmarks/queue/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          models: this.benchmarkQueue,
          judge_model_id: this.selectedJudgeModelId
        })
      });
      const data = await res.json();
      if (res.ok) {
        this.startBenchmarkPolling();
        this.benchmarkProgress = {
          ...this.benchmarkProgress,
          running: true,
          queue_running: true,
          queue: [...this.benchmarkQueue],
          queue_completed: [],
          queue_current_index: 0,
          current_round: "Initializing queue...",
          rounds_completed: 0,
          logs: ["[UI] Benchmark queue run requested..."]
        };
        this.benchmarkQueue = [];
      } else {
        alert(data.detail || "Failed to start queue benchmark.");
      }
    } catch (err) {
      console.error("Error triggering queue benchmark:", err);
      alert("An error occurred while attempting to start the queue benchmark.");
    }
  }

  toggleModelInQueue(modelName) {
    const idx = this.benchmarkQueue.indexOf(modelName);
    if (idx === -1) {
      this.benchmarkQueue = [...this.benchmarkQueue, modelName];
    } else {
      this.benchmarkQueue = this.benchmarkQueue.filter(m => m !== modelName);
    }
  }

  toggleAllReadyModelsInQueue(readyModels) {
    const readyNames = readyModels.map(m => m.model);
    const allReadyInQueue = readyNames.every(m => this.benchmarkQueue.includes(m));
    if (allReadyInQueue) {
      this.benchmarkQueue = this.benchmarkQueue.filter(m => !readyNames.includes(m));
    } else {
      const newQueue = [...this.benchmarkQueue];
      readyNames.forEach(m => {
        if (!newQueue.includes(m)) {
          newQueue.push(m);
        }
      });
      this.benchmarkQueue = newQueue;
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

  async fetchLocalModels() {
    this.localModelsLoading = true;
    try {
      const res = await fetch('/models');
      if (res.ok) {
        const data = await res.json();
        this.localModels = data.models || [];
      }
    } catch (err) {
      console.error(err);
    } finally {
      this.localModelsLoading = false;
    }
  }

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
        // Reload local models list since models.ini might have changed
        this.fetchLocalModels();
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
        // Refresh both lists
        this.fetchLocalModels();
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
    const totalRounds = this.benchmarkProgress.total_rounds || 5;
    const completedRounds = this.benchmarkProgress.rounds_completed || 0;
    const progressPercent = Math.min(100, Math.round((completedRounds / totalRounds) * 100));

    return html`
      <div class="sub-view">
        <!-- Live Progress overlay/panel -->
        ${this.benchmarkProgress && this.benchmarkProgress.running ? html`
          <div class="card" style="border-color: var(--primary); box-shadow: 0 0 15px rgba(99, 102, 241, 0.25); background: rgba(99, 102, 241, 0.03);">
            <h3 style="margin-bottom: 6px; color: var(--primary); display: flex; align-items: center; gap: 8px;">
              <span class="loader" style="border-top-color: var(--primary); width: 16px; height: 16px; border-width: 2px;"></span>
              ⚡ ${this.benchmarkProgress.queue_running ? 'Automated Benchmark Queue in Progress...' : 'Benchmarking in Progress...'}
            </h3>
            <span class="card-subtitle" style="margin-bottom: 12px;">
              ${this.benchmarkProgress.queue_running ? html`
                Queue Progress: <strong>${(this.benchmarkProgress.queue_current_index || 0) + 1} / ${this.benchmarkProgress.queue?.length || 0}</strong> models
              ` : html`
                Active Model: <code style="color: var(--text-primary); font-weight: bold; background: rgba(255,255,255,0.05); padding: 2px 6px; border-radius: var(--radius-sm);">${this.benchmarkProgress.model_id || 'Unknown'}</code>
              `}
            </span>

            <!-- Queue Progress List -->
            ${this.benchmarkProgress.queue_running && this.benchmarkProgress.queue ? html`
              <div style="display: flex; flex-direction: column; gap: 6px; margin: 12px 0; background: rgba(0,0,0,0.25); padding: 12px; border-radius: var(--radius-md); border: 1px solid rgba(255,255,255,0.04);">
                <span style="font-size: 0.8rem; font-weight: bold; color: var(--text-secondary); margin-bottom: 4px; display: block;">Queue Status:</span>
                ${this.benchmarkProgress.queue.map((m, idx) => {
                  const isCompleted = this.benchmarkProgress.queue_completed?.includes(m) || idx < (this.benchmarkProgress.queue_current_index || 0);
                  const isCurrent = idx === (this.benchmarkProgress.queue_current_index || 0);
                  return html`
                    <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.78rem; padding: 4px 0; border-bottom: 1px solid rgba(255,255,255,0.01);">
                      <span style="color: ${isCurrent ? 'var(--primary)' : isCompleted ? 'var(--text-secondary)' : '#9ca3af'}; font-weight: ${isCurrent ? 'bold' : 'normal'};">
                        ${idx + 1}. ${m.split('/').pop()}
                      </span>
                      <span>
                        ${isCompleted ? html`<span style="color: var(--success); font-weight: bold;">✅ Completed</span>` :
                          isCurrent ? html`<span class="pulse-glowing" style="color: var(--primary); font-weight: bold; animation: pulse 1.5s infinite;">⚡ Running</span>` :
                          html`<span style="color: var(--text-secondary); font-style: italic;">💤 Pending</span>`}
                      </span>
                    </div>
                  `;
                })}
              </div>
            ` : ''}

            <div style="margin: 12px 0;">
              <div style="display: flex; justify-content: space-between; font-size: 0.8rem; margin-bottom: 6px;">
                <span style="color: var(--text-secondary);">Current Status: <strong style="color: var(--text-primary);">${this.benchmarkProgress.current_round || 'Initializing...'}</strong></span>
                <span style="color: var(--primary); font-weight: bold;">${progressPercent}% (${completedRounds}/${totalRounds})</span>
              </div>
              <div class="progress-track" style="height: 6px; background: rgba(255,255,255,0.05); border-radius: 3px; overflow: hidden;">
                <div class="progress-fill" style="width: ${progressPercent}%; height: 100%; background: linear-gradient(90deg, var(--primary), #a5b4fc); transition: width 0.4s ease; box-shadow: 0 0 8px var(--primary);"></div>
              </div>
            </div>

            <div style="margin-top: 16px;">
              <span style="font-size: 0.8rem; color: var(--text-secondary); font-weight: 600; display: block; margin-bottom: 6px;">Live Runner Logs:</span>
              <div style="font-family: 'Courier New', Courier, monospace; background: #070b19; border: 1px solid rgba(99, 102, 241, 0.2); padding: 12px; border-radius: var(--radius-md); max-height: 160px; overflow-y: auto; color: #34d399; font-size: 0.75rem; line-height: 1.4; scroll-behavior: smooth;" id="benchmark-terminal">
                ${this.benchmarkProgress.logs && this.benchmarkProgress.logs.length > 0 ? 
                  this.benchmarkProgress.logs.map(log => html`<div style="margin-bottom: 3px; border-bottom: 1px solid rgba(255,255,255,0.02); padding-bottom: 2px;">${log}</div>`) :
                  html`<div style="color: var(--text-secondary); font-style: italic;">No execution logs streamed yet...</div>`
                }
              </div>
            </div>
          </div>
          <div style="height: 16px;"></div>
        ` : ''}

        <!-- Interactive Testing Panel -->
        <div class="card" style="margin-bottom: 16px; background: rgba(255, 255, 255, 0.01); border: 1px solid rgba(255, 255, 255, 0.04);">
          <h3 style="font-size: 1rem; margin-bottom: 4px; color: var(--text-primary); display: flex; align-items: center; gap: 8px;">
            🚀 Model Testing & Evaluation
          </h3>
          <span class="card-subtitle" style="margin-bottom: 16px;">Measure GGUF inference speeds across standardized QA evaluation rounds and score using a designated Judge LLM.</span>

          <div style="display: flex; flex-direction: column; gap: 12px; background: rgba(0, 0, 0, 0.15); padding: 14px; border-radius: var(--radius-md); border: 1px solid var(--border-color);">
            <!-- Active Model Status -->
            <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
              <span style="font-size: 0.85rem; font-weight: 500; color: var(--text-secondary);">Currently Loaded Server Model:</span>
              ${this.activeModelId ? html`
                <span class="meta-badge" style="background: rgba(16, 185, 129, 0.1); color: var(--success); font-weight: bold; border: 1px solid rgba(16, 185, 129, 0.2); font-size: 0.8rem; padding: 4px 10px;">
                  🟢 ${this.activeModelId.split('/').pop()}
                </span>
              ` : html`
                <span class="meta-badge" style="background: rgba(239, 68, 68, 0.1); color: var(--danger); font-weight: bold; border: 1px solid rgba(239, 68, 68, 0.2); font-size: 0.8rem; padding: 4px 10px;">
                  🔴 No active model loaded in server
                </span>
              `}
            </div>

            <!-- Judge Selection -->
            <div style="display: flex; flex-direction: column; gap: 6px;">
              <label style="font-size: 0.85rem; font-weight: 600; color: var(--text-secondary);">⚖️ Designate Judge LLM:</label>
              <select 
                class="select-input" 
                style="width: 100%; background: #0c101b; border: 1px solid var(--border-color); font-size: 0.85rem; padding: 8px;"
                .value="${this.selectedJudgeModelId}"
                @change="${e => this.selectedJudgeModelId = e.target.value}"
              >
                ${this.activeModelId ? html`<option value="${this.activeModelId}">(Recommended) Loaded Active Model: ${this.activeModelId.split('/').pop()}</option>` : ''}
                ${this.localModels.filter(m => m.filename !== this.activeModelId).map(m => html`
                  <option value="${m.filename}">${m.filename}</option>
                `)}
                ${!this.activeModelId && this.localModels.length === 0 ? html`<option value="">No local GGUF models available</option>` : ''}
              </select>
              <span style="font-size: 0.72rem; color: var(--text-secondary); font-style: italic;">The Judge LLM is responsible for grading qualitative output from 0-25 per round using golden reference answers.</span>
            </div>

            <!-- Action Triggers -->
            <div style="display: flex; gap: 10px; margin-top: 4px; flex-wrap: wrap;">
              <button 
                class="btn btn-secondary" 
                style="flex: 1; min-width: 150px; background: var(--primary); color: white; border: none; font-size: 0.85rem; padding: 10px 16px;" 
                ?disabled="${!this.activeModelId || (this.benchmarkProgress && this.benchmarkProgress.running)}"
                @click="${this.runBenchmark}"
              >
                🚀 Start 5-Round Benchmark
              </button>
              <button 
                class="btn btn-secondary" 
                style="flex: 1; min-width: 150px; font-size: 0.85rem; padding: 10px 16px; border: 1px solid var(--border-color);" 
                ?disabled="${!this.activeModelId || (this.benchmarkProgress && this.benchmarkProgress.running)}"
                @click="${this.runJudge}"
              >
                ⚖️ Re-Grade Latest Run
              </button>
            </div>

            <!-- Frontend Queue Control -->
            ${this.benchmarkQueue.length > 0 ? html`
              <div style="background: rgba(99,102,241,0.05); padding: 12px; border-radius: var(--radius-md); border: 1px solid rgba(99,102,241,0.25); margin-top: 10px; display: flex; flex-direction: column; gap: 8px;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                  <span style="font-size: 0.82rem; font-weight: 600; color: #a5b4fc;">📋 Selected Queue (${this.benchmarkQueue.length} models):</span>
                  <button class="btn btn-secondary" style="padding: 2px 8px; font-size: 0.72rem; border-color: rgba(239,68,68,0.2); color: #ef4444; background: transparent;" @click="${() => this.benchmarkQueue = []}">Clear</button>
                </div>
                <div style="display: flex; flex-wrap: wrap; gap: 6px; font-size: 0.75rem; color: var(--text-secondary); max-height: 80px; overflow-y: auto;">
                  ${this.benchmarkQueue.map(qm => html`
                    <span class="meta-badge" style="background: rgba(255,255,255,0.05); padding: 2px 6px;">${qm.split('/').pop()}</span>
                  `)}
                </div>
                <button 
                  class="btn" 
                  style="width: 100%; background: linear-gradient(135deg, var(--primary), #4f46e5); color: white; border: none; font-size: 0.85rem; padding: 10px 16px; font-weight: bold; box-shadow: 0 0 10px rgba(99, 102, 241, 0.4);" 
                  ?disabled="${this.benchmarkProgress && this.benchmarkProgress.running}"
                  @click="${this.runQueueBenchmark}"
                >
                  🚀 Run Automated Queue Benchmark
                </button>
              </div>
            ` : ''}
          </div>
        </div>

        <!-- Strict Quality Filter Switch -->
        <div style="display: flex; justify-content: space-between; align-items: center; background: rgba(255, 255, 255, 0.01); border: 1px solid rgba(255, 255, 255, 0.04); padding: 12px 16px; border-radius: var(--radius-md); margin-bottom: 16px; gap: 16px;">
          <div style="display: flex; flex-direction: column; gap: 4px; flex: 1;">
            <span style="font-weight: 600; font-size: 0.85rem; color: var(--text-primary); display: flex; align-items: center; gap: 6px;">
              🛡️ Strict Quality Filters
            </span>
            <span style="font-size: 0.72rem; color: var(--text-secondary); line-height: 1.3;">
              Only display high-quality models (speed &ge; 20 t/s, zero hallucinations, score &ge; 50). Toggle off to list all tested models.
            </span>
          </div>
          <label class="switch">
            <input 
              type="checkbox" 
              ?checked="${!this.showAllBenchmarks}" 
              @change="${() => { this.showAllBenchmarks = !this.showAllBenchmarks; this.fetchBenchmarks(); }}"
            >
            <span class="slider"></span>
          </label>
        </div>

        <!-- Ranking Scores Table Card -->
        <div class="card">
          <div class="benchmarks-header">
            <h2>🏆 LLM Benchmark Scores & Rankings</h2>
            <button class="btn btn-secondary" style="padding: 6px 12px; font-size: 0.8rem;" @click="${() => { this.fetchBenchmarks(); this.fetchActiveModelId(); }}">⟳ Refresh</button>
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
                  <th style="width: 40px; text-align: center;">
                    <input 
                      type="checkbox" 
                      .checked="${list.filter(b => b.is_ready).length > 0 && list.filter(b => b.is_ready).every(b => this.benchmarkQueue.includes(b.model))}"
                      @change="${() => this.toggleAllReadyModelsInQueue(list.filter(b => b.is_ready))}"
                    >
                  </th>
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
                    <td colspan="6" style="text-align: center; padding: 30px;">
                      <span class="loader" style="border-top-color: var(--primary);"></span> Loading benchmarking scores...
                    </td>
                  </tr>
                ` : list.length === 0 ? html`
                  <tr>
                    <td colspan="6" style="text-align: center; padding: 30px; color: var(--text-secondary);">
                      No benchmark matches your criteria.
                    </td>
                  </tr>
                ` : list.map(b => {
                  const isJudge = this.selectedJudgeModelId === b.model || (this.activeModelId === b.model && !this.selectedJudgeModelId);
                  const inQueue = this.benchmarkQueue.includes(b.model);
                  
                  return html`
                    <tr class="${inQueue ? 'row-queued' : ''}" style="${inQueue ? 'background: rgba(99,102,241,0.04);' : ''}">
                      <td style="text-align: center;">
                        ${b.is_ready ? html`
                          <input 
                            type="checkbox" 
                            .checked="${inQueue}"
                            @change="${() => this.toggleModelInQueue(b.model)}"
                          >
                        ` : html`
                          <span style="font-size: 0.8rem; opacity: 0.3;" title="File not found or not in models.ini">❌</span>
                        `}
                      </td>
                      <td class="td-model">
                        <div style="display: flex; flex-direction: column; gap: 2px;">
                          <span style="word-break: break-all;">${b.model}</span>
                          <div style="display: flex; gap: 4px; flex-wrap: wrap; margin-top: 2px;">
                            ${isJudge ? html`<span class="meta-badge" style="background: rgba(99, 102, 241, 0.15); color: #a5b4fc; border: 1px solid rgba(99, 102, 241, 0.3); font-size: 0.65rem; padding: 1px 4px;">⚖️ Judge</span>` : ''}
                            ${b.is_tested ? html`<span class="meta-badge" style="background: rgba(16, 185, 129, 0.1); color: #34d399; font-size: 0.65rem; padding: 1px 4px;">Tested</span>` : ''}
                          </div>
                        </div>
                      </td>
                      <td class="td-plat">
                        ${b.is_ready ? html`
                          <span class="meta-badge" style="background: rgba(16, 185, 129, 0.1); color: var(--success); font-weight: bold; border: 1px solid rgba(16, 185, 129, 0.2); font-size: 0.72rem; padding: 2px 6px;">
                            Ready
                          </span>
                        ` : html`
                          <span style="color: var(--text-secondary); font-size: 0.8rem;">${b.platform}</span>
                        `}
                      </td>
                      <td><span class="meta-badge">${b.quant}</span></td>
                      <td class="td-speed">${b.tokens_sec !== null ? `${b.tokens_sec} t/s` : html`<span style="color: var(--text-secondary); font-style: italic;">Pending</span>`}</td>
                      <td class="td-score">${b.score !== null ? b.score : html`<span style="color: var(--text-secondary); font-style: italic;">Pending</span>`}</td>
                    </tr>
                  `;
                })}
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

        <!-- Models Configuration & GGUF Manager -->
        <div class="card">
          <h2>📁 Models Config</h2>
          <span class="card-subtitle">Inspect, edit, save, and reload your model configurations (<code>models.ini</code>), or delete unused GGUF files.</span>

          <!-- GGUF File Manager -->
          <div style="margin-top: 4px;">
            <h3 style="font-size: 0.9rem; margin-bottom: 12px; color: var(--text-primary); display: flex; align-items: center; gap: 6px;">
              💾 Downloaded GGUF Files on Disk
            </h3>
            ${this.localModelsLoading ? html`
              <div style="display: flex; align-items: center; justify-content: center; padding: 12px;">
                <span class="loader"></span>
              </div>
            ` : ''}
            ${!this.localModelsLoading && this.localModels.length === 0 ? html`
              <p style="font-size: 0.85rem; color: var(--text-secondary); font-style: italic; margin-bottom: 12px; padding: 8px 12px; background: rgba(255,255,255,0.02); border-radius: var(--radius-sm);">
                No downloaded GGUF files found on disk or listed in models.ini.
              </p>
            ` : ''}
            ${!this.localModelsLoading && this.localModels.length > 0 ? html`
              <div class="file-list" style="display: flex; flex-direction: column; gap: 8px; margin-bottom: 16px;">
                ${this.localModels.map(m => html`
                  <div class="repo-item" style="cursor: default; display: flex; flex-direction: row; justify-content: space-between; align-items: center; padding: 10px 14px;">
                    <div style="display: flex; align-items: center; gap: 8px; flex: 1; min-width: 0;">
                      <span style="font-size: 0.85rem; font-weight: 500; word-break: break-all; color: var(--text-primary);">${m.filename}</span>
                      ${m.is_default ? html`<span class="meta-badge" style="background: var(--success-glow); color: var(--success); font-size: 0.7rem; font-weight: 600; border: 1px solid rgba(16, 185, 129, 0.3);">Startup</span>` : ''}
                    </div>
                    <button class="btn btn-secondary" style="padding: 6px; border-radius: 6px; background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.2); color: var(--danger); cursor: pointer;" title="Delete model" @click="${() => this.showDeleteModelConfirm(m.filename)}">
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="3 6 5 3 21 3 21 6"></polyline>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        <line x1="10" y1="11" x2="10" y2="17"></line>
                        <line x1="14" y1="11" x2="14" y2="17"></line>
                      </svg>
                    </button>
                  </div>
                `)}
              </div>
            ` : ''}
          </div>

          <!-- models.ini Editor -->
          <div style="display: flex; flex-direction: column; gap: 8px;">
            <h3 style="font-size: 0.9rem; color: var(--text-primary);">
              📝 Edit models.ini
            </h3>
            <textarea 
              class="text-input" 
              style="font-family: var(--font-mono); font-size: 0.8rem; line-height: 1.5; min-height: 250px; resize: vertical; background: rgba(0, 0, 0, 0.4); border: 1px solid var(--border-color); color: #22c55e; padding: 12px; border-radius: var(--radius-md);" 
              .value="${this.modelsIniText}"
              @input="${e => this.modelsIniText = e.target.value}"
              ?disabled="${this.modelsIniLoading}"
              placeholder="Loading models.ini..."
            ></textarea>
            
            <div style="display: flex; gap: 8px; justify-content: flex-end; margin-top: 4px;">
              <button 
                class="btn btn-secondary" 
                style="padding: 8px 14px; font-size: 0.8rem;" 
                @click="${this.fetchModelsIni}"
                ?disabled="${this.modelsIniLoading}"
              >
                Reload
              </button>
              <button 
                class="btn" 
                style="padding: 8px 14px; font-size: 0.8rem; background: var(--primary);" 
                @click="${this.saveModelsIni}"
                ?disabled="${this.modelsIniLoading}"
              >
                Save Changes
              </button>
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

      <!-- GGUF Model Delete Confirmation Dialog -->
      ${this.modelToDelete ? html`
        <div class="modal-backdrop">
          <div class="modal">
            <h3 class="modal-title">Delete GGUF Model</h3>
            <p class="modal-body">
              Are you sure you want to delete <strong>${this.modelToDelete}</strong>?
              This will permanently delete the GGUF file from disk and automatically remove its configuration block from <code>models.ini</code>.
            </p>
            <div class="modal-actions">
              <button class="btn btn-secondary" @click="${this.closeDeleteModelConfirm}">Cancel</button>
              <button class="btn btn-danger" @click="${this.executeDeleteModel}">
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      ` : ''}
    `;
  }
}

customElements.define('more-tab', MoreTab);
