import { requireAdmin } from '../../../_shared/auth.js';
import { error, json, methodNotAllowed, readJson, requireDb } from '../../../_shared/http.js';
import { mapGallery, galleryInput } from '../../../_shared/cms.js';

export async function onRequest({ request, env, params }) {
  const unauthorized = await requireAdmin(request, env);
  if (unauthorized) return unauthorized;
  if (request.method === 'PUT') return updateItem(request, env, params.id);
  if (request.method === 'DELETE') return deleteItem(env, params.id);
  return methodNotAllowed();
}

async function updateItem(request, env, id) {
  const db = requireDb(env);
  const existing = await db.prepare('SELECT * FROM gallery_items WHERE id = ?').bind(id).first();
  if (!existing) return error('Not found', 404);
  const item = galleryInput({ ...((await readJson(request)) || {}), id }, existing);
  if (!item.title || !item.image_url) return error('Missing required fields', 422);
  await db.prepare('UPDATE gallery_items SET title = ?, description = ?, category = ?, image_url = ?, thumb_url = ?, date = ?, sort_order = ?, published = ?, updated_at = ? WHERE id = ?').bind(item.title, item.description, item.category, item.image_url, item.thumb_url, item.date, item.sort_order, item.published, item.updated_at, id).run();
  return json({ item: mapGallery(item) });
}

async function deleteItem(env, id) {
  await requireDb(env).prepare('DELETE FROM gallery_items WHERE id = ?').bind(id).run();
  return json({ ok: true });
}

