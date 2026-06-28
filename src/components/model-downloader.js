import { LitElement, html, css } from 'lit';
import { cardStyles, buttonStyles } from './_primitives.js';

export class ModelDownloader extends LitElement {
  static properties = {
    hfSearchQuery: { type: String },
    hfSearchLoading: { type: Boolean },
    hfSearchResults: { type: Array },
    hfSelectedRepo: { type: String },
    hfRepoDetails: { type: Object },
    hfDetailsLoading: { type: Boolean },
    hfActiveDownloads: { type: Array },
    downloaderExpanded: { type: Boolean }
  };

  static styles = css`
    ${cardStyles}
    ${buttonStyles}

    .arrow-icon {
      font-size: 0.8rem;
      transition: var(--transition);
      color: var(--text-secondary);
    }
    .arrow-expanded {
      transform: rotate(180deg);
    }

    .switcher-header {
      cursor: pointer;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .switcher-body {
      max-height: 0;
      overflow: hidden;
      transition: max-height 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    }
    .switcher-body.expanded {
      max-height: none;
      margin-top: 16px;
    }

    .refresh-row {
      display: flex;
      justify-content: flex-end;
      margin-bottom: 10px;
    }
    .refresh-btn {
      padding: 6px 12px;
      font-size: 0.75rem;
      border-radius: var(--radius-sm);
      cursor: pointer;
      border: 1px solid var(--border-color);
      background: rgba(255, 255, 255, 0.04);
      color: var(--text-secondary);
      transition: var(--transition);
      font-family: var(--font-sans);
    }
    .refresh-btn:hover {
      background: rgba(255, 255, 255, 0.08);
      color: var(--text-primary);
    }

    /* Text Inputs */
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

    /* Input group */
    .input-group {
      display: flex;
      gap: 8px;
      width: 100%;
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
      color: var(--success);
      font-weight: 500;
      white-space: nowrap;
    }
    .progress-track {
      width: 100%;
      height: 4px;
      background: rgba(255, 255, 255, 0.06);
      border-radius: 2px;
      overflow: hidden;
    }
    .progress-fill {
      height: 100%;
      background: linear-gradient(90deg, var(--primary), #a5b4fc);
      transition: width 0.3s ease-out;
      border-radius: 2px;
    }
    .download-eta {
      font-size: 0.72rem;
      color: var(--text-secondary);
      white-space: nowrap;
    }
    .download-actions {
      display: flex;
      gap: 6px;
      margin-top: 4px;
      flex-wrap: wrap;
    }
    .download-action-btn {
      padding: 4px 10px;
      font-size: 0.72rem;
      border-radius: var(--radius-sm);
      cursor: pointer;
      border: 1px solid var(--border-color);
      background: rgba(255, 255, 255, 0.04);
      color: var(--text-primary);
      transition: var(--transition);
      font-family: var(--font-sans);
    }
    .download-action-btn:hover {
      background: rgba(255, 255, 255, 0.08);
    }
    .download-action-btn.danger {
      color: var(--danger);
      border-color: rgba(239, 68, 68, 0.3);
    }
    .download-action-btn.danger:hover {
      background: var(--danger-glow);
    }
    .clear-finished-btn {
      margin-top: 8px;
      padding: 8px 14px;
      font-size: 0.8rem;
      border-radius: var(--radius-md);
      cursor: pointer;
      border: 1px solid var(--border-color);
      background: rgba(255, 255, 255, 0.04);
      color: var(--text-secondary);
      transition: var(--transition);
      font-family: var(--font-sans);
      width: 100%;
      text-align: center;
    }
    .clear-finished-btn:hover {
      background: rgba(255, 255, 255, 0.08);
      color: var(--text-primary);
    }
    .empty-state {
      margin-top: 10px;
      padding: 16px;
      text-align: center;
      font-size: 0.82rem;
      color: var(--text-muted);
      border: 1px dashed rgba(255, 255, 255, 0.08);
      border-radius: var(--radius-md);
      background: rgba(0, 0, 0, 0.15);
    }

    /* Repo list styling */
    .repo-list {
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
    .model-file-item {
      display: flex;
      align-items: center;
      gap: 10px;
      justify-content: flex-start;
      padding: 12px 14px;
      background: rgba(255, 255, 255, 0.02);
      border: 1px solid var(--border-color);
      border-radius: var(--radius-md);
    }
    .search-result-item {
      background: rgba(255, 255, 255, 0.02);
      border: 1px solid var(--border-color);
      border-radius: var(--radius-md);
      padding: 14px;
      cursor: pointer;
      transition: var(--transition);
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .search-result-item:hover {
      background: rgba(99, 102, 241, 0.06);
      border-color: rgba(99, 102, 241, 0.3);
    }
    .meta-badge {
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.08);
      color: var(--text-secondary);
      border-radius: var(--radius-sm);
      padding: 2px 6px;
      font-size: 0.72rem;
      font-weight: 500;
    }
    .model-file-name {
      font-size: 0.85rem;
      font-weight: 500;
      color: var(--text-primary);
      word-break: break-all;
    }
    .model-file-size {
      font-size: 0.72rem;
      color: var(--text-secondary);
      flex-shrink: 0;
    }
    .repo-title {
      font-weight: 600;
      font-size: 0.95rem;
      color: var(--text-primary);
      word-break: break-all;
    }

    /* Loader */
    .loader {
      width: 16px;
      height: 16px;
      border: 2px solid rgba(255, 255, 255, 0.1);
      border-top-color: var(--primary);
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
      display: inline-block;
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
  `;

