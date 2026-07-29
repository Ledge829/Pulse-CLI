/**
 * Interactive chat loop — the heart of Pulse CLI.
 *
 * Handles:
 *   - Multiline input with line buffering (empty line sends)
 *   - Slash commands (/help, /clear, /exit, /history, /model, /provider, /new)
 *   - Streaming AI responses with real-time output
 *   - Conversation persistence across sessions
 *   - Graceful Ctrl+C / SIGINT handling (cancel stream or exit)
 *
 * @module commands/chat
 */

const readline = require('readline');
const chalk = require('chalk');
const { ConfigError } = require('../lib/errors');
const { ConversationStore } = require('../lib/storage');
const { createProvider } = require('../providers/index');
const { showWelcome } = require('../ui/banner');
const { startSpinner, failSpinner } = require('../ui/spinner');

// ── Constants ──────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are Pulse CLI, an AI coding assistant running in a terminal.

- Help users with programming, debugging, code review, and technical questions.
- Keep responses concise and focused. Be direct and avoid fluff.
- Format code using markdown code blocks with language labels.
- Use bullet points for lists, not numbered lists unless order matters.
- You are provider-agnostic and help users regardless of which LLM backend they choose.
- Current date: ${new Date().toISOString().slice(0, 10)}.`;

const CONV_DIR = require('../lib/storage').DEFAULT_DIR;

// ── Slash command definitions ──────────────────────────────────────────

const COMMANDS = {
  help: {
    description: 'Show this help message',
    usage: '/help',
    handler: () => showHelp(),
  },
  clear: {
    description: 'Clear the terminal screen',
    usage: '/clear',
    handler: () => { console.clear(); },
  },
  exit: {
    description: 'Exit Pulse CLI',
    usage: '/exit',
    handler: () => process.exit(0),
  },
  quit: {
    description: 'Exit Pulse CLI (alias for /exit)',
    usage: '/quit',
    handler: () => process.exit(0),
  },
  history: {
    description: 'Show recent messages from this session',
    usage: '/history [--all]',
    handler: (state, args) => showHistory(state, args),
  },
  model: {
    description: 'Switch model or show current',
    usage: '/model <name>',
    handler: (state, args) => changeModel(state, args),
  },
  provider: {
    description: 'Switch provider or show current',
    usage: '/provider <name>',
    handler: (state, args) => changeProvider(state, args),
  },
  new: {
    description: 'Start a fresh conversation',
    usage: '/new',
    handler: (state) => startNewConversation(state),
  },
};

// ── Chat state ─────────────────────────────────────────────────────────

/**
 * @typedef {object} ChatState
 * @property {import('../lib/config').Config} config
 * @property {import('../providers/base').BaseProvider} provider
 * @property {import('../lib/storage').Conversation} conversation
 * @property {readline.Interface} rl
 * @property {AbortController} abortController
 * @property {boolean} isStreaming
 */

// ── Helpers ────────────────────────────────────────────────────────────

function showHelp() {
  const pad = 30;
  console.log(chalk.bold('\n  ── Slash Commands ──\n'));
  for (const [name, cmd] of Object.entries(COMMANDS)) {
    if (name === 'quit') continue;
    const usage = chalk.cyan(cmd.usage.padEnd(pad));
    console.log(`  ${usage} ${chalk.dim(cmd.description)}`);
  }
  console.log();
  console.log(chalk.dim('  ── Input Tips ──'));
  console.log(`  ${chalk.cyan('multiline'.padEnd(pad))} ${chalk.dim('Enter on an empty line sends the buffer')}`);
  console.log(`  ${chalk.cyan('Ctrl+C'.padEnd(pad))} ${chalk.dim('Cancel response (streaming) or exit (idle)')}`);
  console.log(`  ${chalk.cyan('Ctrl+D'.padEnd(pad))} ${chalk.dim('Exit Pulse CLI')}`);
  console.log();
}

function showHistory(state, args) {
  const showAll = args.includes('--all');
  const messages = state.conversation.messages;
  if (messages.length === 0) {
    console.log(chalk.dim('\n  No messages in this conversation.\n'));
    return;
  }
  const toShow = showAll ? messages : messages.slice(-10);
  console.log(chalk.bold(`\n  ── History (${toShow.length}/${messages.length} messages) ──\n`));
  for (const msg of toShow) {
    const label = msg.role === 'user' ? chalk.green('You')
      : msg.role === 'assistant' ? chalk.cyan('Assistant')
        : chalk.yellow('System');
    const preview = msg.content.length > 200
      ? msg.content.slice(0, 200) + '...' : msg.content;
    console.log(`  ${label}: ${chalk.dim(preview)}\n`);
  }
}

function changeModel(state, args) {
  const model = args[0];
  if (!model) {
    console.log(chalk.dim(`\n  Current model: ${chalk.bold(state.config.model)}\n`));
    return;
  }
  state.config = { ...state.config, model };
  state.conversation.model = model;
  console.log(chalk.dim(`\n  Switched to model: ${chalk.bold(model)}\n`));
}

function changeProvider(state, args) {
  const name = args[0];
  if (!name) {
    console.log(chalk.dim(`\n  Current provider: ${chalk.bold(state.config.provider)}\n`));
    return;
  }
  try {
    const newConfig = { ...state.config, provider: name };
    state.provider = createProvider(newConfig);
    state.config = newConfig;
    state.conversation.provider = name;
    console.log(chalk.dim(`\n  Switched to provider: ${chalk.bold(name)}\n`));
  } catch (err) {
    console.error(chalk.red(`  ✖ ${err.message}\n`));
  }
}

async function startNewConversation(state) {
  if (state.conversation.messageCount > 0) {
    await state.conversation.save().catch(() => {});
  }
  const store = new ConversationStore(CONV_DIR);
  const conv = store.create({
    model: state.config.model,
    provider: state.config.provider,
    messages: [{ role: 'system', content: SYSTEM_PROMPT }],
  });
  state.conversation = conv;
  console.log(chalk.dim('\n  Started a new conversation.\n'));
}

// ── SIGINT handling ────────────────────────────────────────────────────

function handleSigInt(state) {
  process.stdout.write('\n');
  if (state.isStreaming) {
    state.abortController.abort();
    console.log(chalk.dim('  ⏹ Request cancelled.\n'));
    return;
  }
  if (state.conversation.messageCount > 0) {
    state.conversation.save().catch(() => {});
  }
  console.log(chalk.dim('  👋 Goodbye!\n'));
  process.exit(0);
}

// ── Input collection (multiline buffer) ────────────────────────────────

async function collectInput(state) {
  const buffer = [];
  return new Promise((resolve) => {
    let firstLine = true;
    const showPrompt = () => {
      if (firstLine) {
        state.rl.setPrompt(chalk.cyan('╰─➤  '));
        firstLine = false;
      } else {
        state.rl.setPrompt(chalk.dim('│  '));
      }
      state.rl.prompt();
    };

    state.rl.removeAllListeners('line');
    state.rl.on('line', (line) => {
      const trimmed = line.trimEnd();
      if (buffer.length === 0 && trimmed.startsWith('/')) {
        resolve({ text: trimmed, isCommand: true });
        return;
      }
      if (trimmed === '') {
        if (buffer.length > 0) {
          resolve({ text: buffer.join('\n'), isCommand: false });
          return;
        }
        showPrompt();
        return;
      }
      buffer.push(line);
      showPrompt();
    });
    showPrompt();
  });
}

// ── Streaming response ─────────────────────────────────────────────────

async function streamResponse(state) {
  const messages = state.conversation.messages.map((m) => ({
    role: m.role, content: m.content,
  }));

  const spinner = startSpinner('  Waiting for response…');
  let fullResponse = '';
  let firstToken = true;

  try {
    for await (const chunk of state.provider.streamChat(messages, state.abortController.signal)) {
      if (firstToken) {
        firstToken = false;
        spinner.stop();
        const modelLabel = chalk.dim(`[${state.config.model}]`);
        console.log(`  ${chalk.cyan('Assistant')} ${modelLabel}`);
        process.stdout.write('  ');
      }
      if (chunk) {
        fullResponse += chunk;
        process.stdout.write(chunk);
      }
    }
    if (firstToken) {
      failSpinner(spinner, 'Received empty response from provider.');
      return '';
    }
    process.stdout.write('\n');
    return fullResponse;
  } catch (err) {
    if (!firstToken) process.stdout.write('\n');
    throw err;
  } finally {
    if (firstToken) spinner.stop();
  }
}

// ── Main chat loop ─────────────────────────────────────────────────────

async function startChat(config) {
  const store = new ConversationStore(CONV_DIR);
  let abortController = new AbortController();

  let conversation = await store.latest().catch(() => null);
  if (!conversation) {
    conversation = store.create({
      model: config.model,
      provider: config.provider,
      messages: [{ role: 'system', content: SYSTEM_PROMPT }],
    });
  }

  let provider;
  try {
    provider = createProvider(config);
  } catch (err) {
    if (err instanceof ConfigError) {
      console.error(chalk.red(`  ✖ ${err.message}`));
      console.error(chalk.dim('  Run `pulse configure` to set up your provider.\n'));
      process.exit(1);
    }
    throw err;
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
    historySize: 100,
  });

  /** @type {ChatState} */
  const state = { config, provider, conversation, rl, abortController, isStreaming: false };

  rl.on('SIGINT', () => handleSigInt(state));

  process.on('uncaughtException', (err) => {
    console.error(chalk.red(`\n  ✖ Unexpected error: ${err.message}\n`));
    conversation.save().catch(() => {});
    process.exit(1);
  });

  console.clear();
  showWelcome(config);

  if (conversation.messageCount > 0) {
    const msgs = conversation.messages;
    const lastPair = msgs.filter((m) => m.role !== 'system').slice(-2);
    if (lastPair.length > 0) {
      console.log(chalk.dim('  ── Resuming previous conversation ──\n'));
      for (const msg of lastPair) {
        const label = msg.role === 'user' ? chalk.green('You') : chalk.cyan('Assistant');
        const preview = msg.content.length > 300 ? msg.content.slice(0, 300) + '...' : msg.content;
        console.log(`  ${label}: ${chalk.dim(preview)}\n`);
      }
    }
  }

  while (true) {
    const { text, isCommand } = await collectInput(state);
    if (!text) continue;

    if (isCommand) {
      const [cmdName, ...args] = text.slice(1).split(/\s+/);
      const command = COMMANDS[cmdName.toLowerCase()];
      if (command) {
        try { await command.handler(state, args); } catch (err) {
          console.error(chalk.red(`  ✖ Command error: ${err.message}\n`));
        }
      } else {
        console.log(chalk.red(`  ✖ Unknown command: /${cmdName}`));
        console.log(chalk.dim('    Type /help for available commands.\n'));
      }
      continue;
    }

    conversation.addMessage('user', text);
    conversation.deriveTitle(text);

    abortController = new AbortController();
    state.abortController = abortController;
    state.isStreaming = true;

    let responseText = '';
    try {
      responseText = await streamResponse(state);
    } catch (err) {
      if (err.name === 'AbortError') continue;
      const msg = err.code === 'NETWORK_ERROR' ? `Network error: ${err.message}`
        : err.code === 'RATE_LIMIT' ? `${err.message}`
          : err.code === 'API_ERROR' || err.name === 'ApiError' ? `${err.message}`
            : `Error: ${err.message}`;
      console.error(chalk.red(`  ✖ ${msg}\n`));
      continue;
    } finally {
      state.isStreaming = false;
    }

    if (!responseText) {
      console.log(chalk.dim('  (empty response)\n'));
      continue;
    }

    conversation.addMessage('assistant', responseText);
    try { await conversation.save(); } catch (err) {
      console.error(chalk.dim(`  ⚠ Failed to save conversation: ${err.message}\n`));
    }
  }
}

module.exports = { startChat };
