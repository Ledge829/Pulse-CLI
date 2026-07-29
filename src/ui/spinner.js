/**
 * Spinner / progress display for Pulse CLI.
 *
 * Thin wrapper around `ora` with consistent Pulse styling.
 *
 * @module ui/spinner
 */

const ora = require('ora');
const chalk = require('chalk');

/**
 * @param {string} text
 * @returns {ora.Ora}
 */
function startSpinner(text) {
  return ora({
    text: chalk.dim(text),
    spinner: 'dots',
    color: 'cyan',
  }).start();
}

/**
 * @param {ora.Ora} spinner
 * @param {string} text
 */
function updateSpinner(spinner, text) {
  spinner.text = chalk.dim(text);
}

/**
 * @param {ora.Ora} spinner
 * @param {string} [text]
 */
function succeedSpinner(spinner, text) {
  spinner.succeed(text ? chalk.dim(text) : undefined);
}

/**
 * @param {ora.Ora} spinner
 * @param {string} [text]
 */
function failSpinner(spinner, text) {
  spinner.fail(text ? chalk.red(text) : undefined);
}

module.exports = { startSpinner, updateSpinner, succeedSpinner, failSpinner };
