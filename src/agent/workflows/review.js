/**
 * `pulse review` — Review code quality, bugs, security, and architecture.
 *
 * Analyses the project to identify:
 *   - Code quality issues
 *   - Potential bugs and security vulnerabilities
 *   - Architectural concerns
 *   - Improvement suggestions
 *
 * @module agent/workflows/review
 */

const chalk = require('chalk');
const { getAgent } = require('../index');
const { startSpinner, succeedSpinner, failSpinner } = require('../../ui/spinner');

/**
 * Run the code review workflow.
 * @param {string} [target] - Optional specific file or scope to review
 * @param {object} [options]
 */
async function reviewWorkflow(target, options = {}) {
  const cwd = options.cwd || process.cwd();
  const { registry } = getAgent({ cwd });

  console.log(chalk.bold('\n  Pulse Review\n'));

  if (target) {
    console.log(`  ${chalk.dim('Reviewing:')} ${target}\n`);
  } else {
    console.log(`  ${chalk.dim('Reviewing:')} Full project\n`);
  }

  // Phase 1: Health scan
  const spinner1 = startSpinner('  Analysing project health…');
  const health = await registry.execute('pulse_health', {}, { cwd });
  if (health.status === 'ok') {
    succeedSpinner(spinner1, 'Health check complete');
    console.log(`  ${chalk.cyan('•')} ${chalk.dim('Issues found:')} ${health.health.issues.length}`);
    console.log(`  ${chalk.cyan('•')} ${chalk.dim('Score:')} ${health.health.score}/100`);

    if (health.health.issues.length > 0) {
      console.log();
      console.log(`  ${chalk.bold('Issues:')}`);
      for (const issue of health.health.issues.slice(0, 10)) {
        const color = issue.severity === 'critical' ? chalk.red
          : issue.severity === 'high' ? chalk.yellow
            : chalk.dim;
        console.log(`    ${color('•')} ${color(issue.message)}`);
      }
    }
  } else {
    failSpinner(spinner1, 'Health check failed');
  }

  // Phase 2: Architecture review
  console.log();
  const spinner2 = startSpinner('  Reviewing architecture…');
  const arch = await registry.execute('pulse_map', { detail: 'normal' }, { cwd });
  if (arch.status === 'ok') {
    succeedSpinner(spinner2, 'Architecture review complete');
    console.log(`  ${chalk.cyan('•')} ${chalk.dim('Patterns:')} ${arch.architecture.patterns.join(', ') || 'none identified'}`);
  } else {
    failSpinner(spinner2, 'Architecture review failed');
  }

  console.log();
  console.log(`  ${chalk.bold('Review Summary')}`);
  console.log(`  ${chalk.dim('─'.repeat(40))}`);
  console.log();
  console.log(`  ${chalk.dim('Health score:')}  ${health.status === 'ok' ? health.health.score + '/100' : '—'}`);
  console.log(`  ${chalk.dim('Issues:')}       ${health.status === 'ok' ? health.health.issues.length : '—'}`);
  console.log(`  ${chalk.dim('Severity:')}`);
  if (health.status === 'ok') {
    console.log(`    ${chalk.red('critical:')} ${health.health.summary.critical}`);
    console.log(`    ${chalk.yellow('high:')}     ${health.health.summary.high}`);
    console.log(`    ${chalk.dim('medium:')}   ${health.health.summary.medium}`);
    console.log(`    ${chalk.dim('low:')}      ${health.health.summary.low}`);
  }
  console.log();
}

module.exports = { reviewWorkflow };
