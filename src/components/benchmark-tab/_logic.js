/**
 * benchmark-tab/_logic.js
 * Pure helper functions for BenchmarkTab — no LitElement dependency.
 * Every function receives `ctx` (the component instance) as its first argument
 * so it can read/write reactive properties and access the shadowRoot.
 */

// --- Benchmarks API helpers ---

export async function fetchBenchmarks(ctx) {
  ctx.benchmarksLoading = true;
  try {
    const res = await fetch(`/api/benchmarks?show_all=${ctx.showAllBenchmarks}`);
    if (res.ok) {
      const data = await res.json();
      ctx.benchmarks = data.benchmarks || [];
    }
  } catch (err) {
    console.error(err);
  } finally {
    ctx.benchmarksLoading = false;
  }
}

export function startBenchmarkPolling(ctx) {
  if (ctx.benchmarkPollInterval) return;
  fetchBenchmarkStatus(ctx);
  ctx.benchmarkPollInterval = setInterval(() => fetchBenchmarkStatus(ctx), 1500);
}

export function stopBenchmarkPolling(ctx) {
  if (ctx.benchmarkPollInterval) {
    clearInterval(ctx.benchmarkPollInterval);
    ctx.benchmarkPollInterval = null;
  }
}

export async function fetchBenchmarkStatus(ctx) {
  try {
    const res = await fetch('/api/benchmarks/status');
    if (res.ok) {
      const data = await res.json();
      const wasRunning = ctx.benchmarkProgress && ctx.benchmarkProgress.running;
      const hadSweepResults = ctx._sweepResultsFetched;
      ctx.benchmarkProgress = data;

      if (wasRunning && !data.running) {
        fetchBenchmarks(ctx);
        fetchLocalModels(ctx);
      }

      // When sweep finishes, show results modal automatically
      if (data.sweep_results && !hadSweepResults) {
        ctx._sweepResultsFetched = true;
        ctx.showSweepModal = true;
      } else if (!data.sweep_results) {
        ctx._sweepResultsFetched = false;
      }
    }
  } catch (err) {
    console.error('Failed to fetch benchmark status:', err);
  }
}

export async function fetchActiveModelId(ctx) {
  try {
    const endpoint = ctx.selectedBenchmarkServer === 'secondary' ? '/api/llm-mini/models' : '/api/llm/models';
    const res = await fetch(endpoint);
    if (res.ok) {
      const data = await res.json();
      const loadedModel = data.data?.find(
        m => m.status === 'loaded' || m.status?.value === 'loaded'
      );
      ctx.activeModelId = loadedModel ? loadedModel.id : '';
      if (ctx.activeModelId && !ctx.selectedJudgeModelId) {
        ctx.selectedJudgeModelId = ctx.activeModelId;
      }
    }
  } catch (err) {
    console.warn('Failed to check active model:', err);
  }
}

export async function runBenchmark(ctx) {
  if (ctx.benchmarkProgress && ctx.benchmarkProgress.running) {
    alert('A benchmark is already in progress!');
    return;
  }
  if (!ctx.activeModelId) {
    alert('No active model loaded. Please load a model in the Server tab first.');
    return;
  }

  try {
    const res = await fetch('/api/benchmarks/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        judge_model_id: ctx.selectedJudgeModelId || ctx.activeModelId,
        server: ctx.selectedBenchmarkServer || 'primary',
        execution_mode: ctx.executionMode || 'full',
        run_count: ctx.runCount || 1
      })
    });
    const data = await res.json();
    if (res.ok) {
      startBenchmarkPolling(ctx);
      ctx.benchmarkProgress = {
        ...ctx.benchmarkProgress,
        running: true,
        current_round: 'Initializing...',
        rounds_completed: 0,
        logs: ['[UI] Benchmark run requested...']
      };
    } else {
      alert(data.detail || 'Failed to start benchmark.');
    }
  } catch (err) {
    console.error('Error triggering benchmark:', err);
    alert('An error occurred while attempting to start the benchmark.');
  }
}

export async function runJudge(ctx) {
  if (!ctx.activeModelId) {
    alert('No active model loaded to act as Judge. Please load a model in the Server tab first.');
    return;
  }
  try {
    const res = await fetch('/api/benchmarks/judge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ judge_model_id: ctx.selectedJudgeModelId || ctx.activeModelId })
    });
    const data = await res.json();
    if (res.ok) {
      alert('Judge evaluation completed successfully! Data upserted.');
      fetchBenchmarks(ctx);
    } else {
      alert(data.detail || 'Failed to run judge evaluation.');
    }
  } catch (err) {
    console.error('Error running judge evaluation:', err);
    alert('An error occurred while attempting to run the judge evaluation.');
  }
}

