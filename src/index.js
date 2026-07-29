/**
 * Pulse CLI — fast, provider-agnostic AI coding assistant.
 *
 * Usage:
 *   pulse                     Start interactive chat
 *   pulse provider            List / add / remove / test providers
 *   pulse configure           Full setup wizard
 *   pulse login               Quick API key entry
 *   pulse history             View saved conversations
 *   pulse plan                Create an implementation plan
 *   pulse build               Implement a feature
 *   pulse review              Review code quality
 *   pulse doctor              Diagnose project health
 *   pulse ship                Prepare a release
 *   pulse init                Initialise Pulse in a project
 *   pulse plugin install      Install a plugin
 *   pulse --help              Show this help
 *   pulse --version           Show version
 *
 * @module index
 */

const chalk = require('chalk');
const { loadConfig, knownProviders } = require('./lib/config');
const { handleError } = require('./lib/errors');
const { checkFirstRun } = require('./lib/firstrun');
const { startChat } = require('./commands/chat');
const { providerCommand } = require('./commands/provider');
const { configureCommand, loginCommand } = require('./commands/configure');
const { runOnboarding } = require('./commands/onboarding');
const { listConversations, viewConversation, deleteConversation } = require('./commands/history');
const {
  initCommand, mapCommand, searchCommand, rememberCommand,
  reviewCommand, fixCommand, explainCommand, optimizeCommand,
  documentCommand, testCommand, releaseCommand, doctorCommand,
  pluginInstallCommand,
} = require('./commands/future');

const pkg = require('../package.json');

// ── Argument parsing ───────────────────────────────────────────────────

function parseArgs() {
  const [, , ...raw] = process.argv;
  const args = [];
  const flags = {};

  for (const arg of raw) {
    if (arg.startsWith('--')) {
      const eq = arg.indexOf('=');
      if (eq !== -1) {
        flags[arg.slice(2, eq)] = arg.slice(eq + 1);
      } else {
        flags[arg.slice(2)] = true;
      }
    } else if (arg.startsWith('-') && arg.length === 2) {
      flags[arg.slice(1)] = true;
    } else {
      args.push(arg);
    }
  }

  return { command: args[0] || 'chat', args: args.slice(1), flags };
}

// ── Help ───────────────────────────────────────────────────────────────

function showUsage() {
  const width = Math.min(process.stdout.columns || 80, 72);

  console.log();
  console.log(`  ${chalk.cyan('♡')}  ${chalk.bold.white('Pulse CLI')}  ${chalk.dim(`v${pkg.version}`)}`);
  console.log(`  ${chalk.dim('BYOK AI Coding Assistant · Fast · Modular · Provider Agnostic')}`);
  console.log();

  // ── Active commands ────────────────────────────────────────────────
  console.log(`  ${chalk.bold('Commands')}`);
  console.log(`  ${chalk.dim('─'.repeat(width))}`);
  console.log();
  console.log(`    ${chalk.cyan('pulse')}              ${chalk.dim('Start interactive chat')}`);
  console.log(`    ${chalk.cyan('pulse provider')}     ${chalk.dim('Manage AI providers')}`);
  console.log(`    ${chalk.cyan('pulse configure')}    ${chalk.dim('Setup wizard (re-run anytime)')}`);
  console.log(`    ${chalk.cyan('pulse login')}        ${chalk.dim('Quick API key setup')}`);
  console.log(`    ${chalk.cyan('pulse history')}      ${chalk.dim('View saved conversations')}`);
  console.log();

  // ── Workflows (coming soon) ────────────────────────────────────────
  console.log(`  ${chalk.bold('Workflows')}`);
  console.log(`  ${chalk.dim('─'.repeat(width))}`);
  console.log();
  console.log(`    ${chalk.cyan('pulse plan')}          ${chalk.dim('Analyze & create implementation plans')}`);
  console.log(`    ${chalk.cyan('pulse build')}         ${chalk.dim('Implement features with file awareness')}`);
  console.log(`    ${chalk.cyan('pulse review')}        ${chalk.dim('Review code quality, bugs & security')}`);
  console.log(`    ${chalk.cyan('pulse doctor')}        ${chalk.dim('Diagnose project & provider health')}`);
  console.log(`    ${chalk.cyan('pulse ship')}         ${chalk.dim('Prepare releases & changelogs')}`);
  console.log();

  // ── Utilities ──────────────────────────────────────────────────────
  console.log(`  ${chalk.bold('Utilities')}`);
  console.log(`  ${chalk.dim('─'.repeat(width))}`);
  console.log();
  console.log(`    ${chalk.cyan('pulse init')}          ${chalk.dim('Set up Pulse in a project')}`);
  console.log(`    ${chalk.cyan('pulse map')}           ${chalk.dim('Project architecture map (coming soon)')}`);
  console.log(`    ${chalk.cyan('pulse search')}        ${chalk.dim('Semantic code search (coming soon)')}`);
  console.log(`    ${chalk.cyan('pulse plugin')}        ${chalk.dim('Plugin management (coming soon)')}`);
  console.log();

  // ── Provider info ──────────────────────────────────────────────────
  console.log(`  ${chalk.bold('Providers')}  ${chalk.dim(knownProviders().join(' · '))}`);
  console.log();
  console.log(`  ${chalk.dim('Docs:')}  ${chalk.underline('https://github.com/Ledge829/Pulse-CLI')}`);
  console.log();
}

