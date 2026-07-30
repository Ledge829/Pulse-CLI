/**
 * Pulse CLI — Main entry point
 *
 * This is the main file. When you type `pulse` in your terminal, this
 * file decides what to do based on what you typed after "pulse".
 *
 * For example:
 *   - `pulse` → starts the interactive chat
 *   - `pulse provider` → shows provider management
 *   - `pulse configure` → runs the setup wizard
 *   - `pulse --help` → shows the help screen
 *   - `pulse --version` → shows the version number
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

// Future / planned commands
const {
  initCommand, mapCommand, searchCommand, rememberCommand,
  fixCommand, explainCommand, optimizeCommand,
  documentCommand, testCommand,
} = require('./commands/future');

// Plugin system
const { pluginCommand, skillCommand } = require('./plugins/index');

// Workflow engines
const { planWorkflow } = require('./agent/workflows/plan');
const { buildWorkflow } = require('./agent/workflows/build');
const { reviewWorkflow } = require('./agent/workflows/review');
const { doctorWorkflow } = require('./agent/workflows/doctor');
const { shipWorkflow } = require('./agent/workflows/ship');

// Load the package.json so we can read the version number
const packageInfo = require('../package.json');

// ──────────────────────────────────────────────────────────────────────
// COMMAND-LINE ARGUMENT PARSING
// ──────────────────────────────────────────────────────────────────────
// This function takes everything the user typed after "pulse" and
// splits it into a command, arguments, and flags.
//
// For example: "pulse provider -i" →
//   { command: "provider", args: [], flags: { i: true } }

function parseCommandLine() {
  // process.argv contains everything the user typed.
  // Example: ["node", "bin/pulse.js", "provider", "-i"]
  // We skip the first two items (node and the script path)
  const rawArguments = process.argv.slice(2);

  const positionalArgs = [];   // Arguments without dashes (e.g., "provider", "help")
  const commandFlags = {};     // Arguments with dashes (e.g., --help, -i)

  // Go through each argument and decide if it's a flag or a positional arg
  for (const argument of rawArguments) {
    if (argument.startsWith('--')) {
      // It's a long flag like --help or --delete=conv_id
      const equalsIndex = argument.indexOf('=');
      if (equalsIndex !== -1) {
        // It has a value: --delete=conv123
        const flagName = argument.slice(2, equalsIndex);
        const flagValue = argument.slice(equalsIndex + 1);
        commandFlags[flagName] = flagValue;
      } else {
        // It's just a flag: --help
        commandFlags[argument.slice(2)] = true;
      }
    } else if (argument.startsWith('-') && argument.length === 2) {
      // It's a short flag like -i or -v
      commandFlags[argument.slice(1)] = true;
    } else {
      // It's a regular argument like "provider" or "history"
      positionalArgs.push(argument);
    }
  }

  return {
    command: positionalArgs[0] || 'chat',  // Default to 'chat' if nothing was typed
    args: positionalArgs.slice(1),          // Everything after the command
    flags: commandFlags                     // All the -- and - flags
  };
}

// ──────────────────────────────────────────────────────────────────────
// HELP SCREEN
// ──────────────────────────────────────────────────────────────────────
// This is shown when the user types `pulse --help`

function showHelpScreen() {
  const terminalWidth = Math.min(process.stdout.columns || 80, 72);

  console.log();
  console.log(`  ${chalk.cyan('♡')}  ${chalk.bold.white('Pulse CLI')}  ${chalk.dim(`v${packageInfo.version}`)}`);
  console.log(`  ${chalk.dim('BYOK AI Coding Assistant · Fast · Modular · Provider Agnostic')}`);
  console.log();

  // ── Active commands ──────────────────────────────────────────────
  console.log(`  ${chalk.bold('Commands')}`);
  console.log(`  ${chalk.dim('─'.repeat(terminalWidth))}`);
  console.log();
  console.log(`    ${chalk.cyan('pulse')}              ${chalk.dim('Start interactive chat')}`);
  console.log(`    ${chalk.cyan('pulse provider')}     ${chalk.dim('Manage AI providers')}`);
  console.log(`    ${chalk.cyan('pulse configure')}    ${chalk.dim('Setup wizard (re-run anytime)')}`);
  console.log(`    ${chalk.cyan('pulse login')}        ${chalk.dim('Quick API key setup')}`);
  console.log(`    ${chalk.cyan('pulse history')}      ${chalk.dim('View saved conversations')}`);
  console.log();

  // ── Workflows (advanced features) ────────────────────────────────
  console.log(`  ${chalk.bold('Workflows')}`);
  console.log(`  ${chalk.dim('─'.repeat(terminalWidth))}`);
  console.log();
  console.log(`    ${chalk.cyan('pulse plan')}          ${chalk.dim('Analyze & create implementation plans')}`);
  console.log(`    ${chalk.cyan('pulse build')}         ${chalk.dim('Implement features with file awareness')}`);
  console.log(`    ${chalk.cyan('pulse review')}        ${chalk.dim('Review code quality, bugs & security')}`);
  console.log(`    ${chalk.cyan('pulse doctor')}        ${chalk.dim('Diagnose project & provider health')}`);
  console.log(`    ${chalk.cyan('pulse ship')}         ${chalk.dim('Prepare releases & changelogs')}`);
  console.log();

  // ── Utility commands ─────────────────────────────────────────────
  console.log(`  ${chalk.bold('Utilities')}`);
  console.log(`  ${chalk.dim('─'.repeat(terminalWidth))}`);
  console.log();
  console.log(`    ${chalk.cyan('pulse init')}          ${chalk.dim('Set up Pulse in a project')}`);
  console.log(`    ${chalk.cyan('pulse map')}           ${chalk.dim('Project architecture map (coming soon)')}`);
  console.log(`    ${chalk.cyan('pulse search')}        ${chalk.dim('Semantic code search (coming soon)')}`);
  console.log(`    ${chalk.cyan('pulse plugin')}        ${chalk.dim('Plugin management (coming soon)')}`);
  console.log();

  // ── Provider information ─────────────────────────────────────────
  console.log(`  ${chalk.bold('Providers')}  ${chalk.dim(knownProviders().join(' · '))}`);
  console.log();
  console.log(`  ${chalk.dim('Docs:')}  ${chalk.underline('https://github.com/Ledge829/Pulse-CLI')}`);
  console.log();
}

// ──────────────────────────────────────────────────────────────────────
// MAIN FUNCTION
// ──────────────────────────────────────────────────────────────────────
// This is where everything starts. When you type "pulse", this function
// runs and decides what to do.

async function main() {
  // ── Step 1: Parse what the user typed ────────────────────────────
  const userInput = parseCommandLine();
  const command = userInput.command;
  const arguments = userInput.args;
  const flags = userInput.flags;

  // ── Step 2: Handle global flags ──────────────────────────────────
  // These work on any command, like `pulse --version` or `pulse --help`

  // Show version number and exit
  if (flags.version || flags.v) {
    console.log(`pulse-cli v${packageInfo.version}`);
    return;
  }

  // Show help screen and exit
  if (flags.help || flags.h) {
    showHelpScreen();
    return;
  }

  // ── Step 3: Check if this is the first time using Pulse CLI ──────
  // If Pulse CLI has never been configured, we should show the onboarding
  // flow to help the user set up their provider and API key.
  const isInteractiveCommand = (command === 'chat' || command === 'configure');

  if (isInteractiveCommand && !flags.help) {
    const isFirstRun = await checkFirstRun({
      force: flags.setup || false
    }).catch(function() {
      return false;
    });

    if (isFirstRun) {
      // No configuration exists — run the onboarding wizard
      const { runOnboarding } = require('./commands/onboarding');
      await runOnboarding();

      // After onboarding, if the user just typed "pulse" (no subcommand),
      // start the chat automatically
      if (command === 'chat') {
        try {
          const configuration = loadConfig({});
          await startChat(configuration);
        } catch (error) {
          handleError(error);
        }
        return; // Don't fall through to the switch statement
      }
    }
  }

  // ── Step 4: Route to the right command ──────────────────────────

  switch (command) {

    // ── Interactive chat ──────────────────────────────────────────
    // `pulse` — The main feature
    case 'chat':
      try {
        const configuration = loadConfig({});
        await startChat(configuration);
      } catch (error) {
        handleError(error);
      }
      break;

    // ── Provider management ────────────────────────────────────────
    // `pulse provider` — List, add, remove, test, and switch providers
    case 'provider':
      await providerCommand({
        interactive: flags.i || flags.interactive,
        add: flags.add || flags.a,
        remove: flags.remove,
        test: flags.test,
      });
      break;

    // ── Configuration ──────────────────────────────────────────────
    // `pulse configure` — The full setup wizard
    case 'configure':
      await runOnboarding();
      break;

    // `pulse login` — Quick API key setup
    case 'login':
      await loginCommand();
      break;

    // ── Conversation history ──────────────────────────────────────
    // `pulse history` — List/view/delete conversations
    case 'history':
      if (flags.delete) {
        // `pulse history --delete <id>`
        const wasDeleted = await deleteConversation(String(flags.delete));
        if (wasDeleted) {
          console.log(chalk.dim(`  Deleted conversation ${flags.delete}`));
        } else {
          console.error(chalk.red(`  ✖ Conversation "${flags.delete}" not found.`));
          process.exit(1);
        }
      } else if (arguments.length > 0) {
        // `pulse history <id>` — View a specific conversation
        await viewConversation(arguments[0]);
      } else {
        // `pulse history` — List all conversations
        const limit = flags.limit ? parseInt(flags.limit, 10) : 20;
        await listConversations({ limit: limit });
      }
      break;

    // ── Workflow commands ─────────────────────────────────────────
    // These are powered by the agent tool system
    case 'plan':
      await planWorkflow(arguments.join(' ') || 'Analyse the current project');
      break;

    case 'build':
      await buildWorkflow(arguments.join(' ') || 'Implement requested changes');
      break;

    case 'review':
      await reviewWorkflow(arguments[0] || null);
      break;

    case 'doctor':
      await doctorWorkflow();
      break;

    case 'ship':
      await shipWorkflow(arguments[0] || null);
      break;

    // ── Future / planned commands ──────────────────────────────────
    // These show "coming soon" messages with placeholders
    case 'init':       await initCommand();     break;
    case 'map':        await mapCommand();      break;
    case 'search':     await searchCommand();   break;
    case 'remember':   await rememberCommand(); break;
    case 'fix':        await fixCommand();      break;
    case 'explain':    await explainCommand();  break;
    case 'optimize':   await optimizeCommand(); break;
    case 'document':   await documentCommand(); break;
    case 'test':       await testCommand();     break;

    // ── Plugin commands ────────────────────────────────────────────
    // `pulse plugin <action> [args]`
    case 'plugin':
      await pluginCommand(arguments[0] || 'help', arguments.slice(1));
      break;

    // `pulse skill <action> [args]`
    case 'skill':
      await skillCommand(arguments[0] || 'help', arguments.slice(1));
      break;

    // ── Unknown command ───────────────────────────────────────────
    default:
      console.error(chalk.red(`  ✖ Unknown command: "${command}"`));
      showHelpScreen();
      process.exit(1);
  }
}

// ── Start the program ──────────────────────────────────────────────────
// If this file is being run directly (not imported), start main()
if (require.main === module) {
  main().catch(function(error) {
    handleError(error);
  });
}

module.exports = { main };
