import { error } from '../../_shared/http.js';
import { proxyUexJson } from '../../_shared/uex-proxy.js';

const CACHE_TTL_SECONDS = 30 * 60;
const ALLOWED_LOCATION_FIELDS = new Set(['id_terminal', 'id_outpost', 'id_city', 'id_space_station', 'id_planet']);

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const field = url.searchParams.get('field') || '';
  const id = url.searchParams.get('id') || '';
  if (!ALLOWED_LOCATION_FIELDS.has(field)) return error('Invalid location field', 400);
  // 자릿수 상한으로 캐시 키 공간을 제한한다 (UEX id는 수천 단위).
  if (!/^\d{1,7}$/.test(id)) return error('Invalid location id', 400);
  return proxyUexJson(context, `commodities_prices?${field}=${encodeURIComponent(id)}`, CACHE_TTL_SECONDS);
}
