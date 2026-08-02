import { parseDataLayerJs } from './erkul-sync.js';
import { requireDb } from './http.js';

// VOLT AI 도구 계층 (M1) — 모든 수치는 이 결정론적 함수들이 반환한다.
// 모델은 자연어 해석·문장화만 담당하며, 여기 결과 밖의 수치를 만들 수 없다.
// 각 도구는 { data, sources[], freshness } 형태로 근거·시각을 함께 돌려준다.

const SHIP_CACHE_TTL_MS = 10 * 60 * 1000;
let shipCache = null; // isolate 캐시 — ASSETS 재파싱 비용 절약

async function fetchAssetText(env, path) {
  const response = await env.ASSETS.fetch(`https://assets.local${path}`);
  if (!response.ok) throw new Error(`asset ${path} HTTP ${response.status}`);
  return response.text();
}

export async function loadShipLayers(env) {
  if (shipCache && Date.now() - shipCache.loadedAt < SHIP_CACHE_TTL_MS) return shipCache;
  // 2.7 canonical 이관(PM): 사실·시장은 canonical, erkulLocalName·syncedAt은 operational 레이어에서 읽는다.
  // canonical/operational은 live 레이어 파생(219=live 동일 집합·값) → AI 응답 불변.
  const [canonText, opsText] = await Promise.all([
    fetchAssetText(env, '/data/canonical/ships-canonical.json'),
    fetchAssetText(env, '/data/canonical/operational-ships.json')
  ]);
  const canon = JSON.parse(canonText);
  const ops = JSON.parse(opsText);
  const opsById = new Map((ops.records || []).map((r) => [r.id, r]));
  const ships = {};
  const market = {};
  let syncedAt = null;
  for (const s of canon.ships || []) {
    const op = opsById.get(s.id) || {};
    ships[s.id] = {
      manufacturer: s.manufacturer, role: s.role, career: s.career, size: s.size,
      crewSize: s.crewSize, cargoScu: s.cargoScu, hp: s.hp,
      erkulLocalName: op.erkulLocalName || ''
    };
    market[s.id] = s.market || { purchase: [], rentals: [] };
    if (!syncedAt && op.syncedAt) syncedAt = op.syncedAt;
  }
  shipCache = { ships, market, syncedAt, loadedAt: Date.now() };
  return shipCache;
}

export function resetShipCacheForTests() { shipCache = null; }

function normalizeToken(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9가-힣]/g, '');
}

// 사용자 텍스트에서 함선 id를 찾는다 — 모델 출력이 아니라 우리 색인과의 대조로만 확정한다(주입 방어).
export function matchShipIds(ships, text, max = 4) {
  const haystack = normalizeToken(text);
  const found = [];
  const candidates = Object.keys(ships)
    .map((id) => ({ id, token: normalizeToken(id), alt: normalizeToken(ships[id].erkulLocalName?.split('_').slice(1).join('') || '') }))
    .sort((a, b) => b.token.length - a.token.length); // 긴 이름 우선 — 'hull-c'가 'c'류 오매칭을 막는다
  for (const candidate of candidates) {
    if (found.length >= max) break;
    if (candidate.token.length < 3 && candidate.alt.length < 3) continue;
    if ((candidate.token.length >= 3 && haystack.includes(candidate.token))
      || (candidate.alt.length >= 4 && haystack.includes(candidate.alt))) {
      if (!found.includes(candidate.id)) found.push(candidate.id);
    }
  }
  return found;
}

// KO 의도어 → Erkul role/career 필터 토큰
const ROLE_KEYWORDS = [
  { ko: ['화물', '수송', '운송', '무역'], en: ['transport', 'freight', 'hauling', 'cargo'] },
  { ko: ['전투', '파이터'], en: ['combat', 'fighter', 'interdiction'] },
  { ko: ['탐사', '탐험'], en: ['exploration', 'pathfinder', 'expedition'] },
  { ko: ['채굴'], en: ['mining'] },
  { ko: ['인양'], en: ['salvage'] },
  { ko: ['의료', '구조'], en: ['medical', 'rescue'] },
  { ko: ['입문', '스타터', '초보'], en: ['starter'] }
];

export function extractRecommendParams(text) {
  const params = {};
  for (const group of ROLE_KEYWORDS) {
    if (group.ko.some((word) => text.includes(word))) { params.roleTokens = group.en; break; }
  }
  const cargoMatch = text.match(/(\d{1,4})\s*scu/i) || text.match(/화물\s*(\d{1,4})/);
  if (cargoMatch) params.minCargo = Number(cargoMatch[1]);
  const crewMatch = text.match(/(\d{1,2})\s*인/) || text.match(/인원\s*(\d{1,2})/);
  if (crewMatch) params.maxCrew = Number(crewMatch[1]);
  return params;
}

function cheapestPurchase(marketEntry) {
  const rows = Array.isArray(marketEntry?.purchase) ? marketEntry.purchase : [];
  let best = null;
  for (const row of rows) {
    if (typeof row.price !== 'number' || row.price <= 0) continue;
    if (!best || row.price < best.price) best = { price: row.price, shop: row.shop || '', location: row.location || '' };
  }
  return best;
}

