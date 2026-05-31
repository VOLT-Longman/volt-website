import { json, requireDb } from '../_shared/http.js';
import { mapNotice } from '../_shared/cms.js';

export async function onRequestGet({ env }) {
  try {
    const result = await requireDb(env)
      .prepare('SELECT * FROM notices WHERE published = 1 ORDER BY pinned DESC, date DESC, created_at DESC')
      .all();
    return json({ items: (result.results || []).map(mapNotice) }, { cacheControl: 'public, max-age=60' });
  } catch (_error) {
    return json({ items: [], warning: 'notices unavailable' }, { cacheControl: 'no-store' });
  }
}
