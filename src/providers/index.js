/**
 * Provider registry and factory.
 *
 * Maps provider names to implementation classes and handles
 * instantiation so the rest of the codebase never needs to
 * import provider classes directly.
 *
 * @module providers/index
 */

const OpenAIProvider = require('./openai');
const KimiProvider = require('./kimi');
const OpenRouterProvider = require('./openrouter');
const GeminiProvider = require('./gemini');
const OllamaProvider = require('./ollama');
const BaseProvider = require('./base');
const { ConfigError } = require('../lib/errors');

// ── Registry ───────────────────────────────────────────────────────────

/** @type {Record<string, typeof BaseProvider>} */
const REGISTRY = {
  openai: OpenAIProvider,
  kimi: KimiProvider,
  openrouter: OpenRouterProvider,
  gemini: GeminiProvider,
  ollama: OllamaProvider,
};

// ── Public API ─────────────────────────────────────────────────────────

/**
 * Create a provider instance from a config object.
 * @param {import('../lib/config').Config} config
 * @returns {BaseProvider}
 * @throws {ConfigError} if the provider name is unknown.
 */
function createProvider(config) {
  const ProviderClass = REGISTRY[config.provider];
  if (!ProviderClass) {
    const known = Object.keys(REGISTRY).join(', ');
    throw new ConfigError(
      `Unknown provider "${config.provider}". Known providers: ${known}`,
      'INVALID_PROVIDER'
    );
  }
  return new ProviderClass(config);
}

/**
 * Register a custom provider at runtime.
 * @param {string} name
 * @param {typeof BaseProvider} providerClass
 */
function registerProvider(name, providerClass) {
  if (!(providerClass.prototype instanceof BaseProvider)) {
    throw new TypeError(`Provider must extend BaseProvider, got ${typeof providerClass}`);
  }
  REGISTRY[name.toLowerCase()] = providerClass;
}

/**
 * Return the list of registered provider names.
 * @returns {string[]}
 */
function listProviders() {
  return Object.keys(REGISTRY);
}

module.exports = { createProvider, registerProvider, listProviders };
