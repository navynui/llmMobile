import { html } from 'lit';

export function renderMenuLink(ctx, route, icon, label) {
  const isActive = ctx.currentRoute === route;
  return html`
    <a href="${route}" class="menu-item ${isActive ? 'active' : ''}">
      <span class="logo-icon">${icon}</span>
      <span>${label}</span>
    </a>
  `;
}

export function renderTabLink(ctx, route, icon, label) {
  const isActive = ctx.currentRoute === route;
  return html`
    <a href="${route}" class="tab-item ${isActive ? 'active' : ''}">
      <span class="tab-icon">${icon}</span>
      <span>${label}</span>
    </a>
  `;
}

export function renderActiveTabContent(ctx) {
  const stats = ctx.sseData?.stats;
  const status = ctx.sseData?.status;

  switch (ctx.currentRoute) {
    case '#/server':
      return html`<server-tab .stats="${stats}" .status="${status}"></server-tab>`;
    case '#/chat':
      return html`<chat-tab></chat-tab>`;
    case '#/generate':
      return html`<generator-tab .queue="${ctx.queue}"></generator-tab>`;
    case '#/gallery':
      return html`<gallery-tab></gallery-tab>`;
    case '#/benchmarks':
      return html`<benchmark-tab></benchmark-tab>`;
    default:
      return html`<server-tab .stats="${stats}" .status="${status}"></server-tab>`;
  }
}

export function renderApp(ctx) {
  return html`
    ${ctx.updateAvailable ? html`
      <div class="update-banner">
        <span>New update available! Reload to apply.</span>
        <button class="reload-btn" @click="${() => ctx.triggerUpdateReload()}">Reload</button>
      </div>
    ` : ''}

    <div class="app-layout">
      <!-- Sidebar Navigation (Desktop/Tablet) -->
      <aside class="sidebar">
        <div class="sidebar-header">
          <span class="logo-icon">⚡</span>
          <span class="sidebar-title">LLM Mobile</span>
        </div>

        <nav class="sidebar-menu">
          ${renderMenuLink(ctx, '#/server', '⚡', 'Server')}
          ${renderMenuLink(ctx, '#/chat', '💬', 'Chat')}
          ${renderMenuLink(ctx, '#/generate', '🎨', 'Generator')}
          ${renderMenuLink(ctx, '#/gallery', '🖼️', 'Gallery')}
          ${renderMenuLink(ctx, '#/benchmarks', '📊', 'Benchmarks')}
        </nav>

        <div class="connection-badge">
          <div class="dot-indicator ${ctx.sseConnected ? 'dot-connected' : 'dot-disconnected'}"></div>
          <span>${ctx.sseConnected ? 'Connected (Live)' : 'Disconnected'}</span>
        </div>
      </aside>

      <!-- Main Workspace -->
      <main class="main-content ${ctx.currentRoute === '#/chat' ? 'chat-route' : ''}">
        ${renderActiveTabContent(ctx)}
      </main>

      <!-- Bottom Tab Bar (Mobile) -->
      <nav class="tab-bar">
        ${renderTabLink(ctx, '#/server', '⚡', 'Server')}
        ${renderTabLink(ctx, '#/chat', '💬', 'Chat')}
        ${renderTabLink(ctx, '#/generate', '🎨', 'Generator')}
        ${renderTabLink(ctx, '#/gallery', '🖼️', 'Gallery')}
        ${renderTabLink(ctx, '#/benchmarks', '📊', 'Benchmarks')}
      </nav>
    </div>

    <!-- Toast Container -->
    ${ctx.toastMessage ? html`
      <div class="toast-container">
        <div class="toast">
          <span>ℹ️ ${ctx.toastMessage}</span>
        </div>
      </div>
    ` : ''}

    <!-- Floating Hard Refresh Button (always visible) -->
    <button class="hard-refresh-btn" title="Force-refresh app (clear cache & reload)" @click="${() => ctx.hardRefresh()}">
      <span class="refresh-icon">↻</span>
    </button>
  `;
}
