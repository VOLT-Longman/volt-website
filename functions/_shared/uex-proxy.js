import { json, error } from './http.js';

const DEFAULT_UEX_API_BASE_URL = 'https://api.uexcorp.space/2.0';
const UEX_REQUEST_TIMEOUT_MS = 10_000;

export function getUpstreamUrl(env, upstreamPathWithQuery) {
  const baseUrl = (env.UEX_API_BASE_URL || DEFAULT_UEX_API_BASE_URL).replace(/\/+$/, '');
  return `${baseUrl}/${upstreamPathWithQuery}`;
}

export async function fetchUex(url) {
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

export async function readUexPayload(response) {
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
  // 캐시 키는 검증된 업스트림 경로로만 만든다. 요청 URL을 그대로 쓰면 임의 쿼리
  // (?x=1, ?x=2 …)마다 캐시가 빗나가 UEX 업스트림을 무제한 호출시킬 수 있다.
  const cacheKey = new Request(new URL(`/__uex-cache/${encodeURIComponent(upstreamPathWithQuery)}`, url.origin));
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

// UEX id·0/1 값 읽기. UEX가 숫자를 문자열로 바꿔 보내도 같은 결과가 나오게 한다 (숫자가 아니면 0).
export function uexId(value) {
  const number = typeof value === 'string' && /^[0-9]{1,15}$/.test(value) ? Number(value) : value;
  return typeof number === 'number' && Number.isInteger(number) && number > 0 ? number : 0;
}
export const uexIsZero = (value) => value === 0 || value === '0';
export const uexIsOne = (value) => value === 1 || value === '1';

// 만료된 사본을 UEX 장애 때 대신 내주려고 TTL보다 이만큼 더 보관한다.
const STALE_SECONDS = 24 * 60 * 60;
// UEX 호출이 실패하면 이 시간 동안은 다시 부르지 않는다 (방문자 요청마다 재시도하지 않게).
const FAILURE_HOLD_MS = 60_000;
// 다른 요청이 같은 표를 받는 중이라고 보는 시간 (UEX 타임아웃 10초 + 여유).
const PENDING_HOLD_MS = 15_000;
const PENDING_POLL_MS = 400;
const PENDING_WAIT_MS = 6_000;
// 같은 isolate 안에서 받는 중인 표. 시각만 적는다 — 다른 요청의 promise를 기다리지 않는다
// (Workers는 요청 사이에 promise를 넘겨 기다리는 것을 보장하지 않는다).
const pendingHere = new Map();

async function readCacheJson(cache, key) {
  try {
    const hit = await cache.match(key);
    return hit ? await hit.json() : null;
  } catch (_error) {
    // 깨진 캐시 항목은 없는 것으로 보고 새로 받는다.
    return null;
  }
}

function putCacheJson(cache, key, body, maxAge) {
  return cache.put(key, json(body, { cacheControl: `public, max-age=${maxAge}` })).catch(() => {});
}

// 여러 UEX 응답을 화면에 필요한 필드만 남겨 하나로 묶는 엔드포인트용 공용 로직.
// proxyUexJson과 같은 규약(검증된 캐시 키, 60초 새로고침 하한, 503/502 오류, meta 형태)을 따르고, 추가로
//  - 실패(503/502)를 60초 기억해 그동안 UEX를 다시 부르지 않는다.
//  - 만료된 사본이 있으면(TTL 뒤 24시간까지) 실패·대기 중에 그것을 stale로 내준다.
//  - 같은 표를 이미 받는 중이면 새로 부르지 않고 사본을 내주거나 잠깐 기다린다.
//  - isUsable(data)가 false면(UEX 필드 형식이 바뀌어 빈 표가 나온 경우 등) 캐시에 넣지 않고 502.
// cacheName·upstreamPaths는 호출부가 검증한 값으로만 조립한다 (사용자 입력 직결 금지).
// 반환: { payload, cached, ageMs, stale? } 또는 { error, status }.
export async function loadUexDerived({ request, env, waitUntil }, { cacheName, upstreamPaths, ttlSeconds, build, isUsable, refresh = false }) {
  const cache = caches.default;
  const dataKey = new Request(new URL(`/__uex-cache/derived/${cacheName}`, request.url));
  const stateKey = new Request(new URL(`/__uex-cache/derived-state/${cacheName}`, request.url));
  const readEntry = async () => {
    const payload = await readCacheJson(cache, dataKey);
    const ageMs = Date.now() - Date.parse(payload?.meta?.fetchedAt);
    const valid = payload?.status === 'ok' && payload.data !== undefined && Number.isFinite(ageMs) && ageMs >= 0 && ageMs < (ttlSeconds + STALE_SECONDS) * 1000;
    return valid ? { payload, ageMs, fresh: ageMs < ttlSeconds * 1000 } : null;
  };
  // 최근 상태 표시: { kind: 'pending' | 'failed' | 'done', at, error?, status? }
  const readState = async () => {
    const state = await readCacheJson(cache, stateKey);
    const age = Date.now() - Number(state?.at);
    if (!Number.isFinite(age) || age < 0) return null;
    if (state.kind === 'failed' && age < FAILURE_HOLD_MS && typeof state.error === 'string' && (state.status === 502 || state.status === 503)) return state;
    return state.kind === 'pending' && age < PENDING_HOLD_MS ? state : null;
  };
  const hit = (entry) => ({ payload: entry.payload, cached: true, ageMs: entry.ageMs, ...(entry.fresh ? {} : { stale: true }) });

  const entry = await readEntry();
  if (entry?.fresh && (!refresh || entry.ageMs < 60000)) return hit(entry);

  let state = await readState();
  const busy = () => state?.kind === 'pending' || pendingHere.get(cacheName) > Date.now() - PENDING_HOLD_MS;
  if (state?.kind === 'failed') return entry ? hit(entry) : { error: state.error, status: state.status };
  if (busy()) {
    if (entry) return hit(entry);
    const deadline = Date.now() + PENDING_WAIT_MS;
    while (busy() && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, PENDING_POLL_MS));
      const arrived = await readEntry();
      if (arrived?.fresh) return hit(arrived);
      state = await readState();
      if (state?.kind === 'failed') return { error: state.error, status: state.status };
    }
  }

  pendingHere.set(cacheName, Date.now());
  try {
    await putCacheJson(cache, stateKey, { kind: 'pending', at: Date.now() }, Math.ceil(PENDING_HOLD_MS / 1000));
    const results = await Promise.all(upstreamPaths.map(async (path) => {
      const result = await fetchUex(getUpstreamUrl(env, path));
      if (result.error) return { error: result.error, status: 503 };
      if (!result.response.ok) return { error: 'UEX API request failed', status: 503 };
      const payload = await readUexPayload(result.response);
      return payload ? { data: payload.data } : { error: 'Invalid UEX API payload', status: 502 };
    }));
    let failed = results.find((result) => result.error);
    let data;
    if (!failed) {
      try {
        data = build(...results.map((result) => result.data));
        if (isUsable && !isUsable(data)) failed = { error: 'Invalid UEX API payload', status: 502 };
      } catch (_error) {
        failed = { error: 'Invalid UEX API payload', status: 502 };
      }
    }
    if (failed) {
      await putCacheJson(cache, stateKey, { kind: 'failed', at: Date.now(), error: failed.error, status: failed.status }, Math.ceil(FAILURE_HOLD_MS / 1000));
      return entry ? hit(entry) : failed;
    }
    const payload = { status: 'ok', data, meta: { source: 'uex', cached: false, ttlSeconds, fetchedAt: new Date().toISOString() } };
    waitUntil(putCacheJson(cache, dataKey, payload, ttlSeconds + STALE_SECONDS).then(() => putCacheJson(cache, stateKey, { kind: 'done', at: Date.now() }, 1)));
    return { payload, cached: false, ageMs: 0 };
  } finally {
    pendingHere.delete(cacheName);
  }
}

// allowRefresh: 업스트림 갱신 주기가 짧은 가격 스냅샷만 true. 12시간 이상 캐시되는 표는
// ?refresh=1을 무시해 UEX를 불필요하게 다시 부르지 않는다.
// stale(만료됐지만 UEX가 안 돼서 내주는 사본)이면 meta.stale = true, 브라우저 캐시는 60초만.
export async function proxyUexDerived(context, { allowRefresh = false, ...options }) {
  const refresh = allowRefresh && new URL(context.request.url).searchParams.get('refresh') === '1';
  const result = await loadUexDerived(context, { ...options, refresh });
  if (result.error) return error(result.error, result.status);
  const { payload, cached, ageMs, stale } = result;
  const remaining = stale ? 60 : cached ? Math.max(0, options.ttlSeconds - Math.floor(ageMs / 1000)) || 0 : options.ttlSeconds;
  return json(cached ? { ...payload, meta: { ...payload.meta, cached: true, ...(stale ? { stale: true } : {}) } } : payload, {
    cacheControl: refresh ? 'no-store' : `public, max-age=${remaining}`,
  });
}
