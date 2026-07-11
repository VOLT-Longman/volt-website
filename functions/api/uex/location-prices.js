import { error } from '../../_shared/http.js';
import { proxyUexJson } from '../../_shared/uex-proxy.js';

const CACHE_TTL_SECONDS = 30 * 60;
const ALLOWED_LOCATION_FIELDS = new Set(['id_terminal', 'id_outpost', 'id_city', 'id_space_station', 'id_planet']);

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const field = url.searchParams.get('field') || '';
  const id = url.searchParams.get('id') || '';
  if (!ALLOWED_LOCATION_FIELDS.has(field)) return error('Invalid location field', 400);
  if (!/^\d+$/.test(id)) return error('Invalid location id', 400);
  return proxyUexJson(context, `commodities_prices?${field}=${encodeURIComponent(id)}`, CACHE_TTL_SECONDS);
}
