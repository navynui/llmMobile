import { css } from 'lit';

export const serverTabStyles = css`
    :host {
      display: block;
      padding: 16px;
      color: var(--text-primary);
      background-color: var(--bg-color);
      min-height: calc(var(--app-dvh) - 80px);
      box-sizing: border-box;
    }

    .server-tab {
      display: flex;
      flex-direction: column;
      gap: 20px;
      max-width: 800px;
      margin: 0 auto;
      padding-bottom: 40px;
    }
    


    server-status-card, models-config-editor, model-downloader, server-logs {
      width: 100%;
    }

    .status-msg {
      margin-top: 12px;
      font-size: 0.85rem;
      text-align: center;
      color: var(--success);
      font-weight: 500;
      animation: fadeIn 0.2s ease-out;
    }

    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(-4px); }
      to { opacity: 1; transform: translateY(0); }
    }
  `;
