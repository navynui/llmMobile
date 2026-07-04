import os
import re

with open("src/components/generator-tab.js", "r") as f:
    content = f.read()

os.makedirs("src/components/generator-tab", exist_ok=True)

# 1. _styles.js
styles_code = "import { css } from 'lit';\n\nexport const generatorStyles = " + content[content.find("css`"):content.find("`;", content.find("css`")) + 2] + "\n"
with open("src/components/generator-tab/_styles.js", "w") as f:
    f.write(styles_code)

# 2. _logic.js
# Just pure helpers, let's put `RESOLUTIONS` and maybe API calls here if we want, but wait, the plan says:
# "workflow param mapping, aspect-ratio presets, queue submit"
logic_code = """import { opQueue } from '../../utils/op-queue.js';

export const RESOLUTIONS = [
  '1920x1088', '1088x1920', '1280x720', '720x1280',
  '1024x1024', '1536x864', '864x1536',
];

export async function submitTask(ctx) {
  if (!ctx.prompt.trim()) { ctx.errorMsg = 'Please enter a prompt.'; return; }
  ctx.errorMsg = '';
  ctx.submitting = true;
  ctx._savePrefs();

  try {
    const activeRes = await fetch('/api/llm/models');
    if (activeRes.ok) {
      const activeData = await activeRes.json();
      const loadedModel = activeData.data?.find(m => m.status === 'loaded' || m.status?.value === 'loaded');
      if (loadedModel) {
        sessionStorage.setItem('previous_model_name', loadedModel.id);
      }
    }
  } catch (e) {
    console.warn("Failed to retrieve active model before swapping", e);
  }

  const seedVal = ctx.seed.trim();
  const seedNum = parseInt(seedVal, 10);
  const body = {
    prompt: ctx.prompt.trim(),
    resolution: ctx.resolution,
    num_images: ctx.numImages,
    model: ctx.genMode,
    seed: (seedVal !== '' && !isNaN(seedNum)) ? seedNum : null,
    force_generate: ctx.forceGenerate,
    krea_multiplier: ctx.kreaMultiplier,
    enhancer_strength: ctx.enhancerStrength,
  };

  if (!navigator.onLine) {
    opQueue.push('/api/generate/queue', { method: 'POST', body: JSON.stringify(body) });
    ctx.prompt = '';
    ctx.submitting = false;
    return;
  }

  try {
    const res = await fetch('/api/generate/queue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || 'Unknown error');
    }
    ctx.prompt = '';
  } catch (e) {
    ctx.errorMsg = e.message;
  } finally {
    ctx.submitting = false;
  }
}

export async function cancelItem(id) {
  if (id.startsWith('op_')) {
    opQueue.queue = opQueue.queue.filter(op => op.id !== id);
    localStorage.setItem('op_queue', JSON.stringify(opQueue.queue));
    window.dispatchEvent(new CustomEvent('op-queue-changed', { detail: opQueue.queue }));
    return;
  }
  if (!navigator.onLine) {
    opQueue.push(`/api/generate/queue/${id}`, { method: 'DELETE' });
    return;
  }
  await fetch(`/api/generate/queue/${id}`, { method: 'DELETE' });
}

export async function clearDone() {
  if (!navigator.onLine) {
    opQueue.push('/api/generate/queue', { method: 'DELETE' });
    return;
  }
  await fetch('/api/generate/queue', { method: 'DELETE' });
}

export async function regenerateSingleImage(ctx, item, index) {
  ctx.errorMsg = '';
  const seed = item.seeds && index < item.seeds.length ? item.seeds[index] : null;
  try {
    const res = await fetch('/api/generate/queue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: item.prompt,
        resolution: item.resolution || '1024x1024',
        num_images: 1,
        seed: seed,
        model: item.model || 'zimage',
      }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || 'Unknown error');
    }
  } catch (e) {
    ctx.errorMsg = e.message;
  }
}

export async function rerunItem(ctx, item) {
  ctx.errorMsg = '';
  try {
    const res = await fetch('/api/generate/queue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: item.prompt,
        resolution: item.resolution || '1024x1024',
        num_images: item.total_images || item.num_images || 1,
        model: item.model || 'zimage',
      }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || 'Unknown error');
    }
  } catch (e) {
    ctx.errorMsg = e.message;
  }
}
"""
with open("src/components/generator-tab/_logic.js", "w") as f:
    f.write(logic_code)

# 3. _templates.js
templates_code = """import { html } from 'lit';
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
"""
with open("src/components/generator-tab/_templates.js", "w") as f:
    f.write(templates_code)