  constructor() {
    super();
    this.hfSearchQuery = '';
    this.hfSearchLoading = false;
    this.hfSearchResults = [];
    this.hfSelectedRepo = '';
    this.hfRepoDetails = null;
    this.hfDetailsLoading = false;
    this.hfActiveDownloads = [];
    this.downloaderExpanded = false;
    this._restoreExpandedState();
  }

  _restoreExpandedState() {
    try {
      const raw = localStorage.getItem('hf_downloader_expanded');
      if (raw === 'true') {
        this.downloaderExpanded = true;
      }
    } catch (e) {
      // ignore
    }
  }

  _saveExpandedState() {
    try {
      localStorage.setItem('hf_downloader_expanded', String(this.downloaderExpanded));
    } catch (e) {
      // ignore
    }
  }

  toggleDownloader() {
    this.downloaderExpanded = !this.downloaderExpanded;
    this._saveExpandedState();
  }

  _handleQueryInput(e) {
    this.dispatchEvent(new CustomEvent('query-change', {
      detail: { query: e.target.value }
    }));
  }

  _handleSearch() {
    this.dispatchEvent(new CustomEvent('search'));
  }

  _handleSelectRepo(repoId) {
    this.dispatchEvent(new CustomEvent('select-repo', {
      detail: { repoId }
    }));
  }

  _handleDownload(filename) {
    this.dispatchEvent(new CustomEvent('download', {
      detail: { filename }
    }));
  }

  _handleStopDownload(key) {
    this.dispatchEvent(new CustomEvent('stop-download', {
      detail: { key }
    }));
  }

  _handleResumeDownload(key) {
    this.dispatchEvent(new CustomEvent('resume-download', {
      detail: { key }
    }));
  }

  _handleCancelDownload(key) {
    this.dispatchEvent(new CustomEvent('cancel-download', {
      detail: { key }
    }));
  }

  _handleClearFinished() {
    this.dispatchEvent(new CustomEvent('clear-finished'));
  }

