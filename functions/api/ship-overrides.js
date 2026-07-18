import { json, requireDb } from '../_shared/http.js';
import { mapShipOverride } from '../_shared/cms.js';
import { ensureShipOverridesTable } from '../_shared/ships.js';
import { canonicalServerOn } from '../_shared/shipdb-canonical-flag.js';

export async function onRequestGet({ env }) {
  try {
    const db = requireDb(env);
    await ensureShipOverridesTable(db);
    const result = await db.prepare('SELECT * FROM ship_overrides ORDER BY ship_id ASC').all();
    // 2.7: canonical 서버 플래그 ON이면 canonical 사실원/제거 필드를 override 출력에서 생략(기본 OFF=불변).
    const canonical = canonicalServerOn(env);
    return json({ items: (result.results || []).map((row) => mapShipOverride(row, { canonical })) }, { cacheControl: 'public, max-age=60' });
  } catch (error) {
    console.error('Public ship_overrides API unavailable', error);
    return json({ items: [], warning: 'ship_overrides unavailable' }, { cacheControl: 'no-store' });
  }
}

