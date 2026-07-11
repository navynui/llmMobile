import { css } from 'lit';

export const chatStyles = css`
    :host {
      display: flex;
      flex-direction: column;
      height: 100%;
      background: var(--bg-color);
    }

    .chat-container {
      flex: 1;
      overflow-y: auto;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 16px;
      padding-bottom: 24px;
    }

    /* Message Bubbles */
    .message {
      max-width: 85%;
      display: flex;
      flex-direction: column;
      gap: 4px;
      animation: messageSlideIn 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    }

    @keyframes messageSlideIn {
      from { opacity: 0; transform: translateY(8px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .message.user {
      align-self: flex-end;
    }

    .message.assistant {
      align-self: flex-start;
    }

    .bubble {
      padding: 12px 16px;
      border-radius: var(--radius-lg);
      font-size: 0.95rem;
      line-height: 1.5;
      word-break: break-word;
    }

    .user .bubble {
      background: var(--primary);
      color: #fff;
      border-bottom-right-radius: 4px;
      box-shadow: 0 4px 12px var(--primary-glow);
    }

    .assistant .bubble {
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      color: var(--text-primary);
      border-bottom-left-radius: 4px;
      box-shadow: var(--shadow-md);
    }

    /* Clickable link styling */
    .bubble a {
      color: #818cf8;
      text-decoration: underline;
      text-underline-offset: 2px;
      text-decoration-thickness: 1px;
      text-decoration-color: rgba(129, 140, 248, 0.35);
      transition: var(--transition);
      word-break: break-all;
    }

    .bubble a:hover {
      color: #a5b4fc;
      text-decoration-color: #818cf8;
    }

    .bubble a:visited {
      color: #c4b5fd;
    }

    /* Thinking block styling */
    .thinking-box {
      background: rgba(17, 24, 39, 0.4);
      border: 1px solid rgba(156, 163, 175, 0.15);
      border-radius: var(--radius-md);
      padding: 10px 12px;
      margin-bottom: 12px;
      font-size: 0.85rem;
      color: var(--text-secondary);
      font-family: var(--font-sans);
    }

    .thinking-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-weight: 600;
      color: var(--text-muted);
    }

    .thinking-content {
      border-left: 2px solid var(--primary);
      padding-left: 10px;
      margin-top: 6px;
      font-family: var(--font-mono);
      font-size: 0.8rem;
      white-space: pre-wrap;
      max-height: 150px;
      overflow-y: auto;
      color: var(--text-muted);
    }

    /* Markdown styling inside bubbles */
    .bubble p {
      margin-bottom: 8px;
    }
    .bubble p:last-child {
      margin-bottom: 0;
    }
    .bubble code {
      font-family: var(--font-mono);
      background: rgba(0, 0, 0, 0.3);
      padding: 2px 6px;
      border-radius: var(--radius-sm);
      font-size: 0.85rem;
    }
    .bubble pre {
      font-family: var(--font-mono);
      background: rgba(0, 0, 0, 0.4);
      padding: 12px;
      border-radius: var(--radius-md);
      overflow-x: auto;
      margin: 8px 0;
      border: 1px solid rgba(255, 255, 255, 0.05);
    }
    .bubble pre code {
      background: none;
      padding: 0;
      font-size: 0.85rem;
    }
    .bubble ul, .bubble ol {
      margin-left: 20px;
      margin-bottom: 8px;
    }

    .bubble h1, .bubble h2, .bubble h3 {
      font-family: var(--font-title);
      color: var(--text-primary);
      margin-top: 14px;
      margin-bottom: 8px;
      font-weight: 600;
    }
    .bubble h1 { font-size: 1.25rem; }
    .bubble h2 { font-size: 1.15rem; }
    .bubble h3 { font-size: 1.05rem; }

    /* Table styles */
    .table-container {
      width: 100%;
      overflow-x: auto;
      margin: 12px 0;
      border-radius: var(--radius-md);
      border: 1px solid var(--border-color);
      background: rgba(0, 0, 0, 0.15);
      -webkit-overflow-scrolling: touch;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.85rem;
      text-align: left;
    }

    th {
      background: rgba(255, 255, 255, 0.04);
      padding: 10px 14px;
      font-weight: 600;
      color: var(--text-primary);
      border-bottom: 1px solid var(--border-color);
      white-space: nowrap;
    }

    td {
      padding: 10px 14px;
      color: var(--text-secondary);
      border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    }

    tr:last-child td {
      border-bottom: none;
    }

    tr:hover td {
      background: rgba(255, 255, 255, 0.02);
    }

    /* Math styles */
    .math-block {
      display: block;
      text-align: center;
      margin: 12px auto;
      font-family: 'Cambria Math', 'Nimbus Roman No9 L', 'Times New Roman', serif;
      font-size: 1.15rem;
      background: rgba(255, 255, 255, 0.02);
      padding: 10px;
      border-radius: var(--radius-md);
      border-left: 3px solid var(--primary);
      width: fit-content;
      max-width: 90%;
    }

    .math-inline {
      font-family: 'Cambria Math', 'Nimbus Roman No9 L', 'Times New Roman', serif;
      font-size: 1.05rem;
      font-style: italic;
      padding: 0 4px;
      background: rgba(99, 102, 241, 0.05);
      border-radius: var(--radius-sm);
    }

    .frac {
      display: inline-block;
      vertical-align: middle;
      text-align: center;
      font-size: 0.85em;
      line-height: 1;
      padding: 0 2px;
    }

    .frac sup {
      display: block;
      border-bottom: 1px solid var(--text-primary);
      font-size: inherit;
      vertical-align: baseline;
      position: static;
    }

    .frac sub {
      display: block;
      font-size: inherit;
      vertical-align: baseline;
      position: static;
    }

    /* Metadata label */
    .meta-info {
      font-size: 0.75rem;
      color: var(--text-muted);
      align-self: flex-start;
      margin-left: 4px;
    }

    /* Input Bar */
    .input-bar {
      background: rgba(11, 15, 25, 0.8);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      border-top: 1px solid var(--border-color);
      padding: 12px 16px;
      display: flex;
      gap: 12px;
      align-items: center;
      z-index: 10;
    }

    textarea {
      flex: 1;
      height: 40px;
      min-height: 40px;
      max-height: 40px;
      box-sizing: border-box;
      background: rgba(0, 0, 0, 0.2);
      border: 1px solid var(--border-color);
      border-radius: var(--radius-full);
      padding: 10px 18px;
      color: var(--text-primary);
      font-family: var(--font-sans);
      font-size: 0.95rem;
      outline: none;
      resize: none;
      transition: var(--transition);
      line-height: 1.25;
      overflow-y: auto;
    }

    textarea:focus {
      border-color: var(--primary);
      background: rgba(0, 0, 0, 0.3);
    }

    /* Send image button (conditional) */
    .send-image-btn {
      width: 30px;
      height: 30px;
      border-radius: var(--radius-full);
      background: rgba(255, 255, 255, 0.1);
      color: #fff;
      border: none;
      display: flex;
      justify-content: center;
      align-items: center;
      cursor: pointer;
      transition: var(--transition);
      box-shadow: 0 2px 4px rgba(0,0,0,0.15);
      font-size: 16px;
      flex-shrink: 0;
    }

    .send-image-btn:hover {
      background: rgba(255, 255, 255, 0.15);
    }

    .send-btn {
      width: 36px;
      height: 36px;
      border-radius: var(--radius-full);
      background: var(--primary);
      color: #fff;
      border: none;
      display: flex;
      justify-content: center;
      align-items: center;
      cursor: pointer;
      transition: var(--transition);
      box-shadow: 0 4px 10px var(--primary-glow);
      flex-shrink: 0;
    }

    .send-btn:hover {
      background: #4f46e5;
    }

    .send-btn:disabled {
      background: var(--bg-card);
      color: var(--text-muted);
      cursor: not-allowed;
      box-shadow: none;
      flex-shrink: 0;
    }

    /* Typing indicator */
    .typing-indicator {
      display: flex;
      gap: 4px;
      padding: 8px 12px;
      align-items: center;
    }

    .dot {
      width: 6px;
      height: 6px;
      background: var(--text-muted);
      border-radius: 50%;
      animation: dotPulse 1.4s infinite both;
    }

    .dot:nth-child(2) { animation-delay: 0.2s; }
    .dot:nth-child(3) { animation-delay: 0.4s; }

    @keyframes dotPulse {
      0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
      40% { transform: scale(1.1); opacity: 1; }
    }

    /* Tool call indicators */
    .tool-calls-bar {
      display: flex;
      flex-direction: column;
      gap: 4px;
      margin-bottom: 8px;
      padding: 6px;
      background: rgba(99, 102, 241, 0.06);
      border: 1px solid rgba(99, 102, 241, 0.12);
      border-radius: var(--radius-md);
    }

    .tool-call-item {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 0.8rem;
      padding: 4px 8px;
      border-radius: var(--radius-sm);
      background: rgba(0, 0, 0, 0.15);
    }

    .tool-call-item.done {
      opacity: 0.7;
    }

    .tool-call-icon {
      font-size: 0.9rem;
      flex-shrink: 0;
    }

    .tool-call-name {
      font-weight: 500;
      color: var(--text-secondary);
      text-transform: capitalize;
      flex: 1;
    }

    .tool-call-spinner {
      width: 12px;
      height: 12px;
      border: 2px solid var(--primary);
      border-top-color: transparent;
      border-radius: 50%;
      animation: toolSpin 0.6s linear infinite;
      flex-shrink: 0;
    }

    @keyframes toolSpin {
      to { transform: rotate(360deg); }
    }

    .tool-call-check {
      color: #22c55e;
      font-weight: bold;
      font-size: 0.85rem;
      flex-shrink: 0;
    }
  `;
