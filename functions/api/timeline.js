import { json, requireDb } from '../_shared/http.js';
import { mapTimelineEntry } from '../_shared/cms.js';

const TIMELINE_QUERY = `
  SELECT *
  FROM timeline_entries
  WHERE published = 1
  ORDER BY sort_order ASC, created_at ASC
`;

export async function onRequestGet({ env }) {
  try {
    const result = await requireDb(env).prepare(TIMELINE_QUERY).all();
    return json({ items: (result.results || []).map(mapTimelineEntry) }, { cacheControl: 'public, max-age=3600' });
  } catch (error) {
    console.warn('Timeline API fallback:', error);
    return json({ items: [], warning: 'Timeline API unavailable' }, { cacheControl: 'no-store' });
  }
}
