import { html } from 'lit';
import { RESOLUTIONS } from './_logic.js';

export function renderForm(ctx, buttonLabel) {
  return html`
    <div class="card" style="margin-bottom: 16px;">
      <h2>🎨 Image Generator</h2>
      <div class="row">
        <div>
          <label>Resolution</label>
          <select .value="${ctx.resolution}" @change="${e => { ctx.resolution = e.target.value; ctx._savePrefs(); }}">
            ${RESOLUTIONS.map(r => html`<option value="${r}" ?selected="${r === ctx.resolution}">${r}</option>`)}
          </select>
        </div>
        <div>
          <label>Images per prompt</label>
          <select .value="${String(ctx.numImages)}" @change="${e => { ctx.numImages = parseInt(e.target.value); ctx._savePrefs(); }}">
            ${[1,2,3,4,6,8].map(n => html`<option value="${n}" ?selected="${n === ctx.numImages}">${n}</option>`)}
          </select>
        </div>
      </div>
      <div class="row" style="margin-top:14px;">
        <div>
          <label>Mode</label>
          <select .value="${ctx.genMode}" @change="${e => { ctx.genMode = e.target.value; ctx._savePrefs(); }}">
            <option value="zimage" ?selected="${ctx.genMode === 'zimage'}">⚡ Z-Image Turbo</option>
            <option value="krea2" ?selected="${ctx.genMode === 'krea2'}">🎨 Krea2 Turbo</option>
            <option value="both" ?selected="${ctx.genMode === 'both'}">🔀 Both (2 images)</option>
          </select>
        </div>
        <div>
          <label>Seed (optional)</label>
          <input type="text" .value="${ctx.seed}" @input="${e => { ctx.seed = e.target.value; }}" placeholder="Random" style="width:100%; padding:11px 14px; background:rgba(0,0,0,0.25); border:1px solid var(--border-color); border-radius:var(--radius-md); color:var(--text-primary); font-family:var(--font-sans); font-size:0.9rem; outline:none; box-sizing:border-box;">
        </div>
      </div>
      ${ctx.genMode === 'krea2' || ctx.genMode === 'both' ? html`
        <div style="margin-top:14px; display:flex; flex-direction:column; gap:10px;">
          <div>
            <label>Conditioning Multiplier: <span style="color:var(--primary);">${ctx.kreaMultiplier.toFixed(1)}</span></label>
            <input type="range" min="0" max="4" step="0.1" value="${ctx.kreaMultiplier}" @input="${e => { ctx.kreaMultiplier = parseFloat(e.target.value); ctx._savePrefs(); }}" style="width:100%; accent-color: var(--primary);" />
          </div>
          <div>
            <label>Enhancer Strength: <span style="color:var(--primary);">${ctx.enhancerStrength.toFixed(1)}</span></label>
            <input type="range" min="0" max="2" step="0.1" value="${ctx.enhancerStrength}" @input="${e => { ctx.enhancerStrength = parseFloat(e.target.value); ctx._savePrefs(); }}" style="width:100%; accent-color: var(--primary);" />
          </div>
        </div>
      ` : ''}
      <div style="margin-top:14px;">
        <label>Prompt</label>
        <textarea .value="${ctx.prompt}" @input="${e => { ctx.prompt = e.target.value; }}" placeholder="Describe the image you want to generate…"></textarea>
      </div>
      <div style="margin-top:14px; display:flex; align-items:center; gap:8px;">
        <input type="checkbox" id="forceGenerate" .checked="${ctx.forceGenerate}" @change="${e => { ctx.forceGenerate = e.target.checked; }}" style="width:auto; cursor:pointer;" />
        <label for="forceGenerate" style="margin-bottom:0; cursor:pointer; font-size:0.85rem; user-select:none;">Force Generate (skip VRAM swap / keep LLM loaded)</label>
      </div>
      ${ctx.errorMsg ? html`<p class="error-msg">${ctx.errorMsg}</p>` : ''}
      <div style="margin-top:16px;">
        <button class="generate-btn" @click="${ctx._submit}" ?disabled="${ctx.submitting || !ctx.prompt.trim()}">
          ${buttonLabel}
        </button>
      </div>
    </div>
  `;
}

