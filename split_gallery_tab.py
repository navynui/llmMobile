import os

with open("src/components/gallery-tab.js", "r") as f:
    content = f.read()

os.makedirs("src/components/gallery-tab", exist_ok=True)

# 1. _styles.js
styles_code = "import { css } from 'lit';\n\nexport const galleryStyles = " + content[content.find("css`"):content.find("`;", content.find("css`")) + 2] + "\n"
with open("src/components/gallery-tab/_styles.js", "w") as f:
    f.write(styles_code)

# 2. _logic.js
logic_code = """import { Confirm } from '../_confirm.js';

export async function load(ctx, path = ctx.currentPath, page = 1) {
  ctx.loading = true;
  ctx.page    = page;
  try {
    const params = new URLSearchParams({ path, page: String(page), limit: '24' });
    const res  = await fetch(`/api/gallery/browse?${params}`);
    const data = await res.json();
    ctx.images      = data.images || [];
    ctx.folders     = data.folders || [];
    ctx.currentPath = data.current_path || '';
    ctx.totalPages  = data.total_pages || 0;
    ctx.totalImages = data.total_images || 0;
    ctx.selected    = new Set();
    ctx._selectMode = false;
  } catch (e) {
    console.error('Gallery load failed', e);
  } finally {
    ctx.loading = false;
  }
}

export function navigate(ctx, relPath) {
  load(ctx, relPath);
}

export function breadcrumbs(ctx) {
  const parts = ctx.currentPath ? ctx.currentPath.split('/') : [];
  return [
    { label: 'Root', path: '' },
    ...parts.map((p, i) => ({ label: p, path: parts.slice(0, i + 1).join('/') })),
  ];
}

export function getGroupedItems(ctx) {
  const grouped = [];
  const seenGenIds = new Set();

  for (const img of ctx.images) {
    const genId = img.generation_id;
    if (genId) {
      if (!seenGenIds.has(genId)) {
        seenGenIds.add(genId);
        const groupMates = ctx.images.filter(i => i.generation_id === genId);
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

export function toggleSelectGroup(ctx, group) {
  const s = new Set(ctx.selected);
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
  ctx.selected    = s;
  ctx._selectMode = s.size > 0;
  ctx.requestUpdate();
}

export function isGroupSelected(ctx, group) {
  return group.images.every(img => ctx.selected.has(img.relative_path));
}

export function openActionMenu(ctx, group) {
  ctx.activeActionMenu = group;
  ctx.requestUpdate();
}

export function closeActionMenu(ctx) {
  ctx.activeActionMenu = null;
  ctx.requestUpdate();
}

export function onImgClick(ctx, group) {
  if (ctx._selectMode) {
    toggleSelectGroup(ctx, group);
  } else {
    ctx.lightbox = { images: group.images, index: 0 };
    ctx.requestUpdate();
    
    setTimeout(() => {
      const container = ctx.shadowRoot.querySelector('.lightbox-carousel');
      if (container) {
        container.scrollLeft = 0;
      }
    }, 50);
  }
}

export function onLongPress(ctx, group) {
  openActionMenu(ctx, group);
}

export function onCarouselScroll(ctx, e) {
  const container = e.currentTarget;
  const width = container.clientWidth;
  if (width <= 0) return;
  const index = Math.round(container.scrollLeft / width);
  if (ctx.lightbox && ctx.lightbox.index !== index) {
    ctx.lightbox = { ...ctx.lightbox, index };
    ctx.requestUpdate();
  }
}

export function lbNav(ctx, dir) {
  if (!ctx.lightbox) return;
  const len = ctx.lightbox.images.length;
  const nextIdx = (ctx.lightbox.index + dir + len) % len;
  ctx.lightbox = { ...ctx.lightbox, index: nextIdx };
  
  const container = ctx.shadowRoot.querySelector('.lightbox-carousel');
  if (container) {
    container.scrollTo({
      left: nextIdx * container.clientWidth,
      behavior: 'smooth'
    });
  }
  ctx.requestUpdate();
}

export async function deleteGroup(ctx, group) {
  const count = group.images.length;
  const confirmed = await Confirm.show(`Delete ${count} image(s)?`, 'This cannot be undone.');
  if (!confirmed) return;
  const filenames = group.images.map(img => img.filename);
  await fetch('/api/gallery/delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ current_path: ctx.currentPath, filenames, folders: [] }),
  });
  load(ctx, ctx.currentPath, ctx.page);
}

export async function regenerateImage(ctx, img) {
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

export async function deleteSelected(ctx) {
  if (!ctx.selected.size) return;
  const confirmed = await Confirm.show(`Delete ${ctx.selected.size} image(s)?`, 'This cannot be undone.');
  if (!confirmed) return;
  const filenames = [...ctx.selected].map(p => p.split('/').pop());
  await fetch('/api/gallery/delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ current_path: ctx.currentPath, filenames, folders: [] }),
  });
  load(ctx, ctx.currentPath, ctx.page);
}

export async function copyPrompt(ctx, img) {
  if (img.prompt) {
    await navigator.clipboard.writeText(img.prompt);
  }
}

export async function openMoveModal(ctx, group) {
  ctx.moveTargetGroup = group;
  ctx.showMoveModal = true;
  closeActionMenu(ctx);
  await loadAllFolders(ctx);
  ctx.requestUpdate();
}

export async function loadAllFolders(ctx) {
  try {
    const res = await fetch('/api/gallery/all_folders');
    const folders = await res.json();
    ctx.allFolders = folders;
  } catch (e) {
    console.error('Failed to load folders', e);
    ctx.allFolders = [''];
  }
}

export function closeMoveModal(ctx) {
  ctx.showMoveModal = false;
  ctx.moveTargetGroup = null;
  ctx.requestUpdate();
}

export async function moveGroupToFolder(ctx, folderPath) {
  if (!ctx.moveTargetGroup) return;
  const filenames = ctx.moveTargetGroup.images.map(img => img.filename);
  await fetch('/api/gallery/move', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      current_path: ctx.currentPath,
      destination: folderPath,
      filenames,
    }),
  });
  closeMoveModal(ctx);
  load(ctx, ctx.currentPath, ctx.page);
}

export async function moveSelectedToFolder(ctx, folderPath) {
  if (!ctx.selected.size) return;
  const filenames = [...ctx.selected].map(p => p.split('/').pop());
  await fetch('/api/gallery/move', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      current_path: ctx.currentPath,
      destination: folderPath,
      filenames,
    }),
  });
  closeMoveModal(ctx);
  ctx.selected = new Set();
  ctx._selectMode = false;
  load(ctx, ctx.currentPath, ctx.page);
}
"""
with open("src/components/gallery-tab/_logic.js", "w") as f:
    f.write(logic_code)

