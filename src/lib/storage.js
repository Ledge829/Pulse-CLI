/**
 * Persistent conversation storage for Pulse CLI.
 *
 * Conversations are saved as individual JSON files under
 * ~/.pulse/conversations/. Each file stores the full message
 * array plus metadata.
 *
 * @module storage
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const DEFAULT_DIR = path.join(os.homedir(), '.pulse', 'conversations');
const MAX_HISTORY = 1000;

// ── Helpers ────────────────────────────────────────────────────────────

function nowISO() {
  return new Date().toISOString();
}

function generateId() {
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const randomPart = Math.random().toString(16).slice(2, 6);
  return `pc_${datePart}_${randomPart}`;
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// ── Conversation class ─────────────────────────────────────────────────

class Conversation {
  constructor(data = {}) {
    this.id = data.id || generateId();
    this.title = data.title || 'New conversation';
    this.model = data.model || 'unknown';
    this.provider = data.provider || 'unknown';
    this.messages = Array.isArray(data.messages) ? data.messages : [];
    this.createdAt = data.createdAt || nowISO();
    this.updatedAt = data.updatedAt || nowISO();
    this.directory = data.directory || DEFAULT_DIR;
  }

  get filePath() {
    return path.join(this.directory, `${this.id}.json`);
  }

  get messageCount() {
    return this.messages.filter((m) => m.role !== 'system').length;
  }

  get estimatedTokens() {
    const text = this.messages.map((m) => m.content).join(' ');
    return Math.ceil(text.length / 4);
  }

  addMessage(role, content) {
    this.messages.push({ role, content });
    this.updatedAt = nowISO();
    if (this.messages.length > MAX_HISTORY) {
      const sys = this.messages.filter((m) => m.role === 'system');
      const rest = this.messages.filter((m) => m.role !== 'system');
      const excess = rest.length - (MAX_HISTORY - sys.length);
      if (excess > 0) {
        this.messages = [...sys, ...rest.slice(excess)];
      }
    }
  }

  deriveTitle(userMessage) {
    if (!this.title || this.title === 'New conversation') {
      const cleaned = userMessage.replace(/\n/g, ' ').trim();
      this.title = cleaned.length > 60
        ? cleaned.slice(0, 57) + '...'
        : cleaned;
    }
  }

  toJSON() {
    return {
      id: this.id,
      title: this.title,
      model: this.model,
      provider: this.provider,
      messages: this.messages,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }

  async save() {
    ensureDir(this.directory);
    const json = JSON.stringify(this.toJSON(), null, 2);
    const tmp = this.filePath + '.tmp';
    await fs.promises.writeFile(tmp, json, 'utf-8');
    await fs.promises.rename(tmp, this.filePath);
  }

  async delete() {
    try {
      await fs.promises.unlink(this.filePath);
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }
  }
}

// ── Storage manager ────────────────────────────────────────────────────

class ConversationStore {
  constructor(directory) {
    this.directory = directory || DEFAULT_DIR;
    ensureDir(this.directory);
  }

  create(meta) {
    return new Conversation({ ...meta, directory: this.directory });
  }

  async load(id) {
    const filePath = path.join(this.directory, `${id}.json`);
    try {
      const raw = await fs.promises.readFile(filePath, 'utf-8');
      const data = JSON.parse(raw);
      return new Conversation({ ...data, directory: this.directory });
    } catch (err) {
      if (err.code === 'ENOENT') return null;
      if (err instanceof SyntaxError) {
        console.error(`  ⚠ Corrupted conversation file: ${filePath}`);
        const backup = filePath + '.corrupted.' + Date.now();
        await fs.promises.rename(filePath, backup).catch(() => {});
        return null;
      }
      throw err;
    }
  }

  async list(limit = 50) {
    let files;
    try {
      files = await fs.promises.readdir(this.directory);
    } catch {
      return [];
    }

    const jsonFiles = files.filter(
      (f) => f.endsWith('.json') && !f.includes('.tmp') && !f.includes('.corrupted')
    );

    const conversations = [];
    for (const file of jsonFiles) {
      try {
        const raw = await fs.promises.readFile(path.join(this.directory, file), 'utf-8');
        const data = JSON.parse(raw);
        conversations.push({
          id: data.id,
          title: data.title || 'Untitled',
          model: data.model,
          provider: data.provider,
          messageCount: Array.isArray(data.messages)
            ? data.messages.filter((m) => m.role !== 'system').length
            : 0,
          createdAt: data.createdAt,
          updatedAt: data.updatedAt,
        });
      } catch {
        // skip unreadable
      }
    }

    conversations.sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );

    return conversations.slice(0, limit);
  }

  async latest() {
    const list = await this.list(1);
    if (list.length === 0) return null;
    return this.load(list[0].id);
  }

  async delete(id) {
    const conv = await this.load(id);
    if (!conv) return false;
    await conv.delete();
    return true;
  }
}

module.exports = { Conversation, ConversationStore, DEFAULT_DIR };
