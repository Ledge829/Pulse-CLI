/**
 * Welcome banner and identity for Pulse CLI.
 *
 * @module ui/banner
 */

const chalk = require('chalk');

const LOGO = `
  ╭────────────────────────────────────╮
  │  ♥ Pulse CLI  ${chalk.dim('v1.0.0').padEnd(25)}│
  │  ${chalk.bold('BYOK AI Coding Assistant')}${'        '.slice(0, 8)}│
  │  ${chalk.dim('Fast · Modular · Provider Agnostic')} │
  ╰────────────────────────────────────╯
`;

/**
 * Print the welcome banner with provider info.
 * @param {{ provider: string, model: string, baseUrl: string }} config
 */
function showWelcome(config) {
  console.log(LOGO);
  console.log();
  console.log(`  ${chalk.cyan('▸ Provider:')}  ${chalk.bold(config.provider)}`);
  console.log(`  ${chalk.cyan('▸ Model:')}     ${chalk.bold(config.model)}`);
  console.log(`  ${chalk.cyan('▸ Endpoint:')}  ${chalk.dim(config.baseUrl)}`);
  console.log();
  console.log(chalk.dim('  Type /help for available commands.'));
  console.log();
}

/**
 * One-line startup summary for non-interactive use.
 * @param {{ provider: string, model: string }} config
 * @returns {string}
 */
function startupLine(config) {
  const version = require('../../package.json').version;
  return `Pulse CLI v${version} · ${config.provider} · ${config.model}`;
}

module.exports = { showWelcome, startupLine };
