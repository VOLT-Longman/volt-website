import { error } from './http.js';

const SESSION_COOKIE = 'volt_admin_session';
const SESSION_MAX_AGE = 60 * 60 * 8;
const MISCONFIGURED_SECRET_MESSAGE = 'Server misconfigured: ADMIN_SESSION_SECRET';

function getSecret(env) {
  const secret = env.ADMIN_SESSION_SECRET;
  if (!secret) throw new Error(MISCONFIGURED_SECRET_MESSAGE);
  return secret;
}

function getPassword(env) {
  return env.ADMIN_PASSWORD || '';
}

export function parseCookies(request) {
  const cookie = request.headers.get('Cookie') || '';
  return Object.fromEntries(cookie.split(';').map((part) => {
    const [key, ...rest] = part.trim().split('=');
    return [key, rest.join('=')];
  }).filter(([key]) => key));
}

export async function hmac(message, secret) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  return [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function constantTimeEqual(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string') return false;
  let diff = left.length ^ right.length;
  const length = Math.max(left.length, right.length);

  for (let index = 0; index < length; index += 1) {
    diff |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }

  return diff === 0;
}

export async function createSessionCookie(env, discordSession = null) {
  const expires = Math.floor(Date.now() / 1000) + SESSION_MAX_AGE;
  const role = discordSession ? `discord:${discordSession.sid}` : 'admin';
  if (discordSession && !/^[0-9a-f-]{36}$/u.test(discordSession.sid || '')) throw new Error('Invalid Discord session');
  const payload = `${role}.${expires}`;
  const signature = await hmac(payload, getSecret(env));
  return `${SESSION_COOKIE}=${payload}.${signature}; Path=/; Max-Age=${SESSION_MAX_AGE}; HttpOnly; Secure; SameSite=Lax`;
}

export function clearSessionCookie() {
  return `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
}

export function getAdminDiscordRoles(env) {
  try {
    const roles = JSON.parse(env.ADMIN_DISCORD_ROLES || '[]');
    if (!Array.isArray(roles) || roles.length > 16 || roles.some((role) => typeof role !== 'string' || !role.trim())) return [];
    return [...new Set(roles)];
  } catch { return []; }
}

export async function readAdminDiscordUser(request, env) {
  const allowed = getAdminDiscordRoles(env);
  if (!allowed.length) return null;
  const { readUserSession } = await import('./discord-auth.js');
  const session = await readUserSession(request, env, { membershipTtlMs: 60000 });
  if (!session || !session.roles.some((role) => allowed.includes(role))) return null;
  return session;
}

export async function getAdminIdentity(request, env) {
  const value = parseCookies(request)[SESSION_COOKIE];
  if (!value) return null;
  const parts = value.split('.');
  if (parts.length !== 3) return null;
  const [role, expires, signature] = parts;
  const expiry = Number(expires);
  if (!Number.isSafeInteger(expiry) || expiry <= Math.floor(Date.now() / 1000)) return null;
  if (role !== 'admin' && !/^discord:[0-9a-f-]{36}$/u.test(role)) return null;
  const expectedSignature = await hmac(`${role}.${expires}`, getSecret(env));
  if (!constantTimeEqual(signature, expectedSignature)) return null;
  if (role === 'admin') return { method: 'password', displayName: '공통 관리자', roles: [] };
  const session = await readAdminDiscordUser(request, env);
  if (!session || role !== `discord:${session.sid}`) return null;
  return { method: 'discord', id: session.sub, displayName: session.display_name || session.username, roles: session.roles.filter((name) => getAdminDiscordRoles(env).includes(name)) };
}

export async function isAuthenticated(request, env) {
  return Boolean(await getAdminIdentity(request, env));
}

export async function requireAdmin(request, env) {
  try {
    if (await isAuthenticated(request, env)) return null;
  } catch { return error('관리자 인증 상태를 확인할 수 없습니다. 잠시 후 다시 시도하세요.', 503); }
  return error('Unauthorized', 401);
}

export async function validateLoginToken(token, env) {
  const password = getPassword(env);
  if (!password || !token) return false;
  const secret = getSecret(env);
  const [candidateHash, passwordHash] = await Promise.all([
    hmac(String(token), secret),
    hmac(String(password), secret)
  ]);
  return constantTimeEqual(candidateHash, passwordHash);
}
