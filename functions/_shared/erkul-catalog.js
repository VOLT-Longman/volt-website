// Public Erkul catalog adapter. Keep the legacy normalization pipeline while
// validating the current compressed catalog and its content-addressed files.
import { ErkulFetchError } from './erkul-sync.js';
export const ERKUL_CATALOG_URL = 'https://cdn.erkul.games/LIVE/catalog.bin';
export const ERKUL_PRICES_URL = 'https://cdn.erkul.games/prices.bin';
const BASE = 'https://cdn.erkul.games/LIVE/';

async function readBin(url, fetchImpl, expectedHash) {
  const response = await fetchImpl(url, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new ErkulFetchError(`Erkul catalog HTTP ${response.status}`, 'http');
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (expectedHash) {
    const hash = await crypto.subtle.digest('SHA-256', bytes);
    const actual = [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, '0')).join('');
    if (actual !== expectedHash) throw new Error('Erkul catalog hash mismatch');
  }
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return JSON.parse(await new Response(stream).text());
}

function catalogPath(path) {
  if (typeof path !== 'string' || !/^[a-zA-Z0-9_./-]+\.bin$/.test(path) || path.includes('..')) throw new Error('Invalid Erkul catalog path');
  return BASE + path;
}

export function adaptCatalogShip(index, detail, version, generatedAt) {
  const p = detail.precomputed;
  if (!p || detail.ref !== index.ref || detail.className !== index.className) throw new Error('Erkul ship identity mismatch');
  return {
    localName: index.className,
    calculatorType: index.category === 'AssembledGroundVehicle' ? 'vehicle' : 'ship',
    catalogVersion: version,
    catalogGeneratedAt: generatedAt,
    data: {
      ref: index.ref, name: index.name, size: index.size,
      manufacturerData: { data: { name: index.manufacturerName } },
      vehicle: { role: index.role, career: index.career, crewSize: index.crewSize,
        size: index.dimensions, fusePenetrationDamageMultiplier: detail.vehicle?.fusePenetrationMultiplier,
        componentPenetrationDamageMultiplier: detail.vehicle?.componentPenetrationMultiplier },
      hull: { totalHp: p.hp?.total, mass: p.massFixedKg },
      cargo: p.cargo,
      ifcs: { ...p.flight, angularVelocity: { x: p.flight?.pitch, y: p.flight?.roll, z: p.flight?.yaw } },
      fuelCapacity: p.fuel?.hydrogenCapacity, qtFuelCapacity: p.fuel?.quantumCapacity,
      insurance: detail.vehicle?.insurance,
      items: { countermeasures: detail.countermeasures ?? [] },
      armor: { data: { armor: { damageMultiplier: p.armorModifiers } } },
      description: detail.i18n?.description ?? null
    }
  };
}

export function adaptCatalogPrices(prices, ships) {
  const refToLocal = new Map(ships.map(s => [s.data.ref, s.localName]));
  const shops = new Map();
  for (const [ref, rows] of Object.entries(prices.items)) {
    const localName = refToLocal.get(ref);
    if (!localName) continue;
    for (const row of rows) {
      const terminal = prices.terminals[row.terminal];
      if (!terminal) throw new Error('Erkul price terminal missing');
      for (const [field, rental] of [['buy', false], ['rent', true]]) {
        if (!(Number(row[field]) > 0)) continue;
        const key = `${row.terminal}:${field}`;
        if (!shops.has(key)) shops.set(key, { data: { name: terminal.name, location: terminal.city || terminal.station || terminal.outpost || terminal.planet || terminal.system, rental, inventory: [] } });
        shops.get(key).data.inventory.push({ localName, price: row[field] });
      }
    }
  }
  return [...shops.values()];
}

export async function fetchErkulCatalog({ fetchImpl = fetch, detailCache = {}, maxDetailRequests = Infinity } = {}) {
  const manifest = await readBin(ERKUL_CATALOG_URL, fetchImpl);
  if (manifest.schemaVersion !== 8 || manifest.branch !== 'LIVE') throw new Error('Unsupported Erkul LIVE catalog schema');
  const entry = manifest.singles.find(s => s.kind === 'index');
  const index = await readBin(catalogPath(entry.path), fetchImpl, entry.sha256);
  if (index.dataVersion !== manifest.dataVersion || index.ships?.length < 100) throw new Error('Erkul catalog version/count mismatch');
  const blobs = [];
  for (const group of manifest.groups) {
    if (!['ships', 'groundvehicles'].includes(group.kind)) continue;
    const data = await readBin(catalogPath(group.indexPath), fetchImpl, group.indexSha256);
    blobs.push(...data.blobs);
  }
  const byRef = new Map(blobs.map(b => [b.ref, b]));
  const missing = index.ships.filter(s => detailCache[s.className]?.adapterVersion !== 2 || detailCache[s.className]?.sha256 !== byRef.get(s.ref)?.sha256);
  if (missing.length > maxDetailRequests) throw new Error(`Erkul 상세 변경 ${missing.length}건: 로컬 동기화를 실행한 뒤 배포해 주세요.`);
  const details = {};
  const ships = [];
  // Four concurrent requests stay within Workers' simultaneous connection limit.
  for (let offset = 0; offset < index.ships.length; offset += 4) {
    const batch = await Promise.all(index.ships.slice(offset, offset + 4).map(async s => {
      const blob = byRef.get(s.ref);
      if (!blob) throw new Error('Erkul ship blob missing');
      let cached = detailCache[s.className];
      if (cached?.adapterVersion !== 2 || cached?.sha256 !== blob.sha256) {
        const full = await readBin(catalogPath(blob.path), fetchImpl, blob.sha256);
        const countermeasures = (full.slots ?? []).filter(slot => slot.item?.category === 'Countermeasure').map(slot => ({ data: { shortName: slot.item.i18n?.shortName, ammoContainer: { maxAmmoCount: slot.item.ammo?.maxCount } } }));
        cached = { adapterVersion: 2, sha256: blob.sha256, detail: { ref: full.ref, className: full.className, i18n: full.i18n, countermeasures,
          vehicle: { insurance: full.vehicle?.insurance, fusePenetrationMultiplier: full.vehicle?.fusePenetrationMultiplier,
            componentPenetrationMultiplier: full.vehicle?.componentPenetrationMultiplier }, precomputed: full.precomputed } };
      }
      details[s.className] = cached;
      return adaptCatalogShip(s, cached.detail, manifest.dataVersion, manifest.generatedAt);
    }));
    ships.push(...batch);
  }
  const prices = await readBin(ERKUL_PRICES_URL, fetchImpl);
  if (prices.schemaVersion !== 2 || prices.catalog?.LIVE !== manifest.dataVersion || !prices.items || !prices.terminals) throw new Error('Erkul prices/catalog mismatch');
  const shops = adaptCatalogPrices(prices, ships);
  if (shops.length < 10) throw new Error('Erkul market count too small');
  return { ships, shops, details, metadata: { source: 'erkul-live', version: manifest.dataVersion,
    generatedAt: manifest.generatedAt, pricesGeneratedAt: prices.generatedAt, fetchedAt: new Date().toISOString() } };
}