# 3. _templates.js
templates_code = """import { html } from 'lit';
import { icons } from '../../assets/icons.js';
import * as logic from './_logic.js';

export function renderToolbar(ctx) {
  const crumbs = logic.breadcrumbs(ctx);
  return html`
    <div class="toolbar">
      <div class="breadcrumbs">
        ${crumbs.map((c, i) => html`
          ${i > 0 ? html`<span class="crumb-sep">/</span>` : ''}
          <span class="crumb" @click="${() => logic.navigate(ctx, c.path)}">${c.label}</span>
        `)}
        <span style="margin-left:auto; font-size:0.75rem; color:var(--text-muted);">
          ${ctx.totalImages} image(s)
        </span>
      </div>

      ${ctx._selectMode ? html`
        <div class="bulk-bar">
          <span class="sel-count">${ctx.selected.size} selected</span>
          <button class="bulk-btn" @click="${() => { ctx.selected = new Set(); ctx._selectMode = false; ctx.requestUpdate(); }}">✕ Clear</button>
          <button class="bulk-btn danger" @click="${() => logic.deleteSelected(ctx)}">🗑 Delete</button>
        </div>
      ` : ''}
    </div>
  `;
}

export function renderScrollArea(ctx) {
  const groupedItems = logic.getGroupedItems(ctx);
  return html`
    <div class="scroll-area">
      <!-- Folders -->
      ${ctx.folders.length > 0 ? html`
        <div class="folder-row">
          ${ctx.folders.map(f => html`
            <div class="folder-chip" @click="${() => logic.navigate(ctx, f.relative_path)}">
              📁 ${f.name}
            </div>
          `)}
        </div>
      ` : ''}

      ${ctx.loading ? html`
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
            <div class="grid-cell ${logic.isGroupSelected(ctx, group) ? 'selected' : ''}"
              @click="${() => logic.onImgClick(ctx, group)}"
              @contextmenu="${e => { e.preventDefault(); logic.onLongPress(ctx, group); }}"
            >
              <div class="grid-img-wrapper">
                <img class="grid-img" src="${group.primary.url}" alt="${group.primary.filename}" loading="lazy" />
                
                ${group.type === 'group' ? html`
                  <div class="group-badge">${group.images.length} images</div>
                ` : ''}
                
                ${ctx._selectMode ? html`
                  <div class="select-dot ${logic.isGroupSelected(ctx, group) ? 'checked' : ''}">
                    ${logic.isGroupSelected(ctx, group) ? '✓' : ''}
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
        ${ctx.totalPages > 1 ? html`
          <div class="pagination">
            <button class="page-btn" ?disabled="${ctx.page <= 1}"
              @click="${() => logic.load(ctx, ctx.currentPath, ctx.page - 1)}">◀ Prev</button>
            <span class="page-info">Page ${ctx.page} / ${ctx.totalPages}</span>
            <button class="page-btn" ?disabled="${ctx.page >= ctx.totalPages}"
              @click="${() => logic.load(ctx, ctx.currentPath, ctx.page + 1)}">Next ▶</button>
          </div>
        ` : ''}
      `}
    </div>
  `;
}

export function renderLightbox(ctx) {
  const lbImg = ctx.lightbox?.images[ctx.lightbox.index];
  if (!ctx.lightbox || !lbImg) return '';

  return html`
    <div class="lightbox" @click="${e => e.target === e.currentTarget && (ctx.lightbox = null, ctx.requestUpdate())}">
      <button class="lb-close" @click="${() => { ctx.lightbox = null; ctx.requestUpdate(); }}">✕</button>
      
      <div class="lightbox-carousel" @scroll="${(e) => logic.onCarouselScroll(ctx, e)}">
        ${ctx.lightbox.images.map(img => html`
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
            @click="${() => logic.copyPrompt(ctx, lbImg)}">Copy Prompt</button>
        ` : ''}
      </div>
      ${ctx.lightbox.images.length > 1 ? html`
        <div class="lb-nav">
          <button @click="${() => logic.lbNav(ctx, -1)}">◀ Prev</button>
          <span style="color:#fff; font-size:0.85rem; align-self:center;">
            ${ctx.lightbox.index + 1} / ${ctx.lightbox.images.length}
          </span>
          <button @click="${() => logic.lbNav(ctx, 1)}">Next ▶</button>
        </div>
      ` : ''}
    </div>
  `;
}

export function renderActionSheet(ctx) {
  if (!ctx.activeActionMenu) return '';
  return html`
    <div class="action-sheet-backdrop" @click="${() => logic.closeActionMenu(ctx)}">
      <div class="action-sheet" @click="${e => e.stopPropagation()}">
        <div class="action-sheet-header">
          <div class="action-sheet-title">Image Options</div>
          <button class="action-sheet-close" @click="${() => logic.closeActionMenu(ctx)}">✕</button>
        </div>
        
        <div class="action-sheet-info">
          <p class="action-sheet-prompt">${ctx.activeActionMenu.prompt || 'No prompt info'}</p>
          <div class="action-sheet-meta">
            ${ctx.activeActionMenu.seed ? html`<span>Seed: ${ctx.activeActionMenu.seed}</span>` : ''}
            ${ctx.activeActionMenu.model ? html`<span>Model: ${ctx.activeActionMenu.model}</span>` : ''}
          </div>
        </div>

        <div class="action-sheet-buttons">
          ${ctx.activeActionMenu.prompt ? html`
            <button class="action-btn" @click="${() => { logic.copyPrompt(ctx, ctx.activeActionMenu.primary); logic.closeActionMenu(ctx); }}">
              📋 Copy Prompt
            </button>
            <button class="action-btn" @click="${() => { logic.regenerateImage(ctx, ctx.activeActionMenu.primary); logic.closeActionMenu(ctx); }}">
              🔄 Regenerate Image
            </button>
          ` : ''}
          <button class="action-btn" @click="${() => { logic.openMoveModal(ctx, ctx.activeActionMenu); }}">
            ${icons.folder} Move to Folder
          </button>
          <button class="action-btn" @click="${() => { logic.toggleSelectGroup(ctx, ctx.activeActionMenu); logic.closeActionMenu(ctx); }}">
            ☑️ ${logic.isGroupSelected(ctx, ctx.activeActionMenu) ? 'Deselect Item' : 'Select Item'}
          </button>
          <button class="action-btn danger" @click="${() => { logic.deleteGroup(ctx, ctx.activeActionMenu); logic.closeActionMenu(ctx); }}">
            🗑️ Delete Image(s)
          </button>
        </div>
      </div>
    </div>
  `;
}

export function renderMoveModal(ctx) {
  if (!ctx.showMoveModal) return '';
  return html`
    <div class="action-sheet-backdrop" @click="${() => logic.closeMoveModal(ctx)}">
      <div class="action-sheet" @click="${e => e.stopPropagation()}" style="max-height: 80vh; overflow-y: auto;">
        <div class="action-sheet-header">
          <div class="action-sheet-title">Move to Folder</div>
          <button class="action-sheet-close" @click="${() => logic.closeMoveModal(ctx)}">✕</button>
        </div>
        <div class="action-sheet-buttons">
          ${ctx.allFolders.map(folder => html`
            <button class="action-btn" @click="${() => ctx.moveTargetGroup ? logic.moveGroupToFolder(ctx, folder) : logic.moveSelectedToFolder(ctx, folder)}">
              ${icons.folder} ${folder || '(Root)'}
            </button>
          `)}
        </div>
      </div>
    </div>
  `;
}

export function renderGallery(ctx) {
  return html`
    <div class="root">
      ${renderToolbar(ctx)}
      ${renderScrollArea(ctx)}
    </div>
    ${renderLightbox(ctx)}
    ${renderActionSheet(ctx)}
    ${renderMoveModal(ctx)}
  `;
}
"""
with open("src/components/gallery-tab/_templates.js", "w") as f:
    f.write(templates_code)

# 4. gallery-tab.js (main)
main_code = """import { LitElement } from 'lit';
import { galleryStyles } from './gallery-tab/_styles.js';
import * as logic from './gallery-tab/_logic.js';
import { renderGallery } from './gallery-tab/_templates.js';

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
    showMoveModal:    { type: Boolean },
    allFolders:       { type: Array },
    moveTargetGroup:  { type: Object },
  };

  static styles = galleryStyles;

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
    this.showMoveModal    = false;
    this.allFolders       = [];
    this.moveTargetGroup  = null;
  }

  connectedCallback() {
    super.connectedCallback();
    logic.load(this);
  }

  render() {
    return renderGallery(this);
  }
}

customElements.define('gallery-tab', GalleryTab);
"""
with open("src/components/gallery-tab.js", "w") as f:
    f.write(main_code)
