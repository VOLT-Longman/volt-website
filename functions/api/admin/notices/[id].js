import { adminDb } from '../../../_shared/admin-db.js';
import { requireAdmin } from '../../../_shared/auth.js';
import { error, json, methodNotAllowed, readJson } from '../../../_shared/http.js';
import { mapNotice, noticeInput, CONFLICT_MESSAGE, hasUpdateConflict } from '../../../_shared/cms.js';
import { ensureNoticesEnColumns } from '../../../_shared/notices.js';

export async function onRequest({ request, env, params }) {
  const unauthorized = await requireAdmin(request, env);
  if (unauthorized) return unauthorized;
  if (request.method === 'PUT') return updateItem(request, env, params.id);
  if (request.method === 'DELETE') return deleteItem(request, env, params.id);
  return methodNotAllowed();
}

async function updateItem(request, env, id) {
  const db = adminDb(request, env);
  await ensureNoticesEnColumns(db);
  const existing = await db.prepare('SELECT * FROM notices WHERE id = ?').bind(id).first();
  if (!existing) return error('Not found', 404);
  const body = (await readJson(request)) || {};
  if (hasUpdateConflict(body, existing)) return error(CONFLICT_MESSAGE, 409);
  let item; try { item = noticeInput({ ...body, id }, existing); } catch (err) { return error(err.message || 'Invalid input', 422); }
  if (!item.title) return error('Missing required fields', 422);
  const result = await db.prepare('UPDATE notices SET title = ?, content = ?, tag = ?, title_en = ?, content_en = ?, tag_en = ?, pinned = ?, published = ?, date = ?, updated_at = ? WHERE id = ? AND updated_at IS ?').bind(item.title, item.content, item.tag, item.title_en, item.content_en, item.tag_en, item.pinned, item.published, item.date, item.updated_at, id, existing.updated_at ?? null).run();
  if (result.meta.changes === 0) return error(CONFLICT_MESSAGE, 409);
  return json({ item: mapNotice(item) });
}

async function deleteItem(request, env, id) {
  const db = adminDb(request, env);
  const existing = await db.prepare('SELECT id, updated_at FROM notices WHERE id = ?').bind(id).first();
  if (!existing) return error('Not found', 404);
  const body = (await readJson(request)) || {};
  if (hasUpdateConflict(body, existing)) return error(CONFLICT_MESSAGE, 409);
  const result = await db.prepare('DELETE FROM notices WHERE id = ? AND updated_at IS ?').bind(id, existing.updated_at ?? null).run();
  if (result.meta.changes === 0) return error(CONFLICT_MESSAGE, 409);
  return json({ ok: true });
}

