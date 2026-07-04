import os

with open("src/components/model-downloader.js", "r") as f:
    content = f.read()

os.makedirs("src/components/model-downloader", exist_ok=True)

# 1. _styles.js
styles_code = "import { css } from 'lit';\nimport { cardStyles, buttonStyles } from '../_primitives.js';\n\nexport const modelDownloaderStyles = " + content[content.find("css`"):content.find("`;", content.find("css`")) + 2] + "\n"
with open("src/components/model-downloader/_styles.js", "w") as f:
    f.write(styles_code)

# 2. _logic.js
logic_code = """export function handleQueryInput(ctx, e) {
  ctx.dispatchEvent(new CustomEvent('query-change', {
    detail: { query: e.target.value }
  }));
}

export function handleSearch(ctx) {
  ctx.dispatchEvent(new CustomEvent('search'));
}

export function handleSelectRepo(ctx, repoId) {
  ctx.dispatchEvent(new CustomEvent('select-repo', {
    detail: { repoId }
  }));
}

export function handleDownload(ctx, filename) {
  ctx.dispatchEvent(new CustomEvent('download', {
    detail: { filename }
  }));
}

export function handleStopDownload(ctx, key) {
  ctx.dispatchEvent(new CustomEvent('stop-download', {
    detail: { key }
  }));
}

export function handleResumeDownload(ctx, key) {
  ctx.dispatchEvent(new CustomEvent('resume-download', {
    detail: { key }
  }));
}

export function handleCancelDownload(ctx, key) {
  ctx.dispatchEvent(new CustomEvent('cancel-download', {
    detail: { key }
  }));
}

export function handleClearFinished(ctx) {
  ctx.dispatchEvent(new CustomEvent('clear-finished'));
}

export function formatEta(seconds) {
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins < 60) return `${mins}m ${secs}s`;
  const hrs = Math.floor(mins / 60);
  const remMins = mins % 60;
  return `${hrs}h ${remMins}m`;
}

export function getStatusColor(status) {
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
"""
with open("src/components/model-downloader/_logic.js", "w") as f:
    f.write(logic_code)

