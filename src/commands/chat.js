/**
 * Interactive chat loop — the heart of Pulse CLI.
 *
 * Features:
 *   - Single-line input: Enter sends immediately (natural chat UX)
 *   - Multiline mode: /multiline toggle for pasting code
 *   - Structured UI with message formatting and status display
 *   - Tool call execution: agent executes LLM tool requests automatically
 *   - Streaming AI responses
 *   - Slash commands for model/provider switching, history, etc.
 *   - Conversation persistence and session resume
 *   - Graceful Ctrl+C handling
 *
 * @module commands/chat
 */

const readline = require('readline');
const chalk = require('chalk');
const { ConfigError } = require('../lib/errors');
const { ConversationStore } = require('../lib/storage');
const { createProvider } = require('../providers/index');
const { showWelcome } = require('../ui/banner');
const { startSpinner, failSpinner, succeedSpinner } = require('../ui/spinner');
const { getModels, formatModelEntry } = require('../lib/models');
const { createAgent, parseToolCalls } = require('../agent/index');

// ── Constants ──────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are Pulse CLI, an AI coding assistant running in a terminal.

- Help users with programming, debugging, code review, and technical questions.
- Keep responses concise and focused. Be direct and avoid fluff.
- Format code using markdown code blocks with language labels.
- Use bullet points for lists, not numbered lists unless order matters.
- You are provider-agnostic and help users regardless of which LLM backend they choose.
- When the user asks you to read a file, search code, or run a command, respond with a tool call in this format:
  {"name": "tool_name", "params": {"key": "value"}}
  Available tools: file_read (path, offset, limit), file_search (pattern, glob), file_tree (depth), git_status, git_log (count), terminal_run (command, description)
