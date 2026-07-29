/**
 * Interactive chat loop — the heart of Pulse CLI.
 *
 * Features:
 *   - Single-line input: Enter sends immediately (natural chat UX)
 *   - Multiline mode: /multiline or auto-detected for pasted content
 *   - Structured TUI with headers, message threading, and status bar
 *   - Streaming AI responses with real-time output
 *   - Slash commands (/help, /clear, /exit, /history, /model, /provider, /new, /multiline)
 *   - Conversation persistence and session resume
 *   - Graceful Ctrl+C / SIGINT handling
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
const { renderMessage, renderHeader, renderFooter, renderStatus, renderLoading } = require('../ui/terminal');

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
    description: 'Exit Pulse CLI (alias)',
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
  multiline: {
    description: 'Toggle multiline input mode',
    usage: '/multiline',
    handler: (state) => toggleMultiline(state),
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
 * @property {boolean} multilineMode
 */

// ── Helpers ────────────────────────────────────────────────────────────

function showHelp() {
  console.log(chalk.bold('\n  ── Slash Commands ──\n'));
  const pad = 30;
  for (const [name, cmd] of Object.entries(COMMANDS)) {
    if (name === 'quit') continue;
    const usage = chalk.cyan(cmd.usage.padEnd(pad));
    console.log(`  ${usage} ${chalk.dim(cmd.description)}`);
  }
  console.log();
  console.log(chalk.dim('  ── Input Tips ──'));
  console.log(`  ${chalk.cyan('Enter'.padEnd(pad))} ${chalk.dim('Send message (single-line mode)')}`);
  console.log(`  ${chalk.cyan('/multiline'.padEnd(pad))} ${chalk.dim('Toggle multiline (paste code)')}`);
  console.log(`  ${chalk.cyan('Ctrl+C'.padEnd(pad))} ${chalk.dim('Cancel response or exit')}`);
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

function toggleMultiline(state) {
  state.multilineMode = !state.multilineMode;
  const msg = state.multilineMode
    ? 'Multiline mode: ON — type your message, empty Enter to send'
    : 'Single-line mode: Enter sends immediately';
  console.log(chalk.dim(`\n  ${msg}\n`));
}

// ── SIGINT handling ────────────────────────────────────────────────────

function handleSigInt(state) {
  if (state.isStreaming) {
    state.abortController.abort();
    console.log(chalk.dim('\n  ⏹ Cancelled.\n'));
    return;
  }
  if (state.conversation.messageCount > 0) {
    state.conversation.save().catch(() => {});
  }
  console.log(chalk.dim('\n  👋 Goodbye!\n'));
  process.exit(0);
}

// ── Input collection ───────────────────────────────────────────────────

/**
 * Collect input from the user.
 *
 * Two modes:
 *   - Single-line (default): Enter sends immediately
 *   - Multiline: lines buffer, empty line sends
 *
 * @param {ChatState} state
 * @returns {Promise<{ text: string|null, isCommand: boolean }>}
 */
async function collectInput(state) {
  const buffer = [];

  return new Promise((resolve) => {
    state.rl.removeAllListeners('line');

    if (!state.multilineMode) {
      // ── Single-line mode: Enter sends immediately ────────────────
      state.rl.on('line', (line) => {
        const trimmed = line.trimEnd();
        if (!trimmed) {
          state.rl.prompt();
          return;
        }
        if (trimmed.startsWith('/')) {
          resolve({ text: trimmed, isCommand: true });
        } else {
          resolve({ text: trimmed, isCommand: false });
        }
      });
      state.rl.setPrompt(chalk.cyan('╰─➤  '));
      state.rl.prompt();
    } else {
      // ── Multiline mode: buffer until empty line ─────────────────
      let firstLine = true;

      const multilinePrompt = () => {
        state.rl.setPrompt(firstLine ? chalk.cyan('╰─➤  ') : chalk.dim('│  '));
        firstLine = false;
        state.rl.prompt();
      };

      state.rl.on('line', (line) => {
        const trimmed = line.trimEnd();

        // Command detection on first line only
        if (buffer.length === 0 && trimmed.startsWith('/')) {
          resolve({ text: trimmed, isCommand: true });
          return;
        }

        // Empty line + buffered content = send
        if (trimmed === '') {
          if (buffer.length > 0) {
            resolve({ text: buffer.join('\n'), isCommand: false });
            return;
          }
          multilinePrompt();
          return;
        }

        buffer.push(line);
        multilinePrompt();
      });

      multilinePrompt();
    }
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
        // Show the assistant header with model badge
        process.stdout.write(`  ${chalk.cyan('┌─')} ${chalk.cyan('Assistant')} ${chalk.dim(`[${state.config.model}]`)}`);
        const time = new Date();
        const ts = `${String(time.getHours()).padStart(2,'0')}:${String(time.getMinutes()).padStart(2,'0')}:${String(time.getSeconds()).padStart(2,'0')}`;
        process.stdout.write(` ${chalk.dim(ts)}\n`);
        process.stdout.write(`  ${chalk.cyan('┃')} `);
      }
      if (chunk) {
        fullResponse += chunk;
        process.stdout.write(chunk);
      }
    }

    if (firstToken) {
      failSpinner(spinner, 'Empty response from provider.');
      return '';
    }

    process.stdout.write('\n');
    process.stdout.write(`  ${chalk.dim('└' + '─'.repeat(30) + '┘')}\n\n`);
    return fullResponse;
  } catch (err) {
    if (!firstToken) process.stdout.write('\n\n');
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
    // Remove default tab completion
    completer: (line) => [[], line],
  });

  /** @type {ChatState} */
  const state = {
    config, provider, conversation, rl,
    abortController, isStreaming: false, multilineMode: false,
  };

  // Persistent SIGINT handler
  rl.on('SIGINT', () => handleSigInt(state));

  process.on('uncaughtException', (err) => {
    console.error(chalk.red(`\n  ✖ ${err.message}\n`));
    conversation.save().catch(() => {});
    process.exit(1);
  });

  // ── Display welcome ─────────────────────────────────────────────
  console.clear();
  showWelcome(config);

  // Show header bar
  console.log(renderHeader(config, { messageCount: conversation.messageCount }));
  console.log();

  // Resume previous conversation context
  if (conversation.messageCount > 0) {
    const msgs = conversation.messages;
    const recent = msgs.filter((m) => m.role !== 'system').slice(-6);
    for (const msg of recent) {
      process.stdout.write(renderMessage(msg) + '\n\n');
    }
    console.log(chalk.dim('  ── resuming ──\n'));
  }

  // Show footer
  console.log(renderFooter());
  console.log();

  // ── Main loop ──────────────────────────────────────────────────
  while (true) {
    const { text, isCommand } = await collectInput(state);
    if (!text) continue;

    // ── Handle slash commands ────────────────────────────────────
    if (isCommand) {
      const [cmdName, ...args] = text.slice(1).split(/\s+/);
      const command = COMMANDS[cmdName.toLowerCase()];

      if (command) {
        try {
          await command.handler(state, args);
          // Re-render footer in case multiline mode changed
          if (cmdName === 'multiline' || cmdName === 'clear') {
            console.log(renderFooter(state));
            console.log();
          }
        } catch (err) {
          console.error(chalk.red(`  ✖ ${err.message}\n`));
        }
      } else {
        console.log(chalk.red(`  ✖ Unknown: /${cmdName}`));
        console.log(chalk.dim('    Type /help for commands.\n'));
      }
      continue;
    }

    // ── Display user message in TUI ──────────────────────────────
    process.stdout.write(renderMessage({ role: 'user', content: text }) + '\n\n');

    // ── Send to provider ─────────────────────────────────────────
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
      const code = err.code || '';
      const msg = code === 'NETWORK_ERROR' ? `Network: ${err.message}`
        : code === 'RATE_LIMIT' ? `${err.message}`
          : code === 'API_ERROR' || err.name === 'ApiError' ? `${err.message}`
            : `Error: ${err.message}`;
      console.error(`  ${chalk.red('✖')} ${chalk.dim(msg)}\n`);
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
      console.error(chalk.dim(`  ⚠ ${err.message}\n`));
    }
  }
}

module.exports = { startChat };
