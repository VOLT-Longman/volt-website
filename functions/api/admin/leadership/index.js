import { adminDb } from '../../../_shared/admin-db.js';
import { adminList } from '../../../_shared/admin-collections.js';
import { requireAdmin } from '../../../_shared/auth.js';
import { error, json, methodNotAllowed, readJson } from '../../../_shared/http.js';
import { mapLeader, leaderInput } from '../../../_shared/cms.js';
import { tableHasColumn } from '../../../_shared/schema.js';

export async function onRequest({ request, env }) {
  const unauthorized = await requireAdmin(request, env);
  if (unauthorized) return unauthorized;
  if (request.method === 'GET') return listItems(request, env);
  if (request.method === 'POST') return createItem(request, env);
  return methodNotAllowed();
}

async function listItems(request, env) {
  return json(await adminList(adminDb(request, env), request, 'leadership', mapLeader));
}

async function createItem(request, env) {
  let item;
  try {
    item = leaderInput((await readJson(request)) || {});
  } catch (err) {
    return error(err.message || 'Invalid input', 422);
  }
  if (!item.name) return error('Missing required fields', 422);
  const db = adminDb(request, env);
  if (await tableHasColumn(db, 'leadership_members', 'avatar_url')) {
    await createLeaderWithAvatarUrl(db, item);
  } else {
    await createLeaderLegacy(db, item);
  }
  return json({ item: mapLeader(item) }, { status: 201 });
}

async function createLeaderWithAvatarUrl(db, item) {
  await db.prepare(`
    INSERT INTO leadership_members (id, name, role, discord, description, duties, avatar, avatar_url, avatar_gradient, avatar_style, extras, sort_order, published, created_at, updated_at, translations_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(item.id, item.name, item.role, item.discord, item.description, item.duties, item.avatar, item.avatar_url, item.avatar_gradient, item.avatar_style, item.extras, item.sort_order, item.published, item.created_at, item.updated_at, item.translations_json).run();
}

async function createLeaderLegacy(db, item) {
  await db.prepare(`
    INSERT INTO leadership_members (id, name, role, discord, description, duties, avatar, avatar_gradient, avatar_style, extras, sort_order, published, created_at, updated_at, translations_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(item.id, item.name, item.role, item.discord, item.description, item.duties, item.avatar, item.avatar_gradient, item.avatar_style, item.extras, item.sort_order, item.published, item.created_at, item.updated_at, item.translations_json).run();
}
