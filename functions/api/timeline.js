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
    // CMS에서 수시 편집하는 콘텐츠이므로 공지/일정과 동일하게 60초 캐시 (편집 반영 지연 최소화)
    return json({ items: (result.results || []).map(mapTimelineEntry) }, { cacheControl: 'public, max-age=60' });
  } catch (error) {
    console.warn('Timeline API fallback:', error);
    return json({ items: [], warning: 'Timeline API unavailable' }, { cacheControl: 'no-store' });
  }
}
