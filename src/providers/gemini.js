/**
 * Google Gemini provider.
 *
 * Uses the Gemini API at https://generativelanguage.googleapis.com/v1beta.
 * Unlike OpenAI-compatible APIs, Gemini uses a contents[]‑based schema
 * with a different streaming format.
 *
 * @module providers/gemini
 */

const BaseProvider = require('./base');
const { ApiError, NetworkError, RateLimitError, ModelNotFoundError } = require('../lib/errors');

class GeminiProvider extends BaseProvider {
  /**
   * Convert Pulse message format → Gemini contents[] format.
   * @param {Array<{role:string,content:string}>} messages
   * @returns {{contents: object[], systemInstruction?: object}}
   */
  _toGeminiMessages(messages) {
    const contents = [];
    let systemInstruction = null;

    for (const msg of messages) {
      if (msg.role === 'system') {
        systemInstruction = { parts: [{ text: msg.content }] };
        continue;
      }
      contents.push({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.content }],
      });
    }

    return { contents, systemInstruction };
  }

  /**
   * Build the request URL with model and method.
   * @param {boolean} stream
   * @returns {string}
   */
  _buildUrl(stream) {
    const model = this.config.model;
    const key = this.config.apiKey;
    const method = stream ? 'streamGenerateContent' : 'generateContent';
    // key can be passed as query param or via x-goog-api-key header
    return `${this.config.baseUrl}/models/${model}:${method}?key=${key}`;
  }

  /**
   * Build fetch options for the Gemini API call.
   * @param {object} body
   * @param {AbortSignal} [signal]
   * @returns {object}
   */
  _fetchOptions(body, signal) {
    return {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    };
  }

  /**
   * Parse a Gemini streaming SSE line.
   * @param {string} line
   * @returns {{ done: boolean, content: string|null }}
   */
  _parseSSELine(line) {
    const trimmed = line.trim();
    if (!trimmed || !trimmed.startsWith('data: ')) {
      return { done: false, content: null };
    }
    const payload = trimmed.slice(6);
    // Gemini sends `[DONE]` as the end signal
    if (payload === '[DONE]') {
      return { done: true, content: null };
    }
    try {
      const parsed = JSON.parse(payload);
      if (parsed.error) {
        throw new ApiError(
          `Gemini API error: ${parsed.error.message || JSON.stringify(parsed.error)}`,
          parsed.error.code || 400,
          'API_ERROR',
          { provider: 'gemini' }
        );
      }
      const candidates = parsed.candidates || [];
      if (candidates.length === 0) return { done: false, content: null };

      const candidate = candidates[0];
      // Check for finish reason
      if (candidate.finishReason && candidate.finishReason !== 'STOP') {
        if (candidate.finishReason === 'SAFETY') {
          throw new ApiError(
            'Response blocked by Gemini safety filters.',
            400, 'API_ERROR', { provider: 'gemini', finishReason: candidate.finishReason }
          );
        }
        // Other non-STOP finish reasons
        return { done: true, content: null };
      }

      const parts = candidate.content && candidate.content.parts;
      if (parts && parts.length > 0) {
        const text = parts.map((p) => p.text || '').join('');
        return { done: false, content: text };
      }

      return { done: false, content: null };
    } catch (err) {
      if (err instanceof ApiError) throw err;
      return { done: false, content: null };
    }
  }

  async _handleErrorResponse(response) {
    const status = response.status;
    let body = '';
    try { body = await response.text(); } catch { /* ignore */ }
    const ctx = { status, body: body.slice(0, 500), provider: 'gemini' };

    if (status === 400) {
      // Check if it's a model not found
      if (body.includes('not found') || body.includes('not supported')) {
        throw new ModelNotFoundError(this.config.model, this.config.provider, ctx);
      }
      throw new ApiError(`Bad request: ${body.slice(0, 200)}`, status, 'API_ERROR', ctx);
    }
    if (status === 401 || status === 403) {
      throw new ApiError('Authentication failed. Check your Gemini API key.', status, 'API_ERROR', ctx);
    }
    if (status === 404) {
      throw new ModelNotFoundError(this.config.model, this.config.provider, ctx);
    }
    if (status === 429) {
      throw new RateLimitError('Gemini rate limit exceeded.', null, ctx);
    }
    if (status >= 500) {
      throw new ApiError(`Gemini server error (HTTP ${status}).`, status, 'API_ERROR', ctx);
    }
    throw new ApiError(
      `Gemini returned HTTP ${status}${body ? ': ' + body.slice(0, 200) : ''}`,
      status, 'API_ERROR', ctx
    );
  }

  // ── Public API ──────────────────────────────────────────────────────

  async chatComplete(messages, signal) {
    const url = this._buildUrl(false);
    const { contents, systemInstruction } = this._toGeminiMessages(messages);
    const body = { contents, generationConfig: { temperature: 0.3, maxOutputTokens: 8192 } };
    if (systemInstruction) body.systemInstruction = systemInstruction;

    let response;
    try {
      response = await fetch(url, this._fetchOptions(body, signal));
    } catch (err) {
      if (err.name === 'AbortError') throw err;
      throw new NetworkError(`Failed to connect to Gemini API: ${err.message}`, { url, cause: err.message });
    }

    if (!response.ok) await this._handleErrorResponse(response);

    let data;
    try { data = await response.json(); } catch (err) {
      throw new ApiError('Failed to parse Gemini response.', 0, 'API_ERROR', { url, parseError: err.message });
    }

    const candidates = data.candidates || [];
    if (candidates.length === 0) return { content: '', usage: null };

    const parts = candidates[0].content && candidates[0].content.parts || [];
    const content = parts.map((p) => p.text || '').join('');
    return { content, usage: data.usageMetadata || null };
  }

  async *streamChat(messages, signal) {
    const url = this._buildUrl(true);
    const { contents, systemInstruction } = this._toGeminiMessages(messages);
    const body = { contents, generationConfig: { temperature: 0.3, maxOutputTokens: 8192 } };
    if (systemInstruction) body.systemInstruction = systemInstruction;

    let response;
    try {
      response = await fetch(url, this._fetchOptions(body, signal));
    } catch (err) {
      if (err.name === 'AbortError') throw err;
      throw new NetworkError(`Failed to connect to Gemini API: ${err.message}`, { url, cause: err.message });
    }

    if (!response.ok) await this._handleErrorResponse(response);
    if (!response.body) {
      throw new ApiError('Gemini response body is empty.', 0, 'API_ERROR', { url });
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
      if (err instanceof ApiError) throw err;
      throw new NetworkError('Gemini stream was interrupted.', { url });
    } finally {
      reader.releaseLock().catch(() => {});
    }
  }

  get name() { return 'gemini'; }
}

module.exports = GeminiProvider;
