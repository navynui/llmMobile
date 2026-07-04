import { css } from 'lit';
import { cardStyles, buttonStyles } from '../_primitives.js';

export const modelsConfigStyles = css`
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

    .active-model-info {
      background: rgba(99, 102, 241, 0.06);
      border: 1px solid rgba(99, 102, 241, 0.15);
      border-radius: var(--radius-md);
      padding: 12px;
      margin-bottom: 16px;
      font-size: 0.85rem;
    }

    .select-label {
      font-size: 0.8rem;
      font-weight: 500;
      color: var(--text-secondary);
      margin-bottom: 8px;
    }

    select {
      width: 100%;
      padding: 12px;
      background: rgba(0, 0, 0, 0.2);
      border: 1px solid var(--border-color);
      border-radius: var(--radius-md);
      color: var(--text-primary);
      font-family: var(--font-sans);
      font-size: 0.9rem;
      outline: none;
      cursor: pointer;
      appearance: none;
      -webkit-appearance: none;
      background-image: url("data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%239ca3af' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E");
      background-repeat: no-repeat;
      background-position: right 12px center;
      background-size: 16px;
      padding-right: 40px;
      transition: var(--transition);
    }

    option {
      background: #0f172a;
      color: #ffffff;
    }

    select:focus {
      border-color: var(--primary);
    }

    .btn-group {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
      margin-top: 16px;
    }

    /* Text Inputs for edit models.ini */
    .text-input {
      width: 100%;
      box-sizing: border-box;
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

    /* file list & downloaded items styling */
    .file-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin-bottom: 16px;
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
      transition: var(--transition);
    }

    .model-file-item:hover {
      background: rgba(255, 255, 255, 0.04);
      border-color: rgba(99, 102, 241, 0.4);
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

    /* Modal dialog */
    .modal-backdrop {
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0, 0, 0, 0.7);
      backdrop-filter: blur(4px);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
      padding: 20px;
      animation: fadeIn 0.2s ease;
    }

    .modal {
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      border-radius: var(--radius-lg);
      padding: 24px;
      max-width: 400px;
      width: 100%;
      box-shadow: var(--shadow-2xl);
      display: flex;
      flex-direction: column;
      gap: 16px;
      animation: scaleIn 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    }

    .modal-title {
      font-family: var(--font-title);
      font-size: 1.15rem;
      color: var(--text-primary);
      margin: 0;
    }

    .modal-body {
      font-size: 0.88rem;
      color: var(--text-secondary);
      line-height: 1.4;
      margin: 0;
    }

    .modal-actions {
      display: flex;
      gap: 12px;
      justify-content: flex-end;
    }

    @keyframes scaleIn {
      from { transform: scale(0.95); opacity: 0; }
      to { transform: scale(1); opacity: 1; }
    }

    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }

    .card-container {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
  `;
