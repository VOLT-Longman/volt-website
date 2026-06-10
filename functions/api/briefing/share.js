import { requireMember } from '../../_shared/rbac.js';
import { error, json, readJson, limitText } from '../../_shared/http.js';

const RATE_LIMIT_SECONDS = 30;

function getWebhookUrl(env) {
  const url = String(env.DISCORD_OPERATION_WEBHOOK_URL || '').trim();
  if (!url) throw new Error('Server misconfigured: DISCORD_OPERATION_WEBHOOK_URL');
  return url;
}

function getRateLimitKv(env) {
  if (!env.RATE_LIMIT_KV) throw new Error('Server misconfigured: RATE_LIMIT_KV');
  return env.RATE_LIMIT_KV;
}

function rateLimitKey(userSub) {
  return `briefing_share:${userSub}`;
}

export async function onRequestPost({ request, env }) {
  const session = await requireMember(request, env);
  if (session instanceof Response) return session;

  const kv = getRateLimitKv(env);
  const key = rateLimitKey(session.sub);
  if (await kv.get(key)) return error('Too many requests', 429);

  const body = (await readJson(request)) || {};
  let text;
  try {
    text = limitText(body.text, 1800);
  } catch (_error) {
    return error('Briefing text is too long', 422);
  }
  if (!text) return error('Missing briefing text', 422);

  // 발신자를 명시해 사칭을 막고 감사 추적이 가능하게 한다. (1800자 제한 + 머리글 < 2000자)
  const sender = String(session.display_name || session.username || 'VOLT 멤버').slice(0, 80);
  const content = `**${sender}** 님의 무역 브리핑\n${text}`;
  const response = await fetch(getWebhookUrl(env), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content, allowed_mentions: { parse: [] } })
  });
  if (!response.ok) return error('Discord webhook failed', 502);

  await kv.put(key, '1', { expirationTtl: RATE_LIMIT_SECONDS });
  return json({ ok: true });
}
