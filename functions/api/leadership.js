import { json, requireDb } from '../_shared/http.js';
import { mapLeader } from '../_shared/cms.js';

const LEADERSHIP_QUERY = `
  SELECT *
  FROM leadership_members
  WHERE published = 1
  ORDER BY sort_order ASC, created_at ASC
`;

export async function onRequestGet({ env }) {
  try {
    const result = await requireDb(env).prepare(LEADERSHIP_QUERY).all();
    return json({ items: (result.results || []).map(mapLeader) }, { cacheControl: 'public, max-age=3600' });
  } catch (error) {
    console.warn('Leadership API fallback:', error);
    return json({ items: [], warning: 'Leadership API unavailable' }, { cacheControl: 'no-store' });
  }
}
