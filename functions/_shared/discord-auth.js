import { constantTimeEqual, hmac, parseCookies } from './auth.js';

const USER_SESSION_COOKIE = 'volt_user_session';
const OAUTH_STATE_COOKIE = 'volt_oauth_state';
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

export function readOAuthState(request) {
  const state = parseCookies(request)[OAUTH_STATE_COOKIE];
  try {
    return state ? decodeURIComponent(state) : '';
  } catch (_error) {
    return '';
  }
}

export async function createUserSession(env, user) {
  const payload = encodePayload({ ...user, exp: Math.floor(Date.now() / 1000) + USER_SESSION_MAX_AGE });
  const signature = await hmac(payload, getSecretOrThrow(env, 'DISCORD_SESSION_SECRET'));
  return createCookie(USER_SESSION_COOKIE, `${payload}.${signature}`, USER_SESSION_MAX_AGE);
}

export async function readUserSession(request, env) {
  const secret = getSecretOrThrow(env, 'DISCORD_SESSION_SECRET');
  const value = parseCookies(request)[USER_SESSION_COOKIE];
  if (!value) return null;
  const [payload, signature] = value.split('.');
  if (!payload || !signature) return null;
  const expected = await hmac(payload, secret);
  if (!constantTimeEqual(signature, expected)) return null;

  try {
    const session = decodePayload(payload);
    return Number(session.exp) >= Math.floor(Date.now() / 1000) ? session : null;
  } catch (_error) {
    return null;
  }
}

export function clearUserSessionCookie() {
  return createCookie(USER_SESSION_COOKIE, '', 0);
}

export function mapRoles(roleIds, env) {
  const roleMap = JSON.parse(getSecretOrThrow(env, 'DISCORD_ROLE_MAP'));
  return (Array.isArray(roleIds) ? roleIds : []).map((roleId) => roleMap[String(roleId)]).filter(Boolean);
}
