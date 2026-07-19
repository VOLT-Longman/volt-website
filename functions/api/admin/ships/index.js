import { requireAdmin } from '../../../_shared/auth.js';
import { json, methodNotAllowed, requireDb } from '../../../_shared/http.js';
import { mapShipOverride } from '../../../_shared/cms.js';
import { ensureShipOverridesTable } from '../../../_shared/ships.js';
import { canonicalServerOn } from '../../../_shared/shipdb-canonical-flag.js';

export async function onRequest({ request, env }) {
  const unauthorized = await requireAdmin(request, env);
  if (unauthorized) return unauthorized;
  if (request.method === 'GET') return listItems(env);
  return methodNotAllowed();
}

async function listItems(env) {
  const db = requireDb(env);
  await ensureShipOverridesTable(db);
  const result = await db.prepare('SELECT * FROM ship_overrides ORDER BY ship_id ASC').all();
  const canonical = canonicalServerOn(env);
  return json({ items: (result.results || []).map((row) => mapShipOverride(row, { canonical })) });
}

