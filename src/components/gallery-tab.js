import { LitElement, html, css } from 'lit';

export class GalleryTab extends LitElement {
  static properties = {
    images:       { type: Array },
    folders:      { type: Array },
    currentPath:  { type: String },
    page:         { type: Number },
    totalPages:   { type: Number },
    totalImages:  { type: Number },
    loading:      { type: Boolean },
    selected:     { type: Object },   // Set of relative_path strings
    lightbox:     { type: Object },   // { images, index }
  };

  static styles = css`
    :host { display: block; height: 100%; }

    .root {
      display: flex;
      flex-direction: column;
      height: 100%;
    }

    /* Toolbar */
    .toolbar {
      padding: 12px 16px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      background: rgba(11,15,25,0.6);
      backdrop-filter: blur(12px);
      border-bottom: 1px solid var(--border-color);
      z-index: 5;
      position: sticky;
      top: 0;
    }

    .breadcrumbs {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 0.82rem;
      color: var(--text-secondary);
      flex-wrap: wrap;
    }
    .crumb {
      cursor: pointer;
      color: var(--primary);
      text-decoration: underline;
    }
    .crumb-sep { color: var(--text-muted); }

    .bulk-bar {
      display: flex;
      gap: 8px;
      align-items: center;
    }
    .bulk-btn {
      padding: 6px 12px;
      border-radius: var(--radius-sm);
      font-size: 0.8rem;
      font-weight: 600;
      cursor: pointer;
      border: 1px solid var(--border-color);
      background: rgba(255,255,255,0.04);
      color: var(--text-primary);
      transition: var(--transition);
    }
    .bulk-btn:hover { background: rgba(255,255,255,0.1); }
    .bulk-btn.danger { color: var(--danger); border-color: rgba(239,68,68,0.3); }
    .bulk-btn.danger:hover { background: var(--danger-glow); }
    .sel-count { font-size: 0.8rem; color: var(--text-secondary); margin-right: auto; }

    /* Scrollable grid area */
    .scroll-area {
      flex: 1;
      overflow-y: auto;
      padding: 12px 12px 80px;
    }

    /* Folders */
    .folder-row {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      margin-bottom: 16px;
    }
    .folder-chip {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 8px 14px;
      background: rgba(255,255,255,0.03);
      border: 1px solid var(--border-color);
      border-radius: var(--radius-md);
      font-size: 0.85rem;
      color: var(--text-secondary);
      cursor: pointer;
      transition: var(--transition);
    }
    .folder-chip:hover { border-color: var(--primary); color: var(--primary); }

    /* Image grid */
    .grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 10px;
    }
    @media (min-width: 500px) { .grid { grid-template-columns: repeat(3, 1fr); } }
    @media (min-width: 769px) { .grid { grid-template-columns: repeat(4, 1fr); } }

    .grid-cell {
      position: relative;
      border-radius: var(--radius-md);
      overflow: hidden;
      aspect-ratio: 1;
      cursor: pointer;
      border: 2px solid transparent;
      transition: var(--transition);
    }
    .grid-cell:hover { border-color: var(--primary); }
    .grid-cell.selected { border-color: var(--primary); box-shadow: 0 0 0 2px var(--primary-glow); }

    .grid-img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
      transition: transform 0.3s ease;
    }
    .grid-cell:hover .grid-img { transform: scale(1.03); }

    /* Prompt overlay */
    .img-overlay {
      position: absolute;
      bottom: 0; left: 0; right: 0;
      background: linear-gradient(transparent, rgba(0,0,0,0.85));
      padding: 24px 8px 8px;
      font-size: 0.7rem;
      color: rgba(255,255,255,0.8);
      line-height: 1.3;
      overflow: hidden;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
    }

    /* Selection checkbox overlay */
    .select-dot {
      position: absolute;
      top: 6px; right: 6px;
      width: 22px; height: 22px;
      border-radius: var(--radius-full);
      background: rgba(0,0,0,0.5);
      border: 2px solid rgba(255,255,255,0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 0.7rem;
    }
    .select-dot.checked {
      background: var(--primary);
      border-color: var(--primary);
    }

    /* Pagination */
    .pagination {
      display: flex;
      justify-content: center;
      align-items: center;
      gap: 16px;
      padding: 16px 0 4px;
    }
    .page-btn {
      padding: 8px 16px;
      border-radius: var(--radius-md);
      background: rgba(255,255,255,0.04);
      border: 1px solid var(--border-color);
      color: var(--text-primary);
      font-size: 0.85rem;
      cursor: pointer;
      transition: var(--transition);
    }
    .page-btn:hover:not(:disabled) { background: rgba(255,255,255,0.1); }
    .page-btn:disabled { opacity: 0.4; cursor: not-allowed; }
    .page-info { font-size: 0.8rem; color: var(--text-secondary); }

    /* Lightbox */
    .lightbox {
      position: fixed; inset: 0;
      background: rgba(0,0,0,0.95);
      z-index: 9999;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .lightbox img {
      max-width: 100%;
      max-height: 75vh;
      object-fit: contain;
      border-radius: var(--radius-md);
    }
    .lb-close {
      position: absolute; top:16px; right:16px;
      background: rgba(255,255,255,0.1);
      border: 1px solid rgba(255,255,255,0.2);
      color: #fff; font-size:1.1rem;
      width:38px; height:38px;
      border-radius: var(--radius-full);
      cursor: pointer;
      display: flex; align-items:center; justify-content:center;
    }
    .lb-meta {
      margin-top: 12px;
      max-width: 500px;
      text-align: center;
      font-size: 0.8rem;
      color: var(--text-secondary);
      line-height: 1.5;
    }
    .lb-prompt {
      color: var(--text-primary);
      font-size: 0.9rem;
      margin-bottom: 6px;
    }
    .lb-nav {
      display: flex; gap:16px; margin-top:12px;
    }
    .lb-nav button {
      padding: 8px 20px;
      background: rgba(255,255,255,0.08);
      border: 1px solid rgba(255,255,255,0.15);
      color: #fff; border-radius: var(--radius-md);
      cursor: pointer; font-size:0.9rem;
    }

    /* Loading / empty */
    .center-msg {
      text-align: center;
      padding: 40px 20px;
      color: var(--text-muted);
    }
    .center-msg .icon { font-size: 2.5rem; margin-bottom: 8px; }
  `;

