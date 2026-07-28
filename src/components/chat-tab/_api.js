import { Confirm } from '../../components/_confirm.js';
import { TOOL_DEFINITIONS } from './_tools.js';

function _api(ctx, endpoint) {
  const apis = {
    primary: {
      chat_completions: '/api/chat/completions',
      models: '/api/llm/models',
      vision: '/models/vision-capabilities',
      load: '/api/llm/models/load',
      ini: '/models',
    },
    mini: {
      chat_completions: '/api/chat-mini/completions',
      models: '/api/llm-mini/models',
      vision: '/models-mini/vision-capabilities',
      load: '/api/llm-mini/models/load',
      ini: '/models-mini',
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

export async function fetchAvailableModels(ctx) {
  const cacheKey = 'chat_models_' + (ctx.chatServer || 'primary');
  
  // Serve cached list immediately (only changes on server restart)
  const cached = localStorage.getItem(cacheKey);
  if (cached) {
    try { ctx.availableModels = JSON.parse(cached); } catch (e) { /* ignore */ }
  }

  try {
    const resp = await fetch(_api(ctx, 'ini'));
    if (!resp.ok) return;
    const data = await resp.json();
    const models = data.models || [];
    ctx.availableModels = models;
    localStorage.setItem(cacheKey, JSON.stringify(models));
  } catch (e) {
    console.warn('Failed to fetch available models:', e);
  }
}

export async function selectModel(ctx, filename) {
  if (!filename || ctx.loadingModel) return;
  ctx.loadingModel = true;
  ctx.loadedModelName = ''; // clear old model so glow can start

  try {
    const res = await fetch(_api(ctx, 'load'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: filename })
    });

    if (!res.ok) {
      const err = await res.text();
      console.error('Failed to load model:', err);
      return;
    }

    // Server accepted the load. Now poll /models until the model shows as loaded.
    // Do NOT kill the glow until we can confirm the green dot will appear.
    const normId = filename.replace('.gguf', '');
    for (let attempt = 0; attempt < 30; attempt++) {
      await new Promise(r => setTimeout(r, 600));
      try {
        const resp = await fetch(_api(ctx, 'models'));
        if (!resp.ok) continue;
        const data = await resp.json();
        const model = data.data?.find(m => {
          const mId = (m.id || '').replace('.gguf', '');
          return mId === normId;
        });
        if (model) {
          const isLoaded = model.status === 'loaded' ||
            (typeof model.status === 'object' && model.status?.value === 'loaded');
          if (isLoaded) {
            ctx.loadedModelName = model.id; // green dot appears now
            ctx.requestUpdate();
            await checkVisionSupport(ctx);
            return; // success — finally will set loadingModel = false, glow stops
          }
        }
      } catch (e) { /* poll err */ }
    }
    // Timed out waiting for model to appear as loaded
    console.warn('Model load confirmed by API but never appeared as loaded in /models');
  } catch (e) {
    console.error('Error loading model:', e);
  } finally {
    ctx.loadingModel = false;
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
