import { css } from 'lit';

export const generatorStyles = css`
    :host { display: block; padding: 16px 16px 80px; }
    .container { max-width: 600px; margin: 0 auto; display: flex; flex-direction: column; gap: 16px; }
    .card { background: var(--bg-card); backdrop-filter: blur(var(--blur)); border: 1px solid var(--border-color); border-radius: var(--radius-lg); padding: 20px; box-shadow: var(--shadow-lg); transition: var(--transition); }
    .card:hover { border-color: var(--border-active); }
    h2 { font-family: var(--font-title); font-size: 1.1rem; font-weight: 600; margin-bottom: 16px; color: var(--text-primary); }
    label { display: block; font-size: 0.8rem; font-weight: 500; color: var(--text-secondary); margin-bottom: 6px; }
    select, textarea { width: 100%; padding: 11px 14px; background: rgba(0,0,0,0.25); border: 1px solid var(--border-color); border-radius: var(--radius-md); color: var(--text-primary); font-family: var(--font-sans); font-size: 0.9rem; outline: none; transition: var(--transition); box-sizing: border-box; }
    select:focus, textarea:focus { border-color: var(--primary); }
    select { appearance: none; -webkit-appearance: none; background-image: url("data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%239ca3af' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E"); background-repeat: no-repeat; background-position: right 12px center; background-size: 16px; padding-right: 40px; }
    textarea { resize: vertical; min-height: 90px; line-height: 1.5; }
    .row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .generate-btn { width: 100%; padding: 14px; background: var(--primary); color: #fff; border: none; border-radius: var(--radius-md); font-family: var(--font-title); font-size: 1rem; font-weight: 600; cursor: pointer; box-shadow: 0 4px 14px var(--primary-glow); transition: var(--transition); }
    .generate-btn:hover:not(:disabled) { background: #4f46e5; transform: translateY(-1px); }
    .generate-btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }
    .error-msg { color: var(--danger); font-size: 0.85rem; text-align: center; }
    .queue-list { display: flex; flex-direction: column; gap: 12px; }
    .queue-item { background: rgba(255,255,255,0.02); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 14px; animation: slideIn 0.25s ease-out; }
    @keyframes slideIn { from { opacity:0; transform: translateY(6px); } to { opacity:1; transform: translateY(0); } }
    .qi-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
    .qi-prompt { font-size: 0.85rem; color: var(--text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 70%; }
    .status-pill { font-size: 0.7rem; font-weight: 700; padding: 3px 8px; border-radius: var(--radius-full); text-transform: uppercase; letter-spacing: 0.04em; }
    .pill-queued { background: rgba(107,114,128,0.15); color:#9ca3af; }
    .pill-running { background: rgba(99,102,241,0.15); color: var(--primary); }
    .pill-completed { background: var(--success-glow); color: var(--success); }
    .pill-error { background: var(--danger-glow); color: var(--danger); }
    .pill-cancelled { background: rgba(0,0,0,0.2); color: var(--text-muted); }
    .pill-offline { background: rgba(245,158,11,0.15); color: #f59e0b; }
    .qi-sub { font-size: 0.75rem; color: var(--text-muted); margin-bottom: 8px; }
    .progress-bar { height: 5px; background: rgba(255,255,255,0.06); border-radius: var(--radius-full); overflow: hidden; }
    .progress-fill { height: 100%; background: var(--primary); border-radius: var(--radius-full); transition: width 0.4s ease-out; }
    .thumb-row { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 10px; }
    .thumb { width: 72px; height: 72px; object-fit: cover; border-radius: var(--radius-sm); border: 1px solid var(--border-color); cursor: pointer; transition: var(--transition); }
    .thumb:hover { border-color: var(--primary); transform: scale(1.05); }
    .lightbox { position: fixed; inset: 0; background: rgba(0,0,0,0.9); z-index: 9999; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 20px; animation: fadeIn 0.2s ease-out; }
    @keyframes fadeIn { from{opacity:0} to{opacity:1} }
    .lightbox img { max-width: 100%; max-height: 85vh; border-radius: var(--radius-md); object-fit: contain; }
    .lightbox-close { position: absolute; top: 16px; right: 16px; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); color: #fff; font-size: 1.2rem; width: 40px; height: 40px; border-radius: var(--radius-full); cursor: pointer; display: flex; align-items: center; justify-content: center; }
    .lightbox-nav { display: flex; gap: 16px; margin-top: 16px; }
    .lightbox-nav button { background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); color: #fff; padding: 8px 20px; border-radius: var(--radius-md); cursor: pointer; font-size: 0.9rem; }
    .empty-state { text-align: center; padding: 32px 0; color: var(--text-muted); }
    .empty-state .icon { font-size: 2.5rem; margin-bottom: 8px; }
    .clear-btn { align-self: flex-end; background: none; border: 1px solid var(--border-color); color: var(--text-muted); font-size: 0.75rem; padding: 5px 10px; border-radius: var(--radius-sm); cursor: pointer; transition: var(--transition); }
    .clear-btn:hover { color: var(--danger); border-color: var(--danger); }
    .checkbox-group { display: flex; flex-direction: column; gap: 8px; padding: 8px 0; }
    .wf-checkbox { display: flex; align-items: center; gap: 10px; cursor: pointer; padding: 8px 12px; background: rgba(255,255,255,0.02); border: 1px solid var(--border-color); border-radius: var(--radius-md); transition: var(--transition); user-select: none; }
    .wf-checkbox:hover { border-color: var(--primary); background: rgba(99,102,241,0.05); }
    .wf-checkbox input[type="checkbox"] { width: 18px; height: 18px; accent-color: var(--primary); cursor: pointer; flex-shrink: 0; }
    .wf-checkbox span { font-size: 0.9rem; color: var(--text-primary); }
    .action-sheet-backdrop { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.6); backdrop-filter: blur(4px); z-index: 10000; display: flex; align-items: flex-end; justify-content: center; }
    .action-sheet { width: 100%; max-width: 500px; background: #111827; border-top: 1px solid var(--border-color); border-radius: var(--radius-lg) var(--radius-lg) 0 0; padding: 20px; box-sizing: border-box; box-shadow: 0 -10px 25px rgba(0, 0, 0, 0.5); animation: slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1); }
    @keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
    .action-sheet-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
    .action-sheet-title { font-size: 1.1rem; font-weight: 600; color: var(--text-primary); }
    .action-sheet-close { background: rgba(255,255,255,0.05); border: 1px solid var(--border-color); color: var(--text-secondary); border-radius: var(--radius-full); width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; cursor: pointer; }
    .action-sheet-info { background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.05); border-radius: var(--radius-md); padding: 12px; margin-bottom: 16px; }
    .action-sheet-prompt { font-size: 0.85rem; color: var(--text-secondary); line-height: 1.4; margin: 0 0 8px 0; word-break: break-word; }
    .action-sheet-meta { display: flex; gap: 12px; font-size: 0.75rem; color: var(--text-muted); }
    .action-sheet-buttons { display: flex; flex-direction: column; gap: 10px; }
    .action-btn { width: 100%; padding: 12px; background: rgba(255,255,255,0.04); border: 1px solid var(--border-color); color: var(--text-primary); border-radius: var(--radius-md); font-size: 0.9rem; font-weight: 500; text-align: left; cursor: pointer; display: flex; align-items: center; gap: 10px; transition: var(--transition); }
    .action-btn:hover { background: rgba(255,255,255,0.08); border-color: var(--border-active); }
    .action-btn.danger { color: var(--danger); border-color: rgba(239, 68, 68, 0.2); }
    .action-btn.danger:hover { background: rgba(239, 68, 68, 0.1); }
  `;
