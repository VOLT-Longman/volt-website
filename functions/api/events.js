import { json, requireDb } from '../_shared/http.js';
import { mapEvent } from '../_shared/cms.js';

const EVENTS_QUERY = `
  SELECT *
  FROM events
  WHERE published = 1
  ORDER BY NULLIF(event_date, '') DESC, created_at DESC
`;

export async function onRequestGet({ env }) {
  try {
    const result = await requireDb(env).prepare(EVENTS_QUERY).all();
    return json({ items: (result.results || []).map(mapEvent) }, { cacheControl: 'public, max-age=60' });
  } catch (_error) {
    return json({ items: [], warning: 'events unavailable' }, { cacheControl: 'no-store' });
  }
}
