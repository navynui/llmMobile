import { html } from 'lit';
import { 
  handleSelectModelChange, handleLoadModel, handleUnloadModel, 
  showDeleteConfirm, closeDeleteConfirm, executeDelete, 
  handleIniInput, handleScan, handleReload, handleSave 
} from './_logic.js';

export function renderModelSwitcher(ctx) {
  return html`
    <div class="card">
      <div class="switcher-header" @click="${() => ctx.toggleSwitcher()}">
        <div class="card-title" style="margin-bottom: 0;">🤖 Active LLM Model</div>
        <div class="arrow-icon ${ctx.switcherExpanded ? 'arrow-expanded' : ''}">▼</div>
      </div>

      <div class="switcher-body ${ctx.switcherExpanded ? 'expanded' : ''}">
        <div class="active-model-info">
          <strong>Currently Loaded:</strong> 
          <span style="color: var(--primary); font-weight: 600;">
            ${ctx.activeModel || 'None (No model loaded in VRAM)'}
          </span>
        </div>

        ${ctx.isServerRunning ? html`
          <div class="select-label">Select GGUF model from models.ini:</div>
          <select id="model-select" ?disabled="${ctx.actionPending}" @change="${(e) => handleSelectModelChange(ctx, e)}">
            <option value="">-- Choose a Model --</option>
            ${ctx.models.map(m => html`
              <option value="${m.filename}" ?selected="${ctx.activeModel === m.filename}">
                ${m.filename} ${m.is_default ? '⭐ (Default)' : ''}
              </option>
            `)}
          </select>

          <div class="btn-group">
            <button 
              class="btn btn-primary" 
              @click="${() => handleLoadModel(ctx)}"
              ?disabled="${ctx.actionPending || ctx.loadingModel}"
            >
              ${ctx.loadingModel ? 'Loading...' : 'Load Model'}
            </button>
            <button 
              class="btn btn-secondary" 
              @click="${() => handleUnloadModel(ctx)}"
              ?disabled="${ctx.actionPending || !ctx.activeModel}"
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
  `;
}

export function renderModelsConfig(ctx) {
  return html`
    <div class="card">
      <div class="switcher-header" @click="${() => ctx.toggleConfig()}">
        <div class="card-title" style="margin-bottom: 0;">📁 Models Config</div>
        <div class="arrow-icon ${ctx.configExpanded ? 'arrow-expanded' : ''}">▼</div>
      </div>

      <div class="switcher-body ${ctx.configExpanded ? 'expanded' : ''}">
        <span class="card-subtitle" style="display: block; font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 12px; line-height: 1.4;">
          Inspect, edit, save, and reload your model configurations (<code>models.ini</code>), or delete unused GGUF files.
        </span>
        <div style="margin-top: 4px;">
          <h3 style="font-size: 0.9rem; margin-bottom: 12px; color: var(--text-primary); display: flex; align-items: center; gap: 6px;">
            💾 Downloaded GGUF Files on Disk
          </h3>
          ${ctx.models.length === 0 ? html`
            <p style="font-size: 0.85rem; color: var(--text-secondary); font-style: italic; margin-bottom: 12px; padding: 8px 12px; background: rgba(255,255,255,0.02); border-radius: var(--radius-sm);">
              No downloaded GGUF files found on disk or listed in models.ini.
            </p>
          ` : html`
            <div class="file-list">
              ${ctx.models.map(m => html`
                <div class="model-file-item">
                  <button 
                    class="btn btn-danger" 
                    style="padding: 6px 12px; font-size: 0.8rem; flex-shrink: 0;"
                    @click="${() => showDeleteConfirm(ctx, m.filename)}"
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
  `;
}

export function renderEditIni(ctx) {
  return html`
    <div class="card">
      <div class="switcher-header" @click="${() => ctx.toggleIni()}">
        <div class="card-title" style="margin-bottom: 0;">📝 Edit models.ini</div>
        <div class="arrow-icon ${ctx.iniExpanded ? 'arrow-expanded' : ''}">▼</div>
      </div>

      <div class="switcher-body ${ctx.iniExpanded ? 'expanded' : ''}">
        <div style="display: flex; flex-direction: column; gap: 8px;">
          <textarea 
            class="text-input" 
            style="font-family: var(--font-mono); font-size: 0.8rem; line-height: 1.5; min-height: 250px; resize: vertical; background: rgba(0, 0, 0, 0.4); border: 1px solid var(--border-color); color: #22c55e; padding: 12px; border-radius: var(--radius-md);" 
            .value="${ctx.modelsIniText}"
            @input="${(e) => handleIniInput(ctx, e)}"
            ?disabled="${ctx.modelsIniLoading}"
            placeholder="Loading models.ini..."
          ></textarea>
          
          <div style="display: flex; gap: 8px; justify-content: flex-end; margin-top: 4px; flex-wrap: wrap;">
            <button 
              class="btn btn-secondary" 
              style="padding: 8px 16px; font-size: 0.85rem; border-color: rgba(99,102,241,0.25); color: #a5b4fc; background: rgba(99,102,241,0.04);" 
              @click="${() => handleScan(ctx)}"
              ?disabled="${ctx.modelsIniLoading}"
            >
              🔍 Scan & Auto-Add Missing
            </button>
            <button 
              class="btn btn-secondary" 
              style="padding: 8px 16px; font-size: 0.85rem;" 
              @click="${() => handleReload(ctx)}"
              ?disabled="${ctx.modelsIniLoading}"
            >
              ⟳ Reload
            </button>
            <button 
              class="btn btn-primary" 
              style="padding: 8px 16px; font-size: 0.85rem;" 
              @click="${() => handleSave(ctx)}"
              ?disabled="${ctx.modelsIniLoading}"
            >
              💾 Save Config
            </button>
          </div>
        </div>
      </div>
    </div>
  `;
}

export function renderDeleteModal(ctx) {
  if (!ctx.modelToDelete) return '';
  return html`
    <div class="modal-backdrop">
      <div class="modal">
        <h3 class="modal-title">Delete GGUF Model</h3>
        <p class="modal-body">
          Are you sure you want to delete <strong>${ctx.modelToDelete}</strong>?
          This will permanently delete the GGUF file from disk and automatically remove its configuration block from <code>models.ini</code>.
        </p>
        <div class="modal-actions">
          <button class="btn btn-secondary" style="padding: 8px 16px;" @click="${() => closeDeleteConfirm(ctx)}">Cancel</button>
          <button class="btn btn-danger" style="padding: 8px 16px;" @click="${() => executeDelete(ctx)}">
            Confirm Delete
          </button>
        </div>
      </div>
    </div>
  `;
}
