// Erkul live 동기화 공용 로직 (Cloudflare Workers 환경 — fs 없음, 전부 메모리 처리).
//
// 중복 주의: 필드 추출 규칙은 scripts/erkul/normalize-erkul-ships.mjs,
// normalize-erkul-market.mjs, build-ship-live-data.mjs와 동일해야 한다.
// Node 스크립트는 파일 I/O 파이프라인 중심이라 아직 이 모듈을 공유하지 않는다(후속 리팩터 후보).
// 추출 규칙을 바꿀 때는 두 곳을 함께 갱신하고 docs/erkul-field-map.md를 기준으로 삼는다.

export const ERKUL_SHIPS_ENDPOINT = 'https://server.erkul.games/live/ships';
export const ERKUL_SHOP_ENDPOINT = 'https://server.erkul.games/shop';
export const ERKUL_FETCH_TIMEOUT_MS = 30000;

const ERKUL_HEADERS = {
  Origin: 'https://www.erkul.games',
  Referer: 'https://www.erkul.games/live/calculator',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36',
  Accept: 'application/json, text/plain, */*'
};

export class ErkulFetchError extends Error {
  constructor(message, kind) {
    super(message);
    this.name = 'ErkulFetchError';
    this.kind = kind; // 'timeout' | 'network' | 'blocked' | 'http' | 'parse' | 'shape'
  }
}

export async function fetchErkulJson(url, timeoutMs = ERKUL_FETCH_TIMEOUT_MS, fetchImpl = fetch) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetchImpl(url, { headers: ERKUL_HEADERS, signal: controller.signal });
  } catch (cause) {
    if (cause?.name === 'AbortError') throw new ErkulFetchError(`Erkul 요청 시간 초과(${timeoutMs}ms): ${url}`, 'timeout');
    throw new ErkulFetchError(`Erkul 네트워크 오류: ${url}`, 'network');
  } finally {
    clearTimeout(timer);
  }
  if (response.status === 403 || response.status === 418) {
    throw new ErkulFetchError(`Erkul이 요청을 차단함(${response.status})`, 'blocked');
  }
  if (!response.ok) throw new ErkulFetchError(`Erkul 응답 오류: ${response.status}`, 'http');
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch (_error) {
    throw new ErkulFetchError('Erkul JSON 파싱 실패', 'parse');
  }
}

// data/ship-live-stats.js 같은 `window.X = {...};` 데이터 레이어 파일을 객체로 파싱한다.
export function parseDataLayerJs(text, varName) {
  const marker = `window.${varName} = `;
  const start = text.indexOf(marker);
  if (start === -1) throw new Error(`데이터 레이어 파싱 실패: ${varName} 할당을 찾지 못함`);
  let body = text.slice(start + marker.length).trim();
  if (body.endsWith(';')) body = body.slice(0, -1);
  return JSON.parse(body);
}

const toNull = (v) => (v === undefined || v === null || (typeof v === 'number' && Number.isNaN(v)) ? null : v);
const toSizeLabel = (n) => (typeof n === 'number' ? `S${n}` : null);

function cleanDescription(raw) {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  const lines = raw.split(/\\n|\r?\n/);
  let start = 0;
  while (start < lines.length && (/^\s*$/.test(lines[start]) || /^\s*(Manufacturer|Focus):\s/.test(lines[start]))) start += 1;
  const body = lines
    .slice(start)
    .map((line) => line.trim())
    .filter((line, idx, arr) => line !== '' || (idx > 0 && arr[idx - 1] !== ''))
    .join('\n')
    .trim();
  return body || null;
}

