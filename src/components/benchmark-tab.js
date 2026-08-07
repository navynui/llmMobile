import { LitElement } from 'lit';
import { styleMap } from 'lit/directives/style-map.js'; // kept for any child components
import './benchmark-bubble-chart.js';

import { benchmarkStyles } from './benchmark-tab/_styles.js';
import * as logic from './benchmark-tab/_logic.js';
import { renderBenchmarksView, renderDetailsModal, renderSweepModal, renderBenchmarkLogs } from './benchmark-tab/_templates.js';

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
    showOfflineModels: { type: Boolean },
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

    // Sweep modal
    showSweepModal: { type: Boolean },
    sweepData: { type: Object },

    // Chart linkage
    highlightedModelId: { type: String },

    // Category & Mode state
    categoryFilter: { type: String },
    executionMode: { type: String },
    runCount: { type: Number },
  };

  static styles = benchmarkStyles;

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
    this.showOfflineModels = false;
    this.selectedBenchmarkServer = 'primary';
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
    this.showSweepModal = false;
    this.sweepData = null;
    this._sweepResultsFetched = false;
    this.benchmarkPollInterval = null;

    // Benchmark execution logs state
    this.benchmarkLogsText = '';
    this.benchmarkLogsLoading = false;
    this.benchmarkLogLimit = 100;

    // Benchmark details modal
    this.selectedBenchmarkDetails = null;
    this.detailsModalLoading = false;
    this.showDetailsModal = false;

    // Chart linkage
    this.highlightedModelId = '';

    // Category & Mode
    this.categoryFilter = 'all';
    this.executionMode = 'full';
    this.runCount = 1;
  }

  connectedCallback() {
    super.connectedCallback();
    logic.fetchBenchmarks(this);
    logic.fetchActiveModelId(this);
    logic.startBenchmarkPolling(this);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    logic.stopBenchmarkPolling(this);
  }

  updated(changedProperties) {
    logic.handleUpdated(this, changedProperties);
  }

  render() {
    return [
      renderBenchmarksView(this),
      renderBenchmarkLogs(this),
      renderDetailsModal(this),
      renderSweepModal(this),
    ];
  }
}

customElements.define('benchmark-tab', BenchmarkTab);
