import { requireAdmin } from '../../../_shared/auth.js';
import { error, json, methodNotAllowed, readJson, requireDb } from '../../../_shared/http.js';
import { mapShipOverride, shipOverrideInput } from '../../../_shared/cms.js';

export async function onRequest({ request, env, params }) {
  const unauthorized = await requireAdmin(request, env);
  if (unauthorized) return unauthorized;
  if (request.method === 'GET') return getItem(env, params.id);
  if (request.method === 'PUT') return saveItem(request, env, params.id);
  if (request.method === 'DELETE') return deleteItem(env, params.id);
  return methodNotAllowed();
}

async function getItem(env, shipId) {
  const row = await requireDb(env).prepare('SELECT * FROM ship_overrides WHERE ship_id = ?').bind(shipId).first();
  return json({ item: row ? mapShipOverride(row) : null });
}

async function saveItem(request, env, shipId) {
  if (!shipId) return error('Missing ship id', 422);
  let item;
  try { item = shipOverrideInput(shipId, (await readJson(request)) || {}); }
  catch (err) { return error(err.message || 'Invalid input', 422); }
  await requireDb(env).prepare(`INSERT INTO ship_overrides (id, ship_id, name, manufacturer, role, focus, size, crew, cargo, price_usd, implemented, planner_eligible, tags, description, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(ship_id) DO UPDATE SET name = excluded.name, manufacturer = excluded.manufacturer, role = excluded.role, focus = excluded.focus, size = excluded.size, crew = excluded.crew, cargo = excluded.cargo, price_usd = excluded.price_usd, implemented = excluded.implemented, planner_eligible = excluded.planner_eligible, tags = excluded.tags, description = excluded.description, updated_at = excluded.updated_at`)
    .bind(`ship-${item.ship_id}`, item.ship_id, item.name, item.manufacturer, item.role, item.focus, item.size, item.crew, item.cargo, item.price_usd, item.implemented, item.planner_eligible, item.tags, item.description, item.updated_at).run();
  return json({ item: mapShipOverride(item) });
}

async function deleteItem(env, shipId) {
  await requireDb(env).prepare('DELETE FROM ship_overrides WHERE ship_id = ?').bind(shipId).run();
  return json({ ok: true });
}