// Erkul raw 함선 레코드 → data/ship-live-stats.js entry와 같은 모양(diff 대상 필드만).
export function normalizeErkulShip(record) {
  const d = record?.data ?? {};
  const size = d.vehicle?.size;
  const hasXY = typeof size?.x === 'number' && typeof size?.y === 'number';
  return {
    localName: toNull(record?.localName),
    name: toNull(d.name),
    ref: toNull(d.ref),
    manufacturer: toNull(d.manufacturerData?.data?.name),
    role: toNull(d.vehicle?.role),
    career: toNull(d.vehicle?.career),
    size: toSizeLabel(toNull(d.size)),
    crewSize: toNull(d.vehicle?.crewSize),
    speeds: {
      scm: toNull(d.ifcs?.scmSpeed),
      scmBoostForward: toNull(d.ifcs?.boostSpeedForward),
      scmBoostBackward: toNull(d.ifcs?.boostSpeedBackward),
      navMax: toNull(d.ifcs?.maxSpeed)
    },
    hp: toNull(d.hull?.totalHp),
    cargoScu: toNull(d.cargo),
    dimensions: {
      length: hasXY ? Math.max(size.x, size.y) : null,
      beam: hasXY ? Math.min(size.x, size.y) : null,
      height: toNull(size?.z)
    },
    massKg: toNull(d.hull?.mass),
    fuel: {
      hydrogenScu: toNull(d.fuelCapacity),
      quantumScu: toNull(d.qtFuelCapacity)
    },
    insurance: {
      expeditionFee: toNull(d.insurance?.baseExpeditingFee),
      claimTime: toNull(d.insurance?.baseWaitTimeMinutes),
      expediteTime: toNull(d.insurance?.mandatoryWaitTimeMinutes)
    },
    damageReduction: {
      physical: toNull(d.armor?.data?.armor?.damageMultiplier?.damagePhysical),
      energy: toNull(d.armor?.data?.armor?.damageMultiplier?.damageEnergy),
      distortion: toNull(d.armor?.data?.armor?.damageMultiplier?.damageDistortion),
      fuse: toNull(d.vehicle?.fusePenetrationDamageMultiplier),
      component: toNull(d.vehicle?.componentPenetrationDamageMultiplier)
    },
    descriptionEn: cleanDescription(d.description)
  };
}

const RENTAL_NAME_PATTERN = /rentals?\b|\brent\b/i;

