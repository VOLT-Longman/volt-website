// Game files own ship performance. RSI owns release status; UEX owns prices only.
// Run loadout:build with the same --cache-dir first to extract vehicle XMLs.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { DataForge } from '../gamedata/dataforge.mjs';
import { P4k, parseCryXml } from '../gamedata/p4k.mjs';
import { isExcludedShip } from '../../functions/_shared/ship-catalog-policy.js';

const arg = (name) => process.argv[process.argv.indexOf(name) + 1];
if (!process.argv.includes('--cache-dir') || !process.argv.includes('--ko-ini')) throw Error('Required: --cache-dir <game cache> --ko-ini <Korean patch global.ini>');
const cache = arg('--cache-dir');
const read = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const write = (file, data) => fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const bytes = fs.readFileSync(path.join(cache, 'Game2.dcb'));
const df = new DataForge(bytes);
if (!df.consistent) throw Error('DataForge layout mismatch');
const build = read(path.join(cache, 'build.json'));
const sourceVersion = `${build.Branch.replace(/^sc-alpha-/, '')}-LIVE.${build.RequestedP4ChangeNum}`;
if (read('data/loadout/meta.json').gameVersion !== build.Version) throw Error('Loadout and ShipDB builds differ');
const ini = (file) => new Map(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/).filter((line) => line.includes('=')).map((line) => [line.slice(0, line.indexOf('=')).trim().replace(/,P$/i, '').toLowerCase(), line.slice(line.indexOf('=') + 1)]));
const en = ini(path.join(cache, 'global.ini')); const ko = ini(arg('--ko-ini'));
const localize = (key, strings = en) => { const text = strings.get(String(key || '').replace(/^@/, '').toLowerCase()); return text && !/^@|^<=|PLACEHOLDER/i.test(text) ? text.replace(/\\n/g, '\n').trim() : null; };
const descriptionBody = (value) => value?.replace(/^(?:(?:Manufacturer|Focus|Role|제조사|역할):[^\n]*\n)+\s*/i, '').trim() || null;
const component = (entity, type) => entity?.Components?.find((entry) => entry?.__type === type);
const records = new Map(df.recordsOfType('EntityClassDefinition').map((r) => [r.name.replace('EntityClassDefinition.', '').toLowerCase(), r]));
const entities = new Map();
const entity = (r) => { if (!r) return null; if (!entities.has(r.id)) entities.set(r.id, df.readRecord(r, 12)); return entities.get(r.id); };
const follow = (ref) => { const r = df.recordById.get(ref?.__record); return r ? df.readRecord(r, 12) : null; };
const n = (value, digits = 3) => typeof value === 'number' && Number.isFinite(value) ? Number(value.toFixed(digits)) : null;
const norm = (name) => String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const identities = read('data/canonical/ship-identities.json').records;
const presentation = read('data/canonical/presentation-ships.json');
const oldNames = new Map(presentation.records.map((r) => [r.id, r]));
const official = read('data/canonical/ships-rsi-official.json');
const release = read('data/external/rsi/ship-release-status.json');
const markets = read('data/external/uex/ship-market.json');
const source = { source: 'game-files', gameVersion: build.Version, sourceVersion, sourceSha256: hash(bytes), checkedAt: release.checkedAt };
let p4k; let xmlEntries;
function loadoutEntries(loadout) {
    if (!loadout) return [];
    if (loadout.entries) return loadout.entries;
    if (!loadout.loadoutPath) return [];
    const file = `data/${loadout.loadoutPath.replaceAll('\\', '/')}`.toLowerCase();
    const cached = path.join(cache, 'loadouts', `${hash(file)}.xml`);
    if (!fs.existsSync(cached)) {
        if (!p4k) {
            const p4kPath = process.argv.includes('--p4k') ? arg('--p4k') : 'C:/Program Files/Roberts Space Industries/StarCitizen/LIVE/Data.p4k';
            if (read(path.join(path.dirname(p4kPath), 'build_manifest.id')).Data.Version !== build.Version) throw Error('P4K and cached game builds differ');
            p4k = new P4k(p4kPath);
            xmlEntries = new Map(p4k.find((name) => /Scripts\\Loadouts\\.*\.xml$/i.test(name)).map((entry) => [entry.name.replaceAll('\\', '/').toLowerCase(), entry]));
        }
        const entry = xmlEntries.get(file); if (!entry) throw Error(`Missing loadout XML ${file}`);
        fs.mkdirSync(path.dirname(cached), { recursive: true }); fs.writeFileSync(cached, p4k.extract(entry));
    }
    const xml = parseCryXml(fs.readFileSync(cached));
    const items = (node) => node.children.flatMap((child) => child.tag === 'Item' ? [{ itemPortName: child.attrs.portName, entityClassName: child.attrs.itemName, loadout: { entries: items(child) } }] : items(child));
    return items(xml);
}

