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
    slotInfo: { type: Array },
  };

  constructor() {
    super();
    this.servers = [];
    this.stats = {};
    this.status = {};
    this.actionPending = false;
    this.slotInfo = [];
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

.processing-badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 8px;
  border-radius: var(--radius-full);
  font-size: 0.7rem;
  font-weight: 600;
  margin-left: 8px;
}
.processing-active {
  background: rgba(255, 159, 64, 0.15);
  color: var(--warning);
  border: 1px solid rgba(255, 159, 64, 0.3);
  animation: pulse-busy 1.5s ease-in-out infinite;
}
.processing-idle {
  background: rgba(16, 185, 129, 0.1);
  color: var(--success);
  border: 1px solid rgba(16, 185, 129, 0.15);
}
.processing-off {
  background: rgba(255, 255, 255, 0.04);
  color: var(--text-muted);
  border: 1px solid rgba(255, 255, 255, 0.06);
}
.processing-error {
  background: rgba(239, 68, 68, 0.08);
  color: var(--danger);
  border: 1px solid rgba(239, 68, 68, 0.15);
}

.refresh-trigger {
  background: none;
  border: none;
  cursor: pointer;
  font-size: inherit;
  padding: 0;
  line-height: 1;
  transition: transform 0.3s ease;
  color: inherit;
}
.refresh-trigger:hover {
  transform: rotate(180deg);
}

@keyframes pulse-busy {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

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

.server-meta-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 12px;
}