export async function runQueueBenchmark(ctx) {
  if (ctx.benchmarkProgress && ctx.benchmarkProgress.running) {
    alert('A benchmark is already in progress!');
    return;
  }
  if (ctx.benchmarkQueue.length === 0) {
    alert('Please select at least one model to benchmark.');
    return;
  }
    const effectiveJudge = (ctx.selectedJudgeModelId || '').trim();
    if (!effectiveJudge) {
    alert('Please designate a Judge LLM.');
    return;
  }

  try {
    const res = await fetch('/api/benchmarks/queue/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        models: ctx.benchmarkQueue,
        judge_model_id: ctx.selectedJudgeModelId,
        server: ctx.selectedBenchmarkServer || 'primary',
        execution_mode: ctx.executionMode || 'full',
        run_count: ctx.runCount || 1
      })
    });
    const data = await res.json();
    if (res.ok) {
      startBenchmarkPolling(ctx);
      ctx.benchmarkProgress = {
        ...ctx.benchmarkProgress,
        running: true,
        queue_running: true,
        queue: [...ctx.benchmarkQueue],
        queue_completed: [],
        queue_current_index: 0,
        current_round: 'Initializing queue...',
        rounds_completed: 0,
        logs: ['[UI] Benchmark queue run requested...']
      };
      ctx.benchmarkQueue = [];
    } else {
      alert(data.detail || 'Failed to start queue benchmark.');
    }
  } catch (err) {
    console.error('Error triggering queue benchmark:', err);
    alert('An error occurred while attempting to start the queue benchmark.');
  }
}

export async function runTemperatureSweep(ctx) {
  if (ctx.benchmarkProgress && ctx.benchmarkProgress.running) {
    alert('A benchmark is already in progress!');
    return;
  }
  if (!ctx.activeModelId) {
    alert('No active model loaded. Please load a model in the Server tab first.');
    return;
  }
  try {
    const res = await fetch('/api/benchmarks/temperature-sweep', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        judge_model_id: ctx.selectedJudgeModelId || ctx.activeModelId,
        server: ctx.selectedBenchmarkServer || 'primary'
      })
    });
    const data = await res.json();
    if (res.ok) {
      startBenchmarkPolling(ctx);
      ctx.benchmarkProgress = {
        ...ctx.benchmarkProgress,
        running: true,
        sweep_running: true,
        sweep_progress: 0,
        sweep_total: 5,
        sweep_current_temp: null,
        sweep_results: null,
        current_round: '🌡️ Temperature Sweep...',
        rounds_completed: 0,
        logs: ['[UI] Temperature sweep requested...']
      };
    } else {
      alert(data.detail || 'Failed to start temperature sweep.');
    }
  } catch (err) {
    console.error('Error triggering temperature sweep:', err);
    alert('An error occurred while starting the temperature sweep.');
  }
}

export function toggleModelInQueue(ctx, modelName) {
  const idx = ctx.benchmarkQueue.indexOf(modelName);
  if (idx === -1) {
    ctx.benchmarkQueue = [...ctx.benchmarkQueue, modelName];
  } else {
    ctx.benchmarkQueue = ctx.benchmarkQueue.filter(m => m !== modelName);
  }
}

export function toggleAllReadyModelsInQueue(ctx, readyModels) {
  const readyNames = readyModels.map(m => m.model);
  const allReadyInQueue = readyNames.every(m => ctx.benchmarkQueue.includes(m));
  if (allReadyInQueue) {
    ctx.benchmarkQueue = ctx.benchmarkQueue.filter(m => !readyNames.includes(m));
  } else {
    const newQueue = [...ctx.benchmarkQueue];
    readyNames.forEach(m => {
      if (!newQueue.includes(m)) newQueue.push(m);
    });
    ctx.benchmarkQueue = newQueue;
  }
}

export function handleSort(ctx, field) {
  if (ctx.sortField === field) {
    ctx.sortAscending = !ctx.sortAscending;
  } else {
    ctx.sortField = field;
    ctx.sortAscending = true;
  }
}

