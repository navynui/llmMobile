import { html } from 'lit';
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