function chassis(xml) {
    let hp = 0; let mass = 0;
    const walk = (node) => { if (node.tag === 'Part') { hp += Number(node.attrs.damageMax) || 0; mass += Number(node.attrs.mass) || 0; } node.children.forEach(walk); };
    walk(xml);
    return { hp: hp > 0 ? n(hp) : null, massKg: mass > 0 ? n(mass) : null };
}

// Count installed grids per port, including identical grids installed twice.
// Empty or unresolved definitions are never converted into a manufactured zero.
function equipment(root) {
    const result = { cargo: 0, cargoComplete: true, fuel: { hydrogenScu: 0, quantumScu: 0 }, flight: null, armor: null, countermeasures: {} };
    // These unresolved ports were inspected in this build: personal inventory,
    // fuel-access helpers, interior doors, fuses and seat-access helpers, not cargo.
    const nonCargoMissing = new Set(['hardpoint_personal_storage', 'hardpoint_personal_storage_left', 'hardpoint_personal_storage_right', 'hardpoint_fuel_port', 'hardpoint_int_door', 'hardpoint_int', 'hardpoint_seat_access_leg_right', 'hardpoint_dummy_power_state', '$slot_fuse_01', '$slot_fuse_02', '$slot_fuse_03']);
    const walk = (entries, ancestry = new Set()) => {
        for (const slot of entries || []) {
            const r = slot.entityClassReference?.__record ? df.recordById.get(slot.entityClassReference.__record) : records.get(String(slot.entityClassName || '').toLowerCase());
            if (!r) { if ((slot.entityClassReference || slot.entityClassName) && !nonCargoMissing.has(slot.itemPortName)) { result.cargoComplete = false; if (process.env.SHIP_EXTRACT_DEBUG) console.log('Unresolved entry', slot.itemPortName, slot.entityClassReference, slot.entityClassName); } continue; }
            // A recursive self-reference does not represent another installed port.
            if (ancestry.has(r.id)) continue;
            const e = entity(r); const def = component(e, 'SAttachableComponentParams')?.AttachDef;
            const own = component(e, 'SEntityComponentDefaultLoadoutParams')?.loadout;
            const nested = slot.loadout?.entries?.length ? slot.loadout.entries : loadoutEntries(own);
            if (def?.Type === 'CargoGrid') {
                const container = follow(component(e, 'SCItemInventoryContainerComponentParams')?.containerParams);
                const dimensions = container?.interiorDimensions;
                if (!container && !component(e, 'SCItemInventoryContainerComponentParams') && nested?.length) { /* carrier plate; capacity belongs to its child grids */ }
                else if (container?.inventoryType?.__type !== 'InventoryOpenContainerType' || !dimensions || !['x', 'y', 'z'].every((key) => dimensions[key] > 0)) { result.cargoComplete = false; if (process.env.SHIP_EXTRACT_DEBUG) console.log('Unresolved grid', r.name); }
                else result.cargo += dimensions.x * dimensions.y * dimensions.z / (1.25 ** 3);
            }
            const flight = component(e, 'IFCSParams'); if (flight && !result.flight) result.flight = flight;
            const armor = component(e, 'SCItemVehicleArmorParams'); if (armor && !result.armor) result.armor = armor;
            if (component(e, 'SCItemFuelTankParams')) {
                const tank = component(e, 'ResourceContainer'); const capacity = tank?.capacity?.standardCargoUnits;
                if (Number.isFinite(capacity)) {
                    const kinds = (tank.inclusiveResources || []).map((r) => r.name).join(' ');
                    if (/QuantumFuel/i.test(kinds)) result.fuel.quantumScu += capacity;
                    else if (/Hydrogen|PlasmaFuel/i.test(kinds)) result.fuel.hydrogenScu += capacity;
                }
            }
            if (nested?.length) walk(nested, new Set([...ancestry, r.id]));
        }
    };
    walk(loadoutEntries(component(root, 'SEntityComponentDefaultLoadoutParams')?.loadout));
    return result;
}

