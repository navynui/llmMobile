
export async function pollDownloads(ctx) {
  try {
    const res = await fetch('/api/models/downloads');
    const data = await res.json();
    ctx.hfActiveDownloads = data.downloads || [];
    ctx.saveDownloadsToStorage();
  } catch (err) {
    console.error("Failed to poll downloads", err);
  }
}

export async function handleHfSearch(ctx) {
  if (!ctx.hfSearchQuery.trim()) return;
  ctx.hfSearchLoading = true;
  ctx.hfSearchResults = [];
  ctx.hfSelectedRepo = '';
  ctx.hfRepoDetails = null;

  try {
    const res = await fetch(`/api/models/search?q=${encodeURIComponent(ctx.hfSearchQuery)}`);
    if (res.ok) {
      const results = await res.json();
      ctx.hfSearchResults = [...results].sort((a, b) => (b.downloads || 0) - (a.downloads || 0));
    } else {
      ctx.dispatchEvent(new CustomEvent('op-queue-notification', {
        detail: { message: 'Failed to search HuggingFace Hub' },
        bubbles: true,
        composed: true
      }));
    }
  } catch (err) {
    console.error(err);
  } finally {
    ctx.hfSearchLoading = false;
  }
}

export async function selectHfRepo(ctx, repoId) {
  ctx.hfSelectedRepo = repoId;
  ctx.hfDetailsLoading = true;
  ctx.hfRepoDetails = null;

  try {
    const res = await fetch(`/api/models/details?repo_id=${encodeURIComponent(repoId)}`);
    if (res.ok) {
      ctx.hfRepoDetails = await res.json();
    } else {
      ctx.dispatchEvent(new CustomEvent('op-queue-notification', {
        detail: { message: 'Failed to fetch repository details' },
        bubbles: true,
        composed: true
      }));
    }
  } catch (err) {
    console.error(err);
  } finally {
    ctx.hfDetailsLoading = false;
  }
}

export async function triggerHfDownload(ctx, filename) {
  try {
    const res = await fetch('/api/models/download', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        repo_id: ctx.hfSelectedRepo,
        filename: filename
      })
    });

    if (res.ok) {
      const data = await res.json();
      ctx.dispatchEvent(new CustomEvent('op-queue-notification', {
        detail: { message: data.detail || 'Download started in background' },
        bubbles: true,
        composed: true
      }));
    } else {
      const errData = await res.json();
      ctx.dispatchEvent(new CustomEvent('op-queue-notification', {
        detail: { message: errData.detail || 'Failed to start download' },
        bubbles: true,
        composed: true
      }));
    }
  } catch (err) {
    console.error(err);
  }
}

export async function handleStopDownload(ctx, key) {
  try {
    const res = await fetch(`/api/models/downloads/${encodeURIComponent(key)}/stop`, { method: 'POST' });
    const data = await res.json();
    ctx.dispatchEvent(new CustomEvent('op-queue-notification', { detail: { message: data.detail || 'Stopped' }, bubbles: true, composed: true }));
    ctx.pollDownloads();
  } catch (err) {
    console.error(err);
    ctx.dispatchEvent(new CustomEvent('op-queue-notification', { detail: { message: 'Failed to stop download' }, bubbles: true, composed: true }));
  }
}

export async function handleResumeDownload(ctx, key) {
  try {
    const res = await fetch(`/api/models/downloads/${encodeURIComponent(key)}/resume`, { method: 'POST' });
    const data = await res.json();
    ctx.dispatchEvent(new CustomEvent('op-queue-notification', { detail: { message: data.detail || 'Resumed' }, bubbles: true, composed: true }));
    ctx.pollDownloads();
  } catch (err) {
    console.error(err);
    ctx.dispatchEvent(new CustomEvent('op-queue-notification', { detail: { message: 'Failed to resume download' }, bubbles: true, composed: true }));
  }
}