/* App Manager grid – 2 cols wide, 1 col narrow */
.app-manager-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
}
.app-manager-row {
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: var(--radius-md);
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.app-manager-actions {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  margin-top: auto;
  padding-top: 4px;
}

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

@media (max-width: 600px) {
  .app-manager-grid {
    grid-template-columns: 1fr;
  }
  .server-row {
    grid-template-columns: 1fr;
    gap: 8px;
  }
  .server-row .server-actions {
    justify-content: flex-start;
  }
  .server-meta-grid {
    grid-template-columns: 1fr;
  }
  .stats-grid {
    gap: 10px;
  }
  .stat-box {
    padding: 10px;
  }
  .stat-value {
    font-size: 1.05rem;
  }
}
`;

  getUtilColorClass(percent) { if (percent < 50) return 'bar-normal'; if (percent < 85) return 'bar-warning'; return 'bar-danger'; }
  getTempColorClass(temp) { if (temp < 60) return 'bar-normal'; if (temp < 80) return 'bar-warning'; return 'bar-danger'; }

  /** Return the CSS class for the processing badge based on slot info. */
  _processingClass(srvName) {
    // If not running, show off
    const srv = (this.servers || []).find(s => s.name === srvName);
    if (!srv || srv.status !== 'running') return 'processing-off';

    const slot = (this.slotInfo || []).find(s => s.name === srvName);
    if (!slot) return 'processing-off';
    if (slot.error) return 'processing-error';
    return slot.processing ? 'processing-active' : 'processing-idle';
  }

  /** Return the label text for the processing badge. */
  _processingLabel(srvName) {
    const srv = (this.servers || []).find(s => s.name === srvName);
    if (!srv || srv.status !== 'running') return '○ Offline';

    const slot = (this.slotInfo || []).find(s => s.name === srvName);
    if (!slot) return '○ —';
    if (slot.error) return '⚠ Error';
    return slot.processing ? '● Inferring…' : '○ Idle';
  }

  _dispatchAction(serverName, action) {
    this.dispatchEvent(
      new CustomEvent('server-action', { detail: { server: serverName, action }, bubbles: true, composed: true })
    );
  }
  _handleFreeComfy() {
    this.dispatchEvent(new CustomEvent('free-comfy', { bubbles: true, composed: true }));
  }
  _handleUnloadKokoro() {
    this.dispatchEvent(new CustomEvent('unload-kokoro', { bubbles: true, composed: true }));
  }
  _dispatchAppAction(appName, action) {
    this.dispatchEvent(
      new CustomEvent('app-action', { detail: { app: appName, action }, bubbles: true, composed: true })
    );
  }

  render() {
    const stats = this.stats || {};
    const status = this.status || {};
    const managerStatus = status.manager || {};
    const comfyuiStatus = status.comfyui || {};
    const kokoroStatus = status.kokoro || {};
    const servers = Array.isArray(this.servers) ? this.servers : (status.servers || []);

    return html`
      <div>
        <div class="card">
          <div class="card-title">
            <span><button class="refresh-trigger" title="Force-refresh app (clear cache & reload)" @click="${(e) => { e.stopPropagation(); this.dispatchEvent(new CustomEvent('hard-refresh', { bubbles: true, composed: true })); }}">⚡</button> LLM Service Status</span>
          </div>

          ${servers.length === 0
            ? html`<div class="server-meta">No managed LLM servers configured.</div>`
            : servers.map((srv) => {
                const st = srv.status || 'unknown';
                return html`
                  <div class="server-row" data-name="${srv.name}">
                    <div class="server-meta">
                      <div><strong>${srv.label || srv.name}</strong>
                        <span class="processing-badge ${this._processingClass(srv.name)}">${this._processingLabel(srv.name)}</span>
                      </div>
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
          <div class="app-manager-grid">

            <!-- llm-mobile (this app) -->
            <div class="app-manager-row">
              <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px;">
                <strong>llm-mobile</strong>
                <span class="status-badge ${statusClass(managerStatus.status)}">● ${managerStatus.status || 'Unknown'}</span>
              </div>
              <div class="server-meta">Image: ${managerStatus.image || 'N/A'}</div>
              ${managerStatus.status === 'running' ? html`<div class="server-meta">Uptime: ${managerStatus.uptime || 'N/A'}</div>` : ''}
              <div class="app-manager-actions">
                ${managerStatus.status === 'running'
                  ? html`
                    <button class="btn btn-danger" ?disabled="${this.actionPending}" @click="${() => this._dispatchAppAction('llm-mobile', 'stop')}">Stop</button>
                    <button class="btn btn-secondary" ?disabled="${this.actionPending}" @click="${() => this._dispatchAppAction('llm-mobile', 'restart')}">⟳ Restart</button>
                  `
                  : html`
                    <button class="btn btn-primary" ?disabled="${this.actionPending}" @click="${() => this._dispatchAppAction('llm-mobile', 'start')}">Start</button>
                  `
                }
              </div>
            </div>

            <!-- comfyui -->
            <div class="app-manager-row">
              <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px;">
                <strong>comfyui</strong>
                <span class="status-badge ${statusClass(comfyuiStatus.status)}">● ${comfyuiStatus.status || 'Unknown'}</span>
              </div>
              <div class="server-meta">Image: ${comfyuiStatus.image || 'N/A'}</div>
              ${comfyuiStatus.status === 'running' ? html`<div class="server-meta">Uptime: ${comfyuiStatus.uptime || 'N/A'}</div>` : ''}
              <div class="app-manager-actions">
                ${comfyuiStatus.status === 'running'
                  ? html`
                    <button class="btn btn-danger" ?disabled="${this.actionPending}" @click="${() => this._dispatchAppAction('comfyui', 'stop')}">Stop</button>
                    <button class="btn btn-secondary" ?disabled="${this.actionPending}" @click="${() => this._dispatchAppAction('comfyui', 'restart')}">⟳ Restart</button>
                    <button class="btn btn-secondary" @click="${this._handleFreeComfy}" ?disabled="${this.actionPending}" style="font-size:0.8rem;">🧹 Free VRAM</button>
                  `
                  : html`
                    <button class="btn btn-primary" ?disabled="${this.actionPending}" @click="${() => this._dispatchAppAction('comfyui', 'start')}">Start</button>
                  `
                }
              </div>
            </div>

            <!-- kokoro-tts -->
            <div class="app-manager-row">
              <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px;">
                <strong>kokoro-tts</strong>
                <span class="status-badge ${statusClass(kokoroStatus.status)}">● ${kokoroStatus.status || 'Unknown'}</span>
              </div>
              <div class="server-meta">Image: ${kokoroStatus.image || 'N/A'}</div>
              ${kokoroStatus.status === 'running' ? html`<div class="server-meta">Uptime: ${kokoroStatus.uptime || 'N/A'}</div>` : ''}
              <div class="app-manager-actions">
                ${kokoroStatus.status === 'running'
                  ? html`
                    <button class="btn btn-danger" ?disabled="${this.actionPending}" @click="${() => this._dispatchAppAction('kokoro-tts', 'stop')}">Stop</button>
                    <button class="btn btn-secondary" ?disabled="${this.actionPending}" @click="${() => this._dispatchAppAction('kokoro-tts', 'restart')}">⟳ Restart</button>
                    <button class="btn btn-secondary" @click="${this._handleUnloadKokoro}" ?disabled="${this.actionPending}" style="font-size:0.8rem;">❄️ Unload Model</button>
                  `
                  : html`
                    <button class="btn btn-primary" ?disabled="${this.actionPending}" @click="${() => this._dispatchAppAction('kokoro-tts', 'start')}">Start</button>
                  `
                }
              </div>
            </div>

          </div>
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

            <!-- GTX (secondary GPU) metrics -->
            <div class="stat-box">
              <div class="stat-header"><span>GTX GPU Utility</span><span>${Math.round((stats && stats.gpu_util_gtx) || 0)}%</span></div>
              <div class="stat-progress"><div class="stat-bar ${this.getUtilColorClass((stats && stats.gpu_util_gtx) || 0)}" style="width: ${(stats && stats.gpu_util_gtx) || 0}%"></div></div>
            </div>
            <div class="stat-box">
              <div class="stat-header"><span>GTX GPU Temp</span><span>${Math.round((stats && stats.gpu_temp_gtx) || 0)}°C</span></div>
              <div class="stat-progress"><div class="stat-bar ${this.getTempColorClass((stats && stats.gpu_temp_gtx) || 0)}" style="width: ${(stats && stats.gpu_temp_gtx) || 0}%"></div></div>
            </div>
            <div class="stat-box full-width">
              <div class="stat-header"><span>GTX VRAM Usage</span><span>${Math.round((stats && stats.vram_percent_gtx) || 0)}%</span></div>
              <div class="stat-progress"><div class="stat-bar ${this.getUtilColorClass((stats && stats.vram_percent_gtx) || 0)}" style="width: ${(stats && stats.vram_percent_gtx) || 0}%"></div></div>
            </div>
          </div>
        </div>
      </div>
    `;
  }
}

customElements.define('server-status-card', ServerStatusCard);
