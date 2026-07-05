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
    // CMS에서 수시 편집하는 콘텐츠이므로 공지/일정과 동일하게 60초 캐시 (편집 반영 지연 최소화)
    return json({ items: (result.results || []).map(mapPartnerFleet) }, { cacheControl: 'public, max-age=60' });
  } catch (error) {
    console.warn('Partner fleets API fallback:', error);
    return json({ items: [], warning: 'Partner fleets API unavailable' }, { cacheControl: 'no-store' });
  }
}
