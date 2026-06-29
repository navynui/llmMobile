import { LitElement, html, css } from 'lit';
import { cardStyles, buttonStyles } from './_primitives.js';

export class ServerStatusCard extends LitElement {
  static properties = {
    stats: { type: Object },
    status: { type: Object },
    actionPending: { type: Boolean }
  };

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
    
    .full-width {
      grid-column: span 2;
    }

    .status-cards-container {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
  `;

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

  _handleToggle() {
    const isRunning = this.status?.server?.status === 'running';
    if (isRunning) {
      this.dispatchEvent(new CustomEvent('stop', { bubbles: true, composed: true }));
    } else {
      this.dispatchEvent(new CustomEvent('start', { bubbles: true, composed: true }));
    }
  }

  _handleRestart() {
    this.dispatchEvent(new CustomEvent('restart', { bubbles: true, composed: true }));
  }

  _handleFreeComfy() {
    this.dispatchEvent(new CustomEvent('free-comfy', { bubbles: true, composed: true }));
  }

  render() {
    const status = this.status || {};
    const stats = this.stats || {};
    const serverStatus = status.server || {};
    const isServerRunning = serverStatus.status === 'running';

    return html`
      <div class="status-cards-container">
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
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 12px;">
            <button 
              class="btn ${isServerRunning ? 'btn-danger' : 'btn-primary'}" 
              @click="${this._handleToggle}"
              ?disabled="${this.actionPending}"
              style="justify-content: center; padding: 12px 8px;"
            >
              ${isServerRunning ? 'Stop Server' : 'Start Server'}
            </button>
            <button 
              class="btn ${isServerRunning ? 'btn-secondary' : 'btn-primary'}" 
              @click="${this._handleRestart}"
              ?disabled="${this.actionPending || !isServerRunning}"
              style="justify-content: center; padding: 12px 8px; border-color: rgba(99,102,241,0.3); background: rgba(99,102,241,0.04); color: var(--text-primary);"
            >
              ⟳ Restart Server
            </button>
          </div>
          <button 
            class="btn btn-secondary" 
            @click="${this._handleFreeComfy}"
            ?disabled="${this.actionPending}"
            style="width: 100%; justify-content: center; padding: 12px 8px; margin-top: 8px; border-color: rgba(255, 159, 64, 0.3); background: rgba(255, 159, 64, 0.04); color: var(--text-primary);"
          >
            🧹 Free ComfyUI
          </button>
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
      </div>
    `;
  }
}

customElements.define('server-status-card', ServerStatusCard);