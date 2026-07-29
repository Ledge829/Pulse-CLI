/**
 * Abstract base class for LLM providers.
 *
 * Every provider subclass must implement:
 *   - chatComplete(messages, signal)  → { content, usage }
 *   - streamChat(messages, signal)    → AsyncGenerator<string>
 *
 * Optional override:
 *   - listModels() → string[]
 *   - get name()   → string
 *
 * @module providers/base
 */

class BaseProvider {
  constructor(config) {
    if (new.target === BaseProvider) {
      throw new TypeError('BaseProvider cannot be instantiated directly');
    }
    this.config = config;
  }

  get name() {
    return this.constructor.name.replace(/Provider$/i, '').toLowerCase();
  }

  async chatComplete(messages, _signal) {
    throw new Error(`chatComplete() not implemented by ${this.constructor.name}`);
  }

  // eslint-disable-next-line require-yield
  async *streamChat(messages, _signal) {
    throw new Error(`streamChat() not implemented by ${this.constructor.name}`);
  }

  async listModels() {
    return [this.config.model];
  }
}

module.exports = BaseProvider;