# 4. generator-tab.js (main)
main_code = """import { LitElement, html } from 'lit';
import { opQueue } from '../utils/op-queue.js';
import { generatorStyles } from './generator-tab/_styles.js';
import { submitTask, cancelItem, clearDone, regenerateSingleImage, rerunItem } from './generator-tab/_logic.js';
import { renderForm, renderQueue, renderLightbox, renderActionSheet } from './generator-tab/_templates.js';

export class GeneratorTab extends LitElement {
  static properties = {
    prompt: { type: String },
    resolution: { type: String },
    numImages: { type: Number },
    queue: { type: Array },
    submitting: { type: Boolean },
    errorMsg: { type: String },
    activeThumbnailMenu: { type: Object },
    genMode: { type: String },
    seed: { type: String },
    forceGenerate: { type: Boolean },
    kreaMultiplier: { type: Number },
    enhancerStrength: { type: Number },
  };

  static styles = generatorStyles;

  constructor() {
    super();
    this.prompt = localStorage.getItem('gen_prompt') || '';
    this.resolution = localStorage.getItem('gen_resolution') || '1920x1088';
    this.numImages = parseInt(localStorage.getItem('gen_num_images') || '1', 10);
    this.genMode = localStorage.getItem('gen_mode') || 'zimage';
    this.seed = '';
    this.queue = [];
    this.submitting = false;
    this.errorMsg = '';
    this._lightbox = null;
    this.activeThumbnailMenu = null;
    this.forceGenerate = false;
    this.kreaMultiplier = parseFloat(localStorage.getItem('krea_multiplier')) || 1;
    this.enhancerStrength = parseFloat(localStorage.getItem('enhancer_strength')) || 1;
  }

  connectedCallback() {
    super.connectedCallback();
    this._onOpQueueChanged = () => this.requestUpdate();
    window.addEventListener('op-queue-changed', this._onOpQueueChanged);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener('op-queue-changed', this._onOpQueueChanged);
  }

  _savePrefs() {
    localStorage.setItem('gen_prompt', this.prompt);
    localStorage.setItem('gen_resolution', this.resolution);
    localStorage.setItem('gen_num_images', String(this.numImages));
    localStorage.setItem('gen_mode', this.genMode);
    localStorage.setItem('krea_multiplier', String(this.kreaMultiplier));
    localStorage.setItem('enhancer_strength', String(this.enhancerStrength));
  }

  async _submit() { await submitTask(this); }
  async _cancelItem(id) { await cancelItem(id); }
  async _clearDone() { await clearDone(); }
  async _regenerateSingleImage(item, index) { await regenerateSingleImage(this, item, index); }
  async _rerunItem(item) { await rerunItem(this, item); }

  _openThumbnailMenu(item, index) {
    this.activeThumbnailMenu = { item, index };
    this.requestUpdate();
  }

  _closeThumbnailMenu() {
    this.activeThumbnailMenu = null;
    this.requestUpdate();
  }

  async _copyPromptText(text) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {}
  }

  _openLightbox(images, index) {
    this._lightbox = { images, index };
    this.requestUpdate();
  }

  _closeLightbox() {
    this._lightbox = null;
    this.requestUpdate();
  }

  _lightboxNav(dir) {
    if (!this._lightbox) return;
    const len = this._lightbox.images.length;
    this._lightbox = { ...this._lightbox, index: (this._lightbox.index + dir + len) % len };
    this.requestUpdate();
  }

  _pillClass(status, isOffline) {
    if (isOffline) return 'pill-offline';
    return { queued: 'pill-queued', running: 'pill-running', completed: 'pill-completed', error: 'pill-error', cancelled: 'pill-cancelled' }[status] || 'pill-queued';
  }

  _subText(item) {
    if (item.isOffline) return 'Queued offline · Awaiting connection';
    if (item.model === 'both') {
      const subItems = item.sub_items || [];
      const done = Math.min(item.current_sub_index || 0, subItems.length);
      const label = subItems[done]?.workflow === 'krea2' ? 'Krea2' : (subItems[done]?.workflow || '?');
      return `Dual mode · ${label} (${done + 1}/${subItems.length})`;
    }
    if (item.status === 'running') {
      return `Image ${item.image_num || 1}/${item.total_images} · ${Math.round((item.progress || 0) * 100)}%`;
    }
    if (item.status === 'completed') return `${item.image_ids?.length || 0} image(s) generated`;
    if (item.status === 'error') return item.error || 'Unknown error';
    return `${item.resolution} · ${item.num_images} image(s)`;
  }

  render() {
    const offlineOps = opQueue.getQueue().filter(op => op.url === '/api/generate/queue' && op.status === 'pending');
    const offlineItems = offlineOps.map(op => {
      let promptText = 'Generation Task';
      let resVal = '1024x1024';
      let numImgs = 1;
      let model = 'zimage';
      try {
        const body = JSON.parse(op.body);
        promptText = body.prompt;
        resVal = body.resolution || resVal;
        numImgs = body.num_images || numImgs;
        model = body.model || model;
      } catch {}
      return {
        id: op.id,
        prompt: promptText,
        resolution: resVal,
        num_images: numImgs,
        model,
        status: 'queued',
        isOffline: true,
        image_ids: [],
        progress: 0.0,
      };
    });
    const combinedQueue = [...offlineItems, ...(this.queue || [])];
    const hasDone = combinedQueue.some(q => ['completed','error','cancelled'].includes(q.status));
    const buttonLabel = this.submitting ? 'Submitting…' : (this.genMode === 'krea2' ? '🎨 Generate' : this.genMode === 'both' ? '🔀 Generate both' : '⚡ Generate');
    
    return html`
      ${renderForm(this, buttonLabel)}
      ${renderQueue(this, combinedQueue, hasDone)}
      ${renderLightbox(this)}
      ${renderActionSheet(this)}
    `;
  }
}

customElements.define('generator-tab', GeneratorTab);
"""
with open("src/components/generator-tab.js", "w") as f:
    f.write(main_code)
