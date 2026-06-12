import { LitElement, html, css } from 'lit';

// --- More Tab (stub until Phase 5) ---

export class MoreTab extends LitElement {
  static styles = css`
    :host {
      display: block;
      padding: 20px 16px;
      color: var(--text-secondary);
    }
    .container {
      max-width: 600px;
      margin: 0 auto;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .card {
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      border-radius: var(--radius-lg);
      padding: 20px;
      box-shadow: var(--shadow-lg);
    }
    h2 {
      font-family: var(--font-title);
      color: var(--text-primary);
      font-size: 1.1rem;
      margin-bottom: 12px;
    }
    ul {
      list-style-type: none;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    li {
      padding: 10px;
      background: rgba(255, 255, 255, 0.02);
      border: 1px solid rgba(255, 255, 255, 0.04);
      border-radius: var(--radius-sm);
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 0.9rem;
    }
    .arrow {
      color: var(--text-muted);
    }
  `;

  render() {
    return html`
      <div class="container">
        <div class="card">
          <h2>📦 Model Downloader</h2>
          <ul>
            <li>
              <span>Search HuggingFace Hub</span>
              <span class="arrow">➔</span>
            </li>
            <li>
              <span>Active Downloads (0)</span>
              <span class="arrow">➔</span>
            </li>
          </ul>
        </div>
        
        <div class="card">
          <h2>📊 Benchmark Rankings</h2>
          <p style="font-size: 0.85rem; line-height: 1.4; margin-bottom: 8px;">Compare local GGUF model speeds and scoring matrices.</p>
          <ul>
            <li>
              <span>View Benchmark Scores</span>
              <span class="arrow">➔</span>
            </li>
          </ul>
        </div>
        
        <div class="card">
          <h2>⚙️ Settings & System Logs</h2>
          <ul>
            <li>
              <span>App Preferences</span>
              <span class="arrow">➔</span>
            </li>
            <li>
              <span>Real-Time Logs</span>
              <span class="arrow">➔</span>
            </li>
          </ul>
        </div>
      </div>
    `;
  }
}
customElements.define('more-tab', MoreTab);