  constructor() {
    super();
    this.images      = [];
    this.folders     = [];
    this.currentPath = '';
    this.page        = 1;
    this.totalPages  = 0;
    this.totalImages = 0;
    this.loading     = false;
    this.selected    = new Set();
    this.lightbox    = null;
    this._longPressTimer = null;
    this._selectMode     = false;
  }

  connectedCallback() {
    super.connectedCallback();
    this._load();
  }

  async _load(path = this.currentPath, page = 1) {
    this.loading = true;
    this.page    = page;
    try {
      const params = new URLSearchParams({ path, page: String(page), limit: '24' });
      const res  = await fetch(`/api/gallery/browse?${params}`);
      const data = await res.json();
      this.images      = data.images || [];
      this.folders     = data.folders || [];
      this.currentPath = data.current_path || '';
      this.totalPages  = data.total_pages || 0;
      this.totalImages = data.total_images || 0;
      this.selected    = new Set();
      this._selectMode = false;
    } catch (e) {
      console.error('Gallery load failed', e);
    } finally {
      this.loading = false;
    }
  }

  _navigate(relPath) {
    this._load(relPath);
  }

  _breadcrumbs() {
    const parts = this.currentPath ? this.currentPath.split('/') : [];
    return [
      { label: 'Root', path: '' },
      ...parts.map((p, i) => ({ label: p, path: parts.slice(0, i + 1).join('/') })),
    ];
  }

  _toggleSelect(img) {
    const s = new Set(this.selected);
    if (s.has(img.relative_path)) s.delete(img.relative_path);
    else s.add(img.relative_path);
    this.selected    = s;
    this._selectMode = s.size > 0;
    this.requestUpdate();
  }

  _onImgClick(img) {
    if (this._selectMode) {
      this._toggleSelect(img);
    } else {
      // Open lightbox for this image and its group-mates (same generation_id)
      const group = img.generation_id
        ? this.images.filter(i => i.generation_id === img.generation_id)
        : [img];
      const idx = group.findIndex(i => i.relative_path === img.relative_path);
      this.lightbox = { images: group, index: Math.max(0, idx) };
      this.requestUpdate();
    }
  }

  _onLongPress(img) {
    this._selectMode = true;
    this._toggleSelect(img);
  }

  _lbNav(dir) {
    if (!this.lightbox) return;
    const len = this.lightbox.images.length;
    this.lightbox = { ...this.lightbox, index: (this.lightbox.index + dir + len) % len };
    this.requestUpdate();
  }

