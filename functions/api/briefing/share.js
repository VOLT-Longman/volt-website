import { requireUser } from '../../_shared/rbac.js';
import { error, json, readJson, limitText } from '../../_shared/http.js';

const RATE_LIMIT_SECONDS = 30;

function getWebhookUrl(env) {
  const url = String(env.DISCORD_OPERATION_WEBHOOK_URL || '').trim();
  if (!url) throw new Error('Server misconfigured: DISCORD_OPERATION_WEBHOOK_URL');
  return url;
}

function rateLimitKey(request, userSub) {
  return new Request(new URL(`/api/briefing/share-rate/${encodeURIComponent(userSub)}`, request.url).toString());
}

export async function onRequestPost({ request, env, waitUntil }) {
  const session = await requireUser(request, env);
  if (session instanceof Response) return session;
  const cacheKey = rateLimitKey(request, session.sub);
  if (await caches.default.match(cacheKey)) return error('Too many requests', 429);

  const body = (await readJson(request)) || {};
  let text;
  try {
    text = limitText(body.text, 1800);
  } catch (_error) {
    return error('Briefing text is too long', 422);
  }
  if (!text) return error('Missing briefing text', 422);

  const response = await fetch(getWebhookUrl(env), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: text })
  });
  if (!response.ok) return error('Discord webhook failed', 502);

  const marker = json({ ok: true }, { cacheControl: `public, max-age=${RATE_LIMIT_SECONDS}` });
  waitUntil(caches.default.put(cacheKey, marker.clone()));
  return json({ ok: true });
}
