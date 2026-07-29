/**
 * Pulse Agent — the AI agent system for Pulse CLI.
 *
 * The agent system provides:
 *   - Tool registry and execution
 *   - Pulse-specific intelligence tools (scan, context, map, memory, etc.)
 *   - Integration with LLM providers for structured tool calling
 *   - Workflow orchestration (plan, build, review, doctor, ship)
 *
 * This module initialises all tools and exports the shared agent context.
 *
 * @module agent/index
 */

const { ToolRegistry, globalRegistry } = require('./tools/registry');
const { registerFSTools } = require('./tools/fs');
const { registerGitTools } = require('./tools/git');
const { registerPulseTools } = require('./tools/pulse');
const { registerTermTools } = require('./tools/term');

// ── Agent context ──────────────────────────────────────────────────────

/**
 * Create and initialise the agent with all built-in tools.
 *
 * @param {object} [options]
 * @param {string} [options.cwd=process.cwd()] - Working directory
 * @param {boolean} [options.includeGit=true] - Include Git tools
 * @param {boolean} [options.includeTerminal=true] - Include terminal tools
 * @returns {{ registry: ToolRegistry, context: object }}
 */
function createAgent(options = {}) {
  const cwd = options.cwd || process.cwd();
  const context = { cwd };
  const registry = new ToolRegistry();

  // Register all built-in tool groups
  registerFSTools(registry, context);
  registerPulseTools(registry, context);

  if (options.includeGit !== false) {
    registerGitTools(registry, context);
  }

  if (options.includeTerminal !== false) {
    registerTermTools(registry, context);
  }

  return { registry, context };
}

// ── Global agent (singleton for the chat session) ──────────────────────

let _globalAgent = null;

/**
 * Get or create the global agent instance.
 * @param {object} [options]
 * @returns {{ registry: ToolRegistry, context: object }}
 */
function getAgent(options = {}) {
  if (!_globalAgent) {
    _globalAgent = createAgent(options);
  }
  return _globalAgent;
}

/**
 * Reset the global agent (useful for testing or context switching).
 */
function resetAgent() {
  _globalAgent = null;
}

// ── Tool call parsing ─────────────────────────────────────────────────

/**
 * Parse a structured tool call from an LLM response.
 *
 * Supports two formats:
 *   1. XML: <tool name="file_read"><param name="path">index.js</param></tool>
 *   2. JSON: {"name": "file_read", "params": {"path": "index.js"}}
 *
 * @param {string} llmOutput - The raw LLM response text.
 * @returns {Array<{name:string, params:object}>}
 */
function parseToolCalls(llmOutput) {
  const calls = [];

  // Try JSON format first (for function-calling APIs)
  try {
    const parsed = JSON.parse(llmOutput);
    if (parsed.name && parsed.params) {
      calls.push({ name: parsed.name, params: parsed.params });
      return calls;
    }
    if (Array.isArray(parsed)) {
      for (const call of parsed) {
        if (call.name && call.params) {
          calls.push({ name: call.name, params: call.params });
        }
      }
      if (calls.length > 0) return calls;
    }
  } catch { /* not JSON */ }

  // Try XML format
  const toolRegex = /<tool\s+name="([^"]+)">([\s\S]*?)<\/tool>/g;
  let match;
  while ((match = toolRegex.exec(llmOutput)) !== null) {
    const name = match[1];
    const body = match[2];
    const params = {};
    const paramRegex = /<param\s+name="([^"]+)">([\s\S]*?)<\/param>/g;
    let pmatch;
    while ((pmatch = paramRegex.exec(body)) !== null) {
      params[pmatch[1]] = pmatch[2].trim();
    }
    calls.push({ name, params });
  }

  return calls;
}

module.exports = {
  createAgent,
  getAgent,
  resetAgent,
  parseToolCalls,
  globalRegistry,
};
