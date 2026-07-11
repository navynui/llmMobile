"""Tool definitions in OpenAI function-calling JSON Schema format."""

TOOL_DEFINITIONS = [
    {
        "type": "function",
        "function": {
            "name": "web_search",
            "description": (
                "Search the internet for current information. "
                "Use this when you need up-to-date data, news, facts, or anything "
                "beyond your training cutoff."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "The search query string"
                    },
                    "num_results": {
                        "type": "integer",
                        "description": "Number of search results to return (max 10)",
                        "default": 5
                    }
                },
                "required": ["query"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "write_file",
            "description": (
                "Write content to a file in the sandbox workspace. "
                "Creates the file if it doesn't exist. Use 'overwrite' mode to "
                "replace existing content, or 'append' to add to the end."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": (
                            "Relative path from the sandbox root. "
                            "Example: 'output/notes.md' or 'data/report.csv'. "
                            "Do NOT use absolute paths or '../'."
                        )
                    },
                    "content": {
                        "type": "string",
                        "description": "The full content to write to the file"
                    },
                    "mode": {
                        "type": "string",
                        "enum": ["overwrite", "append"],
                        "description": "'overwrite' to replace the file, 'append' to add to the end",
                        "default": "overwrite"
                    }
                },
                "required": ["path", "content"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "read_file",
            "description": "Read the contents of an existing file in the sandbox workspace.",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "Relative path from the sandbox root. Example: 'data/notes.md'"
                    }
                },
                "required": ["path"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "edit_file",
            "description": (
                "Edit an existing file by replacing the first occurrence of "
                "old_string with new_string. Use this for targeted edits like "
                "fixing a typo, updating a number, or changing a line."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "Relative path from the sandbox root"
                    },
                    "old_string": {
                        "type": "string",
                        "description": "The exact text to find (first occurrence will be replaced)"
                    },
                    "new_string": {
                        "type": "string",
                        "description": "The replacement text"
                    }
                },
                "required": ["path", "old_string", "new_string"]
            }
        }
    }
]
