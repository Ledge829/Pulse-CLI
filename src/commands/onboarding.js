/**
 * First-run onboarding wizard for Pulse CLI.
 *
 * Guides new users through:
 *   - Welcome and BYOK explanation
 *   - Provider selection
 *   - API key entry
 *   - Connection test
 *   - Quick-start tips
 *
 * @module commands/onboarding
 */

const readline = require('readline');
const chalk = require('chalk');
const { PreferencesStore, ProviderStore } = require('../lib/config-store');
const { knownProviders, providerDefaults } = require('../lib/config');
const { createProvider } = require('../providers/index');
const { withSpinner } = require('../ui/spinner');

// ── Helpers ────────────────────────────────────────────────────────────

function ask(rl, query) {
  return new Promise((resolve) => rl.question(query, resolve));
}

function clearAbove() {
  process.stdout.write('\x1B[1A\x1B[2K');
}

// ── Onboarding banner ──────────────────────────────────────────────────

async function showOnboardingBanner() {
  console.log();
  console.log(`  ${chalk.cyan('♡')}  ${chalk.bold.white('Welcome to Pulse CLI')}`);
  console.log();
  console.log(`  ${chalk.dim('Pulse CLI is a')} ${chalk.bold('Bring Your Own Key (BYOK)')} ${chalk.dim('AI coding assistant.')}`);
  console.log();
  console.log(`  ${chalk.dim('You choose:')}`);
  console.log(`    ${chalk.cyan('•')} ${chalk.dim('Which AI provider to use')}`);
  console.log(`    ${chalk.cyan('•')} ${chalk.dim('Your own API key (we never see it)')}`);
  console.log(`    ${chalk.cyan('•')} ${chalk.dim('Which model to chat with')}`);
  console.log();
  console.log(`  ${chalk.dim('Pulse CLI connects to your chosen provider.')}`);
  console.log(`  ${chalk.dim('Your API key stays on your machine — stored in')} ${chalk.bold('~/.pulse/')}`);
  console.log();
  console.log(`  ${chalk.yellow('Let\'s get you set up.')}`);
  console.log();
}

// ── Provider selection ─────────────────────────────────────────────────

async function selectProvider(rl) {
  const providers = knownProviders();
  console.log(`  ${chalk.bold('Select a provider:')}\n`);

  const descriptions = {
    openai: 'OpenAI (GPT-4, GPT-4o) + any OpenAI-compatible API',
    kimi: 'Moonshot / Kimi (moonshot-v1 long-context models)',
    openrouter: 'OpenRouter — unified API for 200+ models',
    gemini: 'Google Gemini (gemini-1.5-flash, gemini-1.5-pro, gemini-2.0-flash)',
    ollama: 'Ollama — local models (Llama 3, Mistral, CodeLlama)',
  };

  providers.forEach((p, i) => {
    const active = chalk.green('→ ');
    const inactive = '  ';
    console.log(`  ${i === 0 ? active : inactive}${chalk.cyan.bold(String(i + 1))}. ${chalk.bold(p)}`);
    console.log(`     ${chalk.dim(descriptions[p] || '')}`);
    console.log();
  });

  while (true) {
    const answer = await ask(rl, `  ${chalk.cyan('Choose')} [1-${providers.length}]: `);
    const idx = parseInt(answer.trim(), 10) - 1;
    if (idx >= 0 && idx < providers.length) {
      clearAbove();
      return providers[idx];
    }
    console.log(`  ${chalk.red('Please enter a number')}`);
  }
}

// ── API key entry ──────────────────────────────────────────────────────

async function enterApiKey(rl, provider) {
  if (provider === 'ollama') {
    console.log(`  ${chalk.dim('Ollama runs locally — no API key required.')}\n`);
    return '';
  }

  const defaults = providerDefaults(provider);
  console.log(`  ${chalk.bold('Enter your API key:')}\n`);
  console.log(`  ${chalk.dim('Your key is stored in ~/.pulse/ and never sent anywhere except to')}`);
  console.log(`  ${chalk.dim('the provider you choose.')}\n`);

  // Show key entry hint
  if (provider === 'openai') console.log(`  ${chalk.dim('  Hint: OpenAI keys start with')} ${chalk.cyan('sk-')}\n`);
  if (provider === 'kimi') console.log(`  ${chalk.dim('  Hint: Moonshot keys start with')} ${chalk.cyan('sk-')}\n`);
  if (provider === 'openrouter') console.log(`  ${chalk.dim('  Hint: OpenRouter keys start with')} ${chalk.cyan('sk-or-')}\n`);
  if (provider === 'gemini') console.log(`  ${chalk.dim('  Hint: Gemini keys start with')} ${chalk.cyan('AIza')}\n`);

  const key = await ask(rl, `  ${chalk.cyan('API Key')}: `);
  clearAbove();
  return key.trim();
}

