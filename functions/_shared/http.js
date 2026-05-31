export function json(data, init = {}) {
  return new Response(JSON.stringify(data), {
    status: init.status || 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': init.cacheControl || 'no-store',
      ...(init.headers || {})
    }
  });
}

export function error(message, status = 400) {
  return json({ error: message }, { status });
}

export async function readJson(request) {
  try { return await request.json(); } catch (_error) { return null; }
}

export function methodNotAllowed() {
  return error('Method not allowed', 405);
}

export function requireDb(env) {
  if (!env.DB) throw new Error('Missing D1 binding: DB');
  return env.DB;
}

export function sanitizeText(value, fallback = '') {
  return String(value ?? fallback).trim();
}

export function limitText(value, maxLength, fallback = '') {
  const text = sanitizeText(value, fallback);
  if (text.length > maxLength) throw new Error(`Input is too long (max ${maxLength} characters)`);
  return text;
}

export function toBooleanInt(value) {
  return value === true || value === 1 || value === '1' || value === 'true' ? 1 : 0;
}

export function nowIso() {
  return new Date().toISOString();
}

export function createId(prefix) {
  const fallback = String(Date.now()) + '-' + Math.random().toString(16).slice(2);
  return prefix + '-' + (crypto.randomUUID ? crypto.randomUUID() : fallback);
}
