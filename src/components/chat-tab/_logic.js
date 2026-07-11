import { Confirm } from '../../components/_confirm.js';

/** Tool definitions mirroring services/tools/registry.py */
const TOOL_DEFINITIONS = [
  {
    type: 'function',
    function: {
      name: 'web_search',
      description: 'Search the internet for current information. Use this when you need up-to-date data, news, or facts.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'The search query string' },
          num_results: { type: 'integer', description: 'Number of results (max 10)', default: 5 }
        },
        required: ['query']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'write_file',
      description: 'Write content to a file in the sandbox workspace (/mnt/dashboard/). Creates the file if needed.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Relative path from sandbox root, e.g. "output/notes.md"' },
          content: { type: 'string', description: 'The content to write' },
          mode: { type: 'string', enum: ['overwrite', 'append'], description: 'Write mode', default: 'overwrite' }
        },
        required: ['path', 'content']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: 'Read the contents of an existing file in the sandbox workspace.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Relative path from sandbox root' }
        },
        required: ['path']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'edit_file',
      description: 'Edit a file by replacing the first occurrence of old_string with new_string.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Relative path from sandbox root' },
          old_string: { type: 'string', description: 'The exact text to find and replace' },
          new_string: { type: 'string', description: 'The replacement text' }
        },
        required: ['path', 'old_string', 'new_string']
      }
    }
  }
];

/** Icon labels for each tool */
const TOOL_ICONS = {
  web_search: '🔍',
  write_file: '📝',
  read_file: '📖',
  edit_file: '✏️',
};

function _api(ctx, endpoint) {
  const apis = {
    primary: {
      chat_completions: '/api/chat/completions',
      models: '/api/llm/models',
      vision: '/models/vision-capabilities',
      load: '/api/llm/models/load',
    },
    mini: {
      chat_completions: '/api/chat-mini/completions',
      models: '/api/llm-mini/models',
      vision: '/models-mini/vision-capabilities',
      load: '/api/llm-mini/models/load',
    },
  };
  const srv = ctx.chatServer || 'primary';
  return (apis[srv] || apis.primary)[endpoint];
}


export async function checkModelStatus(ctx) {
  try {
    let queueRunning = false;
    const queueResp = await fetch('/api/generate/queue');
    if (queueResp.ok) {
      const queueData = await queueResp.json();
      queueRunning = queueData.queue?.some(item => item.status === 'running' || item.status === 'queued') || false;
    }

    const modelsResp = await fetch(_api(ctx, 'models'));
    if (!modelsResp.ok) return;
    const modelsData = await modelsResp.json();
    const loadedModel = modelsData.data?.find(m => 
      m.status === 'loaded' || 
      (typeof m.status === 'object' && m.status?.value === 'loaded')
    );
    ctx.loadedModelName = loadedModel ? loadedModel.id : '';

    const prevModel = sessionStorage.getItem('previous_model_name');
    if (!loadedModel && prevModel) {
      ctx.showReloadBanner = true;
      ctx.previousModelName = prevModel;
    } else {
      ctx.showReloadBanner = false;
      ctx.previousModelName = '';
    }

    if (queueRunning) {
      ctx.isGenerating = true;
    } else {
      const activeAss = ctx.messages.some(m => m.role === 'assistant' && !m.done && m.content === '');
      if (!activeAss) {
        ctx.isGenerating = false;
      }
    }
  } catch (e) {
    console.warn("Failed checking model status:", e);
  }
}

export async function reloadModel(ctx) {
  if (!ctx.previousModelName) return;
  ctx.isReloading = true;
  try {
    const res = await fetch(_api(ctx, 'load'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: ctx.previousModelName })
    });
    if (res.ok) {
      ctx.showReloadBanner = false;
      sessionStorage.removeItem('previous_model_name');
      await checkVisionSupport(ctx);
    } else {
      alert("Failed to reload model: " + (await res.text()));
    }
  } catch (e) {
    alert("Error reloading model: " + e.message);
  } finally {
    ctx.isReloading = false;
  }
}

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

export async function checkVisionSupport(ctx) {
  try {
    // 1. Find out which model is currently loaded on the server
    const modelsResp = await fetch(_api(ctx, 'models'));
    if (!modelsResp.ok) return;
    const modelsData = await modelsResp.json();
    
    const loadedModel = modelsData.data?.find(m => 
      m.status === 'loaded' || 
      (typeof m.status === 'object' && m.status?.value === 'loaded')
    );

    if (!loadedModel) {
      ctx.visionCapable = false;
      return;
    }

    const modelId = loadedModel.id;

    // 2. Check vision capabilities for that specific model
    const visionResp = await fetch(_api(ctx, 'vision'));
    if (!visionResp.ok) return;
    const visionData = await visionResp.json();
    
    const capability = visionData.models[modelId];
    if (capability) {
      const wasCapable = ctx.visionCapable;
      ctx.visionCapable = !!capability.vision_capable;
      if (wasCapable !== ctx.visionCapable) {
        console.log('[Vision] Vision support changed:', capability);
      }
    }
  } catch (err) {
    console.warn('[Vision] Failed to check capability:', err);
  }
}

