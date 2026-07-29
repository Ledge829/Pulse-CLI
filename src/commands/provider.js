/**
 * Provider management for Pulse CLI.
 *
 * `pulse provider` — list, add, remove, test, and switch providers.
 *
 * @module commands/provider
 */

const readline = require('readline');
const chalk = require('chalk');
const { loadConfig, knownProviders, providerDefaults, ConfigError } = require('../lib/config');
const { createProvider } = require('../providers/index');
const { ProviderStore } = require('../lib/config-store');
const { withSpinner } = require('../ui/spinner');

// ── Provider info table ────────────────────────────────────────────────

const PROVIDER_INFO = {
  openai:     { desc: 'OpenAI / Azure / Together / Groq / any OpenAI-compatible API', needsKey: true },
  kimi:       { desc: 'Moonshot / Kimi (moonshot-v1 series)', needsKey: true },
  openrouter: { desc: 'OpenRouter — unified access to 200+ models', needsKey: true },
  gemini:     { desc: 'Google Gemini (gemini-1.5-flash, gemini-1.5-pro, gemini-2.0-flash)', needsKey: true },
  ollama:     { desc: 'Ollama — local models (no API key needed)', needsKey: false },
};

// ── Display ────────────────────────────────────────────────────────────

/**
 * Pretty-print all known providers with status.
 * @param {object} [opts]
 * @param {string} [opts.active]
 * @param {string[]} [opts.configured]
 */
function listProvidersTable(opts = {}) {
  const configured = new Set(opts.configured || []);
  const active = opts.active;

  console.log(chalk.bold('\n  Providers\n'));
  console.log(chalk.dim('  ──────────────────────────────────────────────────────'));

  for (const [name, info] of Object.entries(PROVIDER_INFO)) {
    const isActive = name === active;
    const isConfigured = configured.has(name);
    const bullet = isActive ? chalk.green('▶') : ' ';
    const nameDisplay = isActive ? chalk.bold.green(name) : chalk.cyan(name);
    const statusTag = isActive
      ? chalk.green(' active')
      : isConfigured
        ? chalk.dim(' configured')
        : chalk.dim(' not configured');
    const keyStatus = info.needsKey ? '' : chalk.dim(' (no key needed)');

    console.log(`  ${bullet} ${nameDisplay}${statusTag}${keyStatus}`);
    console.log(`    ${chalk.dim(info.desc)}`);
  }

  console.log(chalk.dim('  ──────────────────────────────────────────────────────'));
  console.log();
}

// ── Provider CRUD ─────────────────────────────────────────────────────

async function addProvider() {
  const rl = readline.createInterface({
    input: process.stdin, output: process.stdout, terminal: true,
  });

  try {
    console.log(chalk.bold('\n  Add Provider\n'));

    const providers = knownProviders();
    providers.forEach((p, i) => {
      console.log(`  ${chalk.cyan(String(i + 1))}. ${chalk.bold(p)}`);
    });
    console.log();

    const idxAnswer = await new Promise((r) => rl.question('  Number: ', r));
    const idx = parseInt(idxAnswer.trim(), 10) - 1;
    if (idx < 0 || idx >= providers.length) {
      console.log(chalk.red('  ✖ Invalid selection\n'));
      return;
    }
    const provider = providers[idx];

    const defaults = providerDefaults(provider);
    const apiKey = provider === 'ollama'
      ? ''
      : await new Promise((r) => rl.question('  API Key: ', r));
    const model = await new Promise((r) => rl.question(`  Model [${defaults.defaultModel}]: `, r));
    const baseUrl = await new Promise((r) => rl.question(`  Base URL [${defaults.baseUrl}]: `, r));

    const store = new ProviderStore();
    store.setProvider(provider, {
      apiKey: apiKey.trim(),
      model: model.trim() || defaults.defaultModel,
      baseUrl: (baseUrl.trim() || defaults.baseUrl).replace(/\/+$/, ''),
      addedAt: new Date().toISOString(),
    });

    console.log(chalk.green(`\n  ✓ Added "${provider}"\n`));
  } finally {
    rl.close();
  }
}

