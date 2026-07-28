import { requireAdmin } from '../../../_shared/auth.js';
import { error, json, methodNotAllowed, readJson, requireDb } from '../../../_shared/http.js';
import { CONFLICT_MESSAGE, hasUpdateConflict, mapShipOverride, shipOverrideInput } from '../../../_shared/cms.js';
import { ensureShipOverridesTable } from '../../../_shared/ships.js';

export async function onRequest({ request, env, params }) {
  const unauthorized = await requireAdmin(request, env);
  if (unauthorized) return unauthorized;
  if (request.method === 'GET') return getItem(env, params.id);
  if (request.method === 'PUT') return saveItem(request, env, params.id);
  if (request.method === 'DELETE') return deleteItem(env, params.id);
  return methodNotAllowed();
}

async function getItem(env, shipId) {
  const db = requireDb(env);
  await ensureShipOverridesTable(db);
  const row = await db.prepare('SELECT * FROM ship_overrides WHERE ship_id = ?').bind(shipId).first();
  return json({ item: row ? mapShipOverride(row) : null });
}

async function saveItem(request, env, shipId) {
  if (!shipId) return error('Missing ship id', 422);
  const body = (await readJson(request)) || {};
  const db = requireDb(env);
  await ensureShipOverridesTable(db);
  // 낙관적 잠금: 기존 override의 updated_at과 비교(신규면 빈 문자열 기준).
  const existing = await db.prepare('SELECT updated_at FROM ship_overrides WHERE ship_id = ?').bind(shipId).first();
  if (hasUpdateConflict(body, existing || {})) return error(CONFLICT_MESSAGE, 409);
  let item;
  try { item = shipOverrideInput(shipId, body); }
  catch (err) { return error(err.message || 'Invalid input', 422); }
  // 표시 이름과 숨김만 저장한다. D1에 남은 레거시 컬럼은 건드리지 않는다(정지 데이터).
  await db.prepare(`INSERT INTO ship_overrides (id, ship_id, name, name_ko, hidden, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(ship_id) DO UPDATE SET name = excluded.name, name_ko = excluded.name_ko, hidden = excluded.hidden, updated_at = excluded.updated_at`)
    .bind(`ship-${item.ship_id}`, item.ship_id, item.name, item.name_ko, item.hidden, item.updated_at).run();
  return json({ item: mapShipOverride(item) });
}

async function deleteItem(env, shipId) {
  const db = requireDb(env);
  await ensureShipOverridesTable(db);
  await db.prepare('DELETE FROM ship_overrides WHERE ship_id = ?').bind(shipId).run();
  return json({ ok: true });
}



