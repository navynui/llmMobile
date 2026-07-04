import { css } from 'lit';
import { cardStyles, buttonStyles } from '../_primitives.js';

export const modelDownloaderStyles = css`
    ${cardStyles}
    ${buttonStyles}

    .arrow-icon {
      font-size: 0.8rem;
      transition: var(--transition);
      color: var(--text-secondary);
    }
    .arrow-expanded {
      transform: rotate(180deg);
    }

    .switcher-header {
      cursor: pointer;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .switcher-body {
      max-height: 0;
      overflow: hidden;
      transition: max-height 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    }
    .switcher-body.expanded {
      max-height: none;
      margin-top: 16px;
    }

    .refresh-row {
      display: flex;
      justify-content: flex-end;
      margin-bottom: 10px;
    }
    .refresh-btn {
      padding: 6px 12px;
      font-size: 0.75rem;
      border-radius: var(--radius-sm);
      cursor: pointer;
      border: 1px solid var(--border-color);
      background: rgba(255, 255, 255, 0.04);
      color: var(--text-secondary);
      transition: var(--transition);
      font-family: var(--font-sans);
    }
    .refresh-btn:hover {
      background: rgba(255, 255, 255, 0.08);
      color: var(--text-primary);
    }

    /* Text Inputs */
    .text-input {
      flex: 1;
      background: rgba(0, 0, 0, 0.3);
      border: 1px solid var(--border-color);
      border-radius: var(--radius-md);
      padding: 12px 14px;
      color: var(--text-primary);
      font-size: 0.9rem;
      font-family: var(--font-sans);
      outline: none;
      transition: var(--transition);
    }
    .text-input:focus {
      border-color: var(--primary);
      box-shadow: 0 0 0 2px var(--primary-glow);
    }

    /* Input group */
    .input-group {
      display: flex;
      gap: 8px;
      width: 100%;
    }

    /* Downloads List */
    .downloads-container {
      margin-top: 8px;
    }
    .download-item {
      background: rgba(99, 102, 241, 0.04);
      border: 1px solid rgba(99, 102, 241, 0.2);
      border-radius: var(--radius-md);
      padding: 14px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin-bottom: 10px;
    }
    .download-info {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 0.85rem;
    }
    .download-filename {
      font-weight: 600;
      color: var(--text-primary);
      word-break: break-all;
      flex: 1;
      margin-right: 8px;
    }
    .download-speed {
      color: var(--success);
      font-weight: 500;
      white-space: nowrap;
    }
    .progress-track {
      width: 100%;
      height: 4px;
      background: rgba(255, 255, 255, 0.06);
      border-radius: 2px;
      overflow: hidden;
    }
    .progress-fill {
      height: 100%;
      background: linear-gradient(90deg, var(--primary), #a5b4fc);
      transition: width 0.3s ease-out;
      border-radius: 2px;
    }
    .download-eta {
      font-size: 0.72rem;
      color: var(--text-secondary);
      white-space: nowrap;
    }
    .download-actions {
      display: flex;
      gap: 6px;
      margin-top: 4px;
      flex-wrap: wrap;
    }
    .download-action-btn {
      padding: 4px 10px;
      font-size: 0.72rem;
      border-radius: var(--radius-sm);
      cursor: pointer;
      border: 1px solid var(--border-color);
      background: rgba(255, 255, 255, 0.04);
      color: var(--text-primary);
      transition: var(--transition);
      font-family: var(--font-sans);
    }
    .download-action-btn:hover {
      background: rgba(255, 255, 255, 0.08);
    }
    .download-action-btn.danger {
      color: var(--danger);
      border-color: rgba(239, 68, 68, 0.3);
    }
    .download-action-btn.danger:hover {
      background: var(--danger-glow);
    }
    .clear-finished-btn {
      margin-top: 8px;
      padding: 8px 14px;
      font-size: 0.8rem;
      border-radius: var(--radius-md);
      cursor: pointer;
      border: 1px solid var(--border-color);
      background: rgba(255, 255, 255, 0.04);
      color: var(--text-secondary);
      transition: var(--transition);
      font-family: var(--font-sans);
      width: 100%;
      text-align: center;
    }
    .clear-finished-btn:hover {
      background: rgba(255, 255, 255, 0.08);
      color: var(--text-primary);
    }
    .empty-state {
      margin-top: 10px;
      padding: 16px;
      text-align: center;
      font-size: 0.82rem;
      color: var(--text-muted);
      border: 1px dashed rgba(255, 255, 255, 0.08);
      border-radius: var(--radius-md);
      background: rgba(0, 0, 0, 0.15);
    }

    /* Repo list styling */
    .repo-list {
      display: flex;
      flex-direction: column;
      gap: 10px;
      margin-top: 8px;
    }
    .repo-item {
      background: rgba(255, 255, 255, 0.02);
      border: 1px solid var(--border-color);
      border-radius: var(--radius-md);
      padding: 14px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      cursor: pointer;
      transition: var(--transition);
    }
    .repo-item:hover {
      background: rgba(255, 255, 255, 0.04);
      border-color: rgba(99, 102, 241, 0.4);
    }
    .model-file-item {
      display: flex;
      align-items: center;
      gap: 10px;
      justify-content: flex-start;
      padding: 12px 14px;
      background: rgba(255, 255, 255, 0.02);
      border: 1px solid var(--border-color);
      border-radius: var(--radius-md);
    }
    .search-result-item {
      background: rgba(255, 255, 255, 0.02);
      border: 1px solid var(--border-color);
      border-radius: var(--radius-md);
      padding: 14px;
      cursor: pointer;
      transition: var(--transition);
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .search-result-item:hover {
      background: rgba(99, 102, 241, 0.06);
      border-color: rgba(99, 102, 241, 0.3);
    }
    .meta-badge {
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.08);
      color: var(--text-secondary);
      border-radius: var(--radius-sm);
      padding: 2px 6px;
      font-size: 0.72rem;
      font-weight: 500;
    }
    .model-file-name {
      font-size: 0.85rem;
      font-weight: 500;
      color: var(--text-primary);
      word-break: break-all;
    }
    .model-file-size {
      font-size: 0.72rem;
      color: var(--text-secondary);
      flex-shrink: 0;
    }
    .repo-title {
      font-weight: 600;
      font-size: 0.95rem;
      color: var(--text-primary);
      word-break: break-all;
    }

    /* Loader */
    .loader {
      width: 16px;
      height: 16px;
      border: 2px solid rgba(255, 255, 255, 0.1);
      border-top-color: var(--primary);
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
      display: inline-block;
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
  `;