async function removeProvider(name) {
  const store = new ProviderStore();
  const result = store.removeProvider(name);
  if (result) {
    console.log(chalk.dim(`\n  Removed provider: ${name}\n`));
  } else {
    console.log(chalk.red(`  ✖ Provider "${name}" not found\n`));
  }
}

async function testProvider(name) {
  const store = new ProviderStore();
  const config = store.getProvider(name);
  if (!config) {
    console.log(chalk.red(`  ✖ Provider "${name}" not configured\n`));
    return;
  }

  try {
    const { loadConfig } = require('../lib/config');
    const cfg = loadConfig({
      provider: name,
      apiKey: config.apiKey || '',
      model: config.model || (providerDefaults(name) || {}).defaultModel,
      baseUrl: config.baseUrl || (providerDefaults(name) || {}).baseUrl,
    });
    const prov = createProvider(cfg);

    let success = false;
    await withSpinner(`Testing ${name}…`, async () => {
      const models = await prov.listModels();
      success = models && models.length > 0;
      if (!success) throw new Error('No models available');
    });

    console.log(`  ${chalk.green('✓')} ${chalk.dim('Connection successful')}\n`);
  } catch (err) {
    console.log(`  ${chalk.red('✖')} ${chalk.dim('Connection failed:')} ${err.message}\n`);
  }
}

async function switchProvider(name) {
  const store = new ProviderStore();
  const config = store.getProvider(name);
  if (!config) {
    console.log(chalk.red(`  ✖ Provider "${name}" not configured. Add it first.\n`));
    return;
  }
  store.setActive(name);
  console.log(chalk.green(`  ✓ Switched to ${name}\n`));
}

// ── Interactive switching ──────────────────────────────────────────────

async function promptProvider(current) {
  const rl = readline.createInterface({
    input: process.stdin, output: process.stdout, terminal: true,
  });

  return new Promise((resolve) => {
    console.log(chalk.dim('\n  Enter provider name (Enter to keep current):\n'));
    rl.question(`  ${chalk.cyan('Provider')} [${current}]: `, (answer) => {
      rl.close();
      const trimmed = answer.trim().toLowerCase();
      if (!trimmed) return resolve(current);
      const providers = knownProviders();
      if (providers.includes(trimmed)) return resolve(trimmed);
      console.error(chalk.red(`  ✖ Unknown. Valid: ${providers.join(', ')}`));
      resolve(current);
    });
  });
}

// ── Main ───────────────────────────────────────────────────────────────

async function providerCommand(options = {}) {
  const store = new ProviderStore();
  const allProviders = store.list();
  const configuredNames = allProviders.map((p) => p.name);
  const activeProvider = store.getActive() || 'openai';

  if (options.add) {
    await addProvider();
    return;
  }

  if (options.remove) {
    await removeProvider(options.remove);
    return;
  }

  if (options.test) {
    await testProvider(options.test);
    return;
  }

  if (options.interactive || options.i) {
    listProvidersTable({ active: activeProvider, configured: configuredNames });
    const selected = await promptProvider(activeProvider);
    if (selected && selected !== activeProvider) {
      await switchProvider(selected);
    } else {
      console.log(chalk.dim('  No change.\n'));
    }
    return;
  }

  // Default: show provider list
  listProvidersTable({ active: activeProvider, configured: configuredNames });
  console.log(chalk.dim(`  Active: ${chalk.bold(activeProvider)}`));
  console.log();
  console.log(chalk.dim(`  ${chalk.cyan('pulse provider -i')}    Interactive switch`));
  console.log(chalk.dim(`  ${chalk.cyan('pulse provider --add')}  Add a provider`));
  console.log(chalk.dim(`  ${chalk.cyan('pulse provider --test <name>')}  Test connection`));
  console.log(chalk.dim(`  ${chalk.cyan('/provider <name>')}   Switch in chat`));
  console.log();
}

module.exports = { providerCommand };