function shipSummary(id, entry, marketEntry) {
  return {
    id,
    role: entry.role || '',
    career: entry.career || '',
    size: entry.size || '',
    crewSize: entry.crewSize ?? null,
    cargoScu: entry.cargoScu ?? null,
    hp: entry.hp ?? null,
    cheapestBuy: cheapestPurchase(marketEntry),
    rentalCount: Array.isArray(marketEntry?.rentals) ? marketEntry.rentals.length : 0
  };
}

function shipSources(syncedAt) {
  return [{ label: 'VOLT ShipDB — Erkul canonical 데이터셋', detail: `동기화 ${syncedAt || '알 수 없음'}`, url: '#ships' }];
}

export async function toolRecommendShips(env, params) {
  const { ships, market, syncedAt } = await loadShipLayers(env);
  const scored = [];
  for (const [id, entry] of Object.entries(ships)) {
    const roleText = `${entry.role || ''} ${entry.career || ''}`.toLowerCase();
    if (params.roleTokens && !params.roleTokens.some((token) => roleText.includes(token))) continue;
    if (params.minCargo && !(Number(entry.cargoScu) >= params.minCargo)) continue;
    if (params.maxCrew && !(Number(entry.crewSize) <= params.maxCrew)) continue;
    scored.push(shipSummary(id, entry, market[id]));
  }
  scored.sort((a, b) => (b.cargoScu ?? 0) - (a.cargoScu ?? 0) || (a.crewSize ?? 99) - (b.crewSize ?? 99));
  return {
    data: { ships: scored.slice(0, 5), totalMatched: scored.length, criteria: params },
    sources: shipSources(syncedAt),
    freshness: { label: 'ShipDB 동기화', at: syncedAt }
  };
}

export async function toolCompareShips(env, ids) {
  const { ships, market, syncedAt } = await loadShipLayers(env);
  const rows = ids.filter((id) => ships[id]).map((id) => shipSummary(id, ships[id], market[id]));
  return {
    data: { ships: rows },
    sources: shipSources(syncedAt),
    freshness: { label: 'ShipDB 동기화', at: syncedAt }
  };
}

// UEX 시세 — 자체 프록시 엔드포인트를 통해 조회한다(캐시·검증·타임아웃 재사용).
// 실패/stale이면 후보를 만들지 않고 unavailable 상태를 명시한다 (M1 원칙).
let localizationCache = null;
async function loadCommodityKoMap(env) {
  if (localizationCache) return localizationCache;
  try {
    const text = await fetchAssetText(env, '/data/volt-localization.js');
    const data = parseDataLayerJs(text, 'VOLT_LOCALIZATION');
    const map = new Map(); // KO명 → EN명
    for (const section of Object.values(data)) {
      if (!section || typeof section !== 'object') continue;
      for (const [en, ko] of Object.entries(section)) {
        if (typeof ko === 'string') map.set(normalizeToken(ko), en);
      }
    }
    localizationCache = map;
  } catch (_error) {
    localizationCache = new Map(); // 로컬라이제이션 실패는 EN 매칭만으로 계속
  }
  return localizationCache;
}

