/**
 * OpenRouter provider.
 *
 * OpenRouter provides a unified API to many LLMs. Follows the
 * OpenAI chat-completion schema with extra headers for metadata.
 *
 * @module providers/openrouter
 */

const OpenAIProvider = require('./openai');

class OpenRouterProvider extends OpenAIProvider {
  _fetchOptions(body, signal) {
    const options = super._fetchOptions(body, signal);
    options.headers['HTTP-Referer'] = 'https://github.com/pulse-cli/pulse';
    options.headers['X-Title'] = 'Pulse CLI';
    return options;
  }

  get name() { return 'openrouter'; }
}

module.exports = OpenRouterProvider;
