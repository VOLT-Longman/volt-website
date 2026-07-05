// 공용 rate limit 헬퍼 (KV 고정 윈도우 카운터).
//
// 왜 필요한가: 기존에는 login.js(잠금)와 briefing/share.js(쿨다운)가 각자
// 인라인으로 KV를 다뤘고, 나머지 쓰기 엔드포인트(RSVP, preferences)는
// 제한이 없었다. 이 모듈이 재사용 가능한 고정 윈도우 카운터를 제공한다.
//
// 주의: Cloudflare KV의 expirationTtl 최소값은 60초다. 논리적 윈도우
// (windowSeconds)는 저장된 resetAt 타임스탬프로 판정하므로 60초보다 짧은
// 쿨다운도 정확히 동작한다 — TTL은 청소용이고 판정 기준이 아니다.
//
// 사용법 1 (즉시 소비 — 대부분의 쓰기 엔드포인트):
//   const limited = await enforceRateLimit(env, `rsvp:${session.sub}`, { limit: 10, windowSeconds: 60 });
//   if (limited) return limited; // 429 Response
//
// 사용법 2 (성공 후 소비 — 외부 부수효과가 성공했을 때만 카운트):
//   const gate = await checkRateLimit(env, key, { limit: 1, windowSeconds: 30 });
//   if (gate.limited) return error('Too many requests', 429);
//   ...외부 호출 성공...
//   await gate.commit();

import { error } from './http.js';

const MIN_KV_TTL_SECONDS = 60;

function getRateLimitKv(env) {
  if (!env.RATE_LIMIT_KV) throw new Error('Server misconfigured: RATE_LIMIT_KV');
  return env.RATE_LIMIT_KV;
}

export async function checkRateLimit(env, key, { limit, windowSeconds }) {
  const kv = getRateLimitKv(env);
  const now = Date.now();
  const raw = await kv.get(key, { type: 'json' });
  const fresh = raw && Number(raw.resetAt) > now;
  const count = fresh ? Number(raw.count) || 0 : 0;

  if (count >= limit) return { limited: true, commit: async () => {} };

  const resetAt = fresh ? Number(raw.resetAt) : now + windowSeconds * 1000;
  const ttl = Math.max(MIN_KV_TTL_SECONDS, Math.ceil((resetAt - now) / 1000));
  return {
    limited: false,
    commit: () => kv.put(key, JSON.stringify({ count: count + 1, resetAt }), { expirationTtl: ttl })
  };
}

// 검사와 소비를 한 번에: 제한이면 429 Response, 아니면 null을 돌려준다.
export async function enforceRateLimit(env, key, options) {
  const gate = await checkRateLimit(env, key, options);
  if (gate.limited) return error('Too many requests', 429);
  await gate.commit();
  return null;
}
