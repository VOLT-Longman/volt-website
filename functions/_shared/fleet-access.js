// Fleet membership is independent of the temporarily public community tools.
const DEFAULT_FLEET_ROLE_ID = '1120508650520330310';

export function fleetAccess(roleIds, env = {}) {
  const id = String(env.DISCORD_FLEET_ROLE_ID ?? DEFAULT_FLEET_ROLE_ID).trim();
  return { configured: Boolean(id), allowed: Boolean(id) && Array.isArray(roleIds) && roleIds.includes(id) };
}

export function isFleetResource(path) {
  return path === '/assets/models/gear' || path.startsWith('/assets/models/gear/')
    || path === '/data/gear/models.json' || path === '/data/gear/attachments.json';
}
