import { json, requireDb } from '../_shared/http.js';
import { mapShipOverride } from '../_shared/cms.js';
import { ensureShipOverridesTable } from '../_shared/ships.js';

export async function onRequestGet({ env }) {
  try {
    const db = requireDb(env);
    await ensureShipOverridesTable(db);
    const result = await db.prepare('SELECT * FROM ship_overrides ORDER BY ship_id ASC').all();
    return json({ items: (result.results || []).map((row) => mapShipOverride(row)) }, { cacheControl: 'public, max-age=60' });
  } catch (error) {
    console.error('Public ship_overrides API unavailable', error);
    return json({ items: [], warning: 'ship_overrides unavailable' }, { cacheControl: 'no-store' });
  }
}

