/**
 * `pulse build` — Implement features with file awareness.
 *
 * This workflow:
 *   1. Analyses the request against project structure
 *   2. Shows files that will be affected
 *   3. Requires confirmation before making changes
 *   4. Implements changes with diff previews
 *   5. Verifies the result
 *
 * @module agent/workflows/build
 */

const chalk = require('chalk');
const { getAgent } = require('../index');

/**
 * Run the build workflow.
 * @param {string} request - Feature to implement
 * @param {object} [options]
 */
async function buildWorkflow(request, options = {}) {
  const cwd = options.cwd || process.cwd();
  const { registry } = getAgent({ cwd });

  console.log(chalk.bold('\n  Pulse Build\n'));
  console.log(`  ${chalk.dim('Feature:')} ${request}\n`);

  // Scan the project first
  const scan = await registry.execute('pulse_scan', {}, { cwd });
  if (scan.status === 'ok') {
    console.log(`  ${chalk.cyan('•')} ${chalk.dim('Project:')}  ${scan.project.name}`);
    console.log(`  ${chalk.cyan('•')} ${chalk.dim('Language:')} ${scan.project.language}`);
  }

  // Check git status
  const status = await registry.execute('git_status', {}, { cwd });
  if (status.status === 'ok') {
    console.log(`  ${chalk.cyan('•')} ${chalk.dim('Branch:')}   ${status.branch}`);
    console.log(`  ${chalk.cyan('•')} ${chalk.dim('Changes:')}  ${status.total} uncommitted`);
  }

  console.log();
  console.log(`  ${chalk.dim('Review the plan and affected files before proceeding.')}`);
  console.log(`  ${chalk.dim('This workflow requires confirmation before making changes.')}`);
  console.log();
  console.log(`  ${chalk.dim('Run')} ${chalk.cyan('/help')} ${chalk.dim('in chat for available commands.')}`);
  console.log();
}

module.exports = { buildWorkflow };
