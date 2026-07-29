/**
 * Plugin and skills architecture for Pulse CLI.
 *
 * Plugins extend Pulse with new tools, commands, and integrations.
 * Skills add specialized domain knowledge and workflow expertise.
 *
 * Architecture:
 *   - Plugins live in ~/.pulse/plugins/<name>/
 *   - Skills live in ~/.pulse/skills/<name>/
 *   - Each plugin has a pulse-plugin.json manifest
 *   - Each skill has a pulse-skill.json manifest
 *   - Built-in plugins are in src/plugins/builtin/
 *
 * @module plugins/index
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const chalk = require('chalk');

// ── Directories ────────────────────────────────────────────────────────

function pluginsDir() {
  const dir = path.join(os.homedir(), '.pulse', 'plugins');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function skillsDir() {
  const dir = path.join(os.homedir(), '.pulse', 'skills');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// ── Plugin manifest ────────────────────────────────────────────────────

/**
 * @typedef {object} PluginManifest
 * @property {string} name - Plugin name
 * @property {string} version - Semantic version
 * @property {string} description - What the plugin does
 * @property {string} [main] - Entry point relative to plugin dir
 * @property {string[]} [tools] - Tool names this plugin provides
 * @property {string[]} [dependencies] - npm dependency names
 * @property {string} [author]
 * @property {string} [license]
 */

/**
 * @typedef {object} SkillManifest
 * @property {string} name - Skill name
 * @property {string} version
 * @property {string} description
 * @property {string} [systemPrompt] - Additional system prompt content
 * @property {string[]} [capabilities] - What this skill enables
 * @property {string[]} [filePatterns] - File patterns this skill targets
 */

// ── Plugin manager ─────────────────────────────────────────────────────

class PluginManager {
  /**
   * Load all installed plugins.
   * @returns {Promise<Array<{manifest: PluginManifest, dir: string}>>}
   */
  async listPlugins() {
    const dir = pluginsDir();
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const plugins = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const manifestPath = path.join(dir, entry.name, 'pulse-plugin.json');
      if (!fs.existsSync(manifestPath)) continue;

      try {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
        plugins.push({ manifest, dir: path.join(dir, entry.name) });
      } catch {
        // Invalid manifest — skip
      }
    }

    return plugins;
  }

  /**
   * Install a plugin from a directory or npm package reference.
   * @param {string} source - Path or package name
   * @returns {Promise<{success: boolean, name?: string, error?: string}>}
   */
  async install(source) {
    const pluginsDir = pluginsDir();
    const name = path.basename(source).replace(/\.git$/, '');

    // If it's a local directory with a manifest
    if (fs.existsSync(source)) {
      const manifestPath = path.join(source, 'pulse-plugin.json');
      if (fs.existsSync(manifestPath)) {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
        const targetDir = path.join(pluginsDir, manifest.name);

        // Copy plugin directory
        await fs.promises.cp(source, targetDir, { recursive: true });
        return { success: true, name: manifest.name };
      }
    }

    // TODO: Support npm/git install
    // For now, return a helpful message
    return {
      success: false,
      error: `Plugin installation from "${source}" is not yet supported.\n` +
        `  Place plugins in ${pluginsDir} with a pulse-plugin.json manifest.\n` +
        `  See documentation for the plugin format.`,
    };
  }

  /**
   * Remove an installed plugin.
   * @param {string} name
   * @returns {Promise<boolean>}
   */
  async remove(name) {
    const dir = path.join(pluginsDir(), name);
    if (!fs.existsSync(dir)) return false;
    await fs.promises.rm(dir, { recursive: true });
    return true;
  }

  /**
   * Activate a plugin by loading its tools into the registry.
   * @param {import('../agent/tools/registry').ToolRegistry} registry
   * @param {object} context
   */
  async activatePlugin(name, registry, context) {
    const plugins = await this.listPlugins();
    const plugin = plugins.find((p) => p.manifest.name === name);
    if (!plugin) throw new Error(`Plugin "${name}" not found`);

    try {
      const mainPath = path.join(plugin.dir, plugin.manifest.main || 'index.js');
      if (fs.existsSync(mainPath)) {
        const mod = require(mainPath);
        if (typeof mod.register === 'function') {
          mod.register(registry, context);
        }
      }
    } catch (err) {
      throw new Error(`Failed to activate plugin "${name}": ${err.message}`);
    }
  }
}

// ── Skill manager ──────────────────────────────────────────────────────

class SkillManager {
  /**
   * List all installed skills.
   * @returns {Array<{manifest: SkillManifest, dir: string}>}
   */
  listSkills() {
    const dir = skillsDir();
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return [];
    }

    const skills = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const manifestPath = path.join(dir, entry.name, 'pulse-skill.json');
      if (!fs.existsSync(manifestPath)) continue;

