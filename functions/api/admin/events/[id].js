import { adminDb } from '../../../_shared/admin-db.js';
import { requireAdmin } from '../../../_shared/auth.js';
import { error, json, methodNotAllowed, readJson } from '../../../_shared/http.js';
import { mapEvent, eventInput, CONFLICT_MESSAGE, hasUpdateConflict } from '../../../_shared/cms.js';

export async function onRequest({ request, env, params }) {
  const unauthorized = await requireAdmin(request, env);
  if (unauthorized) return unauthorized;
  if (request.method === 'PUT') return updateItem(request, env, params.id);
  if (request.method === 'DELETE') return deleteItem(request, env, params.id);
  return methodNotAllowed();
}

async function updateItem(request, env, id) {
  const db = adminDb(request, env);
  const existing = await db.prepare('SELECT * FROM events WHERE id = ?').bind(id).first();
  if (!existing) return error('Not found', 404);
  const body = (await readJson(request)) || {};
  if (hasUpdateConflict(body, existing)) return error(CONFLICT_MESSAGE, 409);
  let item; try { item = eventInput({ ...body, id }, existing); } catch (err) { return error(err.message || 'Invalid input', 422); }
  if (!item.title) return error('Missing required fields', 422);
  const result = await db.prepare('UPDATE events SET translations_json = ?, title = ?, description = ?, type = ?, status = ?, date_label = ?, event_date = ?, published = ?, updated_at = ? WHERE id = ? AND updated_at IS ?').bind(item.translations_json, item.title, item.description, item.type, item.status, item.date_label, item.event_date, item.published, item.updated_at, id, existing.updated_at ?? null).run();
  if (result.meta.changes === 0) return error(CONFLICT_MESSAGE, 409);
  return json({ item: mapEvent(item) });
}

async function deleteItem(request, env, id) {
  const db = adminDb(request, env);
  const existing = await db.prepare('SELECT id, updated_at FROM events WHERE id = ?').bind(id).first();
  if (!existing) return error('Not found', 404);
  const body = (await readJson(request)) || {};
  if (hasUpdateConflict(body, existing)) return error(CONFLICT_MESSAGE, 409);
  // D1 batch is transactional. Only clear RSVPs when the conditional event delete
  // actually succeeded; a concurrent edit leaves both the event and its RSVPs intact.
  const [deleted] = await db.batch([
    db.prepare('DELETE FROM events WHERE id = ? AND updated_at IS ?').bind(id, existing.updated_at ?? null),
    db.prepare('DELETE FROM event_rsvps WHERE event_id = ? AND NOT EXISTS (SELECT 1 FROM events WHERE id = ?)').bind(id, id)
  ]);
  if (deleted.meta.changes === 0) return error(CONFLICT_MESSAGE, 409);
  return json({ ok: true });
}

