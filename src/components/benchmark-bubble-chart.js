import { LitElement, html, css } from 'lit';
import Chart from 'chart.js/auto';

// Color interpolation for PRIMARY server (Tesla P100) — pale gray → deep teal
function interpolateColorPrimary(tokensSec) {
  const min = 15, max = 85;
  const t = Math.max(0, Math.min(1, (tokensSec - min) / (max - min)));
  const r = Math.round(229 + (20 - 229) * t);
  const g = Math.round(231 + (180 - 231) * t);
  const b = Math.round(235 + (164 - 235) * t);
  return `rgb(${r}, ${g}, ${b})`;
}

// Color interpolation for SECONDARY server (GTX 1060) — pale gray → deep amber/orange
function interpolateColorSecondary(tokensSec) {
  const min = 15, max = 85;
  const t = Math.max(0, Math.min(1, (tokensSec - min) / (max - min)));
  const r = Math.round(229 + (217 - 229) * t);
  const g = Math.round(231 + (119 - 231) * t);
  const b = Math.round(235 + (6 - 235) * t);
  return `rgb(${r}, ${g}, ${b})`;
}

function getBubbleColor(item) {
  if (!item || !item.tokens_sec) return 'rgba(156, 163, 175, 0.4)';
  if (item.server === 'secondary') {
    return interpolateColorSecondary(item.tokens_sec);
  }
  return interpolateColorPrimary(item.tokens_sec);
}

export class BenchmarkBubbleChart extends LitElement {
  static properties = {
    benchmarks: { type: Array },
    highlightedModelId: { type: String },
  };

  static styles = css`
    :host {
      display: block;
      padding: 16px;
      color: var(--text-primary);
      background-color: var(--bg-color);
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
    }

    h3 {
      font-family: var(--font-title);
      color: var(--text-primary);
      font-size: 1.05rem;
      margin: 0;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .chart-container {
      position: relative;
      width: 100%;
      max-height: 420px;
    }

    h4 {
      font-size: 0.75rem;
      color: var(--text-secondary);
      margin: 8px 0 0 0;
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .legend {
      display: flex;
      align-items: center;
      gap: 16px;
      font-size: 0.78rem;
      color: var(--text-secondary);
      margin-top: 4px;
    }

    .legend-item {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .legend-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
    }
  `;

  constructor() {
    super();
    this.benchmarks = [];
    this.highlightedModelId = '';
    this.chart = null;
  }

