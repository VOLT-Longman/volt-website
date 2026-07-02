import { requireAdmin } from '../../../_shared/auth.js';
import { error, json, methodNotAllowed, readJson, requireDb } from '../../../_shared/http.js';
import { mapTimelineEntry, timelineInput, CONFLICT_MESSAGE, hasUpdateConflict } from '../../../_shared/cms.js';

export async function onRequest({ request, env, params }) {
  const unauthorized = await requireAdmin(request, env);
  if (unauthorized) return unauthorized;
  if (request.method === 'PUT') return updateItem(request, env, params.id);
  if (request.method === 'DELETE') return deleteItem(env, params.id);
  return methodNotAllowed();
}

async function updateItem(request, env, id) {
  const db = requireDb(env);
  const existing = await db.prepare('SELECT * FROM timeline_entries WHERE id = ?').bind(id).first();
  if (!existing) return error('Not found', 404);
  const body = (await readJson(request)) || {};
  if (hasUpdateConflict(body, existing)) return error(CONFLICT_MESSAGE, 409);
  let item;
  try {
    item = timelineInput({ ...body, id }, existing);
  } catch (err) {
    return error(err.message || 'Invalid input', 422);
  }
  if (!item.title || !item.date_label) return error('Missing required fields', 422);
  await db.prepare(`
    UPDATE timeline_entries
    SET date_label = ?, title = ?, description = ?, sort_order = ?, published = ?, updated_at = ?
    WHERE id = ?
  `).bind(item.date_label, item.title, item.description, item.sort_order, item.published, item.updated_at, id).run();
  return json({ item: mapTimelineEntry(item) });
}

async function deleteItem(env, id) {
  const db = requireDb(env);
  const existing = await db.prepare('SELECT id FROM timeline_entries WHERE id = ?').bind(id).first();
  if (!existing) return error('Not found', 404);
  await db.prepare('DELETE FROM timeline_entries WHERE id = ?').bind(id).run();
  return json({ ok: true });
}
