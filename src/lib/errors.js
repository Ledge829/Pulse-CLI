/**
 * Error-handling infrastructure for Pulse CLI.
 *
 * Provides a hierarchy of typed errors and a top-level handler that
 * pretty-prints them to stderr with actionable guidance.
 *
 * @module lib/errors
 */

const chalk = require('chalk');

// ═══════════════════════════════════════════════════════════════════════
// Error classes
// ═══════════════════════════════════════════════════════════════════════

class PulseError extends Error {
  constructor(message, code = 'PULSE_ERROR', context = {}) {
    super(message);
    this.name = 'PulseError';
    this.code = code;
    this.context = context;
  }
}

class ConfigError extends PulseError {
  constructor(message, code = 'CONFIG_ERROR', context = {}) {
    super(message, code, context);
    this.name = 'ConfigError';
  }
}

class ApiError extends PulseError {
  constructor(message, statusCode, code = 'API_ERROR', context = {}) {
    super(message, code, { ...context, statusCode });
    this.name = 'ApiError';
    this.statusCode = statusCode;
  }
}

class NetworkError extends PulseError {
  constructor(message, context = {}) {
    super(message, 'NETWORK_ERROR', context);
    this.name = 'NetworkError';
  }
}

class RateLimitError extends PulseError {
  constructor(message, retryAfter = null, context = {}) {
    super(message, 'RATE_LIMIT', { ...context, retryAfter });
    this.name = 'RateLimitError';
    this.retryAfter = retryAfter;
  }
}

class ModelNotFoundError extends PulseError {
  constructor(model, provider, context = {}) {
    super(
      `Model "${model}" is not available for provider "${provider}".`,
      'MODEL_NOT_FOUND',
      { ...context, model, provider }
    );
    this.name = 'ModelNotFoundError';
    this.model = model;
    this.provider = provider;
  }
}

// ═══════════════════════════════════════════════════════════════════════
// Error handler
// ═══════════════════════════════════════════════════════════════════════

const CODE_HINTS = {
  MISSING_API_KEY: 'Set API_KEY in .env or run `pulse configure`.',
  INVALID_PROVIDER: 'Set PROVIDER to one of: openai, kimi, openrouter, gemini, ollama.',
  API_ERROR: 'The provider returned an error. Check your API key and request.',
  NETWORK_ERROR: 'Could not reach the API. Check your internet connection and BASE_URL.',
  RATE_LIMIT: 'Rate limited. Wait before sending new requests.',
  MODEL_NOT_FOUND: 'Model not available. Use /model to switch.',
  CONFIG_ERROR: 'Check your configuration for invalid values.',
};

/**
 * Pretty-print an error to stderr.
 *
 * Known PulseError → concise, actionable with hint
 * Unknown errors   → full stack trace
 *
 * @param {Error} err
 * @param {boolean} [exit=true]
 */
function handleError(err, exit = true) {
  if (!(err instanceof PulseError)) {
    console.error(chalk.red('\n  ✖ Unexpected error'));
    console.error(chalk.dim(err.stack || err.message));
    if (exit) process.exit(1);
    return;
  }

  const hint = CODE_HINTS[err.code];
  const lines = ['', `  ${chalk.red('✖')} ${err.message}`];
  if (hint) lines.push(`    ${chalk.dim(hint)}`);
  lines.push('');

  console.error(lines.join('\n'));
  if (exit) process.exit(1);
}

module.exports = {
  PulseError,
  ConfigError,
  ApiError,
  NetworkError,
  RateLimitError,
  ModelNotFoundError,
  handleError,
};