export function renderQueue(ctx, combinedQueue, hasDone) {
  if (combinedQueue.length === 0) {
    return html`
      <div class="card">
        <div class="empty-state">
          <div class="icon">✨</div>
          <p>No items in queue — submit a prompt above to start generating.</p>
        </div>
      </div>
    `;
  }
  return html`
    <div class="card">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
        <h2 style="margin:0;">Generation Queue</h2>
        ${hasDone ? html`<button class="clear-btn" @click="${ctx._clearDone}">Clear done</button>` : ''}
      </div>
      <div class="queue-list">
        ${combinedQueue.map(item => html`
          <div class="queue-item">
            <div class="qi-header">
              <div class="qi-prompt" title="${item.prompt}">${item.prompt}</div>
              <span class="status-pill ${ctx._pillClass(item.status, item.isOffline)}">${item.isOffline ? 'offline' : item.status}</span>
            </div>
            <div class="qi-sub">${ctx._subText(item)}</div>
            ${item.status === 'running' ? html`
              <div class="progress-bar">
                <div class="progress-fill" style="width:${Math.round((item.progress||0)*100)}%"></div>
              </div>
            ` : ''}
            ${item.status === 'completed' && item.image_ids?.length ? html`
              <div class="thumb-row">
                ${item.image_ids.map((fname, i) => html`
                  <img class="thumb" src="/images/${fname}" alt="${fname}" @click="${() => ctx._openLightbox(item.image_ids.map(f => `/images/${f}`), i)}" @contextmenu="${e => { e.preventDefault(); ctx._openThumbnailMenu(item, i); }}" loading="lazy" />
                `)}
              </div>
            ` : ''}
            <div style="display:flex; gap:8px; margin-top:8px;">
              ${item.status === 'queued' || item.status === 'running' || item.isOffline ? html`
                <button class="clear-btn" @click="${() => ctx._cancelItem(item.id)}">Cancel</button>
              ` : ''}
              ${['completed', 'error', 'cancelled'].includes(item.status) && !item.isOffline ? html`
                <button class="clear-btn" @click="${() => ctx._rerunItem(item)}">Re-run</button>
              ` : ''}
            </div>
          </div>
        `)}
      </div>
    </div>
  `;
}

export function renderLightbox(ctx) {
  if (!ctx._lightbox) return '';
  return html`
    <div class="lightbox" @click="${e => e.target === e.currentTarget && ctx._closeLightbox()}">
      <button class="lightbox-close" @click="${ctx._closeLightbox}">✕</button>
      <img src="${ctx._lightbox.images[ctx._lightbox.index]}" alt="Generated image" />
      ${ctx._lightbox.images.length > 1 ? html`
        <div class="lightbox-nav">
          <button @click="${() => ctx._lightboxNav(-1)}">◀ Prev</button>
          <span style="color:#fff; font-size:0.85rem; align-self:center;">
            ${ctx._lightbox.index + 1} / ${ctx._lightbox.images.length}
          </span>
          <button @click="${() => ctx._lightboxNav(1)}">Next ▶</button>
        </div>
      ` : ''}
    </div>
  `;
}

export function renderActionSheet(ctx) {
  if (!ctx.activeThumbnailMenu) return '';
  return html`
    <div class="action-sheet-backdrop" @click="${ctx._closeThumbnailMenu}">
      <div class="action-sheet" @click="${e => e.stopPropagation()}">
        <div class="action-sheet-header">
          <div class="action-sheet-title">Image Options</div>
          <button class="action-sheet-close" @click="${ctx._closeThumbnailMenu}">✕</button>
        </div>
        <div class="action-sheet-info">
          <p class="action-sheet-prompt">${ctx.activeThumbnailMenu.item.prompt}</p>
          <div class="action-sheet-meta">
            ${ctx.activeThumbnailMenu.item.seeds && ctx.activeThumbnailMenu.index < ctx.activeThumbnailMenu.item.seeds.length ? html`
              <span>Seed: ${ctx.activeThumbnailMenu.item.seeds[ctx.activeThumbnailMenu.index]}</span>
            ` : ''}
          </div>
        </div>
        <div class="action-sheet-buttons">
          <button class="action-btn" @click="${() => { ctx._copyPromptText(ctx.activeThumbnailMenu.item.prompt); ctx._closeThumbnailMenu(); }}">
            📋 Copy Prompt
          </button>
          <button class="action-btn" @click="${() => { ctx._regenerateSingleImage(ctx.activeThumbnailMenu.item, ctx.activeThumbnailMenu.index); ctx._closeThumbnailMenu(); }}">
            🔄 Regenerate Single Image
          </button>
        </div>
      </div>
    </div>
  `;
}