export async function toolMarketInfo(env, request, query) {
  const origin = new URL(request.url).origin;
  const listResponse = await fetch(`${origin}/api/uex/commodities`, { headers: { Accept: 'application/json' } }).catch(() => null);
  if (!listResponse || !listResponse.ok) {
    return { data: { status: 'unavailable' }, sources: [{ label: 'UEX Corp API', url: '#trade-planner' }], freshness: { label: 'UEX 시세', at: null, status: 'unavailable' } };
  }
  const list = await listResponse.json().catch(() => null);
  if (!list || !Array.isArray(list.data)) {
    return { data: { status: 'unavailable' }, sources: [{ label: 'UEX Corp API', url: '#trade-planner' }], freshness: { label: 'UEX 시세', at: null, status: 'unavailable' } };
  }
  const koMap = await loadCommodityKoMap(env);
  const normalizedQuery = normalizeToken(query);
  const queryEn = koMap.get(normalizedQuery) || query;
  const normalizedEn = normalizeToken(queryEn);
  const commodity = list.data.find((item) => normalizeToken(item.name) === normalizedEn)
    || list.data.find((item) => normalizeToken(item.name).includes(normalizedEn) && normalizedEn.length >= 3);
  if (!commodity) {
    return { data: { status: 'not-found', query }, sources: [{ label: 'UEX Corp API', url: '#trade-planner' }], freshness: { label: 'UEX 시세', at: list.meta?.fetchedAt ?? null } };
  }
  const priceResponse = await fetch(`${origin}/api/uex/commodities/${encodeURIComponent(commodity.id)}/prices`, { headers: { Accept: 'application/json' } }).catch(() => null);
  const prices = priceResponse && priceResponse.ok ? await priceResponse.json().catch(() => null) : null;
  if (!prices || !Array.isArray(prices.data)) {
    return { data: { status: 'unavailable', commodity: commodity.name }, sources: [{ label: 'UEX Corp API', url: '#trade-planner' }], freshness: { label: 'UEX 시세', at: null, status: 'unavailable' } };
  }
  const locationName = (row) => row.terminal_name || row.space_station_name || row.city_name || row.outpost_name || '알 수 없음';
  // 무역플래너와 동일한 date_modified 기준 stale 판정(M1.1) — 위험 임계(60분)를 넘거나
  // 갱신 시각이 없는 행은 안내에서 제외한다. 오래된 시세를 최신처럼 답하지 않는다.
  const STALE_CUTOFF_MS = 60 * 60 * 1000;
  const now = Date.now();
  const isFresh = (row) => Number(row.date_modified) > 0 && (now - Number(row.date_modified) * 1000) < STALE_CUTOFF_MS;
  const freshRows = prices.data.filter(isFresh);
  const buys = freshRows.filter((row) => Number(row.price_buy) > 0)
    .sort((a, b) => a.price_buy - b.price_buy).slice(0, 3)
    .map((row) => ({ location: locationName(row), system: row.star_system_name || '', price: row.price_buy }));
  const sells = freshRows.filter((row) => Number(row.price_sell) > 0)
    .sort((a, b) => b.price_sell - a.price_sell).slice(0, 3)
    .map((row) => ({ location: locationName(row), system: row.star_system_name || '', price: row.price_sell }));
  if (!buys.length && !sells.length) {
    return {
      data: { status: 'stale', commodity: commodity.name },
      sources: [{ label: 'UEX Corp 시세 (VOLT 프록시 캐시)', detail: '60분 이내 갱신 시세 없음', url: '#trade-planner' }],
      freshness: { label: 'UEX 시세', at: prices.meta?.fetchedAt ?? null, status: 'stale' }
    };
  }
  return {
    data: { status: 'ok', commodity: commodity.name, buys, sells },
    sources: [{ label: 'UEX Corp 시세 (VOLT 프록시 캐시)', detail: `조회 ${prices.meta?.fetchedAt ?? '알 수 없음'} · 60분 이내 갱신 행만 표시`, url: '#trade-planner' }],
    freshness: { label: 'UEX 시세', at: prices.meta?.fetchedAt ?? null, ttlSeconds: prices.meta?.ttlSeconds ?? null }
  };
}

export async function toolUpcomingEvents(env) {
  try {
    const result = await requireDb(env).prepare(
      // created_at DESC로 먼저 20건을 자르면, 먼 미래 일정을 오래 전에 등록해 둔 경우
      // "최근 등록 20건" 밖으로 밀려 다가오는 일정에서 누락된다.
      // 다가오는 일정(0) → 날짜 미정·지난 일정(1) 순으로 정렬해 잘림이 생기지 않게 한다.
      `SELECT title, date_label, event_date, status FROM events WHERE published = 1
         ORDER BY CASE WHEN event_date IS NOT NULL AND event_date <> '' AND event_date >= date('now') THEN 0 ELSE 1 END,
                  event_date ASC
         LIMIT 20`
    ).all();
    // "다가오는 일정" = 오늘 이후를 가까운 순으로(M1.1). 날짜 없는 일정(dateLabel만)은 뒤에 붙인다.
    // 필터·정렬을 JS에서 수행해 모의 DB로도 계약을 검증할 수 있게 한다.
    const today = new Date().toISOString().slice(0, 10);
    const rows = result.results || [];
    const dated = rows.filter((row) => row.event_date && row.event_date >= today)
      .sort((a, b) => String(a.event_date).localeCompare(String(b.event_date)));
    const dateless = rows.filter((row) => !row.event_date);
    const items = [...dated, ...dateless].slice(0, 5)
      .map((row) => ({ title: row.title, dateLabel: row.date_label || row.event_date || '', status: row.status || '' }));
    return { data: { status: 'ok', events: items }, sources: [{ label: 'VOLT 일정 (CMS)', url: '#schedule' }], freshness: { label: '일정', at: new Date().toISOString() } };
  } catch (_error) {
    return { data: { status: 'unavailable' }, sources: [{ label: 'VOLT 일정 (CMS)', url: '#schedule' }], freshness: { label: '일정', at: null, status: 'unavailable' } };
  }
}

export async function toolRecentNotices(env) {
  try {
    const result = await requireDb(env).prepare(
      // 정렬은 포맷에 의존하지 않는다 — 점/대시가 섞이면 원문 정렬이 뒤집힌다(0012 참조).
      "SELECT title, date, tag FROM notices WHERE published = 1 ORDER BY pinned DESC, date(replace(date, '.', '-')) DESC LIMIT 5"
    ).all();
    const items = (result.results || []).map((row) => ({ title: row.title, date: row.date || '', tag: row.tag || '' }));
    return { data: { status: 'ok', notices: items }, sources: [{ label: 'VOLT 공지 (CMS)', url: '#notices' }], freshness: { label: '공지', at: new Date().toISOString() } };
  } catch (_error) {
    return { data: { status: 'unavailable' }, sources: [{ label: 'VOLT 공지 (CMS)', url: '#notices' }], freshness: { label: '공지', at: null, status: 'unavailable' } };
  }
}
