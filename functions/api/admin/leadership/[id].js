import { requireAdmin } from '../../../_shared/auth.js';
import { error, json, methodNotAllowed, readJson, requireDb } from '../../../_shared/http.js';
import { mapLeader, leaderInput, CONFLICT_MESSAGE, hasUpdateConflict } from '../../../_shared/cms.js';
import { tableHasColumn } from '../../../_shared/schema.js';

export async function onRequest({ request, env, params }) {
  const unauthorized = await requireAdmin(request, env);
  if (unauthorized) return unauthorized;
  if (request.method === 'PUT') return updateItem(request, env, params.id);
  if (request.method === 'DELETE') return deleteItem(env, params.id);
  return methodNotAllowed();
}

async function updateItem(request, env, id) {
  const db = requireDb(env);
  const existing = await db.prepare('SELECT * FROM leadership_members WHERE id = ?').bind(id).first();
  if (!existing) return error('Not found', 404);
  const body = (await readJson(request)) || {};
  if (hasUpdateConflict(body, existing)) return error(CONFLICT_MESSAGE, 409);
  let item;
  try {
    item = leaderInput({ ...body, id }, existing);
  } catch (err) {
    return error(err.message || 'Invalid input', 422);
  }
  if (!item.name) return error('Missing required fields', 422);
  if (await tableHasColumn(db, 'leadership_members', 'avatar_url')) {
    await updateLeaderWithAvatarUrl(db, id, item);
  } else {
    await updateLeaderLegacy(db, id, item);
  }
  return json({ item: mapLeader(item) });
}

async function updateLeaderWithAvatarUrl(db, id, item) {
  await db.prepare(`
    UPDATE leadership_members
    SET name = ?, role = ?, discord = ?, description = ?, duties = ?, avatar = ?, avatar_url = ?, avatar_gradient = ?, avatar_style = ?, extras = ?, sort_order = ?, published = ?, updated_at = ?
    WHERE id = ?
  `).bind(item.name, item.role, item.discord, item.description, item.duties, item.avatar, item.avatar_url, item.avatar_gradient, item.avatar_style, item.extras, item.sort_order, item.published, item.updated_at, id).run();
}

async function updateLeaderLegacy(db, id, item) {
  await db.prepare(`
    UPDATE leadership_members
    SET name = ?, role = ?, discord = ?, description = ?, duties = ?, avatar = ?, avatar_gradient = ?, avatar_style = ?, extras = ?, sort_order = ?, published = ?, updated_at = ?
    WHERE id = ?
  `).bind(item.name, item.role, item.discord, item.description, item.duties, item.avatar, item.avatar_gradient, item.avatar_style, item.extras, item.sort_order, item.published, item.updated_at, id).run();
}

async function deleteItem(env, id) {
  const db = requireDb(env);
  const existing = await db.prepare('SELECT id FROM leadership_members WHERE id = ?').bind(id).first();
  if (!existing) return error('Not found', 404);
  await db.prepare('DELETE FROM leadership_members WHERE id = ?').bind(id).run();
  return json({ ok: true });
}
