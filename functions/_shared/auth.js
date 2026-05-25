import { error } from './http.js';

const SESSION_COOKIE = 'volt_admin_session';
const SESSION_MAX_AGE = 60 * 60 * 8;

function getSecret(env) {
  return env.ADMIN_SESSION_SECRET || env.ADMIN_TOKEN || env.ADMIN_PASSWORD || 'volt-dev-session-secret';
}

function getPassword(env) {
  return env.ADMIN_PASSWORD || env.ADMIN_TOKEN || '';
}

function parseCookies(request) {
  const cookie = request.headers.get('Cookie') || '';
  return Object.fromEntries(cookie.split(';').map((part) => {
    const [key, ...rest] = part.trim().split('=');
    return [key, rest.join('=')];
  }).filter(([key]) => key));
}

async function hmac(message, secret) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  return [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function createSessionCookie(env) {
  const expires = Math.floor(Date.now() / 1000) + SESSION_MAX_AGE;
  const payload = `admin.${expires}`;
  const signature = await hmac(payload, getSecret(env));
  return `${SESSION_COOKIE}=${payload}.${signature}; Path=/; Max-Age=${SESSION_MAX_AGE}; HttpOnly; Secure; SameSite=Lax`;
}

export function clearSessionCookie() {
  return `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
}

export async function isAuthenticated(request, env) {
  const value = parseCookies(request)[SESSION_COOKIE];
  if (!value) return false;
  const parts = value.split('.');
  if (parts.length !== 3) return false;
  const [role, expires, signature] = parts;
  if (role !== 'admin' || Number(expires) < Math.floor(Date.now() / 1000)) return false;
  return signature === await hmac(`${role}.${expires}`, getSecret(env));
}

export async function requireAdmin(request, env) {
  if (await isAuthenticated(request, env)) return null;
  return error('Unauthorized', 401);
}

export function validateLoginToken(token, env) {
  const password = getPassword(env);
  return Boolean(password && token && token === password);
}
