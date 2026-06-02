import { requireUser } from '../../../_shared/rbac.js';
import { error, json, methodNotAllowed, readJson, requireDb, nowIso, createId, limitText } from '../../../_shared/http.js';

const VALID_STATUSES = ['참가', '대기', '불참'];

export async function onRequest({ request, env, params }) {
  if (request.method === 'GET') return listRsvps(env, params.id);
  if (request.method === 'POST') return saveRsvp(request, env, params.id);
  return methodNotAllowed();
}

async function listRsvps(env, eventId) {
  const result = await requireDb(env).prepare('SELECT * FROM event_rsvps WHERE event_id = ? ORDER BY updated_at DESC').bind(eventId).all();
  const items = result.results || [];
  const counts = VALID_STATUSES.reduce((acc, status) => ({ ...acc, [status]: items.filter((item) => item.status === status).length }), {});
  return json({ items: items.map(mapRsvp), counts });
}

async function saveRsvp(request, env, eventId) {
  const session = await requireUser(request, env);
  if (session instanceof Response) return session;
  const body = (await readJson(request)) || {};
  let status;
  try {
    status = limitText(body.status, 10);
  } catch (_error) {
    return error('Invalid RSVP status', 422);
  }
  if (!VALID_STATUSES.includes(status)) return error('Invalid RSVP status', 422);
  const timestamp = nowIso();
  await requireDb(env).prepare(`
    INSERT INTO event_rsvps (id, event_id, user_sub, display_name, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(event_id, user_sub) DO UPDATE SET display_name = excluded.display_name, status = excluded.status, updated_at = excluded.updated_at
  `).bind(createId('rsvp'), eventId, session.sub, session.display_name || session.username || '', status, timestamp, timestamp).run();
  return listRsvps(env, eventId);
}

function mapRsvp(row) {
  return { id: row.id, eventId: row.event_id, displayName: row.display_name || 'VOLT 사용자', status: row.status, updatedAt: row.updated_at || '' };
}
