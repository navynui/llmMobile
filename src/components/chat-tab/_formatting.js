/**
 * Pure formatting functions for chat messages.
 * All functions are stateless — they receive data and return HTML.
 */

export function parseThinkingAndContent(ctx, m) {
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

export function scrollToBottom(ctx) {
  setTimeout(() => {
    const container = ctx.shadowRoot.querySelector('.chat-container');
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
    // Auto-scroll any active thinking content boxes
    const thinkingBoxes = ctx.shadowRoot.querySelectorAll('.thinking-content');
    thinkingBoxes.forEach(box => {
      box.scrollTop = box.scrollHeight;
    });
  }, 50);
}

export function formatMath(ctx, mathText) {
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
  formatted = formatted.replace(/\\dots/g, '...');
  formatted = formatted.replace(/\\ldots/g, '...');

  // Fractions rac{num}{den} -> <span class="frac"><sup>num</sup><sub>den</sub></span>
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

export function formatTableCell(ctx, cell) {
  if (!cell) return '';
  let formatted = cell;

  // Inline code `code`
  formatted = formatted.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Inline Math: $ ... $ or \( ... \)
  formatted = formatted.replace(/\$([^\$]+)\$/g, (match, math) => {
    return `<span class="math-inline">${formatMath(ctx, math.trim())}</span>`;
  });
  formatted = formatted.replace(/\\\((.*?)\\\)/g, (match, math) => {
    return `<span class="math-inline">${formatMath(ctx, math.trim())}</span>`;
  });

  // Bold (**bold**)
  formatted = formatted.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

  // Italic (*italic*)
  formatted = formatted.replace(/\*([^*]+)\*/g, '<em>$1</em>');

  return formatted;
}

export function parseMarkdownTable(ctx, rows) {
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
    html += `<th style="text-align: ${align}">${formatTableCell(ctx, cell)}</th>`;
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
      html += `<td style="text-align: ${align}">${formatTableCell(ctx, cell)}</td>`;
    }
    html += '</tr>';
  }
  html += '</tbody></table></div>';
  return html;
}

export function formatMessage(ctx, text) {
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

  // 2.25. Markdown links [text](url) — save before URL regex fires
  htmlContent = htmlContent.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    (match, text, url) => {
      const cleanUrl = url.replace(/[.,!?;:)\]}"'\u201D]+$/, '');
      return savePlaceholder(
        `<a href="${cleanUrl}" target="_blank" rel="noopener noreferrer">${text}</a>`,
        'MD_LINK'
      );
    }
  );

  // 2.5. Make bare URLs clickable (after code & markdown links are protected)
  htmlContent = htmlContent.replace(
    /(https?:\/\/[^\s<>"'*]+)/g,
    (match, url) => {
      // Strip trailing punctuation and HTML artifacts
      let clean = url.replace(/[.,!?;:)\]}"'\u201D]+$/, '');
      clean = clean.replace(/<!\/?[-a-z]+>?$/, '');
      const display = clean.length > 80 ? clean.slice(0, 77) + '...' : clean;
      return `<a href="${clean}" target="_blank" rel="noopener noreferrer">${display}</a>`;
    }
  );

  // 3. Block Math: $$ ... $$ or \[ ... \]
  htmlContent = htmlContent.replace(/\$\$([\s\S]*?)\$\$/g, (match, math) => {
    return savePlaceholder(`<div class="math-block">${formatMath(ctx, math.trim())}</div>`, 'MATH_BLOCK');
  });
  htmlContent = htmlContent.replace(/\\\[([\s\S]*?)\\\]/g, (match, math) => {
    return savePlaceholder(`<div class="math-block">${formatMath(ctx, math.trim())}</div>`, 'MATH_BLOCK');
  });

  // 4. Inline Math: $ ... $ or \( ... \)
  htmlContent = htmlContent.replace(/\$([^\$]+)\$/g, (match, math) => {
    return savePlaceholder(`<span class="math-inline">${formatMath(ctx, math.trim())}</span>`, 'MATH_INLINE');
  });
  htmlContent = htmlContent.replace(/\\\((.*?)\\\)/g, (match, math) => {
    return savePlaceholder(`<span class="math-inline">${formatMath(ctx, math.trim())}</span>`, 'MATH_INLINE');
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
        const tableHtml = parseMarkdownTable(ctx, tableRows);
        newLines.push(savePlaceholder(tableHtml, 'TABLE'));
        tableRows = [];
        inTable = false;
      }
      newLines.push(line);
    }
  }
  if (inTable) {
    const tableHtml = parseMarkdownTable(ctx, tableRows);
    newLines.push(savePlaceholder(tableHtml, 'TABLE'));
  }
  htmlContent = newLines.join('\n');

  // 4.6. Headings
  htmlContent = htmlContent.replace(/^###\s+(.*)$/gm, '<h3>$1</h3>');
  htmlContent = htmlContent.replace(/^##\s+(.*)$/gm, '<h2>$1</h2>');
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


// ── Prompt extraction & generate ────────────────────────────────────────────

export function extractPrompts(text) {
  if (!text) return [];
  const prompts = [];
  const seen = new Set();
  // Match lines starting with "> " which contain prompt text
  const regex = /^>\s+(.+)$/gm;
  let match;
  while ((match = regex.exec(text)) !== null) {
    const promptText = match[1].trim();
    if (promptText.length > 15 && !seen.has(promptText)) {
      seen.add(promptText);
      prompts.push(promptText);
    }
  }
  // If no > blocks found, try lines right after "Prompt:"
  if (prompts.length === 0) {
    const pRegex = /Prompt:\s*\n(?:>?\s*)(.+)$/gm;
    while ((match = pRegex.exec(text)) !== null) {
      const promptText = match[1].trim();
      if (promptText.length > 15 && !seen.has(promptText)) {
        seen.add(promptText);
        prompts.push(promptText);
      }
    }
  }
  return prompts;
}

export function promptGenerateImage(ctx, promptText) {
  if (!promptText) return;
  ctx._showMenu = false;
  try {
    localStorage.setItem('gen_prompt', promptText);
    localStorage.setItem('gen_resolution', '720x1280');
    localStorage.setItem('gen_num_images', '1');
    localStorage.setItem('gen_mode', 'zimage');
    window.location.hash = '#/generate';
  } catch (e) {
    import('../../utils/toast.js').then(m => {
      m.Toast.show(`❌ ${e.message}`, 'error');
    });
  }
}
