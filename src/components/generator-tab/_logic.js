import { opQueue } from '../../utils/op-queue.js';

export const RESOLUTIONS = [
  '1920x1088', '1088x1920', '1280x720', '720x1280',
  '1024x1024', '1536x864', '864x1536',
];

export async function submitTask(ctx) {
  if (!ctx.prompt.trim()) { ctx.errorMsg = 'Please enter a prompt.'; return; }
  if (ctx.selectedWorkflows.length === 0) { ctx.errorMsg = 'Select at least one workflow.'; return; }
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

  // If only one workflow selected, use single-model mode
  const isMulti = ctx.selectedWorkflows.length > 1;
  const body = {
    prompt: ctx.prompt.trim(),
    resolution: ctx.resolution,
    num_images: isMulti ? ctx.selectedWorkflows.length : ctx.numImages,
    model: isMulti ? 'both' : ctx.selectedWorkflows[0],
    selected_workflows: ctx.selectedWorkflows,
    seed: (seedVal !== '' && !isNaN(seedNum)) ? seedNum : null,
    force_generate: ctx.forceGenerate,
    krea_multiplier: ctx.selectedWorkflows.includes('krea2') ? ctx.kreaMultiplier : null,
    enhancer_strength: ctx.selectedWorkflows.includes('krea2') ? ctx.enhancerStrength : null,
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
  // Use the first selected workflow or item.model for regeneration
  const wfs = item.selected_workflows || [item.model || 'zimage'];
  try {
    const res = await fetch('/api/generate/queue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: item.prompt,
        resolution: item.resolution || '1024x1024',
        num_images: 1,
        seed: seed,
        model: wfs[0],
        selected_workflows: [wfs[0]],
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
  const wfs = item.selected_workflows || [item.model || 'zimage'];
  try {
    const res = await fetch('/api/generate/queue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: item.prompt,
        resolution: item.resolution || '1024x1024',
        num_images: item.total_images || item.num_images || 1,
        model: wfs.length > 1 ? 'both' : wfs[0],
        selected_workflows: wfs,
        krea_multiplier: item.krea_multiplier,
        enhancer_strength: item.enhancer_strength,
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
