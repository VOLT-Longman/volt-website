import { securityDb } from './security-store.js';
import { constantTimeEqual, hmac, parseCookies } from './auth.js';

const USER_SESSION_COOKIE = 'volt_user_session';
const OAUTH_STATE_COOKIE = 'volt_oauth_state';
const OAUTH_RETURN_COOKIE = 'volt_oauth_return';
const USER_SESSION_MAX_AGE = 60 * 60 * 24 * 7;
const OAUTH_STATE_MAX_AGE = 60 * 10;

function base64UrlEncodeBytes(bytes) {
  let binary = '';
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/u, '');
}

function base64UrlDecodeBytes(value) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4);
  return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
}

function encodePayload(payload) {
  return base64UrlEncodeBytes(new TextEncoder().encode(JSON.stringify(payload)));
}

function decodePayload(value) {
  const text = new TextDecoder().decode(base64UrlDecodeBytes(value));
  return JSON.parse(text);
}

function createCookie(name, value, maxAge) {
  return `${name}=${value}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;
}

export function getSecretOrThrow(env, key) {
  const secret = String(env[key] || '').trim();
  if (!secret) throw new Error(`Server misconfigured: ${key}`);
  return secret;
}

export function createOAuthStateCookie(state) {
  return createCookie(OAUTH_STATE_COOKIE, encodeURIComponent(state), OAUTH_STATE_MAX_AGE);
}

export function clearOAuthStateCookie() {
  return createCookie(OAUTH_STATE_COOKIE, '', 0);
}

export function createOAuthReturnCookie(returnTo) {
  return createCookie(OAUTH_RETURN_COOKIE, returnTo === '/admin/' ? 'admin' : '', returnTo === '/admin/' ? OAUTH_STATE_MAX_AGE : 0);
}

export function readOAuthReturnPath(request) {
  return parseCookies(request)[OAUTH_RETURN_COOKIE] === 'admin' ? '/admin/?discord=1' : '/';
}

export function readOAuthState(request) {
  const state = parseCookies(request)[OAUTH_STATE_COOKIE];
  try {
    return state ? decodeURIComponent(state) : '';
  } catch (_error) {
    return '';
  }
}

const MEMBERSHIP_TTL_MS = 5 * 60 * 1000;

async function tokenKey(env) {
  const bytes = new TextEncoder().encode(getSecretOrThrow(env, 'DISCORD_SESSION_SECRET'));
  return crypto.subtle.importKey('raw', await crypto.subtle.digest('SHA-256', bytes), 'AES-GCM', false, ['encrypt', 'decrypt']);
}
async function sealToken(env, token) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await tokenKey(env), new TextEncoder().encode(token));
  return `${base64UrlEncodeBytes(iv)}.${base64UrlEncodeBytes(new Uint8Array(encrypted))}`;
}
async function openToken(env, sealed) {
  const [iv, value] = sealed.split('.');
  const bytes = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: base64UrlDecodeBytes(iv) }, await tokenKey(env), base64UrlDecodeBytes(value));
  return new TextDecoder().decode(bytes);
}

export async function createUserSession(env, user, oauth) {
  if (!oauth?.accessToken || !Array.isArray(oauth.roleIds)) throw new Error('Missing Discord authorization');
  const age = Math.min(USER_SESSION_MAX_AGE, Math.max(1, Number(oauth.expiresIn) || USER_SESSION_MAX_AGE));
  const sid = crypto.randomUUID();
  const now = Date.now();
  const db = await securityDb(env);
  await db.prepare('INSERT INTO security_sessions (id, user_sub, token, role_ids, checked_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(sid, user.sub, await sealToken(env, oauth.accessToken), JSON.stringify(oauth.roleIds), now, now + age * 1000).run();
  const payload = encodePayload({ ...user, sid, exp: Math.floor(now / 1000) + age });
  const signature = await hmac(payload, getSecretOrThrow(env, 'DISCORD_SESSION_SECRET'));
  return createCookie(USER_SESSION_COOKIE, `${payload}.${signature}`, age);
}

export async function readUserSession(request, env, { membershipTtlMs = MEMBERSHIP_TTL_MS } = {}) {
  const value = parseCookies(request)[USER_SESSION_COOKIE];
  if (!value) return null;
  const [payload, signature] = value.split('.');
  if (!payload || !signature) return null;
  const expected = await hmac(payload, getSecretOrThrow(env, 'DISCORD_SESSION_SECRET'));
  if (!constantTimeEqual(signature, expected)) return null;
  let session;
  try { session = decodePayload(payload); } catch (_error) { return null; }
  if (!session.sid || Number(session.exp) < Math.floor(Date.now() / 1000)) return null;
  const db = await securityDb(env);
  const row = await db.prepare('SELECT * FROM security_sessions WHERE id = ? AND user_sub = ?')
    .bind(session.sid, session.sub).first();
  if (!row || row.expires_at <= Date.now()) return null;
  let roleIds = JSON.parse(row.role_ids);
  if (Date.now() - row.checked_at >= Math.min(MEMBERSHIP_TTL_MS, membershipTtlMs)) {
    const guildId = getSecretOrThrow(env, 'DISCORD_GUILD_ID');
    const response = await fetch(`https://discord.com/api/v10/users/@me/guilds/${encodeURIComponent(guildId)}/member`, {
      headers: { Authorization: `Bearer ${await openToken(env, row.token)}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(5000)
    });
    if (response.status === 401) {
      await db.prepare('DELETE FROM security_sessions WHERE id = ?').bind(session.sid).run();
      return null;
    }
    if (response.status !== 404 && !response.ok) throw new Error('Discord membership verification unavailable');
    const member = response.status === 404 ? null : await response.json();
    if (member && !Array.isArray(member.roles)) throw new Error('Invalid Discord membership response');
    roleIds = member?.roles || [];
    // CAS prevents a slower membership response from overwriting a newer verification.
    await db.prepare('UPDATE security_sessions SET role_ids = ?, checked_at = ? WHERE id = ? AND checked_at = ?')
      .bind(JSON.stringify(roleIds), Date.now(), session.sid, row.checked_at).run();
    const latest = await db.prepare('SELECT * FROM security_sessions WHERE id = ? AND user_sub = ?')
      .bind(session.sid, session.sub).first();
    if (!latest) return null;
    roleIds = JSON.parse(latest.role_ids);
  }
  // Apply current role mapping on every request, including configuration revocations.
  return { ...session, roles: mapRoles(roleIds, env) };
}

export async function revokeUserSession(request, env) {
  const value = parseCookies(request)[USER_SESSION_COOKIE];
  if (!value) return;
  const [payload, signature] = value.split('.');
  if (!payload || !signature || !constantTimeEqual(signature, await hmac(payload, getSecretOrThrow(env, 'DISCORD_SESSION_SECRET')))) return;
  let session;
  try { session = decodePayload(payload); } catch (_error) { return; }
  if (session.sid) await (await securityDb(env)).prepare('DELETE FROM security_sessions WHERE id = ?').bind(session.sid).run();
}

export function clearUserSessionCookie() {
  return createCookie(USER_SESSION_COOKIE, '', 0);
}

export function mapRoles(roleIds, env) {
  const roleMap = JSON.parse(getSecretOrThrow(env, 'DISCORD_ROLE_MAP'));
  return (Array.isArray(roleIds) ? roleIds : []).map((roleId) => roleMap[String(roleId)]).filter(Boolean);
}
