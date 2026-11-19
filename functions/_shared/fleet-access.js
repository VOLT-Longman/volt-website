// Fleet membership is independent of the temporarily public community tools.
const DEFAULT_FLEET_ROLE_ID = '1120508650520330310';

export function fleetAccess(roleIds, env = {}) {
  const id = String(env.DISCORD_FLEET_ROLE_ID ?? DEFAULT_FLEET_ROLE_ID).trim();
  return { configured: Boolean(id), allowed: Boolean(id) && Array.isArray(roleIds) && roleIds.includes(id) };
}

// Compared in lower case: a host that serves files case-insensitively must not hand out /DATA/STARMAP/index.json
// past the gate. (Cloudflare Pages is case-sensitive, so such a path is a 404 there anyway; this does not rely on it.)
export function isFleetResource(rawPath) {
  const path = String(rawPath).toLowerCase();
  return path.startsWith('/data/trade/') || path.startsWith('/data/crafting/')
    || path === '/data/mining/helper.json' || path === '/data/contracts/missions.json' || path === '/data/contracts/hauling.json'
    || /^\/api\/uex\/(?:market|terminals|refineries|vehicle-prices|price-history)$/.test(path)
    || path === '/assets/models/gear' || path.startsWith('/assets/models/gear/')
    || path === '/data/gear/models.json' || path === '/data/gear/attachments.json'
    // Star map: data and game art are fleet-only, like the helper screens.
    || path === '/data/starmap' || path.startsWith('/data/starmap/')
    || path === '/assets/models/starmap' || path.startsWith('/assets/models/starmap/');
}
