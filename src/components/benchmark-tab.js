import { LitElement, html, css } from 'lit';
import { styleMap } from 'lit/directives/style-map.js';
import './benchmark-bubble-chart.js';

export class BenchmarkTab extends LitElement {
  static properties = {
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

    // Benchmark execution logs state
    benchmarkLogsText: { type: String },
    benchmarkLogsLoading: { type: Boolean },
    benchmarkLogLimit: { type: Number },

    // Benchmark details modal
    selectedBenchmarkDetails: { type: Object },
    detailsModalLoading: { type: Boolean },
    showDetailsModal: { type: Boolean },

    // Chart linkage
    highlightedModelId: { type: String },
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

    .input-group {
      display: flex;
      gap: 8px;
      width: 100%;
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

    .meta-badge {
      background: rgba(255, 255, 255, 0.05);
      padding: 2px 6px;
      border-radius: var(--radius-sm);
      font-size: 0.75rem;
    }

    .progress-track {
      width: 100%;
      height: 6px;
      background: rgba(255, 255, 255, 0.05);
      border-radius: 3px;
      overflow: hidden;
    }

    .progress-fill {
      height: 100%;
      background: linear-gradient(90deg, var(--primary), #a5b4fc);
      border-radius: 3px;
      transition: width 0.3s ease;
    }

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

    option {
      background: #0f172a;
      color: #ffffff;
    }

    .logs-terminal {
      background: rgba(99, 102, 241, 0.03);
      border-color: var(--primary-glow);
      color: #a5b4fc;
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

    .modal-large { max-width: 650px !important; max-height: 85vh; }
    .modal-body-scrollable { max-height: calc(85vh - 120px); overflow-y: auto; padding-right: 4px; display: flex; flex-direction: column; gap: 14px; }

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

    .bench-model-row {
      cursor: default;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .bench-model-row.clickable-cell {
      cursor: pointer;
    }

    .bench-model-row:hover .bench-model-name,
    .bench-model-row.clickable-cell:hover .bench-model-name {
      color: var(--primary) !important;
    }

    .sort-indicator {
      opacity: 0.4;
      font-size: 0.7rem;
      margin-left: 2px;
    }

    .bench-chip {
      display: inline-block;
      white-space: nowrap;
    }

    .row-queued {
      background: rgba(99,102,241,0.03);
      border-radius: var(--radius-md);
    }

    .round-card {
      background: rgba(255, 255, 255, 0.02);
      border: 1px solid rgba(255, 255, 255, 0.06);
      border-radius: var(--radius-md);
      padding: 12px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .round-card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid rgba(255, 255, 255, 0.06);
      padding-bottom: 6px;
    }

    .round-card-title {
      font-weight: 600;
      color: #a5b4fc;
      font-size: 0.85rem;
    }

    .round-card-score {
      font-weight: 700;
      color: var(--success);
      font-size: 0.8rem;
      background: rgba(16, 185, 129, 0.1);
      padding: 2px 6px;
      border-radius: var(--radius-sm);
    }

    .round-card-reasoning {
      font-size: 0.8rem;
      color: var(--text-secondary);
      line-height: 1.45;
      background: rgba(0, 0, 0, 0.25);
      padding: 8px 12px;
      border-left: 3px solid var(--primary);
      border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
      margin: 2px 0 0 0;
      white-space: pre-wrap;
    }

    .round-card-meta {
      font-size: 0.72rem;
      color: var(--text-muted);
      display: flex;
      gap: 12px;
    }

    .hallucination-warning-box {
      background: rgba(239, 68, 68, 0.08);
      border: 1px solid rgba(239, 68, 68, 0.2);
      border-radius: var(--radius-md);
      padding: 12px;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .hallucination-warning-title {
      color: #f87171;
      font-weight: 600;
      font-size: 0.82rem;
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .hallucination-warning-desc {
      font-size: 0.78rem;
      color: var(--text-secondary);
      line-height: 1.4;
    }

    .clickable-cell {
      transition: color 0.15s ease;
    }

    .clickable-cell:hover {
      text-decoration: underline;
      color: #a5b4fc !important;
    }

    /* Chart dimming & row highlight */
    .row-highlighted td {
      background: rgba(20, 184, 166, 0.06) !important;
      border-bottom-color: rgba(20, 184, 166, 0.3) !important;
    }

    .row-highlighted {
      animation: rowHighlightPulse 1.5s ease-out;
    }

    @keyframes rowHighlightPulse {
      0%   { background: rgba(20,184,166,0.2); }
      100% { background: rgba(20,184,166,0.06); }
    }
  `;

  constructor() {
    super();
    
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

    // Benchmark execution logs state
    this.benchmarkLogsText = '';
    this.benchmarkLogsLoading = false;
    this.benchmarkLogLimit = 100;

    // Benchmark details modal
    this.selectedBenchmarkDetails = null;
    this.detailsModalLoading = false;
    this.showDetailsModal = false;
  }

  connectedCallback() {
    super.connectedCallback();
    this.fetchBenchmarks();
    this.fetchActiveModelId();
    this.startBenchmarkPolling();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.stopBenchmarkPolling();
  }

  updated(changedProperties) {
    if (changedProperties.has('benchmarkProgress')) {
      const oldLogs = changedProperties.get('benchmarkProgress')?.logs || [];
      const newLogs = this.benchmarkProgress?.logs || [];
      // Auto-scroll the Live Runner Logs when new log entries appear
      if (newLogs.length > oldLogs.length) {
        requestAnimationFrame(() => {
          const terminal = this.shadowRoot.querySelector('#benchmark-terminal');
          if (terminal) terminal.scrollTop = terminal.scrollHeight;
        });
      }
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

    // Filter by query — only model name now (platform filter is separate)
    if (this.filterQuery.trim()) {
      const q = this.filterQuery.toLowerCase();
      list = list.filter(b => 
        b.model.toLowerCase().includes(q) || 
        b.quant?.toLowerCase().includes(q)
      );
    }

    // Sort — only model name is sortable now
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

  getChartBenchmarks() {
    // Only show models that are ready (available in models.ini) on the bubble chart.
    const list = this.getFilteredAndSortedBenchmarks().filter(b => b.is_ready);
    return list;
  }

  // --- Benchmark Execution Logs Logic ---
  async fetchBenchmarkLogs() {
    this.benchmarkLogsLoading = true;
    this.benchmarkLogsText = 'Fetching benchmark logs...';
    try {
      const res = await fetch(`/api/benchmarks/logs?lines=${this.benchmarkLogLimit}`);
      if (res.ok) {
        const data = await res.json();
        this.benchmarkLogsText = data.logs || '';
        // Auto-scroll the terminal block
        setTimeout(() => {
          const terminal = this.shadowRoot?.querySelector('.benchmark-logs-terminal');
          if (terminal) terminal.scrollTop = terminal.scrollHeight;
        }, 100);
      } else {
        this.benchmarkLogsText = 'Failed to fetch benchmark logs.';
      }
    } catch (err) {
      this.benchmarkLogsText = `Error: ${err.message}`;
    } finally {
      this.benchmarkLogsLoading = false;
    }
  }

  handleBenchmarkLogLimitChange(e) {
    this.benchmarkLogLimit = parseInt(e.target.value);
    this.fetchBenchmarkLogs();
  }

  // --- Renders ---
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
                          isCurrent ? html`<span style="color: var(--primary); font-weight: bold; animation: pulse 1.5s infinite;">⚡ Running</span>` :
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
              <div class="progress-track">
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
                ${this.benchmarks.filter(b => b.is_ready && b.model !== this.activeModelId).map(b => html`
                  <option value="${b.model}">${b.model}</option>
                `)}
                ${!this.activeModelId && this.benchmarks.filter(b => b.is_ready).length === 0 ? html`<option value="">No local GGUF models available</option>` : ''}
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
              Only display high-quality models (speed ≥ 20 t/s, zero hallucinations, score ≥ 50). Toggle off to list all tested models.
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

        <!-- VRAM Bubble Chart -->
        <benchmark-bubble-chart
          .benchmarks="${this.getChartBenchmarks()}"
          .highlightedModelId="${this.highlightedModelId}"
          @bubble-click="${(e) => this.handleBubbleClick(e)}"
        ></benchmark-bubble-chart>

        <!-- Ranking Scores Table Card -->
        <div class="card">
          <div class="benchmarks-header">
            <h2>🏆 LLM Benchmark Scores & Rankings</h2>
            <button class="btn btn-secondary" style="padding: 6px 12px; font-size: 0.8rem;" @click="${() => { this.fetchBenchmarks(); this.fetchActiveModelId(); }}">⟳ Refresh</button>
          </div>
          <span class="card-subtitle">Inference speed, quantization, and quality scores for locally tested GGUF models.</span>

          <div class="input-group">
            <input 
              type="text" 
              class="text-input" 
              placeholder="Search by model name..."
              .value="${this.filterQuery}"
              @input="${e => this.filterQuery = e.target.value}"
            >
          </div>

          <div class="filter-pills">
            <button class="pill ${this.platformFilter === 'all' ? 'active' : ''}" @click="${() => this.platformFilter = 'all'}">All GPUs</button>
            <button class="pill ${this.platformFilter === 'tesla' ? 'active' : ''}" @click="${() => this.platformFilter = 'tesla'}">Tesla</button>
            <button class="pill ${this.platformFilter === 'rtx' ? 'active' : ''}" @click="${() => this.platformFilter = 'rtx'}">RTX</button>
          </div>

          <div class="table-wrapper">
            <table style="width: 100%; border-collapse: separate; border-spacing: 0 6px;">
              <thead>
                <tr>
                  <th style="width: 36px; text-align: center; padding: 8px 4px;"></th>
                  <th @click="${() => this.handleSort('model')}" style="text-align: left; padding: 8px 12px 8px 8px;">Model
                    <span class="sort-indicator">${this.sortField === 'model' ? (this.sortAscending ? '▲' : '▼') : ''}</span>
                  </th>

                </tr>
              </thead>
              <tbody>
                ${this.benchmarksLoading ? html`
                  <tr>
                    <td colspan="2" style="text-align: center; padding: 30px;">
                      <span class="loader" style="border-top-color: var(--primary);"></span> Loading benchmarking scores...
                    </td>
                  </tr>
                ` : list.length === 0 ? html`
                  <tr>
                    <td colspan="2" style="text-align: center; padding: 30px; color: var(--text-secondary);">
                      No benchmark matches your criteria.
                    </td>
                  </tr>
                ` : list.map(b => {
                  const isJudge = this.selectedJudgeModelId === b.model || (this.activeModelId === b.model && !this.selectedJudgeModelId);
                  const inQueue = this.benchmarkQueue.includes(b.model);
                  
                  // Score color: low=danger, medium=warning/amber, high=success
                  let scoreColor = 'var(--text-muted)';
                  if (b.score !== null) {
                    if (b.score >= 80) scoreColor = '#34d399';
                    else if (b.score >= 50) scoreColor = '#fbbf24';
                    else scoreColor = '#f87171';
                  }
                  let speedColor = 'var(--text-secondary)';
                  if (b.tokens_sec !== null) {
                    if (b.tokens_sec >= 30) speedColor = '#34d399';
                    else if (b.tokens_sec >= 15) speedColor = '#fbbf24';
                    else speedColor = '#f87171';
                  }

                  const isHighlighted = this.highlightedModelId === b.model_id;
                  return html`
                    <tr
                      data-model-id="${b.model_id}"
                      class="${inQueue ? 'row-queued' : ''}${isHighlighted ? ' row-highlighted' : ''}"
                      style="${inQueue ? 'background: rgba(99,102,241,0.03);' : ''}${isHighlighted && !inQueue ? 'background: rgba(20,184,166,0.06);' : ''}"
                      @mouseenter="${() => this.handleRowHover(b.model_id)}"
                      @mouseleave="${() => this.handleRowLeave()}"
                    >
                      <td style="text-align: center; padding: 8px 4px 8px 8px; vertical-align: middle;">
                        ${b.is_ready ? html`
                          <input 
                            type="checkbox" 
                            .checked="${inQueue}"
                            @change="${() => this.toggleModelInQueue(b.model)}"
                          >
                        ` : html`
                          <span style="font-size: 0.8rem; opacity: 0.3;">❌</span>
                        `}
                      </td>
                      <td style="padding: 12px; vertical-align: middle;">
                        <!-- Model name row -->
                        <div class="bench-model-row clickable-cell" @click="${() => b.is_tested && this.viewBenchmarkDetails(b.model_id)}" style="cursor: ${b.is_tested ? 'pointer' : 'default'}; display: flex; flex-direction: column; gap: 4px;">
                          <!-- Name + status badges -->
                          <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-bottom: 2px;">
                            ${b.is_tested ? html`
                              <span class="bench-model-name" style="color: var(--text-primary); font-weight: 600; font-size: 0.85rem;">${b.model}</span>
                            ` : html`
                              <span style="color: var(--text-muted); font-style: italic; font-size: 0.82rem;">${b.model}</span>
                            `}
                            ${isJudge ? html`<span class="meta-badge" style="background: rgba(99, 102, 241, 0.15); color: #a5b4fc; border: 1px solid rgba(99, 102, 241, 0.3); font-size: 0.6rem; padding: 1px 5px;">⚖️ Judge</span>` : ''}
                            ${b.is_tested ? html`<span class="meta-badge" style="background: rgba(16, 185, 129, 0.1); color: #34d399; font-size: 0.6rem; padding: 1px 5px;">Tested</span>` : ''}
                            ${b.is_ready ? 
                              html`<span class="meta-badge" style="background: rgba(16, 185, 129, 0.1); color: #34d399; font-size: 0.6rem; padding: 1px 5px;">🟢 Ready</span>` : 
                              html`<span class="meta-badge" style="background: rgba(239, 68, 68, 0.1); color: #f87171; font-size: 0.6rem; padding: 1px 5px;">🔴 Offline</span>`
                            }
                          </div>
                          <!-- Quant / Speed / Score chips -->
                          ${b.is_tested ? html`
                            <div style="display: flex; gap: 4px; flex-wrap: wrap; margin-top: 2px;">
                              <span class="bench-chip" style="background: rgba(99,102,241,0.08); color: #a5b4fc; border: 1px solid rgba(99,102,241,0.15); font-size: 0.7rem; padding: 2px 8px; border-radius: var(--radius-sm);">${b.quant}</span>
                              <span class="bench-chip" style="background: rgba(16,185,129,0.08); color: ${speedColor}; border: 1px solid rgba(16,185,129,0.15); font-size: 0.7rem; padding: 2px 8px; border-radius: var(--radius-sm);">⚡ ${b.tokens_sec} t/s</span>
                              <span class="bench-chip" style="background: rgba(251,191,36,0.08); color: ${scoreColor}; border: 1px solid rgba(251,191,36,0.15); font-size: 0.7rem; padding: 2px 8px; border-radius: var(--radius-sm);">★ ${b.score}</span>
                              ${b.vram_gb !== null && b.vram_gb !== undefined ? html`
                                <span class="bench-chip" style="background: rgba(139,92,246,0.08); color: #a78bfa; border: 1px solid rgba(139,92,246,0.15); font-size: 0.7rem; padding: 2px 8px; border-radius: var(--radius-sm);">⚙️ ${b.vram_gb} GB</span>
                              ` : ''}
                            </div>
                          ` : html`
                            <div style="display: flex; gap: 4px; flex-wrap: wrap; margin-top: 2px;">
                              <span class="bench-chip" style="background: rgba(156,163,175,0.08); color: #9ca3af; border: 1px solid rgba(156,163,175,0.12); font-size: 0.7rem; padding: 2px 8px; border-radius: var(--radius-sm);">${b.quant}</span>
                              <span class="bench-chip" style="background: rgba(156,163,175,0.08); color: #9ca3af; border: 1px solid rgba(156,163,175,0.12); font-size: 0.7rem; padding: 2px 8px; border-radius: var(--radius-sm);">—</span>
                              <span class="bench-chip" style="background: rgba(156,163,175,0.08); color: #9ca3af; border: 1px solid rgba(156,163,175,0.12); font-size: 0.7rem; padding: 2px 8px; border-radius: var(--radius-sm);">—</span>
                              ${b.vram_gb !== null && b.vram_gb !== undefined ? html`
                                <span class="bench-chip" style="background: rgba(139,92,246,0.08); color: #a78bfa; border: 1px solid rgba(139,92,246,0.15); font-size: 0.7rem; padding: 2px 8px; border-radius: var(--radius-sm);">⚙️ ${b.vram_gb} GB</span>
                              ` : html`
                                <span class="bench-chip" style="background: rgba(156,163,175,0.08); color: #9ca3af; border: 1px solid rgba(156,163,175,0.12); font-size: 0.7rem; padding: 2px 8px; border-radius: var(--radius-sm);">—</span>
                              `}
                            </div>
                          `}
                        </div>
                      </td>

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

  async viewBenchmarkDetails(modelId) {
    this.showDetailsModal = true;
    this.detailsModalLoading = true;
    this.selectedBenchmarkDetails = null;
    try {
      const response = await fetch(`/api/benchmarks/details?model_id=${encodeURIComponent(modelId)}`);
      if (response.ok) {
        this.selectedBenchmarkDetails = await response.json();
      }
    } catch (e) {
      console.error("Error fetching benchmark details:", e);
    } finally {
      this.detailsModalLoading = false;
    }
  }

  renderDetailsModal() {
    if (!this.showDetailsModal) return '';
    return html`
      <div class="modal-backdrop" @click="${() => this.showDetailsModal = false}">
        <div class="modal modal-large" @click="${e => e.stopPropagation()}">
          <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border-color); padding-bottom: 12px;">
            <h3 class="modal-title" style="color: #a5b4fc; font-size: 1.1rem; margin: 0;">📊 Benchmark Evaluation Report</h3>
            <button class="btn btn-secondary" style="padding: 2px 8px; font-size: 0.8rem; background: transparent; border-color: rgba(255,255,255,0.15); border-radius: var(--radius-sm);" @click="${() => this.showDetailsModal = false}">✕</button>
          </div>
          <div class="modal-body modal-body-scrollable">
            ${this.detailsModalLoading ? html`
              <div style="text-align: center; padding: 30px; display: flex; flex-direction: column; align-items: center; gap: 10px;">
                <span class="loader" style="border-top-color: var(--primary);"></span> Loading details...
              </div>
            ` : !this.selectedBenchmarkDetails ? html`
              <div style="color: #f87171; text-align: center; padding: 20px;">Failed to load report.</div>
            ` : html`
              <div style="display: flex; flex-direction: column; gap: 6px; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 12px;">
                <span style="font-weight: bold; font-size: 1.05rem; color: white; word-break: break-all;">${this.selectedBenchmarkDetails.name}</span>
                <div style="display: flex; gap: 6px; font-size: 0.72rem; flex-wrap: wrap;">
                  <span class="meta-badge" style="background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.08); padding: 2px 6px;">Quant: ${this.selectedBenchmarkDetails.quantization}</span>
                  <span class="meta-badge" style="background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.08); padding: 2px 6px;">Tested: ${this.selectedBenchmarkDetails.timestamp}</span>
                  <span class="meta-badge" style="background: ${this.selectedBenchmarkDetails.status && this.selectedBenchmarkDetails.status.includes('⚠️') ? 'rgba(239,68,68,0.15)' : 'rgba(16,185,129,0.15)'}; color: ${this.selectedBenchmarkDetails.status && this.selectedBenchmarkDetails.status.includes('⚠️') ? '#f87171' : '#34d399'}; border: 1px solid ${this.selectedBenchmarkDetails.status && this.selectedBenchmarkDetails.status.includes('⚠️') ? 'rgba(239,68,68,0.2)' : 'rgba(16,185,129,0.2)'}; padding: 2px 6px;">${this.selectedBenchmarkDetails.status}</span>
                </div>
                ${this.selectedBenchmarkDetails.notes ? html`
                  <div style="font-size: 0.78rem; color: var(--text-secondary); background: rgba(0,0,0,0.15); padding: 8px 12px; border-radius: var(--radius-sm); border-left: 3px solid var(--text-muted); margin-top: 4px;">
                    <strong>Notes:</strong> ${this.selectedBenchmarkDetails.notes}
                  </div>
                ` : ''}
              </div>

              ${this.selectedBenchmarkDetails.hallucinations && this.selectedBenchmarkDetails.hallucinations.length > 0 ? html`
                <div class="hallucination-warning-box">
                  <div class="hallucination-warning-title">🛑 Hallucinations Flagged by Judge</div>
                  ${this.selectedBenchmarkDetails.hallucinations.map(h => html`
                    <div class="hallucination-warning-desc"><strong>${this.formatRoundName(h.round_name)}:</strong> ${h.description}</div>
                  `)}
                </div>
              ` : ''}

              <div style="display: flex; flex-direction: column; gap: 12px;">
                <h4 style="font-size: 0.9rem; margin: 0; color: white;">🏅 Score Breakdown</h4>
                ${this.selectedBenchmarkDetails.rounds && this.selectedBenchmarkDetails.rounds.map(r => html`
                  <div class="round-card">
                    <div class="round-card-header">
                      <span class="round-card-title">${this.formatRoundName(r.round_name)}</span>
                      <span class="round-card-score">${r.score} pts</span>
                    </div>
                    ${r.reasoning ? html`<div class="round-card-reasoning">${r.reasoning}</div>` : ''}
                    <div class="round-card-meta">${r.speed_tps > 0 ? html`<span style="margin-top: 2px;">⚡ Speed: <strong>${r.speed_tps.toFixed(1)} t/s</strong></span>` : ''}</div>
                  </div>
                `)}
              </div>
            `}
          </div>
          <div class="modal-actions" style="border-top: 1px solid var(--border-color); padding-top: 12px; margin-top: 12px;">
            <button class="btn btn-secondary" style="padding: 8px 16px;" @click="${() => this.showDetailsModal = false}">Close</button>
          </div>
        </div>
      </div>
    `;
  }

  formatRoundName(name) {
    if (!name) return '';
    const map = {
      'speed_metric': '⚡ Speed Metric Round',
      'knowledge_qa': '🧠 Round 1: Knowledge QA',
      'technical_reasoning': '💻 Round 2: Technical Reasoning & Domain Knowledge',
      'code_generation': '🛠️ Round 3: Code Generation',
      'abstract_logic': '🧮 Round 4: Abstract Logic & Math',
      'creative_writing': '✍️ Round 5: Creative Writing'
    };
    return map[name.toLowerCase()] || name;
  }

  fetchLocalModels() {
    // Helper to fetch local models - defined but not used in this simplified version
    return Promise.resolve([]);
  }

  handleBubbleClick(e) {
    const modelId = e.detail?.model_id;
    if (!modelId) return;
    this.highlightedModelId = modelId;
    // Scroll the corresponding table row into view.
    requestAnimationFrame(() => {
      const row = this.shadowRoot?.querySelector(
        `tr[data-model-id="${modelId}"]`
      );
      if (row) {
        row.scrollIntoView({ behavior: 'smooth', block: 'center' });
        // Add temporary highlight class.
        row.classList.add('row-highlighted');
        setTimeout(() => row.classList.remove('row-highlighted'), 1500);
      }
    });
  }

  handleRowHover(modelId) {
    this.highlightedModelId = modelId;
  }

  handleRowLeave() {
    // Only clear if no external highlight is set.
    // We don't have a way to know, so just leave it as-is for now.
  }

  render() {
    return html`
      <div class="container">
        ${this.renderBenchmarksView()}
      </div>

      <!-- Benchmark Execution Logs -->
      <div class="card">
        <h2>📋 Benchmark Execution Logs</h2>
        <span class="card-subtitle">Persistent, timestamped log of benchmark runs including errors and stack traces.</span>

        <div style="display: flex; gap: 8px; align-items: center; justify-content: space-between;">
          <div style="display: flex; gap: 6px; align-items: center; font-size: 0.8rem;">
            <span>Lines:</span>
            <select class="select-input" style="padding: 4px 8px;" .value="${(this.benchmarkLogLimit ?? '').toString()}" @change="${this.handleBenchmarkLogLimitChange}">
              <option value="50">50</option>
              <option value="100">100</option>
              <option value="200">200</option>
              <option value="500">500</option>
            </select>
          </div>
          <button class="btn btn-secondary" style="padding: 6px 12px; font-size: 0.8rem;" @click="${this.fetchBenchmarkLogs}" ?disabled="${this.benchmarkLogsLoading}">
            ${this.benchmarkLogsLoading ? html`<span class="loader"></span>` : '⟳ Refresh Logs'}
          </button>
        </div>

        <div class="logs-terminal benchmark-logs-terminal" style="background: rgba(99, 102, 241, 0.03); border-color: var(--primary-glow); color: #a5b4fc; font-family: 'Courier New', Courier, monospace; font-size: 0.75rem; line-height: 1.4; max-height: 300px; overflow-y: auto; white-space: pre-wrap; word-break: break-all;">${this.benchmarkLogsText || 'Click refresh to pull benchmark execution logs...'}</div>
      </div>

      <!-- Benchmark Score Reasoning Modal -->
      ${this.renderDetailsModal()}
    `;
  }
}

customElements.define('benchmark-tab', BenchmarkTab);