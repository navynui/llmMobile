import { LitElement, html, css } from 'lit';
import { Confirm } from './_confirm.js';

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
    activeActionMenu: { type: Object },
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
      gap: 12px;
    }
    @media (min-width: 600px) { .grid { grid-template-columns: repeat(3, 1fr); } }
    @media (min-width: 769px) { .grid { grid-template-columns: repeat(4, 1fr); } }

    .grid-cell {
      position: relative;
      border-radius: var(--radius-md);
      overflow: hidden;
      display: flex;
      flex-direction: column;
      background: rgba(255,255,255,0.02);
      border: 1px solid var(--border-color);
      cursor: pointer;
      transition: var(--transition);
    }
    .grid-cell:hover { border-color: var(--primary); }
    .grid-cell.selected { border-color: var(--primary); box-shadow: 0 0 0 2px var(--primary-glow); }

    .grid-img-wrapper {
      position: relative;
      width: 100%;
      aspect-ratio: 1.1;
      overflow: hidden;
      background: rgba(0,0,0,0.2);
    }

    .grid-img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
      transition: transform 0.3s ease;
    }
    .grid-cell:hover .grid-img { transform: scale(1.03); }

    .group-badge {
      position: absolute;
      bottom: 8px;
      right: 8px;
      background: rgba(15, 23, 42, 0.8);
      backdrop-filter: blur(4px);
      -webkit-backdrop-filter: blur(4px);
      border: 1px solid rgba(255,255,255,0.15);
      color: #fff;
      font-size: 0.65rem;
      font-weight: 600;
      padding: 3px 6px;
      border-radius: var(--radius-sm);
      z-index: 2;
    }

    /* Selection checkbox overlay */
    .select-dot {
      position: absolute;
      top: 8px; right: 8px;
      width: 22px; height: 22px;
      border-radius: var(--radius-full);
      background: rgba(0,0,0,0.5);
      border: 2px solid rgba(255,255,255,0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 0.7rem;
      z-index: 2;
    }
    .select-dot.checked {
      background: var(--primary);
      border-color: var(--primary);
    }

    .grid-info {
      padding: 10px;
      display: flex;
      flex-direction: column;
      gap: 6px;
      flex-grow: 1;
    }

    .grid-prompt {
      font-size: 0.75rem;
      color: var(--text-primary);
      line-height: 1.35;
      overflow: hidden;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      min-height: 2.7em;
    }

    .grid-meta {
      font-size: 0.65rem;
      color: var(--text-muted);
      border-top: 1px solid rgba(255,255,255,0.05);
      padding-top: 6px;
      margin-top: auto;
      display: flex;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 4px;
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
    
    .lightbox-carousel {
      display: flex;
      width: 100%;
      max-width: 800px;
      height: 60vh;
      overflow-x: auto;
      scroll-snap-type: x mandatory;
      scrollbar-width: none;
    }
    .lightbox-carousel::-webkit-scrollbar {
      display: none;
    }
    
    .carousel-slide {
      flex: 0 0 100%;
      width: 100%;
      height: 100%;
      scroll-snap-align: center;
      display: flex;
      align-items: center;
      justify-content: center;
      box-sizing: border-box;
      padding: 0 10px;
    }
    .carousel-slide img {
      max-width: 100%;
      max-height: 100%;
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
      z-index: 10;
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

    /* Action Sheet / Context Menu */
    .action-sheet-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.6);
      backdrop-filter: blur(4px);
      z-index: 10000;
      display: flex;
      align-items: flex-end;
      justify-content: center;
    }
    
    .action-sheet {
      width: 100%;
      max-width: 500px;
      background: #111827;
      border-top: 1px solid var(--border-color);
      border-radius: var(--radius-lg) var(--radius-lg) 0 0;
      padding: 20px;
      box-sizing: border-box;
      box-shadow: 0 -10px 25px rgba(0, 0, 0, 0.5);
      animation: slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    }
    
    @keyframes slideUp {
      from { transform: translateY(100%); }
      to { transform: translateY(0); }
    }
    
    .action-sheet-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
    }
    
    .action-sheet-title {
      font-size: 1.1rem;
      font-weight: 600;
      color: var(--text-primary);
    }
    
    .action-sheet-close {
      background: rgba(255,255,255,0.05);
      border: 1px solid var(--border-color);
      color: var(--text-secondary);
      border-radius: var(--radius-full);
      width: 32px; height: 32px;
      display: flex; align-items: center; justify-content: center;
      cursor: pointer;
    }
    
    .action-sheet-info {
      background: rgba(255,255,255,0.02);
      border: 1px solid rgba(255,255,255,0.05);
      border-radius: var(--radius-md);
      padding: 12px;
      margin-bottom: 16px;
    }
    
    .action-sheet-prompt {
      font-size: 0.85rem;
      color: var(--text-secondary);
      line-height: 1.4;
      margin: 0 0 8px 0;
      word-break: break-word;
    }
    
    .action-sheet-meta {
      display: flex;
      gap: 12px;
      font-size: 0.75rem;
      color: var(--text-muted);
    }
    
    .action-sheet-buttons {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    
    .action-btn {
      width: 100%;
      padding: 12px;
      background: rgba(255,255,255,0.04);
      border: 1px solid var(--border-color);
      color: var(--text-primary);
      border-radius: var(--radius-md);
      font-size: 0.9rem;
      font-weight: 500;
      text-align: left;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 10px;
      transition: var(--transition);
    }
    .action-btn:hover {
      background: rgba(255,255,255,0.08);
      border-color: var(--border-active);
    }
    .action-btn.danger {
      color: var(--danger);
      border-color: rgba(239, 68, 68, 0.2);
    }
    .action-btn.danger:hover {
      background: rgba(239, 68, 68, 0.1);
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
    this.activeActionMenu = null;
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

  _getGroupedItems() {
    const grouped = [];
    const seenGenIds = new Set();

    for (const img of this.images) {
      const genId = img.generation_id;
      if (genId) {
        if (!seenGenIds.has(genId)) {
          seenGenIds.add(genId);
          const groupMates = this.images.filter(i => i.generation_id === genId);
          grouped.push({
            type: 'group',
            generation_id: genId,
            primary: groupMates[0],
            images: groupMates,
            prompt: img.prompt,
            seed: img.seed,
            model: img.model,
            timestamp: img.timestamp,
          });
        }
      } else {
        grouped.push({
          type: 'single',
          primary: img,
          images: [img],
          prompt: img.prompt,
          seed: img.seed,
          model: img.model,
          timestamp: img.timestamp,
        });
      }
    }
    return grouped;
  }

  _toggleSelectGroup(group) {
    const s = new Set(this.selected);
    const allSelected = group.images.every(img => s.has(img.relative_path));
    if (allSelected) {
      for (const img of group.images) {
        s.delete(img.relative_path);
      }
    } else {
      for (const img of group.images) {
        s.add(img.relative_path);
      }
    }
    this.selected    = s;
    this._selectMode = s.size > 0;
    this.requestUpdate();
  }

  _isGroupSelected(group) {
    return group.images.every(img => this.selected.has(img.relative_path));
  }

  _openActionMenu(group) {
    this.activeActionMenu = group;
    this.requestUpdate();
  }

  _closeActionMenu() {
    this.activeActionMenu = null;
    this.requestUpdate();
  }

  _onImgClick(group) {
    if (this._selectMode) {
      this._toggleSelectGroup(group);
    } else {
      this.lightbox = { images: group.images, index: 0 };
      this.requestUpdate();
      
      // Auto scroll carousel to index 0 on load
      setTimeout(() => {
        const container = this.shadowRoot.querySelector('.lightbox-carousel');
        if (container) {
          container.scrollLeft = 0;
        }
      }, 50);
    }
  }

  _onLongPress(group) {
    this._openActionMenu(group);
  }

  _onCarouselScroll(e) {
    const container = e.currentTarget;
    const width = container.clientWidth;
    if (width <= 0) return;
    const index = Math.round(container.scrollLeft / width);
    if (this.lightbox && this.lightbox.index !== index) {
      this.lightbox = { ...this.lightbox, index };
      this.requestUpdate();
    }
  }

  _lbNav(dir) {
    if (!this.lightbox) return;
    const len = this.lightbox.images.length;
    const nextIdx = (this.lightbox.index + dir + len) % len;
    this.lightbox = { ...this.lightbox, index: nextIdx };
    
    const container = this.shadowRoot.querySelector('.lightbox-carousel');
    if (container) {
      container.scrollTo({
        left: nextIdx * container.clientWidth,
        behavior: 'smooth'
      });
    }
    this.requestUpdate();
  }

  async _deleteGroup(group) {
    const count = group.images.length;
    const confirmed = await Confirm.show(`Delete ${count} image(s)?`, 'This cannot be undone.');
    if (!confirmed) return;
    const filenames = group.images.map(img => img.filename);
    await fetch('/api/gallery/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ current_path: this.currentPath, filenames, folders: [] }),
    });
    this._load(this.currentPath, this.page);
  }

  async _regenerateImage(img) {
    if (!img.prompt) return;
    try {
      const res = await fetch('/api/generate/queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt:     img.prompt,
          resolution: img.resolution ? img.resolution.join('x') : '1024x1024',
          num_images: 1,
          seed:       img.seed,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Unknown error');
      }
      window.location.hash = '#/generate';
    } catch (e) {
      alert('Failed to regenerate: ' + e.message);
    }
  }

  async _deleteSelected() {
    if (!this.selected.size) return;
    const confirmed = await Confirm.show(`Delete ${this.selected.size} image(s)?`, 'This cannot be undone.');
    if (!confirmed) return;
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
    const groupedItems = this._getGroupedItems();

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
          ` : groupedItems.length === 0 ? html`
            <div class="center-msg">
              <div class="icon">🖼️</div>
              <p>No images here yet. Generate some from the Generator tab!</p>
            </div>
          ` : html`
            <div class="grid">
              ${groupedItems.map(group => html`
                <div class="grid-cell ${this._isGroupSelected(group) ? 'selected' : ''}"
                  @click="${() => this._onImgClick(group)}"
                  @contextmenu="${e => { e.preventDefault(); this._onLongPress(group); }}"
                >
                  <div class="grid-img-wrapper">
                    <img class="grid-img" src="${group.primary.url}" alt="${group.primary.filename}" loading="lazy" />
                    
                    ${group.type === 'group' ? html`
                      <div class="group-badge">${group.images.length} images</div>
                    ` : ''}
                    
                    ${this._selectMode ? html`
                      <div class="select-dot ${this._isGroupSelected(group) ? 'checked' : ''}">
                        ${this._isGroupSelected(group) ? '✓' : ''}
                      </div>
                    ` : ''}
                  </div>

                  <div class="grid-info">
                    <div class="grid-prompt">${group.prompt || 'No prompt info'}</div>
                    <div class="grid-meta">
                      <span>Seed: ${group.seed || 'N/A'}</span>
                      <span>${group.timestamp ? new Date(group.timestamp).toLocaleDateString() : ''}</span>
                    </div>
                  </div>
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
          
          <div class="lightbox-carousel" @scroll="${this._onCarouselScroll}">
            ${this.lightbox.images.map(img => html`
              <div class="carousel-slide">
                <img src="${img.url}" alt="${img.filename}" />
              </div>
            `)}
          </div>
          
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

      <!-- Bottom Action Sheet / Context Menu -->
      ${this.activeActionMenu ? html`
        <div class="action-sheet-backdrop" @click="${this._closeActionMenu}">
          <div class="action-sheet" @click="${e => e.stopPropagation()}">
            <div class="action-sheet-header">
              <div class="action-sheet-title">Image Options</div>
              <button class="action-sheet-close" @click="${this._closeActionMenu}">✕</button>
            </div>
            
            <div class="action-sheet-info">
              <p class="action-sheet-prompt">${this.activeActionMenu.prompt || 'No prompt info'}</p>
              <div class="action-sheet-meta">
                ${this.activeActionMenu.seed ? html`<span>Seed: ${this.activeActionMenu.seed}</span>` : ''}
                ${this.activeActionMenu.model ? html`<span>Model: ${this.activeActionMenu.model}</span>` : ''}
              </div>
            </div>

            <div class="action-sheet-buttons">
              ${this.activeActionMenu.prompt ? html`
                <button class="action-btn" @click="${() => { this._copyPrompt(this.activeActionMenu.primary); this._closeActionMenu(); }}">
                  📋 Copy Prompt
                </button>
                <button class="action-btn" @click="${() => { this._regenerateImage(this.activeActionMenu.primary); this._closeActionMenu(); }}">
                  🔄 Regenerate Image
                </button>
              ` : ''}
              <button class="action-btn" @click="${() => { this._toggleSelectGroup(this.activeActionMenu); this._closeActionMenu(); }}">
                ☑️ ${this._isGroupSelected(this.activeActionMenu) ? 'Deselect Item' : 'Select Item'}
              </button>
              <button class="action-btn danger" @click="${() => { this._deleteGroup(this.activeActionMenu); this._closeActionMenu(); }}">
                🗑️ Delete Image(s)
              </button>
            </div>
          </div>
        </div>
      ` : ''}
    `;
  }
}

customElements.define('gallery-tab', GalleryTab);
