import { requireAdmin } from '../../../_shared/auth.js';
import { error, json, methodNotAllowed, readJson, requireDb } from '../../../_shared/http.js';
import { mapPartnerFleet, partnerFleetInput } from '../../../_shared/cms.js';

export async function onRequest({ request, env, params }) {
  const unauthorized = await requireAdmin(request, env);
  if (unauthorized) return unauthorized;
  if (request.method === 'PUT') return updateItem(request, env, params.id);
  if (request.method === 'DELETE') return deleteItem(env, params.id);
  return methodNotAllowed();
}

async function updateItem(request, env, id) {
  const db = requireDb(env);
  const existing = await db.prepare('SELECT * FROM partner_fleets WHERE id = ?').bind(id).first();
  if (!existing) return error('Not found', 404);
  let item;
  try {
    item = partnerFleetInput({ ...((await readJson(request)) || {}), id }, existing);
  } catch (err) {
    return error(err.message || 'Invalid input', 422);
  }
  if (!item.name) return error('Missing required fields', 422);
  await db.prepare(`
    UPDATE partner_fleets
    SET name = ?, region = ?, game = ?, focus = ?, description = ?, member_count = ?, discord_url = ?, website_url = ?, logo_url = ?, established = ?, sort_order = ?, published = ?, updated_at = ?
    WHERE id = ?
  `).bind(item.name, item.region, item.game, item.focus, item.description, item.member_count, item.discord_url, item.website_url, item.logo_url, item.established, item.sort_order, item.published, item.updated_at, id).run();
  return json({ item: mapPartnerFleet(item) });
}

async function deleteItem(env, id) {
  const db = requireDb(env);
  const existing = await db.prepare('SELECT id FROM partner_fleets WHERE id = ?').bind(id).first();
  if (!existing) return error('Not found', 404);
  await db.prepare('DELETE FROM partner_fleets WHERE id = ?').bind(id).run();
  return json({ ok: true });
}
