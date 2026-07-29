/**
 * Ollama provider.
 *
 * Ollama runs models locally and exposes an OpenAI-compatible API
 * at http://localhost:11434/v1. No API key is required by default.
 * Customise BASE_URL to point at a remote Ollama instance.
 *
 * @module providers/ollama
 */

const OpenAIProvider = require('./openai');

class OllamaProvider extends OpenAIProvider {
  _buildBody(messages, stream) {
    return {
      model: this.config.model,
      messages,
      stream,
      // Ollama doesn't support max_tokens the same way — let the model decide
      options: {
        temperature: 0.3,
      },
    };
  }

  /**
   * Ollama may not require an auth header.
   */
  _fetchOptions(body, signal) {
    const headers = { 'Content-Type': 'application/json' };
    if (this.config.apiKey) {
      headers.Authorization = `Bearer ${this.config.apiKey}`;
    }
    return {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal,
    };
  }

  async listModels() {
    // Ollama uses a different endpoint: GET /api/tags
    const url = `${this.config.baseUrl.replace('/v1', '')}/api/tags`;
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(5_000) });
      if (!response.ok) return [this.config.model];
      const data = await response.json();
      return (data.models || []).map((m) => m.name).sort();
    } catch {
      return [this.config.model];
    }
  }

  get name() { return 'ollama'; }
}

module.exports = OllamaProvider;
