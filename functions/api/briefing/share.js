import { requireMember } from '../../_shared/rbac.js';
import { error, json, readJson, limitText } from '../../_shared/http.js';
import { checkRateLimit } from '../../_shared/rate-limit.js';

const RATE_LIMIT_SECONDS = 30;

function getWebhookUrl(env) {
  const url = String(env.DISCORD_OPERATION_WEBHOOK_URL || '').trim();
  if (!url) throw new Error('Server misconfigured: DISCORD_OPERATION_WEBHOOK_URL');
  return url;
}

export async function onRequestPost({ request, env }) {
  const session = await requireMember(request, env);
  if (session instanceof Response) return session;

  // 웹훅 성공 후에만 소비(commit)해 실패한 시도가 쿨다운을 태우지 않게 한다.
  const gate = await checkRateLimit(env, `briefing_share:${session.sub}`, { limit: 1, windowSeconds: RATE_LIMIT_SECONDS });
  if (gate.limited) return error('Too many requests', 429);

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

  await gate.commit();
  return json({ ok: true });
}