  connectedCallback() {
    super.connectedCallback();
    requestAnimationFrame(() => this._createChart());
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this.chart) {
      this.chart.destroy();
      this.chart = null;
    }
  }

  updated(changedProperties) {
    if (changedProperties.has('benchmarks') || changedProperties.has('highlightedModelId')) {
      requestAnimationFrame(() => this._updateChart());
    }
  }

  _createChart() {
    const canvas = this.shadowRoot?.querySelector('#bubble-chart-canvas');
    if (!canvas) return;

    this.chart = new Chart(canvas, {
      type: 'scatter',
      data: this._buildChartData(),
      options: this._chartOptions(),
      plugins: [this._legendPlugin(), this._errorBarPlugin()],
    });
  }

  _updateChart() {
    if (!this.chart) return;
    this.chart.data = this._buildChartData();
    this.chart.update('none');
  }

  _legendPlugin() {
    return {
      id: 'customLegend',
      afterDraw: () => {
        // Rendered via Lit template instead
      },
    };
  }

  // White ±stddev whiskers, only for models that have multi-run data
  // (score_stddev > 0). Drawn after the bubbles so the bars stay visible.
  _errorBarPlugin() {
    return {
      id: 'errorBars',
      afterDatasetsDraw: (chart) => {
        const { ctx, chartArea } = chart;
        const ds = chart.data.datasets[0];
        const meta = chart.getDatasetMeta(0);
        if (!ds || !meta || !meta.data?.length) return;

        const yScale = chart.scales.y;
        const capLen = 5;
        const bars = [];

        meta.data.forEach((el, i) => {
          const d = ds.data[i];
          if (!d || !(d.score_stddev > 0) || d.y == null) return;
          const x = el.x;
          const yTop = Math.max(chartArea.top, yScale.getPixelForValue(d.y + d.score_stddev));
          const yBot = Math.min(chartArea.bottom, yScale.getPixelForValue(d.y - d.score_stddev));
          if (yBot - yTop < 1) return; // degenerate/zero-length → skip
          bars.push({ x, yTop, yBot });
        });

        if (!bars.length) return;

        ctx.save();
        ctx.strokeStyle = 'rgba(255,255,255,0.9)';
        ctx.lineWidth = 2;
        ctx.lineCap = 'butt';

        // vertical whiskers
        ctx.beginPath();
        bars.forEach((b) => {
          ctx.moveTo(b.x, b.yTop);
          ctx.lineTo(b.x, b.yBot);
        });
        ctx.stroke();

        // end caps for the classic error-bar look
        ctx.beginPath();
        bars.forEach((b) => {
          ctx.moveTo(b.x - capLen, b.yTop);
          ctx.lineTo(b.x + capLen, b.yTop);
          ctx.moveTo(b.x - capLen, b.yBot);
          ctx.lineTo(b.x + capLen, b.yBot);
        });
        ctx.stroke();

        ctx.restore();
      },
    };
  }

  _buildChartData() {
    const dataPoints = [];
    const labels = new Map();

    (this.benchmarks || []).forEach(b => {
      if (!b.model_id) return;
      const xVal = b.vram_gb ?? null;
      const yVal = b.score ?? null;

      if (xVal === null && yVal === null) return;
      if (xVal === null && yVal !== null) return;

      const key = `${b.model_id}__${xVal ?? '0'}__${yVal ?? '0'}`;
      labels.set(key, { ...b, xVal: xVal ?? 0, yVal: yVal ?? 0 });
    });

    const seen = new Set();
    for (const [, b] of labels) {
      const dedupKey = `${b.model_id}__${b.server || 'primary'}`;
      if (!seen.has(dedupKey)) {
        seen.add(dedupKey);
        dataPoints.push({
          x: b.xVal,
          y: b.yVal,
          model: b.model,
          model_id: b.model_id,
          quant: b.quant,
          tokens_sec: b.tokens_sec ?? 0,
          score: b.score ?? 0,
          score_stddev: b.score_stddev ?? 0,
          runs_count: b.runs_count ?? 1,
          status: b.status || 'testing',
          vram_gb: b.vram_gb,
          vram_total_gb: b.vram_total_gb || (b.server === 'secondary' ? 6 : 16),
          server: b.server || 'primary',
        });
      }
    }

    return {
      datasets: [{
        label: '',
        data: dataPoints,
        backgroundColor: (ctx) => getBubbleColor(ctx.dataset.data[ctx.dataIndex]),
        borderColor: (ctx) => {
          const item = ctx.dataset.data[ctx.dataIndex];
          if (!item) return 'rgba(255,255,255,0.3)';
          if (item.server === 'secondary') return '#f59e0b';
          return item.status === 'good' ? '#14b8a6' : '#9ca3af';
        },
        borderWidth: (ctx) => {
          const item = ctx.dataset.data[ctx.dataIndex];
          if (!item) return 1;
          if (item.server === 'secondary') return 2.5;
          return item.status === 'good' ? 2 : 1.5;
        },
        borderDash: (ctx) => {
          const item = ctx.dataset.data[ctx.dataIndex];
          if (!item) return [];
          if (item.server === 'secondary') return [4, 3];
          return item.status !== 'good' ? [6, 4] : [];
        },
        // Bubble area encodes VRAM utilization % (larger = fuller GPU).
        // Subtle range: 5px for empty GPU → 13px for near-full GPU.
        pointRadius: (ctx) => {
          const item = ctx.dataset.data[ctx.dataIndex];
          if (!item) return 7;
          const total = item.vram_total_gb || 16.0;
          const vram = item.vram_gb || 0;
          const pct = Math.min(1, vram / total);
          return 5 + pct * 8;
        },
      }],
    };
  }

  _chartOptions() {
    return {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      scales: {
        x: {
          title: {
            display: true,
            text: 'VRAM (GB)',
            color: '#9ca3af',
            font: { size: 12 },
          },
          ticks: {
            color: '#9ca3af',
            callback: v => `${v} GB`,
          },
          grid: {
            color: 'rgba(255,255,255,0.04)',
          },
        },
        y: {
          title: {
            display: true,
            text: 'Overall Score',
            color: '#9ca3af',
            font: { size: 12 },
          },
          ticks: {
            color: '#9ca3af',
          },
          grid: {
            color: 'rgba(255,255,255,0.04)',
          },
        },
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          enabled: true,
          backgroundColor: 'rgba(17, 24, 39, 0.95)',
          titleColor: '#e5e7eb',
          bodyColor: '#d1d5db',
          borderColor: 'rgba(99,102,241,0.3)',
          borderWidth: 1,
          cornerRadius: 8,
          padding: 12,
          titleFont: { size: 13, weight: 'bold' },
          bodyFont: { size: 12 },
          callbacks: {
            title: (items) => {
              const item = items[0]?.raw;
              return item ? item.model : '';
            },
            label: (item) => {
              const d = item.raw;
              if (!d) return '';
              const total = d.vram_total_gb || (d.server === 'secondary' ? 6 : 16);
              const vram = d.vram_gb || 0;
              const pct = total > 0 ? Math.round((vram / total) * 100) : 0;
              const lines = [];
              lines.push(`Server: ${d.server === 'secondary' ? 'GTX 1060 (Secondary)' : 'Tesla P100 (Primary)'}`);
              if (d.quant) lines.push(`Quantization: ${d.quant}`);
              if (d.vram_gb !== null && d.vram_gb !== undefined) {
                lines.push(`VRAM: ${d.vram_gb} GB / ${total} GB (${pct}%)`);
              } else {
                lines.push('VRAM: —');
              }
              if (d.score !== null && d.score !== undefined) {
                lines.push(`Score: ${d.score}`);
              }
              if (d.score_stddev > 0) {
                lines.push(`± StdDev: ${d.score_stddev} (${d.runs_count} runs)`);
              }
              if (d.tokens_sec !== null && d.tokens_sec !== undefined) {
                lines.push(`Speed: ${d.tokens_sec} t/s`);
              }
              return lines;
            },
          },
        },
      },
      onClick: (_evt, elements) => {
        if (elements.length > 0) {
          const item = this.chart.data.datasets[0].data[elements[0].index];
          if (item && item.model_id) {
            this.dispatchEvent(new CustomEvent('bubble-click', {
              detail: { model_id: item.model_id },
              bubbles: true,
              composed: true,
            }));
          }
        }
      },
      onHover: (_evt, elements) => {
        if (elements.length > 0) {
          const item = this.chart.data.datasets[0].data[elements[0].index];
          if (item && item.model_id) {
            this.highlightedModelId = item.model_id;
          }
        }
      },
    };
  }

  render() {
    return html`
      <div class="card">
        <h3>📊 VRAM vs Score — Model Comparison</h3>
        <h4>Bubble size: VRAM utilization · Color: inference speed · Border: solid=primary, dashed=secondary · White bar: score ± stddev (multi-run)</h4>
        <div class="legend">
          <div class="legend-item">
            <div class="legend-dot" style="background: #14b8a6;"></div>
            <span>Primary (Tesla P100)</span>
          </div>
          <div class="legend-item">
            <div class="legend-dot" style="background: #f59e0b;"></div>
            <span>Secondary (GTX 1060)</span>
          </div>
        </div>
        <div class="chart-container">
          <canvas id="bubble-chart-canvas"></canvas>
        </div>
      </div>
    `;
  }
}

customElements.define('benchmark-bubble-chart', BenchmarkBubbleChart);
