class OperationQueue {
  constructor() {
    this.queue = JSON.parse(localStorage.getItem('op_queue') || '[]');
    this.isProcessing = false;

    // Listen for reconnection
    window.addEventListener('online', () => {
      this._notifyStatus('Back online! Replaying queued tasks...');
      this.processNext();
    });
    
    // Process any items left over from previous session
    if (navigator.onLine && this.queue.length > 0) {
      this.processNext();
    }
  }

  push(url, options = {}) {
    const op = {
      id: 'op_' + Math.random().toString(36).substr(2, 9),
      url,
      method: options.method || 'POST',
      headers: options.headers || {},
      body: options.body || null,
      status: 'pending',
      timestamp: Date.now()
    };
    
    this.queue.push(op);
    localStorage.setItem('op_queue', JSON.stringify(this.queue));
    
    // Broadcast queue update to components
    window.dispatchEvent(new CustomEvent('op-queue-changed', { detail: this.queue }));

    if (!navigator.onLine) {
      this._notifyStatus('Offline. Action queued to execute on reconnect.');
    } else {
      this.processNext();
    }
    
    return op;
  }

  async processNext() {
    if (this.isProcessing || !navigator.onLine) return;
    this.isProcessing = true;

    while (this.queue.length > 0) {
      const op = this.queue.find(o => o.status === 'pending');
      if (!op) break;

      if (!navigator.onLine) {
        break;
      }

      op.status = 'processing';
      localStorage.setItem('op_queue', JSON.stringify(this.queue));
      window.dispatchEvent(new CustomEvent('op-queue-changed', { detail: this.queue }));

      try {
        const res = await fetch(op.url, {
          method: op.method,
          headers: {
            'Content-Type': 'application/json',
            ...op.headers
          },
          body: op.body
        });

        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }

        op.status = 'completed';
        // Remove completed item from queue
        this.queue = this.queue.filter(o => o.id !== op.id);
        localStorage.setItem('op_queue', JSON.stringify(this.queue));
        window.dispatchEvent(new CustomEvent('op-queue-changed', { detail: this.queue }));
      } catch (err) {
        console.warn(`[Offline Queue] Operation failed: ${err.message}. Will retry.`);
        op.status = 'pending';
        localStorage.setItem('op_queue', JSON.stringify(this.queue));
        window.dispatchEvent(new CustomEvent('op-queue-changed', { detail: this.queue }));
        
        // Wait 5 seconds before retrying
        this.isProcessing = false;
        setTimeout(() => this.processNext(), 5000);
        return;
      }
    }

    this.isProcessing = false;
  }

  _notifyStatus(msg) {
    window.dispatchEvent(new CustomEvent('op-queue-notification', { detail: { message: msg } }));
  }

  getQueue() {
    return this.queue;
  }
}

export const opQueue = new OperationQueue();
