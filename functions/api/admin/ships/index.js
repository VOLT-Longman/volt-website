import { adminDb } from '../../../_shared/admin-db.js';
import { requireAdmin } from '../../../_shared/auth.js';
import { json, methodNotAllowed } from '../../../_shared/http.js';
import { mapShipOverride } from '../../../_shared/cms.js';
import { ensureShipOverridesTable } from '../../../_shared/ships.js';

export async function onRequest({ request, env }) {
  const unauthorized = await requireAdmin(request, env);
  if (unauthorized) return unauthorized;
  if (request.method === 'GET') return listItems(request, env);
  return methodNotAllowed();
}

async function listItems(request, env) {
  const db = adminDb(request, env);
  await ensureShipOverridesTable(db);
  const result = await db.prepare('SELECT * FROM ship_overrides ORDER BY ship_id ASC').all();
  return json({ items: (result.results || []).map((row) => mapShipOverride(row)) });
}

