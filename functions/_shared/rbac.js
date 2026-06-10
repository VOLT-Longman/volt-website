import { requireAdmin } from './auth.js';
import { readUserSession } from './discord-auth.js';
import { error } from './http.js';

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
    const roles = String(value).split(',').map((role) => role.trim()).filter(Boolean);
    return roles.length ? roles : fallback;
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
  return Array.isArray(session?.roles) && session.roles.length > 0;
}

export async function requireMember(request, env) {
  const session = await requireUser(request, env);
  if (session instanceof Response) return session;
  return isMember(session) ? session : error('Forbidden', 403);
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

// 반환 규약(requireAdmin과 동일): 접근 허용이면 null, 거부면 에러 Response.
// 비밀번호 관리자 세션 또는 관리자급 Discord 역할 중 하나만 있으면 허용한다.
export async function requireAdminOrRole(request, env) {
  const passwordAdmin = await requireAdmin(request, env);
  if (!passwordAdmin) return null;
  const session = await readUserSession(request, env);
  return session && isAdminRole(session, env) ? null : passwordAdmin;
}

// 반환 규약: 접근 허용이면 null, 거부면 에러 Response.
// 비밀번호 관리자이거나 해당 컬렉션에 허용된 Discord 역할이면 허용한다.
export async function requireAdminCollectionAccess(request, env, collection) {
  const passwordAdmin = await requireAdmin(request, env);
  if (!passwordAdmin) return null;
  const session = await readUserSession(request, env);
  const allowedRoles = COLLECTION_ROLE_RULES[collection] || getAdminRoles(env);
  return session && hasAnyRole(session, allowedRoles) ? null : passwordAdmin;
}
