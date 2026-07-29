/**
 * Spinner / progress display for Pulse CLI.
 *
 * Thin wrapper around `ora` with consistent Pulse styling
 * and environment-aware behaviour (Termux fallback).
 *
 * @module ui/spinner
 */

const ora = require('ora');
const chalk = require('chalk');

/** Check if spinners should be disabled (Termux / low-res). */
function shouldDisableSpinner() {
  return Boolean(
    process.env.TERMUX_VERSION ||
    process.env.PULSE_NO_SPINNER ||
    !process.stdout.isTTY
  );
}

/**
 * @param {string} text
 * @returns {ora.Ora}
 */
function startSpinner(text) {
  return ora({
    text: chalk.dim(text),
    spinner: shouldDisableSpinner() ? 'line' : 'dots',
    color: 'cyan',
    discardStdin: false,
  }).start();
}

/**
 * @param {ora.Ora} spinner
 * @param {string} [text]
 */
function updateSpinner(spinner, text) {
  if (spinner) spinner.text = chalk.dim(text);
}

/**
 * @param {ora.Ora} spinner
 * @param {string} [text]
 */
function succeedSpinner(spinner, text) {
  if (spinner) spinner.succeed(text ? chalk.dim(text) : undefined);
}

/**
 * @param {ora.Ora} spinner
 * @param {string} [text]
 */
function failSpinner(spinner, text) {
  if (spinner) spinner.fail(text ? chalk.red(text) : undefined);
}

/**
 * @param {ora.Ora} spinner
 * @param {string} [text]
 */
function infoSpinner(spinner, text) {
  if (spinner) spinner.info(text ? chalk.cyan(text) : undefined);
}

/**
 * Run an async function with a spinner.
 * @param {string} text - Spinner text.
 * @param {Function} fn - Async function to run.
 * @returns {Promise<any>}
 */
async function withSpinner(text, fn) {
  const spinner = startSpinner(text);
  try {
    const result = await fn(spinner);
    succeedSpinner(spinner);
    return result;
  } catch (err) {
    failSpinner(spinner, err.message || 'Failed');
    throw err;
  }
}

module.exports = {
  startSpinner, updateSpinner, succeedSpinner, failSpinner, infoSpinner, withSpinner,
};