const ships = []; const names = []; const localization = []; const operational = []; const roles = {};
for (const identity of identities) {
    const { id, cls } = identity;
    if (isExcludedShip(id, cls)) throw Error(`Excluded ship ${id}`);
    const record = records.get(cls); if (!record) throw Error(`Missing game record ${cls}`);
    const root = entity(record); const attach = component(root, 'SAttachableComponentParams')?.AttachDef; const vehicle = component(root, 'VehicleComponentParams');
    const xmlPath = path.join(cache, 'vehicles', vehicle.vehicleDefinition.split('/').pop().toLowerCase());
    const xml = fs.existsSync(xmlPath) ? parseCryXml(fs.readFileSync(xmlPath)) : null;
    const equipmentValues = equipment(root); const flight = equipmentValues.flight; const armor = equipmentValues.armor;
    const prior = oldNames.get(id) || official.records.find((r) => r.id === id);
    const gameName = localize(vehicle.vehicleName);
    const name = prior?.name || gameName.replace(/^(Drake|Gatac) /, '');
    const releaseName = identity.rsiName || name;
    const status = release.ships.find((r) => norm(r.name) === norm(releaseName));
    const manufacturer = localize(follow(vehicle.manufacturer)?.Localization?.Name);
    const role = localize(vehicle.vehicleRole);
    const dim = vehicle.maxBoundingBoxSize;
    const shop = markets.ships.find((r) => r.uuid === record.id) || markets.ships.find((r) => norm(r.name) === norm(gameName));
    const description = descriptionBody(localize(vehicle.vehicleDescription));
    if (!gameName || !manufacturer || !xml) throw Error(`Incomplete ship definition: ${cls}`);
    const ship = { id, ...source, gameClass: cls, gameRef: record.id, nameKo: localize(vehicle.vehicleName, ko)?.replace(/\s*\[[^\]]*\]\s*$/, '').trim(), manufacturer, role, career: localize(vehicle.vehicleCareer),
        size: attach?.Size > 0 ? `S${attach.Size}` : null, platform: /groundvehicles/i.test(record.file) ? 'ground' : 'space', crewSize: n(vehicle.crewSize),
        cargoScu: equipmentValues.cargoComplete ? n(equipmentValues.cargo) : null,
        ...(xml ? chassis(xml) : { hp: null, massKg: null }),
        speeds: { scm: n(flight?.scmSpeed), scmBoostForward: n(flight?.boostSpeedForward), scmBoostBackward: n(flight?.boostSpeedBackward), navMax: n(flight?.maxSpeed) },
        rotation: { pitch: n(flight?.maxAngularVelocity?.x), yaw: n(flight?.maxAngularVelocity?.z), roll: n(flight?.maxAngularVelocity?.y) },
        dimensions: { length: n(dim?.y), beam: n(dim?.x), height: n(dim?.z) },
        fuel: { hydrogenScu: n(equipmentValues.fuel.hydrogenScu), quantumScu: n(equipmentValues.fuel.quantumScu) },
        damageReduction: { physical: n(armor?.damageMultiplier?.DamagePhysical), energy: n(armor?.damageMultiplier?.DamageEnergy), distortion: n(armor?.damageMultiplier?.DamageDistortion), fuse: n(vehicle.fusePenetrationDamageMultiplier), component: n(vehicle.componentPenetrationDamageMultiplier) },
        catalogStatus: status?.status === 'flight-ready' ? 'flight-ready' : status ? 'concept' : 'unconfirmed', implemented: status?.status === 'flight-ready', releaseSource: status ? release.source : null,
        descriptions: { en: description }, market: { purchase: shop?.purchase || [], rentals: shop?.rentals || [] } };
    ships.push(ship);
    names.push({ id, name, rsiUrl: prior?.rsiUrl || prior?.sourceUrl || status?.url || null });
    const koDescription = descriptionBody(localize(vehicle.vehicleDescription, ko));
    localization.push({ id, status: koDescription && /[가-힣]/.test(koDescription) ? 'ok' : 'missing', ko: koDescription && /[가-힣]/.test(koDescription) ? koDescription : null, source: 'korean-patch', sourceEnHash: description ? hash(description).slice(0, 16) : null });
    operational.push({ id, syncedAt: `${release.checkedAt}T00:00:00.000Z`, sourceVersion, sourceGeneratedAt: null, gameClass: cls, implemented: ship.implemented, anomalies: [] });
    if (role && localize(vehicle.vehicleRole, ko)) roles[role] = localize(vehicle.vehicleRole, ko);
}
write('data/canonical/ships-canonical.json', { schema: 'shipdb-canonical/v1', note: 'Performance extracted from installed game files. Release status: RSI. Prices and rentals: UEX. Unknown fields remain null.', ...source, count: ships.length, ships });
p4k?.close();
write('data/canonical/presentation-ships.json', { ...presentation, count: names.length, records: names });
write('data/canonical/localization-ships.json', { schema: 'shipdb-localization/v1', count: localization.length, records: localization });
write('data/canonical/operational-ships.json', { schema: 'shipdb-operational/v1', count: operational.length, records: operational });
const oldRoles = read('data/canonical/localization-roles.json'); write('data/canonical/localization-roles.json', { ...oldRoles, note: 'Game-file role strings use the Korean game patch. Official-only catalog labels retain the existing display translations.', roles: { ...oldRoles.roles, ...roles } });
const promoted = new Set(ships.map((s) => s.id));
official.records = official.records.filter((r) => !promoted.has(r.id)); official.count = official.records.length;
official.byStatus = Object.fromEntries(['concept', 'flight-ready'].map((status) => [status, official.records.filter((r) => r.catalogStatus === status).length]));
write('data/canonical/ships-rsi-official.json', official);
const rsiLoc = read('data/canonical/localization-rsi-official.json');
rsiLoc.records = rsiLoc.records.filter((r) => official.records.some((s) => s.id === r.id));
rsiLoc.count = rsiLoc.records.length;
rsiLoc.summary = { ok: rsiLoc.records.filter((r) => r.status === 'ok').length, missing: rsiLoc.records.filter((r) => r.status === 'missing').length, noEn: rsiLoc.records.filter((r) => r.status === 'no-en').length };
write('data/canonical/localization-rsi-official.json', rsiLoc);
// Transitional runtime entry points used by ShipDB details and market filters.
const live = Object.fromEntries(ships.map(({ market: _market, descriptions, ...s }) => [s.id, { ...s, syncedAt: `${source.checkedAt}T00:00:00.000Z`, descriptions: { ...descriptions, ko: localization.find((r) => r.id === s.id)?.ko } }]));
const market = Object.fromEntries(ships.map((s) => [s.id, { ...s.market, source: 'uex', syncedAt: markets.checkedAt }]));
fs.writeFileSync('data/ship-live-stats.js', `// Generated from Star Citizen game files. See scripts/shipdb-rewrite/build-game-ships.mjs.\nwindow.VOLT_SHIP_LIVE_STATS = ${JSON.stringify(live, null, 2)};\n`);
fs.writeFileSync('data/ship-market.js', `// UEX prices and shops only.\nwindow.VOLT_SHIP_MARKET = ${JSON.stringify(market, null, 2)};\n`);
console.log(`${ships.length} game-file ships; cargo unresolved: ${ships.filter((s) => s.cargoScu === null).map((s) => s.id).join(', ')}`);
