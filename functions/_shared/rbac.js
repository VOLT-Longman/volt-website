import { requireAdmin } from './auth.js';
import { readUserSession } from './discord-auth.js';
import { error } from './http.js';

const MEMBER_ROLES = ['VOLT 함대원', '홍보부', 'HR전략실', '임원진', '감찰', '대표이사'];
const DEFAULT_ADMIN_ROLES = ['임원진', '감찰', '대표이사'];
const COLLECTION_ROLE_RULES = {
  notices: ['대표이사', '감찰', '임원진', '홍보부'],
  gallery: ['대표이사', '감찰', '임원진', '홍보부'],
  events: ['대표이사', '감찰', '임원진', 'HR전략실'],
  partnerFleets: ['대표이사', '감찰', '임원진'],
  ships: ['대표이사', '감찰', '임원진']
};

function parseJsonArray(value, fallback) {
  if (!value) return fallback;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : fallback;
  } catch (_error) {
    return fallback;
  }
}

export async function requireUser(request, env) {
  const session = await readUserSession(request, env);
  return session || error('Unauthorized', 401);
}

export function hasAnyRole(session, roles) {
  const sessionRoles = Array.isArray(session?.roles) ? session.roles : [];
  return roles.some((role) => sessionRoles.includes(role));
}

export function isMember(session) {
  return hasAnyRole(session, MEMBER_ROLES);
}

export function getAdminRoles(env = {}) {
  return parseJsonArray(env.ADMIN_DISCORD_ROLES, DEFAULT_ADMIN_ROLES);
}

export function isAdminRole(session, env = {}) {
  return hasAnyRole(session, getAdminRoles(env));
}

export async function requireRole(request, env, roles) {
  const session = await readUserSession(request, env);
  if (!session) return error('Unauthorized', 401);
  return hasAnyRole(session, roles) ? null : error('Forbidden', 403);
}

export async function requireAdminOrRole(request, env) {
  const passwordAdmin = await requireAdmin(request, env);
  if (!passwordAdmin) return null;
  const session = await readUserSession(request, env);
  return session && isAdminRole(session, env) ? null : passwordAdmin;
}

export async function requireAdminCollectionAccess(request, env, collection) {
  const passwordAdmin = await requireAdmin(request, env);
  if (!passwordAdmin) return null;
  const session = await readUserSession(request, env);
  const allowedRoles = COLLECTION_ROLE_RULES[collection] || getAdminRoles(env);
  return session && hasAnyRole(session, allowedRoles) ? null : passwordAdmin;
}
