/**
 * Pulse CLI — fast, provider-agnostic AI coding assistant.
 *
 * Usage:
 *   pulse                     Start interactive chat session
 *   pulse provider            List providers and show current
 *   pulse provider -i         Interactive provider switching
 *   pulse configure           Run the setup wizard
 *   pulse login               Quick API key setup
 *   pulse history             List saved conversations
 *   pulse history <id>        View a specific conversation
 *   pulse history --delete <id>  Delete a conversation
 *   pulse init                Initialise Pulse in a project
 *   pulse map                 Map your repository (coming soon)
 *   pulse search              Search repository (coming soon)
 *   pulse review              AI code review (coming soon)
 *   pulse fix                 AI bug fixing (coming soon)
 *   pulse explain             AI code explanation (coming soon)
 *   pulse optimize            AI optimisation (coming soon)
 *   pulse document            AI documentation (coming soon)
 *   pulse test                AI test generation (coming soon)
 *   pulse release             AI release management (coming soon)
 *   pulse doctor              Project health check (coming soon)
 *   pulse plugin install      Install plugins (coming soon)
 *   pulse --help              Show CLI usage
 *   pulse --version           Show version
 *
 * @module index
 */

const chalk = require('chalk');
const { loadConfig, knownProviders } = require('./lib/config');
const { handleError } = require('./lib/errors');
const { startChat } = require('./commands/chat');
const { providerCommand } = require('./commands/provider');
const { configureCommand, loginCommand } = require('./commands/configure');
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
  console.log(chalk.bold(`\n  Pulse CLI v${pkg.version}`));
  console.log(chalk.dim('  Fast, provider-agnostic AI coding assistant\n'));

  console.log(`  ${chalk.cyan('Usage:')}`);
  console.log(`    ${chalk.bold('pulse')}                        Start interactive chat`);
  console.log(`    ${chalk.bold('pulse provider')}               List providers`);
  console.log(`    ${chalk.bold('pulse provider -i')}            Switch provider interactively`);
  console.log(`    ${chalk.bold('pulse configure')}              Run the setup wizard`);
  console.log(`    ${chalk.bold('pulse login')}                  Quick API key setup`);
  console.log(`    ${chalk.bold('pulse history')}                List conversations`);
  console.log(`    ${chalk.bold('pulse history <id>')}           View a conversation`);
  console.log(`    ${chalk.bold('pulse history --delete <id>')}  Delete a conversation`);
  console.log();

  console.log(`  ${chalk.cyan('Future commands:')}`);
  console.log(`    init, map, search, remember, review, fix, explain,`);
  console.log(`    optimize, document, test, release, doctor, plugin`);
  console.log();

  console.log(`  ${chalk.cyan('Providers:')}  ${knownProviders().join(', ')}`);
  console.log(`  ${chalk.cyan('Docs:')}       ${chalk.underline('https://github.com/pulse-cli/pulse')}`);
  console.log();
}

// ── Main ───────────────────────────────────────────────────────────────

async function main() {
  const { command, args, flags } = parseArgs();

  if (flags.version || flags.v) {
    console.log(`pulse-cli v${pkg.version}`);
    return;
  }

  if (flags.help || flags.h) {
    showUsage();
    return;
  }

  switch (command) {
    // ── Interactive chat ─────────────────────────────────────────────
    case 'chat':
      try {
        const config = loadConfig({});
        await startChat(config);
      } catch (err) {
        handleError(err);
      }
      break;

    // ── Provider management ──────────────────────────────────────────
    case 'provider':
      await providerCommand({ interactive: flags.i || flags.interactive });
      break;

    // ── Configuration ────────────────────────────────────────────────
    case 'configure':
      await configureCommand();
      break;

    case 'login':
      await loginCommand();
      break;

    // ── Conversation history ─────────────────────────────────────────
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

    // ── Future / coming-soon commands ─────────────────────────────────
    case 'init':     await initCommand();     break;
    case 'map':      await mapCommand();      break;
    case 'search':   await searchCommand();   break;
    case 'remember': await rememberCommand(); break;
    case 'review':   await reviewCommand();   break;
    case 'fix':      await fixCommand();      break;
    case 'explain':  await explainCommand();  break;
    case 'optimize': await optimizeCommand(); break;
    case 'document': await documentCommand(); break;
    case 'test':     await testCommand();     break;
    case 'release':  await releaseCommand();  break;
    case 'doctor':   await doctorCommand();   break;
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
