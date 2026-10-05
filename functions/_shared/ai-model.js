import { checkRateLimit } from './rate-limit.js';

// Fixed model and conservative limits for the Workers Free deployment.
// The account's Free plan is the billing boundary, not a request-count estimate.
export const MODEL = '@cf/meta/llama-3.1-8b-instruct-fp8-fast';
export const MODEL_DAILY_LIMIT = 100;
const MAX_INPUT_BYTES = 8000;
const MAX_OUTPUT_TOKENS = 256;
const TIMEOUT_MS = 8000;

export async function runModel(env, { system, user, maxTokens }) {
  if (!env.AI || typeof env.AI.run !== 'function') return { unavailable: true, reason: 'no-binding' };
  const messages = [{ role: 'system', content: system }, { role: 'user', content: user }];
  if (new TextEncoder().encode(JSON.stringify(messages)).byteLength > MAX_INPUT_BYTES) {
    return { unavailable: true, reason: 'input-limit' };
  }
  let timer;
  try {
    const day = new Date().toISOString().slice(0, 10);
    // Reserve before inference; failures/timeouts still consume capacity. Never retry.
    const gate = await checkRateLimit(env, `ai_model_daily:${day}`, { limit: MODEL_DAILY_LIMIT, windowSeconds: 86400 });
    if (gate.limited) return { unavailable: true, reason: 'daily-limit' };
    const output = await Promise.race([
      env.AI.run(MODEL, {
        messages,
        max_tokens: Math.min(MAX_OUTPUT_TOKENS, Math.max(1, Number.isFinite(maxTokens) ? Math.floor(maxTokens) : MAX_OUTPUT_TOKENS)),
        temperature: 0.2
      }),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new DOMException('Model timeout', 'AbortError')), TIMEOUT_MS); })
    ]);
    const text = typeof output === 'string' ? output : output?.response;
    if (typeof text !== 'string' || !text.trim()) return { unavailable: true, reason: 'empty' };
    return { text: text.trim() };
  } catch (error) {
    return { unavailable: true, reason: error?.name === 'AbortError' ? 'timeout' : 'error' };
  } finally {
    clearTimeout(timer);
  }
}
