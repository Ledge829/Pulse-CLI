/**
 * Moonshot / Kimi provider.
 *
 * Uses the OpenAI-compatible endpoint at https://api.moonshot.cn/v1
 * with sensible defaults for Kimi models (moonshot-v1-8k, -32k, -128k).
 *
 * @module providers/kimi
 */

const OpenAIProvider = require('./openai');

class KimiProvider extends OpenAIProvider {
  _buildBody(messages, stream) {
    return {
      model: this.config.model,
      messages,
      stream,
      temperature: 0.3,
    };
  }

  get name() { return 'kimi'; }
}

module.exports = KimiProvider;
