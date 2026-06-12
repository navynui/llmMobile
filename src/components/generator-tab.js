import { LitElement, html, css } from 'lit';

const RESOLUTIONS = [
  '1920x1088', '1088x1920', '1280x720', '720x1280',
  '1024x1024', '1536x864', '864x1536',
];

export class GeneratorTab extends LitElement {
  static properties = {
    prompt:        { type: String },
    resolution:    { type: String },
    numImages:     { type: Number },
    queue:         { type: Array },
    submitting:    { type: Boolean },
    errorMsg:      { type: String },
  };

  static styles = css`
    :host { display: block; padding: 16px 16px 80px; }

    .container {
      max-width: 600px;
      margin: 0 auto;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .card {
      background: var(--bg-card);
      backdrop-filter: blur(var(--blur));
      border: 1px solid var(--border-color);
      border-radius: var(--radius-lg);
      padding: 20px;
      box-shadow: var(--shadow-lg);
      transition: var(--transition);
    }
    .card:hover { border-color: var(--border-active); }

    h2 {
      font-family: var(--font-title);
      font-size: 1.1rem;
      font-weight: 600;
      margin-bottom: 16px;
      color: var(--text-primary);
    }

    label {
      display: block;
      font-size: 0.8rem;
      font-weight: 500;
      color: var(--text-secondary);
      margin-bottom: 6px;
    }

    select, textarea {
      width: 100%;
      padding: 11px 14px;
      background: rgba(0,0,0,0.25);
      border: 1px solid var(--border-color);
      border-radius: var(--radius-md);
      color: var(--text-primary);
      font-family: var(--font-sans);
      font-size: 0.9rem;
      outline: none;
      transition: var(--transition);
      box-sizing: border-box;
    }
    select:focus, textarea:focus { border-color: var(--primary); }

    select {
      appearance: none;
      -webkit-appearance: none;
      background-image: url("data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%239ca3af' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E");
      background-repeat: no-repeat;
      background-position: right 12px center;
      background-size: 16px;
      padding-right: 40px;
    }

    textarea { resize: vertical; min-height: 90px; line-height: 1.5; }

    .row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }

    .generate-btn {
      width: 100%;
      padding: 14px;
      background: var(--primary);
      color: #fff;
      border: none;
      border-radius: var(--radius-md);
      font-family: var(--font-title);
      font-size: 1rem;
      font-weight: 600;
      cursor: pointer;
      box-shadow: 0 4px 14px var(--primary-glow);
      transition: var(--transition);
    }
    .generate-btn:hover:not(:disabled) { background: #4f46e5; transform: translateY(-1px); }
    .generate-btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }

    .error-msg {
      color: var(--danger);
      font-size: 0.85rem;
      text-align: center;
    }

    /* Queue list */
    .queue-list { display: flex; flex-direction: column; gap: 12px; }

    .queue-item {
      background: rgba(255,255,255,0.02);
      border: 1px solid var(--border-color);
      border-radius: var(--radius-md);
      padding: 14px;
      animation: slideIn 0.25s ease-out;
    }
    @keyframes slideIn {
      from { opacity:0; transform: translateY(6px); }
      to   { opacity:1; transform: translateY(0); }
    }

    .qi-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 6px;
    }

    .qi-prompt {
      font-size: 0.85rem;
      color: var(--text-secondary);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      max-width: 70%;
    }

    .status-pill {
      font-size: 0.7rem;
      font-weight: 700;
      padding: 3px 8px;
      border-radius: var(--radius-full);
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .pill-queued    { background: rgba(107,114,128,0.15); color:#9ca3af; }
    .pill-running   { background: rgba(99,102,241,0.15);  color: var(--primary); }
    .pill-completed { background: var(--success-glow);    color: var(--success); }
    .pill-error     { background: var(--danger-glow);     color: var(--danger); }
    .pill-cancelled { background: rgba(0,0,0,0.2);        color: var(--text-muted); }

    .qi-sub {
      font-size: 0.75rem;
      color: var(--text-muted);
      margin-bottom: 8px;
    }

    .progress-bar {
      height: 5px;
      background: rgba(255,255,255,0.06);
      border-radius: var(--radius-full);
      overflow: hidden;
    }
    .progress-fill {
      height: 100%;
      background: var(--primary);
      border-radius: var(--radius-full);
      transition: width 0.4s ease-out;
    }

    /* Completed images thumbnails */
    .thumb-row {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      margin-top: 10px;
    }
    .thumb {
      width: 72px;
      height: 72px;
      object-fit: cover;
      border-radius: var(--radius-sm);
      border: 1px solid var(--border-color);
      cursor: pointer;
      transition: var(--transition);
    }
    .thumb:hover { border-color: var(--primary); transform: scale(1.05); }

    /* Lightbox */
    .lightbox {
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.9);
      z-index: 9999;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 20px;
      animation: fadeIn 0.2s ease-out;
    }
    @keyframes fadeIn { from{opacity:0} to{opacity:1} }
    .lightbox img {
      max-width: 100%;
      max-height: 85vh;
      border-radius: var(--radius-md);
      object-fit: contain;
    }
    .lightbox-close {
      position: absolute;
      top: 16px; right: 16px;
      background: rgba(255,255,255,0.1);
      border: 1px solid rgba(255,255,255,0.2);
      color: #fff;
      font-size: 1.2rem;
      width: 40px; height: 40px;
      border-radius: var(--radius-full);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .lightbox-nav {
      display: flex;
      gap: 16px;
      margin-top: 16px;
    }
    .lightbox-nav button {
      background: rgba(255,255,255,0.1);
      border: 1px solid rgba(255,255,255,0.2);
      color: #fff;
      padding: 8px 20px;
      border-radius: var(--radius-md);
      cursor: pointer;
      font-size: 0.9rem;
    }

    .empty-state {
      text-align: center;
      padding: 32px 0;
      color: var(--text-muted);
    }
    .empty-state .icon { font-size: 2.5rem; margin-bottom: 8px; }

    .clear-btn {
      align-self: flex-end;
      background: none;
      border: 1px solid var(--border-color);
      color: var(--text-muted);
      font-size: 0.75rem;
      padding: 5px 10px;
      border-radius: var(--radius-sm);
      cursor: pointer;
      transition: var(--transition);
    }
    .clear-btn:hover { color: var(--danger); border-color: var(--danger); }
  `;

