/**
 * Curated model lists for each provider.
 *
 * Each model includes:
 *   - name: the exact string to send to the API
 *   - free: whether it's available on a free tier
 *   - description: what it's good for
 *   - context: approximate context window in tokens
 *
 * @module lib/models
 */

/** @typedef {{ name: string, free: boolean, description: string, context?: number }} ModelEntry */

/** @type {Record<string, ModelEntry[]>} */
const MODEL_LISTS = Object.freeze({
  openai: [
    { name: 'gpt-4o', free: false, description: 'Latest flagship — best for everything', context: 128000 },
    { name: 'gpt-4o-mini', free: false, description: 'Fast, cheap — great for everyday coding', context: 128000 },
    { name: 'gpt-4-turbo', free: false, description: 'Previous gen — still very capable', context: 128000 },
    { name: 'gpt-3.5-turbo', free: false, description: 'Legacy — fast but limited', context: 16385 },
  ],

  kimi: [
    { name: 'moonshot-v1-8k', free: false, description: '8K context window', context: 8000 },
    { name: 'moonshot-v1-32k', free: false, description: '32K context window', context: 32000 },
    { name: 'moonshot-v1-128k', free: false, description: '128K context — best for large files', context: 128000 },
  ],

  openrouter: [
    { name: 'nvidia/nemotron-3-ultra-550b-a55b:free', free: true, description: '★ Free — Nemotron 550B' },
    { name: 'google/gemini-2.0-flash-exp:free', free: true, description: '★ Free — Gemini 2.0 Flash' },
    { name: 'meta-llama/llama-3.2-3b-instruct:free', free: true, description: '★ Free — Llama 3.2 3B' },
    { name: 'mistralai/mistral-7b-instruct:free', free: true, description: '★ Free — Mistral 7B' },
    { name: 'cognitivecomputations/dolphin-mixtral-8x7b:free', free: true, description: '★ Free — Dolphin Mixtral' },
    { name: 'gpt-4o', free: false, description: 'OpenAI GPT-4o via OpenRouter' },
    { name: 'gpt-4o-mini', free: false, description: 'OpenAI GPT-4o-mini via OpenRouter' },
    { name: 'anthropic/claude-3.5-sonnet', free: false, description: 'Claude Sonnet — best for code' },
    { name: 'anthropic/claude-3-haiku', free: false, description: 'Claude Haiku — fast & cheap' },
    { name: 'meta-llama/llama-3.1-70b-instruct', free: false, description: 'Llama 3.1 70B' },
    { name: 'google/gemini-1.5-flash', free: false, description: 'Gemini 1.5 Flash' },
    { name: 'google/gemini-1.5-pro', free: false, description: 'Gemini 1.5 Pro' },
    { name: 'mistralai/mistral-7b-instruct', free: false, description: 'Mistral 7B (non-free)' },
    { name: 'qwen/qwen-2.5-coder-32b-instruct', free: false, description: 'Qwen 2.5 Coder 32B' },
  ],

  gemini: [
    { name: 'gemini-1.5-flash', free: true, description: '★ Free tier — fast, great for coding', context: 1048576 },
    { name: 'gemini-1.5-pro', free: false, description: 'Premium — best reasoning', context: 1048576 },
    { name: 'gemini-2.0-flash', free: false, description: 'Newest — faster & smarter', context: 1048576 },
    { name: 'gemini-2.0-flash-exp', free: true, description: '★ Free — experimental 2.0', context: 1048576 },
  ],

  ollama: [
    { name: 'llama3.2', free: true, description: '★ Local — Llama 3.2 (latest)', context: 128000 },
    { name: 'llama3.1', free: true, description: '★ Local — Llama 3.1', context: 128000 },
    { name: 'llama3', free: true, description: '★ Local — Llama 3', context: 8192 },
    { name: 'mistral', free: true, description: '★ Local — Mistral 7B', context: 8192 },
    { name: 'codellama', free: true, description: '★ Local — Code Llama', context: 16384 },
    { name: 'phi3', free: true, description: '★ Local — Phi-3 mini', context: 128000 },
    { name: 'qwen2.5', free: true, description: '★ Local — Qwen 2.5', context: 32768 },
    { name: 'deepseek-coder', free: true, description: '★ Local — DeepSeek Coder', context: 16384 },
  ],
});

/**
 * Get the curated model list for a provider.
 * @param {string} provider
 * @returns {ModelEntry[]}
 */
function getModels(provider) {
  return MODEL_LISTS[provider] || [];
}

/**
 * Format a model entry for display.
 * @param {ModelEntry} m
 * @returns {string}
 */
function formatModelEntry(m) {
  const freeTag = m.free ? ' [FREE]' : '';
  return `${m.name}${freeTag} — ${m.description}`;
}

/**
 * Get model names only (for quick lookup).
 * @param {string} provider
 * @returns {string[]}
 */
function getModelNames(provider) {
  return (MODEL_LISTS[provider] || []).map((m) => m.name);
}

module.exports = { MODEL_LISTS, getModels, formatModelEntry, getModelNames };
