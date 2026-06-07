import { createSessionCookie, validateLoginToken } from '../../_shared/auth.js';
import { error, json, readJson } from '../../_shared/http.js';

const MAX_ATTEMPTS = 5;
const LOCKOUT_SECONDS = 60 * 15;

function getClientIp(request) {
  return request.headers.get('CF-Connecting-IP') || 'unknown';
}

async function getRateLimit(env, ip) {
  if (!env.RATE_LIMIT_KV) throw new Error('Server misconfigured: RATE_LIMIT_KV');
  const key = `login_fail:${ip}`;
  const raw = await env.RATE_LIMIT_KV.get(key, { type: 'json' });
  return raw || { count: 0, locked: false };
}

async function recordFailure(env, ip) {
  const key = `login_fail:${ip}`;
  const current = await getRateLimit(env, ip);
  const count = current.count + 1;
  const next = { count, locked: count >= MAX_ATTEMPTS };
  await env.RATE_LIMIT_KV.put(key, JSON.stringify(next), { expirationTtl: LOCKOUT_SECONDS });
}

async function clearFailures(env, ip) {
  await env.RATE_LIMIT_KV.delete(`login_fail:${ip}`);
}

export async function onRequestPost({ request, env }) {
  const ip = getClientIp(request);
  const limit = await getRateLimit(env, ip);

  if (limit.locked) {
    return error('\ub108\ubb34 \ub9ce\uc740 \uc2dc\ub3c4\uc785\ub2c8\ub2e4. 15\ubd84 \ud6c4 \ub2e4\uc2dc \uc2dc\ub3c4\ud558\uc138\uc694.', 429);
  }

  const body = await readJson(request);
  if (!(await validateLoginToken(body?.password || body?.token, env))) {
    await recordFailure(env, ip);
    return error('Invalid credentials', 401);
  }

  await clearFailures(env, ip);
  return json({ ok: true }, { headers: { 'Set-Cookie': await createSessionCookie(env) } });
}
