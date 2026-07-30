/**
 * Provider management for Pulse CLI
 *
 * This file handles the `pulse provider` command. It lets you:
 *   - List all available providers
 *   - Add a new provider configuration
 *   - Remove a provider
 *   - Test a provider connection
 *   - Switch between providers
 *
 * Usage:
 *   pulse provider          — List all providers
 *   pulse provider -i       — Switch providers interactively
 *   pulse provider --add    — Add a new provider
 *   pulse provider --remove <name>  — Remove a provider
 *   pulse provider --test <name>    — Test a provider connection
 */

const readline = require('readline');
const chalk = require('chalk');
const { loadConfig, knownProviders, providerDefaults, ConfigError } = require('../lib/config');
const { createProvider } = require('../providers/index');
const { ProviderStore } = require('../lib/config-store');
const { withSpinner } = require('../ui/spinner');

// ──────────────────────────────────────────────────────────────────────
// PROVIDER INFORMATION
// ──────────────────────────────────────────────────────────────────────
// This tells us about each provider: what it is and whether it needs
// an API key.

const PROVIDER_INFO = {
  openai: {
    description: 'OpenAI (GPT-4, GPT-4o) + any OpenAI-compatible API like Together AI, Groq, LocalAI',
    needsApiKey: true
  },
  kimi: {
    description: 'Moonshot / Kimi (moonshot-v1 series models with long context windows)',
    needsApiKey: true
  },
  openrouter: {
    description: 'OpenRouter — unified API for 200+ models including Claude, Gemini, Llama',
    needsApiKey: true
  },
  gemini: {
    description: 'Google Gemini (gemini-1.5-flash, gemini-1.5-pro, gemini-2.0-flash)',
    needsApiKey: true
  },
  ollama: {
    description: 'Ollama — run models locally (no API key needed, runs on your machine)',
    needsApiKey: false
  }
};

// ──────────────────────────────────────────────────────────────────────
// DISPLAY: SHOW ALL PROVIDERS
// ──────────────────────────────────────────────────────────────────────

function showProviderTable(options) {
  // Get the list of provider names that have been configured
  const configuredProviders = options.configured || [];
  const activeProvider = options.active;

  console.log(chalk.bold('\n  Providers\n'));
  console.log(chalk.dim('  ──────────────────────────────────────────────────────'));

  // Loop through each provider and show its status
  for (const [providerName, providerInfo] of Object.entries(PROVIDER_INFO)) {
    const isActive = providerName === activeProvider;
    const isConfigured = configuredProviders.includes(providerName);

    // Choose the right symbols and colors
    const bulletPoint = isActive ? chalk.green('▶') : ' ';
    const displayName = isActive ? chalk.bold.green(providerName) : chalk.cyan(providerName);

    // Show the status tag
    let statusTag;
    if (isActive) {
      statusTag = chalk.green(' active');
    } else if (isConfigured) {
      statusTag = chalk.dim(' configured');
    } else if (!providerInfo.needsApiKey) {
      statusTag = chalk.dim(' (no key needed — just switch to it)');
    } else {
      statusTag = chalk.dim(' not configured');
    }

    // Print the provider line
    console.log(`  ${bulletPoint} ${displayName}${statusTag}`);
    console.log(`    ${chalk.dim(providerInfo.description)}`);
  }

  console.log(chalk.dim('  ──────────────────────────────────────────────────────'));
  console.log();
}

// ──────────────────────────────────────────────────────────────────────
// ACTION: ADD A PROVIDER
// ──────────────────────────────────────────────────────────────────────
// Prompts the user to add a new provider with API key and model settings.

