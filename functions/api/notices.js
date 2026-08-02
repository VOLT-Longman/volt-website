import { json, requireDb } from '../_shared/http.js';
import { mapNotice } from '../_shared/cms.js';

export async function onRequestGet({ env }) {
  try {
    const result = await requireDb(env)
      // date는 저장 시 YYYY-MM-DD로 정규화되지만, 과거 행·자유 텍스트가 섞여도 순서가 뒤집히지
      // 않도록 정렬에서도 포맷을 정규화한다(0012 참조).
      .prepare("SELECT * FROM notices WHERE published = 1 ORDER BY pinned DESC, date(replace(date, '.', '-')) DESC, created_at DESC")
      .all();
    return json({ items: (result.results || []).map(mapNotice) }, { cacheControl: 'public, max-age=60' });
  } catch (error) {
    console.error('Public notices API unavailable', error);
    return json({ items: [], warning: 'notices unavailable' }, { cacheControl: 'no-store' });
  }
}
