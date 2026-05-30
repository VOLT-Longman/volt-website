import { json, error } from '../../_shared/http.js';

const DEFAULT_UEX_API_BASE_URL = 'https://api.uexcorp.space/2.0';
const CACHE_TTL_SECONDS = 60 * 60;

export async function onRequestGet(context) {
  return proxyUexRequest(context, 'commodities', CACHE_TTL_SECONDS);
}

async function proxyUexRequest({ request, env, waitUntil }, upstreamPath, ttlSeconds) {
  const cache = caches.default;
  const cacheKey = new Request(new URL(request.url));
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  const baseUrl = env.UEX_API_BASE_URL || DEFAULT_UEX_API_BASE_URL;
  const upstream = await fetch(`${baseUrl}/${upstreamPath}`, { headers: { Accept: 'application/json' } });
  if (!upstream.ok) return error('UEX API request failed', 503);

  const payload = await upstream.json();
  if (payload.status !== 'ok' || !Array.isArray(payload.data)) return error('Invalid UEX API payload', 502);

  const response = json({ status: 'ok', data: payload.data, meta: { source: 'uex', cached: false, ttlSeconds, fetchedAt: new Date().toISOString() } }, {
    cacheControl: `public, max-age=${ttlSeconds}`
  });
  waitUntil(cache.put(cacheKey, response.clone()));
  return response;
}
