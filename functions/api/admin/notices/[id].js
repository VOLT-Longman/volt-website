import { requireAdmin } from '../../../_shared/auth.js';
import { error, json, methodNotAllowed, readJson, requireDb } from '../../../_shared/http.js';
import { mapNotice, noticeInput, CONFLICT_MESSAGE, hasUpdateConflict } from '../../../_shared/cms.js';

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
  const body = (await readJson(request)) || {};
  if (hasUpdateConflict(body, existing)) return error(CONFLICT_MESSAGE, 409);
  let item; try { item = noticeInput({ ...body, id }, existing); } catch (err) { return error(err.message || 'Invalid input', 422); }
  if (!item.title) return error('Missing required fields', 422);
  await db.prepare('UPDATE notices SET title = ?, content = ?, tag = ?, title_en = ?, content_en = ?, tag_en = ?, pinned = ?, published = ?, date = ?, updated_at = ? WHERE id = ?').bind(item.title, item.content, item.tag, item.title_en, item.content_en, item.tag_en, item.pinned, item.published, item.date, item.updated_at, id).run();
  return json({ item: mapNotice(item) });
}

async function deleteItem(env, id) {
  const db = requireDb(env);
  const existing = await db.prepare('SELECT id FROM notices WHERE id = ?').bind(id).first();
  if (!existing) return error('Not found', 404);
  await db.prepare('DELETE FROM notices WHERE id = ?').bind(id).run();
  return json({ ok: true });
}

