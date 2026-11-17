// Owner-confirmed VOLT community role. Discord role IDs are public identifiers,
// not credentials. An explicit environment value overrides this site default;
// an explicitly empty value disables access. Display labels never grant access.
const DEFAULT_COMMUNITY_ROLE_ID = '1150059971887771718';

// Temporarily public while the fleet discusses tool access. Set the Pages
// environment variable to "true" and redeploy to restore the membership gate.
// Only the explicit value "false" opens access; other configured values lock it.
export function communityToolsRequireMembership(env = {}) {
  return String(env.COMMUNITY_TOOLS_REQUIRE_MEMBERSHIP ?? 'false').trim().toLowerCase() !== 'false';
}

export function communityAccess(roleIds, env) {
  const id = String(env.DISCORD_COMMUNITY_ROLE_ID ?? DEFAULT_COMMUNITY_ROLE_ID).trim();
  return { configured: Boolean(id), allowed: Boolean(id) && roleIds.includes(id) };
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