export function handleImageUpload(ctx, e) {
  const file = e.target.files[0];
  if (!file || !ctx.visionCapable || ctx.isGenerating) return;

  const reader = new FileReader();
  reader.onload = () => {
    const base64 = reader.result.split(',')[1]; // strip data:image/jpeg;base64,
    
    // Store the image as pending attachment (not yet sent)
    ctx.imageAttachment = { base64, mimeType: file.type };
    console.log('[Vision] Image captured:', file.name);
  };

  if (file.type.startsWith('image/')) {
    reader.readAsDataURL(file);
  }
}

export function buildUserContent(ctx, m) {
  const textPart = { type: 'text', text: m.content || '' };
  if (m.base64_image || (m.images && m.images.length > 0)) {
    const images = m.images ? m.images : [m.base64_image];
    return {
      role: 'user',
      content: [
        textPart,
        ...images.map(img => ({ type: 'image_url', image_url: { url: `data:image/jpeg;base64,${img}` } }))
      ]
    };
  }
  return {
    role: 'user',
    content: m.content || ''
  };
}

export function sendWithImage(ctx) {
  if (!ctx.imageAttachment || !ctx.visionCapable) return;
  ctx.imageSent = true;
  
  // Remove attachment after sending
  setTimeout(() => {
    delete ctx.imageAttachment;
    ctx.imageSent = false;
    ctx.requestUpdate();
  }, 500);
}

export function handleTextareaInput(ctx, e) {
  // Keep height strictly fixed at 40px
}

export function handleKeyDown(ctx, e) {
  // Send message on Enter key without shift
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage(ctx);
  }
}

