import { LitElement, html, css } from 'lit';
import { cardStyles, buttonStyles } from './_primitives.js';

export class ModelsConfigEditor extends LitElement {
  static properties = {
    models: { type: Array },
    activeModel: { type: String },
    loadingModel: { type: Boolean },
    actionPending: { type: Boolean },
    modelsIniText: { type: String },
    modelsIniLoading: { type: Boolean },
    isServerRunning: { type: Boolean },
    
    // Local UI states
    switcherExpanded: { type: Boolean },
    configExpanded: { type: Boolean },
    iniExpanded: { type: Boolean },
    modelToDelete: { type: String }
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

    .active-model-info {
      background: rgba(99, 102, 241, 0.06);
      border: 1px solid rgba(99, 102, 241, 0.15);
      border-radius: var(--radius-md);
      padding: 12px;
      margin-bottom: 16px;
      font-size: 0.85rem;
    }

    .select-label {
      font-size: 0.8rem;
      font-weight: 500;
      color: var(--text-secondary);
      margin-bottom: 8px;
    }

    select {
      width: 100%;
      padding: 12px;
      background: rgba(0, 0, 0, 0.2);
      border: 1px solid var(--border-color);
      border-radius: var(--radius-md);
      color: var(--text-primary);
      font-family: var(--font-sans);
      font-size: 0.9rem;
      outline: none;
      cursor: pointer;
      appearance: none;
      -webkit-appearance: none;
      background-image: url("data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%239ca3af' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E");
      background-repeat: no-repeat;
      background-position: right 12px center;
      background-size: 16px;
      padding-right: 40px;
      transition: var(--transition);
    }

    option {
      background: #0f172a;
      color: #ffffff;
    }

    select:focus {
      border-color: var(--primary);
    }

    .btn-group {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
      margin-top: 16px;
    }

    /* Text Inputs for edit models.ini */
    .text-input {
      width: 100%;
      box-sizing: border-box;
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

    /* file list & downloaded items styling */
    .file-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin-bottom: 16px;
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
      transition: var(--transition);
    }

    .model-file-item:hover {
      background: rgba(255, 255, 255, 0.04);
      border-color: rgba(99, 102, 241, 0.4);
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

    /* Modal dialog */
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

    .modal-title {
      font-family: var(--font-title);
      font-size: 1.15rem;
      color: var(--text-primary);
      margin: 0;
    }

    .modal-body {
      font-size: 0.88rem;
      color: var(--text-secondary);
      line-height: 1.4;
      margin: 0;
    }

    .modal-actions {
      display: flex;
      gap: 12px;
      justify-content: flex-end;
    }

    @keyframes scaleIn {
      from { transform: scale(0.95); opacity: 0; }
      to { transform: scale(1); opacity: 1; }
    }

    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }

    .card-container {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
  `;

  constructor() {
    super();
    this.models = [];
    this.activeModel = '';
    this.loadingModel = false;
    this.actionPending = false;
    this.modelsIniText = '';
    this.modelsIniLoading = false;
    this.isServerRunning = false;
    this.switcherExpanded = false;
    this.configExpanded = false;
    this.iniExpanded = false;
    this.modelToDelete = null;
  }

  toggleSwitcher() {
    this.switcherExpanded = !this.switcherExpanded;
  }

  toggleConfig() {
    this.configExpanded = !this.configExpanded;
  }

  toggleIni() {
    this.iniExpanded = !this.iniExpanded;
  }

  _handleSelectModelChange(e) {
    const selected = e.target.value;
    this.dispatchEvent(new CustomEvent('select-model-change', {
      detail: { model: selected }
    }));
  }

  _handleLoadModel() {
    const selectEl = this.shadowRoot.querySelector('#model-select');
    const model = selectEl ? selectEl.value : '';
    if (model) {
      this.dispatchEvent(new CustomEvent('load-model', {
        detail: { model }
      }));
    }
  }

  _handleUnloadModel() {
    this.dispatchEvent(new CustomEvent('unload-model'));
  }

  _showDeleteConfirm(filename) {
    this.modelToDelete = filename;
  }

  _closeDeleteConfirm() {
    this.modelToDelete = null;
  }

  _executeDelete() {
    const filename = this.modelToDelete;
    this._closeDeleteConfirm();
    if (filename) {
      this.dispatchEvent(new CustomEvent('delete-model', {
        detail: { filename }
      }));
    }
  }

  _handleIniInput(e) {
    this.dispatchEvent(new CustomEvent('change', {
      detail: { text: e.target.value }
    }));
  }

  _handleScan() {
    this.dispatchEvent(new CustomEvent('scan'));
  }

  _handleReload() {
    this.dispatchEvent(new CustomEvent('reload'));
  }

  _handleSave() {
    this.dispatchEvent(new CustomEvent('save'));
  }

  render() {
    return html`
      <div class="card-container">
        <!-- Model Switcher Card -->
        <div class="card">
          <div class="switcher-header" @click="${this.toggleSwitcher}">
            <div class="card-title" style="margin-bottom: 0;">🤖 Active LLM Model</div>
            <div class="arrow-icon ${this.switcherExpanded ? 'arrow-expanded' : ''}">▼</div>
          </div>

          <div class="switcher-body ${this.switcherExpanded ? 'expanded' : ''}">
            <div class="active-model-info">
              <strong>Currently Loaded:</strong> 
              <span style="color: var(--primary); font-weight: 600;">
                ${this.activeModel || 'None (No model loaded in VRAM)'}
              </span>
            </div>

            ${this.isServerRunning ? html`
              <div class="select-label">Select GGUF model from models.ini:</div>
              <select id="model-select" ?disabled="${this.actionPending}" @change="${this._handleSelectModelChange}">
                <option value="">-- Choose a Model --</option>
                ${this.models.map(m => html`
                  <option value="${m.filename}" ?selected="${this.activeModel === m.filename}">
                    ${m.filename} ${m.is_default ? '⭐ (Default)' : ''}
                  </option>
                `)}
              </select>

              <div class="btn-group">
                <button 
                  class="btn btn-primary" 
                  @click="${this._handleLoadModel}"
                  ?disabled="${this.actionPending || this.loadingModel}"
                >
                  ${this.loadingModel ? 'Loading...' : 'Load Model'}
                </button>
                <button 
                  class="btn btn-secondary" 
                  @click="${this._handleUnloadModel}"
                  ?disabled="${this.actionPending || !this.activeModel}"
                >
                  Unload
                </button>
              </div>
            ` : html`
              <div style="color: var(--text-muted); font-size: 0.85rem; text-align: center; padding: 16px 0;">
                Please start the llama-server to load models.
              </div>
            `}
          </div>
        </div>

        <!-- Models Config (GGUF File Manager) Card -->
        <div class="card">
          <div class="switcher-header" @click="${this.toggleConfig}">
            <div class="card-title" style="margin-bottom: 0;">📁 Models Config</div>
            <div class="arrow-icon ${this.configExpanded ? 'arrow-expanded' : ''}">▼</div>
          </div>

          <div class="switcher-body ${this.configExpanded ? 'expanded' : ''}">
            <span class="card-subtitle" style="display: block; font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 12px; line-height: 1.4;">
              Inspect, edit, save, and reload your model configurations (<code>models.ini</code>), or delete unused GGUF files.
            </span>
            <div style="margin-top: 4px;">
              <h3 style="font-size: 0.9rem; margin-bottom: 12px; color: var(--text-primary); display: flex; align-items: center; gap: 6px;">
                💾 Downloaded GGUF Files on Disk
              </h3>
              ${this.models.length === 0 ? html`
                <p style="font-size: 0.85rem; color: var(--text-secondary); font-style: italic; margin-bottom: 12px; padding: 8px 12px; background: rgba(255,255,255,0.02); border-radius: var(--radius-sm);">
                  No downloaded GGUF files found on disk or listed in models.ini.
                </p>
              ` : html`
                <div class="file-list">
                  ${this.models.map(m => html`
                    <div class="model-file-item">
                      <button 
                        class="btn btn-danger" 
                        style="padding: 6px 12px; font-size: 0.8rem; flex-shrink: 0;"
                        @click="${() => this._showDeleteConfirm(m.filename)}"
                      >
                        🗑️ Delete
                      </button>
                      <div style="display: flex; flex-direction: column; gap: 4px; text-align: left;">
                        <span class="model-file-name">${m.filename}</span>
                        <div style="display: flex; gap: 6px; align-items: center;">
                          ${m.size ? html`<span class="meta-badge">${m.size}</span>` : ''}
                          ${m.is_default ? html`<span class="meta-badge" style="background: rgba(99,102,241,0.15); color: #a5b4fc; border-color: rgba(99,102,241,0.25);">⭐ Default</span>` : ''}
                        </div>
                      </div>
                    </div>
                  `)}
                </div>
              `}
            </div>
          </div>
        </div>

        <!-- Edit models.ini Card -->
        <div class="card">
          <div class="switcher-header" @click="${this.toggleIni}">
            <div class="card-title" style="margin-bottom: 0;">📝 Edit models.ini</div>
            <div class="arrow-icon ${this.iniExpanded ? 'arrow-expanded' : ''}">▼</div>
          </div>

          <div class="switcher-body ${this.iniExpanded ? 'expanded' : ''}">
            <div style="display: flex; flex-direction: column; gap: 8px;">
              <textarea 
                class="text-input" 
                style="font-family: var(--font-mono); font-size: 0.8rem; line-height: 1.5; min-height: 250px; resize: vertical; background: rgba(0, 0, 0, 0.4); border: 1px solid var(--border-color); color: #22c55e; padding: 12px; border-radius: var(--radius-md);" 
                .value="${this.modelsIniText}"
                @input="${this._handleIniInput}"
                ?disabled="${this.modelsIniLoading}"
                placeholder="Loading models.ini..."
              ></textarea>
              
              <div style="display: flex; gap: 8px; justify-content: flex-end; margin-top: 4px; flex-wrap: wrap;">
                <button 
                  class="btn btn-secondary" 
                  style="padding: 8px 16px; font-size: 0.85rem; border-color: rgba(99,102,241,0.25); color: #a5b4fc; background: rgba(99,102,241,0.04);" 
                  @click="${this._handleScan}"
                  ?disabled="${this.modelsIniLoading}"
                >
                  🔍 Scan & Auto-Add Missing
                </button>
                <button 
                  class="btn btn-secondary" 
                  style="padding: 8px 16px; font-size: 0.85rem;" 
                  @click="${this._handleReload}"
                  ?disabled="${this.modelsIniLoading}"
                >
                  ⟳ Reload
                </button>
                <button 
                  class="btn btn-primary" 
                  style="padding: 8px 16px; font-size: 0.85rem;" 
                  @click="${this._handleSave}"
                  ?disabled="${this.modelsIniLoading}"
                >
                  💾 Save Config
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Delete GGUF Model Confirmation Dialog -->
      ${this.modelToDelete ? html`
        <div class="modal-backdrop">
          <div class="modal">
            <h3 class="modal-title">Delete GGUF Model</h3>
            <p class="modal-body">
              Are you sure you want to delete <strong>${this.modelToDelete}</strong>?
              This will permanently delete the GGUF file from disk and automatically remove its configuration block from <code>models.ini</code>.
            </p>
            <div class="modal-actions">
              <button class="btn btn-secondary" style="padding: 8px 16px;" @click="${this._closeDeleteConfirm}">Cancel</button>
              <button class="btn btn-danger" style="padding: 8px 16px;" @click="${this._executeDelete}">
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      ` : ''}
    `;
  }
}

customElements.define('models-config-editor', ModelsConfigEditor);