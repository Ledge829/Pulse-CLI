/**
 * OpenAI-compatible provider implementation.
 *
 * Works with any API following the OpenAI chat-completion schema:
 * OpenAI, Azure OpenAI, Together AI, Groq, LocalAI, etc.
 * Customise BASE_URL and MODEL via .env or `pulse configure`.
 *
 * @module providers/openai
 */

const BaseProvider = require('./base');
const { ApiError, NetworkError, RateLimitError, ModelNotFoundError } = require('../lib/errors');

const TIMEOUT_MS = 60_000;

class OpenAIProvider extends BaseProvider {
  _buildBody(messages, stream) {
    return {
      model: this.config.model,
      messages,
      stream,
      temperature: 0.3,
      max_tokens: 16_384,
    };
  }

  _fetchOptions(body, signal) {
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.config.apiKey}`,
    };
    return {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal,
    };
  }

  _parseSSELine(line) {
    const trimmed = line.trim();
    if (!trimmed || !trimmed.startsWith('data: ')) {
      return { done: false, content: null };
    }
    const payload = trimmed.slice(6);
    if (payload === '[DONE]') {
      return { done: true, content: null };
    }
    try {
      const parsed = JSON.parse(payload);
      const choice = parsed.choices && parsed.choices[0];
      if (choice && choice.delta && choice.delta.content !== undefined) {
        return { done: false, content: choice.delta.content || '' };
      }
      if (choice && choice.finish_reason) {
        return { done: choice.finish_reason === 'stop', content: null };
      }
      return { done: false, content: null };
    } catch {
      return { done: false, content: null };
    }
  }

  async _handleErrorResponse(response) {
    const status = response.status;
    let body = '';
    try { body = await response.text(); } catch { /* ignore */ }
    const ctx = { status, body: body.slice(0, 500) };

    if (status === 401 || status === 403) {
      throw new ApiError(
        `Authentication failed (HTTP ${status}). Check your API key.`,
        status, 'API_ERROR', ctx
      );
    }
    if (status === 404) {
      throw new ModelNotFoundError(this.config.model, this.config.provider, ctx);
    }
    if (status === 429) {
      const retryAfter = response.headers.get('retry-after')
        ? parseInt(response.headers.get('retry-after'), 10) : null;
      throw new RateLimitError(
        'Rate limit exceeded. Please wait before sending new requests.',
        retryAfter, ctx
      );
    }
    if (status >= 500) {
      throw new ApiError(
        `Provider returned a server error (HTTP ${status}). Try again later.`,
        status, 'API_ERROR', ctx
      );
    }
    throw new ApiError(
      `Provider returned HTTP ${status}${body ? ': ' + body.slice(0, 200) : ''}`,
      status, 'API_ERROR', ctx
    );
  }

  async chatComplete(messages, signal) {
    const url = `${this.config.baseUrl}/chat/completions`;
    const body = this._buildBody(messages, false);
    const options = this._fetchOptions(body, signal);

    let response;
    try {
      response = await fetch(url, options);
    } catch (err) {
      if (err.name === 'AbortError') throw err;
      throw new NetworkError(
        `Failed to connect to ${this.config.baseUrl}: ${err.message}`,
        { url, cause: err.message }
      );
    }
    if (!response.ok) await this._handleErrorResponse(response);

    let data;
    try { data = await response.json(); } catch (err) {
      throw new ApiError('Failed to parse provider response.', 0, 'API_ERROR', { url, parseError: err.message });
    }

    const content = data.choices && data.choices[0] && data.choices[0].message
      ? data.choices[0].message.content : '';
    return { content: content || '', usage: data.usage || null };
  }

  async *streamChat(messages, signal) {
    const url = `${this.config.baseUrl}/chat/completions`;
    const body = this._buildBody(messages, true);
    const options = this._fetchOptions(body, signal);

    let response;
    try {
      response = await fetch(url, options);
    } catch (err) {
      if (err.name === 'AbortError') throw err;
      throw new NetworkError(
        `Failed to connect to ${this.config.baseUrl}: ${err.message}`,
        { url, cause: err.message }
      );
    }
    if (!response.ok) await this._handleErrorResponse(response);
    if (!response.body) {
      throw new ApiError('Response body is empty — streaming not supported?', 0, 'API_ERROR', { url });
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          const { done: streamDone, content } = this._parseSSELine(line);
          if (content !== null) yield content;
          if (streamDone) return;
        }
      }
      if (buffer.trim()) {
        const { content } = this._parseSSELine(buffer);
        if (content) yield content;
      }
    } catch (err) {
      if (err.name === 'AbortError') throw err;
      if (err instanceof TypeError && err.message.includes('reader')) {
        throw new NetworkError('Stream connection was interrupted.', { url });
      }
      throw err;
    } finally {
      reader.releaseLock().catch(() => {});
    }
  }

  async listModels() {
    const url = `${this.config.baseUrl}/models`;
    try {
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${this.config.apiKey}` },
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) return [this.config.model];
      const data = await response.json();
      return (data.data || []).map((m) => m.id).sort();
    } catch {
      return [this.config.model];
    }
  }
}

module.exports = OpenAIProvider;
