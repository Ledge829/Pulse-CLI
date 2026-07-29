/**
 * JSON configuration store for Pulse CLI.
 *
 * Manages structured configuration in ~/.pulse/*.json files,
 * supporting multi-provider storage, preferences, and metadata.
 * Complements the .env-based config system — .env always wins at runtime.
 *
 * @module lib/config-store
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

// ── Paths ──────────────────────────────────────────────────────────────

/** @returns {string} ~/.pulse directory */
function pulseDir() {
  return path.join(os.homedir(), '.pulse');
}

/** @returns {string} ~/.pulse/config.json — providers + preferences */
function configPath() {
  return path.join(pulseDir(), 'config.json');
}

/** @returns {string} ~/.pulse/providers.json — multi-provider store */
function providersPath() {
  return path.join(pulseDir(), 'providers.json');
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// ── Generic JSON store ────────────────────────────────────────────────

class JsonStore {
  constructor(filePath, defaults = {}) {
    this.filePath = filePath;
    this.defaults = defaults;
    this._cache = null;
  }

  /** Load or create default. */
  load() {
    if (this._cache) return this._cache;
    ensureDir(path.dirname(this.filePath));
    try {
      const raw = fs.readFileSync(this.filePath, 'utf-8');
      this._cache = { ...this.defaults, ...JSON.parse(raw) };
    } catch {
      this._cache = { ...this.defaults };
    }
    return this._cache;
  }

  /** Persist current state. */
  save() {
    ensureDir(path.dirname(this.filePath));
    const tmp = this.filePath + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(this._cache || this.defaults, null, 2), 'utf-8');
    fs.renameSync(tmp, this.filePath);
  }

  /** Get a key. */
  get(key, fallback) {
    this.load();
    return this._cache[key] !== undefined ? this._cache[key] : fallback;
  }

  /** Set a key and persist. */
  set(key, value) {
    this.load();
    this._cache[key] = value;
    this.save();
  }

  /** Delete a key and persist. */
  delete(key) {
    this.load();
    delete this._cache[key];
    this.save();
  }

  /** Invalidate in-memory cache (force re-read from disk). */
  refresh() {
    this._cache = null;
    return this.load();
  }

  /** Check if the store file exists. */
  exists() {
    return fs.existsSync(this.filePath);
  }
}

// ── Provider store ─────────────────────────────────────────────────────

class ProviderStore extends JsonStore {
  constructor() {
    super(providersPath(), { providers: {}, activeProvider: null });
  }

  /** List all configured providers. */
  list() {
    const data = this.load();
    return Object.entries(data.providers || {}).map(([name, cfg]) => ({
      name,
      ...cfg,
      active: name === data.activeProvider,
    }));
  }

  /** Get a specific provider config. */
  getProvider(name) {
    const data = this.load();
    const prov = (data.providers || {})[name];
    if (!prov) return null;
    return { name, ...prov, active: name === data.activeProvider };
  }

  /** Add or update a provider. */
  setProvider(name, config) {
    const data = this.load();
    if (!data.providers) data.providers = {};
    data.providers[name] = config;
    this.save();
  }

  /** Remove a provider. */
  removeProvider(name) {
    const data = this.load();
    if (!data.providers) return false;
    delete data.providers[name];
    if (data.activeProvider === name) data.activeProvider = null;
    this.save();
    return true;
  }

  /** Set the active provider. */
  setActive(name) {
    const data = this.load();
    if (!data.providers || !data.providers[name]) return false;
    data.activeProvider = name;
    this.save();
    return true;
  }

  /** Get the active provider name. */
  getActive() {
    return this.load().activeProvider;
  }
}

// ── Preferences store ─────────────────────────────────────────────────

class PreferencesStore extends JsonStore {
  constructor() {
    super(configPath(), {
      firstRun: true,
      version: '1.0.0',
      telemetry: false,
      lastProvider: 'openai',
      lastModel: null,
      editor: null,
      termuxOptimizations: false,
      batteryAware: false,
      startupBehavior: 'chat',
      theme: 'default',
    });
  }

  /** Mark first-run as complete. */
  completeFirstRun() {
    this.set('firstRun', false);
  }

  /** Check if this is the first run. */
  isFirstRun() {
    return this.get('firstRun', true) !== false;
  }

  /** Detect Termux environment. */
  static isTermux() {
    return Boolean(
      process.env.TERMUX_VERSION ||
      process.env.PREFIX === '/data/data/com.termux/files/usr' ||
      (process.platform === 'android')
    );
  }

  /** Detect low-resource environment. */
  static isLowResource() {
    const mem = require('os').totalmem();
    return mem < 2 * 1024 ** 3; // Less than 2GB RAM
  }
}

// ── Exports ────────────────────────────────────────────────────────────

module.exports = {
  JsonStore,
  ProviderStore,
  PreferencesStore,
  pulseDir,
};
