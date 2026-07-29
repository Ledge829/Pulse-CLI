/**
 * `pulse ship` — Prepare releases: changelogs, version bumps, commits.
 *
 * This workflow:
 *   1. Analyses git history since the last tag
 *   2. Generates a changelog from commits
 *   3. Suggests a version bump (major/minor/patch)
 *   4. Optionally creates the release commit and tag
 *
 * @module agent/workflows/ship
 */

const { execSync } = require('child_process');
const chalk = require('chalk');
const { getAgent } = require('../index');

/**
 * Run the ship/release workflow.
 * @param {string} [type] - Version bump type: major, minor, patch
 * @param {object} [options]
 */
async function shipWorkflow(type, options = {}) {
  const cwd = options.cwd || process.cwd();
  const { registry } = getAgent({ cwd });

  console.log(chalk.bold('\n  Pulse Ship\n'));

  // Phase 1: Check git state
  console.log(`  ${chalk.dim('Phase 1/3: Analysing git state…')}`);

  const gitStatus = await registry.execute('git_status', {}, { cwd });
  if (gitStatus.status !== 'ok') {
    console.log(`  ${chalk.yellow('⚠')} ${chalk.dim('Not a git repository or git not available.')}`);
    console.log();
    return;
  }

  console.log(`  ${chalk.cyan('•')} ${chalk.dim('Branch:')}   ${gitStatus.branch}`);
  console.log(`  ${chalk.cyan('•')} ${chalk.dim('Changes:')}  ${gitStatus.total} (${gitStatus.staged} staged, ${gitStatus.untracked} untracked)`);

  // Phase 2: Get recent commits
  console.log();
  console.log(`  ${chalk.dim('Phase 2/3: Reviewing recent commits…')}`);

  const gitLog = await registry.execute('git_log', { count: 15 }, { cwd });
  if (gitLog.status === 'ok' && gitLog.commits.length > 0) {
    console.log(`  ${chalk.cyan('•')} ${chalk.dim('Recent commits:')}`);
    for (const commit of gitLog.commits.slice(0, 8)) {
      const msg = commit.message.length > 60
        ? commit.message.slice(0, 57) + '…'
        : commit.message;
      console.log(`    ${chalk.dim(commit.hash.slice(0, 7))} ${msg}`);
    }
  }
  console.log();

  // Phase 3: Release summary
  console.log(`  ${chalk.dim('Phase 3/3: Release summary…')}`);

  // Get current version
  let currentVersion = '0.0.0';
  try {
    const pkg = require(require('path').join(cwd, 'package.json'));
    currentVersion = pkg.version;
  } catch { /* not a node project */ }

  // Determine version bump
  const bumpType = type || 'patch';
  const [major, minor, patch] = currentVersion.split('.').map(Number);
  const newVersion = bumpType === 'major'
    ? `${major + 1}.0.0`
    : bumpType === 'minor'
      ? `${major}.${minor + 1}.0`
      : `${major}.${minor}.${patch + 1}`;

  console.log();
  console.log(`  ${chalk.bold('Release Plan')}`);
  console.log(`  ${chalk.dim('─'.repeat(40))}`);
  console.log();
  console.log(`  ${chalk.cyan('•')} ${chalk.dim('Current:')}  ${currentVersion}`);
  console.log(`  ${chalk.cyan('•')} ${chalk.dim('New:')}      ${chalk.bold(newVersion)} (${bumpType})`);
  console.log(`  ${chalk.cyan('•')} ${chalk.dim('Branch:')}  ${gitStatus.branch}`);
  console.log(`  ${chalk.cyan('•')} ${chalk.dim('Commits:')} ${gitLog.commits.length} in log`);

  console.log();
  console.log(`  ${chalk.bold('Changelog Suggestions')}`);
  console.log(`  ${chalk.dim('─'.repeat(40))}`);
  console.log();

  // Group commits by type
  const features = gitLog.commits.filter((c) => /feat|add|implement/i.test(c.message));
  const fixes = gitLog.commits.filter((c) => /fix|bug|patch|hotfix/i.test(c.message));
  const chores = gitLog.commits.filter((c) => /chore|refactor|docs|test|style/i.test(c.message));

  if (features.length > 0) {
    console.log(`  ${chalk.green('Features:')}`);
    for (const c of features.slice(0, 5)) {
      console.log(`    ${chalk.dim('-')} ${c.message.slice(0, 80)}`);
    }
  }
  if (fixes.length > 0) {
    console.log(`  ${chalk.yellow('Fixes:')}`);
    for (const c of fixes.slice(0, 5)) {
      console.log(`    ${chalk.dim('-')} ${c.message.slice(0, 80)}`);
    }
  }
  if (chores.length > 0) {
    console.log(`  ${chalk.dim('Chores:')}`);
    for (const c of chores.slice(0, 5)) {
      console.log(`    ${chalk.dim('-')} ${c.message.slice(0, 80)}`);
    }
  }

  console.log();
  console.log(`  ${chalk.dim('To create this release:')}`);
  console.log(`  ${chalk.cyan('  1.')} ${chalk.dim('Update version to')} ${newVersion}`);
  console.log(`  ${chalk.cyan('  2.')} ${chalk.dim('Generate changelog')}`);
  console.log(`  ${chalk.cyan('  3.')} ${chalk.dim('Commit and tag')}`);
  console.log(`  ${chalk.cyan('  4.')} ${chalk.dim('Push to remote')}`);
  console.log();
}

module.exports = { shipWorkflow };
