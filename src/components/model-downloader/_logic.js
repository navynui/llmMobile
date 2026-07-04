export function handleQueryInput(ctx, e) {
  ctx.dispatchEvent(new CustomEvent('query-change', {
    detail: { query: e.target.value }
  }));
}

export function handleSearch(ctx) {
  ctx.dispatchEvent(new CustomEvent('search'));
}

export function handleSelectRepo(ctx, repoId) {
  ctx.dispatchEvent(new CustomEvent('select-repo', {
    detail: { repoId }
  }));
}

export function handleDownload(ctx, filename) {
  ctx.dispatchEvent(new CustomEvent('download', {
    detail: { filename }
  }));
}

export function handleStopDownload(ctx, key) {
  ctx.dispatchEvent(new CustomEvent('stop-download', {
    detail: { key }
  }));
}

export function handleResumeDownload(ctx, key) {
  ctx.dispatchEvent(new CustomEvent('resume-download', {
    detail: { key }
  }));
}

export function handleCancelDownload(ctx, key) {
  ctx.dispatchEvent(new CustomEvent('cancel-download', {
    detail: { key }
  }));
}

export function handleClearFinished(ctx) {
  ctx.dispatchEvent(new CustomEvent('clear-finished'));
}

export function formatEta(seconds) {
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins < 60) return `${mins}m ${secs}s`;
  const hrs = Math.floor(mins / 60);
  const remMins = mins % 60;
  return `${hrs}h ${remMins}m`;
}

export function getStatusColor(status) {
  if (!status) return 'var(--text-secondary)';
  switch (status.toLowerCase()) {
    case 'downloading':
    case 'queued':
      return 'var(--primary)';
    case 'completed':
      return 'var(--success)';
    case 'failed':
    case 'cancelled':
    case 'cancelling':
      return 'var(--danger)';
    case 'paused':
    case 'pausing':
      return 'var(--warning)';
    default:
      return 'var(--text-secondary)';
  }
}
