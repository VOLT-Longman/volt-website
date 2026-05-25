import { requireAdmin } from '../../../_shared/auth.js';
import { error, json, methodNotAllowed, readJson, requireDb } from '../../../_shared/http.js';
import { mapEvent, eventInput } from '../../../_shared/cms.js';

export async function onRequest({ request, env, params }) {
  const unauthorized = await requireAdmin(request, env);
  if (unauthorized) return unauthorized;
  if (request.method === 'PUT') return updateItem(request, env, params.id);
  if (request.method === 'DELETE') return deleteItem(env, params.id);
  return methodNotAllowed();
}

async function updateItem(request, env, id) {
  const db = requireDb(env);
  const existing = await db.prepare('SELECT * FROM events WHERE id = ?').bind(id).first();
  if (!existing) return error('Not found', 404);
  const item = eventInput({ ...((await readJson(request)) || {}), id }, existing);
  if (!item.title) return error('Missing required fields', 422);
  await db.prepare('UPDATE events SET title = ?, description = ?, type = ?, status = ?, date_label = ?, event_date = ?, published = ?, updated_at = ? WHERE id = ?').bind(item.title, item.description, item.type, item.status, item.date_label, item.event_date, item.published, item.updated_at, id).run();
  return json({ item: mapEvent(item) });
}

async function deleteItem(env, id) {
  await requireDb(env).prepare('DELETE FROM events WHERE id = ?').bind(id).run();
  return json({ ok: true });
}

