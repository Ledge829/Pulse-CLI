/**
 * Pulse CLI chat — minimal, reliable, Claude Code-like.
 *
 *   - Enter sends immediately
 *   - /multiline for code paste mode
 *   - Tool calls detected & executed automatically
 *   - Always streams responses to screen
 *   - Clean per-message display
 *
 * @module commands/chat
 */

const readline = require('readline');
const chalk = require('chalk');
const { ConfigError } = require('../lib/errors');
const { ConversationStore } = require('../lib/storage');
const { createProvider } = require('../providers/index');
const { showWelcome } = require('../ui/banner');
const { startSpinner, succeedSpinner, failSpinner } = require('../ui/spinner');
const { getModels } = require('../lib/models');
const { createAgent, parseToolCalls } = require('../agent/index');

const SYSTEM_PROMPT = `You are Pulse CLI, an AI coding assistant running in a terminal.

Help with programming, debugging, code review, and technical questions.
Keep responses concise. Format code with markdown code blocks.
Current date: ${new Date().toISOString().slice(0, 10)}.

When asked to read files, search code, or run commands, output ONLY a JSON tool call:
{"tool":"file_read","path":"file.js"}
{"tool":"file_search","pattern":"function"}
{"tool":"file_tree","depth":3}
{"tool":"git_status":{}}
{"tool":"git_log","count":10}
{"tool":"terminal_run","command":"npm test"}
Do NOT explain the tool call — just output the JSON.`;
const CONV_DIR = require('../lib/storage').DEFAULT_DIR;

// ── Slash commands ─────────────────────────────────────────────────────
const COMMANDS = {
  help:    { desc: 'Show this help', usage: '/help', handler: (s, a) => showHelp(s, a) },
  clear:   { desc: 'Clear screen',  usage: '/clear', handler: () => console.clear() },
  exit:    { desc: 'Exit Pulse CLI', usage: '/exit', handler: () => process.exit(0) },
  quit:    { desc: 'Exit Pulse CLI', usage: '/quit', handler: () => process.exit(0) },
  model:   { desc: 'Show/switch model', usage: '/model <name>', handler: (s, a) => changeModel(s, a) },
  models:  { desc: 'List models for this provider', usage: '/models', handler: (s) => listModels(s) },
  provider:{ desc: 'Show/switch provider', usage: '/provider <name>', handler: (s, a) => changeProvider(s, a) },
  new:     { desc: 'New conversation', usage: '/new', handler: (s) => newConv(s) },
  multiline:{desc: 'Toggle multiline', usage: '/multiline', handler: (s) => { s.multiline=!s.multiline; console.log(chalk.dim(s.multiline?'Multiline: ON':'Multiline: OFF\n')); }},
};

function showHelp() {
  console.log(chalk.bold('\n  Commands\n'));
  for (const [n, c] of Object.entries(COMMANDS)) {
    if (n === 'quit') continue;
    console.log(`  ${chalk.cyan(c.usage.padEnd(28))} ${chalk.dim(c.desc)}`);
  }
  console.log(`  ${chalk.dim('Enter'.padEnd(28))} ${chalk.dim('Send message')}`);
  console.log(`  ${chalk.dim('Ctrl+C'.padEnd(28))} ${chalk.dim('Cancel / exit')}`);
  console.log();
}

function changeModel(s, a) {
  if (!a[0]) {
    const models = getModels(s.config.provider);
    console.log(chalk.bold(`\n  ${s.config.provider} models:\n`));
    for (const m of models) {
      const tag = m.free ? chalk.green(' FREE') : '';
      const cur = m.name === s.config.model ? chalk.cyan(' ←') : '';
      console.log(`  ${chalk.cyan('•')} ${chalk.bold(m.name)}${tag}${cur}`);
      console.log(`    ${chalk.dim(m.description)}`);
    }
    console.log(chalk.dim(`\n  Use /model <name>\n`));
    return;
  }
  s.config.model = a[0];
  s.conversation.model = a[0];
  console.log(chalk.dim(`\n  Model → ${chalk.bold(a[0])}\n`));
}

function listModels(s) {
  const models = getModels(s.config.provider);
  if (!models.length) { console.log(chalk.dim(`\n  No model list for ${s.config.provider}\n`)); return; }
  console.log(chalk.bold(`\n  ${s.config.provider}:\n`));
  for (const m of models) {
    const tag = m.free ? chalk.green(' FREE') : chalk.yellow(' paid');
    const cur = m.name === s.config.model ? chalk.cyan(' ←') : '';
    console.log(`  ${chalk.cyan('•')} ${chalk.bold(m.name)}${tag}${cur}`);
  }
  console.log();
}

