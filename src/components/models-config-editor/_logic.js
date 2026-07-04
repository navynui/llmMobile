export function handleSelectModelChange(ctx, e) {
  const selected = e.target.value;
  ctx.dispatchEvent(new CustomEvent('select-model-change', {
    detail: { model: selected }
  }));
}

export function handleLoadModel(ctx) {
  const selectEl = ctx.shadowRoot.querySelector('#model-select');
  const model = selectEl ? selectEl.value : '';
  if (model) {
    ctx.dispatchEvent(new CustomEvent('load-model', {
      detail: { model }
    }));
  }
}

export function handleUnloadModel(ctx) {
  ctx.dispatchEvent(new CustomEvent('unload-model'));
}

export function showDeleteConfirm(ctx, filename) {
  ctx.modelToDelete = filename;
}

export function closeDeleteConfirm(ctx) {
  ctx.modelToDelete = null;
}

export function executeDelete(ctx) {
  const filename = ctx.modelToDelete;
  closeDeleteConfirm(ctx);
  if (filename) {
    ctx.dispatchEvent(new CustomEvent('delete-model', {
      detail: { filename }
    }));
  }
}

export function handleIniInput(ctx, e) {
  ctx.dispatchEvent(new CustomEvent('change', {
    detail: { text: e.target.value }
  }));
}

export function handleScan(ctx) {
  ctx.dispatchEvent(new CustomEvent('scan'));
}

export function handleReload(ctx) {
  ctx.dispatchEvent(new CustomEvent('reload'));
}

export function handleSave(ctx) {
  ctx.dispatchEvent(new CustomEvent('save'));
}