- Current date: ${new Date().toISOString().slice(0, 10)}.`;

const CONV_DIR = require('../lib/storage').DEFAULT_DIR;

// ── Slash commands ─────────────────────────────────────────────────────

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
    description: 'Switch model or list available',
    usage: '/model <name>',
    handler: (state, args) => changeModel(state, args),
  },
  models: {
    description: 'List available models for current provider',
    usage: '/models',
    handler: (state) => listModels(state),
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

// ── State ──────────────────────────────────────────────────────────────

/** @typedef {import('../lib/config').Config} Config */
/** @typedef {import('../providers/base').BaseProvider} BaseProvider */
/** @typedef {import('../lib/storage').Conversation} Conversation */

/**
 * @typedef {object} ChatState
 * @property {Config} config
 * @property {BaseProvider} provider
 * @property {Conversation} conversation
 * @property {readline.Interface} rl
 * @property {AbortController} abortController
 * @property {boolean} isStreaming
 * @property {boolean} multilineMode
 * @property {import('../agent/tools/registry').ToolRegistry} toolRegistry
 * @property {object} toolContext
 */

// ── Helpers ────────────────────────────────────────────────────────────

function showHelp() {
  console.log(chalk.bold('\n  ── Commands ──\n'));
  const pad = 30;
  for (const [name, cmd] of Object.entries(COMMANDS)) {
    if (name === 'quit') continue;
    console.log(`  ${chalk.cyan(cmd.usage.padEnd(pad))} ${chalk.dim(cmd.description)}`);
  }
  console.log();
  console.log(`  ${chalk.dim('Enter'.padEnd(pad))} ${chalk.dim('Send message')}`);
  console.log(`  ${chalk.dim('Ctrl+C'.padEnd(pad))} ${chalk.dim('Cancel or exit')}`);
  console.log();
}

function showHistory(state, args) {
  const showAll = args.includes('--all');
  const messages = state.conversation.messages;
  if (messages.length === 0) {
    console.log(chalk.dim('\n  No messages yet.\n'));
    return;
  }
  const toShow = showAll ? messages : messages.slice(-10);
  console.log(chalk.bold(`\n  ── History (${toShow.length}/${messages.length}) ──\n`));
  for (const msg of toShow) {
    if (msg.role === 'system') continue;
    const label = msg.role === 'user' ? chalk.green('You') : chalk.cyan('Assistant');
    const preview = msg.content.length > 200 ? msg.content.slice(0, 200) + '…' : msg.content;
    console.log(`  ${label}: ${chalk.dim(preview)}\n`);
  }
}

function changeModel(state, args) {
  const model = args[0];
  if (!model) {
    const models = getModels(state.config.provider);
    console.log(chalk.bold(`\n  Models for ${state.config.provider}:\n`));
    for (const m of models) {
      const tag = m.free ? chalk.green(' [FREE]') : '';
      console.log(`  ${chalk.cyan('•')} ${chalk.bold(m.name)}${tag}`);
      console.log(`    ${chalk.dim(m.description)}`);
    }
    console.log(chalk.dim(`\n  Current: ${chalk.bold(state.config.model)}\n`));
    console.log(chalk.dim('  Use /model <name> to switch.\n'));
    return;
  }
  state.config = { ...state.config, model };
  state.conversation.model = model;
  console.log(chalk.dim(`\n  Model → ${chalk.bold(model)}\n`));
}

function listModels(state) {
  const models = getModels(state.config.provider);
  if (models.length === 0) {
    console.log(chalk.dim(`\n  No curated models for ${state.config.provider}. Use /model <name> to set one.\n`));
    return;
  }
  console.log(chalk.bold(`\n  ${state.config.provider} models:\n`));
  for (const m of models) {
    const tag = m.free ? chalk.green(' ✓ FREE') : chalk.yellow('  paid');
    const current = m.name === state.config.model ? chalk.cyan(' ← active') : '';
    console.log(`  ${chalk.cyan('•')} ${chalk.bold(m.name)}${tag}${current}`);
    console.log(`    ${chalk.dim(m.description)}`);
  }
  console.log();
}

function changeProvider(state, args) {
  const name = args[0];
  if (!name) {
    console.log(chalk.dim(`\n  Provider: ${chalk.bold(state.config.provider)}`));
    console.log(chalk.dim('  Use /provider <name> to switch.\n'));
    return;
  }
  try {
    const newConfig = { ...state.config, provider: name };
    state.provider = createProvider(newConfig);
    state.config = newConfig;
    state.conversation.provider = name;
    // Recreate agent with new context
    const agent = createAgent({ cwd: process.cwd() });
    state.toolRegistry = agent.registry;
    state.toolContext = agent.context;
    // Show model info for new provider
    const models = getModels(name);
    if (models.length > 0) {
      state.config.model = models[0].name;
      state.conversation.model = models[0].name;
    }
    console.log(chalk.green(`\n  ✓ Provider → ${chalk.bold(name)}`));
    console.log(chalk.dim(`    Model → ${chalk.bold(state.config.model)}\n`));
  } catch (err) {
    console.error(chalk.red(`  ✖ ${err.message}\n`));
  }
}

async function startNewConversation(state) {
  if (state.conversation.messageCount > 0) {
    try { await state.conversation.save(); } catch { /* ignore */ }
  }
  const store = new ConversationStore(CONV_DIR);
  state.conversation = store.create({
    model: state.config.model,
    provider: state.config.provider,
    messages: [{ role: 'system', content: SYSTEM_PROMPT }],
  });
  console.log(chalk.dim('\n  New conversation started.\n'));
}

function toggleMultiline(state) {
  state.multilineMode = !state.multilineMode;
  console.log(chalk.dim(`\n  Multiline: ${state.multilineMode ? 'ON — empty Enter to send' : 'OFF — Enter sends immediately'}\n`));
}

// ── SIGINT ─────────────────────────────────────────────────────────────

function handleSigInt(state) {
  if (state.isStreaming) {
    state.abortController.abort();
    console.log(chalk.dim('\n  Cancelled.\n'));
    return;
  }
  try { state.conversation.save(); } catch { /* ignore */ }
  console.log(chalk.dim('\n  Goodbye!\n'));
  process.exit(0);
}

// ── Input ──────────────────────────────────────────────────────────────

async function collectInput(state) {
  const buffer = [];

  return new Promise((resolve) => {
    state.rl.removeAllListeners('line');

    if (!state.multilineMode) {
      // Single-line: Enter sends immediately
      state.rl.on('line', (line) => {
        const trimmed = line.trimEnd();
        if (!trimmed) { state.rl.prompt(); return; }
        resolve({
          text: trimmed,
          isCommand: trimmed.startsWith('/'),
        });
      });
      state.rl.setPrompt(chalk.cyan('╰─➤  '));
      state.rl.prompt();
    } else {
      // Multiline: buffer until empty line
      let first = true;
      const show = () => {
        state.rl.setPrompt(first ? chalk.cyan('╰─➤  ') : chalk.dim('│  '));
        first = false;
        state.rl.prompt();
      };
      state.rl.on('line', (line) => {
        const t = line.trimEnd();
        if (buffer.length === 0 && t.startsWith('/')) {
          resolve({ text: t, isCommand: true });
          return;
        }
        if (t === '' && buffer.length > 0) {
          resolve({ text: buffer.join('\n'), isCommand: false });
          return;
        }
        buffer.push(line);
        show();
      });
      show();
    }
  });
}

// ── Tool calling loop ──────────────────────────────────────────────────

/**
 * Process a message through the agent tool loop.
 * Detects tool calls, executes them, and returns the final response.
 */
async function processWithTools(state, userMessage) {
  // Set up the agent tools
  const agent = createAgent({ cwd: process.cwd() });

  // Prepare messages including system prompt
  const messages = state.conversation.messages.map((m) => ({
    role: m.role, content: m.content,
  }));

  // Add the user's new message
  messages.push({ role: 'user', content: userMessage });

  let finalResponse = '';
  let toolRound = 0;
  const MAX_TOOL_ROUNDS = 10;

  while (toolRound < MAX_TOOL_ROUNDS) {
    toolRound++;

    // Get response from provider (non-streaming for tool detection)
    const spinner = startSpinner(toolRound === 1
      ? '  Processing…'
      : `  Tool round ${toolRound}…`);

    let response;
    try {
      response = await state.provider.chatComplete(messages, state.abortController.signal);
    } catch (err) {
      failSpinner(spinner, err.message || 'Request failed');
      throw err;
    }

    succeedSpinner(spinner);

    const content = response.content || '';
    if (!content.trim()) {
      finalResponse = '';
      break;
    }

    // Check if the response contains tool calls
    const toolCalls = parseToolCalls(content);

    if (toolCalls.length === 0) {
      // No tool calls — this is the final response
      finalResponse = content;
      break;
    }

    // Execute tool calls and add results
    const results = [];
    for (const call of toolCalls) {
      console.log(`  ${chalk.cyan('●')} ${chalk.dim(call.name)} ${JSON.stringify(call.params)}`);
      try {
        const result = await agent.registry.execute(call.name, call.params, agent.context);
        results.push({
          role: 'tool',
          name: call.name,
          content: typeof result === 'string' ? result : JSON.stringify(result, null, 2),
        });
      } catch (err) {
        results.push({
          role: 'tool',
          name: call.name,
          content: `Error: ${err.message}`,
        });
      }
    }

    // Add assistant response and tool results to messages
    messages.push({ role: 'assistant', content });
    for (const r of results) {
      messages.push({ role: 'user', content: `[Tool ${r.name} result]\n${r.content}` });
    }
  }

  return finalResponse;
}

// ── Streaming response display ─────────────────────────────────────────

async function streamFinalResponse(state) {
  const messages = state.conversation.messages.map((m) => ({
    role: m.role, content: m.content,
  }));

  const spinner = startSpinner('  …');
  let full = '';
  let gotFirst = false;

  try {
    for await (const chunk of state.provider.streamChat(messages, state.abortController.signal)) {
      if (!gotFirst) {
        gotFirst = true;
        spinner.stop();
        process.stdout.write(`  ${chalk.cyan('Assistant')} ${chalk.dim(`[${state.config.model}]`)}\n  `);
      }
      if (chunk) { full += chunk; process.stdout.write(chunk); }
    }
    if (!gotFirst) { failSpinner(spinner, 'Empty response'); return ''; }
    process.stdout.write('\n\n');
    return full;
  } catch (err) {
    if (!gotFirst) spinner.stop();
    if (err.name !== 'AbortError') process.stdout.write('\n');
    throw err;
  }
}

// ── Main chat loop ─────────────────────────────────────────────────────

async function startChat(config) {
  const store = new ConversationStore(CONV_DIR);
  let abortController = new AbortController();

  // Load or create conversation
  let conversation = await store.latest().catch(() => null);
  if (!conversation) {
    conversation = store.create({
      model: config.model, provider: config.provider,
      messages: [{ role: 'system', content: SYSTEM_PROMPT }],
    });
  }

  // Create provider
  let provider;
  try { provider = createProvider(config); } catch (err) {
    if (err instanceof ConfigError) {
      console.error(chalk.red(`  ✖ ${err.message}`));
      console.error(chalk.dim('  Run `pulse configure` to set up.\n'));
      process.exit(1);
    }
    throw err;
  }

  // Set up agent tools for this session
  const agent = createAgent({ cwd: process.cwd() });

  // Readline interface
  const rl = readline.createInterface({
    input: process.stdin, output: process.stdout,
    terminal: true, historySize: 100,
    completer: () => [[], ''], // no tab complete
  });

  const state = {
    config, provider, conversation, rl, abortController,
    isStreaming: false, multilineMode: false,
    toolRegistry: agent.registry, toolContext: agent.context,
  };

  rl.on('SIGINT', () => handleSigInt(state));

  process.on('uncaughtException', (err) => {
    console.error(chalk.red(`\n  ✖ ${err.message}\n`));
    try { conversation.save(); } catch { /* ignore */ }
    process.exit(1);
  });

  // ── Welcome ────────────────────────────────────────────────────────
  console.clear();
  showWelcome(config);

  // Resume context
  if (conversation.messageCount > 0) {
    const last = conversation.messages.filter((m) => m.role !== 'system').slice(-2);
    if (last.length > 0) {
      console.log(chalk.dim('  ── Resuming ──\n'));
      for (const msg of last) {
        const label = msg.role === 'user' ? chalk.green('You') : chalk.cyan('Assistant');
        const preview = msg.content.length > 300 ? msg.content.slice(0, 300) + '…' : msg.content;
        console.log(`  ${label}: ${chalk.dim(preview)}\n`);
      }
    }
  }

  // ── Main loop ──────────────────────────────────────────────────────
  while (true) {
    const { text, isCommand } = await collectInput(state);
    if (!text) continue;

    // ── Slash commands ───────────────────────────────────────────────
    if (isCommand) {
      const [cmdName, ...args] = text.slice(1).split(/\s+/);
      const cmd = COMMANDS[cmdName.toLowerCase()];
      if (cmd) {
        try { await cmd.handler(state, args); } catch (err) {
          console.error(chalk.red(`  ✖ ${err.message}\n`));
        }
      } else {
        console.log(chalk.red(`  ✖ Unknown: /${cmdName}`));
        console.log(chalk.dim('    Type /help for commands.\n'));
      }
      continue;
    }

    // ── User message ─────────────────────────────────────────────────
    console.log(`  ${chalk.green('You')} ${chalk.dim(`[${state.config.model}]`)}`);
    console.log(`  ${text}\n`);

    conversation.addMessage('user', text);
    conversation.deriveTitle(text);

    abortController = new AbortController();
    state.abortController = abortController;
    state.isStreaming = true;

    try {
      // Phase 1: Process with tool support
      const finalResponse = await processWithTools(state, text);

      if (state.abortController.signal.aborted) {
        state.isStreaming = false;
        continue;
      }

      if (finalResponse) {
        // Phase 2: Stream the final response
        conversation.addMessage('assistant', finalResponse);
      } else {
        // If no final response from tool loop, stream directly
        const responseText = await streamFinalResponse(state);
        if (responseText) conversation.addMessage('assistant', responseText);
      }
    } catch (err) {
      if (err.name === 'AbortError') { state.isStreaming = false; continue; }
      const code = err.code || '';
      const msg = code === 'NETWORK_ERROR' ? `Network: ${err.message}`
        : code === 'RATE_LIMIT' ? `${err.message}`
          : code === 'API_ERROR' ? `${err.message}`
            : `${err.message}`;
      console.error(`  ${chalk.red('✖')} ${chalk.dim(msg)}\n`);
    } finally {
      state.isStreaming = false;
    }

    // Save after each exchange
    try { await conversation.save(); } catch { /* ignore */ }
  }
}

module.exports = { startChat };
