import { json, requireDb } from '../_shared/http.js';
import { mapLeader } from '../_shared/cms.js';

const LEADERSHIP_QUERY = `
  SELECT *
  FROM leadership_members
  WHERE published = 1 OR published IS NULL
  ORDER BY sort_order ASC, created_at ASC
`;

export async function onRequestGet({ env }) {
  try {
    const result = await requireDb(env).prepare(LEADERSHIP_QUERY).all();
    // CMS에서 수시 편집하는 콘텐츠이므로 공지/일정과 동일하게 60초 캐시 (편집 반영 지연 최소화)
    return json({ items: (result.results || []).map(mapLeader) }, { cacheControl: 'public, max-age=60' });
  } catch (error) {
    console.warn('Leadership API fallback:', error);
    return json({ items: [], warning: 'Leadership API unavailable' }, { cacheControl: 'no-store' });
  }
}