export async function handleCancelDownload(ctx, key) {
  try {
    const res = await fetch(`/api/models/downloads/${encodeURIComponent(key)}/cancel`, { method: 'POST' });
    const data = await res.json();
    ctx.dispatchEvent(new CustomEvent('op-queue-notification', { detail: { message: data.detail || 'Cancelled' }, bubbles: true, composed: true }));
    ctx.pollDownloads();
  } catch (err) {
    console.error(err);
    ctx.dispatchEvent(new CustomEvent('op-queue-notification', { detail: { message: 'Failed to cancel download' }, bubbles: true, composed: true }));
  }
}

export async function fetchLogs(ctx) {
  ctx.logsLoading = true;
  ctx.logsText = 'Fetching logs...';
  try {
    const res = await fetch(`/api/logs?container_name=${ctx.logContainer}&lines=${ctx.logLimit}`);
    if (res.ok) {
      const data = await res.json();
      ctx.logsText = data.logs || 'No logs found.';
    } else {
      ctx.logsText = 'Failed to fetch logs.';
    }
  } catch (err) {
    ctx.logsText = `Error: ${err.message}`;
  } finally {
    ctx.logsLoading = false;
  }
}

export async function fetchModelsList(ctx) {
  try {
    const res = await fetch('/models');
    if (res.ok) {
      const data = await res.json();
      ctx.models = data.models || [];
    }
  } catch (e) {
    console.error("Failed to list models", e);
  }
}

export async function fetchActiveModel(ctx) {
  try {
    const res = await fetch('/api/llm/models');
    if (res.ok) {
      const data = await res.json();
      const loadedModel = data.data?.find(m => m.status === 'loaded' || m.status?.value === 'loaded');
      ctx.activeModel = loadedModel ? loadedModel.id : '';
    }
  } catch (e) {
    console.warn("Failed to check loaded models", e);
  }
}

export async function handleServerToggle(ctx) {
  ctx.actionPending = true;
  const isRunning = ctx.status?.server?.status === 'running';
  const endpoint = isRunning ? '/stop' : '/start';
  ctx.showStatus(isRunning ? 'Stopping LLM server...' : 'Starting LLM server...');

  try {
    const res = await fetch(endpoint, { method: 'POST' });
    const data = await res.json();
    ctx.showStatus(data.detail || 'Success!');
    
    if (!isRunning) {
      setTimeout(() => {
        ctx.fetchModelsList();
        ctx.fetchActiveModel();
      }, 3000);
    } else {
      ctx.activeModel = '';
    }
  } catch (e) {
    ctx.showStatus('Error executing request: ' + e.message, true);
  } finally {
    ctx.actionPending = false;
  }
}

export async function handleRestart(ctx) {
  if (!ctx.status?.server?.status || ctx.status.server.status !== 'running') return;

  ctx.actionPending = true;
  ctx.showStatus('Stopping LLM server...');

  try {
    const res1 = await fetch('/stop', { method: 'POST' });
    if (!res1.ok) throw new Error('Failed to stop server');
    
    ctx.showStatus('Starting LLM server...');
    
    await new Promise(r => setTimeout(r, 10000));
    const res2 = await fetch('/start', { method: 'POST' });
    if (!res2.ok) throw new Error('Failed to start server');
    
    ctx.showStatus('Server restarted successfully!');
  } catch (e) {
    ctx.showStatus('Error restarting server: ' + e.message, true);
  } finally {
    ctx.actionPending = false;
  }
}

export async function handleModelLoad(ctx, modelName = '') {
  const targetModel = modelName;
  if (!targetModel) return;

  ctx.actionPending = true;
  ctx.loadingModel = true;
  ctx.showStatus(`Loading model ${targetModel}...`);

  try {
    const res = await fetch('/api/llm/models/load', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: targetModel })
    });
    const data = await res.json();
    if (res.ok) {
      ctx.activeModel = targetModel;
      ctx.showStatus(`Loaded model successfully!`);
    } else {
      ctx.showStatus(`Failed: ${data.detail || 'Unknown error'}`, true);
    }
  } catch (e) {
    ctx.showStatus('Error: ' + e.message, true);
  } finally {
    ctx.actionPending = false;
    ctx.loadingModel = false;
  }
}

