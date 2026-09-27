import { createSessionCookie, validateLoginToken } from '../../_shared/auth.js';
import { error, json, readJson } from '../../_shared/http.js';
import { checkRateLimit } from '../../_shared/rate-limit.js';

// Reserve per-IP attempts before password verification. A shared global lock lets strangers lock out the owner.
const MAX_ATTEMPTS = 5;
const LOCKOUT_SECONDS = 60 * 15;

function getClientIp(request) {
  return request.headers.get('CF-Connecting-IP') || 'unknown';
}

function failKey(ip) {
  return `login_fail:${ip}`;
}

export async function onRequestPost({ request, env }) {
  const ip = getClientIp(request);
  const gate = await checkRateLimit(env, failKey(ip), { limit: MAX_ATTEMPTS, windowSeconds: LOCKOUT_SECONDS });

  if (gate.limited) {
    return error('너무 많은 시도입니다. 15분 후 다시 시도하세요.', 429);
  }

  const body = await readJson(request);
  if (!(await validateLoginToken(body?.password || body?.token, env))) {
    await gate.commit();
    return error('Invalid credentials', 401);
  }

  await gate.release();
  return json({ ok: true }, { headers: { 'Set-Cookie': await createSessionCookie(env) } });
}
