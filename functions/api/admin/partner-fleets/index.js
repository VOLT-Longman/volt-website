import { requireAdmin } from '../../../_shared/auth.js';
import { error, json, methodNotAllowed, readJson, requireDb } from '../../../_shared/http.js';
import { mapPartnerFleet, partnerFleetInput } from '../../../_shared/cms.js';

export async function onRequest({ request, env }) {
  const unauthorized = await requireAdmin(request, env);
  if (unauthorized) return unauthorized;
  if (request.method === 'GET') return listItems(env);
  if (request.method === 'POST') return createItem(request, env);
  return methodNotAllowed();
}

async function listItems(env) {
  const result = await requireDb(env).prepare('SELECT * FROM partner_fleets ORDER BY sort_order ASC, created_at DESC').all();
  return json({ items: (result.results || []).map(mapPartnerFleet) });
}

async function createItem(request, env) {
  let item;
  try {
    item = partnerFleetInput((await readJson(request)) || {});
  } catch (err) {
    return error(err.message || 'Invalid input', 422);
  }
  if (!item.name) return error('Missing required fields', 422);
  await requireDb(env).prepare(`
    INSERT INTO partner_fleets (id, name, region, game, focus, description, member_count, discord_url, website_url, logo_url, established, sort_order, published, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(item.id, item.name, item.region, item.game, item.focus, item.description, item.member_count, item.discord_url, item.website_url, item.logo_url, item.established, item.sort_order, item.published, item.created_at, item.updated_at).run();
  return json({ item: mapPartnerFleet(item) }, { status: 201 });
}
