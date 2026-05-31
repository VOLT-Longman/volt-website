import { json, requireDb } from '../_shared/http.js';
import { mapPartnerFleet } from '../_shared/cms.js';

const PARTNER_FLEETS_QUERY = `
  SELECT *
  FROM partner_fleets
  WHERE published = 1
  ORDER BY sort_order ASC, created_at DESC
`;

export async function onRequestGet({ env }) {
  try {
    const result = await requireDb(env).prepare(PARTNER_FLEETS_QUERY).all();
    return json({ items: (result.results || []).map(mapPartnerFleet) }, { cacheControl: 'public, max-age=3600' });
  } catch (error) {
    console.warn('Partner fleets API fallback:', error);
    return json({ items: [], warning: 'Partner fleets API unavailable' }, { cacheControl: 'no-store' });
  }
}
