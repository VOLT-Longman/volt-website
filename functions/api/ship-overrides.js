import { json, requireDb } from '../_shared/http.js';
import { mapShipOverride } from '../_shared/cms.js';

export async function onRequestGet({ env }) {
  try {
    const result = await requireDb(env).prepare('SELECT * FROM ship_overrides ORDER BY ship_id ASC').all();
    return json({ items: (result.results || []).map(mapShipOverride) }, { cacheControl: 'public, max-age=60' });
  } catch (error) {
    return json({ items: [], warning: 'ship_overrides unavailable' }, { cacheControl: 'no-store' });
  }
}
