import { json, error } from './http.js';

const DEFAULT_UEX_API_BASE_URL = 'https://api.uexcorp.space/2.0';
const UEX_REQUEST_TIMEOUT_MS = 10_000;

function getUpstreamUrl(env, upstreamPathWithQuery) {
  const baseUrl = (env.UEX_API_BASE_URL || DEFAULT_UEX_API_BASE_URL).replace(/\/+$/, '');
  return `${baseUrl}/${upstreamPathWithQuery}`;
}

async function fetchUex(url) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), UEX_REQUEST_TIMEOUT_MS);
  try {
    return { response: await fetch(url, { headers: { Accept: 'application/json' }, signal: controller.signal }) };
  } catch (caught) {
    const message = caught?.name === 'AbortError' ? 'UEX API request timed out' : 'UEX API request failed';
    return { error: message };
  } finally {
    clearTimeout(timeoutId);
  }
}

async function readUexPayload(response) {
  try {
    const payload = await response.json();
    return payload.status === 'ok' && Array.isArray(payload.data) ? payload : null;
  } catch (_error) {
    return null;
  }
}

// UEX 프록시 공용 로직 (G2): cache.match → upstream fetch → payload 검증 → cache.put.
// commodities / location-prices / commodities/[id]/prices 세 엔드포인트가 공유한다 —
// 각자 복제했을 때 검증·캐시 정책이 갈라지는 드리프트를 막는다.
// upstreamPathWithQuery는 호출부에서 검증된 값만 조립한다 (사용자 입력 직결 금지).
export async function proxyUexJson({ request, env, waitUntil }, upstreamPathWithQuery, ttlSeconds) {
  const cache = caches.default;
  const url = new URL(request.url);
  const refresh = url.searchParams.get('refresh') === '1';
  url.searchParams.delete('refresh');
  const cacheKey = new Request(url);
  const cached = await cache.match(cacheKey);
  if (cached) {
    const payload = await cached.clone().json();
    const age = Date.now() - Date.parse(payload.meta?.fetchedAt);
    // A shared one-minute floor prevents repeated clicks from hammering UEX.
    if (!refresh || (Number.isFinite(age) && age >= 0 && age < 60000)) {
      return json({ ...payload, meta: { ...payload.meta, cached: true } }, { cacheControl: refresh ? 'no-store' : `public, max-age=${Math.max(0, ttlSeconds - Math.floor(age / 1000)) || 0}` });
    }
  }

  const upstreamResult = await fetchUex(getUpstreamUrl(env, upstreamPathWithQuery));
  if (upstreamResult.error) return error(upstreamResult.error, 503);
  const { response: upstream } = upstreamResult;
  if (!upstream.ok) return error('UEX API request failed', 503);

  const payload = await readUexPayload(upstream);
  if (!payload) return error('Invalid UEX API payload', 502);

  const response = json({ status: 'ok', data: payload.data, meta: { source: 'uex', cached: false, ttlSeconds, fetchedAt: new Date().toISOString() } }, {
    cacheControl: `public, max-age=${ttlSeconds}`
  });
  waitUntil(cache.put(cacheKey, response.clone()));
  if (refresh) response.headers.set('Cache-Control', 'no-store');
  return response;
}
