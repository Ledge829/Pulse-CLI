/**
 * `pulse doctor` — Diagnose system, provider, and project health.
 *
 * Checks:
 *   - System: Node.js version, platform, memory, terminal
 *   - Provider: Connection status, API key presence
 *   - Project: Health score, issues, dependencies
 *
 * @module agent/workflows/doctor
 */

const os = require('os');
const chalk = require('chalk');
const { getAgent } = require('../index');
const { ProviderStore } = require('../../lib/config-store');
const { startSpinner, succeedSpinner, failSpinner } = require('../../ui/spinner');

/**
 * Run the diagnostic workflow.
 * @param {object} [options]
 */
async function doctorWorkflow(options = {}) {
  const cwd = options.cwd || process.cwd();

  console.log(chalk.bold('\n  Pulse Doctor\n'));

  // ── System diagnostics ────────────────────────────────────────────
  console.log(`  ${chalk.bold('System')}`);
  console.log(`  ${chalk.dim('─'.repeat(40))}`);

  const system = {
    nodeVersion: process.versions.node,
    platform: process.platform,
    arch: process.arch,
    memory: os.totalmem(),
    hostname: os.hostname(),
    isTermux: Boolean(process.env.TERMUX_VERSION || process.env.PREFIX?.includes('termux')),
    isTTY: process.stdin.isTTY,
    columns: process.stdout.columns,
  };

  console.log(`  ${chalk.cyan('•')} ${chalk.dim('Node.js:')} ${system.nodeVersion}`);
  console.log(`  ${chalk.cyan('•')} ${chalk.dim('Platform:')} ${system.platform} (${system.arch})`);
  console.log(`  ${chalk.cyan('•')} ${chalk.dim('Memory:')} ${(system.memory / 1024 / 1024 / 1024).toFixed(1)}GB`);
  console.log(`  ${chalk.cyan('•')} ${chalk.dim('Terminal:')} ${system.columns} cols, ${system.isTTY ? 'interactive' : 'piped'}`);
  if (system.isTermux) console.log(`  ${chalk.cyan('•')} ${chalk.dim('Termux:')} ${chalk.green('detected')}`);
  console.log();

  // ── Provider diagnostics ──────────────────────────────────────────
  console.log(`  ${chalk.bold('Provider')}`);
  console.log(`  ${chalk.dim('─'.repeat(40))}`);

  const store = new ProviderStore();
  const providers = store.list();

  if (providers.length === 0) {
    console.log(`  ${chalk.yellow('⚠')} ${chalk.dim('No providers configured.')}`);
    console.log(`  ${chalk.dim('  Run')} ${chalk.cyan('pulse configure')} ${chalk.dim('to set one up.')}`);
  } else {
    for (const prov of providers) {
      const active = prov.active ? chalk.green(' (active)') : '';
      const apiKey = prov.apiKey ? `${prov.apiKey.slice(0, 8)}…` : '—';
      console.log(`  ${chalk.cyan('•')} ${chalk.bold(prov.name)}${active}`);
      console.log(`    ${chalk.dim('Model:')}  ${prov.model || '—'}`);
      console.log(`    ${chalk.dim('Key:')}    ${apiKey}`);
    }
  }
  console.log();

  // ── Project diagnostics ───────────────────────────────────────────
  console.log(`  ${chalk.bold('Project')}`);
  console.log(`  ${chalk.dim('─'.repeat(40))}`);

  const { registry } = getAgent({ cwd });
  const health = await registry.execute('pulse_health', {}, { cwd });
  if (health.status === 'ok') {
    console.log(`  ${chalk.cyan('•')} ${chalk.dim('Files:')}   ${health.health.files} files, ${health.health.totalLines} lines`);
    console.log(`  ${chalk.cyan('•')} ${chalk.dim('Issues:')}  ${health.health.issues.length}`);
    console.log(`  ${chalk.cyan('•')} ${chalk.dim('Score:')}   ${health.health.score}/100`);
    if (health.health.issues.length > 0) {
      console.log(`  ${chalk.cyan('•')} ${chalk.dim('Top:')}`);
      for (const issue of health.health.issues.slice(0, 3)) {
        console.log(`    ${chalk.dim('-')} ${issue.message}`);
      }
    }
  } else {
    console.log(`  ${chalk.yellow('⚠')} ${chalk.dim('Could not analyse project.')}`);
  }

  console.log();
  console.log(`  ${chalk.bold('Diagnosis Complete')}`);
  console.log(`  ${chalk.dim('─'.repeat(40))}`);
  console.log();
}

module.exports = { doctorWorkflow };