export async function sendMessage(ctx) {
  const textarea = ctx.shadowRoot.querySelector('textarea');
  if (ctx.isGenerating) return;

  let text = (textarea ? textarea.value?.trim() : '') || '';
  let base64Image = null;

  // Hard fallback: on chat send, check if model needs reload
  const prevModel = sessionStorage.getItem('previous_model_name');
  if (prevModel) {
    try {
      const modelsResp = await fetch(_api(ctx, 'models'));
      if (modelsResp.ok) {
        const modelsData = await modelsResp.json();
        const loadedModel = modelsData.data?.find(m => 
          m.status === 'loaded' || 
          (typeof m.status === 'object' && m.status?.value === 'loaded')
        );
        if (!loadedModel) {
          console.log(`[Chat Tab] Auto-reloading previous model: ${prevModel}`);
          ctx.isGenerating = true;
          const loadRes = await fetch(_api(ctx, 'load'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: prevModel })
          });
          ctx.isGenerating = false;
          if (loadRes.ok) {
            sessionStorage.removeItem('previous_model_name');
            ctx.showReloadBanner = false;
          } else {
            console.error("[Chat Tab] Auto-reload failed on send");
          }
        }
      }
    } catch (e) {
      console.error("[Chat Tab] Auto-reload check failed", e);
      ctx.isGenerating = false;
    }
  }

  // If there's a pending image attachment, send it with the message
  if (ctx.imageAttachment && ctx.visionCapable && !ctx.imageSent) {
    base64Image = ctx.imageAttachment.base64;
    sendWithImage(ctx);
  }

  // Only proceed if there's text or an image
  if (!text && !base64Image) return;

  textarea.value = '';
  textarea.style.height = '40px';

  // Build the messages array for the API, including image data if present
  let apiMessages = [];
  
  // Add all previous messages up to but not including this one (skip our own placeholder)
  const prevCount = Math.min(ctx.messages.length - 2, ctx.messages.length);
  for (let i = 0; i < prevCount; i++) {
    const m = ctx.messages[i];
    if (m.role === 'user') {
      apiMessages.push(buildUserContent(ctx, m));
    } else if (m.role === 'tool') {
      // Tool result message — include as-is
      apiMessages.push({
        role: 'tool',
        tool_call_id: m.tool_call_id || '',
        content: m.content || ''
      });
    } else if (m.role === 'assistant' && !ctx.isGenerating) {
      // Check if this assistant message had tool calls
      if (m.tool_calls && m.tool_calls.length) {
        apiMessages.push({
          role: 'assistant',
          content: m.content || '',
          tool_calls: m.tool_calls.map(tc => ({
            id: tc.id,
            type: 'function',
            function: { name: tc.name || tc.function?.name, arguments: tc.arguments || tc.function?.arguments || '{}' }
          }))
        });
      } else if (m.content || m.thinking) {
        const contentParts = [];
        if (m.thinking) contentParts.push({ type: 'text', text: `<think>${m.thinking}</think>\n${m.content}` });
        else contentParts.push({ type: 'text', text: m.content || '' });
        apiMessages.push({ role: 'assistant', content: contentParts.length === 1 ? contentParts[0].text : contentParts });
      }
    }
  }

  // Add current user message (with image if present)
  const currentMsg = buildUserContent(ctx, { role: 'user', content: text, base64_image: base64Image });
  apiMessages.push(currentMsg);

  // Now add the messages to local history and create assistant placeholder
  ctx.messages = [...ctx.messages, { 
    role: 'user', 
    content: text,
    ...(base64Image ? { images: [base64Image] } : {})
  }];
  const assistantMessageIndex = ctx.messages.length;
  ctx.messages = [...ctx.messages, { role: 'assistant', content: '', thinking: '', isThinking: true, done: false, toolCalls: [] }];

  // Build request body — include tool definitions if enabled
  const requestBody = {
    messages: apiMessages,
    stream: true
  };
  if (ctx.toolsEnabled) {
    requestBody.tools = TOOL_DEFINITIONS;
  }

  ctx.isGenerating = true;
  try {
    const response = await fetch(_api(ctx, 'chat_completions'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
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

            // ── Handle tool_call events from backend orchestration ──
            if (parsed.type === 'tool_call') {
              const tc = parsed.tool_call;
              const updated = [...ctx.messages];
              if (updated[assistantMessageIndex]) {
                const toolCalls = updated[assistantMessageIndex].toolCalls || [];
                toolCalls.push({
                  id: tc.id,
                  name: tc.function?.name || 'unknown',
                  arguments: tc.function?.arguments || '{}',
                  status: 'running'
                });
                updated[assistantMessageIndex] = { ...updated[assistantMessageIndex], toolCalls };
                ctx.messages = updated;
              }
              continue;
            }

            if (parsed.type === 'tool_result_done') {
              const updated = [...ctx.messages];
              if (updated[assistantMessageIndex]) {
                const toolCalls = (updated[assistantMessageIndex].toolCalls || []).map(tc => ({
                  ...tc, status: 'done'
                }));
                updated[assistantMessageIndex] = { ...updated[assistantMessageIndex], toolCalls };
                ctx.messages = updated;
              }
              continue;
            }

            // ── Tool history: persist tool_call/tool messages in context ──
            if (parsed.type === 'tool_history') {
              if (parsed.messages && parsed.messages.length) {
                const updated = [...ctx.messages];
                // Insert tool messages right after the current assistant message
                const insertAt = assistantMessageIndex + 1;
                updated.splice(insertAt, 0, ...parsed.messages);
                ctx.messages = updated;

              }
              continue;
            }

            // ── Timings metadata (tokens/s) ──
            if (parsed.type === 'timings') {
              if (parsed.timings) {
                updateAssistantMeta(ctx, assistantMessageIndex, parsed.timings);
              }
              continue;
            }

            // ── Standard OpenAI / llama.cpp chat stream ──
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
              updateAssistantMessage(ctx, assistantMessageIndex, assistantText, assistantReasoning, isThinking, false);
            } else {
              const newText = deltaContent || textContent || nativeContent;
              if (newText) {
                assistantText += newText;
                // Once standard output starts, if we were thinking, complete the thinking block
                isThinking = false;
                updateAssistantMessage(ctx, assistantMessageIndex, assistantText, assistantReasoning, isThinking, false);
              }
            }

            // Extract timings metadata if available (usually at final chunk)
            const timings = parsed.timings || parsed.usage;
            if (timings) {
              updateAssistantMeta(ctx, assistantMessageIndex, timings);
            }
          } catch (e) {
            // Ignore partial or parsing errors in chunk
          }
        }
      }
    }

    // Finish generation
    updateAssistantMessage(ctx, assistantMessageIndex, assistantText, assistantReasoning, false, true);

  } catch (e) {
    updateAssistantMessage(
      ctx,
      assistantMessageIndex,
      `Error: Failed to fetch completion stream (${e.message}). Please ensure model is loaded.`,
      '',
      false,
      true
    );
  } finally {
    ctx.isGenerating = false;
    ctx.shadowRoot.querySelector('textarea')?.focus();
  }
}

export function updateAssistantMessage(ctx, index, content, thinking = '', isThinking = false, done = false) {
  const updated = [...ctx.messages];
  if (updated[index]) {
    updated[index] = { ...updated[index], content, thinking, isThinking, done };
    ctx.messages = updated;
  }
}

export function updateAssistantMeta(ctx, index, timings) {
  const updated = [...ctx.messages];
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
      ctx.messages = updated;
    }
  }
}

export async function clearConversation(ctx) {
  const confirmed = await Confirm.show('Clear entire chat history?');
  if (confirmed) {
    ctx.messages = [];
    localStorage.removeItem('chat_history');
  }
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
