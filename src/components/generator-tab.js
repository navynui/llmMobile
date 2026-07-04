import { LitElement, html } from 'lit';
import { opQueue } from '../utils/op-queue.js';
import { generatorStyles } from './generator-tab/_styles.js';
import { submitTask, cancelItem, clearDone, regenerateSingleImage, rerunItem } from './generator-tab/_logic.js';
import { renderForm, renderQueue, renderLightbox, renderActionSheet } from './generator-tab/_templates.js';

export class GeneratorTab extends LitElement {
  static properties = {
    prompt: { type: String },
    resolution: { type: String },
    numImages: { type: Number },
    queue: { type: Array },
    submitting: { type: Boolean },
    errorMsg: { type: String },
    activeThumbnailMenu: { type: Object },
    genMode: { type: String },
    seed: { type: String },
    forceGenerate: { type: Boolean },
    kreaMultiplier: { type: Number },
    enhancerStrength: { type: Number },
  };

  static styles = generatorStyles;

  constructor() {
    super();
    this.prompt = localStorage.getItem('gen_prompt') || '';
    this.resolution = localStorage.getItem('gen_resolution') || '1920x1088';
    this.numImages = parseInt(localStorage.getItem('gen_num_images') || '1', 10);
    this.genMode = localStorage.getItem('gen_mode') || 'zimage';
    this.seed = '';
    this.queue = [];
    this.submitting = false;
    this.errorMsg = '';
    this._lightbox = null;
    this.activeThumbnailMenu = null;
    this.forceGenerate = false;
    this.kreaMultiplier = parseFloat(localStorage.getItem('krea_multiplier')) || 1;
    this.enhancerStrength = parseFloat(localStorage.getItem('enhancer_strength')) || 1;
  }

  connectedCallback() {
    super.connectedCallback();
    this._onOpQueueChanged = () => this.requestUpdate();
    window.addEventListener('op-queue-changed', this._onOpQueueChanged);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener('op-queue-changed', this._onOpQueueChanged);
  }

  _savePrefs() {
    localStorage.setItem('gen_prompt', this.prompt);
    localStorage.setItem('gen_resolution', this.resolution);
    localStorage.setItem('gen_num_images', String(this.numImages));
    localStorage.setItem('gen_mode', this.genMode);
    localStorage.setItem('krea_multiplier', String(this.kreaMultiplier));
    localStorage.setItem('enhancer_strength', String(this.enhancerStrength));
  }

  async _submit() { await submitTask(this); }
  async _cancelItem(id) { await cancelItem(id); }
  async _clearDone() { await clearDone(); }
  async _regenerateSingleImage(item, index) { await regenerateSingleImage(this, item, index); }
  async _rerunItem(item) { await rerunItem(this, item); }

  _openThumbnailMenu(item, index) {
    this.activeThumbnailMenu = { item, index };
    this.requestUpdate();
  }

  _closeThumbnailMenu() {
    this.activeThumbnailMenu = null;
    this.requestUpdate();
  }

  async _copyPromptText(text) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {}
  }

  _openLightbox(images, index) {
    this._lightbox = { images, index };
    this.requestUpdate();
  }

  _closeLightbox() {
    this._lightbox = null;
    this.requestUpdate();
  }

  _lightboxNav(dir) {
    if (!this._lightbox) return;
    const len = this._lightbox.images.length;
    this._lightbox = { ...this._lightbox, index: (this._lightbox.index + dir + len) % len };
    this.requestUpdate();
  }

  _pillClass(status, isOffline) {
    if (isOffline) return 'pill-offline';
    return { queued: 'pill-queued', running: 'pill-running', completed: 'pill-completed', error: 'pill-error', cancelled: 'pill-cancelled' }[status] || 'pill-queued';
  }

  _subText(item) {
    if (item.isOffline) return 'Queued offline · Awaiting connection';
    if (item.model === 'both') {
      const subItems = item.sub_items || [];
      const done = Math.min(item.current_sub_index || 0, subItems.length);
      const label = subItems[done]?.workflow === 'krea2' ? 'Krea2' : (subItems[done]?.workflow || '?');
      return `Dual mode · ${label} (${done + 1}/${subItems.length})`;
    }
    if (item.status === 'running') {
      return `Image ${item.image_num || 1}/${item.total_images} · ${Math.round((item.progress || 0) * 100)}%`;
    }
    if (item.status === 'completed') return `${item.image_ids?.length || 0} image(s) generated`;
    if (item.status === 'error') return item.error || 'Unknown error';
    return `${item.resolution} · ${item.num_images} image(s)`;
  }

  render() {
    const offlineOps = opQueue.getQueue().filter(op => op.url === '/api/generate/queue' && op.status === 'pending');
    const offlineItems = offlineOps.map(op => {
      let promptText = 'Generation Task';
      let resVal = '1024x1024';
      let numImgs = 1;
      let model = 'zimage';
      try {
        const body = JSON.parse(op.body);
        promptText = body.prompt;
        resVal = body.resolution || resVal;
        numImgs = body.num_images || numImgs;
        model = body.model || model;
      } catch {}
      return {
        id: op.id,
        prompt: promptText,
        resolution: resVal,
        num_images: numImgs,
        model,
        status: 'queued',
        isOffline: true,
        image_ids: [],
        progress: 0.0,
      };
    });
    const combinedQueue = [...offlineItems, ...(this.queue || [])];
    const hasDone = combinedQueue.some(q => ['completed','error','cancelled'].includes(q.status));
    const buttonLabel = this.submitting ? 'Submitting…' : (this.genMode === 'krea2' ? '🎨 Generate' : this.genMode === 'both' ? '🔀 Generate both' : '⚡ Generate');
    
    return html`
      ${renderForm(this, buttonLabel)}
      ${renderQueue(this, combinedQueue, hasDone)}
      ${renderLightbox(this)}
      ${renderActionSheet(this)}
    `;
  }
}

customElements.define('generator-tab', GeneratorTab);
