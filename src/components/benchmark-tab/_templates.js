/**
 * benchmark-tab/_templates.js
 * Render functions for BenchmarkTab — each takes `ctx` (the component instance)
 * and returns a Lit html`` template result.
 */
import { html } from 'lit';
import {
  getFilteredAndSortedBenchmarks,
  getChartBenchmarks,
  formatRoundName,
  toggleModelInQueue,
  handleSort,
  viewBenchmarkDetails,
  handleBubbleClick,
  handleRowHover,
  handleRowLeave,
  fetchBenchmarks,
  fetchActiveModelId,
  runBenchmark,
  runJudge,
  runQueueBenchmark,
  runTemperatureSweep,
  fetchBenchmarkLogs,
  handleBenchmarkLogLimitChange,
} from './_logic.js';

/**
 * Render a VRAM utilization chip with mini progress bar.
 * Shows "X.X / Y GB (ZZ%)" with a colored bar indicating how full the GPU is.
 */
function renderVramChip(b) {
  if (b.vram_gb === null || b.vram_gb === undefined) {
    return html`<span class="bench-chip" style="background: rgba(156,163,175,0.08); color: #9ca3af; border: 1px solid rgba(156,163,175,0.12); font-size: 0.7rem; padding: 2px 8px; border-radius: var(--radius-sm);">—</span>`;
  }
  const total = b.vram_total_gb || 16.0;
  const pct = Math.min(100, Math.round((b.vram_gb / total) * 100));
  // Color shifts from green (low util) → amber → red (high util)
  const barColor = pct > 80 ? '#ef4444' : pct > 55 ? '#f59e0b' : '#34d399';
  return html`
    <div style="display: inline-flex; align-items: center; gap: 4px; background: rgba(139,92,246,0.06); border: 1px solid rgba(139,92,246,0.15); border-radius: var(--radius-sm); padding: 2px 6px; font-size: 0.65rem; line-height: 1.2;">
      <span style="color: #a78bfa; white-space: nowrap;">⚙️${b.vram_gb.toFixed(1)}</span>
      <div style="width: 24px; height: 4px; background: rgba(255,255,255,0.08); border-radius: 2px; overflow: hidden; flex-shrink: 0;">
        <div style="width: ${pct}%; height: 100%; background: ${barColor}; border-radius: 2px;"></div>
      </div>
    </div>
  `;
}

