import { css } from 'lit';

export const cardStyles = css`
  .card {
    background: var(--bg-card);
    backdrop-filter: blur(var(--blur));
    -webkit-backdrop-filter: blur(var(--blur));
    border: 1px solid var(--border-color);
    border-radius: var(--radius-lg);
    padding: 20px;
    box-shadow: var(--shadow-lg);
    transition: var(--transition);
  }

  .card:hover {
    border-color: var(--border-active);
    box-shadow: 0 10px 25px -5px var(--primary-glow);
  }

  .card-title {
    font-family: var(--font-title);
    font-size: 1.1rem;
    font-weight: 600;
    color: var(--text-primary);
    margin-bottom: 16px;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
`;

export const buttonStyles = css`
  .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 10px 20px;
    border-radius: var(--radius-md);
    font-size: 0.875rem;
    font-weight: 600;
    cursor: pointer;
    transition: var(--transition-fast);
    border: none;
    text-decoration: none;
    white-space: nowrap;
  }

  .btn-primary {
    background: var(--primary);
    color: var(--text-on-primary);
    box-shadow: var(--shadow-md);
  }

  .btn-secondary {
    background: rgba(255, 255, 255, 0.08);
    color: var(--text-primary);
    border: 1px solid var(--border-color);
  }

  .btn-danger {
    background: var(--danger);
    color: white;
    box-shadow: var(--shadow-md);
  }

  .btn-small {
    padding: 6px 12px;
    font-size: 0.875rem;
  }
`;

export const pillStyles = css`
  .pill {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    height: 24px;
    border-radius: var(--radius-full);
    padding: 4px 12px;
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .pill-running {
    background: var(--success-glow);
    color: var(--success);
    border: 1px solid rgba(16, 185, 129, 0.2);
  }
`;

export const textInputStyles = css`
  .text-input {
    padding: 12px 16px;
    background: rgba(255, 255, 255, 0.05);
    border-radius: var(--radius-md);
    border: 1px solid var(--border-color);
    color: var(--text-primary);
    font-size: 0.875rem;
    width: 100%;
    box-sizing: border-box;
    transition: var(--transition-fast);
  }

  .text-input:focus {
    outline: none;
    border-color: var(--border-active);
    box-shadow: 0 0 0 2px rgba(147, 191, 228, 0.3);
  }
`;

export const modalOverlayStyles = css`
  .modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    background-color: rgba(0, 0, 0, 0.7);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    backdrop-filter: blur(2px);
  }

  .modal-content {
    position: relative;
    background: var(--bg-card);
    border-radius: var(--radius-lg);
    max-width: 600px;
    width: calc(100% - 32px);
    margin: 16px;
    box-shadow: var(--shadow-xl);
    overflow: hidden;
  }
`;

export const spinnerStyles = css`
  .spinner {
    display: inline-block;
    width: 24px;
    height: 24px;
    border: 3px solid currentColor;
    border-top-color: transparent;
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }
`;

export const slideInStyles = css`
  .slide-in {
    animation: slideIn 0.3s ease-out;
  }

  @keyframes slideIn {
    from {
      opacity: 0;
      transform: translateY(10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
`;

export const fadeInStyles = css`
  .fade-in {
    animation: fadeIn 0.2s ease-out;
  }

  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }
`;