# 3. _templates.js
templates_code = """import { html } from 'lit';
import { 
  handleQueryInput, handleSearch, handleSelectRepo, 
  handleDownload, handleStopDownload, handleResumeDownload, 
  handleCancelDownload, handleClearFinished, 
  formatEta, getStatusColor 
} from './_logic.js';

export function renderActionButtons(ctx, download) {
  const status = (download.status || '').toLowerCase();
  const key = `${download.repo_id}/${download.filename}`;

  if (['completed', 'cancelled'].includes(status)) {
    return html`<span style="font-size: 0.72rem; color: var(--text-muted);">— finished —</span>`;
  }

  if (['downloading', 'queued', 'pausing', 'cancelling'].includes(status)) {
    return html`
      <button class="download-action-btn" @click="${() => handleResumeDownload(ctx, key)}">▶ Resume</button>
      <button class="download-action-btn" @click="${() => handleStopDownload(ctx, key)}">⏸ Stop</button>
      <button class="download-action-btn danger" @click="${() => handleCancelDownload(ctx, key)}">✕ Cancel</button>
    `;
  }

  if (['paused', 'failed'].includes(status)) {
    return html`
      <button class="download-action-btn" @click="${() => handleResumeDownload(ctx, key)}">▶ Resume</button>
      <button class="download-action-btn danger" @click="${() => handleCancelDownload(ctx, key)}">✕ Cancel</button>
    `;
  }

  return html`<span style="font-size: 0.72rem; color: var(--text-muted);">${download.status || 'Unknown'}</span>`;
}

export function renderModelDownloader(ctx) {
  const hasActiveDownloads = ctx.hfActiveDownloads?.length > 0;
  const hasFinishedDownloads = hasActiveDownloads && ctx.hfActiveDownloads.some(
    d => ['completed', 'cancelled'].includes((d.status || '').toLowerCase())
  );

  return html`
    <div class="card">
      <div class="switcher-header" @click="${() => ctx.toggleDownloader()}">
        <div class="card-title" style="margin-bottom: 0;">📦 Hugging Face Model Downloader</div>
        <div class="arrow-icon ${ctx.downloaderExpanded ? 'arrow-expanded' : ''}">▼</div>
      </div>
      <div class="switcher-body ${ctx.downloaderExpanded ? 'expanded' : ''}">
        <span class="card-subtitle" style="display: block; font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 12px; line-height: 1.4;">
          Search and download GGUF models directly from the Hub.
        </span>

        <!-- Search Bar -->
        <div class="input-group">
          <input
            type="text"
            class="text-input"
            placeholder="Search HuggingFace (e.g., llama.cpp)"
            .value="${ctx.hfSearchQuery}"
            @input="${(e) => handleQueryInput(ctx, e)}"
            @keydown="${e => e.key === 'Enter' && handleSearch(ctx)}"
          >
          <button
            class="btn btn-secondary"
            style="padding: 8px 14px; font-size: 0.85rem;"
            @click="${() => handleSearch(ctx)}"
            ?disabled="${ctx.hfSearchLoading}"
          >
            🔍 Search
          </button>
        </div>

        <!-- Loading State -->
        ${ctx.hfSearchLoading ? html`
          <div style="text-align: center; padding: 30px 0; display: flex; flex-direction: column; align-items: center; gap: 10px;">
            <span class="loader" style="border-top-color: var(--primary);"></span>
            Loading...
          </div>
        ` : ''}

        <!-- Search Results -->
        ${!ctx.hfSearchLoading && ctx.hfSearchResults?.length > 0 ? html`
          <h3 style="font-size: 0.9rem; margin-bottom: 8px; color: var(--text-primary); margin-top: 16px;">🔎 Search Results</h3>
          <div class="repo-list">
            ${ctx.hfSearchResults.map(repo => html`
              <div class="search-result-item" @click="${() => handleSelectRepo(ctx, repo.id)}">
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
        ${!ctx.hfSearchLoading && ctx.hfSelectedRepo ? html`
          <div style="margin-top: 16px; padding-top: 12px; border-top: 1px solid var(--border-color);">
            <h3 style="font-size: 0.9rem; margin-bottom: 8px; color: #a5b4fc;">📂 Repository: ${ctx.hfSelectedRepo}</h3>

            <!-- Repo Info -->
            <div style="display: flex; gap: 6px; font-size: 0.72rem; margin-bottom: 12px; flex-wrap: wrap;">
              ${ctx.hfRepoDetails ? html`
                <span class="meta-badge">📥 ${ctx.hfRepoDetails.downloads || 0} downloads</span>
                <span class="meta-badge">⬆️ Last updated: ${ctx.hfRepoDetails.last_modified || 'N/A'}</span>
              ` : ''}
            </div>

            <!-- Loading for repo details -->
            ${!ctx.hfSearchLoading && ctx.hfSelectedRepo && ctx.hfDetailsLoading ? html`
              <div style="text-align: center; padding: 20px;"><span class="loader" style="border-top-color: var(--primary);"></span> Loading repo files...</div>
            ` : ''}

            <!-- Model Files -->
            ${ctx.hfRepoDetails && ctx.hfRepoDetails.gguf_files ? html`
              <h4 style="font-size: 0.8rem; margin-bottom: 6px; color: var(--text-secondary);">Available GGUF Files (sorted by size, largest first):</h4>
              <div class="repo-list">
                ${[...ctx.hfRepoDetails.gguf_files].sort((a, b) => (b.size || 0) - (a.size || 0)).map(file => html`
                  <div class="model-file-item">
                    <button
                      class="btn btn-primary"
                      style="padding: 6px 12px; font-size: 0.75rem; white-space: nowrap; flex-shrink: 0;"
                      @click="${() => handleDownload(ctx, file.filename)}"
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
            ${ctx.hfActiveDownloads.map(d => {
              const speedMatch = (d.speed || '').match(/([\d.]+)\s*(KB\\/s|MB\\/s)/);
              const speedBps = speedMatch ? parseFloat(speedMatch[1]) * (speedMatch[2] === 'KB/s' ? 1024 : 1048576) : 0;
              const remainingBytes = Math.max(0, d.total - (d.downloaded || 0));
              let etaSec = null;
              if (speedBps > 0 && remainingBytes > 0) {
                etaSec = Math.ceil(remainingBytes / speedBps);
              }
              const etaStr = etaSec !== null ? formatEta(etaSec) : '';

              return html`
                <div class="download-item">
                  <div class="download-info">
                    <span class="download-filename">${d.filename || d.repo_id + '/' + (d.filename || '')}</span>
                    <span class="download-speed" style="color: ${getStatusColor(d.status)};">
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
                    ${renderActionButtons(ctx, d)}
                  </div>
                  ${d.error ? html`<div style="color: var(--danger); font-size: 0.72rem; margin-top: 2px;">Error: ${d.error}</div>` : ''}
                </div>
              `;
            })}
          </div>
          ${hasFinishedDownloads ? html`
            <button
              class="clear-finished-btn"
              @click="${() => handleClearFinished(ctx)}"
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
"""
with open("src/components/model-downloader/_templates.js", "w") as f:
    f.write(templates_code)

# 4. model-downloader.js (main)
main_code = """import { LitElement, html } from 'lit';
import { modelDownloaderStyles } from './model-downloader/_styles.js';
import { renderModelDownloader } from './model-downloader/_templates.js';

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

  static styles = modelDownloaderStyles;

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

  render() {
    return renderModelDownloader(this);
  }
}

customElements.define('model-downloader', ModelDownloader);
"""
with open("src/components/model-downloader.js", "w") as f:
    f.write(main_code)