function changeProvider(s, a) {
  if (!a[0]) { console.log(chalk.dim(`  Provider: ${chalk.bold(s.config.provider)}\n`)); return; }
  try {
    const cfg = { ...s.config, provider: a[0] };
    s.provider = createProvider(cfg);
    s.config = cfg;
    s.conversation.provider = a[0];
    const models = getModels(a[0]);
    if (models.length) { s.config.model = models[0].name; s.conversation.model = models[0].name; }
    const ag = createAgent({ cwd: process.cwd() });
    s.registry = ag.registry;
    s.ctx = ag.context;
    console.log(chalk.green(`  → ${a[0]} · ${s.config.model}\n`));
  } catch (e) { console.log(chalk.red(`  ✖ ${e.message}\n`)); }
}

async function newConv(s) {
  if (s.conversation.messageCount > 0) try { await s.conversation.save(); } catch {}
  const store = new ConversationStore(CONV_DIR);
  s.conversation = store.create({ model: s.config.model, provider: s.config.provider, messages: [{ role: 'system', content: SYSTEM_PROMPT }] });
  console.log(chalk.dim('  New conversation.\n'));
}

// ── Input ──────────────────────────────────────────────────────────────
async function getInput(s) {
  const buf = [];
  return new Promise((r) => {
    s.rl.removeAllListeners('line');
    if (!s.multiline) {
      s.rl.on('line', (l) => {
        const t = l.trimEnd();
        if (!t) { s.rl.prompt(); return; }
        r({ text: t, cmd: t.startsWith('/') });
      });
      s.rl.setPrompt(chalk.cyan('╰─➤  '));
      s.rl.prompt();
    } else {
      let first = true;
      const p = () => { s.rl.setPrompt(first ? chalk.cyan('╰─➤  ') : chalk.dim('│  ')); first = false; s.rl.prompt(); };
      s.rl.on('line', (l) => {
        const t = l.trimEnd();
        if (!buf.length && t.startsWith('/')) { r({ text: t, cmd: true }); return; }
        if (t === '' && buf.length) { r({ text: buf.join('\n'), cmd: false }); return; }
        buf.push(l); p();
      });
      p();
    }
  });
}

// ── Tool detection ─────────────────────────────────────────────────────
function detectToolCalls(text) {
  const calls = [];
  try {
    const p = JSON.parse(text);
    if (p.tool && p.name) calls.push({ name: p.tool || p.name, params: p.params || p });
    else if (p.name && p.params) calls.push({ name: p.name, params: p.params });
    else if (p.tool) calls.push({ name: p.tool, params: Object.fromEntries(Object.entries(p).filter(([k]) => k !== 'tool')) });
    else if (Array.isArray(p)) { for (const item of p) { if (item.tool) calls.push({ name: item.tool, params: item }); } }
  } catch {}
  // Also check for XML format
  const xmlRe = /<tool\s+name="([^"]+)">([\s\S]*?)<\/tool>/g;
  let m;
  while ((m = xmlRe.exec(text)) !== null) {
    const params = {};
    const pRe = /<param\s+name="([^"]+)">([\s\S]*?)<\/param>/g;
    let pm;
    while ((pm = pRe.exec(m[2])) !== null) params[pm[1]] = pm[2].trim();
    calls.push({ name: m[1], params });
  }
  return calls;
}

