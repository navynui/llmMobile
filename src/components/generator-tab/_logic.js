import { opQueue } from '../../utils/op-queue.js';

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
