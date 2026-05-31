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

function constantTimeEqual(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string') return false;
  let diff = left.length ^ right.length;
  const length = Math.max(left.length, right.length);

  for (let index = 0; index < length; index += 1) {
    diff |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }

  return diff === 0;
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
  const expectedSignature = await hmac(`${role}.${expires}`, getSecret(env));
  return constantTimeEqual(signature, expectedSignature);
}

export async function requireAdmin(request, env) {
  if (await isAuthenticated(request, env)) return null;
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
