import { json, requireDb } from '../_shared/http.js';
import { mapEvent } from '../_shared/cms.js';
export async function onRequestGet({ env }) {
  const result = await requireDb(env).prepare('SELECT * FROM events WHERE published = 1 ORDER BY COALESCE(event_date, created_at) DESC').all();
  return json({ items: (result.results || []).map(mapEvent) }, { cacheControl: 'public, max-age=60' });
}
