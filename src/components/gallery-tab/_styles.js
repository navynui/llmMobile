import { css } from 'lit';

export const galleryStyles = css`
    :host { display: block; height: 100%; }

    .root {
      display: flex;
      flex-direction: column;
      height: 100%;
    }

    /* Toolbar */
    .toolbar {
      padding: 12px 16px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      background: rgba(11,15,25,0.6);
      backdrop-filter: blur(12px);
      border-bottom: 1px solid var(--border-color);
      z-index: 5;
      position: sticky;
      top: 0;
    }

    .breadcrumbs {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 0.82rem;
      color: var(--text-secondary);
      flex-wrap: wrap;
    }
    .crumb {
      cursor: pointer;
      color: var(--primary);
      text-decoration: underline;
    }
    .crumb-sep { color: var(--text-muted); }

    .bulk-bar {
      display: flex;
      gap: 8px;
      align-items: center;
    }
    .bulk-btn {
      padding: 6px 12px;
      border-radius: var(--radius-sm);
      font-size: 0.8rem;
      font-weight: 600;
      cursor: pointer;
      border: 1px solid var(--border-color);
      background: rgba(255,255,255,0.04);
      color: var(--text-primary);
      transition: var(--transition);
    }
    .bulk-btn:hover { background: rgba(255,255,255,0.1); }
    .bulk-btn.danger { color: var(--danger); border-color: rgba(239,68,68,0.3); }
    .bulk-btn.danger:hover { background: var(--danger-glow); }
    .sel-count { font-size: 0.8rem; color: var(--text-secondary); margin-right: auto; }

    /* Scrollable grid area */
    .scroll-area {
      flex: 1;
      overflow-y: auto;
      padding: 12px 12px 80px;
    }

    /* Folders */
    .folder-row {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      margin-bottom: 16px;
    }
    .folder-chip {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 8px 14px;
      background: rgba(255,255,255,0.03);
      border: 1px solid var(--border-color);
      border-radius: var(--radius-md);
      font-size: 0.85rem;
      color: var(--text-secondary);
      cursor: pointer;
      transition: var(--transition);
    }
    .folder-chip:hover { border-color: var(--primary); color: var(--primary); }

    /* Image grid */
    .grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 12px;
    }
    @media (min-width: 600px) { .grid { grid-template-columns: repeat(3, 1fr); } }
    @media (min-width: 769px) { .grid { grid-template-columns: repeat(4, 1fr); } }

    .grid-cell {
      position: relative;
      border-radius: var(--radius-md);
      overflow: hidden;
      display: flex;
      flex-direction: column;
      background: rgba(255,255,255,0.02);
      border: 1px solid var(--border-color);
      cursor: pointer;
      transition: var(--transition);
    }
    .grid-cell:hover { border-color: var(--primary); }
    .grid-cell.selected { border-color: var(--primary); box-shadow: 0 0 0 2px var(--primary-glow); }

    .grid-img-wrapper {
      position: relative;
      width: 100%;
      aspect-ratio: 1.1;
      overflow: hidden;
      background: rgba(0,0,0,0.2);
    }

    .grid-img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
      transition: transform 0.3s ease;
    }
    .grid-cell:hover .grid-img { transform: scale(1.03); }

    .group-badge {
      position: absolute;
      bottom: 8px;
      right: 8px;
      background: rgba(15, 23, 42, 0.8);
      backdrop-filter: blur(4px);
      -webkit-backdrop-filter: blur(4px);
      border: 1px solid rgba(255,255,255,0.15);
      color: #fff;
      font-size: 0.65rem;
      font-weight: 600;
      padding: 3px 6px;
      border-radius: var(--radius-sm);
      z-index: 2;
    }

    /* Selection checkbox overlay */
    .select-dot {
      position: absolute;
      top: 8px; right: 8px;
      width: 22px; height: 22px;
      border-radius: var(--radius-full);
      background: rgba(0,0,0,0.5);
      border: 2px solid rgba(255,255,255,0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 0.7rem;
      z-index: 2;
    }
    .select-dot.checked {
      background: var(--primary);
      border-color: var(--primary);
    }

    .grid-info {
      padding: 10px;
      display: flex;
      flex-direction: column;
      gap: 6px;
      flex-grow: 1;
    }

    .grid-prompt {
      font-size: 0.75rem;
      color: var(--text-primary);
      line-height: 1.35;
      overflow: hidden;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      min-height: 2.7em;
    }

    .grid-meta {
      font-size: 0.65rem;
      color: var(--text-muted);
      border-top: 1px solid rgba(255,255,255,0.05);
      padding-top: 6px;
      margin-top: auto;
      display: flex;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 4px;
    }

    /* Pagination */
    .pagination {
      display: flex;
      justify-content: center;
      align-items: center;
      gap: 16px;
      padding: 16px 0 4px;
    }
    .page-btn {
      padding: 8px 16px;
      border-radius: var(--radius-md);
      background: rgba(255,255,255,0.04);
      border: 1px solid var(--border-color);
      color: var(--text-primary);
      font-size: 0.85rem;
      cursor: pointer;
      transition: var(--transition);
    }
    .page-btn:hover:not(:disabled) { background: rgba(255,255,255,0.1); }
    .page-btn:disabled { opacity: 0.4; cursor: not-allowed; }
    .page-info { font-size: 0.8rem; color: var(--text-secondary); }

    /* Lightbox */
    .lightbox {
      position: fixed; inset: 0;
      background: rgba(0,0,0,0.95);
      z-index: 9999;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    
    .lightbox-carousel {
      display: flex;
      width: 100%;
      max-width: 800px;
      height: 60vh;
      overflow-x: auto;
      scroll-snap-type: x mandatory;
      scrollbar-width: none;
    }
    .lightbox-carousel::-webkit-scrollbar {
      display: none;
    }
    
    .carousel-slide {
      flex: 0 0 100%;
      width: 100%;
      height: 100%;
      scroll-snap-align: center;
      display: flex;
      align-items: center;
      justify-content: center;
      box-sizing: border-box;
      padding: 0 10px;
    }
    .carousel-slide img {
      max-width: 100%;
      max-height: 100%;
      object-fit: contain;
      border-radius: var(--radius-md);
    }

    .lb-close {
      position: absolute; top:16px; right:16px;
      background: rgba(255,255,255,0.1);
      border: 1px solid rgba(255,255,255,0.2);
      color: #fff; font-size:1.1rem;
      width:38px; height:38px;
      border-radius: var(--radius-full);
      cursor: pointer;
      display: flex; align-items:center; justify-content:center;
      z-index: 10;
    }
    .lb-meta {
      margin-top: 12px;
      max-width: 500px;
      text-align: center;
      font-size: 0.8rem;
      color: var(--text-secondary);
      line-height: 1.5;
    }
    .lb-prompt {
      color: var(--text-primary);
      font-size: 0.9rem;
      margin-bottom: 6px;
    }
    .lb-nav {
      display: flex; gap:16px; margin-top:12px;
    }
    .lb-nav button {
      padding: 8px 20px;
      background: rgba(255,255,255,0.08);
      border: 1px solid rgba(255,255,255,0.15);
      color: #fff; border-radius: var(--radius-md);
      cursor: pointer; font-size:0.9rem;
    }

    /* Action Sheet / Context Menu */
    .action-sheet-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.6);
      backdrop-filter: blur(4px);
      z-index: 10000;
      display: flex;
      align-items: flex-end;
      justify-content: center;
    }
    
    .action-sheet {
      width: 100%;
      max-width: 500px;
      background: #111827;
      border-top: 1px solid var(--border-color);
      border-radius: var(--radius-lg) var(--radius-lg) 0 0;
      padding: 20px;
      box-sizing: border-box;
      box-shadow: 0 -10px 25px rgba(0, 0, 0, 0.5);
      animation: slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    }
    
    @keyframes slideUp {
      from { transform: translateY(100%); }
      to { transform: translateY(0); }
    }
    
    .action-sheet-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
    }
    
    .action-sheet-title {
      font-size: 1.1rem;
      font-weight: 600;
      color: var(--text-primary);
    }
    
    .action-sheet-close {
      background: rgba(255,255,255,0.05);
      border: 1px solid var(--border-color);
      color: var(--text-secondary);
      border-radius: var(--radius-full);
      width: 32px; height: 32px;
      display: flex; align-items: center; justify-content: center;
      cursor: pointer;
    }
    
    .action-sheet-info {
      background: rgba(255,255,255,0.02);
      border: 1px solid rgba(255,255,255,0.05);
      border-radius: var(--radius-md);
      padding: 12px;
      margin-bottom: 16px;
    }
    
    .action-sheet-prompt {
      font-size: 0.85rem;
      color: var(--text-secondary);
      line-height: 1.4;
      margin: 0 0 8px 0;
      word-break: break-word;
    }
    
    .action-sheet-meta {
      display: flex;
      gap: 12px;
      font-size: 0.75rem;
      color: var(--text-muted);
    }
    
    .action-sheet-buttons {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    
    .action-btn {
      width: 100%;
      padding: 12px;
      background: rgba(255,255,255,0.04);
      border: 1px solid var(--border-color);
      color: var(--text-primary);
      border-radius: var(--radius-md);
      font-size: 0.9rem;
      font-weight: 500;
      text-align: left;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 10px;
      transition: var(--transition);
    }
    .action-btn:hover {
      background: rgba(255,255,255,0.08);
      border-color: var(--border-active);
    }
    .action-btn.danger {
      color: var(--danger);
      border-color: rgba(239, 68, 68, 0.2);
    }
    .action-btn.danger:hover {
      background: rgba(239, 68, 68, 0.1);
    }

    /* Loading / empty */
    .center-msg {
      text-align: center;
      padding: 40px 20px;
      color: var(--text-muted);
    }
    .center-msg .icon { font-size: 2.5rem; margin-bottom: 8px; }
  `;
