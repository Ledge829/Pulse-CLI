/**
 * Configuration commands for Pulse CLI.
 *
 * `pulse configure` — full setup wizard (delegates to onboarding)
 * `pulse login`     — quick API key update for the active provider
 *
 * @module commands/configure
 */

const readline = require('readline');
const fs = require('fs');
const path = require('path');
const os = require('os');
const chalk = require('chalk');
const { ProviderStore } = require('../lib/config-store');
const { runOnboarding } = require('./onboarding');

// ── Config paths ───────────────────────────────────────────────────────

function envPath() {
  return path.join(os.homedir(), '.pulse', '.env');
}

// ── Main ───────────────────────────────────────────────────────────────

/**
 * `pulse configure` — full setup wizard.
 * Delegates to the onboarding flow so setup is always consistent.
 */
async function configureCommand() {
  await runOnboarding();
}

/**
 * `pulse login` — quick API key setup for the active provider.
 */
async function loginCommand() {
  const store = new ProviderStore();
  const active = store.getActive() || 'openai';
  const config = store.getProvider(active) || {};

  console.log(chalk.bold('\n  Login\n'));
  console.log(chalk.dim(`  Provider: ${chalk.bold(active)}\n`));

  const rl = readline.createInterface({
    input: process.stdin, output: process.stdout, terminal: true,
  });

  try {
    const apiKey = await new Promise((r) => rl.question('  API Key: ', r));
    if (!apiKey.trim()) {
      console.log(chalk.dim('\n  No key entered.\n'));
      return;
    }

    // Update providers.json
    store.setProvider(active, {
      ...config,
      apiKey: apiKey.trim(),
    });

    // Update .env
    const dir = path.join(os.homedir(), '.pulse');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    let envContent = '';
    try {
      envContent = fs.readFileSync(envPath(), 'utf-8');
    } catch { /* new file */ }

    if (envContent.includes('API_KEY=')) {
      envContent = envContent.replace(/^API_KEY=.*$/m, `API_KEY=${apiKey.trim()}`);
    } else {
      envContent += `\nAPI_KEY=${apiKey.trim()}\n`;
    }
    fs.writeFileSync(envPath(), envContent, 'utf-8');

    console.log(chalk.green(`\n  ✓ API key saved for ${active}\n`));
  } finally {
    rl.close();
  }
}

module.exports = { configureCommand, loginCommand };
