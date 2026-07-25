import { css } from 'lit';

export const appStyles = css`
    :host {
      display: block;
      height: var(--app-dvh);
      min-height: var(--app-dvh);
      max-height: var(--app-dvh);
      overflow: hidden;
      font-family: var(--font-sans);
      background-color: var(--bg-color);
      color: var(--text-primary);
    }

    .app-layout {
      display: flex;
      height: 100%;
      width: 100%;
      position: relative;
    }

    /* Main Content Area */
    .main-content {
      flex: 1;
      height: 100%;
      overflow-y: auto;
      position: relative;
      background: radial-gradient(circle at top right, rgba(99, 102, 241, 0.03), transparent 40%);
    }

    .main-content.chat-route {
      overflow: hidden;
    }

    /* Update Banner */
    .update-banner {
      background: var(--primary);
      color: #fff;
      padding: 10px 16px;
      font-size: 0.85rem;
      font-weight: 500;
      display: flex;
      justify-content: space-between;
      align-items: center;
      box-shadow: var(--shadow-md);
      z-index: 100;
      position: relative;
      animation: bannerSlideDown 0.3s ease-out;
    }

    @keyframes bannerSlideDown {
      from { transform: translateY(-100%); }
      to { transform: translateY(0); }
    }

    .reload-btn {
      background: rgba(255, 255, 255, 0.2);
      border: 1px solid rgba(255, 255, 255, 0.3);
      padding: 4px 10px;
      border-radius: var(--radius-sm);
      color: #fff;
      font-weight: 600;
      font-size: 0.75rem;
      cursor: pointer;
      transition: var(--transition);
    }

    .reload-btn:hover {
      background: rgba(255, 255, 255, 0.3);
    }

    /* Sidebar Navigation (Desktop/Tablet) */
    .sidebar {
      width: 240px;
      height: 100%;
      background: rgba(17, 24, 39, 0.85);
      border-right: 1px solid var(--border-color);
      display: flex;
      flex-direction: column;
      padding: 24px 16px;
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      z-index: 50;
    }

    .sidebar-header {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 32px;
      padding-left: 8px;
    }

    .logo-icon {
      font-size: 1.5rem;
    }

    .sidebar-title {
      font-family: var(--font-title);
      font-size: 1.15rem;
      font-weight: 700;
      background: linear-gradient(135deg, #a5b4fc, #6366f1);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }

    .sidebar-menu {
      display: flex;
      flex-direction: column;
      gap: 8px;
      flex: 1;
    }

    .menu-item {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 16px;
      border-radius: var(--radius-md);
      color: var(--text-secondary);
      text-decoration: none;
      font-weight: 500;
      font-size: 0.95rem;
      transition: var(--transition);
      border: 1px solid transparent;
    }

    .menu-item:hover {
      color: var(--text-primary);
      background: rgba(255, 255, 255, 0.03);
    }

    .menu-item.active {
      color: var(--primary);
      background: var(--primary-glow);
      border-color: rgba(99, 102, 241, 0.15);
      font-weight: 600;
    }

    .connection-badge {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 0.75rem;
      color: var(--text-muted);
      padding: 12px 8px 0;
      border-top: 1px solid rgba(255, 255, 255, 0.05);
    }

    .dot-indicator {
      width: 8px;
      height: 8px;
      border-radius: 50%;
    }

    .dot-connected { background: var(--success); }
    .dot-disconnected { background: var(--danger); }

    /* Bottom Tab Bar (Mobile Only) */
    .tab-bar {
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      height: 60px;
      background: rgba(17, 24, 39, 0.85);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      border-top: 1px solid var(--border-color);
      display: flex;
      justify-content: space-around;
      align-items: center;
      padding-bottom: env(safe-area-inset-bottom);
      z-index: 50;
    }

    .tab-item {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      color: var(--text-secondary);
      text-decoration: none;
      font-size: 0.65rem;
      font-weight: 500;
      gap: 4px;
      flex: 1;
      height: 100%;
      transition: var(--transition);
    }

    .tab-icon {
      font-size: 1.25rem;
      transition: var(--transition);
    }

    .tab-item.active {
      color: var(--primary);
    }

    .tab-item.active .tab-icon {
      transform: translateY(-2px);
    }

    /* Responsive Utilities */
    @media (max-width: 768px) {
      .sidebar {
        display: none;
      }
      .main-content {
        height: calc(100% - 60px); /* Leave room for bottom navigation */
      }
    }

    @media (min-width: 769px) {
      .tab-bar {
        display: none;
      }
    }

    /* Toast Notification */
    .toast-container {
      position: fixed;
      bottom: 80px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 10000;
      display: flex;
      flex-direction: column;
      gap: 8px;
      pointer-events: none;
      width: 90%;
      max-width: 380px;
    }
    
    .toast {
      background: rgba(17, 24, 39, 0.9);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      border: 1px solid var(--border-color);
      color: var(--text-primary);
      padding: 12px 16px;
      border-radius: var(--radius-md);
      font-size: 0.85rem;
      font-weight: 500;
      box-shadow: var(--shadow-lg);
      display: flex;
      align-items: center;
      justify-content: space-between;
      animation: toastSlideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1);
      pointer-events: auto;
    }
    
    @keyframes toastSlideUp {
      from { transform: translateY(20px); opacity: 0; }
      to { transform: translateY(0); opacity: 1; }
    }

  `;
