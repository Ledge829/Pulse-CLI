/**
 * Welcome banner and identity for Pulse CLI.
 *
 * Professional startup display with terminal-art branding.
 *
 * @module ui/banner
 */

const chalk = require('chalk');
const os = require('os');

// ── Terminal detection ─────────────────────────────────────────────────

function isTermux() {
  return Boolean(
    process.env.TERMUX_VERSION ||
    process.env.PREFIX === '/data/data/com.termux/files/usr'
  );
}

function isLowResource() {
  try {
    return os.totalmem() < 2 * 1024 ** 3;
  } catch { return false; }
}

// ── Branding ───────────────────────────────────────────────────────────

const TAGLINE = 'BYOK AI Coding Assistant';

/**
 * Render the Pulse CLI logo as a colored string.
 * @returns {string}
 */
function renderLogo() {
  const lines = [
    ` ${chalk.cyan('♡')}  ${chalk.bold.white('Pulse CLI')}  ${chalk.dim('v1.0.0')}`,
    `    ${chalk.dim(TAGLINE)}`,
  ];
  return lines.join('\n');
}

/**
 * Render the startup banner with config details.
 * @param {{ provider: string, model: string, baseUrl: string }} [config]
 */
function showWelcome(config) {
  const termux = isTermux();
  const lowRes = isLowResource();

  console.log();
  console.log(`  ${chalk.cyan('♡')}  ${chalk.bold.white('Pulse CLI')}  ${chalk.dim('v1.0.0')}`);
  console.log(`     ${chalk.dim(TAGLINE)}`);
  console.log();

  if (config) {
    console.log(`  ${chalk.dim('▸')} ${chalk.bold('Provider')}   ${config.provider}`);
    console.log(`  ${chalk.dim('▸')} ${chalk.bold('Model')}      ${config.model}`);
    console.log(`  ${chalk.dim('▸')} ${chalk.bold('Endpoint')}  ${chalk.dim(config.baseUrl)}`);
    console.log();
  }

  // Environment hints
  if (termux) {
    console.log(`  ${chalk.yellow('⚡')} ${chalk.dim('Termux mode — touch-friendly UI active')}`);
  }
  if (lowRes) {
    console.log(`  ${chalk.yellow('🔋')} ${chalk.dim('Low-resource mode — battery-conscious')}`);
  }
  if (termux || lowRes) console.log();

  console.log(`  ${chalk.dim('Type')} ${chalk.cyan('/help')} ${chalk.dim('for commands or')} ${chalk.cyan('/exit')} ${chalk.dim('to quit.')}`);
  console.log();
}

/**
 * Minimal one-line startup summary.
 * @param {{ provider: string, model: string }} config
 * @returns {string}
 */
function startupLine(config) {
  const pkg = require('../../package.json');
  return `Pulse CLI v${pkg.version} · ${config.provider} · ${config.model}`;
}

/**
 * Render a section header for command output.
 * @param {string} title
 * @returns {string}
 */
function sectionHeader(title) {
  const width = Math.min(process.stdout.columns || 80, 60);
  const line = chalk.dim('─'.repeat(width));
  return `\n  ${chalk.bold(title)}\n  ${line}\n`;
}

module.exports = { showWelcome, startupLine, sectionHeader, renderLogo, isTermux, isLowResource };
