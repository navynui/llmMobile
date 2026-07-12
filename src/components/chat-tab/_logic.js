/**
 * chat-tab/_logic.js — Barrel re-export file.
 *
 * Re-exports all public functions from the split sub-modules so that
 * chat-tab.js and _templates.js can continue to `import * as logic from './chat-tab/_logic.js'`
 * without any import-site changes.
 */

export { TOOL_DEFINITIONS, TOOL_ICONS } from './_tools.js';

export {
  parseThinkingAndContent,
  scrollToBottom,
  formatMath,
  formatTableCell,
  parseMarkdownTable,
  formatMessage,
  extractPrompts,
  promptGenerateImage,
} from './_formatting.js';

export {
  checkModelStatus,
  reloadModel,
  checkVisionSupport,
  handleImageUpload,
  buildUserContent,
  sendWithImage,
  handleTextareaInput,
  handleKeyDown,
  sendMessage,
  updateAssistantMessage,
  updateAssistantMeta,
  clearConversation,
} from './_api.js';