async function addProvider() {
  // Set up a readline interface for user input
  const readlineInterface = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true
  });

  try {
    console.log(chalk.bold('\n  Add a New Provider\n'));

    // Show the list of available providers
    const providers = knownProviders();
    for (let i = 0; i < providers.length; i++) {
      console.log(`  ${chalk.cyan(String(i + 1))}. ${chalk.bold(providers[i])}`);
    }
    console.log();

    // Ask the user to pick a provider by number
    const numberAnswer = await new Promise(function(resolve) {
      readlineInterface.question('  Number: ', resolve);
    });

    const selectedIndex = parseInt(numberAnswer.trim(), 10) - 1;

    // Validate the selection
    if (selectedIndex < 0 || selectedIndex >= providers.length) {
      console.log(chalk.red('  ✖ Invalid selection\n'));
      return;
    }

    const selectedProvider = providers[selectedIndex];
    const defaults = providerDefaults(selectedProvider);

    // Ask for API key (Ollama doesn't need one)
    let apiKey = '';
    if (selectedProvider !== 'ollama') {
      apiKey = await new Promise(function(resolve) {
        readlineInterface.question('  API Key: ', resolve);
      });
    }

    // Ask for model (with default shown)
    const model = await new Promise(function(resolve) {
      const defaultModel = defaults ? defaults.defaultModel : 'default';
      readlineInterface.question(`  Model [${defaultModel}]: `, resolve);
    });

    // Ask for base URL (with default shown)
    const baseUrl = await new Promise(function(resolve) {
      const defaultUrl = defaults ? defaults.baseUrl : 'https://';
      readlineInterface.question(`  Base URL [${defaultUrl}]: `, resolve);
    });

    // Save the provider to the config store
    const store = new ProviderStore();
    store.setProvider(selectedProvider, {
      apiKey: apiKey.trim(),
      model: model.trim() || (defaults ? defaults.defaultModel : ''),
      baseUrl: (baseUrl.trim() || (defaults ? defaults.baseUrl : '')).replace(/\/+$/, ''),
      addedAt: new Date().toISOString()
    });

    console.log(chalk.green(`\n  ✓ Added "${selectedProvider}"\n`));

  } finally {
    readlineInterface.close();
  }
}

// ──────────────────────────────────────────────────────────────────────
// ACTION: REMOVE A PROVIDER
// ──────────────────────────────────────────────────────────────────────

function removeProvider(providerName) {
  const store = new ProviderStore();
  const wasRemoved = store.removeProvider(providerName);

  if (wasRemoved) {
    console.log(chalk.dim(`\n  Removed provider: ${providerName}\n`));
  } else {
    console.log(chalk.red(`  ✖ Provider "${providerName}" not found\n`));
  }
}

// ──────────────────────────────────────────────────────────────────────
// ACTION: TEST A PROVIDER CONNECTION
// ──────────────────────────────────────────────────────────────────────
// Tries to connect to the provider and list its models to verify
// the API key and endpoint are correct.

async function testProvider(providerName) {
  const store = new ProviderStore();
  const providerConfig = store.getProvider(providerName);

  // Check if the provider has been configured
  if (!providerConfig) {
    console.log(chalk.red(`  ✖ Provider "${providerName}" not configured. Add it first.\n`));
    return;
  }

  // Try to connect to the provider
  try {
    // Build a config object from the stored provider info
    const { loadConfig } = require('../lib/config');
    const configuration = loadConfig({
      provider: providerName,
      apiKey: providerConfig.apiKey || '',
      model: providerConfig.model || (providerDefaults(providerName) || {}).defaultModel,
      baseUrl: providerConfig.baseUrl || (providerDefaults(providerName) || {}).baseUrl
    });

    // Create the provider and try to list models (proves connectivity)
    const provider = createProvider(configuration);

    let connectionSuccessful = false;

    await withSpinner('  Testing connection…', async function() {
      const models = await provider.listModels();
      connectionSuccessful = models && models.length > 0;
      if (!connectionSuccessful) {
        throw new Error('No models returned from provider');
      }
    });

    console.log(`  ${chalk.green('✓')} ${chalk.dim('Connection successful')}\n`);

  } catch (error) {
    console.log(`  ${chalk.red('✖')} ${chalk.dim('Connection failed:')} ${error.message}\n`);
  }
}

