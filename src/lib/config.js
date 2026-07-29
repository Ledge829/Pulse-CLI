/**
 * Configuration loader for Pulse CLI.
 *
 * Loads environment variables from:
 *   1. $PWD/.env          (project-level)
 *   2. ~/.pulse/.env      (user-level)
 *   3. process.env        (explicit injection, e.g. Termux or CI)
 *
 * Later sources override earlier ones so explicit env vars always win.
 */

const path = require('path');
const fs = require('fs');
const os = require('os');

const dotenv = require('dotenv');
const { PulseError } = require('./errors');

// ── Provider defaults ──────────────────────────────────────────────────
/** @type {Record<string, {baseUrl: string, defaultModel: string}>} */
const PROVIDER_DEFAULTS = Object.freeze({
  openai: {
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o',
  },
  kimi: {
    baseUrl: 'https://api.moonshot.cn/v1',
    defaultModel: 'moonshot-v1-8k',
  },
  openrouter: {
    baseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: 'gpt-4o',
  },
  gemini: {
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    defaultModel: 'gemini-2.0-flash',
  },
  ollama: {
    baseUrl: 'http://localhost:11434/v1',
    defaultModel: 'llama3.2',
  },
});

// ── Config descriptor ──────────────────────────────────────────────────

/** @typedef {'openai'|'kimi'|'openrouter'|'gemini'|'ollama'} ProviderName */

/** @typedef {{ provider: ProviderName, apiKey: string, baseUrl: string, model: string }} Config */

// ── Helpers ────────────────────────────────────────────────────────────

/**
 * Load .env files from a list of paths. Skips missing files silently.
 * @param {string[]} candidates
 * @returns {Record<string, string>}
 */
function loadEnvFiles(candidates) {
  const merged = {};
  for (const file of candidates) {
    if (fs.existsSync(file)) {
      const parsed = dotenv.parse(fs.readFileSync(file, 'utf-8'));
      Object.assign(merged, parsed);
    }
  }
  return merged;
}

/**
 * Resolve the absolute path to the user-level config directory.
 * @returns {string}
 */
function userConfigDir() {
  return path.join(os.homedir(), '.pulse');
}

// ── Public API ─────────────────────────────────────────────────────────

/**
 * Load and validate configuration.
 *
 * @param {object} [overrides] - Inline overrides (e.g. from CLI flags).
 * @param {string}  [overrides.provider]
 * @param {string}  [overrides.apiKey]
 * @param {string}  [overrides.baseUrl]
 * @param {string}  [overrides.model]
 * @returns {Config}
 * @throws {ConfigError} when required values are missing or invalid.
 */
function loadConfig(overrides = {}) {
  const userDir = userConfigDir();
  const envFiles = [
    path.join(process.cwd(), '.env'),
    path.join(userDir, '.env'),
  ];

  const envFromFiles = loadEnvFiles(envFiles);

  const raw = {
    provider:  overrides.provider  || process.env.PROVIDER  || envFromFiles.PROVIDER,
    apiKey:    overrides.apiKey    || process.env.API_KEY    || envFromFiles.API_KEY,
    baseUrl:   overrides.baseUrl   || process.env.BASE_URL   || envFromFiles.BASE_URL,
    model:     overrides.model     || process.env.MODEL      || envFromFiles.MODEL,
  };

  const provider = (raw.provider || 'openai').toLowerCase().trim();

  if (!PROVIDER_DEFAULTS[provider]) {
    const valid = Object.keys(PROVIDER_DEFAULTS).join(', ');
    throw new ConfigError(
      `Unknown provider "${raw.provider}".\nValid options: ${valid}`,
      'INVALID_PROVIDER'
    );
  }

  const defaults = PROVIDER_DEFAULTS[provider];

  const apiKey = raw.apiKey || '';
  // Ollama doesn't require an API key
  if (!apiKey && provider !== 'ollama') {
    throw new ConfigError(
      'No API key found. Run `pulse configure` to set up your provider,\n' +
      'or set API_KEY in .env:\n' +
      '  echo \'API_KEY=sk-...\' >> .env',
      'MISSING_API_KEY'
    );
  }

  /** @type {Config} */
  const config = {
    provider,
    apiKey,
    baseUrl: (raw.baseUrl || defaults.baseUrl).replace(/\/+$/, ''),
    model: raw.model || defaults.defaultModel,
  };

  return Object.freeze(config);
}

/**
 * Return the known provider names.
 * @returns {ProviderName[]}
 */
function knownProviders() {
  return Object.keys(PROVIDER_DEFAULTS);
}

/**
 * Return the default settings for a given provider.
 * @param {ProviderName} name
 * @returns {{ baseUrl: string, defaultModel: string }|undefined}
 */
function providerDefaults(name) {
  return PROVIDER_DEFAULTS[name];
}

// ── Error ──────────────────────────────────────────────────────────────

class ConfigError extends PulseError {
  constructor(message, code = 'CONFIG_ERROR') {
    super(message, code);
    this.name = 'ConfigError';
  }
}

module.exports = { loadConfig, knownProviders, providerDefaults, ConfigError, PROVIDER_DEFAULTS };