  formatEta(seconds) {
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins < 60) return `${mins}m ${secs}s`;
    const hrs = Math.floor(mins / 60);
    const remMins = mins % 60;
    return `${hrs}h ${remMins}m`;
  }

  _getStatusColor(status) {
    if (!status) return 'var(--text-secondary)';
    switch (status.toLowerCase()) {
      case 'downloading':
      case 'queued':
        return 'var(--primary)';
      case 'completed':
        return 'var(--success)';
      case 'failed':
      case 'cancelled':
      case 'cancelling':
        return 'var(--danger)';
      case 'paused':
      case 'pausing':
        return 'var(--warning)';
      default:
        return 'var(--text-secondary)';
    }
  }

  _getActionButtons(download) {
    const status = (download.status || '').toLowerCase();
    const key = `${download.repo_id}/${download.filename}`;

    if (['completed', 'cancelled'].includes(status)) {
      return html`<span style="font-size: 0.72rem; color: var(--text-muted);">— finished —</span>`;
    }

    if (['downloading', 'queued', 'pausing', 'cancelling'].includes(status)) {
      return html`
        <button class="download-action-btn" @click="${() => this._handleResumeDownload(key)}">▶ Resume</button>
        <button class="download-action-btn" @click="${() => this._handleStopDownload(key)}">⏸ Stop</button>
        <button class="download-action-btn danger" @click="${() => this._handleCancelDownload(key)}">✕ Cancel</button>
      `;
    }

    if (['paused', 'failed'].includes(status)) {
      return html`
        <button class="download-action-btn" @click="${() => this._handleResumeDownload(key)}">▶ Resume</button>
        <button class="download-action-btn danger" @click="${() => this._handleCancelDownload(key)}">✕ Cancel</button>
      `;
    }

    return html`<span style="font-size: 0.72rem; color: var(--text-muted);">${download.status || 'Unknown'}</span>`;
  }

  render() {
    const hasActiveDownloads = this.hfActiveDownloads?.length > 0;
    const hasFinishedDownloads = hasActiveDownloads && this.hfActiveDownloads.some(
      d => ['completed', 'cancelled'].includes((d.status || '').toLowerCase())
    );

    return html`
      <div class="card">
        <div class="switcher-header" @click="${this.toggleDownloader}">
          <div class="card-title" style="margin-bottom: 0;">📦 Hugging Face Model Downloader</div>
          <div class="arrow-icon ${this.downloaderExpanded ? 'arrow-expanded' : ''}">▼</div>
        </div>
        <div class="switcher-body ${this.downloaderExpanded ? 'expanded' : ''}">
          <span class="card-subtitle" style="display: block; font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 12px; line-height: 1.4;">
            Search and download GGUF models directly from the Hub.
          </span>

          <!-- Search Bar -->
          <div class="input-group">
            <input
              type="text"
              class="text-input"
              placeholder="Search HuggingFace (e.g., llama.cpp)"
              .value="${this.hfSearchQuery}"
              @input="${this._handleQueryInput}"
              @keydown="${e => e.key === 'Enter' && this._handleSearch()}"
            >
            <button
              class="btn btn-secondary"
              style="padding: 8px 14px; font-size: 0.85rem;"
              @click="${this._handleSearch}"
              ?disabled="${this.hfSearchLoading}"
            >
              🔍 Search
            </button>
          </div>

          <!-- Loading State -->
          ${this.hfSearchLoading ? html`
            <div style="text-align: center; padding: 30px 0; display: flex; flex-direction: column; align-items: center; gap: 10px;">
              <span class="loader" style="border-top-color: var(--primary);"></span>
              Loading...
            </div>
          ` : ''}

          <!-- Search Results -->
          ${!this.hfSearchLoading && this.hfSearchResults?.length > 0 ? html`
            <h3 style="font-size: 0.9rem; margin-bottom: 8px; color: var(--text-primary); margin-top: 16px;">🔎 Search Results</h3>
            <div class="repo-list">
              ${this.hfSearchResults.map(repo => html`
                <div class="search-result-item" @click="${() => this._handleSelectRepo(repo.id)}">
                  <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 6px; text-align: left;">
                    <span style="font-size: 0.75rem; color: var(--text-secondary); flex-shrink: 0;">⭐ ${repo.likes || 0}</span>
                    <span style="font-size: 0.75rem; color: var(--text-muted); flex-shrink: 0;">📥 ${repo.downloads || 0}</span>
                  </div>
                  <div class="repo-title">${repo.id}</div>
                </div>
              `)}
            </div>
          ` : ''}

          <!-- Repository Details -->
          ${!this.hfSearchLoading && this.hfSelectedRepo ? html`
            <div style="margin-top: 16px; padding-top: 12px; border-top: 1px solid var(--border-color);">
              <h3 style="font-size: 0.9rem; margin-bottom: 8px; color: #a5b4fc;">📂 Repository: ${this.hfSelectedRepo}</h3>

              <!-- Repo Info -->
              <div style="display: flex; gap: 6px; font-size: 0.72rem; margin-bottom: 12px; flex-wrap: wrap;">
                ${this.hfRepoDetails ? html`
                  <span class="meta-badge">📥 ${this.hfRepoDetails.downloads || 0} downloads</span>
                  <span class="meta-badge">⬆️ Last updated: ${this.hfRepoDetails.last_modified || 'N/A'}</span>
                ` : ''}
              </div>

              <!-- Loading for repo details -->
              ${!this.hfSearchLoading && this.hfSelectedRepo && this.hfDetailsLoading ? html`
                <div style="text-align: center; padding: 20px;"><span class="loader" style="border-top-color: var(--primary);"></span> Loading repo files...</div>
              ` : ''}

              <!-- Model Files -->
              ${this.hfRepoDetails && this.hfRepoDetails.gguf_files ? html`
                <h4 style="font-size: 0.8rem; margin-bottom: 6px; color: var(--text-secondary);">Available GGUF Files (sorted by size, largest first):</h4>
                <div class="repo-list">
                  ${[...this.hfRepoDetails.gguf_files].sort((a, b) => (b.size || 0) - (a.size || 0)).map(file => html`
                    <div class="model-file-item">
                      <button
                        class="btn btn-primary"
                        style="padding: 6px 12px; font-size: 0.75rem; white-space: nowrap; flex-shrink: 0;"
                        @click="${() => this._handleDownload(file.filename)}"
                      >
                        ⬇️ Download
                      </button>
                      ${file.size ? html`<span class="model-file-size">⚖️ ${(file.size / (1024 * 1024 * 1024)).toFixed(2)} GB</span>` : ''}
                      <span class="model-file-name">${file.filename}</span>
                    </div>
                  `)}
                </div>
              ` : ''}
            </div>
          ` : ''}

          <!-- Active Downloads -->
          ${hasActiveDownloads ? html`
            <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 16px; padding-top: 12px; border-top: 1px solid var(--border-color);">
              <h4 style="font-size: 0.8rem; color: var(--text-secondary); margin: 0;">📡 Active Downloads:</h4>
            </div>
            <div class="downloads-container">
              ${this.hfActiveDownloads.map(d => {
                const speedMatch = (d.speed || '').match(/([\d.]+)\s*(KB\/s|MB\/s)/);
                const speedBps = speedMatch ? parseFloat(speedMatch[1]) * (speedMatch[2] === 'KB/s' ? 1024 : 1048576) : 0;
                const remainingBytes = Math.max(0, d.total - (d.downloaded || 0));
                let etaSec = null;
                if (speedBps > 0 && remainingBytes > 0) {
                  etaSec = Math.ceil(remainingBytes / speedBps);
                }
                const etaStr = etaSec !== null ? this.formatEta(etaSec) : '';

                return html`
                  <div class="download-item">
                    <div class="download-info">
                      <span class="download-filename">${d.filename || d.repo_id + '/' + (d.filename || '')}</span>
                      <span class="download-speed" style="color: ${this._getStatusColor(d.status)};">
                        ${d.status || 'Complete'}
                      </span>
                    </div>
                    <div class="progress-track">
                      <div class="progress-fill" style="width: ${(d.progress * 100).toFixed(1)}%"></div>
                    </div>
                    <div class="download-eta">
                      ${Math.round(d.progress * 100)}% — Speed: ${d.speed || 'N/A'}${etaStr ? ` — ETA: ${etaStr}` : ''}
                    </div>
                    <div class="download-actions">
                      ${this._getActionButtons(d)}
                    </div>
                    ${d.error ? html`<div style="color: var(--danger); font-size: 0.72rem; margin-top: 2px;">Error: ${d.error}</div>` : ''}
                  </div>
                `;
              })}
            </div>
            ${hasFinishedDownloads ? html`
              <button
                class="clear-finished-btn"
                @click="${this._handleClearFinished}"
              >
                🧹 Clear Finished Downloads
              </button>
            ` : ''}
          ` : html`
            <div class="empty-state" style="margin-top: 16px;">
              No active downloads. Search and download a model to get started.
            </div>
          `}
        </div>
      </div>
    `;
  }
}

customElements.define('model-downloader', ModelDownloader);