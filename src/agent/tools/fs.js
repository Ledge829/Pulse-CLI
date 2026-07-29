/**
 * Filesystem tools for the Pulse CLI agent.
 *
 * Provides safe file read, write (with diff preview), search, and
 * directory listing capabilities with path-safety guards.
 *
 * @module agent/tools/fs
 */

const fs = require('fs');
const path = require('path');

// ── Safety ─────────────────────────────────────────────────────────────

/** Prevent writes outside the project directory by default. */
function resolveSafe(baseDir, target) {
  const resolved = path.resolve(baseDir, target);
  if (!resolved.startsWith(baseDir)) {
    throw new Error(`Path "${target}" is outside the project directory`);
  }
  return resolved;
}

// ── Tool definitions ───────────────────────────────────────────────────

/**
 * Register filesystem tools into a registry.
 * @param {import('./registry').ToolRegistry} registry
 * @param {{ cwd: string }} context
 */
function registerFSTools(registry, context = { cwd: process.cwd() }) {
  registry.registerAll([
    // ── file_read ─────────────────────────────────────────────────────
    {
      name: 'file_read',
      description: 'Read the contents of a file. Useful for understanding code, configs, and docs.',
      parameters: [
        { name: 'path', type: 'string', description: 'Path to the file (relative to project root)', required: true },
        { name: 'offset', type: 'number', description: 'Line number to start from (1-indexed)', required: false },
        { name: 'limit', type: 'number', description: 'Max lines to read', required: false },
      ],
      handler: async (params) => {
        const filePath = resolveSafe(context.cwd, params.path);
        if (!fs.existsSync(filePath)) {
          return { status: 'error', error: `File not found: ${params.path}` };
        }
        const stat = fs.statSync(filePath);
        if (stat.isDirectory()) {
          return { status: 'error', error: `"${params.path}" is a directory, not a file` };
        }

        const content = fs.readFileSync(filePath, 'utf-8');
        const lines = content.split('\n');
        const offset = (params.offset || 1) - 1;
        const limit = params.limit || lines.length;

        const selected = lines.slice(offset, offset + limit);
        return {
          status: 'ok',
          path: params.path,
          totalLines: lines.length,
          startLine: offset + 1,
          content: selected.join('\n'),
          truncated: offset + limit < lines.length,
        };
      },
    },

    // ── file_write ───────────────────────────────────────────────────
    {
      name: 'file_write',
      description: 'Write content to a file. Creates parent directories if needed. Shows a diff preview.',
      parameters: [
        { name: 'path', type: 'string', description: 'Path to write to (relative to project root)', required: true },
        { name: 'content', type: 'string', description: 'Full file content to write', required: true },
        { name: 'description', type: 'string', description: 'Brief description of the change', required: false },
      ],
      dangerous: true,
      handler: async (params) => {
        const filePath = resolveSafe(context.cwd, params.path);
        const dir = path.dirname(filePath);

        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }

        // Generate diff preview (simple line-based)
        let diffPreview = null;
        if (fs.existsSync(filePath)) {
          const existing = fs.readFileSync(filePath, 'utf-8');
          const newLines = params.content.split('\n');
          const oldLines = existing.split('\n');
          diffPreview = {
            added: newLines.length - oldLines.length,
            removed: oldLines.length - newLines.length,
            oldSize: existing.length,
            newSize: params.content.length,
          };
        }

        fs.writeFileSync(filePath, params.content, 'utf-8');

        return {
          status: 'ok',
          path: params.path,
          action: diffPreview ? 'modified' : 'created',
          diff: diffPreview,
          size: params.content.length,
        };
      },
    },

    // ── file_search ──────────────────────────────────────────────────
    {
      name: 'file_search',
      description: 'Search for a pattern in files using simple substring or regex matching. Fast, no external deps.',
      parameters: [
        { name: 'pattern', type: 'string', description: 'Text or regex pattern to search for', required: true },
        { name: 'glob', type: 'string', description: 'File pattern (e.g. "*.js", "src/**")', required: false },
        { name: 'maxResults', type: 'number', description: 'Max results to return', required: false },
      ],
      handler: async (params) => {
        const maxResults = params.maxResults || 20;
        const results = [];
        const regex = new RegExp(params.pattern, 'i');

        function walk(dir) {
          let entries;
          try {
            entries = fs.readdirSync(dir, { withFileTypes: true });
          } catch { return; }

          for (const entry of entries) {
            if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
            const fullPath = path.join(dir, entry.name);

            if (entry.isDirectory()) {
              if (results.length < maxResults) walk(fullPath);
            } else if (entry.isFile()) {
              if (results.length >= maxResults) break;
              try {
                const content = fs.readFileSync(fullPath, 'utf-8');
                const lines = content.split('\n');
                for (let i = 0; i < lines.length; i++) {
                  if (regex.test(lines[i])) {
                    const relative = path.relative(context.cwd, fullPath);
                    results.push({
                      file: relative,
                      line: i + 1,
                      match: lines[i].trim().slice(0, 150),
                    });
                    if (results.length >= maxResults) break;
                  }
                }
              } catch { /* binary or unreadable */ }
            }
          }
        }

        walk(context.cwd);

        return {
          status: 'ok',
          pattern: params.pattern,
          results,
          total: results.length,
          truncated: results.length >= maxResults,
        };
      },
    },

    // ── file_tree ────────────────────────────────────────────────────
    {
      name: 'file_tree',
      description: 'List the project file tree. Shows directory structure up to a configurable depth.',
      parameters: [
        { name: 'depth', type: 'number', description: 'Directory depth to show (default 2)', required: false },
        { name: 'dir', type: 'string', description: 'Subdirectory to start from (default root)', required: false },
      ],
      handler: async (params) => {
        const maxDepth = params.depth || 3;
        const startDir = params.dir
          ? resolveSafe(context.cwd, params.dir)
          : context.cwd;

        const tree = [];

        function walk(dir, depth) {
          if (depth > maxDepth) return;
          let entries;
          try {
            entries = fs.readdirSync(dir, { withFileTypes: true });
          } catch { return; }

          for (const entry of entries) {
            if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
            const fullPath = path.join(dir, entry.name);
            const relative = path.relative(context.cwd, fullPath);
            const indent = '  '.repeat(depth);
            const prefix = entry.isDirectory() ? '📁' : '📄';
            tree.push(`${indent}${prefix} ${relative}`);

            if (entry.isDirectory()) {
              walk(fullPath, depth + 1);
            }
          }
        }

        walk(startDir, 0);

        return {
          status: 'ok',
          root: path.relative(context.cwd, startDir) || '.',
          tree,
          total: tree.length,
        };
      },
    },
  ]);
}

module.exports = { registerFSTools };
