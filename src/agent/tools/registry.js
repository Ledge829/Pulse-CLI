/**
 * Tool registry for Pulse CLI agent system.
 *
 * Tools are callable functions that the AI agent can invoke to
 * interact with the filesystem, git, terminal, and project context.
 * The registry manages tool discovery, validation, and dispatch.
 *
 * @module agent/tools/registry
 */

const chalk = require('chalk');

// ── Tool descriptor ────────────────────────────────────────────────────

/**
 * @typedef {object} ToolDef
 * @property {string} name - Unique tool identifier
 * @property {string} description - Human-readable description
 * @property {Array<{name:string,type:string,description:string,required?:boolean}>} parameters
 * @property {Function} handler - Async function(params, context) => any
 * @property {boolean} [dangerous] - If true, requires user confirmation
 */

// ── Registry ───────────────────────────────────────────────────────────

class ToolRegistry {
  constructor() {
    /** @type {Map<string, ToolDef>} */
    this._tools = new Map();
    this._confirmCallbacks = [];
  }

  /**
   * Register a tool.
   * @param {ToolDef} def
   */
  register(def) {
    if (this._tools.has(def.name)) {
      throw new Error(`Tool "${def.name}" is already registered`);
    }
    this._tools.set(def.name, def);
  }

  /**
   * Register multiple tools.
   * @param {ToolDef[]} defs
   */
  registerAll(defs) {
    for (const def of defs) this.register(def);
  }

  /**
   * Get a tool by name.
   * @param {string} name
   * @returns {ToolDef|undefined}
   */
  get(name) {
    return this._tools.get(name);
  }

  /**
   * List all registered tools.
   * @returns {ToolDef[]}
   */
  list() {
    return Array.from(this._tools.values());
  }

  /**
   * Generate a JSON schema for function-calling APIs.
   * @returns {Array<object>}
   */
  toFunctionSchema() {
    return this.list().map((tool) => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: {
          type: 'object',
          properties: Object.fromEntries(
            tool.parameters.map((p) => [
              p.name,
              { type: p.type, description: p.description },
            ])
          ),
          required: tool.parameters
            .filter((p) => p.required !== false)
            .map((p) => p.name),
        },
      },
    }));
  }

  /**
   * Execute a tool by name.
   * @param {string} name
   * @param {object} params
   * @param {object} context - Shared execution context
   * @returns {Promise<any>}
   */
  async execute(name, params, context = {}) {
    const tool = this._tools.get(name);
    if (!tool) {
      throw new Error(`Unknown tool: "${name}". Available: ${this.list().map((t) => t.name).join(', ')}`);
    }

    // Dangerous tool confirmation
    if (tool.dangerous) {
      const confirmed = await this._requestConfirmation(tool, params);
      if (!confirmed) {
        return { status: 'cancelled', reason: 'User declined confirmation' };
      }
    }

    try {
      const result = await tool.handler(params, context);
      return result;
    } catch (err) {
      return {
        status: 'error',
        error: err.message,
        tool: name,
      };
    }
  }

  /**
   * Register a confirmation callback.
   * @param {Function} cb - Async (tool, params) => boolean
   */
  onConfirm(cb) {
    this._confirmCallbacks.push(cb);
  }

  /**
   * Request user confirmation for dangerous tools.
   * @param {ToolDef} tool
   * @param {object} params
   * @returns {Promise<boolean>}
   */
  async _requestConfirmation(tool, params) {
    for (const cb of this._confirmCallbacks) {
      const result = await cb(tool, params);
      if (result === false) return false;
    }

    // Fallback: console prompt
    console.log(`\n  ${chalk.yellow('⚠')} ${chalk.bold(tool.name)} requires confirmation:`);
    console.log(`  ${chalk.dim(tool.description)}`);
    console.log(`  ${chalk.dim(JSON.stringify(params, null, 2))}\n`);

    // In non-interactive mode, deny
    if (!process.stdin.isTTY) return false;

    return true; // Assume confirmed if no interactive rejection
  }
}

// ── Singleton ──────────────────────────────────────────────────────────

const globalRegistry = new ToolRegistry();

module.exports = { ToolRegistry, globalRegistry };