// ── Model selection ────────────────────────────────────────────────────

async function selectModel(rl, provider) {
  const defaults = providerDefaults(provider);
  if (!defaults) return '';

  const defaultModel = defaults.defaultModel;
  const answer = await ask(rl, `  ${chalk.cyan('Model')} [${defaultModel}]: `);
  clearAbove();
  return answer.trim() || defaultModel;
}

// ── Connection test ────────────────────────────────────────────────────

async function testConnection(provider, apiKey, model) {
  if (provider === 'ollama') {
    console.log(`  ${chalk.green('✓')} ${chalk.dim('Ollama (local) — skip connection test')}\n`);
    return true;
  }

  try {
    const { loadConfig } = require('../lib/config');
    const cfg = loadConfig({
      provider,
      apiKey,
      model,
      baseUrl: providerDefaults(provider).baseUrl,
    });
    const prov = createProvider(cfg);

    await withSpinner('  Testing connection…', async () => {
      // Use a simple model list fetch as a connectivity test
      const models = await prov.listModels();
      if (!models || models.length === 0) throw new Error('No models returned');
    });

    console.log(`  ${chalk.green('✓')} ${chalk.dim('Connection successful!')}\n`);
    return true;
  } catch (err) {
    console.log(`  ${chalk.yellow('⚠')} ${chalk.dim('Connection test failed:')} ${err.message}`);
    console.log(`  ${chalk.dim('  You can continue setup and fix the connection later.')}\n`);
    return false;
  }
}

// ── Save configuration ─────────────────────────────────────────────────

function saveConfig(provider, apiKey, model, baseUrl) {
  const store = new ProviderStore();
  store.setProvider(provider, {
    apiKey,
    model,
    baseUrl: baseUrl || (providerDefaults(provider) || {}).baseUrl || '',
    addedAt: new Date().toISOString(),
  });
  store.setActive(provider);

  // Also save .env for compatibility
  const envPath = require('path').join(require('os').homedir(), '.pulse', '.env');
  const fs = require('fs');
  const dir = require('path').dirname(envPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const envLines = [
    '# Pulse CLI Configuration',
    `# Generated by pulse configure on ${new Date().toISOString()}`,
    '',
    `PROVIDER=${provider}`,
    `API_KEY=${apiKey}`,
    `MODEL=${model}`,
    `BASE_URL=${baseUrl || (providerDefaults(provider) || {}).baseUrl || ''}`,
    '',
  ];
  fs.writeFileSync(envPath, envLines.join('\n'), 'utf-8');
}

// ── Tips display ───────────────────────────────────────────────────────

function showTips() {
  console.log(`  ${chalk.bold('Quick start tips:')}\n`);
  console.log(`  ${chalk.cyan('/help')}       ${chalk.dim('Show all slash commands')}`);
  console.log(`  ${chalk.cyan('/model')}      ${chalk.dim('Switch models')}`);
  console.log(`  ${chalk.cyan('/provider')}   ${chalk.dim('Switch providers')}`);
  console.log(`  ${chalk.cyan('/clear')}      ${chalk.dim('Clear screen')}`);
  console.log(`  ${chalk.cyan('pulse provider -i')}  ${chalk.dim('Switch provider from terminal')}`);
  console.log(`  ${chalk.cyan('pulse configure')}    ${chalk.dim('Re-run this setup')}`);
  console.log();
}

// ── Main onboarding flow ───────────────────────────────────────────────

async function runOnboarding() {
  await showOnboardingBanner();

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
  });

  try {
    const provider = await selectProvider(rl);
    const apiKey = await enterApiKey(rl, provider);
    const model = await selectModel(rl, provider);
    const defaults = providerDefaults(provider);

    console.log(`  ${chalk.dim('Summary:')}`);
    console.log(`    ${chalk.dim('Provider:')}  ${chalk.bold(provider)}`);
    console.log(`    ${chalk.dim('Model:')}     ${chalk.bold(model)}`);
    if (apiKey) console.log(`    ${chalk.dim('API Key:')}  ${chalk.bold(apiKey.slice(0, 8) + '…')}`);
    console.log();

    const ok = await ask(rl, `  ${chalk.cyan('Save configuration?')} [Y/n]: `);
    if (ok.trim().toLowerCase() === 'n') {
      console.log(`\n  ${chalk.yellow('Setup cancelled. Run')} ${chalk.cyan('pulse configure')} ${chalk.yellow('when ready.')}\n`);
      return;
    }

    saveConfig(provider, apiKey, model, defaults ? defaults.baseUrl : '');
    await testConnection(provider, apiKey, model);

    console.log(`  ${chalk.green('✓')} ${chalk.bold('Pulse CLI is ready!')}\n`);
    showTips();
  } finally {
    rl.close();
  }
}

module.exports = { runOnboarding, showOnboardingBanner };
