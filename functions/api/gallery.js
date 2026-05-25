import { json, requireDb } from '../_shared/http.js';
import { mapGallery } from '../_shared/cms.js';
export async function onRequestGet({ env }) {
  const result = await requireDb(env).prepare('SELECT * FROM gallery_items WHERE published = 1 ORDER BY sort_order ASC, date DESC, created_at DESC').all();
  return json({ items: (result.results || []).map(mapGallery) }, { cacheControl: 'public, max-age=60' });
}
