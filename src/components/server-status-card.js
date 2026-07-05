import { LitElement, html, css } from 'lit';
import { cardStyles, buttonStyles } from './_primitives.js';

const STATUS_CLASS = {
  running: 'status-running',
  started: 'status-running',
  stopped: 'status-stopped',
  not_found: 'status-not_found',
  'not found': 'status-not_found',
  error: 'status-unknown',
};

function statusClass(status) {
  return STATUS_CLASS[status] || 'status-unknown';
}

export class ServerStatusCard extends LitElement {
  static properties = {
    servers: { type: Array },
    stats: { type: Object },
    status: { type: Object },
    actionPending: { type: Boolean },
  };

  constructor() {
    super();
    this.servers = [];
    this.stats = {};
    this.status = {};
    this.actionPending = false;
  }

  static styles = css`
${cardStyles}
${buttonStyles}

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
.status-running { background: var(--success-glow); color: var(--success); border: 1px solid rgba(16, 185, 129, 0.2); }
.status-stopped { background: var(--danger-glow); color: var(--danger); border: 1px solid rgba(239, 68, 68, 0.2); }
.status-unknown,
.status-not_found { background: rgba(255, 255, 255, 0.05); color: var(--text-muted); border: 1px solid rgba(255, 255, 255, 0.1); }

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
.bar-normal { background: var(--success); }
.bar-warning { background: var(--warning); }
.bar-danger { background: var(--danger); }
.full-width { grid-column: span 2; }

.server-row {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 12px;
  align-items: start;
  padding: 12px 0;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}
.server-row:first-child { border-top: none; }
.server-meta { font-size: 0.85rem; color: var(--text-secondary); }
.server-actions { display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
`;

  getUtilColorClass(percent) { if (percent < 50) return 'bar-normal'; if (percent < 85) return 'bar-warning'; return 'bar-danger'; }
  getTempColorClass(temp) { if (temp < 60) return 'bar-normal'; if (temp < 80) return 'bar-warning'; return 'bar-danger'; }

  _dispatchAction(serverName, action) {
    this.dispatchEvent(
      new CustomEvent('server-action', { detail: { server: serverName, action }, bubbles: true, composed: true })
    );
  }
  _handleFreeComfy() {
    this.dispatchEvent(new CustomEvent('free-comfy', { bubbles: true, composed: true }));
  }

  render() {
    const stats = this.stats || {};
    const status = this.status || {};
    const managerStatus = status.manager || {};
    const servers = Array.isArray(this.servers) ? this.servers : (status.servers || []);

    return html`
      <div>
        <div class="card">
          <div class="card-title">
            <span>⚡ LLM Service Status</span>
          </div>

          ${servers.length === 0
            ? html`<div class="server-meta">No managed LLM servers configured.</div>`
            : servers.map((srv) => {
                const st = srv.status || 'unknown';
                return html`
                  <div class="server-row" data-name="${srv.name}">
                    <div class="server-meta">
                      <div><strong>${srv.label || srv.name}</strong></div>
                      <div class="status-badge ${statusClass(st)}">● ${st}</div>
                      <div>Image: ${srv.image || 'N/A'}</div>
                      ${st === 'running' ? html`<div>Uptime: ${srv.uptime || 'N/A'}</div>` : ''}
                    </div>
                    <div class="server-actions">
                      ${st === 'running'
                        ? html`
                            <button class="btn btn-danger" ?disabled="${this.actionPending}" @click="${() => this._dispatchAction(srv.name, 'stop')}">Stop Server</button>
                            <button class="btn btn-secondary" ?disabled="${this.actionPending}" @click="${() => this._dispatchAction(srv.name, 'restart')}">⟳ Restart</button>
                          `
                        : html`
                            <button class="btn btn-primary" ?disabled="${this.actionPending}" @click="${() => this._dispatchAction(srv.name, 'start')}">Start Server</button>
                          `
                      }
                    </div>
                  </div>
                `;
              })
          }
        </div>

        <div class="card" style="margin-top: 16px;">
          <div class="card-title">App Manager</div>
          <div class="server-meta">
            <div><strong>llm-mobile</strong></div>
            <div class="status-badge ${statusClass(managerStatus.status)}">● ${managerStatus.status || 'Unknown'}</div>
            <div>Image: ${managerStatus.image || 'N/A'}</div>
            ${managerStatus.status === 'running' ? html`<div>Uptime: ${managerStatus.uptime || 'N/A'}</div>` : ''}
          </div>
          <button class="btn btn-secondary" @click="${this._handleFreeComfy}" ?disabled="${this.actionPending}" style="width: 100%; justify-content: center; padding: 12px 8px; margin-top: 12px; border-color: rgba(255, 159, 64, 0.3); background: rgba(255, 159, 64, 0.04); color: var(--text-primary);">
            🧹 Free ComfyUI
          </button>
        </div>

        <div class="card" style="margin-top: 16px;">
          <div class="card-title">System Metrics</div>
          <div class="stats-grid">
            <div class="stat-box">
              <div class="stat-header"><span>CPU Utility</span><span>${Math.round(stats.cpu_util || 0)}%</span></div>
              <div class="stat-progress"><div class="stat-bar ${this.getUtilColorClass(stats.cpu_util || 0)}" style="width: ${stats.cpu_util || 0}%"></div></div>
            </div>
            <div class="stat-box">
              <div class="stat-header"><span>CPU Temp</span><span>${Math.round(stats.cpu_temp || 0)}°C</span></div>
              <div class="stat-progress"><div class="stat-bar ${this.getTempColorClass(stats.cpu_temp || 0)}" style="width: ${stats.cpu_temp || 0}%"></div></div>
            </div>
            <div class="stat-box">
              <div class="stat-header"><span>GPU Utility</span><span>${Math.round(stats.gpu_util || 0)}%</span></div>
              <div class="stat-progress"><div class="stat-bar ${this.getUtilColorClass(stats.gpu_util || 0)}" style="width: ${stats.gpu_util || 0}%"></div></div>
            </div>
            <div class="stat-box">
              <div class="stat-header"><span>GPU Temp</span><span>${Math.round(stats.gpu_temp || 0)}°C</span></div>
              <div class="stat-progress"><div class="stat-bar ${this.getTempColorClass(stats.gpu_temp || 0)}" style="width: ${stats.gpu_temp || 0}%"></div></div>
            </div>
            <div class="stat-box full-width">
              <div class="stat-header"><span>System RAM Usage</span><span>${Math.round(stats.ram_percent || 0)}%</span></div>
              <div class="stat-progress"><div class="stat-bar ${this.getUtilColorClass(stats.ram_percent || 0)}" style="width: ${stats.ram_percent || 0}%"></div></div>
            </div>
            <div class="stat-box full-width">
              <div class="stat-header"><span>GPU VRAM Usage</span><span>${Math.round(stats.vram_percent || 0)}%</span></div>
              <div class="stat-progress"><div class="stat-bar ${this.getUtilColorClass(stats.vram_percent || 0)}" style="width: ${stats.vram_percent || 0}%"></div></div>
            </div>
            <div class="stat-box full-width">
              <div class="stat-header"><span>Host Storage (${stats.storage_used_gb || 0}GB / ${stats.storage_total_gb || 0}GB)</span><span>${Math.round(stats.storage_percent || 0)}%</span></div>
              <div class="stat-progress"><div class="stat-bar ${this.getUtilColorClass(stats.storage_percent || 0)}" style="width: ${stats.storage_percent || 0}%"></div></div>
            </div>
          </div>
        </div>
      </div>
    `;
  }
}

customElements.define('server-status-card', ServerStatusCard);
