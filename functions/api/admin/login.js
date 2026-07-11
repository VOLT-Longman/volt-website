import { createSessionCookie, validateLoginToken } from '../../_shared/auth.js';
import { error, json, readJson } from '../../_shared/http.js';
import { checkRateLimit } from '../../_shared/rate-limit.js';

// D-4: 인라인 read-then-write 카운터 대신 공유 rate-limit 모듈을 재사용한다(중복 정리).
// checkRateLimit은 "검사 후 성공 시에만 소비"(usage 2) 패턴 — 비밀번호가 틀렸을 때만
// commit()으로 실패를 기록해, 올바른 비밀번호로 첫 시도 성공한 요청은 카운트되지 않는다.
// 참고: KV는 최종 일관성이라 병렬 요청 시 완전한 원자적 잠금은 이 방식으로도 보장되지 않는다
// (Durable Objects급 자원이 필요). 관리자 비밀번호는 보조 인증 계층이라 현재로선 실무적 위험 낮음.
const MAX_ATTEMPTS = 5;
const LOCKOUT_SECONDS = 60 * 15;
// G2: IP당 잠금만으로는 IP 순환(분산) 무차별 대입을 막지 못한다 — IP와 무관한
// 전역 실패 카운터를 병행한다. 1인 운영 특성상 정상 실패는 극소수라 20/15분이면
// 운영자 오탈자와 공격을 충분히 구분한다. (성공해도 전역 카운터는 리셋하지 않음 —
// 공격 중 운영자 로그인 성공이 공격자의 카운터를 지워주면 안 된다.)
const GLOBAL_MAX_ATTEMPTS = 20;
const GLOBAL_FAIL_KEY = 'login_fail:__global__';

function getClientIp(request) {
  return request.headers.get('CF-Connecting-IP') || 'unknown';
}

function failKey(ip) {
  return `login_fail:${ip}`;
}

async function clearFailures(env, ip) {
  if (!env.RATE_LIMIT_KV) throw new Error('Server misconfigured: RATE_LIMIT_KV');
  await env.RATE_LIMIT_KV.delete(failKey(ip));
}

export async function onRequestPost({ request, env }) {
  const ip = getClientIp(request);
  const gate = await checkRateLimit(env, failKey(ip), { limit: MAX_ATTEMPTS, windowSeconds: LOCKOUT_SECONDS });
  const globalGate = await checkRateLimit(env, GLOBAL_FAIL_KEY, { limit: GLOBAL_MAX_ATTEMPTS, windowSeconds: LOCKOUT_SECONDS });

  if (gate.limited || globalGate.limited) {
    return error('너무 많은 시도입니다. 15분 후 다시 시도하세요.', 429);
  }

  const body = await readJson(request);
  if (!(await validateLoginToken(body?.password || body?.token, env))) {
    await gate.commit();
    await globalGate.commit();
    return error('Invalid credentials', 401);
  }

  await clearFailures(env, ip);
  return json({ ok: true }, { headers: { 'Set-Cookie': await createSessionCookie(env) } });
}