export function renderBenchmarksView(ctx) {
  const list = getFilteredAndSortedBenchmarks(ctx);
  const totalRounds = ctx.benchmarkProgress.total_rounds || 5;
  const completedRounds = ctx.benchmarkProgress.rounds_completed || 0;
  const progressPercent = Math.min(100, Math.round((completedRounds / totalRounds) * 100));

  return html`
    <div class="sub-view">
      <!-- Live Progress overlay/panel -->
      ${ctx.benchmarkProgress && ctx.benchmarkProgress.running ? html`
        <div class="card" style="border-color: var(--primary); box-shadow: 0 0 15px rgba(99, 102, 241, 0.25); background: rgba(99, 102, 241, 0.03);">
          <h3 style="margin-bottom: 6px; color: var(--primary); display: flex; align-items: center; gap: 8px;">
            <span class="loader" style="border-top-color: var(--primary); width: 16px; height: 16px; border-width: 2px;"></span>
            ⚡ ${ctx.benchmarkProgress.queue_running ? 'Automated Benchmark Queue in Progress...' : ctx.benchmarkProgress.sweep_running ? '🌡️ Temperature Sweep in Progress...' : 'Benchmarking in Progress...'}
          </h3>
          <span class="card-subtitle" style="margin-bottom: 12px;">
            ${ctx.benchmarkProgress.queue_running ? html`
              Queue Progress: <strong>${(ctx.benchmarkProgress.queue_current_index || 0) + 1} / ${ctx.benchmarkProgress.queue?.length || 0}</strong> models
            ` : html`
              Active Model: <code style="color: var(--text-primary); font-weight: bold; background: rgba(255,255,255,0.05); padding: 2px 6px; border-radius: var(--radius-sm);">${ctx.benchmarkProgress.model_id || 'Unknown'}</code>
            `}
          </span>

          <!-- Queue Progress List -->
          ${ctx.benchmarkProgress.queue_running && ctx.benchmarkProgress.queue ? html`
            <div style="display: flex; flex-direction: column; gap: 6px; margin: 12px 0; background: rgba(0,0,0,0.25); padding: 12px; border-radius: var(--radius-md); border: 1px solid rgba(255,255,255,0.04);">
              <span style="font-size: 0.8rem; font-weight: bold; color: var(--text-secondary); margin-bottom: 4px; display: block;">Queue Status:</span>
              ${ctx.benchmarkProgress.queue.map((m, idx) => {
                const isCompleted = ctx.benchmarkProgress.queue_completed?.includes(m) || idx < (ctx.benchmarkProgress.queue_current_index || 0);
                const isCurrent = idx === (ctx.benchmarkProgress.queue_current_index || 0);
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
              <span style="color: var(--text-secondary);">Current Status: <strong style="color: var(--text-primary);">${ctx.benchmarkProgress.current_round || 'Initializing...'}</strong></span>
              <span style="color: var(--primary); font-weight: bold;">${ctx.benchmarkProgress.sweep_running ? `${Math.min(100, Math.round(((ctx.benchmarkProgress.sweep_progress || 0) / (ctx.benchmarkProgress.sweep_total || 5)) * 100))}% (${ctx.benchmarkProgress.sweep_progress || 0}/${ctx.benchmarkProgress.sweep_total || 5} temps)` : `${progressPercent}% (${completedRounds}/${totalRounds})`}</span>
            </div>
            <div class="progress-track">
              <div class="progress-fill" style="width: ${ctx.benchmarkProgress.sweep_running ? Math.min(100, Math.round(((ctx.benchmarkProgress.sweep_progress || 0) / (ctx.benchmarkProgress.sweep_total || 5)) * 100)) : progressPercent}%; height: 100%; background: linear-gradient(90deg, var(--primary), #a5b4fc); transition: width 0.4s ease; box-shadow: 0 0 8px var(--primary);"></div>
            </div>
          </div>

          <div style="margin-top: 16px;">
            <span style="font-size: 0.8rem; color: var(--text-secondary); font-weight: 600; display: block; margin-bottom: 6px;">Live Runner Logs:</span>
            <div style="font-family: 'Courier New', Courier, monospace; background: #070b19; border: 1px solid rgba(99, 102, 241, 0.2); padding: 12px; border-radius: var(--radius-md); max-height: 160px; overflow-y: auto; color: #34d399; font-size: 0.75rem; line-height: 1.4; scroll-behavior: smooth;" id="benchmark-terminal">
              ${ctx.benchmarkProgress.logs && ctx.benchmarkProgress.logs.length > 0 ?
                ctx.benchmarkProgress.logs.map(log => html`<div style="margin-bottom: 3px; border-bottom: 1px solid rgba(255,255,255,0.02); padding-bottom: 2px;">${log}</div>`) :
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
          🚀 Model Testing &amp; Evaluation
        </h3>
        <span class="card-subtitle" style="margin-bottom: 16px;">Measure GGUF inference speeds across standardized QA evaluation rounds and score using a designated Judge LLM.</span>

        <div style="display: flex; flex-direction: column; gap: 12px; background: rgba(0, 0, 0, 0.15); padding: 14px; border-radius: var(--radius-md); border: 1px solid var(--border-color);">
          <!-- Active Model Status -->
          <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
            <span style="font-size: 0.85rem; font-weight: 500; color: var(--text-secondary);">Currently Loaded Server Model:</span>
            ${ctx.activeModelId ? html`
              <span class="meta-badge" style="background: rgba(16, 185, 129, 0.1); color: var(--success); font-weight: bold; border: 1px solid rgba(16, 185, 129, 0.2); font-size: 0.8rem; padding: 4px 10px;">
                🟢 ${ctx.activeModelId.split('/').pop()}
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
              .value="${ctx.selectedJudgeModelId}"
              @change="${e => ctx.selectedJudgeModelId = e.target.value}"
            >
              ${ctx.activeModelId ? html`<option value="${ctx.activeModelId}">(Recommended) Loaded Active Model: ${ctx.activeModelId.split('/').pop()}</option>` : ''}
              ${ctx.benchmarks.filter(b => b.is_ready && b.model !== ctx.activeModelId).map(b => html`
                <option value="${b.model}">${b.model}</option>
              `)}
              ${!ctx.activeModelId && ctx.benchmarks.filter(b => b.is_ready).length === 0 ? html`<option value="">No local GGUF models available</option>` : ''}
            </select>
            <span style="font-size: 0.72rem; color: var(--text-secondary); font-style: italic;">The Judge LLM is responsible for grading qualitative output from 0-25 per round using golden reference answers.</span>
          </div>

          <!-- Server Selector -->
          <div style="display: flex; align-items: center; gap: 8px; margin-top: 4px;">
            <span style="font-size: 0.75rem; color: var(--text-secondary); font-weight: 500;">Test Server:</span>
            <button style="padding: 4px 12px; font-size: 0.75rem; font-weight: 600; border-radius: var(--radius-full); cursor: pointer; border: 1px solid ${ctx.selectedBenchmarkServer === 'primary' ? 'var(--primary)' : 'rgba(255,255,255,0.1)'}; background: ${ctx.selectedBenchmarkServer === 'primary' ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.04)'}; color: ${ctx.selectedBenchmarkServer === 'primary' ? '#a5b4fc' : 'var(--text-secondary)'};" @click="${() => { ctx.selectedBenchmarkServer = 'primary'; fetchActiveModelId(ctx); }}">Primary (Tesla P100)</button>
            <button style="padding: 4px 12px; font-size: 0.75rem; font-weight: 600; border-radius: var(--radius-full); cursor: pointer; border: 1px solid ${ctx.selectedBenchmarkServer === 'secondary' ? 'var(--primary)' : 'rgba(255,255,255,0.1)'}; background: ${ctx.selectedBenchmarkServer === 'secondary' ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.04)'}; color: ${ctx.selectedBenchmarkServer === 'secondary' ? '#a5b4fc' : 'var(--text-secondary)'};" @click="${() => { ctx.selectedBenchmarkServer = 'secondary'; fetchActiveModelId(ctx); }}">Secondary (GTX 1060)</button>
          </div>

          <!-- Action Triggers -->
          <div style="display: flex; gap: 10px; margin-top: 4px; flex-wrap: wrap;">
            <button
              class="btn btn-secondary"
              style="flex: 1; min-width: 150px; background: var(--primary); color: white; border: none; font-size: 0.85rem; padding: 10px 16px;"
              ?disabled="${!ctx.activeModelId || (ctx.benchmarkProgress && ctx.benchmarkProgress.running)}"
              @click="${() => runBenchmark(ctx)}"
            >
              🚀 Start 5-Round Benchmark
            </button>
            <button
              class="btn btn-secondary"
              style="flex: 1; min-width: 150px; font-size: 0.85rem; padding: 10px 16px; border: 1px solid var(--border-color);"
              ?disabled="${!ctx.activeModelId || (ctx.benchmarkProgress && ctx.benchmarkProgress.running)}"
              @click="${() => runJudge(ctx)}"
            >
              ⚖️ Re-Grade Latest Run
            </button>
            <button
              class="btn btn-secondary"
              style="flex: 1; min-width: 150px; font-size: 0.85rem; padding: 10px 16px; border: 1px solid var(--border-color);"
              ?disabled="${!ctx.activeModelId || (ctx.benchmarkProgress && ctx.benchmarkProgress.running)}"
              @click="${() => runTemperatureSweep(ctx)}"
            >
              🌡️ Temperature Sweep
            </button>
          </div>

          <!-- Frontend Queue Control -->
          ${ctx.benchmarkQueue.length > 0 ? html`
            <div style="background: rgba(99,102,241,0.05); padding: 12px; border-radius: var(--radius-md); border: 1px solid rgba(99,102,241,0.25); margin-top: 10px; display: flex; flex-direction: column; gap: 8px;">
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <span style="font-size: 0.82rem; font-weight: 600; color: #a5b4fc;">📋 Selected Queue (${ctx.benchmarkQueue.length} models):</span>
                <button class="btn btn-secondary" style="padding: 2px 8px; font-size: 0.72rem; border-color: rgba(239,68,68,0.2); color: #ef4444; background: transparent;" @click="${() => ctx.benchmarkQueue = []}">Clear</button>
              </div>
              <div style="display: flex; flex-wrap: wrap; gap: 6px; font-size: 0.75rem; color: var(--text-secondary); max-height: 80px; overflow-y: auto;">
                ${ctx.benchmarkQueue.map(qm => html`
                  <span class="meta-badge" style="background: rgba(255,255,255,0.05); padding: 2px 6px;">${qm.split('/').pop()}</span>
                `)}
              </div>
              <button
                class="btn"
                style="width: 100%; background: linear-gradient(135deg, var(--primary), #4f46e5); color: white; border: none; font-size: 0.85rem; padding: 10px 16px; font-weight: bold; box-shadow: 0 0 10px rgba(99, 102, 241, 0.4);"
                ?disabled="${ctx.benchmarkProgress && ctx.benchmarkProgress.running}"
                @click="${() => runQueueBenchmark(ctx)}"
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
            ?checked="${!ctx.showAllBenchmarks}"
            @change="${() => { ctx.showAllBenchmarks = !ctx.showAllBenchmarks; fetchBenchmarks(ctx); }}"
          >
          <span class="slider"></span>
        </label>
      </div>

      <!-- VRAM Bubble Chart -->
      <benchmark-bubble-chart
        .benchmarks="${getChartBenchmarks(ctx)}"
        .highlightedModelId="${ctx.highlightedModelId}"
        @bubble-click="${e => handleBubbleClick(ctx, e)}"
      ></benchmark-bubble-chart>

      <!-- Ranking Scores Table Card -->
      <div class="card" style="margin-bottom: 16px;">
        <div class="benchmarks-header">
          <h2>🏆 LLM Benchmark Scores &amp; Rankings</h2>
          <button class="btn btn-secondary" style="padding: 6px 12px; font-size: 0.8rem;" @click="${() => { fetchBenchmarks(ctx); fetchActiveModelId(ctx); }}">⟳ Refresh</button>
        </div>
        <span class="card-subtitle">Inference speed, quantization, and quality scores for locally tested GGUF models.</span>

        <div class="input-group">
          <input
            type="text"
            class="text-input"
            placeholder="Search by model name..."
            .value="${ctx.filterQuery}"
            @input="${e => ctx.filterQuery = e.target.value}"
          >
        </div>

        <div class="filter-pills">
          <button class="pill ${ctx.platformFilter === 'all' ? 'active' : ''}" @click="${() => ctx.platformFilter = 'all'}">All Server</button>
          <button class="pill ${ctx.platformFilter === 'primary' ? 'active' : ''}" @click="${() => ctx.platformFilter = 'primary'}">Primary</button>
          <button class="pill ${ctx.platformFilter === 'secondary' ? 'active' : ''}" @click="${() => ctx.platformFilter = 'secondary'}">Secondary</button>
          <button class="pill ${ctx.showOfflineModels ? '' : 'active'}" style="margin-left: auto; font-size: 0.65rem;" @click="${() => ctx.showOfflineModels = !ctx.showOfflineModels}">${ctx.showOfflineModels ? '📂 Show Offline' : '📂 Hide Offline'}</button>
        </div>

        <div class="table-wrapper">
          <table style="width: 100%; border-collapse: separate; border-spacing: 0 6px;">
            <thead>
              <tr>
                <th style="width: 36px; text-align: center; padding: 8px 4px;"></th>
                <th @click="${() => handleSort(ctx, 'model')}" style="text-align: left; padding: 8px 12px 8px 8px;">Model
                  <span class="sort-indicator">${ctx.sortField === 'model' ? (ctx.sortAscending ? '▲' : '▼') : ''}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              ${ctx.benchmarksLoading ? html`
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
                const isJudge = ctx.selectedJudgeModelId === b.model || (ctx.activeModelId === b.model && !ctx.selectedJudgeModelId);
                const inQueue = ctx.benchmarkQueue.includes(b.model);

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

                const isHighlighted = ctx.highlightedModelId === b.model_id;
                return html`
                  <tr
                    data-model-id="${b.model_id}"
                    class="${inQueue ? 'row-queued' : ''}${isHighlighted ? ' row-highlighted' : ''}"
                    style="${inQueue ? 'background: rgba(99,102,241,0.03);' : ''}${isHighlighted && !inQueue ? 'background: rgba(20,184,166,0.06);' : ''}"
                    @mouseenter="${() => handleRowHover(ctx, b.model_id)}"
                    @mouseleave="${() => handleRowLeave(ctx)}"
                  >
                    <td style="text-align: center; padding: 8px 4px 8px 8px; vertical-align: middle;">
                      ${b.is_ready ? html`
                        <input
                          type="checkbox"
                          .checked="${inQueue}"
                          @change="${() => toggleModelInQueue(ctx, b.model)}"
                        >
                      ` : html`
                        <span style="font-size: 0.8rem; opacity: 0.3;">❌</span>
                      `}
                    </td>
                    <td style="padding: 12px; vertical-align: middle;">
                      <!-- Model name row -->
                      <div class="bench-model-row clickable-cell" @click="${() => b.is_tested && viewBenchmarkDetails(ctx, b.model_id, b.server)}" style="cursor: ${b.is_tested ? 'pointer' : 'default'}; display: flex; flex-direction: column; gap: 4px;">
                        <!-- Name + status badges -->
                        <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-bottom: 2px;">
                          ${b.is_tested ? html`
                            <span class="bench-model-name" style="color: var(--text-primary); font-weight: 600; font-size: 0.85rem;">${b.model}</span>
                          ` : html`
                            <span style="color: var(--text-muted); font-style: italic; font-size: 0.82rem;">${b.model}</span>
                          `}
                          ${isJudge ? html`<span class="meta-badge" style="background: rgba(99, 102, 241, 0.15); color: #a5b4fc; border: 1px solid rgba(99, 102, 241, 0.3); font-size: 0.6rem; padding: 1px 5px;">⚖️ Judge</span>` : ''}
                          ${b.server ? html`<span class="meta-badge" style="background: ${b.server === 'secondary' ? 'rgba(251, 191, 36, 0.15)' : 'rgba(16, 185, 129, 0.15)'}; color: ${b.server === 'secondary' ? '#fbbf24' : '#34d399'}; border: 1px solid ${b.server === 'secondary' ? 'rgba(251, 191, 36, 0.3)' : 'rgba(16, 185, 129, 0.3)'}; font-size: 0.6rem; padding: 1px 5px;">${b.server === 'secondary' ? '🟠 Secondary' : '🟢 Primary'}</span>` : ''}
                          ${b.is_tested ? (b.status === 'aborted' ? html`<span class="meta-badge" style="background: rgba(239,68,68,0.15); color: #f87171; font-size: 0.6rem; padding: 1px 5px;">⛔ Aborted</span>` : html`<span class="meta-badge" style="background: rgba(16, 185, 129, 0.1); color: #34d399; font-size: 0.6rem; padding: 1px 5px;">Tested</span>`) : ''}
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
                            ${renderVramChip(b)}
                            ${b.has_mmproj ? html`<span class="bench-chip" style="background: rgba(34,197,94,0.12); color: #4ade80; border: 1px solid rgba(34,197,94,0.25); font-size: 0.7rem; padding: 2px 8px; border-radius: var(--radius-sm);">📷 MMPROJ</span>` : ''}
                            ${b.has_mtp ? html`<span class="bench-chip" style="background: rgba(168,85,247,0.12); color: #c084fc; border: 1px solid rgba(168,85,247,0.25); font-size: 0.7rem; padding: 2px 8px; border-radius: var(--radius-sm);">⚡ MTP</span>` : ''}
                          </div>
                        ` : html`
                          <div style="display: flex; gap: 4px; flex-wrap: wrap; margin-top: 2px;">
                            <span class="bench-chip" style="background: rgba(156,163,175,0.08); color: #9ca3af; border: 1px solid rgba(156,163,175,0.12); font-size: 0.7rem; padding: 2px 8px; border-radius: var(--radius-sm);">${b.quant}</span>
                            <span class="bench-chip" style="background: rgba(156,163,175,0.08); color: #9ca3af; border: 1px solid rgba(156,163,175,0.12); font-size: 0.7rem; padding: 2px 8px; border-radius: var(--radius-sm);">—</span>
                            <span class="bench-chip" style="background: rgba(156,163,175,0.08); color: #9ca3af; border: 1px solid rgba(156,163,175,0.12); font-size: 0.7rem; padding: 2px 8px; border-radius: var(--radius-sm);">—</span>
                            ${renderVramChip(b)}
                            ${b.has_mmproj ? html`<span class="bench-chip" style="background: rgba(34,197,94,0.12); color: #4ade80; border: 1px solid rgba(34,197,94,0.25); font-size: 0.7rem; padding: 2px 8px; border-radius: var(--radius-sm);">📷 MMPROJ</span>` : ''}
                            ${b.has_mtp ? html`<span class="bench-chip" style="background: rgba(168,85,247,0.12); color: #c084fc; border: 1px solid rgba(168,85,247,0.25); font-size: 0.7rem; padding: 2px 8px; border-radius: var(--radius-sm);">⚡ MTP</span>` : ''}
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

export function renderDetailsModal(ctx) {
  if (!ctx.showDetailsModal) return '';
  return html`
    <div class="modal-backdrop" @click="${() => ctx.showDetailsModal = false}">
      <div class="modal modal-large" @click="${e => e.stopPropagation()}">
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border-color); padding-bottom: 12px;">
          <h3 class="modal-title" style="color: #a5b4fc; font-size: 1.1rem; margin: 0;">📊 Benchmark Evaluation Report</h3>
          <button class="btn btn-secondary" style="padding: 2px 8px; font-size: 0.8rem; background: transparent; border-color: rgba(255,255,255,0.15); border-radius: var(--radius-sm);" @click="${() => ctx.showDetailsModal = false}">✕</button>
        </div>
        <div class="modal-body modal-body-scrollable">
          ${ctx.detailsModalLoading ? html`
            <div style="text-align: center; padding: 30px; display: flex; flex-direction: column; align-items: center; gap: 10px;">
              <span class="loader" style="border-top-color: var(--primary);"></span> Loading details...
            </div>
          ` : !ctx.selectedBenchmarkDetails ? html`
            <div style="color: #f87171; text-align: center; padding: 20px;">Failed to load report.</div>
          ` : html`
            <div style="display: flex; flex-direction: column; gap: 6px; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 12px;">
              <span style="font-weight: bold; font-size: 1.05rem; color: white; word-break: break-all;">${ctx.selectedBenchmarkDetails.name}</span>
              <div style="display: flex; gap: 6px; font-size: 0.72rem; flex-wrap: wrap;">
                <span class="meta-badge" style="background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.08); padding: 2px 6px;">Quant: ${ctx.selectedBenchmarkDetails.quantization}</span>
                <span class="meta-badge" style="background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.08); padding: 2px 6px;">Tested: ${ctx.selectedBenchmarkDetails.timestamp}</span>
                ${(() => {
                  const s = (ctx.selectedBenchmarkDetails.status || '').toLowerCase();
                  const isAborted = s === 'aborted';
                  const isBad = isAborted || s.includes('⚠️') || s === 'failed';
                  const bg = isBad ? 'rgba(239,68,68,0.15)' : 'rgba(16,185,129,0.15)';
                  const color = isBad ? '#f87171' : '#34d399';
                  const border = isBad ? 'rgba(239,68,68,0.2)' : 'rgba(16,185,129,0.2)';
                  const label = isAborted ? '⛔ Aborted (Too Slow)' : s;
                  return html`<span class="meta-badge" style="background: ${bg}; color: ${color}; border: 1px solid ${border}; padding: 2px 6px;">${label}</span>`;
                })()}
              </div>
              ${ctx.selectedBenchmarkDetails.notes ? html`
                <div style="font-size: 0.78rem; color: var(--text-secondary); background: rgba(0,0,0,0.15); padding: 8px 12px; border-radius: var(--radius-sm); border-left: 3px solid var(--text-muted); margin-top: 4px;">
                  <strong>Notes:</strong> ${ctx.selectedBenchmarkDetails.notes}
                </div>
              ` : ''}
            </div>

            ${ctx.selectedBenchmarkDetails.hallucinations && ctx.selectedBenchmarkDetails.hallucinations.length > 0 ? html`
              <div class="hallucination-warning-box">
                <div class="hallucination-warning-title">🛑 Hallucinations Flagged by Judge</div>
                ${ctx.selectedBenchmarkDetails.hallucinations.map(h => html`
                  <div class="hallucination-warning-desc"><strong>${formatRoundName(h.round_name)}:</strong> ${h.description}</div>
                `)}
              </div>
            ` : ''}

            <div style="display: flex; flex-direction: column; gap: 12px;">
              <h4 style="font-size: 0.9rem; margin: 0; color: white;">🏅 Score Breakdown</h4>
              ${ctx.selectedBenchmarkDetails.rounds && ctx.selectedBenchmarkDetails.rounds.map(r => {
                const reasoning = r.reasoning || '';
                const isAbortRound = reasoning.toLowerCase().includes('aborted') || reasoning.toLowerCase().includes('too slow') || reasoning.toLowerCase().includes('below minimum');
                const borderColor = isAbortRound ? 'rgba(239,68,68,0.4)' : 'rgba(99,102,241,0.2)';
                return html`
                  <div class="round-card" style="border-color: ${borderColor}; ${isAbortRound ? 'background: rgba(239,68,68,0.04);' : ''}">
                    <div class="round-card-header">
                      <span class="round-card-title">${formatRoundName(r.round_name)}</span>
                      <span class="round-card-score" style="color: ${isAbortRound ? '#f87171' : r.score >= 20 ? '#34d399' : r.score >= 10 ? '#fbbf24' : '#9ca3af'};">${r.score} pts</span>
                    </div>
                    ${reasoning ? html`<div class="round-card-reasoning" style="${isAbortRound ? 'color: #f87171; border-left: 3px solid rgba(239,68,68,0.5); padding-left: 10px; font-style: italic;' : ''}">${reasoning}</div>` : ''}
                    <div class="round-card-meta">${r.speed_tps > 0 ? html`<span style="margin-top: 2px; color: ${isAbortRound ? '#f87171' : 'inherit'};">⚡ Speed: <strong>${r.speed_tps.toFixed(1)} t/s</strong></span>` : ''}</div>
                  </div>
                `;
              })}
              ${(!ctx.selectedBenchmarkDetails.rounds || ctx.selectedBenchmarkDetails.rounds.length === 0) ? html`
                <div style="color: var(--text-muted); text-align: center; padding: 20px; background: rgba(0,0,0,0.1); border-radius: var(--radius-md); font-style: italic;">No round data available — benchmark may not have completed.</div>
              ` : ''}
            </div>
          `}
        </div>
        <div class="modal-actions" style="border-top: 1px solid var(--border-color); padding-top: 12px; margin-top: 12px;">
          <button class="btn btn-secondary" style="padding: 8px 16px;" @click="${() => ctx.showDetailsModal = false}">Close</button>
        </div>
      </div>
    </div>
  `;
}

export function renderBenchmarkLogs(ctx) {
  return html`
    <!-- Benchmark Execution Logs -->
    <div class="card">
      <h2>📋 Benchmark Execution Logs</h2>
      <span class="card-subtitle">Persistent, timestamped log of benchmark runs including errors and stack traces.</span>

      <div style="display: flex; gap: 8px; align-items: center; justify-content: space-between;">
        <div style="display: flex; gap: 6px; align-items: center; font-size: 0.8rem;">
          <span>Lines:</span>
          <select class="select-input" style="padding: 4px 8px;" .value="${(ctx.benchmarkLogLimit ?? '').toString()}" @change="${e => handleBenchmarkLogLimitChange(ctx, e)}">
            <option value="50">50</option>
            <option value="100">100</option>
            <option value="200">200</option>
            <option value="500">500</option>
          </select>
        </div>
        <button class="btn btn-secondary" style="padding: 6px 12px; font-size: 0.8rem;" @click="${() => fetchBenchmarkLogs(ctx)}" ?disabled="${ctx.benchmarkLogsLoading}">
          ${ctx.benchmarkLogsLoading ? html`<span class="loader"></span>` : '⟳ Refresh Logs'}
        </button>
      </div>

      <div class="logs-terminal benchmark-logs-terminal" style="background: rgba(99, 102, 241, 0.03); border-color: var(--primary-glow); color: #a5b4fc; font-family: 'Courier New', Courier, monospace; font-size: 0.75rem; line-height: 1.4; max-height: 300px; overflow-y: auto; white-space: pre-wrap; word-break: break-all;">${ctx.benchmarkLogsText || 'Click refresh to pull benchmark execution logs...'}</div>
    </div>
  `;
}

export function renderSweepModal(ctx) {
  if (!ctx.showSweepModal || !ctx.benchmarkProgress?.sweep_results) return '';
  const sr = ctx.benchmarkProgress.sweep_results;
  const sweeps = sr.sweeps || [];
  const bestTemp = sr.best_temperature;

  return html`
    <div class="modal-backdrop" @click="${() => ctx.showSweepModal = false}">
      <div class="modal modal-large" @click="${e => e.stopPropagation()}">
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border-color); padding-bottom: 12px;">
          <h3 class="modal-title" style="color: #a5b4fc; font-size: 1.1rem; margin: 0;">🌡️ Temperature Sweep Results</h3>
          <button class="btn btn-secondary" style="padding: 2px 8px; font-size: 0.8rem; background: transparent; border-color: rgba(255,255,255,0.15); border-radius: var(--radius-sm);" @click="${() => ctx.showSweepModal = false}">✕</button>
        </div>
        <div class="modal-body modal-body-scrollable">
          <div style="display: flex; flex-direction: column; gap: 6px; margin-bottom: 16px;">
            <span style="font-weight: bold; font-size: 1rem; color: white; word-break: break-all;">${sr.model_id}</span>
            <div style="display: flex; gap: 8px; font-size: 0.78rem; color: var(--text-secondary); flex-wrap: wrap;">
              <span>⚖️ Judge: ${sr.judge_model}</span>
              <span>🌡️ Best temp: <strong style="color: #34d399;">${bestTemp}</strong></span>
              <span>🏆 Best combined score: <strong style="color: #a5b4fc;">${sr.best_combined}</strong></span>
            </div>
            <div style="background: rgba(16,185,129,0.08); border-left: 3px solid #34d399; padding: 8px 12px; border-radius: var(--radius-sm); font-size: 0.82rem; color: #d1d5db; margin-top: 4px;">
              💡 ${sr.recommendation}
            </div>
          </div>

          <div class="table-wrapper">
            <table style="width: 100%; border-collapse: separate; border-spacing: 0 4px;">
              <thead>
                <tr>
                  <th style="text-align: left; padding: 8px; font-size: 0.8rem;">Temperature</th>
                  <th style="text-align: center; padding: 8px; font-size: 0.8rem;">Score</th>
                  <th style="text-align: right; padding: 8px; font-size: 0.8rem;">Tokens</th>
                  <th style="text-align: right; padding: 8px; font-size: 0.8rem;">t/s</th>
                  <th style="text-align: center; padding: 8px; font-size: 0.8rem;">Combined</th>
                  <th style="text-align: center; padding: 8px; font-size: 0.8rem;"></th>
                </tr>
              </thead>
              <tbody>
                ${sweeps.map(s => {
                  const isBest = s.temperature === bestTemp;
                  const isCurrent = s.temperature === 0.7;
                  const rowBg = isBest ? 'rgba(16,185,129,0.06)' : 'transparent';
                  return html`
                    <tr style="background: ${rowBg};">
                      <td style="padding: 8px; font-weight: ${isBest ? 'bold' : 'normal'}; color: ${isBest ? '#34d399' : 'var(--text-primary)'};">
                        ${s.temperature}
                      </td>
                      <td style="text-align: center; padding: 8px;">
                        <span style="color: ${s.score >= 20 ? '#34d399' : s.score >= 10 ? '#fbbf24' : '#f87171'};">${s.score}</span>
                      </td>
                      <td style="text-align: right; padding: 8px; color: var(--text-secondary);">${(s.tokens_generated || 0).toLocaleString()}</td>
                      <td style="text-align: right; padding: 8px; color: var(--text-secondary);">${(s.tokens_per_second || 0).toFixed(1)}</td>
                      <td style="text-align: center; padding: 8px; font-weight: bold; color: ${isBest ? '#34d399' : 'var(--text-secondary)'};">${s.combined}</td>
                      <td style="text-align: center; padding: 8px;">
                        ${isBest ? html`<span style="color: #34d399; font-weight: bold; font-size: 0.8rem;">⭐ Best</span>` : ''}
                        ${isCurrent && !isBest ? html`<span style="color: #9ca3af; font-size: 0.75rem;">(current)</span>` : ''}
                      </td>
                    </tr>
                  `;
                })}
              </tbody>
            </table>
          </div>

          <div style="margin-top: 12px; padding: 10px; background: rgba(99,102,241,0.04); border-radius: var(--radius-sm); border: 1px solid rgba(99,102,241,0.12); font-size: 0.78rem; color: var(--text-secondary);">
            <strong style="color: #a5b4fc;">How Combined Score Works:</strong>
            
            Combined = Score + min(25, (t/s ÷ 60) × 25). This rewards both answer quality and speed.
            All responses graded by <strong>${sr.judge_model}</strong> at temperature=0.1 for consistency.
            Based on a single Technical Reasoning prompt — results may vary per round type.
          </div>
        </div>
        <div class="modal-actions" style="border-top: 1px solid var(--border-color); padding-top: 12px; margin-top: 12px;">
          <button class="btn btn-secondary" style="padding: 8px 16px;" @click="${() => ctx.showSweepModal = false}">Close</button>
        </div>
      </div>
    </div>
  `;
}