// ──────────────────────────────────────────────────────────────────────
// ACTION: SWITCH TO A PROVIDER
// ──────────────────────────────────────────────────────────────────────

function switchToProvider(providerName) {
  const store = new ProviderStore();
  const providerConfig = store.getProvider(providerName);

  // Check if the provider has been configured
  if (!providerConfig) {
    console.log(chalk.red(`  ✖ Provider "${providerName}" not configured. Add it first.\n`));
    return;
  }

  // Switch to it
  store.setActive(providerName);
  console.log(chalk.green(`  ✓ Switched to ${providerName}\n`));
}

// ──────────────────────────────────────────────────────────────────────
// INTERACTIVE PROVIDER SWITCHING
// ──────────────────────────────────────────────────────────────────────

async function promptForProvider(currentProvider) {
  const readlineInterface = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true
  });

  return new Promise(function(resolve) {
    console.log(chalk.dim('\n  Enter a provider name (or press Enter to keep current):\n'));

    readlineInterface.question(
      `  ${chalk.cyan('Provider')} [${currentProvider}]: `,
      function(userAnswer) {
        readlineInterface.close();

        const trimmedAnswer = userAnswer.trim().toLowerCase();

        // If the user pressed Enter without typing anything, keep current
        if (!trimmedAnswer) {
          resolve(currentProvider);
          return;
        }

        // Check if the provider name is valid
        const validProviders = knownProviders();
        if (validProviders.includes(trimmedAnswer)) {
          resolve(trimmedAnswer);
        } else {
          console.error(chalk.red(`  ✖ Unknown provider: "${trimmedAnswer}"`));
          console.error(chalk.dim(`    Valid options: ${validProviders.join(', ')}`));
          resolve(currentProvider); // Keep current on error
        }
      }
    );
  });
}

// ──────────────────────────────────────────────────────────────────────
// MAIN PROVIDER COMMAND
// ──────────────────────────────────────────────────────────────────────
// This is called from src/index.js when the user types `pulse provider`

async function providerCommand(options) {
  const store = new ProviderStore();

  // Get all configured providers and the active one
  const allProviders = store.list();
  const configuredNames = allProviders.map(function(provider) {
    return provider.name;
  });
  const activeProvider = store.getActive() || 'openai';

  // ── Decide what to do based on the options ──────────────────────

  // pulse provider --add
  if (options.add) {
    await addProvider();
    return;
  }

  // pulse provider --remove <name>
  if (options.remove) {
    removeProvider(options.remove);
    return;
  }

  // pulse provider --test <name>
  if (options.test) {
    await testProvider(options.test);
    return;
  }

  // pulse provider -i (interactive mode)
  if (options.interactive) {
    showProviderTable({ active: activeProvider, configured: configuredNames });
    const selectedProvider = await promptForProvider(activeProvider);

    if (selectedProvider && selectedProvider !== activeProvider) {
      switchToProvider(selectedProvider);
    } else {
      console.log(chalk.dim('  No change.\n'));
    }
    return;
  }

  // ── Default: just show the provider list ─────────────────────────
  showProviderTable({ active: activeProvider, configured: configuredNames });

  console.log(chalk.dim(`  Active provider: ${chalk.bold(activeProvider)}`));
  console.log();
  console.log(chalk.dim(`  ${chalk.cyan('pulse provider -i')}          Interactive provider switching`));
  console.log(chalk.dim(`  ${chalk.cyan('pulse provider --add')}       Add a new provider`));
  console.log(chalk.dim(`  ${chalk.cyan('pulse provider --test <name>')}   Test a provider connection`));
  console.log(chalk.dim(`  ${chalk.cyan('/provider <name>')}          Switch provider while in chat`));
  console.log();
}

module.exports = { providerCommand };
