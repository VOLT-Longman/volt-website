import { proxyUexDerived, uexId as id, uexIsZero } from '../../_shared/uex-proxy.js';

// 함선·차량의 게임 내 구매가와 대여가 (출처: UEX vehicles, vehicles_purchases_prices_all,
// vehicles_rentals_prices_all, terminals). 기존 /api/uex/ship-prices(구매처 목록)는 그대로 두고,
// 대여가와 보고 시각이 필요한 새 화면용으로 따로 둔다.
const CACHE_TTL_SECONDS = 12 * 60 * 60;
const UUID_PATTERN = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

function collect(rows, priceField, terminals, target, key) {
  for (const row of rows) {
    if (!row) continue;
    const price = Number(row[priceField]);
    const vehicleId = id(row.id_vehicle);
    const terminalId = id(row.id_terminal);
    // ship-prices.js와 같은 규칙: 가격이 없거나, 터미널이 목록에 없거나 현재 게임에 없으면 뺀다.
    if (!vehicleId || !terminals.has(terminalId) || !Number.isFinite(price) || price <= 0) continue;
    if (!target.has(vehicleId)) target.set(vehicleId, { name: String(row.vehicle_name || ''), buy: new Map(), rent: new Map() });
    const offers = target.get(vehicleId)[key];
    const at = id(row.date_modified);
    const old = offers.get(terminalId);
    // 같은 터미널의 중복 보고는 최신 것 하나만.
    if (old && (old.at || 0) >= at) continue;
    offers.set(terminalId, { t: terminalId, price, ...(at ? { at } : {}) });
  }
}

export function buildVehiclePrices(vehicles, purchases, rentals, terminalRows) {
  const available = new Map();
  for (const row of terminalRows) {
    if (row && id(row.id) && !uexIsZero(row.is_available) && !uexIsZero(row.is_available_live)) available.set(id(row.id), row);
  }
  const offers = new Map();
  collect(purchases, 'price_buy', available, offers, 'buy');
  collect(rentals, 'price_rent', available, offers, 'rent');
  const catalog = new Map(vehicles.filter((row) => row && id(row.id)).map((row) => [id(row.id), row]));
  // uuid = UEX vehicles.uuid (게임 파일의 함선 기록 id). 형식이 맞고 UEX 목록 안에서 한 함선에만 쓰인 것만 싣는다.
  // 2026-11-19 목록에서 두 쌍(Prowler / Prowler Utility, Guardian QI / Guardian MX)이 같은 uuid를 나눠 써서
  // 어느 쪽이 맞는지 알 수 없다 — 그런 것은 뺀다 (모름).
  const uuidOf = (row) => (typeof row?.uuid === 'string' && UUID_PATTERN.test(row.uuid.trim()) ? row.uuid.trim().toLowerCase() : '');
  const uuidUses = new Map();
  for (const row of catalog.values()) if (uuidOf(row)) uuidUses.set(uuidOf(row), (uuidUses.get(uuidOf(row)) || 0) + 1);
  const terminals = {};
  const sorted = (map) => [...map.values()].sort((a, b) => a.price - b.price || a.t - b.t);
  const data = [...offers.entries()].sort((a, b) => a[0] - b[0]).map(([vehicleId, entry]) => {
    const vehicle = catalog.get(vehicleId);
    const uuid = uuidUses.get(uuidOf(vehicle)) === 1 ? uuidOf(vehicle) : '';
    for (const offer of [...entry.buy.values(), ...entry.rent.values()]) {
      const terminal = available.get(offer.t);
      terminals[offer.t] = {
        name: String(terminal.name || ''),
        place: String(terminal.city_name || terminal.space_station_name || terminal.outpost_name || terminal.moon_name || terminal.planet_name || ''),
        system: String(terminal.star_system_name || ''),
      };
    }
    return {
      id: vehicleId, ...(uuid ? { uuid } : {}), name: String(vehicle?.name_full || entry.name),
      ...(entry.buy.size ? { buy: sorted(entry.buy) } : {}), ...(entry.rent.size ? { rent: sorted(entry.rent) } : {}),
    };
  });
  return { terminals, vehicles: data };
}

export async function onRequestGet(context) {
  return proxyUexDerived(context, {
    cacheName: 'vehicle-prices/v1', ttlSeconds: CACHE_TTL_SECONDS, build: buildVehiclePrices, isUsable: (data) => data.vehicles.length > 0,
    upstreamPaths: ['vehicles', 'vehicles_purchases_prices_all', 'vehicles_rentals_prices_all', 'terminals'],
  });
}
