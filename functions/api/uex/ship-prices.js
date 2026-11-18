import { json, error } from '../../_shared/http.js';
import { fetchUex, getUpstreamUrl, readUexPayload } from '../../_shared/uex-proxy.js';

// UEX's all-vehicle purchase table has a documented 12-hour upstream cache.
// One shared catalog avoids upstream requests for each selected ship.
const TTL = 12 * 60 * 60;

export function buildShipPrices(vehicles, prices, terminals) {
  const places = new Map(terminals.filter((terminal) => terminal?.id).map((terminal) => [Number(terminal.id), terminal]));
  const offers = new Map();
  for (const row of prices) {
    if (!row) continue;
    const price = Number(row.price_buy);
    const terminalId = Number(row.id_terminal);
    const terminal = places.get(terminalId);
    if (!Number.isFinite(price) || price <= 0 || !terminal || terminal.is_available === 0 || terminal.is_available_live === 0) continue;
    const vehicleId = Number(row.id_vehicle);
    if (!offers.has(vehicleId)) offers.set(vehicleId, new Map());
    const shops = offers.get(vehicleId);
    const old = shops.get(terminalId);
    // Do not combine duplicate reports into multiple sellers. Prefer the newest.
    if (old && old.updatedAt >= (Number(row.date_modified) || 0)) continue;
    shops.set(terminalId, {
      terminalId, shop: String(terminal.name || row.terminal_name || ''),
      place: String(terminal.city_name || terminal.space_station_name || terminal.outpost_name || terminal.moon_name || terminal.planet_name || ''),
      system: String(terminal.star_system_name || ''), price,
      updatedAt: Number(row.date_modified) || 0,
    });
  }
  return vehicles.filter((vehicle) => vehicle?.id && vehicle.name_full && !vehicle.is_concept).map((vehicle) => ({
    id: Number(vehicle.id), uuid: String(vehicle.uuid || '').toLowerCase(), name: String(vehicle.name_full),
    shops: [...(offers.get(Number(vehicle.id))?.values() || [])].sort((a, b) => a.price - b.price || a.terminalId - b.terminalId),
  }));
}

export async function onRequestGet({ request, env, waitUntil }) {
  const cache = caches.default;
  // User query strings never vary the cache key or the upstream endpoints.
  const key = new Request(new URL('/__uex-cache/ship-prices/v1', request.url));
  const cached = await cache.match(key);
  if (cached) return cached;
  const results = await Promise.all(['vehicles', 'vehicles_purchases_prices_all', 'terminals'].map(async (path) => {
    const result = await fetchUex(getUpstreamUrl(env, path));
    if (result.error || !result.response.ok) return null;
    return readUexPayload(result.response);
  }));
  if (results.some((result) => !result)) return error('Ship purchase information unavailable', 503);
  const response = json({
    status: 'ok', data: buildShipPrices(...results.map((result) => result.data)),
    meta: { source: 'uex', fetchedAt: new Date().toISOString(), ttlSeconds: TTL },
  }, { cacheControl: `public, max-age=${TTL}` });
  waitUntil(cache.put(key, response.clone()));
  return response;
}
