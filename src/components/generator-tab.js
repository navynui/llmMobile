import { LitElement, html, css } from 'lit';
import { opQueue } from '../utils/op-queue.js';

const RESOLUTIONS = [
  '1920x1088', '1088x1920', '1280x720', '720x1280',
  '1024x1024', '1536x864', '864x1536',
];

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

  static styles = css`
    :host { display: block; padding: 16px 16px 80px; }
    .container { max-width: 600px; margin: 0 auto; display: flex; flex-direction: column; gap: 16px; }
    .card { background: var(--bg-card); backdrop-filter: blur(var(--blur)); border: 1px solid var(--border-color); border-radius: var(--radius-lg); padding: 20px; box-shadow: var(--shadow-lg); transition: var(--transition); }
    .card:hover { border-color: var(--border-active); }
    h2 { font-family: var(--font-title); font-size: 1.1rem; font-weight: 600; margin-bottom: 16px; color: var(--text-primary); }
    label { display: block; font-size: 0.8rem; font-weight: 500; color: var(--text-secondary); margin-bottom: 6px; }
    select, textarea { width: 100%; padding: 11px 14px; background: rgba(0,0,0,0.25); border: 1px solid var(--border-color); border-radius: var(--radius-md); color: var(--text-primary); font-family: var(--font-sans); font-size: 0.9rem; outline: none; transition: var(--transition); box-sizing: border-box; }
    select:focus, textarea:focus { border-color: var(--primary); }
    select { appearance: none; -webkit-appearance: none; background-image: url("data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%239ca3af' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E"); background-repeat: no-repeat; background-position: right 12px center; background-size: 16px; padding-right: 40px; }
    textarea { resize: vertical; min-height: 90px; line-height: 1.5; }
    .row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .generate-btn { width: 100%; padding: 14px; background: var(--primary); color: #fff; border: none; border-radius: var(--radius-md); font-family: var(--font-title); font-size: 1rem; font-weight: 600; cursor: pointer; box-shadow: 0 4px 14px var(--primary-glow); transition: var(--transition); }
    .generate-btn:hover:not(:disabled) { background: #4f46e5; transform: translateY(-1px); }
    .generate-btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }
    .error-msg { color: var(--danger); font-size: 0.85rem; text-align: center; }
    .queue-list { display: flex; flex-direction: column; gap: 12px; }
    .queue-item { background: rgba(255,255,255,0.02); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 14px; animation: slideIn 0.25s ease-out; }
    @keyframes slideIn { from { opacity:0; transform: translateY(6px); } to { opacity:1; transform: translateY(0); } }
    .qi-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
    .qi-prompt { font-size: 0.85rem; color: var(--text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 70%; }
    .status-pill { font-size: 0.7rem; font-weight: 700; padding: 3px 8px; border-radius: var(--radius-full); text-transform: uppercase; letter-spacing: 0.04em; }
    .pill-queued { background: rgba(107,114,128,0.15); color:#9ca3af; }
    .pill-running { background: rgba(99,102,241,0.15); color: var(--primary); }
    .pill-completed { background: var(--success-glow); color: var(--success); }
    .pill-error { background: var(--danger-glow); color: var(--danger); }
    .pill-cancelled { background: rgba(0,0,0,0.2); color: var(--text-muted); }
    .pill-offline { background: rgba(245,158,11,0.15); color: #f59e0b; }
    .qi-sub { font-size: 0.75rem; color: var(--text-muted); margin-bottom: 8px; }
    .progress-bar { height: 5px; background: rgba(255,255,255,0.06); border-radius: var(--radius-full); overflow: hidden; }
    .progress-fill { height: 100%; background: var(--primary); border-radius: var(--radius-full); transition: width 0.4s ease-out; }
    .thumb-row { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 10px; }
    .thumb { width: 72px; height: 72px; object-fit: cover; border-radius: var(--radius-sm); border: 1px solid var(--border-color); cursor: pointer; transition: var(--transition); }
    .thumb:hover { border-color: var(--primary); transform: scale(1.05); }
    .lightbox { position: fixed; inset: 0; background: rgba(0,0,0,0.9); z-index: 9999; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 20px; animation: fadeIn 0.2s ease-out; }
    @keyframes fadeIn { from{opacity:0} to{opacity:1} }
    .lightbox img { max-width: 100%; max-height: 85vh; border-radius: var(--radius-md); object-fit: contain; }
    .lightbox-close { position: absolute; top: 16px; right: 16px; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); color: #fff; font-size: 1.2rem; width: 40px; height: 40px; border-radius: var(--radius-full); cursor: pointer; display: flex; align-items: center; justify-content: center; }
    .lightbox-nav { display: flex; gap: 16px; margin-top: 16px; }
    .lightbox-nav button { background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); color: #fff; padding: 8px 20px; border-radius: var(--radius-md); cursor: pointer; font-size: 0.9rem; }
    .empty-state { text-align: center; padding: 32px 0; color: var(--text-muted); }
    .empty-state .icon { font-size: 2.5rem; margin-bottom: 8px; }
    .clear-btn { align-self: flex-end; background: none; border: 1px solid var(--border-color); color: var(--text-muted); font-size: 0.75rem; padding: 5px 10px; border-radius: var(--radius-sm); cursor: pointer; transition: var(--transition); }
    .clear-btn:hover { color: var(--danger); border-color: var(--danger); }
    .action-sheet-backdrop { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.6); backdrop-filter: blur(4px); z-index: 10000; display: flex; align-items: flex-end; justify-content: center; }
    .action-sheet { width: 100%; max-width: 500px; background: #111827; border-top: 1px solid var(--border-color); border-radius: var(--radius-lg) var(--radius-lg) 0 0; padding: 20px; box-sizing: border-box; box-shadow: 0 -10px 25px rgba(0, 0, 0, 0.5); animation: slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1); }
    @keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
    .action-sheet-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
    .action-sheet-title { font-size: 1.1rem; font-weight: 600; color: var(--text-primary); }
    .action-sheet-close { background: rgba(255,255,255,0.05); border: 1px solid var(--border-color); color: var(--text-secondary); border-radius: var(--radius-full); width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; cursor: pointer; }
    .action-sheet-info { background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.05); border-radius: var(--radius-md); padding: 12px; margin-bottom: 16px; }
    .action-sheet-prompt { font-size: 0.85rem; color: var(--text-secondary); line-height: 1.4; margin: 0 0 8px 0; word-break: break-word; }
    .action-sheet-meta { display: flex; gap: 12px; font-size: 0.75rem; color: var(--text-muted); }
    .action-sheet-buttons { display: flex; flex-direction: column; gap: 10px; }
    .action-btn { width: 100%; padding: 12px; background: rgba(255,255,255,0.04); border: 1px solid var(--border-color); color: var(--text-primary); border-radius: var(--radius-md); font-size: 0.9rem; font-weight: 500; text-align: left; cursor: pointer; display: flex; align-items: center; gap: 10px; transition: var(--transition); }
    .action-btn:hover { background: rgba(255,255,255,0.08); border-color: var(--border-active); }
    .action-btn.danger { color: var(--danger); border-color: rgba(239, 68, 68, 0.2); }
    .action-btn.danger:hover { background: rgba(239, 68, 68, 0.1); }
  `;

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

  async _submit() {
    if (!this.prompt.trim()) { this.errorMsg = 'Please enter a prompt.'; return; }
    this.errorMsg = '';
    this.submitting = true;
    this._savePrefs();

    // Query active model before unload and save it to sessionStorage
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

    const seedVal = this.seed.trim();
    const seedNum = parseInt(seedVal, 10);
    const body = {
      prompt: this.prompt.trim(),
      resolution: this.resolution,
      num_images: this.numImages,
      model: this.genMode,
      seed: (seedVal !== '' && !isNaN(seedNum)) ? seedNum : null,
      force_generate: this.forceGenerate,
      krea_multiplier: this.kreaMultiplier,
      enhancer_strength: this.enhancerStrength,
    };
    if (!navigator.onLine) {
      opQueue.push('/api/generate/queue', { method: 'POST', body: JSON.stringify(body) });
      this.prompt = '';
      this.submitting = false;
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
      this.prompt = '';
    } catch (e) {
      this.errorMsg = e.message;
    } finally {
      this.submitting = false;
    }
  }

  async _cancelItem(id) {
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

  async _clearDone() {
    if (!navigator.onLine) {
      opQueue.push('/api/generate/queue', { method: 'DELETE' });
      return;
    }
    await fetch('/api/generate/queue', { method: 'DELETE' });
  }

  _openThumbnailMenu(item, index) {
    this.activeThumbnailMenu = { item, index };
    this.requestUpdate();
  }

  _closeThumbnailMenu() {
    this.activeThumbnailMenu = null;
    this.requestUpdate();
  }

  async _regenerateSingleImage(item, index) {
    this.errorMsg = '';
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
      this.errorMsg = e.message;
    }
  }

  async _copyPromptText(text) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {}
  }

  async _rerunItem(item) {
    this.errorMsg = '';
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
      this.errorMsg = e.message;
    }
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
      <div class="container">
        <div class="card">
          <h2>🎨 Image Generator</h2>
          <div class="row">
            <div>
              <label>Resolution</label>
              <select .value="${this.resolution}" @change="${e => { this.resolution = e.target.value; this._savePrefs(); }}">
                ${RESOLUTIONS.map(r => html`<option value="${r}" ?selected="${r === this.resolution}">${r}</option>`)}
              </select>
            </div>
            <div>
              <label>Images per prompt</label>
              <select .value="${String(this.numImages)}" @change="${e => { this.numImages = parseInt(e.target.value); this._savePrefs(); }}">
                ${[1,2,3,4,6,8].map(n => html`<option value="${n}" ?selected="${n === this.numImages}">${n}</option>`)}
              </select>
            </div>
          </div>
          <div class="row" style="margin-top:14px;">
            <div>
              <label>Mode</label>
              <select .value="${this.genMode}" @change="${e => { this.genMode = e.target.value; this._savePrefs(); }}">
                <option value="zimage" ?selected="${this.genMode === 'zimage'}">⚡ Z-Image Turbo</option>
                <option value="krea2" ?selected="${this.genMode === 'krea2'}">🎨 Krea2 Turbo</option>
                <option value="both" ?selected="${this.genMode === 'both'}">🔀 Both (2 images)</option>
              </select>
            </div>
            <div>
              <label>Seed (optional)</label>
              <input type="text" .value="${this.seed}" @input="${e => { this.seed = e.target.value; }}" placeholder="Random" style="width:100%; padding:11px 14px; background:rgba(0,0,0,0.25); border:1px solid var(--border-color); border-radius:var(--radius-md); color:var(--text-primary); font-family:var(--font-sans); font-size:0.9rem; outline:none; box-sizing:border-box;">
            </div>
          </div>
          ${this.genMode === 'krea2' || this.genMode === 'both' ? html`
            <div style="margin-top:14px; display:flex; flex-direction:column; gap:10px;">
              <div>
                <label>Conditioning Multiplier: <span style="color:var(--primary);">${this.kreaMultiplier.toFixed(1)}</span></label>
                <input type="range" min="0" max="4" step="0.1" value="${this.kreaMultiplier}" @input="${e => { this.kreaMultiplier = parseFloat(e.target.value); this._savePrefs(); }}" style="width:100%; accent-color: var(--primary);" />
              </div>
              <div>
                <label>Enhancer Strength: <span style="color:var(--primary);">${this.enhancerStrength.toFixed(1)}</span></label>
                <input type="range" min="0" max="2" step="0.1" value="${this.enhancerStrength}" @input="${e => { this.enhancerStrength = parseFloat(e.target.value); this._savePrefs(); }}" style="width:100%; accent-color: var(--primary);" />
              </div>
            </div>
          ` : ''}
          <div style="margin-top:14px;">
            <label>Prompt</label>
            <textarea .value="${this.prompt}" @input="${e => { this.prompt = e.target.value; }}" placeholder="Describe the image you want to generate…"></textarea>
          </div>
          <div style="margin-top:14px; display:flex; align-items:center; gap:8px;">
            <input type="checkbox" id="forceGenerate" .checked="${this.forceGenerate}" @change="${e => { this.forceGenerate = e.target.checked; }}" style="width:auto; cursor:pointer;" />
            <label for="forceGenerate" style="margin-bottom:0; cursor:pointer; font-size:0.85rem; user-select:none;">Force Generate (skip VRAM swap / keep LLM loaded)</label>
          </div>
          ${this.errorMsg ? html`<p class="error-msg">${this.errorMsg}</p>` : ''}
          <div style="margin-top:16px;">
            <button class="generate-btn" @click="${this._submit}" ?disabled="${this.submitting || !this.prompt.trim()}">
              ${buttonLabel}
            </button>
          </div>
        </div>
        ${combinedQueue.length > 0 ? html`
          <div class="card">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
              <h2 style="margin:0;">Generation Queue</h2>
              ${hasDone ? html`<button class="clear-btn" @click="${this._clearDone}">Clear done</button>` : ''}
            </div>
            <div class="queue-list">
              ${combinedQueue.map(item => html`
                <div class="queue-item">
                  <div class="qi-header">
                    <div class="qi-prompt" title="${item.prompt}">${item.prompt}</div>
                    <span class="status-pill ${this._pillClass(item.status, item.isOffline)}">${item.isOffline ? 'offline' : item.status}</span>
                  </div>
                  <div class="qi-sub">${this._subText(item)}</div>
                  ${item.status === 'running' ? html`
                    <div class="progress-bar">
                      <div class="progress-fill" style="width:${Math.round((item.progress||0)*100)}%"></div>
                    </div>
                  ` : ''}
                  ${item.status === 'completed' && item.image_ids?.length ? html`
                    <div class="thumb-row">
                      ${item.image_ids.map((fname, i) => html`
                        <img class="thumb" src="/images/${fname}" alt="${fname}" @click="${() => this._openLightbox(item.image_ids.map(f => `/images/${f}`), i)}" @contextmenu="${e => { e.preventDefault(); this._openThumbnailMenu(item, i); }}" loading="lazy" />
                      `)}
                    </div>
                  ` : ''}
                  <div style="display:flex; gap:8px; margin-top:8px;">
                    ${item.status === 'queued' || item.status === 'running' || item.isOffline ? html`
                      <button class="clear-btn" @click="${() => this._cancelItem(item.id)}">Cancel</button>
                    ` : ''}
                    ${['completed', 'error', 'cancelled'].includes(item.status) && !item.isOffline ? html`
                      <button class="clear-btn" @click="${() => this._rerunItem(item)}">Re-run</button>
                    ` : ''}
                  </div>
                </div>
              `)}
            </div>
          </div>
        ` : html`
          <div class="card">
            <div class="empty-state">
              <div class="icon">✨</div>
              <p>No items in queue — submit a prompt above to start generating.</p>
            </div>
          </div>
        `}
      </div>
      ${this._lightbox ? html`
        <div class="lightbox" @click="${e => e.target === e.currentTarget && this._closeLightbox()}">
          <button class="lightbox-close" @click="${this._closeLightbox}">✕</button>
          <img src="${this._lightbox.images[this._lightbox.index]}" alt="Generated image" />
          ${this._lightbox.images.length > 1 ? html`
            <div class="lightbox-nav">
              <button @click="${() => this._lightboxNav(-1)}">◀ Prev</button>
              <span style="color:#fff; font-size:0.85rem; align-self:center;">
                ${this._lightbox.index + 1} / ${this._lightbox.images.length}
              </span>
              <button @click="${() => this._lightboxNav(1)}">Next ▶</button>
            </div>
          ` : ''}
        </div>
      ` : ''}
      ${this.activeThumbnailMenu ? html`
        <div class="action-sheet-backdrop" @click="${this._closeThumbnailMenu}">
          <div class="action-sheet" @click="${e => e.stopPropagation()}">
            <div class="action-sheet-header">
              <div class="action-sheet-title">Image Options</div>
              <button class="action-sheet-close" @click="${this._closeThumbnailMenu}">✕</button>
            </div>
            <div class="action-sheet-info">
              <p class="action-sheet-prompt">${this.activeThumbnailMenu.item.prompt}</p>
              <div class="action-sheet-meta">
                ${this.activeThumbnailMenu.item.seeds && this.activeThumbnailMenu.index < this.activeThumbnailMenu.item.seeds.length ? html`
                  <span>Seed: ${this.activeThumbnailMenu.item.seeds[this.activeThumbnailMenu.index]}</span>
                ` : ''}
              </div>
            </div>
            <div class="action-sheet-buttons">
              <button class="action-btn" @click="${() => { this._copyPromptText(this.activeThumbnailMenu.item.prompt); this._closeThumbnailMenu(); }}">
                📋 Copy Prompt
              </button>
              <button class="action-btn" @click="${() => { this._regenerateSingleImage(this.activeThumbnailMenu.item, this.activeThumbnailMenu.index); this._closeThumbnailMenu(); }}">
                🔄 Regenerate Single Image
              </button>
            </div>
          </div>
        </div>
      ` : ''}
    `;
  }
}

customElements.define('generator-tab', GeneratorTab);
