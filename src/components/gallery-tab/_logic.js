import { Confirm } from '../_confirm.js';

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
