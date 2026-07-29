/**
 * Terminal UI components for Pulse CLI.
 *
 * Provides structured message rendering, status display, and
 * a polished chat interface with visual separation between
 * messages, clear role badges, and consistent formatting.
 *
 * @module ui/terminal
 */

const chalk = require('chalk');

// ── Constants ──────────────────────────────────────────────────────────

const SEPARATOR = chalk.dim('─'.repeat(Math.min(process.stdout.columns || 80, 72)));

// ── Timestamp ──────────────────────────────────────────────────────────

function timestamp() {
  const now = new Date();
  const h = String(now.getHours()).padStart(2, '0');
  const m = String(now.getMinutes()).padStart(2, '0');
  const s = String(now.getSeconds()).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

// ── Message rendering ─────────────────────────────────────────────────

/**
 * Render a chat message with structured formatting.
 *
 * @param {object} msg
 * @param {string} msg.role - 'user' | 'assistant' | 'system'
 * @param {string} msg.content
 * @param {string} [msg.model] - Model name for assistant messages
 * @returns {string}
 */
function renderMessage(msg) {
  const time = timestamp();
  const lines = msg.content.split('\n');

  // Choose badge style based on role
  let badge, badgeColor, badgeIcon;
  switch (msg.role) {
    case 'user':
      badge = chalk.green(' You ');
      badgeColor = chalk.green;
      badgeIcon = chalk.green('┃');
      break;
    case 'assistant':
      const modelTag = msg.model ? ` ${msg.model} ` : '';
      badge = chalk.cyan(` Assistant${modelTag}`);
      badgeColor = chalk.cyan;
      badgeIcon = chalk.cyan('┃');
      break;
    case 'system':
      badge = chalk.yellow(' System ');
      badgeColor = chalk.yellow;
      badgeIcon = chalk.yellow('┃');
      break;
    default:
      badge = chalk.dim(' ? ');
      badgeColor = chalk.dim;
      badgeIcon = chalk.dim('┃');
  }

  // Build the message block
  const output = [];

  // ┌─ Badge ────────────────────── time ─┐
  const width = Math.min(process.stdout.columns || 80, 72);
  const timeStr = chalk.dim(time);
  const headerContent = `${badge} ${' '.repeat(Math.max(0, width - badge.length - timeStr.length - 6))}${timeStr}`;
  output.push(`  ${chalk.dim('┌─')}${headerContent}${chalk.dim('─┐')}`);

  // Message body (indented with │)
  for (const line of lines) {
    output.push(`  ${badgeIcon} ${line || ' '}`);
  }

  // Closing border
  output.push(`  ${chalk.dim('└' + '─'.repeat(Math.min(width - 2, 50)) + '┘')}`);

  return output.join('\n');
}

/**
 * Render the chat header bar.
 *
 * @param {{ provider: string, model: string }} config
 * @param {object} [options]
 * @param {boolean} [options.multiline=false]
 * @param {number} [options.messageCount=0]
 * @returns {string}
 */
function renderHeader(config, options = {}) {
  const width = Math.min(process.stdout.columns || 80, 72);
  const multiline = options.multiline ? chalk.yellow(' [Multiline]') : '';
  const status = chalk.dim('connected');
  const provider = chalk.bold(config.provider);
  const model = chalk.dim(config.model);

  const left = ` ${chalk.cyan('Pulse')} · ${provider} · ${model}${multiline}`;
  const right = `${status} ${chalk.dim('msgs:')} ${options.messageCount || 0}`;
  const padding = Math.max(1, width - left.length - right.length);

  return chalk.dim('─'.repeat(width)) +
    `\n  ${left}${' '.repeat(padding)}${right}` +
    `\n${chalk.dim('─'.repeat(width))}`;
}

/**
 * Render the footer/status bar.
 *
 * @param {object} [options]
 * @param {boolean} [options.multiline=false]
 * @returns {string}
 */
function renderFooter(options = {}) {
  const width = Math.min(process.stdout.columns || 80, 72);
  const left = chalk.dim('/help · /provider · /model · /clear · /exit');
  const right = options.multiline
    ? chalk.yellow(' multiline: empty Enter to send')
    : chalk.dim(' Enter to send · Alt+Enter newline');

  const padding = Math.max(1, width - left.length - right.length);

  return chalk.dim('─'.repeat(width)) +
    `\n  ${left}${' '.repeat(padding)}${right}` +
    `\n${chalk.dim('─'.repeat(width))}`;
}

/**
 * Render a system status message (e.g., "Connected", "Error").
 *
 * @param {string} text
 * @param {'info'|'warn'|'error'|'success'} level
 * @returns {string}
 */
function renderStatus(text, level = 'info') {
  const icon = level === 'error' ? chalk.red('✖')
    : level === 'warn' ? chalk.yellow('⚠')
      : level === 'success' ? chalk.green('✓')
        : chalk.cyan('●');
  return `  ${icon} ${chalk.dim(text)}`;
}

/**
 * Render a loading/spinner line (replaced by ora normally, but useful for
 * status updates before streaming starts).
 *
 * @param {string} text
 * @returns {string}
 */
function renderLoading(text) {
  return `  ${chalk.cyan('○')} ${chalk.dim(text)}`;
}

module.exports = {
  renderMessage,
  renderHeader,
  renderFooter,
  renderStatus,
  renderLoading,
  SEPARATOR,
};
