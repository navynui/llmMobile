
export function startSSEStream(ctx) {
  if (ctx.evtSource) ctx.stopSSEStream();

  const lastEventId = localStorage.getItem('last_event_id') || '0';
  ctx.evtSource = new EventSource(`/events/status?since=${lastEventId}`);
  
  ctx.evtSource.onopen = () => {
    ctx.sseConnected = true;
  };

  ctx.evtSource.onerror = () => {
    ctx.sseConnected = false;
  };

  ctx.evtSource.addEventListener('stats', (e) => {
    try {
      const payload = JSON.parse(e.data);
      ctx.sseData = payload;
      
      if (e.lastEventId) {
        localStorage.setItem('last_event_id', e.lastEventId);
      }
    } catch (err) {
      console.error("Failed to parse SSE payload", err);
    }
  });

  ctx.evtSource.addEventListener('notification', (e) => {
    try {
      const payload = JSON.parse(e.data);
      if (payload.message) {
        ctx.showToast(payload.message);
      }
    } catch (err) {
      console.error("Failed to parse notification payload", err);
    }
  });
}

export function stopSSEStream(ctx) {
  if (ctx.evtSource) {
    ctx.evtSource.close();
    ctx.evtSource = null;
    ctx.sseConnected = false;
  }
}

export function startQueueStream(ctx) {
  if (ctx.queueSse) ctx.stopQueueStream();

  ctx.queueSse = new EventSource('/events/queue');
  
  ctx.queueSse.addEventListener('queue', (e) => {
    try {
      const payload = JSON.parse(e.data);
      const newQueue = payload.queue || [];
      ctx.checkQueueCompletions(ctx.queue, newQueue);
      ctx.queue = newQueue;
      // Dispatch a custom event so child components like generator-tab
      // can force re-render as a belt-and-suspenders alongside property binding.
      window.dispatchEvent(new CustomEvent('queue-update', { detail: ctx.queue }));
    } catch (err) {
      console.error("Failed to parse queue SSE payload", err);
    }
  });

  ctx.queueSse.onerror = () => {
    if (ctx.queueSse) {
      ctx.queueSse.close();
      ctx.queueSse = null;
    }
    setTimeout(() => ctx.startQueueStream(), 5000);
  };
}

export function stopQueueStream(ctx) {
  if (ctx.queueSse) {
    ctx.queueSse.close();
    ctx.queueSse = null;
  }
}

export function stopAllStreams(ctx) {
  ctx.stopSSEStream();
  ctx.stopQueueStream();
}
