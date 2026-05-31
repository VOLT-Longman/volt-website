import { json } from '../_shared/http.js';

const DEFAULT_INVITE_CODE = 'voltstarcitizen';
const DISCORD_API_BASE = 'https://discord.com/api/v10/invites';
const CACHE_TTL_SECONDS = 600;

function createFallbackResponse() {
  return json({ memberCount: null }, { cacheControl: 'no-store' });
}

function createCacheKey(request) {
  const url = new URL('/api/discord-stats', request.url);
  return new Request(url.toString(), { method: 'GET' });
}

function getInviteCode(env) {
  return String(env.DISCORD_INVITE_CODE || DEFAULT_INVITE_CODE).trim() || DEFAULT_INVITE_CODE;
}

function isValidCount(value) {
  return Number.isInteger(value) && value >= 0;
}

async function fetchDiscordInviteStats(inviteCode) {
  const url = `${DISCORD_API_BASE}/${encodeURIComponent(inviteCode)}?with_counts=true`;
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json'
    }
  });
  if (!response.ok) throw new Error(`Discord invite API failed: ${response.status}`);

  const payload = await response.json();
  const memberCount = payload?.approximate_member_count;
  if (!isValidCount(memberCount)) throw new Error('Discord invite API missing approximate_member_count');

  return {
    memberCount,
    onlineCount: isValidCount(payload?.approximate_presence_count) ? payload.approximate_presence_count : null,
    fetchedAt: new Date().toISOString()
  };
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const cacheKey = createCacheKey(request);

  try {
    const cached = await caches.default.match(cacheKey);
    if (cached) return cached;

    const stats = await fetchDiscordInviteStats(getInviteCode(env));
    const response = json(stats, { cacheControl: `public, max-age=${CACHE_TTL_SECONDS}` });
    context.waitUntil(caches.default.put(cacheKey, response.clone()));
    return response;
  } catch (error) {
    console.warn('Discord stats fallback', error);
    return createFallbackResponse();
  }
}