  async _deleteSelected() {
    if (!this.selected.size) return;
    if (!confirm(`Delete ${this.selected.size} image(s)? This cannot be undone.`)) return;
    const filenames = [...this.selected].map(p => p.split('/').pop());
    await fetch('/api/gallery/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ current_path: this.currentPath, filenames, folders: [] }),
    });
    this._load(this.currentPath, this.page);
  }

  async _copyPrompt(img) {
    if (img.prompt) {
      await navigator.clipboard.writeText(img.prompt);
    }
  }

  render() {
    const crumbs   = this._breadcrumbs();
    const lbImg    = this.lightbox?.images[this.lightbox.index];

    return html`
      <div class="root">
        <!-- Toolbar -->
        <div class="toolbar">
          <div class="breadcrumbs">
            ${crumbs.map((c, i) => html`
              ${i > 0 ? html`<span class="crumb-sep">/</span>` : ''}
              <span class="crumb" @click="${() => this._navigate(c.path)}">${c.label}</span>
            `)}
            <span style="margin-left:auto; font-size:0.75rem; color:var(--text-muted);">
              ${this.totalImages} image(s)
            </span>
          </div>

          ${this._selectMode ? html`
            <div class="bulk-bar">
              <span class="sel-count">${this.selected.size} selected</span>
              <button class="bulk-btn" @click="${() => { this.selected = new Set(); this._selectMode = false; this.requestUpdate(); }}">✕ Clear</button>
              <button class="bulk-btn danger" @click="${this._deleteSelected}">🗑 Delete</button>
            </div>
          ` : ''}
        </div>

        <!-- Scrollable content -->
        <div class="scroll-area">
          <!-- Folders -->
          ${this.folders.length > 0 ? html`
            <div class="folder-row">
              ${this.folders.map(f => html`
                <div class="folder-chip" @click="${() => this._navigate(f.relative_path)}">
                  📁 ${f.name}
                </div>
              `)}
            </div>
          ` : ''}

          ${this.loading ? html`
            <div class="center-msg">
              <div class="icon">⏳</div>
              <p>Loading gallery…</p>
            </div>
          ` : this.images.length === 0 ? html`
            <div class="center-msg">
              <div class="icon">🖼️</div>
              <p>No images here yet. Generate some from the Generator tab!</p>
            </div>
          ` : html`
            <div class="grid">
              ${this.images.map(img => html`
                <div class="grid-cell ${this.selected.has(img.relative_path) ? 'selected' : ''}"
                  @click="${() => this._onImgClick(img)}"
                  @contextmenu="${e => { e.preventDefault(); this._onLongPress(img); }}"
                >
                  <img class="grid-img" src="${img.url}" alt="${img.filename}" loading="lazy" />
                  ${img.prompt ? html`
                    <div class="img-overlay">${img.prompt}</div>
                  ` : ''}
                  ${this._selectMode ? html`
                    <div class="select-dot ${this.selected.has(img.relative_path) ? 'checked' : ''}">
                      ${this.selected.has(img.relative_path) ? '✓' : ''}
                    </div>
                  ` : ''}
                </div>
              `)}
            </div>

            <!-- Pagination -->
            ${this.totalPages > 1 ? html`
              <div class="pagination">
                <button class="page-btn" ?disabled="${this.page <= 1}"
                  @click="${() => this._load(this.currentPath, this.page - 1)}">◀ Prev</button>
                <span class="page-info">Page ${this.page} / ${this.totalPages}</span>
                <button class="page-btn" ?disabled="${this.page >= this.totalPages}"
                  @click="${() => this._load(this.currentPath, this.page + 1)}">Next ▶</button>
              </div>
            ` : ''}
          `}
        </div>
      </div>

      <!-- Lightbox -->
      ${this.lightbox && lbImg ? html`
        <div class="lightbox" @click="${e => e.target === e.currentTarget && (this.lightbox = null, this.requestUpdate())}">
          <button class="lb-close" @click="${() => { this.lightbox = null; this.requestUpdate(); }}">✕</button>
          <img src="${lbImg.url}" alt="${lbImg.filename}" />
          <div class="lb-meta">
            ${lbImg.prompt ? html`<div class="lb-prompt">${lbImg.prompt}</div>` : ''}
            <div>
              ${lbImg.seed ? `Seed: ${lbImg.seed}` : ''}
              ${lbImg.model ? ` · Model: ${lbImg.model}` : ''}
              ${lbImg.timestamp ? ` · ${new Date(lbImg.timestamp).toLocaleString()}` : ''}
            </div>
            ${lbImg.prompt ? html`
              <button style="margin-top:8px; padding:5px 12px; background:rgba(255,255,255,0.08); border:1px solid rgba(255,255,255,0.15); color:#fff; border-radius:var(--radius-sm); cursor:pointer; font-size:0.75rem;"
                @click="${() => this._copyPrompt(lbImg)}">Copy Prompt</button>
            ` : ''}
          </div>
          ${this.lightbox.images.length > 1 ? html`
            <div class="lb-nav">
              <button @click="${() => this._lbNav(-1)}">◀ Prev</button>
              <span style="color:#fff; font-size:0.85rem; align-self:center;">
                ${this.lightbox.index + 1} / ${this.lightbox.images.length}
              </span>
              <button @click="${() => this._lbNav(1)}">Next ▶</button>
            </div>
          ` : ''}
        </div>
      ` : ''}
    `;
  }
}

customElements.define('gallery-tab', GalleryTab);
