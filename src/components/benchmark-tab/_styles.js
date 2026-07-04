import { css } from 'lit';

export const benchmarkStyles = css`
  :host {
    display: block;
    padding: 16px;
    color: var(--text-primary);
    background-color: var(--bg-color);
    min-height: calc(var(--app-dvh) - 80px);
    box-sizing: border-box;
  }

  .container {
    max-width: 800px;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: 20px;
    padding-bottom: 40px;
  }

  .card {
    background: var(--bg-card);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-lg);
    padding: 20px;
    box-shadow: var(--shadow-lg);
    display: flex;
    flex-direction: column;
    gap: 16px;
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
  }

  h2 {
    font-family: var(--font-title);
    color: var(--text-primary);
    font-size: 1.1rem;
    margin: 0;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .card-subtitle {
    font-size: 0.85rem;
    color: var(--text-secondary);
    margin-top: -8px;
    line-height: 1.4;
  }

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

  .btn {
    background: var(--primary);
    color: #fff;
    border: none;
    padding: 12px 18px;
    border-radius: var(--radius-md);
    font-weight: 600;
    font-size: 0.9rem;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    transition: var(--transition);
    outline: none;
    -webkit-tap-highlight-color: transparent;
  }

  .btn:hover:not(:disabled) {
    background: var(--primary-hover, #4f46e5);
  }

  .btn:active:not(:disabled) {
    transform: scale(0.97);
  }

  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-secondary {
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid var(--border-color);
    color: var(--text-primary);
  }

  .btn-secondary:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.1);
  }

  .btn-danger {
    background: var(--danger);
  }

  .btn-danger:hover:not(:disabled) {
    background: #b91c1c;
  }

  .input-group {
    display: flex;
    gap: 8px;
    width: 100%;
  }

  /* Benchmarks View */
  .benchmarks-header {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    justify-content: space-between;
    align-items: center;
  }

  .filter-pills {
    display: flex;
    gap: 6px;
    overflow-x: auto;
    scrollbar-width: none;
  }

  .filter-pills::-webkit-scrollbar {
    display: none;
  }

  .pill {
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid var(--border-color);
    color: var(--text-secondary);
    padding: 6px 12px;
    border-radius: 100px;
    font-size: 0.75rem;
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
    transition: var(--transition);
    outline: none;
    -webkit-tap-highlight-color: transparent;
  }

  .pill:active {
    transform: scale(0.95);
  }

  .pill.active {
    background: var(--primary-glow);
    color: var(--primary);
    border-color: rgba(99, 102, 241, 0.4);
  }

  .table-wrapper {
    overflow-x: auto;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    background: rgba(0, 0, 0, 0.1);
  }

  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.85rem;
    text-align: left;
  }

  th {
    background: rgba(17, 24, 39, 0.6);
    padding: 12px 14px;
    font-weight: 600;
    color: var(--text-secondary);
    border-bottom: 1px solid var(--border-color);
    cursor: pointer;
    user-select: none;
    transition: background 0.2s;
  }

  th:hover {
    background: rgba(255, 255, 255, 0.02);
  }

  td {
    padding: 12px 14px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.03);
    color: var(--text-primary);
  }

  tr:last-child td {
    border-bottom: none;
  }

  tr:hover td {
    background: rgba(255, 255, 255, 0.01);
  }

  .meta-badge {
    background: rgba(255, 255, 255, 0.05);
    padding: 2px 6px;
    border-radius: var(--radius-sm);
    font-size: 0.75rem;
  }

  .progress-track {
    width: 100%;
    height: 6px;
    background: rgba(255, 255, 255, 0.05);
    border-radius: 3px;
    overflow: hidden;
  }

  .progress-fill {
    height: 100%;
    background: linear-gradient(90deg, var(--primary), #a5b4fc);
    border-radius: 3px;
    transition: width 0.3s ease;
  }

  .select-input {
    background: rgba(0, 0, 0, 0.3);
    border: 1px solid var(--border-color);
    color: var(--text-primary);
    padding: 8px 12px;
    border-radius: var(--radius-sm);
    outline: none;
    font-size: 0.85rem;
    font-family: var(--font-sans);
  }

  option {
    background: #0f172a;
    color: #ffffff;
  }

  .logs-terminal {
    background: rgba(99, 102, 241, 0.03);
    border-color: var(--primary-glow);
    color: #a5b4fc;
  }

  /* Confirmation Modal */
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

  @keyframes scaleIn {
    from { transform: scale(0.95); opacity: 0; }
    to { transform: scale(1); opacity: 1; }
  }

  .modal-title {
    font-family: var(--font-title);
    font-size: 1.1rem;
    font-weight: 700;
    margin: 0;
  }

  .modal-body {
    font-size: 0.9rem;
    color: var(--text-secondary);
    line-height: 1.4;
  }

  .modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
  }

  .modal-large { max-width: 650px !important; max-height: 85vh; }
  .modal-body-scrollable { max-height: calc(85vh - 120px); overflow-y: auto; padding-right: 4px; display: flex; flex-direction: column; gap: 14px; }

  .loader {
    display: inline-block;
    width: 16px;
    height: 16px;
    border: 2px solid rgba(255, 255, 255, 0.2);
    border-radius: 50%;
    border-top-color: #fff;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .badge-success {
    background: rgba(16, 185, 129, 0.1);
    color: var(--success);
    border: 1px solid rgba(16, 185, 129, 0.2);
    padding: 2px 8px;
    border-radius: 100px;
    font-size: 0.75rem;
    font-weight: 600;
  }

  .badge-error {
    background: rgba(239, 68, 68, 0.1);
    color: var(--danger);
    border: 1px solid rgba(239, 68, 68, 0.2);
    padding: 2px 8px;
    border-radius: 100px;
    font-size: 0.75rem;
    font-weight: 600;
  }

  .switch {
    position: relative;
    display: inline-block;
    width: 44px;
    height: 24px;
    flex-shrink: 0;
  }

  .switch input {
    opacity: 0;
    width: 0;
    height: 0;
  }

  .slider {
    position: absolute;
    cursor: pointer;
    top: 0; left: 0; right: 0; bottom: 0;
    background-color: rgba(255, 255, 255, 0.1);
    transition: .3s;
    border-radius: 24px;
    border: 1px solid var(--border-color);
  }

  .slider:before {
    position: absolute;
    content: "";
    height: 16px;
    width: 16px;
    left: 3px;
    bottom: 3px;
    background-color: #fff;
    transition: .3s;
    border-radius: 50%;
  }

  input:checked + .slider {
    background-color: var(--primary);
    border-color: rgba(99, 102, 241, 0.4);
  }

  input:checked + .slider:before {
    transform: translateX(20px);
  }

  .bench-model-row {
    cursor: default;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .bench-model-row.clickable-cell {
    cursor: pointer;
  }

  .bench-model-row:hover .bench-model-name,
  .bench-model-row.clickable-cell:hover .bench-model-name {
    color: var(--primary) !important;
  }

  .sort-indicator {
    opacity: 0.4;
    font-size: 0.7rem;
    margin-left: 2px;
  }

  .bench-chip {
    display: inline-block;
    white-space: nowrap;
  }

  .row-queued {
    background: rgba(99,102,241,0.03);
    border-radius: var(--radius-md);
  }

  .round-card {
    background: rgba(255, 255, 255, 0.02);
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: var(--radius-md);
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .round-card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    padding-bottom: 6px;
  }

  .round-card-title {
    font-weight: 600;
    color: #a5b4fc;
    font-size: 0.85rem;
  }

  .round-card-score {
    font-weight: 700;
    color: var(--success);
    font-size: 0.8rem;
    background: rgba(16, 185, 129, 0.1);
    padding: 2px 6px;
    border-radius: var(--radius-sm);
  }

  .round-card-reasoning {
    font-size: 0.8rem;
    color: var(--text-secondary);
    line-height: 1.45;
    background: rgba(0, 0, 0, 0.25);
    padding: 8px 12px;
    border-left: 3px solid var(--primary);
    border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
    margin: 2px 0 0 0;
    white-space: pre-wrap;
  }

  .round-card-meta {
    font-size: 0.72rem;
    color: var(--text-muted);
    display: flex;
    gap: 12px;
  }

  .hallucination-warning-box {
    background: rgba(239, 68, 68, 0.08);
    border: 1px solid rgba(239, 68, 68, 0.2);
    border-radius: var(--radius-md);
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .hallucination-warning-title {
    color: #f87171;
    font-weight: 600;
    font-size: 0.82rem;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .hallucination-warning-desc {
    font-size: 0.78rem;
    color: var(--text-secondary);
    line-height: 1.4;
  }

  .clickable-cell {
    transition: color 0.15s ease;
  }

  .clickable-cell:hover {
    text-decoration: underline;
    color: #a5b4fc !important;
  }

  /* Chart dimming & row highlight */
  .row-highlighted td {
    background: rgba(20, 184, 166, 0.06) !important;
    border-bottom-color: rgba(20, 184, 166, 0.3) !important;
  }

  .row-highlighted {
    animation: rowHighlightPulse 1.5s ease-out;
  }

  @keyframes rowHighlightPulse {
    0%   { background: rgba(20,184,166,0.2); }
    100% { background: rgba(20,184,166,0.06); }
  }
`;