export async function handleModelUnload(ctx) {
  if (!ctx.activeModel) return;

  ctx.actionPending = true;
  ctx.showStatus(`Unloading model ${ctx.activeModel}...`);

  try {
    const res = await fetch('/api/llm/models/unload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: ctx.activeModel })
    });
    const data = await res.json();
    if (res.ok) {
      ctx.activeModel = '';
      ctx.showStatus(`Unloaded model successfully!`);
    } else {
      ctx.showStatus(`Failed: ${data.detail || 'Unknown error'}`, true);
    }
  } catch (e) {
    ctx.showStatus('Error: ' + e.message, true);
  } finally {
    ctx.actionPending = false;
  }
}

export async function fetchModelsIni(ctx) {
  ctx.modelsIniLoading = true;
  try {
    const res = await fetch('/api/models_ini');
    if (res.ok) {
      const data = await res.json();
      ctx.modelsIniText = data.content || '';
    }
  } catch (err) {
    console.error(err);
  } finally {
    ctx.modelsIniLoading = false;
  }
}

export async function saveModelsIni(ctx) {
  ctx.modelsIniLoading = true;
  try {
    const res = await fetch('/api/models_ini', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: ctx.modelsIniText })
    });
    if (res.ok) {
      ctx.dispatchEvent(new CustomEvent('op-queue-notification', {
        detail: { message: 'models.ini saved successfully' },
        bubbles: true,
        composed: true
      }));
      ctx.fetchModelsList();
    } else {
      const err = await res.text();
      ctx.dispatchEvent(new CustomEvent('op-queue-notification', {
        detail: { message: `Save failed: ${err}` },
        bubbles: true,
        composed: true
      }));
    }
  } catch (err) {
    console.error(err);
  } finally {
    ctx.modelsIniLoading = false;
  }
}

export async function handleScanAndRegister(ctx) {
  ctx.modelsIniLoading = true;
  try {
    const res = await fetch('/api/models/scan_and_register', { method: 'POST' });
    if (res.ok) {
      const data = await res.json();
      ctx.dispatchEvent(new CustomEvent('op-queue-notification', {
        detail: { message: data.detail || 'Scan complete!' },
        bubbles: true,
        composed: true
      }));
      ctx.fetchModelsList();
      ctx.fetchModelsIni();
    } else {
      const err = await res.text();
      ctx.dispatchEvent(new CustomEvent('op-queue-notification', {
        detail: { message: `Scan failed: ${err}` },
        bubbles: true,
        composed: true
      }));
    }
  } catch (err) {
    console.error(err);
  } finally {
    ctx.modelsIniLoading = false;
  }
}

export async function executeDeleteModel(ctx, filename) {
  if (!filename) return;

  try {
    const res = await fetch(`/models/${encodeURIComponent(filename)}`, {
      method: 'DELETE'
    });
    if (res.ok) {
      const data = await res.json();
      ctx.dispatchEvent(new CustomEvent('op-queue-notification', {
        detail: { message: data.detail || `Deleted ${filename}` },
        bubbles: true,
        composed: true
      }));
      ctx.fetchModelsList();
      ctx.fetchModelsIni();
    } else {
      const err = await res.text();
      ctx.dispatchEvent(new CustomEvent('op-queue-notification', {
        detail: { message: `Delete failed: ${err}` },
        bubbles: true,
        composed: true
      }));
    }
  } catch (err) {
    console.error(err);
  }
}

export async function handleFreeComfyUI(ctx) {
  ctx.actionPending = true;
  ctx.showStatus('Freeing ComfyUI VRAM...');
  try {
    const res = await fetch('/api/comfy/free', { method: 'POST' });
    const data = await res.json();
    if (res.ok) {
      ctx.showStatus('ComfyUI memory freed');
    } else {
      ctx.showStatus(data.detail || 'Failed to free ComfyUI', true);
    }
  } catch (e) {
    console.error(e);
    ctx.showStatus(`Error: ${e.message}`, true);
  } finally {
    ctx.actionPending = false;
  }
}
