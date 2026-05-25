import { requireAdmin } from '../../../../_shared/auth.js';
import { error, json, methodNotAllowed, readJson, requireDb } from '../../../../_shared/http.js';
import { mapNotice, noticeInput } from '../../../../_shared/cms.js';

export async function onRequest({ request, env, params }) {
  const unauthorized = await requireAdmin(request, env);
  if (unauthorized) return unauthorized;
  if (request.method === 'PUT') return updateItem(request, env, params.id);
  if (request.method === 'DELETE') return deleteItem(env, params.id);
  return methodNotAllowed();
}

async function updateItem(request, env, id) {
  const db = requireDb(env);
  const existing = await db.prepare('SELECT * FROM notices WHERE id = ?').bind(id).first();
  if (!existing) return error('Not found', 404);
  const item = noticeInput({ ...((await readJson(request)) || {}), id }, existing);
  if (!item.title) return error('Missing required fields', 422);
  await db.prepare('UPDATE notices SET title = ?, content = ?, tag = ?, pinned = ?, published = ?, date = ?, updated_at = ? WHERE id = ?').bind(item.title, item.content, item.tag, item.pinned, item.published, item.date, item.updated_at, id).run();
  return json({ item: mapNotice(item) });
}

async function deleteItem(env, id) {
  await requireDb(env).prepare('DELETE FROM notices WHERE id = ?').bind(id).run();
  return json({ ok: true });
}
