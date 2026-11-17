// Prefer the immutable Discord role ID. Existing deployments can use an exact
// DISCORD_ROLE_MAP label; other roles (including administrators) do not qualify.
export function communityAccess(roleIds, env) {
  const explicit = String(env.DISCORD_COMMUNITY_ROLE_ID || '').trim();
  const ids = explicit ? [explicit] : Object.entries(JSON.parse(env.DISCORD_ROLE_MAP || '{}'))
    .filter(([, label]) => label === '커뮤니티 멤버').map(([id]) => id);
  return { configured: ids.length > 0, allowed: ids.some((id) => roleIds.includes(id)) };
}

export function isCommunityResource(path) {
  return path === '/api/uex' || path.startsWith('/api/uex/')
    || path === '/data/loadout' || path.startsWith('/data/loadout/')
    || path === '/data/canonical' || path.startsWith('/data/canonical/')
    || path === '/data/ship-live-stats.js' || path === '/data/ship-market.js';
}

export function privateResponse(response) {
  const result = new Response(response.body, response);
  result.headers.set('Cache-Control', 'private, no-store');
  result.headers.set('CDN-Cache-Control', 'no-store');
  result.headers.set('Cloudflare-CDN-Cache-Control', 'no-store');
  result.headers.set('Vary', [...new Set([...(result.headers.get('Vary') || '').split(',').map((v) => v.trim()).filter(Boolean), 'Cookie'])].join(', '));
  result.headers.set('X-Content-Type-Options', 'nosniff');
  return result;
}
