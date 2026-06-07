import { requireMember } from '../../_shared/rbac.js';
import { error, json, methodNotAllowed, readJson, requireDb, nowIso } from '../../_shared/http.js';

const MAX_JSON_LENGTH = 24000;
const MAX_PLANNER_FIELD_LENGTH = 160;
const PLANNER_KEYS = new Set(['shipId', 'shipSearch', 'cargo', 'opType', 'crew', 'risk', 'travelTime']);

export async function onRequest({ request, env }) {
  if (request.method === 'GET') return getPreferences(request, env);
  if (request.method === 'PUT') return savePreferences(request, env);
  return methodNotAllowed();
}

async function getPreferences(request, env) {
  const session = await requireMember(request, env);
  if (session instanceof Response) return session;
  const row = await requireDb(env).prepare('SELECT * FROM user_preferences WHERE user_sub = ?').bind(session.sub).first();
  return json({ preferences: mapPreferences(row) });
}

async function savePreferences(request, env) {
  const session = await requireMember(request, env);
  if (session instanceof Response) return session;
  const body = (await readJson(request)) || {};
  let favoritesJson; let plannerJson;
  try {
    favoritesJson = serializeJson(Array.isArray(body.favorites) ? body.favorites.map(String).slice(0, 500) : []);
    plannerJson = serializeJson(sanitizePlanner(body.planner));
  } catch (err) {
    return error(err.message || 'Invalid preferences', 422);
  }
  const timestamp = nowIso();
  await requireDb(env).prepare(`
    INSERT INTO user_preferences (user_sub, favorites_json, planner_json, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(user_sub) DO UPDATE SET favorites_json = excluded.favorites_json, planner_json = excluded.planner_json, updated_at = excluded.updated_at
  `).bind(session.sub, favoritesJson, plannerJson, timestamp).run();
  return json({ preferences: { favorites: JSON.parse(favoritesJson), planner: JSON.parse(plannerJson), updatedAt: timestamp } });
}

function serializeJson(value) {
  const jsonText = JSON.stringify(value || null);
  if (jsonText.length > MAX_JSON_LENGTH) throw new Error('Preference payload is too large');
  return jsonText;
}

function sanitizePlanner(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).flatMap(([key, rawValue]) => {
    if (!PLANNER_KEYS.has(key)) return [];
    const text = String(rawValue ?? '').trim();
    if (text.length > MAX_PLANNER_FIELD_LENGTH) throw new Error(`Planner field is too long: ${key}`);
    return text ? [[key, text]] : [];
  }));
}

function mapPreferences(row) {
  return { favorites: parseJson(row?.favorites_json, []), planner: parseJson(row?.planner_json, {}), updatedAt: row?.updated_at || '' };
}

function parseJson(value, fallback) {
  if (!value) return fallback;
  try { return JSON.parse(value); } catch (_error) { return fallback; }
}