      try {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
        skills.push({ manifest, dir: path.join(dir, entry.name) });
      } catch { /* skip */ }
    }

    return skills;
  }

  /**
   * Install a skill from a local directory.
   * @param {string} source
   * @returns {Promise<{success: boolean, name?: string, error?: string}>}
   */
  async install(source) {
    const skillsDir = skillsDir();
    if (fs.existsSync(source)) {
      const manifestPath = path.join(source, 'pulse-skill.json');
      if (fs.existsSync(manifestPath)) {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
        const targetDir = path.join(skillsDir, manifest.name);
        await fs.promises.cp(source, targetDir, { recursive: true });
        return { success: true, name: manifest.name };
      }
    }
    return { success: false, error: 'Invalid skill source' };
  }

  /**
   * Get combined system prompt additions from active skills.
   * @param {string[]} activeSkillNames
   * @returns {string}
   */
  getSystemPrompt(activeSkillNames = []) {
    const skills = this.listSkills();
    const prompts = [];

    for (const skill of skills) {
      if (activeSkillNames.includes(skill.manifest.name) && skill.manifest.systemPrompt) {
        prompts.push(skill.manifest.systemPrompt);
      }
    }

    return prompts.join('\n\n');
  }
}

// ── Plugin command (for the CLI) ───────────────────────────────────────

/**
 * `pulse plugin search/list/install/remove` command handler.
 * @param {string} action - search | list | install | remove
 * @param {string[]} args
 */
async function pluginCommand(action, args) {
  const manager = new PluginManager();

  switch (action) {
    case 'list':
    case 'ls': {
      const plugins = await manager.listPlugins();
      console.log(chalk.bold('\n  Installed Plugins\n'));
      if (plugins.length === 0) {
        console.log(`  ${chalk.dim('No plugins installed.')}`);
        console.log(`  ${chalk.dim('Plugins go in')} ${chalk.cyan('~/.pulse/plugins/')}`);
      } else {
        for (const p of plugins) {
          console.log(`  ${chalk.cyan('•')} ${chalk.bold(p.manifest.name)} ${chalk.dim('v' + p.manifest.version)}`);
          console.log(`    ${chalk.dim(p.manifest.description)}`);
        }
      }
      console.log();
      break;
    }

    case 'install':
    case 'add': {
      const source = args[0];
      if (!source) {
        console.log(chalk.red('  ✖ Specify a plugin path or name.\n'));
        return;
      }
      const result = await manager.install(source);
      if (result.success) {
        console.log(chalk.green(`\n  ✓ Installed plugin: ${result.name}\n`));
      } else {
        console.log(chalk.red(`  ✖ ${result.error}\n`));
      }
      break;
    }

    case 'remove':
    case 'rm': {
      const name = args[0];
      if (!name) {
        console.log(chalk.red('  ✖ Specify a plugin name.\n'));
        return;
      }
      const removed = await manager.remove(name);
      if (removed) {
        console.log(chalk.dim(`\n  Removed plugin: ${name}\n`));
      } else {
        console.log(chalk.red(`  ✖ Plugin "${name}" not found.\n`));
      }
      break;
    }

    default:
      console.log(chalk.cyan('\n  Plugin commands:'));
      console.log(`    ${chalk.bold('pulse plugin list')}    ${chalk.dim('List installed plugins')}`);
      console.log(`    ${chalk.bold('pulse plugin install <path>')}  ${chalk.dim('Install a plugin')}`);
      console.log(`    ${chalk.bold('pulse plugin remove <name>')}  ${chalk.dim('Remove a plugin')}`);
      console.log(`    ${chalk.bold('pulse skill list')}    ${chalk.dim('List installed skills')}`);
      console.log();
  }
}

/**
 * Skill command handler.
 * @param {string} action
 * @param {string[]} args
 */
async function skillCommand(action, args) {
  const manager = new SkillManager();

  switch (action) {
    case 'list':
    case 'ls': {
      const skills = manager.listSkills();
      console.log(chalk.bold('\n  Installed Skills\n'));
      if (skills.length === 0) {
        console.log(`  ${chalk.dim('No skills installed.')}`);
        console.log(`  ${chalk.dim('Skills go in')} ${chalk.cyan('~/.pulse/skills/')}`);
      } else {
        for (const s of skills) {
          console.log(`  ${chalk.cyan('•')} ${chalk.bold(s.manifest.name)} ${chalk.dim('v' + s.manifest.version)}`);
          console.log(`    ${chalk.dim(s.manifest.description)}`);
          if (s.manifest.capabilities) {
            console.log(`    ${chalk.dim('Capabilities:')} ${s.manifest.capabilities.join(', ')}`);
          }
        }
      }
      console.log();
      break;
    }

    default:
      console.log(chalk.cyan('\n  Skill commands:'));
      console.log(`    ${chalk.bold('pulse skill list')}    ${chalk.dim('List installed skills')}`);
      console.log();
  }
}

module.exports = { PluginManager, SkillManager, pluginCommand, skillCommand };
