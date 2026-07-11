import { error } from '../../../../_shared/http.js';
import { proxyUexJson } from '../../../../_shared/uex-proxy.js';

const CACHE_TTL_SECONDS = 30 * 60;

export async function onRequestGet(context) {
  const commodityId = context.params.id;
  // 숫자 id만 허용 — 임의 문자열로 캐시 키를 무한 생성해 UEX 업스트림을
  // 반복 호출(cache-bust)하는 남용을 차단한다 (location-prices.js와 동일 규약).
  if (!commodityId || !/^\d+$/.test(commodityId)) return error('Invalid commodity id', 400);
  return proxyUexJson(context, `commodities_prices?id_commodity=${encodeURIComponent(commodityId)}`, CACHE_TTL_SECONDS);
}
