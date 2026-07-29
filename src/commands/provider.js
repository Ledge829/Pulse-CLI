/**
 * Provider management for Pulse CLI.
 *
 * `pulse provider` — list providers, show current, switch interactively.
 *
 * @module commands/provider
 */

const readline = require('readline');
const chalk = require('chalk');
const { loadConfig, knownProviders, providerDefaults, ConfigError } = require('../lib/config');
const { createProvider } = require('../providers/index');

// ── Provider info table ────────────────────────────────────────────────

const PROVIDER_INFO = {
  openai:     { desc: 'OpenAI / Azure / Together / Groq / any OpenAI-compatible API', needsKey: true },
  kimi:       { desc: 'Moonshot / Kimi (moonshot-v1 series)', needsKey: true },
  openrouter:  { desc: 'OpenRouter — unified access to many LLMs', needsKey: true },
  gemini:     { desc: 'Google Gemini (gemini-pro, gemini-2.0-flash, etc.)', needsKey: true },
  ollama:     { desc: 'Ollama — local models (llama3, mistral, codellama, etc.)', needsKey: false },
};

// ── Display ────────────────────────────────────────────────────────────

/**
 * Pretty-print all known providers with their status.
 * @param {string} [currentProvider]
 */
function listProviders(currentProvider) {
  console.log(chalk.bold('\n  ── Available Providers ──\n'));

  for (const [name, info] of Object.entries(PROVIDER_INFO)) {
    const isCurrent = name === currentProvider;
    const bullet = isCurrent ? chalk.green('▶') : ' ';
    const nameDisplay = isCurrent ? chalk.bold.green(name) : chalk.cyan(name);
    const keyStatus = info.needsKey ? chalk.dim('(API key required)') : chalk.dim('(no API key needed)');
    const currentTag = isCurrent ? chalk.green(' ← active') : '';

    console.log(`  ${bullet} ${nameDisplay}${currentTag}`);
    console.log(`    ${chalk.dim(info.desc)} ${keyStatus}`);
    console.log();
  }
}

// ── Interactive switching ──────────────────────────────────────────────

/**
 * Prompt the user to select a provider interactively.
 * @param {string} current
 * @returns {Promise<string>}
 */
async function promptProvider(current) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
  });

  return new Promise((resolve) => {
    console.log(chalk.dim('\n  Enter a provider name (or press Enter to keep current):\n'));
    rl.question(`  ${chalk.cyan('Provider')} [${current}]: `, (answer) => {
      rl.close();
      const trimmed = answer.trim().toLowerCase();
      if (!trimmed) {
        resolve(current);
        return;
      }
      const providers = knownProviders();
      if (providers.includes(trimmed)) {
        resolve(trimmed);
      } else {
        console.error(chalk.red(`  ✖ Unknown provider "${trimmed}". Valid: ${providers.join(', ')}`));
        resolve(current);
      }
    });
  });
}

// ── Main ───────────────────────────────────────────────────────────────

/**
 * `pulse provider` command entry point.
 *
 * @param {object} [options]
 * @param {boolean} [options.interactive=false] - Prompt for provider selection.
 */
async function providerCommand(options = {}) {
  let config;
  try {
    config = loadConfig({});
  } catch (err) {
    if (err instanceof ConfigError && err.code === 'MISSING_API_KEY') {
      config = null;
    } else if (err instanceof ConfigError) {
      config = null;
    } else {
      throw err;
    }
  }

  const current = config ? config.provider : 'openai';

  if (!options.interactive) {
    // Display mode
    listProviders(current);
    console.log(chalk.dim(`  Current provider: ${chalk.bold(current)}`));
    console.log(chalk.dim(`  Switch with: ${chalk.cyan('pulse provider --interactive')} or ${chalk.cyan('/provider <name>')} in chat`));
    console.log();
    return;
  }

  listProviders(current);
  const selected = await promptProvider(current);

  if (selected !== current) {
    console.log(chalk.green(`\n  ✓ Provider switched to ${chalk.bold(selected)}.\n`));
    console.log(chalk.dim('  Update your .env file or use `pulse configure` to set the API key.\n'));
  } else {
    console.log(chalk.dim('\n  No change.\n'));
  }
}

module.exports = { providerCommand };
