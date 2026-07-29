import { html } from 'lit';
import * as logic from './_logic.js';

export function renderChat(ctx) {
  return html`
    ${ctx.showReloadBanner ? html`
      <div style="background: rgba(245, 158, 11, 0.15); border-bottom: 1px solid rgba(245, 158, 11, 0.3); padding: 10px 16px; font-size: 0.85rem; color: #f59e0b; display: flex; justify-content: space-between; align-items: center; gap: 8px;">
        <span>⚠️ Model "${ctx.previousModelName}" was not reloaded after generation.</span>
        <button style="padding: 4px 10px; font-size: 0.75rem; font-weight: 600; background: var(--primary); color: #fff; border: none; border-radius: var(--radius-sm); cursor: pointer;" ?disabled="${ctx.isReloading}" @click="${() => logic.reloadModel(ctx)}">
          ${ctx.isReloading ? 'Reloading...' : 'Reload Now'}
        </button>
      </div>
    ` : ''}
    <div class="chat-container">
      <!-- Server selector -->
      <div class="server-bar" style="display: flex; gap: 6px; padding: 8px 16px; align-items: center; border-bottom: 1px solid rgba(255,255,255,0.06);">
        <span class="server-label" style="font-size: 0.75rem; color: var(--text-muted); font-weight: 500;">Chat Server:</span>
        <button style="padding: 4px 12px; font-size: 0.75rem; font-weight: 600; border-radius: var(--radius-full); cursor: pointer; border: 1px solid ${ctx.chatServer === 'primary' ? 'var(--primary)' : 'rgba(255,255,255,0.1)'}; background: ${ctx.chatServer === 'primary' ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.04)'}; color: ${ctx.chatServer === 'primary' ? '#a5b4fc' : 'var(--text-secondary)'};" @click="${() => { ctx.chatServer = 'primary'; logic.checkVisionSupport(ctx); logic.checkModelStatus(ctx); logic.fetchAvailableModels(ctx); }}">Primary</button>
        <button style="padding: 4px 12px; font-size: 0.75rem; font-weight: 600; border-radius: var(--radius-full); cursor: pointer; border: 1px solid ${ctx.chatServer === 'mini' ? 'var(--primary)' : 'rgba(255,255,255,0.1)'}; background: ${ctx.chatServer === 'mini' ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.04)'}; color: ${ctx.chatServer === 'mini' ? '#a5b4fc' : 'var(--text-secondary)'};" @click="${() => { ctx.chatServer = 'mini'; logic.checkVisionSupport(ctx); logic.checkModelStatus(ctx); logic.fetchAvailableModels(ctx); }}">Secondary</button>
        <button style="padding: 4px 10px; font-size: 0.75rem; font-weight: 600; border-radius: var(--radius-full); cursor: pointer; border: 1px solid ${ctx.toolsEnabled ? 'var(--primary)' : 'rgba(255,255,255,0.1)'}; background: ${ctx.toolsEnabled ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.04)'}; color: ${ctx.toolsEnabled ? '#a5b4fc' : 'var(--text-secondary)'}; margin-left: 8px;" @click="${() => { ctx.toolsEnabled = !ctx.toolsEnabled; }}" title="Enable AI tools (web search, file operations)">
          🛠️ Tools ${ctx.toolsEnabled ? 'ON' : 'OFF'}
        </button>
        <div class="model-selector" style="margin-left: auto; display: flex; align-items: center; gap: 6px;">
          <select style="padding: 3px 8px; font-size: 0.72rem; border-radius: var(--radius-sm); border: 1px solid rgba(255,255,255,0.15); max-width: min(280px, 100%); cursor: pointer; ${ctx.loadingModel && !ctx.loadedModelName ? 'animation: selectGlow 1.2s ease-in-out infinite;' : ''}" 
            @change="${(e) => logic.selectModel(ctx, e.target.value)}"
            ?disabled="${ctx.loadingModel}">
            <option value="">${ctx.loadingModel ? '⏳ Loading...' : '— Select model —'}</option>
            ${ctx.availableModels.map(m => html`
              <option value="${m.filename}" ?selected="${m.filename === ctx.loadedModelName}">${m.filename}</option>
            `)}
          </select>
          ${ctx.loadedModelName ? html`<span style="color: #22c55e; font-size: 0.75rem;">●</span>` : ''}
          ${ctx.loadingModel ? html`<span style="color: #f59e0b; font-size: 0.75rem;">⏳</span>` : ''}
        </div>
      </div>

      ${ctx.messages.length === 0 ? html`
        <div style="margin: auto; text-align: center; color: var(--text-muted); max-width: 280px; padding-bottom: 40px;">
          <div style="font-size: 3rem; margin-bottom: 16px;">💬</div>
          <h3 style="font-family: var(--font-title); color: var(--text-secondary); margin-bottom: 8px;">LLM Chatbox</h3>
          <p style="font-size: 0.85rem; line-height: 1.4;">Send a message to interact with the currently loaded GGUF model in VRAM.</p>
        </div>
      ` : ctx.messages.map((m, idx) => {
          const hasImages = m.images && m.images.length > 0;
          return html`
            ${hasImages ? html`
              <div class="message ${m.role}" style="margin-bottom: 4px;">
                <div class="bubble" style="padding: 8px; max-width: 256px;">
                  <img src="data:image/jpeg;base64,${m.images[0]}" alt="User uploaded image"
                    style="max-width: 100%; border-radius: var(--radius-md); display: block; object-fit: cover; max-height: 256px;"
                  />
                </div>
              </div>
            ` : ''}
            <div class="message ${m.role}" style="${m.role === 'user' ? 'align-self: flex-end; display: block; max-width: 85%;' : ''}${hasImages ? ' margin-top: -4px;' : ''}">
              <div class="bubble" style="${m.role === 'user' ? 'display: inline-block; width: auto;' : ''}">
                ${m.role === 'assistant'
                  ? html`${m.content || m.thinking || !m.done ? html`
                      ${(() => {
                        const { thinking, response, isThinking } = logic.parseThinkingAndContent(ctx, m);
                        return html`
                          ${m.toolCalls && m.toolCalls.length ? html`
                            <div class="tool-calls-bar">
                              ${m.toolCalls.map(tc => html`
                                <div class="tool-call-item ${tc.status}">
                                  <span class="tool-call-icon">${({web_search:'🔍',write_file:'📝',read_file:'📖',edit_file:'✏️'})[tc.name] || '🛠️'}</span>
                                  <span class="tool-call-name">${tc.name.replace(/_/g, ' ')}</span>
                                  ${tc.status === 'running' ? html`<span class="tool-call-spinner"></span>` : html`<span class="tool-call-check">✓</span>`}
                                </div>
                              `)}
                            </div>
                          ` : ''}
                          ${!response && !m.done ? html`
                            <div class="thinking-box">
                              <div class="thinking-header">
                                <span>🧠 Thinking Process...</span>
                              </div>
                              <div class="thinking-content">${thinking || 'Formulating thoughts...'}</div>
                            </div>
                          ` : ''}
                          ${response ? html`<div .innerHTML="${logic.formatMessage(ctx, response)}"></div>` : ''}
                          ${response && m.done ? logic.extractPrompts(response).map((p, i) => html`
                            <div class="prompt-row">
                              <span class="prompt-text-preview">${p.length > 80 ? p.slice(0, 77) + '...' : p}</span>
                              <button class="prompt-gen-btn" @click="${() => logic.promptGenerateImage(ctx, p)}" title="Generate image from this prompt">🎨</button>
                            </div>
                          `) : ''}
                          ${!response && m.done && !m.toolCalls?.length ? html`
                            <div class="typing-indicator">
                              <div class="dot"></div>
                              <div class="dot"></div>
                              <div class="dot"></div>
                            </div>
                          ` : ''}
                        `;
                      })()}
                    `
                  : html`
                      <div class="typing-indicator">
                        <div class="dot"></div>
                        <div class="dot"></div>
                        <div class="dot"></div>
                      </div>
                    `}`
                : m.content
              }
            </div>
            ${m.meta ? html`<div class="meta-info">${m.meta}</div>` : ''}
          `;
        })}
    </div>

<div class="input-bar">
      <!-- Image upload button (hidden when not vision-capable) -->
      ${ctx.visionCapable ? html`
        <button
          class="send-image-btn"
          title="Choose file"
          @click="${() => { const inp = ctx.shadowRoot.querySelector('input[type=file]'); if (inp) inp.click(); }}"
          style="width: 36px; height: 36px; background: rgba(255,255,255,0.08); font-size: 18px; color: var(--text-muted); box-shadow: none; border-radius: var(--radius-md); display: flex; align-items: center; justify-content: center;"
        >
          📎
        </button>
      ` : ''}

      <!-- Hidden file input (visible only when vision-capable) -->
      ${ctx.visionCapable ? html`<input type="file" accept="image/*" style="position:absolute;width:0;height:0;overflow:hidden;margin:-1px;padding:0;border:0" @change="${(e) => logic.handleImageUpload(ctx, e)}" />` : ''}
      
      ${ctx.imageAttachment ? html`
        <button
          class="send-image-btn"
          title="Send image with text (press Enter to send)"
          @click="${() => logic.sendMessage(ctx)}"
        >
          ➔
        </button>
      ` : ''}
      
      <button
        class="send-btn"
        style="background: rgba(255, 255, 255, 0.08); color: var(--text-muted); box-shadow: none; font-size: 16px;"
        @click="${() => logic.clearConversation(ctx)}"
        title="Clear Conversation"
      >
        🗑️
      </button>
      <textarea
        placeholder="${ctx.toolsEnabled ? 'Ask me to search, write files, or edit...'
          : !ctx.visionCapable ? 'Type a message...'
          : ctx.imageAttachment ? 'Describe the image...'
          : 'Type a message or upload an image...'}"
        rows="1"
        @input="${(e) => logic.handleTextareaInput(ctx, e)}"
        @keydown="${(e) => logic.handleKeyDown(ctx, e)}"
        ?disabled="${ctx.isGenerating}"
      ></textarea>
      <button
        class="send-btn"
        style="font-size: 16px;"
        @click="${() => logic.sendMessage(ctx)}"
        ?disabled="${ctx.isGenerating || (ctx.imageAttachment && !ctx.shadowRoot.querySelector('textarea')?.value.trim())}"
      >
        ➔
      </button>
    </div>
  `;
}


