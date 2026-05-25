import { requireAdmin } from '../../../_shared/auth.js';
import { json, methodNotAllowed, requireDb } from '../../../_shared/http.js';
import { mapShipOverride } from '../../../_shared/cms.js';

export async function onRequest({ request, env }) {
  const unauthorized = await requireAdmin(request, env);
  if (unauthorized) return unauthorized;
  if (request.method === 'GET') return listItems(env);
  return methodNotAllowed();
}

async function listItems(env) {
  const result = await requireDb(env).prepare('SELECT * FROM ship_overrides ORDER BY ship_id ASC').all();
  return json({ items: (result.results || []).map(mapShipOverride) });
}
