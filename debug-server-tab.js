// This file will help us debug server tab component structure during runtime

import { LitElement, html, css } from 'lit';
import './server-status-card.js';
import './models-config-editor.js';
import './model-downloader.js';
import './server-logs.js';

export class DebugServerTab extends LitElement {
  static properties = {
    stats: { type: Object },
    status: { type: Object },
    models: { type: Array }
  };

  constructor() {
    super();
    this.stats = {};
    this.status = {};
    this.models = [];
  }

  render() {
    return html`
      <div class="debug-server-tab">
        <h2>Debug Server Tab</h2>
        
        <!-- Status card -->
        <server-status-card
          .stats="${this.stats}"
          .status="${this.status}">
        </server-status-card>

        <!-- Models Config Editor -->
        <models-config-editor 
          .models="${this.models}"
          .activeModel="${'test-model'}>
        </models-config-editor>
      </div>
    `;
  }

  static styles = css`
    .debug-server-tab {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }
    
    @media (max-width: 768px) {
      .debug-server-tab {
        padding: 0.5rem;
      }
    }
  `;
}