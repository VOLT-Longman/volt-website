import { json, error } from '../../_shared/http.js';
import { fetchUex, getUpstreamUrl, readUexPayload } from '../../_shared/uex-proxy.js';

// 로드아웃 편집기용 부품 구매처·가격 (출처: UEX).
// UEX의 품목 목록(items)과 가격표(items_prices)를 분류별로 받아, 게임 고유번호(uuid)로 묶은
// 작은 표만 내려준다. 원본 가격표는 한 분류가 수백 KB라 그대로 넘기지 않는다.
const CACHE_TTL_SECONDS = 60 * 60;
// 편집기가 쓰는 UEX 분류만 허용한다 — 임의 분류 번호로 업스트림을 호출하는 남용을 막는다.
const ALLOWED_CATEGORIES = new Set([19, 21, 22, 23, 29, 30, 32, 33, 34, 35, 67, 70, 83, 86, 110]);


async function upstream(env, path) {
  const result = await fetchUex(getUpstreamUrl(env, path));
  if (result.error) return { error: result.error, status: 503 };
  if (!result.response.ok) return { error: 'UEX API request failed', status: 503 };
  const payload = await readUexPayload(result.response);
  return payload ? { data: payload.data } : { error: 'Invalid UEX API payload', status: 502 };
}

export function buildPriceTable(items, prices) {
  const uuidById = new Map();
  for (const item of items) if (item?.id && typeof item.uuid === 'string' && item.uuid) uuidById.set(item.id, item.uuid.toLowerCase());
  const table = {};
  for (const row of prices) {
    const uuid = uuidById.get(row?.id_item);
    const price = Number(row?.price_buy);
    if (!uuid || !(price > 0)) continue;
    if (!table[uuid]) table[uuid] = [];
    table[uuid].push({
      shop: String(row.terminal_name || ''),
      place: String(row.city_name || row.space_station_name || row.outpost_name || row.moon_name || row.planet_name || ''),
      system: String(row.star_system_name || ''),
      price,
      ...(row.id_terminal ? { terminalId: Number(row.id_terminal) } : {}),
    });
  }
  for (const uuid of Object.keys(table)) {
    table[uuid].sort((a, b) => a.price - b.price);
    const seen = new Set();
    table[uuid] = table[uuid].filter((shop) => {
      const key = shop.terminalId || JSON.stringify([shop.shop, shop.place, shop.system]);
      if (seen.has(key)) return false;
      seen.add(key); return true;
    });
  }
  return table;
}

// UEX radar records often have no game UUID. Keep exact names and sizes for a
// conservative client-side match; never guess from a translated or partial name.
export function buildNamedPrices(items, prices) {
  return items.filter((item) => !item.uuid && item.name).map((item) => ({
    name: item.name, size: item.size === null || item.size === '' ? null : Number(item.size),
    shops: buildPriceTable([{ ...item, uuid: 'match' }], prices).match || [],
  })).filter((item) => item.shops.length);
}

export async function onRequestGet({ request, env, waitUntil }) {
  const url = new URL(request.url);
  const raw = url.searchParams.get('category') || '';
  if (!/^\d{1,3}$/.test(raw) || !ALLOWED_CATEGORIES.has(Number(raw))) return error('Invalid category', 400);
  const category = Number(raw);
  const cache = caches.default;
  // 캐시 키는 검증된 분류 번호로만 만든다 (uex-proxy.js와 같은 이유).
  const cacheKey = new Request(new URL(`/__uex-cache/loadout-prices/v2/${category}`, url.origin));
  const cached = await cache.match(cacheKey);
  const refresh = url.searchParams.get('refresh') === '1';
  if (cached) {
    const age = Date.now() - Date.parse((await cached.clone().json()).meta?.fetchedAt);
    if (!refresh) return cached;
    if (Number.isFinite(age) && age >= 0 && age < 60000) return json(await cached.json(), { cacheControl: 'no-store' });
  }

  const [items, prices] = await Promise.all([
    upstream(env, `items?id_category=${category}`),
    upstream(env, `items_prices?id_category=${category}`),
  ]);
  const failed = items.error ? items : prices.error ? prices : null;
  if (failed) return error(failed.error, failed.status);

  const response = json({
    status: 'ok', category, data: buildPriceTable(items.data, prices.data),
    byName: buildNamedPrices(items.data, prices.data),
    meta: { source: 'uex', ttlSeconds: CACHE_TTL_SECONDS, fetchedAt: new Date().toISOString() },
  }, { cacheControl: `public, max-age=${CACHE_TTL_SECONDS}` });
  waitUntil(cache.put(cacheKey, response.clone()));
  return refresh ? json(await response.json(), { cacheControl: 'no-store' }) : response;
}
