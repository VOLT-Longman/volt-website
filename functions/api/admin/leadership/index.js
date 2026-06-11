import { requireAdmin } from '../../../_shared/auth.js';
import { error, json, methodNotAllowed, readJson, requireDb } from '../../../_shared/http.js';
import { mapLeader, leaderInput } from '../../../_shared/cms.js';

export async function onRequest({ request, env }) {
  const unauthorized = await requireAdmin(request, env);
  if (unauthorized) return unauthorized;
  if (request.method === 'GET') return listItems(env);
  if (request.method === 'POST') return createItem(request, env);
  return methodNotAllowed();
}

async function listItems(env) {
  const result = await requireDb(env).prepare('SELECT * FROM leadership_members ORDER BY sort_order ASC, created_at ASC').all();
  return json({ items: (result.results || []).map(mapLeader) });
}

async function createItem(request, env) {
  let item;
  try {
    item = leaderInput((await readJson(request)) || {});
  } catch (err) {
    return error(err.message || 'Invalid input', 422);
  }
  if (!item.name) return error('Missing required fields', 422);
  await requireDb(env).prepare(`
    INSERT INTO leadership_members (id, name, role, discord, description, duties, avatar, avatar_gradient, avatar_style, extras, sort_order, published, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(item.id, item.name, item.role, item.discord, item.description, item.duties, item.avatar, item.avatar_gradient, item.avatar_style, item.extras, item.sort_order, item.published, item.created_at, item.updated_at).run();
  return json({ item: mapLeader(item) }, { status: 201 });
}