// ── Core: process one user message ─────────────────────────────────────
async function handleMessage(s, text) {
  s.conversation.addMessage('user', text);
  s.conversation.deriveTitle(text);

  const ac = new AbortController();
  s.ac = ac;
  s.streaming = true;

  // ── First: try non-streaming to detect tool calls ──────────────
  let final = '';
  const msgs = s.conversation.messages.map(m => ({ role: m.role, content: m.content }));

  for (let round = 0; round < 10; round++) {
    if (ac.signal.aborted) { s.streaming = false; return; }

    const sp = startSpinner(round === 0 ? '  Processing…' : `  Tool round ${round}…`);

    let resp;
    try {
      resp = await s.provider.chatComplete(msgs, ac.signal);
    } catch (err) {
      failSpinner(sp, err.message || 'Request failed');
      s.streaming = false;
      throw err;
    }
    succeedSpinner(sp);

    const content = (resp.content || '').trim();
    if (!content) { s.streaming = false; return; }

    // Detect tool calls
    const calls = detectToolCalls(content);
    if (!calls.length) {
      // No tools — this is the final response. Stream it.
      s.streaming = false;
      if (!s.multiline) {
        // Show clean response
        console.log(`  ${chalk.cyan('Assistant')} ${chalk.dim(`[${s.config.model}]`)}`);
        for (const line of content.split('\n')) {
          console.log(`  ${line}`);
        }
        console.log();
      } else {
        // Fall through to streaming
      }
      final = content;
      s.streaming = false;
      s.conversation.addMessage('assistant', content);
      try { await s.conversation.save(); } catch {}
      return;
    }

    // ── Execute tool calls ───────────────────────────────────────
    console.log(`  ${chalk.cyan('▸ Tools:')}`);
    const results = [];
    for (const c of calls) {
      console.log(`    ${chalk.cyan('·')} ${chalk.bold(c.name)} ${chalk.dim(JSON.stringify(c.params))}`);
      try {
        const res = await s.registry.execute(c.name, c.params, s.ctx);
        const txt = typeof res === 'string' ? res : JSON.stringify(res, null, 2);
        results.push({ role: 'user', content: `[${c.name} result]\n${txt}` });
        console.log(`    ${chalk.green('✓')} ${chalk.dim(txt.slice(0, 100))}${txt.length > 100 ? '…' : ''}`);
      } catch (err) {
        results.push({ role: 'user', content: `[${c.name} error]\n${err.message}` });
        console.log(`    ${chalk.red('✖')} ${chalk.dim(err.message)}`);
      }
    }

    // Add to messages and loop for next response
    msgs.push({ role: 'assistant', content });
    msgs.push(...results);
    console.log();
  }

  s.streaming = false;
  // Fallback: stream the response directly
  try {
    const sp = startSpinner('  …');
    let got = false;
    for await (const chunk of s.provider.streamChat(
      s.conversation.messages.map(m => ({ role: m.role, content: m.content })),
      ac.signal
    )) {
      if (!got) { got = true; sp.stop(); console.log(`  ${chalk.cyan('Assistant')} ${chalk.dim(`[${s.config.model}]`)}`); }
      if (chunk) { final += chunk; process.stdout.write(chunk); }
    }
    if (!got) { sp.stop(); }
    if (got) process.stdout.write('\n\n');
    if (final) {
      s.conversation.addMessage('assistant', final);
      try { await s.conversation.save(); } catch {}
    }
  } catch (err) {
    if (err.name !== 'AbortError') console.error(`  ${chalk.red('✖')} ${chalk.dim(err.message)}\n`);
  }
}

// ── Main loop ──────────────────────────────────────────────────────────
async function startChat(config) {
  const store = new ConversationStore(CONV_DIR);
  let conv = await store.latest().catch(() => null);
  if (!conv) conv = store.create({ model: config.model, provider: config.provider, messages: [{ role: 'system', content: SYSTEM_PROMPT }] });

  let prov;
  try { prov = createProvider(config); } catch (err) {
    if (err instanceof ConfigError) { console.error(chalk.red(`  ✖ ${err.message}\n  Run pulse configure\n`)); process.exit(1); }
    throw err;
  }

  const ag = createAgent({ cwd: process.cwd() });
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true, historySize: 100, completer: () => [[], ''] });

  const state = { config, provider: prov, conversation: conv, rl, ac: new AbortController(), streaming: false, multiline: false, registry: ag.registry, ctx: ag.context };
  rl.on('SIGINT', () => {
    if (state.streaming) { state.ac.abort(); console.log(chalk.dim('\n  Cancelled.\n')); return; }
    try { state.conversation.save(); } catch {}
    console.log(chalk.dim('\n  Goodbye!\n')); process.exit(0);
  });

  console.clear();
  showWelcome(config);

  if (conv.messageCount > 0) {
    const last = conv.messages.filter(m => m.role !== 'system').slice(-2);
    if (last.length) {
      console.log(chalk.dim('  ── Resuming ──\n'));
      for (const m of last) {
        const l = m.role === 'user' ? chalk.green('You') : chalk.cyan('Assistant');
        const p = m.content.length > 300 ? m.content.slice(0, 300) + '…' : m.content;
        console.log(`  ${l}: ${chalk.dim(p)}\n`);
      }
    }
  }

  // Status line
  console.log(chalk.dim(`  ${config.provider} · ${config.model}  |  /help for commands\n`));

  while (true) {
    const { text, cmd } = await getInput(state);
    if (!text) continue;

    if (cmd) {
      const [cn, ...ca] = text.slice(1).split(/\s+/);
      const c = COMMANDS[cn.toLowerCase()];
      if (c) { try { await c.handler(state, ca); } catch (e) { console.log(chalk.red(`  ✖ ${e.message}\n`)); } }
      else { console.log(chalk.red(`  ✖ /${cn}\n`)); }
      continue;
    }

    // Show user message
    console.log(`  ${chalk.green('You')} ${chalk.dim(`[${state.config.model}]`)}`);
    for (const line of text.split('\n')) console.log(`  ${line}`);
    console.log();

    // Process
    try { await handleMessage(state, text); } catch (err) {
      if (err.name === 'AbortError') continue;
      const msg = err.code === 'NETWORK_ERROR' ? `Network: ${err.message}` : err.message;
      console.log(`  ${chalk.red('✖')} ${chalk.dim(msg)}\n`);
    }
  }
}

module.exports = { startChat };