export function getFilteredAndSortedBenchmarks(ctx) {
  let list = [...ctx.benchmarks];

  if (ctx.platformFilter && ctx.platformFilter !== 'all') {
    list = list.filter(b => b.server === ctx.platformFilter);
  }

  if (ctx.categoryFilter && ctx.categoryFilter !== 'all') {
    list = list.filter(b => b.category === ctx.categoryFilter);
  }

  // Hide offline models unless user toggles them on
  if (!ctx.showOfflineModels) {
    list = list.filter(b => b.is_ready === true);
  }

  if (ctx.filterQuery.trim()) {
    const q = ctx.filterQuery.toLowerCase();
    list = list.filter(
      b => b.model.toLowerCase().includes(q) || b.quant?.toLowerCase().includes(q)
    );
  }

  list.sort((a, b) => {
    let valA = a[ctx.sortField];
    let valB = b[ctx.sortField];

    if (typeof valA === 'string') {
      valA = valA.toLowerCase();
      valB = valB.toLowerCase();
    }

    if (valA < valB) return ctx.sortAscending ? -1 : 1;
    if (valA > valB) return ctx.sortAscending ? 1 : -1;
    return 0;
  });

  return list;
}

export function getChartBenchmarks(ctx) {
  return getFilteredAndSortedBenchmarks(ctx).filter(b => b.is_ready);
}

// --- Benchmark Execution Logs ---

export async function fetchBenchmarkLogs(ctx) {
  ctx.benchmarkLogsLoading = true;
  ctx.benchmarkLogsText = 'Fetching benchmark logs...';
  try {
    const res = await fetch(`/api/benchmarks/logs?lines=${ctx.benchmarkLogLimit}`);
    if (res.ok) {
      const data = await res.json();
      ctx.benchmarkLogsText = data.logs || '';
      setTimeout(() => {
        const terminal = ctx.shadowRoot?.querySelector('.benchmark-logs-terminal');
        if (terminal) terminal.scrollTop = terminal.scrollHeight;
      }, 100);
    } else {
      ctx.benchmarkLogsText = 'Failed to fetch benchmark logs.';
    }
  } catch (err) {
    ctx.benchmarkLogsText = `Error: ${err.message}`;
  } finally {
    ctx.benchmarkLogsLoading = false;
  }
}

export function handleBenchmarkLogLimitChange(ctx, e) {
  ctx.benchmarkLogLimit = parseInt(e.target.value);
  fetchBenchmarkLogs(ctx);
}

// --- Benchmark Details Modal ---

export async function viewBenchmarkDetails(ctx, modelId, server) {
  ctx.showDetailsModal = true;
  ctx.detailsModalLoading = true;
  ctx.selectedBenchmarkDetails = null;
  try {
    let url = `/api/benchmarks/details?model_id=${encodeURIComponent(modelId)}`;
    if (server) url += `&server=${encodeURIComponent(server)}`;
    const response = await fetch(url);
    if (response.ok) {
      ctx.selectedBenchmarkDetails = await response.json();
    }
  } catch (e) {
    console.error('Error fetching benchmark details:', e);
  } finally {
    ctx.detailsModalLoading = false;
  }
}

export function formatRoundName(name) {
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

// --- Local Models (used when benchmark completes) ---

export function fetchLocalModels(_ctx) {
  // No-op stub — called after a benchmark run completes to refresh the model list.
  // The server-tab handles its own model state; this exists for forward-compat.
  return Promise.resolve([]);
}

// --- Chart / table interaction ---

export function handleBubbleClick(ctx, e) {
  const modelId = e.detail?.model_id;
  if (!modelId) return;
  ctx.highlightedModelId = modelId;
  requestAnimationFrame(() => {
    const row = ctx.shadowRoot?.querySelector(`tr[data-model-id="${modelId}"]`);
    if (row) {
      row.scrollIntoView({ behavior: 'smooth', block: 'center' });
      row.classList.add('row-highlighted');
      setTimeout(() => row.classList.remove('row-highlighted'), 1500);
    }
  });
}

export function handleRowHover(ctx, modelId) {
  ctx.highlightedModelId = modelId;
}

export function handleRowLeave(_ctx) {
  // Leave highlightedModelId as-is; cleared only by explicit interaction.
}

// --- Updated lifecycle helper ---

export function handleUpdated(ctx, changedProperties) {
  if (changedProperties.has('benchmarkProgress')) {
    const oldLogs = changedProperties.get('benchmarkProgress')?.logs || [];
    const newLogs = ctx.benchmarkProgress?.logs || [];
    if (newLogs.length > oldLogs.length) {
      requestAnimationFrame(() => {
        const terminal = ctx.shadowRoot.querySelector('#benchmark-terminal');
        if (terminal) terminal.scrollTop = terminal.scrollHeight;
      });
    }
  }
}