import { LitElement } from 'lit';
import { chatStyles } from './chat-tab/_styles.js';
import * as logic from './chat-tab/_logic.js';
import { renderChat } from './chat-tab/_templates.js';

export class ChatTab extends LitElement {
  static properties = {
    messages: { type: Array },
    inputActive: { type: Boolean },
    isGenerating: { type: Boolean },
    metadata: { type: Object },
    visionCapable: { type: Boolean },
    showReloadBanner: { type: Boolean },
    previousModelName: { type: String },
    isReloading: { type: Boolean },
    chatServer: { type: String },
    loadedModelName: { type: String }
  };

  static styles = chatStyles;

  constructor() {
    super();
    this.messages = [];
    this.inputActive = false;
    this.isGenerating = false;
    this.metadata = null;
    this.visionCapable = false;
    this.showReloadBanner = false;
    this.previousModelName = '';
    this.isReloading = false;
    this.chatServer = 'primary';
    this.loadedModelName = '';

    // Load chat history from localStorage
    const saved = localStorage.getItem('chat_history');
    if (saved) {
      try {
        this.messages = JSON.parse(saved);
      } catch (e) {
        this.messages = [];
      }
    }
  
    this.imageAttachment = null;
    this.imageSent = false;
  }

  connectedCallback() {
    super.connectedCallback();
    this.statusPoll = setInterval(() => logic.checkModelStatus(this), 3000);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this.statusPoll) clearInterval(this.statusPoll);
  }

  async firstUpdated() {
    await logic.checkVisionSupport(this);
    await logic.checkModelStatus(this);
  }

  updated(changedProperties) {
    if (changedProperties.has('messages')) {
      logic.scrollToBottom(this);
      // Cache history (keep last 100)
      if (this.messages.length > 100) {
        this.messages = this.messages.slice(this.messages.length - 100);
      }
      localStorage.setItem('chat_history', JSON.stringify(this.messages));
    }
    
    // Check vision capability when metadata changes
    if (changedProperties.has('metadata')) {
      logic.checkVisionSupport(this);
    }
  }

  render() {
    return renderChat(this);
  }
}

customElements.define('chat-tab', ChatTab);
