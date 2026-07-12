/** Tool definitions mirroring services/tools/registry.py */
export const TOOL_DEFINITIONS = [
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
export const TOOL_ICONS = {
  web_search: '🔍',
  write_file: '📝',
  read_file: '📖',
  edit_file: '✏️',
};
