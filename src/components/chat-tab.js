import { LitElement, html, css } from 'lit';

export class ChatTab extends LitElement {
  static properties = {
    messages: { type: Array },
    inputActive: { type: Boolean },
    isGenerating: { type: Boolean },
    metadata: { type: Object }
  };

  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      height: 100%;
      background: var(--bg-color);
    }

    .chat-container {
      flex: 1;
      overflow-y: auto;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 16px;
      padding-bottom: 24px;
    }

    /* Message Bubbles */
    .message {
      max-width: 85%;
      display: flex;
      flex-direction: column;
      gap: 4px;
      animation: messageSlideIn 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    }

    @keyframes messageSlideIn {
      from { opacity: 0; transform: translateY(8px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .message.user {
      align-self: flex-end;
    }

    .message.assistant {
      align-self: flex-start;
    }

    .bubble {
      padding: 12px 16px;
      border-radius: var(--radius-lg);
      font-size: 0.95rem;
      line-height: 1.5;
      word-break: break-word;
    }

    .user .bubble {
      background: var(--primary);
      color: #fff;
      border-bottom-right-radius: 4px;
      box-shadow: 0 4px 12px var(--primary-glow);
    }

    .assistant .bubble {
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      color: var(--text-primary);
      border-bottom-left-radius: 4px;
      box-shadow: var(--shadow-md);
    }

    /* Thinking block styling */
    .thinking-box {
      background: rgba(17, 24, 39, 0.4);
      border: 1px solid rgba(156, 163, 175, 0.15);
      border-radius: var(--radius-md);
      padding: 10px 12px;
      margin-bottom: 12px;
      font-size: 0.85rem;
      color: var(--text-secondary);
      font-family: var(--font-sans);
    }
    
    .thinking-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-weight: 600;
      color: var(--text-muted);
    }

    .thinking-content {
      border-left: 2px solid var(--primary);
      padding-left: 10px;
      margin-top: 6px;
      font-family: var(--font-mono);
      font-size: 0.8rem;
      white-space: pre-wrap;
      max-height: 150px;
      overflow-y: auto;
      color: var(--text-muted);
    }

    /* Markdown styling inside bubbles */
    .bubble p {
      margin-bottom: 8px;
    }
    .bubble p:last-child {
      margin-bottom: 0;
    }
    .bubble code {
      font-family: var(--font-mono);
      background: rgba(0, 0, 0, 0.3);
      padding: 2px 6px;
      border-radius: var(--radius-sm);
      font-size: 0.85rem;
    }
    .bubble pre {
      font-family: var(--font-mono);
      background: rgba(0, 0, 0, 0.4);
      padding: 12px;
      border-radius: var(--radius-md);
      overflow-x: auto;
      margin: 8px 0;
      border: 1px solid rgba(255, 255, 255, 0.05);
    }
    .bubble pre code {
      background: none;
      padding: 0;
      font-size: 0.85rem;
    }
    .bubble ul, .bubble ol {
      margin-left: 20px;
      margin-bottom: 8px;
    }

    .bubble h1, .bubble h2, .bubble h3 {
      font-family: var(--font-title);
      color: var(--text-primary);
      margin-top: 14px;
      margin-bottom: 8px;
      font-weight: 600;
    }
    .bubble h1 { font-size: 1.25rem; }
    .bubble h2 { font-size: 1.15rem; }
    .bubble h3 { font-size: 1.05rem; }

    /* Table styles */
    .table-container {
      width: 100%;
      overflow-x: auto;
      margin: 12px 0;
      border-radius: var(--radius-md);
      border: 1px solid var(--border-color);
      background: rgba(0, 0, 0, 0.15);
      -webkit-overflow-scrolling: touch;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.85rem;
      text-align: left;
    }

    th {
      background: rgba(255, 255, 255, 0.04);
      padding: 10px 14px;
      font-weight: 600;
      color: var(--text-primary);
      border-bottom: 1px solid var(--border-color);
      white-space: nowrap;
    }

    td {
      padding: 10px 14px;
      color: var(--text-secondary);
      border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    }

    tr:last-child td {
      border-bottom: none;
    }

    tr:hover td {
      background: rgba(255, 255, 255, 0.02);
    }

    /* Math styles */
    .math-block {
      display: block;
      text-align: center;
      margin: 12px auto;
      font-family: 'Cambria Math', 'Nimbus Roman No9 L', 'Times New Roman', serif;
      font-size: 1.15rem;
      background: rgba(255, 255, 255, 0.02);
      padding: 10px;
      border-radius: var(--radius-md);
      border-left: 3px solid var(--primary);
      width: fit-content;
      max-width: 90%;
    }

    .math-inline {
      font-family: 'Cambria Math', 'Nimbus Roman No9 L', 'Times New Roman', serif;
      font-size: 1.05rem;
      font-style: italic;
      padding: 0 4px;
      background: rgba(99, 102, 241, 0.05);
      border-radius: var(--radius-sm);
    }

    .frac {
      display: inline-block;
      vertical-align: middle;
      text-align: center;
      font-size: 0.85em;
      line-height: 1;
      padding: 0 2px;
    }

    .frac sup {
      display: block;
      border-bottom: 1px solid var(--text-primary);
      font-size: inherit;
      vertical-align: baseline;
      position: static;
    }

    .frac sub {
      display: block;
      font-size: inherit;
      vertical-align: baseline;
      position: static;
    }

    /* Metadata label */
    .meta-info {
      font-size: 0.75rem;
      color: var(--text-muted);
      align-self: flex-start;
      margin-left: 4px;
    }

    /* Input Bar */
    .input-bar {
      background: rgba(11, 15, 25, 0.8);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      border-top: 1px solid var(--border-color);
      padding: 12px 16px;
      display: flex;
      gap: 12px;
      align-items: center;
      z-index: 10;
    }

    textarea {
      flex: 1;
      height: 40px;
      min-height: 40px;
      max-height: 40px;
      box-sizing: border-box;
      background: rgba(0, 0, 0, 0.2);
      border: 1px solid var(--border-color);
      border-radius: var(--radius-full);
      padding: 10px 18px;
      color: var(--text-primary);
      font-family: var(--font-sans);
      font-size: 0.95rem;
      outline: none;
      resize: none;
      transition: var(--transition);
      line-height: 1.25;
      overflow-y: auto;
    }

    textarea:focus {
      border-color: var(--primary);
      background: rgba(0, 0, 0, 0.3);
    }

    .send-btn {
      width: 40px;
      height: 40px;
      border-radius: var(--radius-full);
      background: var(--primary);
      color: #fff;
      border: none;
      display: flex;
      justify-content: center;
      align-items: center;
      cursor: pointer;
      transition: var(--transition);
      box-shadow: 0 4px 10px var(--primary-glow);
      flex-shrink: 0;
    }

    .send-btn:hover {
      background: #4f46e5;
    }

    .send-btn:disabled {
      background: var(--bg-card);
      color: var(--text-muted);
      cursor: not-allowed;
      box-shadow: none;
      flex-shrink: 0;
    }

    /* Typing indicator */
    .typing-indicator {
      display: flex;
      gap: 4px;
      padding: 8px 12px;
      align-items: center;
    }

    .dot {
      width: 6px;
      height: 6px;
      background: var(--text-muted);
      border-radius: 50%;
      animation: dotPulse 1.4s infinite both;
    }

    .dot:nth-child(2) { animation-delay: 0.2s; }
    .dot:nth-child(3) { animation-delay: 0.4s; }

    @keyframes dotPulse {
      0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
      40% { transform: scale(1.1); opacity: 1; }
    }
  `;

  constructor() {
    super();
    this.messages = [];
    this.inputActive = false;
    this.isGenerating = false;
    this.metadata = null;
    
    // Load chat history from localStorage
    const saved = localStorage.getItem('chat_history');
    if (saved) {
      try {
        this.messages = JSON.parse(saved);
      } catch (e) {
        this.messages = [];
      }
    }
  }

  parseThinkingAndContent(m) {
    if (!m) return { thinking: '', response: '', isThinking: false };
    
    // 1. If the message already has reasoning_content populated during streaming
    if (m.thinking !== undefined) {
      return { 
        thinking: m.thinking, 
        response: m.content || '', 
        isThinking: m.isThinking || false 
      };
    }
    
    // 2. Fallback to parsing inline <think> tags for backward compatibility or loaded history
    const content = m.content || '';
    const thinkStart = content.indexOf('<think>');
    const thinkEnd = content.indexOf('</think>');
    
    if (thinkStart !== -1) {
      if (thinkEnd !== -1) {
        // Thinking has completed
        const thinking = content.slice(thinkStart + 7, thinkEnd).trim();
        const response = content.slice(thinkEnd + 8).trim();
        return { thinking, response, isThinking: false };
      } else {
        // Thinking is currently in progress
        const thinking = content.slice(thinkStart + 7).trim();
        return { thinking, response: '', isThinking: true };
      }
    } else {
      // No thinking block found
      return { thinking: '', response: content, isThinking: false };
    }
  }

  updated(changedProperties) {
    if (changedProperties.has('messages')) {
      this.scrollToBottom();
      // Cache history (keep last 100)
      if (this.messages.length > 100) {
        this.messages = this.messages.slice(this.messages.length - 100);
      }
      localStorage.setItem('chat_history', JSON.stringify(this.messages));
    }
  }

  scrollToBottom() {
    setTimeout(() => {
      const container = this.shadowRoot.querySelector('.chat-container');
      if (container) {
        container.scrollTop = container.scrollHeight;
      }
      // Auto-scroll any active thinking content boxes
      const thinkingBoxes = this.shadowRoot.querySelectorAll('.thinking-content');
      thinkingBoxes.forEach(box => {
        box.scrollTop = box.scrollHeight;
      });
    }, 50);
  }

  handleTextareaInput(e) {
    // Keep height strictly fixed at 40px
  }

  handleKeyDown(e) {
    // Send message on Enter key without shift
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      this.sendMessage();
    }
  }

  async sendMessage() {
    const textarea = this.shadowRoot.querySelector('textarea');
    if (!textarea || !textarea.value.trim() || this.isGenerating) return;

    const text = textarea.value.trim();
    textarea.value = '';
    textarea.style.height = '40px';

    // Add user message
    this.messages = [...this.messages, { role: 'user', content: text }];
    this.isGenerating = true;

    // Create assistant message placeholder
    const assistantMessageIndex = this.messages.length;
    this.messages = [...this.messages, { role: 'assistant', content: '', thinking: '', isThinking: false, done: false }];

    try {
      const response = await fetch('/api/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: this.messages.slice(0, assistantMessageIndex).map(m => ({
            role: m.role,
            content: m.content
          })),
          stream: true
        })
      });

      if (!response.ok) {
        throw new Error('API server returned error code ' + response.status);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let assistantText = '';
      let assistantReasoning = '';
      let isThinking = false;
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        
        // Save the last partial line back to the buffer
        buffer = lines.pop();

        for (const line of lines) {
          const cleanLine = line.trim();
          if (!cleanLine) continue;

          // Unified parsing of llama.cpp response stream format
          if (cleanLine.startsWith('data: ')) {
            const dataStr = cleanLine.substring(6).trim();
            if (dataStr === '[DONE]') continue;

            try {
              const parsed = JSON.parse(dataStr);
              
              // 1. OpenAI Chat Completion format: choice delta
              const deltaContent = parsed.choices?.[0]?.delta?.content || '';
              const deltaReasoning = parsed.choices?.[0]?.delta?.reasoning_content || '';
              // 2. OpenAI Completion format: choice text
              const textContent = parsed.choices?.[0]?.text || '';
              // 3. Llama.cpp native completion format: content
              const nativeContent = parsed.content || '';
              
              if (deltaReasoning) {
                assistantReasoning += deltaReasoning;
                isThinking = true;
                this.updateAssistantMessage(assistantMessageIndex, assistantText, assistantReasoning, isThinking, false);
              } else {
                const newText = deltaContent || textContent || nativeContent;
                if (newText) {
                  assistantText += newText;
                  // Once standard output starts, if we were thinking, complete the thinking block
                  isThinking = false;
                  this.updateAssistantMessage(assistantMessageIndex, assistantText, assistantReasoning, isThinking, false);
                }
              }

              // Extract timings metadata if available (usually at final chunk)
              const timings = parsed.timings || parsed.usage;
              if (timings) {
                this.updateAssistantMeta(assistantMessageIndex, timings);
              }
            } catch (e) {
              // Ignore partial or parsing errors in chunk
            }
          }
        }
      }

      // Finish generation
      this.updateAssistantMessage(assistantMessageIndex, assistantText, assistantReasoning, false, true);

    } catch (e) {
      this.updateAssistantMessage(
        assistantMessageIndex, 
        `Error: Failed to fetch completion stream (${e.message}). Please ensure model is loaded.`, 
        '',
        false,
        true
      );
    } finally {
      this.isGenerating = false;
    }
  }

  updateAssistantMessage(index, content, thinking = '', isThinking = false, done = false) {
    const updated = [...this.messages];
    if (updated[index]) {
      updated[index] = { ...updated[index], content, thinking, isThinking, done };
      this.messages = updated;
    }
  }

  updateAssistantMeta(index, timings) {
    const updated = [...this.messages];
    if (updated[index]) {
      let metaStr = '';
      
      // Calculate tokens per second if statistics are available
      if (timings.predicted_n && timings.predicted_ms) {
        const tps = (timings.predicted_n / (timings.predicted_ms / 1000)).toFixed(1);
        const evalTime = (timings.prompt_ms / 1000).toFixed(2);
        metaStr = `${tps} t/s · Eval: ${evalTime}s`;
      } else if (timings.completion_tokens && timings.prompt_tokens) {
        // OpenAI-style usage dict fallback
        metaStr = `Tokens: ${timings.prompt_tokens} in / ${timings.completion_tokens} out`;
      }
      
      if (metaStr) {
        updated[index] = { ...updated[index], meta: metaStr };
        this.messages = updated;
      }
    }
  }

  // Helper to clear conversation
  clearConversation() {
    if (confirm('Clear entire chat history?')) {
      this.messages = [];
      localStorage.removeItem('chat_history');
    }
  }

  formatMath(mathText) {
    if (!mathText) return '';
    
    let formatted = mathText;

    // Greek letters and math symbols
    const symbols = {
      '\\\\pi': 'π',
      '\\\\alpha': 'α',
      '\\\\beta': 'β',
      '\\\\gamma': 'γ',
      '\\\\theta': 'θ',
      '\\\\lambda': 'λ',
      '\\\\sigma': 'σ',
      '\\\\omega': 'ω',
      '\\\\infty': '∞',
      '\\\\approx': '≈',
      '\\\\neq': '≠',
      '\\\\le': '≤',
      '\\\\ge': '≥',
      '\\\\times': '×',
      '\\\\div': '÷',
      '\\\\pm': '±',
      '\\\\cdot': '·',
      '\\\\partial': '∂',
      '\\\\sum': '∑',
      '\\\\int': '∫',
      '\\\\delta': 'δ',
      '\\\\Delta': 'Δ',
      '\\\\mu': 'μ',
      '\\\\phi': 'φ',
      '\\\\tau': 'τ',
      '\\\\epsilon': 'ε'
    };

    // Square roots: \sqrt{x}
    formatted = formatted.replace(/\\sqrt\{([^}]+)\}/g, '√<span style="border-top: 1px solid var(--text-primary); margin-left: 1px; padding-top: 1px; display: inline-block; line-height: 0.95;">$1</span>');
    formatted = formatted.replace(/\\sqrt/g, '√');

    for (const [key, val] of Object.entries(symbols)) {
      formatted = formatted.replace(new RegExp(key, 'g'), val);
    }

    // TeX font styling commands
    formatted = formatted.replace(/\\mathbf\{([^}]+)\}/g, '<strong>$1</strong>');
    formatted = formatted.replace(/\\mathit\{([^}]+)\}/g, '<em>$1</em>');
    formatted = formatted.replace(/\\mathrm\{([^}]+)\}/g, '<span style="font-style: normal;">$1</span>');
    formatted = formatted.replace(/\\dots/g, '…');
    formatted = formatted.replace(/\\ldots/g, '…');

    // Fractions \frac{num}{den} -> <span class="frac"><sup>num</sup><sub>den</sub></span>
    formatted = formatted.replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, '<span class="frac"><sup>$1</sup><sub>$2</sub></span>');

    // Handle simple inline division fractions like a/b or 22/7 inside math
    formatted = formatted.replace(/(\d+)\/(\d+)/g, '<span class="frac"><sup>$1</sup><sub>$2</sub></span>');
    formatted = formatted.replace(/([A-Za-z])\/([A-Za-z]|\d+)/g, '<span class="frac"><sup>$1</sup><sub>$2</sub></span>');

    // Superscripts ^abc or ^{abc}
    formatted = formatted.replace(/\^\{([^}]+)\}/g, '<sup>$1</sup>');
    formatted = formatted.replace(/\^([0-9a-zA-Z+-]+)/g, '<sup>$1</sup>');

    // Subscripts _abc or _{abc}
    formatted = formatted.replace(/_\{([^}]+)\}/g, '<sub>$1</sub>');
    formatted = formatted.replace(/_([0-9a-zA-Z+-]+)/g, '<sub>$1</sub>');

    return formatted;
  }

  // Parses inline math and markdown within table cells
  formatTableCell(cell) {
    if (!cell) return '';
    let formatted = cell;
    
    // Inline code `code`
    formatted = formatted.replace(/`([^`]+)`/g, '<code>$1</code>');
    
    // Inline Math: $ ... $ or \( ... \)
    formatted = formatted.replace(/\$([^\$]+)\$/g, (match, math) => {
      return `<span class="math-inline">${this.formatMath(math.trim())}</span>`;
    });
    formatted = formatted.replace(/\\\((.*?)\\\)/g, (match, math) => {
      return `<span class="math-inline">${this.formatMath(math.trim())}</span>`;
    });
    
    // Bold (**bold**)
    formatted = formatted.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    
    // Italic (*italic*)
    formatted = formatted.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    
    return formatted;
  }

  parseMarkdownTable(rows) {
    if (rows.length < 2) {
      return rows.join('\n');
    }

    const parseRow = (row) => {
      const cells = row.split('|').map(c => c.trim());
      if (cells[0] === '') cells.shift();
      if (cells[cells.length - 1] === '') cells.pop();
      return cells;
    };

    const headerCells = parseRow(rows[0]);
    const separatorRow = rows[1];
    
    const alignmentCells = parseRow(separatorRow);
    const alignments = alignmentCells.map(cell => {
      if (cell.startsWith(':') && cell.endsWith(':')) return 'center';
      if (cell.endsWith(':')) return 'right';
      return 'left';
    });

    let html = '<div class="table-container"><table>';
    
    // Header
    html += '<thead><tr>';
    headerCells.forEach((cell, idx) => {
      const align = alignments[idx] || 'left';
      html += `<th style="text-align: ${align}">${this.formatTableCell(cell)}</th>`;
    });
    html += '</tr></thead>';

    // Body
    html += '<tbody>';
    for (let i = 2; i < rows.length; i++) {
      const bodyCells = parseRow(rows[i]);
      if (bodyCells.length === 0) continue;
      html += '<tr>';
      for (let j = 0; j < headerCells.length; j++) {
        const cell = bodyCells[j] || '';
        const align = alignments[j] || 'left';
        html += `<td style="text-align: ${align}">${this.formatTableCell(cell)}</td>`;
      }
      html += '</tr>';
    }
    html += '</tbody></table></div>';
    return html;
  }

  // Simple regex-based markdown formatter for HTML bubbles
  formatMessage(text) {
    if (!text) return '';
    
    // Escape HTML first
    let htmlContent = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    const placeholders = [];
    let placeholderCounter = 0;

    function savePlaceholder(html, type = 'BLOCK') {
      const id = `__PLACEHOLDER_${type}_${placeholderCounter++}__`;
      placeholders.push({ id, html });
      return id;
    }

    // 1. Code blocks (```code```)
    htmlContent = htmlContent.replace(/```([\s\S]*?)```/g, (match, code) => {
      return savePlaceholder(`<pre><code>${code.trim()}</code></pre>`, 'CODE_BLOCK');
    });

    // 2. Inline code (`code`)
    htmlContent = htmlContent.replace(/`([^`]+)`/g, (match, code) => {
      return savePlaceholder(`<code>${code}</code>`, 'CODE_INLINE');
    });

    // 3. Block Math: $$ ... $$ or \[ ... \]
    htmlContent = htmlContent.replace(/\$\$([\s\S]*?)\$\$/g, (match, math) => {
      return savePlaceholder(`<div class="math-block">${this.formatMath(math.trim())}</div>`, 'MATH_BLOCK');
    });
    htmlContent = htmlContent.replace(/\\\[([\s\S]*?)\\\]/g, (match, math) => {
      return savePlaceholder(`<div class="math-block">${this.formatMath(math.trim())}</div>`, 'MATH_BLOCK');
    });

    // 4. Inline Math: $ ... $ or \( ... \)
    htmlContent = htmlContent.replace(/\$([^\$]+)\$/g, (match, math) => {
      return savePlaceholder(`<span class="math-inline">${this.formatMath(math.trim())}</span>`, 'MATH_INLINE');
    });
    htmlContent = htmlContent.replace(/\\\((.*?)\\\)/g, (match, math) => {
      return savePlaceholder(`<span class="math-inline">${this.formatMath(math.trim())}</span>`, 'MATH_INLINE');
    });

    // 4.5. Table parsing
    const lines = htmlContent.split('\n');
    let inTable = false;
    let tableRows = [];
    let newLines = [];

    for (let line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
        inTable = true;
        tableRows.push(trimmed);
      } else {
        if (inTable) {
          const tableHtml = this.parseMarkdownTable(tableRows);
          newLines.push(savePlaceholder(tableHtml, 'TABLE'));
          tableRows = [];
          inTable = false;
        }
        newLines.push(line);
      }
    }
    if (inTable) {
      const tableHtml = this.parseMarkdownTable(tableRows);
      newLines.push(savePlaceholder(tableHtml, 'TABLE'));
    }
    htmlContent = newLines.join('\n');

    // 4.6. Headings
    htmlContent = htmlContent.replace(/^###\s+(.*)$/gm, '<h3>$1</h3>');
    htmlContent = htmlContent.replace(/^##\s+(.*)$/gm, '<h2>$2</h2>');
    htmlContent = htmlContent.replace(/^#\s+(.*)$/gm, '<h1>$1</h1>');

    // 5. Bold (**bold**)
    htmlContent = htmlContent.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

    // 6. Italic (*italic*)
    htmlContent = htmlContent.replace(/\*([^*]+)\*/g, '<em>$1</em>');

    // 7. Bullet lists & Numbered lists
    htmlContent = htmlContent.replace(/^\s*[-*]\s+(.+)$/gm, '<li>$1</li>');
    htmlContent = htmlContent.replace(/^\s*\d+\.\s+(.+)$/gm, '<li class="num-item">$1</li>');

    // Group adjacent <li> tags
    htmlContent = htmlContent.replace(/((?:<li>.*<\/li>\s*)+)/g, '<ul>$1</ul>');
    htmlContent = htmlContent.replace(/((?:<li class="num-item">.*<\/li>\s*)+)/g, (match) => {
      const cleanMatch = match.replace(/class="num-item"/g, '');
      return `<ol>${cleanMatch}</ol>`;
    });

    // 8. Paragraphs & Line Breaks
    const paragraphs = htmlContent.split('\n\n');
    htmlContent = paragraphs.map(p => {
      const trimmed = p.trim();
      if (!trimmed) return '';
      if (trimmed.startsWith('__PLACEHOLDER_') || trimmed.startsWith('<ul>') || trimmed.startsWith('<ol>')) {
        return trimmed;
      }
      return `<p>${trimmed.replace(/\n/g, '<br/>')}</p>`;
    }).join('\n');

    // 9. Restore placeholders in reverse order
    for (let i = placeholders.length - 1; i >= 0; i--) {
      const { id, html } = placeholders[i];
      htmlContent = htmlContent.replace(id, html);
    }

    return htmlContent;
  }

  render() {
    return html`
      <div class="chat-container">
        ${this.messages.length === 0 ? html`
          <div style="margin: auto; text-align: center; color: var(--text-muted); max-width: 280px; padding-bottom: 40px;">
            <div style="font-size: 3rem; margin-bottom: 16px;">💬</div>
            <h3 style="font-family: var(--font-title); color: var(--text-secondary); margin-bottom: 8px;">LLM Chatbox</h3>
            <p style="font-size: 0.85rem; line-height: 1.4;">Send a message to interact with the currently loaded GGUF model in VRAM.</p>
          </div>
        ` : this.messages.map(m => html`
          <div class="message ${m.role}">
            <div class="bubble">
              ${m.role === 'assistant' 
                ? html`${m.content || m.thinking ? html`
                    ${(() => {
                      const { thinking, response, isThinking } = this.parseThinkingAndContent(m);
                      return html`
                        ${isThinking ? html`
                          <div class="thinking-box">
                            <div class="thinking-header">
                              <span>🧠 Thinking Process...</span>
                            </div>
                            <div class="thinking-content">${thinking || 'Formulating thoughts...'}</div>
                          </div>
                        ` : ''}
                        ${response ? html`<div .innerHTML="${this.formatMessage(response)}"></div>` : ''}
                        ${!response && !isThinking ? html`
                          <div class="typing-indicator">
                            <div class="dot"></div>
                            <div class="dot"></div>
                            <div class="dot"></div>
                          </div>
                        ` : ''}
                      `;
                    })()}
                  ` : html`
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
          </div>
        `)}
      </div>

      <div class="input-bar">
        <button 
          class="send-btn" 
          style="background: rgba(255, 255, 255, 0.05); color: var(--text-muted); box-shadow: none;"
          @click="${this.clearConversation}"
          title="Clear Conversation"
        >
          🗑️
        </button>
        <textarea 
          placeholder="Type a message..." 
          rows="1" 
          @input="${this.handleTextareaInput}"
          @keydown="${this.handleKeyDown}"
          ?disabled="${this.isGenerating}"
        ></textarea>
        <button 
          class="send-btn" 
          @click="${this.sendMessage}"
          ?disabled="${this.isGenerating}"
        >
          ➔
        </button>
      </div>
    `;
  }
}

customElements.define('chat-tab', ChatTab);