// Erkul shop raw → localName 기준 {purchase, rentals}. A-3 normalize-erkul-market.mjs와 동일 규칙:
// rental 판정은 data.rental boolean 우선, price<=0 구매행 제외, shop+location+price 중복 dedupe.
export function normalizeErkulMarket(rawShops) {
  const byLocal = new Map();
  const seen = new Set();
  let inventoryRows = 0;
  for (const shopRecord of rawShops) {
    const shop = shopRecord?.data ?? {};
    const shopName = toNull(shop.name);
    const location = shop.location?.trim() ? shop.location.trim() : null;
    const isRental = shop.rental === true || RENTAL_NAME_PATTERN.test(shopName ?? '');
    for (const row of Array.isArray(shop.inventory) ? shop.inventory : []) {
      inventoryRows += 1;
      if (!row?.localName) continue;
      const key = `${shopName}|${location}|${row.localName}|${row.price}|${isRental ? 'r' : 'p'}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const entry = byLocal.get(row.localName) ?? { purchase: [], rentals: [] };
      const priceValid = typeof row.price === 'number' && row.price > 0;
      const item = {
        shop: shopName,
        location,
        price: priceValid ? row.price : null,
        available: toNull(row.available),
        unavailable: toNull(row.unavailable)
      };
      if (isRental) entry.rentals.push(item);
      else if (priceValid) entry.purchase.push(item);
      else continue; // price=0 구매행은 preview 대상에서도 제외 (A-3 규칙)
      byLocal.set(row.localName, entry);
    }
  }
  for (const entry of byLocal.values()) {
    entry.purchase.sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity));
  }
  return { byLocal, inventoryRows, shopsCount: rawShops.length };
}

// diff 대상 stats 필드 (docs/shipdb-2-schema.md · A-7 지시서 5절 기준)
const STATS_DIFF_PATHS = [
  'cargoScu', 'hp', 'size', 'crewSize', 'massKg',
  'speeds.scm', 'speeds.scmBoostForward', 'speeds.scmBoostBackward', 'speeds.navMax',
  'fuel.hydrogenScu', 'fuel.quantumScu',
  'insurance.expeditionFee', 'insurance.claimTime', 'insurance.expediteTime',
  'damageReduction.physical', 'damageReduction.energy', 'damageReduction.distortion',
  'damageReduction.fuse', 'damageReduction.component',
  'dimensions.length', 'dimensions.beam', 'dimensions.height'
];

function getPath(obj, path) {
  return path.split('.').reduce((node, key) => (node == null ? undefined : node[key]), obj);
}

export function diffShipStats(voltId, name, currentEntry, incoming) {
  const rows = [];
  for (const path of STATS_DIFF_PATHS) {
    const current = toNull(getPath(currentEntry, path));
    const next = toNull(getPath(incoming, path));
    if (current !== next) rows.push({ voltId, name, field: path, current, incoming: next });
  }
  return rows;
}

const marketRowKey = (row) => `${row.shop}|${row.location}`;

export function diffShipMarket(voltId, name, currentEntry, incomingMarket) {
  const rows = [];
  const currentPurchase = new Map((currentEntry?.purchase ?? []).map((r) => [marketRowKey(r), r]));
  const incomingPurchase = new Map((incomingMarket?.purchase ?? []).map((r) => [marketRowKey(r), r]));
  for (const [key, inc] of incomingPurchase) {
    const cur = currentPurchase.get(key);
    if (!cur) {
      rows.push({ voltId, name, type: 'purchase-added', shop: inc.shop, location: inc.location, current: null, incoming: inc.price });
      continue;
    }
    if (cur.price !== inc.price) {
      rows.push({ voltId, name, type: 'price', shop: inc.shop, location: inc.location, current: cur.price, incoming: inc.price });
    }
    if (toNull(cur.available) !== toNull(inc.available) || toNull(cur.unavailable) !== toNull(inc.unavailable)) {
      rows.push({
        voltId, name, type: 'stock', shop: inc.shop, location: inc.location,
        current: `available ${cur.available ?? '-'} / unavailable ${cur.unavailable ?? '-'}`,
        incoming: `available ${inc.available ?? '-'} / unavailable ${inc.unavailable ?? '-'}`
      });
    }
  }
  for (const [key, cur] of currentPurchase) {
    if (!incomingPurchase.has(key)) {
      rows.push({ voltId, name, type: 'purchase-removed', shop: cur.shop, location: cur.location, current: cur.price, incoming: null });
    }
  }
  const currentRentals = new Map((currentEntry?.rentals ?? []).map((r) => [marketRowKey(r), r]));
  const incomingRentals = new Map((incomingMarket?.rentals ?? []).map((r) => [marketRowKey(r), r]));
  for (const [key, inc] of incomingRentals) {
    const cur = currentRentals.get(key);
    if (!cur) rows.push({ voltId, name, type: 'rental-added', shop: inc.shop, location: inc.location, current: null, incoming: inc.price });
    else if (cur.price !== inc.price) rows.push({ voltId, name, type: 'rental-price', shop: inc.shop, location: inc.location, current: cur.price, incoming: inc.price });
  }
  for (const [key, cur] of currentRentals) {
    if (!incomingRentals.has(key)) rows.push({ voltId, name, type: 'rental-removed', shop: cur.shop, location: cur.location, current: cur.price, incoming: null });
  }
  return rows;
}

// 현재 레이어 + Erkul 최신 데이터 → preview diff. 파일 쓰기 없음.
export function buildSyncPreview({ currentStats, currentMarket, erkulShipsRaw, erkulShopsRaw, matchBaseline }) {
  const incomingByLocal = new Map();
  for (const record of erkulShipsRaw) {
    const normalized = normalizeErkulShip(record);
    if (normalized.localName) incomingByLocal.set(normalized.localName, normalized);
  }
  const market = normalizeErkulMarket(erkulShopsRaw);

  const statsChanges = [];
  const marketChanges = [];
  const descriptionChanges = [];
  const warnings = [];

  const matchedLocalNames = new Set();
  for (const [voltId, entry] of Object.entries(currentStats)) {
    const localName = entry.erkulLocalName;
    matchedLocalNames.add(localName);
    const incoming = incomingByLocal.get(localName);
    if (!incoming) {
      warnings.push(`Erkul live에서 사라진 함선: ${localName} (volt: ${voltId}) — 재매칭 필요`);
      continue;
    }
    statsChanges.push(...diffShipStats(voltId, incoming.name, entry, incoming));
    if ((entry.descriptions?.en ?? null) !== incoming.descriptionEn) {
      descriptionChanges.push({ voltId, name: incoming.name, field: 'descriptions.en', current: entry.descriptions?.en ?? null, incoming: incoming.descriptionEn });
    }
    const currentMarketEntry = currentMarket[voltId] ?? { purchase: [], rentals: [] };
    marketChanges.push(...diffShipMarket(voltId, incoming.name, currentMarketEntry, market.byLocal.get(localName)));
  }

  // 신규 후보: Erkul live에는 있으나 현재 레이어(=A-4 matched)에 없는 함선. 자동 추가하지 않는다.
  const newCandidates = [...incomingByLocal.values()]
    .filter((ship) => !matchedLocalNames.has(ship.localName))
    .map((ship) => ({ localName: ship.localName, name: ship.name, manufacturer: ship.manufacturer }));

  // shop에는 있으나 Erkul ships 목록에 없는 선체(구형 Aurora 등) — A-3/A-4와 동일하게 기록만.
  const componentLike = /turret|module|mount|cannon|gatling|repeater|tractorbeam|missile|wing|scitem|lasercannon|ballistic|_s\d+$/i;
  const vehiclePrefix = /^(aegs|anvl|orig|misc|drak|rsi|crus|cnou|argo|mrai|banu|xian|xnaa|espr|grin|krig|tmbl|vncl|gama|mira|aopo)_/;
  const marketOnly = [...market.byLocal.keys()]
    .filter((localName) => !incomingByLocal.has(localName) && vehiclePrefix.test(localName) && !componentLike.test(localName))
    .map((localName) => ({ localName }));

  const distinct = (rows) => new Set(rows.map((r) => r.voltId)).size;
  const priceRows = marketChanges.filter((r) => r.type === 'price');
  const locationRows = marketChanges.filter((r) => r.type === 'purchase-added' || r.type === 'purchase-removed');
  const rentalRows = marketChanges.filter((r) => r.type.startsWith('rental'));

  const CAP = 200;
  const cap = (rows, label) => {
    if (rows.length <= CAP) return rows;
    warnings.push(`${label} 변경이 ${rows.length}건이라 앞 ${CAP}건만 반환함`);
    return rows.slice(0, CAP);
  };

  return {
    source: 'erkul-live',
    generatedAt: new Date().toISOString(),
    summary: {
      erkulShips: erkulShipsRaw.length,
      erkulShops: market.shopsCount,
      matched: Object.keys(currentStats).length,
      statsChanged: distinct(statsChanges),
      marketChanged: distinct(marketChanges),
      descriptionsChanged: distinct(descriptionChanges),
      newErkulCandidates: newCandidates.length,
      unmatchedVolt: matchBaseline?.unmatchedVolt?.length ?? null,
      marketOnlyUnmatched: marketOnly.length,
      priceChanges: priceRows.length,
      purchaseLocationChanges: locationRows.length,
      rentalChanges: rentalRows.length
    },
    changes: {
      stats: cap(statsChanges, 'stats'),
      market: cap(marketChanges, 'market'),
      descriptions: cap(descriptionChanges, 'descriptions'),
      newCandidates: cap(newCandidates, 'newCandidates'),
      unmatched: matchBaseline?.unmatchedVolt ?? [],
      marketOnly
    },
    warnings
  };
}