// ── Main ───────────────────────────────────────────────────────────────

async function main() {
  const { command, args, flags } = parseArgs();

  // Global flags (fast path already handled in bin/pulse.js for --version)
  if (flags.version || flags.v) {
    console.log(`pulse-cli v${pkg.version}`);
    return;
  }

  if (flags.help || flags.h) {
    showUsage();
    return;
  }

  // ── First-run check (only for interactive commands) ───────────────
  const isInteractive = !command || command === 'chat' || command === 'configure';
  if (isInteractive && !flags.help) {
    const isFirstRun = await checkFirstRun({ force: flags.setup || false }).catch(() => false);
    if (isFirstRun) {
      // No config exists — welcome the user and start the wizard
      const { runOnboarding } = require('./commands/onboarding');
      await runOnboarding();
      // After onboarding, if the user ran `pulse` (no subcommand), start chat
      if (command === 'chat') {
        try {
          const config = loadConfig({});
          await startChat(config);
        } catch (err) {
          handleError(err);
        }
        return;
      }
    }
  }

  // ── Command routing ───────────────────────────────────────────────
  switch (command) {
    // ── Interactive chat ────────────────────────────────────────────
    case 'chat':
      try {
        const config = loadConfig({});
        await startChat(config);
      } catch (err) {
        handleError(err);
      }
      break;

    // ── Provider management ─────────────────────────────────────────
    case 'provider':
      await providerCommand({
        interactive: flags.i || flags.interactive,
        add: flags.add || flags.a,
        remove: flags.remove,
        test: flags.test,
      });
      break;

    // ── Configuration ───────────────────────────────────────────────
    case 'configure':
      await runOnboarding();
      break;

    case 'login':
      await loginCommand();
      break;

    // ── Conversation history ────────────────────────────────────────
    case 'history':
      if (flags.delete) {
        const deleted = await deleteConversation(String(flags.delete));
        if (deleted) {
          console.log(chalk.dim(`  Deleted conversation ${flags.delete}`));
        } else {
          console.error(chalk.red(`  ✖ Conversation "${flags.delete}" not found.`));
          process.exit(1);
        }
      } else if (args.length > 0) {
        await viewConversation(args[0]);
      } else {
        await listConversations({ limit: flags.limit ? parseInt(flags.limit, 10) : 20 });
      }
      break;

    // ── Future / planned commands ───────────────────────────────────
    case 'init':     await initCommand();     break;
    case 'plan':     await initCommand();     break; // TODO: real workflow
    case 'build':    await initCommand();     break; // TODO: real workflow
    case 'review':   await reviewCommand();   break;
    case 'doctor':   await doctorCommand();   break;
    case 'ship':     await releaseCommand();  break;
    case 'map':      await mapCommand();      break;
    case 'search':   await searchCommand();   break;
    case 'remember': await rememberCommand(); break;
    case 'fix':      await fixCommand();      break;
    case 'explain':  await explainCommand();  break;
    case 'optimize': await optimizeCommand(); break;
    case 'document': await documentCommand(); break;
    case 'test':     await testCommand();     break;
    case 'plugin':
      if (args[0] === 'install') {
        await pluginInstallCommand();
      } else {
        console.log(chalk.cyan('\n  Plugin commands:'));
        console.log(`    ${chalk.bold('pulse plugin install')}  ${chalk.dim('Install a plugin (coming soon)')}\n`);
      }
      break;

    default:
      console.error(chalk.red(`  ✖ Unknown command: "${command}"`));
      showUsage();
      process.exit(1);
  }
}

if (require.main === module) {
  main().catch((err) => handleError(err));
}

module.exports = { main };
