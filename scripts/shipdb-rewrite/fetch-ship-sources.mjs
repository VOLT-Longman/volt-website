// Release status and market snapshots only. Performance comes from Game2.dcb.
import fs from 'node:fs/promises';
const urls = {
    release: 'https://robertsspaceindustries.com/ship-matrix/index',
    purchase: 'https://www.volt.ceo/api/uex/ship-prices',
    rentals: 'https://api.uexcorp.space/2.0/vehicles_rentals_prices_all',
    terminals: 'https://api.uexcorp.space/2.0/terminals',
};
const get = async (url) => {
    const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw Error(`Source failed: ${url} (${response.status})`);
    const payload = await response.json();
    if (!Array.isArray(payload.data) || !payload.data.length) throw Error(`Empty source: ${url}`);
    return payload.data;
};
const [release, purchase, rentals, terminals] = await Promise.all(Object.values(urls).map(get));
const checkedAt = new Date().toISOString();
const places = new Map(terminals.map((t) => [Number(t.id), t]));
const ships = purchase.map((ship) => ({
    uuid: ship.uuid, name: ship.name,
    purchase: ship.shops.map((s) => ({ shop: s.shop, location: s.place, price: s.price })),
    rentals: [...new Map(rentals.filter((r) => Number(r.id_vehicle) === ship.id && Number(r.price_rent) > 0)
        .filter((r) => { const t = places.get(Number(r.id_terminal)); return t && t.is_available !== 0 && t.is_available_live !== 0; })
        .sort((a, b) => Number(a.date_modified) - Number(b.date_modified))
        .map((r) => { const t = places.get(Number(r.id_terminal)); return [t.id, { shop: t.name, location: t.city_name || t.space_station_name || t.outpost_name || t.moon_name || t.planet_name || '', price: Number(r.price_rent) }]; })).values()],
}));
const write = (file, data) => fs.writeFile(file, `${JSON.stringify(data, null, 2)}\n`);
await write('data/external/rsi/ship-release-status.json', { source: urls.release, checkedAt: checkedAt.slice(0, 10), ships: release.map((r) => ({ name: r.name, manufacturer: r.manufacturer.name, status: r.production_status, url: new URL(r.url, 'https://robertsspaceindustries.com').href })) });
await fs.mkdir('data/external/uex', { recursive: true });
await write('data/external/uex/ship-market.json', { source: 'UEX', sources: [urls.purchase, urls.rentals, urls.terminals], checkedAt, ships });
console.log(`Saved ${release.length} official release statuses and ${ships.length} price-only market records.`);
