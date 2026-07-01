import { json, error } from '../../_shared/http.js';

const DEFAULT_UEX_API_BASE_URL = 'https://api.uexcorp.space/2.0';
const CACHE_TTL_SECONDS = 30 * 60;
const ALLOWED_LOCATION_FIELDS = new Set(['id_terminal', 'id_outpost', 'id_city', 'id_space_station', 'id_planet']);

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const field = url.searchParams.get('field') || '';
  const id = url.searchParams.get('id') || '';
  if (!ALLOWED_LOCATION_FIELDS.has(field)) return error('Invalid location field', 400);
  if (!/^\d+$/.test(id)) return error('Invalid location id', 400);
  return proxyUexLocationPrices(context, field, id);
}

async function proxyUexLocationPrices({ request, env, waitUntil }, field, id) {
  const cache = caches.default;
  const cacheKey = new Request(new URL(request.url));
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  const baseUrl = env.UEX_API_BASE_URL || DEFAULT_UEX_API_BASE_URL;
  const upstreamUrl = `${baseUrl}/commodities_prices?${field}=${encodeURIComponent(id)}`;
  const upstream = await fetch(upstreamUrl, { headers: { Accept: 'application/json' } });
  if (!upstream.ok) return error('UEX API request failed', 503);

  const payload = await upstream.json();
  if (payload.status !== 'ok' || !Array.isArray(payload.data)) return error('Invalid UEX API payload', 502);

  const response = json({ status: 'ok', data: payload.data, meta: { source: 'uex', cached: false, ttlSeconds: CACHE_TTL_SECONDS, fetchedAt: new Date().toISOString() } }, {
    cacheControl: `public, max-age=${CACHE_TTL_SECONDS}`
  });
  waitUntil(cache.put(cacheKey, response.clone()));
  return response;
}