  constructor() {
    super();
    this.prompt     = localStorage.getItem('gen_prompt') || '';
    this.resolution = localStorage.getItem('gen_resolution') || '1920x1088';
    this.numImages  = parseInt(localStorage.getItem('gen_num_images') || '1', 10);
    this.queue      = [];
    this.submitting = false;
    this.errorMsg   = '';
    this._lightbox  = null; // { images: [...], index: 0 }
    this._sse       = null;
  }

  connectedCallback() {
    super.connectedCallback();
    this._connectSSE();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this._sse) { this._sse.close(); this._sse = null; }
  }

  _connectSSE() {
    if (this._sse) this._sse.close();
    this._sse = new EventSource('/events/queue');
    this._sse.addEventListener('queue', (e) => {
      try {
        const data = JSON.parse(e.data);
        this.queue = data.queue || [];
      } catch {}
    });
    this._sse.onerror = () => {
      setTimeout(() => this._connectSSE(), 3000);
    };
  }

  _savePrefs() {
    localStorage.setItem('gen_prompt', this.prompt);
    localStorage.setItem('gen_resolution', this.resolution);
    localStorage.setItem('gen_num_images', String(this.numImages));
  }

  async _submit() {
    if (!this.prompt.trim()) { this.errorMsg = 'Please enter a prompt.'; return; }
    this.errorMsg   = '';
    this.submitting = true;
    this._savePrefs();
    try {
      const res = await fetch('/api/generate/queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt:     this.prompt.trim(),
          resolution: this.resolution,
          num_images: this.numImages,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Unknown error');
      }
    } catch (e) {
      this.errorMsg = e.message;
    } finally {
      this.submitting = false;
    }
  }

  async _cancelItem(id) {
    await fetch(`/api/generate/queue/${id}`, { method: 'DELETE' });
  }

  async _clearDone() {
    await fetch('/api/generate/queue', { method: 'DELETE' });
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

  _pillClass(status) {
    return { queued: 'pill-queued', running: 'pill-running',
             completed: 'pill-completed', error: 'pill-error',
             cancelled: 'pill-cancelled' }[status] || 'pill-queued';
  }

  _subText(item) {
    if (item.status === 'running') {
      return `Image ${item.image_num || 1}/${item.total_images} · ${Math.round((item.progress || 0) * 100)}%`;
    }
    if (item.status === 'completed') return `${item.image_ids?.length || 0} image(s) generated`;
    if (item.status === 'error')     return item.error || 'Unknown error';
    return `${item.resolution} · ${item.num_images} image(s)`;
  }

  render() {
    const hasDone = this.queue.some(q => ['completed','error','cancelled'].includes(q.status));

    return html`
      <div class="container">

        <!-- Prompt Input Card -->
        <div class="card">
          <h2>🎨 Z-Image Turbo Generator</h2>

          <div class="row">
            <div>
              <label>Resolution</label>
              <select .value="${this.resolution}"
                @change="${e => { this.resolution = e.target.value; this._savePrefs(); }}">
                ${RESOLUTIONS.map(r => html`<option value="${r}" ?selected="${r === this.resolution}">${r}</option>`)}
              </select>
            </div>
            <div>
              <label>Images per prompt</label>
              <select .value="${String(this.numImages)}"
                @change="${e => { this.numImages = parseInt(e.target.value); this._savePrefs(); }}">
                ${[1,2,3,4,6,8].map(n => html`<option value="${n}" ?selected="${n === this.numImages}">${n}</option>`)}
              </select>
            </div>
          </div>

          <div style="margin-top:14px;">
            <label>Prompt</label>
            <textarea
              .value="${this.prompt}"
              @input="${e => { this.prompt = e.target.value; }}"
              placeholder="Describe the image you want to generate…"
            ></textarea>
          </div>

          ${this.errorMsg ? html`<p class="error-msg">${this.errorMsg}</p>` : ''}

          <div style="margin-top:16px;">
            <button class="generate-btn"
              @click="${this._submit}"
              ?disabled="${this.submitting || !this.prompt.trim()}">
              ${this.submitting ? 'Submitting…' : '⚡ Generate'}
            </button>
          </div>
        </div>

        <!-- Queue card -->
        ${this.queue.length > 0 ? html`
          <div class="card">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
              <h2 style="margin:0;">Generation Queue</h2>
              ${hasDone ? html`<button class="clear-btn" @click="${this._clearDone}">Clear done</button>` : ''}
            </div>
            <div class="queue-list">
              ${this.queue.map(item => html`
                <div class="queue-item">
                  <div class="qi-header">
                    <div class="qi-prompt" title="${item.prompt}">${item.prompt}</div>
                    <span class="status-pill ${this._pillClass(item.status)}">${item.status}</span>
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
                        <img class="thumb"
                          src="/images/${fname}"
                          alt="${fname}"
                          @click="${() => this._openLightbox(item.image_ids.map(f => `/images/${f}`), i)}"
                          loading="lazy"
                        />
                      `)}
                    </div>
                  ` : ''}

                  ${item.status === 'queued' ? html`
                    <button class="clear-btn" @click="${() => this._cancelItem(item.id)}">Cancel</button>
                  ` : ''}
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

      <!-- Lightbox -->
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
    `;
  }
}

customElements.define('generator-tab', GeneratorTab);
