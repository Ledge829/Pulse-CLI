/**
 * Conversation history management for Pulse CLI.
 *
 * Provides listing, viewing, and deleting stored conversations.
 * Also the backend for the `/history` slash command.
 *
 * @module commands/history
 */

const chalk = require('chalk');
const { ConversationStore, DEFAULT_DIR } = require('../lib/storage');

// ── Display helpers ────────────────────────────────────────────────────

function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hours = String(d.getHours()).padStart(2, '0');
  const mins = String(d.getMinutes()).padStart(2, '0');
  return `${month}-${day} ${hours}:${mins}`;
}

function truncate(str, max) {
  if (!str || str.length <= max) return str || '';
  return str.slice(0, max - 1) + '…';
}

// ── Commands ───────────────────────────────────────────────────────────

/**
 * List all stored conversations.
 * @param {object} [opts]
 * @param {number} [opts.limit=20]
 * @returns {Promise<void>}
 */
async function listConversations(opts = {}) {
  const limit = opts.limit || 20;
  const store = new ConversationStore(DEFAULT_DIR);
  const conversations = await store.list(limit);

  if (conversations.length === 0) {
    console.log(chalk.dim('\n  No conversations found.\n'));
    return;
  }

  console.log(chalk.bold(`\n  ── Conversations (${conversations.length}) ──\n`));

  for (const conv of conversations) {
    const date = formatDate(conv.updatedAt);
    const id = chalk.cyan(truncate(conv.id, 20));
    const title = chalk.bold(truncate(conv.title, 50));
    const meta = chalk.dim(`${conv.messageCount} msgs · ${conv.provider} · ${conv.model}`);
    console.log(`  ${id}  ${title}`);
    console.log(`       ${meta}  ${date}\n`);
  }

  console.log(chalk.dim('  Use `pulse history <id>` to view a conversation.\n'));
}

/**
 * View a specific conversation by ID.
 * @param {string} id
 * @returns {Promise<void>}
 */
async function viewConversation(id) {
  const store = new ConversationStore(DEFAULT_DIR);
  const conv = await store.load(id);

  if (!conv) {
    console.error(chalk.red(`  ✖ Conversation "${id}" not found.`));
    return;
  }

  console.log(chalk.bold(`\n  ── ${conv.title} ──\n`));
  console.log(chalk.dim(`  Model: ${conv.model} · Provider: ${conv.provider}`));
  console.log(chalk.dim(`  Created: ${conv.createdAt} · Updated: ${conv.updatedAt}\n`));

  for (const msg of conv.messages) {
    if (msg.role === 'system') continue;
    const label = msg.role === 'user' ? chalk.green('You:') : chalk.cyan('Assistant:');
    console.log(`  ${label}`);
    for (const line of msg.content.split('\n')) {
      console.log(`    ${line}`);
    }
    console.log();
  }
}

/**
 * Delete a conversation by ID.
 * @param {string} id
 * @returns {Promise<boolean>}
 */
async function deleteConversation(id) {
  const store = new ConversationStore(DEFAULT_DIR);
  return store.delete(id);
}

module.exports = { listConversations, viewConversation, deleteConversation };
