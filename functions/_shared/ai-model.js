// VOLT AI 모델 어댑터 (M1) — 교체 가능 계층.
// 현재 구현은 Cloudflare Workers AI 바인딩(env.AI). 다른 공급자로 바꾸려면
// 이 파일의 runModel만 교체한다 — 호출부는 { text } | { unavailable } 계약만 안다.
// 바인딩이 없거나 호출이 실패하면 unavailable을 반환하고, 호출부는 도구 데이터
// 기반 템플릿 응답으로 폴백한다 (모델 없이도 동작하는 것이 M1 완료 조건).

const DEFAULT_MODEL = '@cf/meta/llama-3.1-8b-instruct';

export async function runModel(env, { system, user, maxTokens }) {
  if (!env.AI || typeof env.AI.run !== 'function') return { unavailable: true, reason: 'no-binding' };
  try {
    const output = await env.AI.run(env.VOLT_AI_MODEL || DEFAULT_MODEL, {
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user }
      ],
      max_tokens: maxTokens
    });
    const text = typeof output === 'string' ? output : (output?.response ?? '');
    if (!text || !text.trim()) return { unavailable: true, reason: 'empty' };
    return { text: text.trim() };
  } catch (error) {
    return { unavailable: true, reason: error?.name === 'AbortError' ? 'timeout' : 'error' };
  }
}
