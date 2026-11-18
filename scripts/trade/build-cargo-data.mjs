#!/usr/bin/env node
/**
 * Trade-route helper data, extracted from the installed game files.
 *
 * Inputs (read only):
 *   --cache-dir <dir>   Game2.dcb, global.ini (English), build.json. Loadout XML and location
 *                       container XML pulled from Data.p4k are cached here (loadouts/, trade/).
 *   --ko-ini <file>     Korean patch global.ini (optional; without it Korean names are left out)
 *   --p4k <file>        Data.p4k (only opened when the cache is missing something)
 *   --uex-dir <dir>     saved UEX API responses (terminals.json, orbits_distances_*.json for every
 *                       star system, terminals_distances_*.json). Only needed to REFRESH the UEX
 *                       side of `joins`: the few fields this script reads are reduced to
 *                       scripts/trade/uex-join-snapshot.json, which is kept in the repository.
 *                       Without --uex-dir that snapshot is the input, so the output never depends
 *                       on a previous world.json. This script never calls UEX.
 *   --check             write nothing; exit 1 when the files on disk differ (builtAt ignored)
 *
 * Outputs: data/trade/cargo.json, data/trade/world.json (and the UEX snapshot when --uex-dir is given)
 * Usage:   node scripts/trade/build-cargo-data.mjs --cache-dir <dir> [--ko-ini <file>] [--uex-dir <dir>] [--check]
 *
 * Rules: numbers are game-file values. A value our parsing could not resolve is left out or listed
 * under `unknown`, never written as 0. Prices, stock and shop availability are not in the game
 * files and are not produced here (UEX owns those).
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import zlib from 'node:zlib';
import { DataForge } from '../gamedata/dataforge.mjs';
import { P4k, parseCryXml } from '../gamedata/p4k.mjs';
import { quantumTravel, TRAVEL_MODEL_STATUS } from './travel-model.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const arg = (name) => { const index = process.argv.indexOf(name); return index > -1 ? process.argv[index + 1] : null; };
const CHECK = process.argv.includes('--check');
const CACHE = arg('--cache-dir');
if (!CACHE || !existsSync(resolve(CACHE, 'Game2.dcb'))) { console.error('--cache-dir <folder with Game2.dcb> is required.'); process.exit(2); }
const P4K_PATH = arg('--p4k') || 'C:/Program Files/Roberts Space Industries/StarCitizen/LIVE/Data.p4k';
const UEX_DIR = arg('--uex-dir');

const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
const dcb = readFileSync(resolve(CACHE, 'Game2.dcb'));
const df = new DataForge(dcb);
if (!df.consistent) throw new Error('DataForge layout mismatch');
const build = readJson(resolve(CACHE, 'build.json'));

function loadIni(path) {
    const map = new Map();
    for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
        const at = line.indexOf('='); if (at < 1) continue;
        map.set(line.slice(0, at).replace(/^\uFEFF/, '').replace(/,P$/i, '').trim().toLowerCase(), line.slice(at + 1).trim());
    }
    return map;
}
const en = loadIni(resolve(CACHE, 'global.ini'));
const koPath = arg('--ko-ini');
const ko = koPath && existsSync(koPath) ? loadIni(koPath) : null;
const lookup = (map, key) => { if (!map || !key || !String(key).startsWith('@')) return undefined; const value = map.get(String(key).slice(1).toLowerCase()); return value && !/LOC_|PLACEHOLDER|UNINITIALIZED/.test(value) ? value.replace(/<[^>]+>/g, '').replace(/\\n/g, ' ').trim() : undefined; };
/** {en, ko} from a localisation key; ko only when the Korean patch has a different text. */
const names = (key) => { const english = lookup(en, key); const korean = lookup(ko, key); return english ? (korean && korean !== english ? { en: english, ko: korean } : { en: english }) : undefined; };

const short = (ref) => (ref?.name ? String(ref.name).split('.').slice(1).join('.') : undefined);
const idOf = (record) => record.name.split('.').slice(1).join('.');
const round = (value, digits = 3) => (Number.isFinite(value) ? Number(value.toFixed(digits)) : undefined);
const prune = (object) => Object.fromEntries(Object.entries(object).filter(([, v]) => v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && !v.length)));
const component = (entity, type) => (entity?.Components || []).find((c) => c && c.__type === type);
const vec = (v) => (v && [v.x, v.y, v.z].every(Number.isFinite) ? [v.x, v.y, v.z] : undefined);

// Metres per cargo cell edge. The files do not state it in one field (InventoryOpenContainerType.gridCellSize is
// {InventoryContainerGridCellSizeCentimeters, centimeters: 1} on every grid, i.e. not this value). 1.25 is supported by two
// checks that run on every build: the 1 SCU crate footprint (AttachDef.inventoryOccupancyDimensions) is 1.25 m cubed and every
// box footprint is a whole number of such cells whose product is its SCU (section 1); every ship grid's
// InventoryContainer.interiorDimensions is a whole multiple of 1.25 m on all three axes (section 3).
const CELL = 1.25;
// The seven grid box sizes and their field names in SResourceTypeDefaultCargoContainers / SAutoLoadingBoxSizeLoadingTime.
const BOX_FIELDS = [[1, 'oneSCU'], [2, 'twoSCU'], [4, 'fourSCU'], [8, 'eightSCU'], [16, 'sixteenSCU'], [24, 'twentyFourSCU'], [32, 'thirtyTwoSCU']];
const SMALL_BOX_FIELDS = [[0.125, 'one_eighthSCU'], [0.25, 'one_quarterSCU'], [0.5, 'one_halfSCU']];

const entityRecords = new Map(df.recordsOfType('EntityClassDefinition').map((r) => [idOf(r).toLowerCase(), r]));
const entityCache = new Map();
const entity = (record) => { if (!record) return null; if (!entityCache.has(record.id)) entityCache.set(record.id, df.readRecord(record, 12)); return entityCache.get(record.id); };
const follow = (ref, depth = 12) => { const record = df.recordById.get(ref?.__record); return record ? df.readRecord(record, depth) : null; };

// ---- Data.p4k access (lazy; everything taken from it is cached under --cache-dir) -------------
let p4k;
function openP4k() {
    if (!p4k) {
        if (!existsSync(P4K_PATH)) throw new Error(`Data.p4k not found at ${P4K_PATH} and the cache is incomplete (use --p4k)`);
        const manifest = resolve(dirname(P4K_PATH), 'build_manifest.id');
        if (existsSync(manifest) && readJson(manifest).Data?.Version !== build.Version) throw new Error('P4K and cached game builds differ');
        p4k = new P4k(P4K_PATH);
    }
    return p4k;
}
let loadoutIndex;
/** Default-loadout entries; some ships keep them in an XML file inside Data.p4k (Scripts\Loadouts). */
function loadoutEntries(loadout) {
    if (!loadout) return [];
    if (loadout.entries) return loadout.entries;
    if (!loadout.loadoutPath) return [];
    const file = `data/${loadout.loadoutPath.replaceAll('\\', '/')}`.toLowerCase();
    const cached = resolve(CACHE, 'loadouts', `${sha(file)}.xml`); // same cache layout as scripts/shipdb-rewrite/build-game-ships.mjs
    if (!existsSync(cached)) {
        if (!loadoutIndex) loadoutIndex = new Map(openP4k().find((name) => /Scripts\\Loadouts\\.*\.xml$/i.test(name)).map((entry) => [entry.name.replaceAll('\\', '/').toLowerCase(), entry]));
        const entry = loadoutIndex.get(file); if (!entry) throw new Error(`Missing loadout XML ${file}`);
        mkdirSync(dirname(cached), { recursive: true }); writeFileSync(cached, openP4k().extract(entry));
    }
    const items = (node) => node.children.flatMap((child) => (child.tag === 'Item' ? [{ itemPortName: child.attrs.portName, entityClassName: child.attrs.itemName, loadout: { entries: items(child) } }] : items(child)));
    return items(parseCryXml(readFileSync(cached)));
}

// ============================================================================================
// 1. Boxes and loading times
// ============================================================================================
const resourceRecords = df.recordsOfType('ResourceType');
const resources = new Map(resourceRecords.map((record) => [idOf(record), df.readRecord(record, 3)]));
const danglingBoxes = [];
// Box footprint: EntityClassDefinition (crate) -> SAttachableComponentParams.AttachDef.inventoryOccupancyDimensions (metres).
// Read from every commodity's crate of that size; the footprint all (or nearly all) crates agree on is used.
const footprintVotes = new Map();
const commodityBoxes = new Map();
for (const [id, resource] of resources) {
    const sizes = [];
    for (const [scu, field] of [...SMALL_BOX_FIELDS, ...BOX_FIELDS]) {
        const ref = resource.defaultCargoContainers?.[field]; // ResourceType.defaultCargoContainers.<size>
        if (!ref) continue;
        const record = df.recordById.get(ref.__record);
        if (!record) { danglingBoxes.push(`${id}.${field}`); continue; } // reference to a record that is not in the file: unknown, not "no box"
        sizes.push(scu);
        const dims = vec(component(entity(record), 'SAttachableComponentParams')?.AttachDef?.inventoryOccupancyDimensions);
        if (!dims) continue;
        const key = dims.map((d) => round(d, 4)).join('x');
        if (!footprintVotes.has(scu)) footprintVotes.set(scu, new Map());
        footprintVotes.get(scu).set(key, (footprintVotes.get(scu).get(key) || 0) + 1);
    }
    commodityBoxes.set(id, sizes);
}
const loadingParams = df.readRecord(df.recordsOfType('GlobalCargoLoadingParams')[0], 3);
const shopParams = df.readRecord(df.recordsOfType('GlobalShopCommodityParams')[0], 3);
const boxes = BOX_FIELDS.map(([scu, field]) => {
    const votes = [...(footprintVotes.get(scu) || new Map())].sort((x, y) => y[1] - x[1]);
    if (!votes.length) throw new Error(`No crate footprint for ${scu} SCU`);
    const metres = votes[0][0].split('x').map(Number);
    const cells = metres.map((m) => m / CELL);
    if (!cells.every((c) => Number.isInteger(c)) || cells[0] * cells[1] * cells[2] !== scu) throw new Error(`Footprint ${votes[0][0]} does not make ${scu} SCU`);
    return {
        scu,
        cells, // AttachDef.inventoryOccupancyDimensions / 1.25 m, as [x, y, z]
        load: loadingParams.autoLoadingBoxSizeLoadingTime[field], // GlobalCargoLoadingParams.autoLoadingBoxSizeLoadingTime.<size> (s)
        unload: loadingParams.autoLoadingBoxSizeUnloadingTime[field], // GlobalCargoLoadingParams.autoLoadingBoxSizeUnloadingTime.<size> (s)
        fee: shopParams.autoLoadingBoxSizePrices[field], // GlobalShopCommodityParams.autoLoadingBoxSizePrices.<size> (aUEC per box)
        crates: votes[0][1], // how many crate records have exactly this footprint
        cratesOther: votes.slice(1).reduce((sum, vote) => sum + vote[1], 0) || undefined, // crate records that declare another footprint (data oddities)
    };
});
const loading = {
    baseLoad: loadingParams.autoLoadingBaseLoadingTime, // GlobalCargoLoadingParams.autoLoadingBaseLoadingTime (s)
    baseUnload: loadingParams.autoLoadingBaseUnloadingTime, // GlobalCargoLoadingParams.autoLoadingBaseUnloadingTime (s)
    deckPerScu: round(loadingParams.cargoDeckLoadingTimePerSCU, 4), // GlobalCargoLoadingParams.cargoDeckLoadingTimePerSCU (s per SCU, cargo-deck loaded ships)
    baseFee: shopParams.autoLoadingBasePrice, // GlobalShopCommodityParams.autoLoadingBasePrice (aUEC)
    manual: null, // hand / tractor-beam loading time is not in the game files
};

// ============================================================================================
// 2. Quantum drives
// ============================================================================================
const drives = {};
// Drive records live under entities/scitem/ships/quantumdrive and are named QDRV_*; every ship's default
// drive must resolve to one of them (checked through `checks.notes`).
for (const record of df.recordsOfType('EntityClassDefinition')) {
    if (!/\/quantumdrive\//i.test(record.file) && !/^QDRV_/i.test(idOf(record))) continue;
    const data = df.readRecord(record, 6);
    const quantum = component(data, 'SCItemQuantumDriveParams');
    if (!quantum) continue;
    const attach = component(data, 'SAttachableComponentParams')?.AttachDef;
    const params = quantum.params || {};
    if (!(params.driveSpeed > 0)) continue; // a drive with no speed would be a parsing gap, never a usable value
    drives[idOf(record)] = prune({
        name: names(attach?.Localization?.Name), // SAttachableComponentParams.AttachDef.Localization.Name
        size: attach?.Size, // AttachDef.Size
        grade: attach?.Grade, // AttachDef.Grade
        speed: params.driveSpeed, // SQuantumDriveParams.driveSpeed (m/s)
        a1: params.stageOneAccelRate, // SQuantumDriveParams.stageOneAccelRate (m/s^2)
        a2: params.stageTwoAccelRate, // SQuantumDriveParams.stageTwoAccelRate (m/s^2)
        spool: round(params.spoolUpTime, 2), // SQuantumDriveParams.spoolUpTime (s)
        cool: round(params.cooldownTime, 2), // SQuantumDriveParams.cooldownTime (s)
        fuel: round(quantum.quantumFuelRequirement, 6), // SCItemQuantumDriveParams.quantumFuelRequirement (unit not stated in the files)
    });
}

// ============================================================================================
// 3. Ships: cargo grids, default quantum drive, quantum tank
// ============================================================================================
const identities = readJson(resolve(ROOT, 'data/canonical/ship-identities.json')).records;
const canonical = new Map(readJson(resolve(ROOT, 'data/canonical/ships-canonical.json')).ships.map((ship) => [ship.id, ship]));
// Unresolved default-loadout ports that were inspected and are not cargo (same list as build-game-ships.mjs).
const NON_CARGO_MISSING = new Set(['hardpoint_personal_storage', 'hardpoint_personal_storage_left', 'hardpoint_personal_storage_right', 'hardpoint_fuel_port', 'hardpoint_int_door', 'hardpoint_int', 'hardpoint_seat_access_leg_right', 'hardpoint_dummy_power_state', '$slot_fuse_01', '$slot_fuse_02', '$slot_fuse_03']);
const boxDims = boxes.map((box) => ({ scu: box.scu, sorted: [...box.cells].sort((x, y) => x - y) }));
/** Largest / smallest standard box that passes a size limit given in cells. ASSUMPTION: any rotation of the box is allowed. */
const largestBox = (limit, grid) => { const a = [...limit].sort((x, y) => x - y); const g = [...grid].sort((x, y) => x - y); return boxDims.filter((box) => box.sorted.every((d, i) => d <= a[i] && d <= g[i])).at(-1)?.scu; };
const smallestBox = (limit) => { const a = [...limit].sort((x, y) => x - y); return boxDims.find((box) => box.sorted.every((d, i) => d >= a[i]))?.scu; };

function readShip(root) {
    const result = { grids: [], cargoComplete: true, unresolved: [], drives: [], tanks: [], subVehicles: [] };
    const unresolved = (why) => { result.cargoComplete = false; if (!result.unresolved.includes(why)) result.unresolved.push(why); };
    const walk = (entries, ancestry, depth, inSubVehicle) => {
        for (const slot of entries || []) {
            const record = slot.entityClassReference?.__record ? df.recordById.get(slot.entityClassReference.__record) : entityRecords.get(String(slot.entityClassName || '').toLowerCase());
            if (!record) { if ((slot.entityClassReference || slot.entityClassName) && !NON_CARGO_MISSING.has(slot.itemPortName)) unresolved(`item on port ${slot.itemPortName} is not in the file`); continue; }
            if (ancestry.has(record.id)) continue; // a self-reference is not another installed item
            const data = entity(record); const attach = component(data, 'SAttachableComponentParams')?.AttachDef;
            const own = component(data, 'SEntityComponentDefaultLoadoutParams')?.loadout;
            const nested = slot.loadout?.entries?.length ? slot.loadout.entries : loadoutEntries(own);
            // An item that is itself a vehicle (carried snub / detachable module) owns its own drive and tank.
            const sub = inSubVehicle || (component(data, 'VehicleComponentParams') ? idOf(record) : null);
            if (sub && !inSubVehicle) result.subVehicles.push(sub);
            const holder = component(data, 'SCItemInventoryContainerComponentParams');
            const container = follow(holder?.containerParams); // SCItemInventoryContainerComponentParams.containerParams -> InventoryContainer
            // The item names a container record that is missing from the file. Whatever its AttachDef.Type says (the Ursa's
            // RSI_Ursa_CargoGrid_Rear is typed "Cargo", the F7C / Javelin grids "CargoGrid"), we cannot tell whether it is a
            // cargo grid or how big it is, so the ship's total is unknown - not 0.
            if (holder?.containerParams?.__record && !container) unresolved(`container record of ${idOf(record)} is not in the file`);
            else if (attach?.Type === 'CargoGrid') {
                const dims = vec(container?.interiorDimensions); // InventoryContainer.interiorDimensions (m)
                const type = container?.inventoryType; // InventoryContainer.inventoryType (InventoryOpenContainerType)
                if (!container && !holder && nested?.length) { /* carrier plate: capacity belongs to its child grids */ }
                else if (type?.__type !== 'InventoryOpenContainerType' || !dims || !dims.every((d) => d > 0)) unresolved(`grid ${idOf(record)} has no open container with dimensions`);
                else {
                    const cells = dims.map((d) => d / CELL);
                    if (cells.some((c) => Math.abs(c - Math.round(c)) > 1e-6)) throw new Error(`Grid ${record.name} is not a whole number of cells: ${dims}`);
                    const toCells = (v) => { const m = vec(v); return m ? m.map((d) => round(d / CELL, 3)) : undefined; };
                    result.grids.push({ port: slot.itemPortName, cls: idOf(record), cells: cells.map(Math.round), min: toCells(type.minPermittedItemSize), max: toCells(type.maxPermittedItemSize), external: type.isExternalContainer === true, sub });
                }
            }
            if (attach?.Type === 'QuantumDrive') result.drives.push({ id: idOf(record), depth, sub });
            if (component(data, 'SCItemFuelTankParams')) {
                const tank = component(data, 'ResourceContainer'); const capacity = tank?.capacity?.standardCargoUnits; // ResourceContainer.capacity.standardCargoUnits
                if (Number.isFinite(capacity) && /QuantumFuel/i.test((tank.inclusiveResources || []).map((r) => r.name).join(' '))) result.tanks.push({ scu: capacity, sub });
            }
            if (nested?.length) walk(nested, new Set([...ancestry, record.id]), depth + 1, sub);
        }
    };
    walk(loadoutEntries(component(root, 'SEntityComponentDefaultLoadoutParams')?.loadout), new Set(), 0, null);
    return result;
}

const ships = []; const cargoMismatches = []; const cargoUnknownButCanonicalNumber = []; const cargoUnresolvedWhy = {}; const tankMismatches = []; const shipNotes = [];
for (const { id, cls } of identities) {
    const record = entityRecords.get(cls.toLowerCase());
    if (!record) throw new Error(`Missing game record ${cls}`);
    const root = entity(record);
    const vehicle = component(root, 'VehicleComponentParams');
    const read = readShip(root);
    // Group identical grids (same cells and limits) and count them.
    const grouped = new Map();
    for (const grid of read.grids) {
        const key = JSON.stringify([grid.cells, grid.min, grid.max, grid.external]);
        if (!grouped.has(key)) grouped.set(key, { ...grid, n: 0 });
        grouped.get(key).n += 1;
    }
    const grids = [...grouped.values()].map((grid) => {
        const minIsZero = grid.min && grid.min.every((d) => d === 0);
        return prune({
            c: grid.cells, // InventoryContainer.interiorDimensions / 1.25 m, [x, y, z] cells
            max: grid.max, // InventoryOpenContainerType.maxPermittedItemSize / 1.25 m, [x, y, z] cells
            min: grid.min && !minIsZero && grid.min.some((d) => d !== 1) ? grid.min : undefined, // InventoryOpenContainerType.minPermittedItemSize / 1.25 m; left out when 1x1x1 (or 0,0,0 = no lower limit)
            box: grid.max ? largestBox(grid.max, grid.cells) : undefined, // derived: largest standard box within `max` and the grid (any rotation assumed)
            minBox: grid.min && !minIsZero && smallestBox(grid.min) > 1 ? smallestBox(grid.min) : undefined, // derived: smallest standard box that meets `min`; left out when 1
            n: grid.n > 1 ? grid.n : undefined, // number of identical grids on the ship
            ext: grid.external || undefined, // InventoryOpenContainerType.isExternalContainer
        });
    }).sort((x, y) => y.c[0] * y.c[1] * y.c[2] * (y.n || 1) - x.c[0] * x.c[1] * x.c[2] * (x.n || 1) || JSON.stringify(x).localeCompare(JSON.stringify(y)));
    const scu = read.cargoComplete ? read.grids.reduce((sum, grid) => sum + grid.cells[0] * grid.cells[1] * grid.cells[2], 0) : undefined;
    const canon = canonical.get(id);
    if (!canon) throw new Error(`Ship ${id} is not in ships-canonical.json`);
    if (scu === undefined) {
        cargoUnresolvedWhy[id] = read.unresolved;
        // ships-canonical.json (another builder) may still carry a number here; that number comes from the same kind of gap.
        if (Number.isFinite(canon.cargoScu)) cargoUnknownButCanonicalNumber.push({ id, canonical: canon.cargoScu });
    } else if (!Number.isFinite(canon.cargoScu) || Math.abs(scu - canon.cargoScu) > 1e-6) cargoMismatches.push({ id, grids: scu, canonical: canon.cargoScu ?? null });
    // Default quantum drive: the drive installed on the ship itself, not one inside a carried vehicle / module.
    const ownDrives = read.drives.filter((drive) => !drive.sub);
    const otherDrives = read.drives.filter((drive) => drive.sub);
    if (ownDrives.length > 1) shipNotes.push({ id, note: 'more than one quantum drive on the hull itself', drives: ownDrives.map((d) => d.id) });
    const drive = ownDrives.length === 1 && drives[ownDrives[0].id] ? ownDrives[0].id : undefined;
    if (ownDrives.length === 1 && !drive) shipNotes.push({ id, note: 'default drive record has no usable parameters', drives: [ownDrives[0].id] });
    if (otherDrives.length) shipNotes.push({ id, note: 'extra quantum drive belongs to a carried vehicle or module and is not used', drives: otherDrives.map((d) => `${d.sub}:${d.id}`) });
    const ownTank = read.tanks.filter((tank) => !tank.sub).reduce((sum, tank) => sum + tank.scu, 0);
    const allTank = read.tanks.reduce((sum, tank) => sum + tank.scu, 0);
    const canonTank = canon.fuel?.quantumScu;
    if (Number.isFinite(canonTank) && Math.abs(round(allTank, 3) - canonTank) > 0.0011 && Math.abs(round(ownTank, 3) - canonTank) > 0.0011) tankMismatches.push({ id, tanks: round(ownTank, 3), canonical: canonTank });
    const controller = component(root, 'CargoControllerParams');
    ships.push(prune({
        id,
        k: vehicle?.movementClass === 'ArcadeWheeled' ? 'g' : undefined, // VehicleComponentParams.movementClass: ArcadeWheeled = ground vehicle
        scu, // sum of grid cells in the DEFAULT loadout (0 = no grid there); left out when a grid / container could not be resolved
        g: grids,
        qd: drive, // key into `drives`: default-loadout item with AttachDef.Type QuantumDrive
        qt: read.tanks.some((tank) => !tank.sub) ? round(ownTank, 3) : undefined, // quantum fuel tank: sum of ResourceContainer.capacity.standardCargoUnits on QuantumFuel tanks (SCU)
        deck: controller?.cargoDeckLoaded === true ? 1 : undefined, // CargoControllerParams.cargoDeckLoaded
        dock: controller?.cargoRequiresDocking === true ? 1 : undefined, // CargoControllerParams.cargoRequiresDocking
    }));
}
ships.sort((x, y) => x.id.localeCompare(y.id, 'en', { numeric: true }));
const usedDrives = new Set(ships.map((ship) => ship.qd).filter(Boolean));

// ============================================================================================
// 4. Commodities, groups, jurisdictions
// ============================================================================================
const groupOf = new Map(); const groups = {};
for (const record of df.recordsOfType('ResourceTypeGroup')) {
    const data = df.readRecord(record, 2); const id = idOf(record);
    for (const ref of data.resources || []) if (short(ref)) groupOf.set(short(ref), id); // ResourceTypeGroup.resources
    groups[id] = { name: names(data.displayName), children: (data.groups || []).map(short).filter(Boolean) }; // ResourceTypeGroup.displayName / .groups
}
for (const [id, group] of Object.entries(groups)) for (const child of group.children) if (groups[child]) groups[child].parent = id;

const jurisdictions = {}; const rawJurisdictions = new Map();
for (const record of df.recordsOfType('Jurisdiction')) {
    const data = df.readRecord(record, 3); const id = idOf(record);
    rawJurisdictions.set(id, data);
    jurisdictions[id] = prune({ name: names(data.name), parent: short(data.parentJurisdiction), inherits: data.respectsParentJurisdictionLaws === true && short(data.parentJurisdiction) ? 1 : undefined }); // Jurisdiction.name / .parentJurisdiction / .respectsParentJurisdictionLaws
}
// illegal[commodity][jurisdiction] = 'p' (Jurisdiction.prohibitedResources) or 'c<slot>' (Jurisdiction.controlledSubstanceClasses[slot].resources).
// A jurisdiction that respects its parent's laws also gets the parent's entries (its own entry wins).
const ownLaws = (id) => {
    const data = rawJurisdictions.get(id); const out = new Map();
    for (const ref of data.prohibitedResources || []) if (short(ref)) out.set(short(ref), 'p');
    (data.controlledSubstanceClasses || []).forEach((klass, slot) => { for (const ref of klass?.resources || []) if (short(ref)) out.set(short(ref), `c${slot}`); });
    return out;
};
const lawsOf = (id, seen = new Set()) => {
    if (seen.has(id) || !rawJurisdictions.has(id)) return new Map();
    seen.add(id);
    const data = rawJurisdictions.get(id); const parent = short(data.parentJurisdiction);
    const inherited = data.respectsParentJurisdictionLaws === true && parent ? lawsOf(parent, seen) : new Map();
    return new Map([...inherited, ...ownLaws(id)]);
};
const illegal = new Map();
for (const id of Object.keys(jurisdictions).sort()) for (const [resource, kind] of lawsOf(id)) { if (!illegal.has(resource)) illegal.set(resource, {}); illegal.get(resource)[id] = kind; }
const controlledClasses = {};
for (const [id, data] of rawJurisdictions) { const list = (data.controlledSubstanceClasses || []).map((klass) => (klass ? round(klass.maxPossessionSCU, 4) : null)); if (list.length && data.controlledSubstanceClasses.some((klass) => klass?.resources?.length)) controlledClasses[id] = list; } // ControlledSubstanceClass.maxPossessionSCU per slot

const commodities = [...resources].map(([id, resource]) => {
    const name = names(resource.displayName); // ResourceType.displayName
    const sizes = commodityBoxes.get(id);
    if (!name || !sizes.length) return null; // placeholders (no display name) and resources without any crate are not cargo commodities
    return prune({
        id, name,
        group: groupOf.get(id), // ResourceTypeGroup.resources membership
        boxes: sizes, // ResourceType.defaultCargoContainers: SCU sizes this commodity has a crate for
        illegal: illegal.get(id), // per jurisdiction, see `illegalKinds`
        refined: short(resource.refinedVersion), // ResourceType.refinedVersion
    });
}).filter(Boolean).sort((x, y) => x.id.localeCompare(y.id, 'en'));
const usedGroups = new Set(commodities.map((item) => item.group).filter(Boolean));
for (const id of [...usedGroups]) for (let parent = groups[id]?.parent; parent; parent = groups[parent]?.parent) usedGroups.add(parent);
const groupsOut = Object.fromEntries(Object.entries(groups).filter(([id]) => usedGroups.has(id)).map(([id, group]) => [id, prune({ name: group.name, parent: group.parent })]));

// ============================================================================================
// 5. Star map: bodies and trading locations
// ============================================================================================
const typeById = new Map(df.recordsOfType('StarMapObjectType').map((record) => [record.id, df.readRecord(record, 1)]));
const amenityById = new Map(df.recordsOfType('StarMapAmenityTypeEntry').map((record) => [record.id, df.readRecord(record, 1)]));
// Short codes for StarMapAmenityTypeEntry.name
const AMENITY_CODES = {
    'Commodity Trading - Freight Elevator': 'fe', 'Commodity Trading - Loading Dock': 'ld', Refinery: 'ref', Docking: 'dock', Garage: 'gar',
    'Hangar S': 'hS', 'Hangar M': 'hM', 'Hangar L': 'hL', 'Hangar XL': 'hXL', 'Landing Pad S': 'pS', 'Landing Pad M': 'pM', 'Landing Pad L': 'pL', 'Landing Pad XL': 'pXL',
    'Vehicle Services': 'svc', 'Buy Vehicles': 'vbuy', 'Rent Vehicles': 'vrent', 'Buy and Rent Vehicles': 'vboth', Hospital: 'hosp', Clinic: 'clin', 'Food Court': 'food',
    'Buy Weapons': 'wpn', 'Buy Ship Items and Weapons': 'shipitm', 'Buy Armor': 'armor', 'Buy Clothing': 'cloth', 'Special Event': 'event',
};
const amenities = {};
for (const data of amenityById.values()) { const code = AMENITY_CODES[data.name]; if (!code) throw new Error(`Unknown amenity ${data.name}`); amenities[code] = prune({ name: names(data.displayName), game: data.name }); } // StarMapAmenityTypeEntry.name / .displayName
const SIZE_ORDER = ['S', 'M', 'L', 'XL'];
const largest = (codes, prefix) => SIZE_ORDER.filter((size) => codes.includes(prefix + size)).at(-1);

const starmap = new Map();
for (const record of df.recordsOfType('StarMapObject')) {
    const data = df.readRecord(record, 2); const type = typeById.get(data.type?.__record);
    starmap.set(record.id, {
        id: idOf(record), guid: record.id, name: names(data.name), // StarMapObject.name
        type: type?.name, surface: type?.onParentSurface === true, // StarMapObject.type -> StarMapObjectType.name / .onParentSurface
        parent: data.parent?.__record, // StarMapObject.parent
        size: data.size, // StarMapObject.size (body radius in m on planets and moons)
        jurisdiction: short(data.jurisdiction), // StarMapObject.jurisdiction
        amenities: [...new Set((data.amenities || []).map((ref) => AMENITY_CODES[amenityById.get(ref.__record)?.name]).filter(Boolean))], // StarMapObject.amenities (duplicates removed)
    });
}
const SYSTEMS = { StantonStar: 'Stanton', PyroStar: 'Pyro', NyxStar: 'Nyx' };
const chain = (object) => { const out = []; for (let cur = object, guard = 0; cur && guard < 30; cur = starmap.get(cur.parent), guard += 1) out.push(cur); return out; };
for (const object of starmap.values()) {
    const ancestors = chain(object);
    object.system = SYSTEMS[ancestors.at(-1).id];
    object.jurisdictionResolved = ancestors.find((item) => item.jurisdiction)?.jurisdiction; // nearest ancestor (or itself) with StarMapObject.jurisdiction
}

// ---- positions: system .socpak XML inside Data.p4k -------------------------------------------
// Data\ObjectContainers\PU\system\<sys>\<sys>system.socpak (a zip) -> <name>.xml -> <ChildObjectContainers><Child pos rot starMapRecord external name>.
// pos is metres relative to the parent container; world = parent rotation applied to pos + parent world position.
// ASSUMPTION: rot is a quaternion written w,x,y,z. It only matters for objects nested below a rotated parent.
function unzip(buffer) {
    const end = buffer.lastIndexOf(Buffer.from([0x50, 0x4b, 5, 6])); if (end < 0) throw new Error('socpak: no zip end record');
    const count = buffer.readUInt16LE(end + 10); let p = buffer.readUInt32LE(end + 16); const out = [];
    for (let i = 0; i < count && buffer.readUInt32LE(p) === 0x02014b50; i += 1) {
        const method = buffer.readUInt16LE(p + 10); const comp = buffer.readUInt32LE(p + 20); const nameLen = buffer.readUInt16LE(p + 28); const extraLen = buffer.readUInt16LE(p + 30); const commentLen = buffer.readUInt16LE(p + 32); const offset = buffer.readUInt32LE(p + 42);
        out.push({ name: buffer.toString('utf8', p + 46, p + 46 + nameLen), read() { const at = offset + 30 + buffer.readUInt16LE(offset + 26) + buffer.readUInt16LE(offset + 28); const data = buffer.subarray(at, at + comp); return method === 0 ? data : method === 8 ? zlib.inflateRawSync(data) : zlib.zstdDecompressSync(data); } });
        p += 46 + nameLen + extraLen + commentLen;
    }
    return out;
}
function parseTextXml(xml) {
    const tagPattern = /<(\/?)([A-Za-z_][\w]*)((?:\s+[\w:]+="[^"]*")*)\s*(\/?)>/g; const stack = [{ tag: 'root', attrs: {}, children: [] }];
    for (let m = tagPattern.exec(xml); m; m = tagPattern.exec(xml)) {
        if (m[1]) { stack.pop(); continue; }
        const attrs = {}; for (const a of m[3].matchAll(/([\w:]+)="([^"]*)"/g)) attrs[a[1]] = a[2];
        const node = { tag: m[2], attrs, children: [] }; stack.at(-1).children.push(node); if (!m[4]) stack.push(node);
    }
    return stack[0].children[0];
}
const qmul = (a, b) => [a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3], a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2], a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1], a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0]];
const qrot = (q, v) => { const r = qmul(qmul(q, [0, ...v]), [q[0], -q[1], -q[2], -q[3]]); return [r[1], r[2], r[3]]; };
const MAX_CONTAINER_DEPTH = 3;
function walkPositions() {
    const archive = openP4k();
    const index = new Map(archive.find((name) => name.toLowerCase().endsWith('.socpak')).map((entry) => [entry.name.toLowerCase().replaceAll('\\', '/'), entry]));
    const mainXml = (path) => {
        let key = path.toLowerCase().replaceAll('\\', '/'); if (!key.startsWith('data/')) key = `data/${key}`;
        const entry = index.get(key); if (!entry) return null;
        const base = key.split('/').pop().replace('.socpak', '.xml');
        const file = unzip(archive.extract(entry)).find((item) => item.name.toLowerCase() === base); if (!file) return null;
        const data = file.read();
        return data.toString('latin1', 0, 7) === 'CryXmlB' ? parseCryXml(data) : parseTextXml(data.toString('utf8'));
    };
    const rows = []; const opened = new Set(); let missing = 0;
    const walk = (node, position, rotation, depth) => {
        for (const group of node.children) {
            if (group.tag !== 'ChildObjectContainers') continue;
            for (const child of group.children) {
                const local = (child.attrs.pos || '0,0,0').split(',').map(Number); const localRot = (child.attrs.rot || '1,0,0,0').split(',').map(Number);
                const world = qrot(rotation, local).map((value, i) => value + position[i]); const worldRot = qmul(rotation, localRot);
                if (starmap.has(child.attrs.starMapRecord)) rows.push({ guid: child.attrs.starMapRecord, p: world.map((value) => Math.round(value)) });
                walk(child, world, worldRot, depth);
                if (child.attrs.external === '1' && child.attrs.name && depth < MAX_CONTAINER_DEPTH && /objectcontainers\/pu\/(system|loc)\//i.test(child.attrs.name)) {
                    const key = `${child.attrs.name.toLowerCase()}|${child.attrs.guid}`;
                    if (!opened.has(key)) { opened.add(key); const tree = mainXml(child.attrs.name); if (!tree) missing += 1; else walk(tree, world, worldRot, depth + 1); }
                }
            }
        }
    };
    for (const system of ['stanton', 'pyro', 'nyx']) { const tree = mainXml(`data/objectcontainers/pu/system/${system}/${system}system.socpak`); if (!tree) throw new Error(`Missing ${system} system container`); walk(tree, [0, 0, 0], [1, 0, 0, 0], 0); }
    return { gameVersion: build.Version, containersOpened: opened.size, containersMissing: missing, rows };
}
const positionCache = resolve(CACHE, 'trade', `positions-${build.Version}.json`);
let positionData = existsSync(positionCache) ? readJson(positionCache) : null;
if (!positionData || positionData.gameVersion !== build.Version) {
    positionData = walkPositions();
    mkdirSync(dirname(positionCache), { recursive: true }); writeFileSync(positionCache, JSON.stringify(positionData));
}
const positions = new Map(); // StarMapObject GUID -> metres in the system frame (star at the origin); first occurrence wins
for (const row of positionData.rows) if (!positions.has(row.guid)) positions.set(row.guid, row.p);
const km = (metres) => metres.map((value) => Math.round(value / 1000));

// ---- bodies: stars, planets, moons, lagrange points, jump points ------------------------------
const bodyKind = (object) => (object.type === 'Star' ? 'star' : object.type === 'Planet' ? 'planet' : object.type === 'Moon' ? 'moon' : object.type === 'JumpPoint' ? 'jump' : /^(Stanton|Pyro|Nyx)\d+_L\d$/.test(object.id) ? 'lagrange' : null);
const bodyCandidates = [...starmap.values()].filter((object) => object.system && bodyKind(object));
// A star / planet / moon / lagrange record that is not placed in the system container files is not a place in this build.
const bodyObjects = bodyCandidates.filter((object) => positions.has(object.guid));
const bodiesWithoutPosition = bodyCandidates.filter((object) => !positions.has(object.guid)).map((object) => object.id).sort();
const bodyIds = new Set(bodyObjects.map((object) => object.guid));
const nearestBody = (object) => chain(object).slice(1).find((item) => bodyIds.has(item.guid));
const SYSTEM_ORDER = ['Stanton', 'Pyro', 'Nyx'];
const KIND_ORDER = ['star', 'planet', 'moon', 'lagrange', 'jump'];
const bodies = bodyObjects.map((object) => prune({
    id: object.id,
    name: object.name,
    kind: bodyKind(object),
    system: object.system,
    parent: nearestBody(object)?.id,
    r: ['planet', 'moon'].includes(bodyKind(object)) && object.size > 1 ? round(object.size / 1000, 1) : undefined, // StarMapObject.size (m) -> radius in km
    p: positions.has(object.guid) ? km(positions.get(object.guid)) : undefined, // [x, y, z] km, star at the origin
})).sort((x, y) => SYSTEM_ORDER.indexOf(x.system) - SYSTEM_ORDER.indexOf(y.system) || KIND_ORDER.indexOf(x.kind) - KIND_ORDER.indexOf(y.kind) || x.id.localeCompare(y.id, 'en', { numeric: true }));

// ---- UEX join inputs (measurement only) --------------------------------------------------------
const norm = (text) => String(text || '').toLowerCase().replace(/&/g, 'and').replace(/\(.*?\)/g, '').replace(/[^a-z0-9]/g, '');
const uexFiles = (pattern) => (UEX_DIR && existsSync(UEX_DIR) ? readdirSync(UEX_DIR).filter((file) => pattern.test(file)).sort() : []);
const uexFile = (pattern) => { const name = uexFiles(pattern)[0]; return name ? readJson(resolve(UEX_DIR, name)).data : null; };
// Only the fields read below are kept, in scripts/trade/uex-join-snapshot.json, so that a build needs nothing but the
// game files and the repository. --uex-dir refreshes the snapshot from saved raw responses.
const SNAPSHOT_PATH = 'scripts/trade/uex-join-snapshot.json';
const TERMINAL_FIELDS = ['id', 'code', 'name', 'nickname', 'type', 'star_system_name', 'planet_name', 'moon_name', 'space_station_name', 'outpost_name', 'city_name', 'is_available_live', 'has_freight_elevator', 'has_loading_dock', 'has_docking_port', 'max_container_size', 'date_modified'];
function reduceUex() {
    const terminals = uexFile(/^terminals\.json$/);
    const orbitFiles = uexFiles(/^orbits_distances.*\.json$/);
    if (!terminals || !orbitFiles.length) throw new Error(`--uex-dir ${UEX_DIR}: terminals.json and orbits_distances_*.json are required`);
    // Every saved orbits_distances response (one per star system); a row that appears in two files is used once.
    const rows = [...new Map(orbitFiles.flatMap((name) => readJson(resolve(UEX_DIR, name)).data || []).map((row) => [row.id, row])).values()].sort((x, y) => x.id - y.id);
    const orbitNames = {};
    for (const row of rows) { orbitNames[row.id_orbit_origin] = row.orbit_origin_name; orbitNames[row.id_orbit_destination] = row.orbit_destination_name; }
    const pairs = uexFiles(/^terminals_distances.*\.json$/).map((name) => readJson(resolve(UEX_DIR, name)).data).filter((data) => data && !Array.isArray(data));
    return {
        note: 'Reduced copy of saved UEX API 2.0 responses (terminals, orbits_distances, terminals_distances): only the fields scripts/trade/build-cargo-data.mjs reads. Input for world.json joins.*; refresh with --uex-dir. Not a price source.',
        terminals: terminals.filter((terminal) => terminal.type === 'commodity' || terminal.type === 'refinery').sort((x, y) => x.id - y.id).map((terminal) => Object.fromEntries(TERMINAL_FIELDS.map((field) => [field, terminal[field] ?? null]))),
        orbitNames, // UEX orbit id -> name
        orbitRows: rows.map((row) => [row.id, row.id_orbit_origin, row.id_orbit_destination, row.distance, row.game_version]), // [row id, origin orbit id, destination orbit id, distance (Gm, as sent), game_version]
        terminalPairs: pairs.map((data) => ({ from: data.terminal_code_origin, to: data.terminal_code_destination, distance: data.distance })),
    };
}
const snapshotFile = resolve(ROOT, SNAPSHOT_PATH);
const uex = UEX_DIR ? reduceUex() : existsSync(snapshotFile) ? readJson(snapshotFile) : null;
if (!uex) { console.error(`No UEX snapshot (${SNAPSHOT_PATH}) and no --uex-dir: the terminal join cannot be built.`); process.exit(2); }
const uexTerminals = uex.terminals;
const systemObjects = [...starmap.values()].filter((object) => object.system);
const byName = new Map();
for (const object of systemObjects) { if (!object.name) continue; const key = `${object.system}|${norm(object.name.en)}`; if (!byName.has(key)) byName.set(key, []); byName.get(key).push(object); }
const hasTrade = (object) => object.amenities.includes('fe') || object.amenities.includes('ld');

/** UEX commodity terminal -> StarMapObject, by system + normalised English name. */
function matchTerminal(terminal) {
    // Names tried in order: the UEX place name, the terminal name without its "Admin - " style prefix, the nickname.
    const tries = [terminal.space_station_name, terminal.outpost_name, terminal.city_name, String(terminal.name || '').replace(/^.* - /, ''), terminal.name, terminal.nickname].filter(Boolean);
    for (const text of tries) {
        let found = byName.get(`${terminal.star_system_name}|${norm(text)}`);
        if (!found) continue;
        if (found.length > 1) { const narrowed = found.filter(hasTrade); if (narrowed.length) found = narrowed; }
        if (found.length > 1) { const narrowed = found.filter((object) => positions.has(object.guid)); if (narrowed.length) found = narrowed; }
        if (found.length > 1) { const place = norm(terminal.moon_name || terminal.planet_name); const narrowed = found.filter((object) => norm(nearestBody(object)?.name?.en) === place); if (narrowed.length) found = narrowed; }
        if (found.length === 1) return { object: found[0], by: text };
        return { ambiguous: found.map((object) => object.id) };
    }
    return {};
}
const objectByRecordName = new Map(systemObjects.map((object) => [object.id, object]));
let terminalJoin = null; let refineryJoin = null; const joinedLocations = new Set();
{
    const commodityTerminals = uexTerminals.filter((terminal) => terminal.type === 'commodity');
    const map = {}; const unmatched = [];
    for (const terminal of commodityTerminals) {
        const match = matchTerminal(terminal);
        if (match.object) map[terminal.id] = match.object.id;
        else unmatched.push(prune({ id: terminal.id, code: terminal.code, name: terminal.name, system: terminal.star_system_name, live: terminal.is_available_live, why: match.ambiguous ? 'ambiguous' : 'no game location with this name', candidates: match.ambiguous }));
    }
    const live = commodityTerminals.filter((terminal) => terminal.is_available_live === 1);
    terminalJoin = {
        rule: 'UEX terminals of type "commodity" matched to StarMapObject by star system + English name (lower case, letters and digits only, "&" = "and", text in brackets dropped). Names tried: space_station_name, outpost_name, city_name, name after its last " - ", name, nickname. Several hits are narrowed by: has a trade amenity, has a position, parent body name equals the UEX moon/planet name.',
        uexNewestTerminalEdit: new Date(Math.max(...commodityTerminals.map((terminal) => terminal.date_modified || 0)) * 1000).toISOString().slice(0, 10), // newest UEX date_modified in the saved terminals response
        total: commodityTerminals.length, matched: Object.keys(map).length,
        liveTotal: live.length, liveMatched: live.filter((terminal) => map[terminal.id]).length,
        map, // UEX terminal id -> world.json locations[].id
        unmatched,
        // Do UEX facility flags agree with the game's amenity tags? Counted per live matched terminal.
        facilities: Object.fromEntries([['has_freight_elevator', 'fe'], ['has_loading_dock', 'ld'], ['has_docking_port', 'dock']].map(([flag, code]) => {
            const count = { both: 0, uexOnly: 0, gameOnly: 0, neither: 0 };
            for (const terminal of live) { if (!map[terminal.id]) continue; const game = objectByRecordName.get(map[terminal.id]).amenities.includes(code); const uex = terminal[flag] === 1; count[game && uex ? 'both' : uex ? 'uexOnly' : game ? 'gameOnly' : 'neither'] += 1; }
            return [`${flag}~${code}`, count];
        })),
        // UEX max_container_size = 0: how often, and is the terminal live? (the game files have no per-location box limit to compare with)
        maxContainerZero: { total: commodityTerminals.filter((terminal) => terminal.max_container_size === 0).length, live: live.filter((terminal) => terminal.max_container_size === 0).length },
    };
    // Refineries: game Refinery amenity against UEX terminals of type "refinery".
    const refineryTerminals = uexTerminals.filter((terminal) => terminal.type === 'refinery');
    const refineryMap = {}; const refineryUnmatched = [];
    for (const terminal of refineryTerminals) { const match = matchTerminal(terminal); if (match.object) refineryMap[terminal.id] = match.object.id; else refineryUnmatched.push(terminal.name); }
    const gameRefineries = systemObjects.filter((object) => object.amenities.includes('ref')).map((object) => object.id).sort();
    const uexRefineryPlaces = new Set(Object.values(refineryMap));
    refineryJoin = {
        gameLocationsWithRefineryAmenity: gameRefineries.length, uexRefineryTerminals: refineryTerminals.length, matched: Object.keys(refineryMap).length,
        map: refineryMap, // UEX refinery terminal id -> locations[].id
        uexUnmatched: refineryUnmatched,
        uexMatchedWithoutGameAmenity: [...uexRefineryPlaces].filter((id) => !gameRefineries.includes(id)).sort(),
        gameOnly: gameRefineries.filter((id) => !uexRefineryPlaces.has(id)), // has the amenity in the game files, no UEX refinery terminal
    };
}
for (const id of Object.values(terminalJoin.map)) joinedLocations.add(id);

// ---- trading locations --------------------------------------------------------------------------
// Listed: every StarMapObject in Stanton / Pyro / Nyx with a commodity-trading amenity (freight elevator or
// loading dock) or a refinery, plus every object a UEX commodity terminal was matched to.
const locationCandidates = systemObjects.filter((object) => !bodyKind(object) && (hasTrade(object) || object.amenities.includes('ref') || joinedLocations.has(object.id)));
// A record with neither a display name nor a position cannot be shown or routed to (template / unreleased records).
const locationObjects = locationCandidates.filter((object) => object.name || positions.has(object.guid));
const skippedLocations = locationCandidates.filter((object) => !object.name && !positions.has(object.guid)).map((object) => object.id).sort();
const bodyByRecordId = new Map(bodyObjects.map((object) => [object.id, object]));
const lagrangeFromName = (id) => { const m = /^RR_P(\d)_L(\d)$/.exec(id); return m && bodyByRecordId.has(`Pyro${m[1]}_L${m[2]}`) ? `Pyro${m[1]}_L${m[2]}` : undefined; };
const locations = locationObjects.map((object) => {
    const body = nearestBody(object);
    const world = positions.get(object.guid); const bodyWorld = body && positions.get(body.guid);
    const pads = largest(object.amenities, 'p'); const hangars = largest(object.amenities, 'h');
    return prune({
        id: object.id, // StarMapObject record name (stable game id)
        name: object.name, // StarMapObject.name; missing when the game has no display name for the record
        system: object.system,
        body: body?.id, // nearest ancestor that is a star, planet, moon, lagrange point or jump point (key into `bodies`)
        type: object.type, // StarMapObjectType.name
        surface: object.surface ? 1 : undefined, // StarMapObjectType.onParentSurface
        am: object.amenities, // StarMapObject.amenities as codes, see `amenities`
        pad: pads, // largest "Landing Pad <size>" amenity
        hangar: hangars, // largest "Hangar <size>" amenity
        law: object.jurisdictionResolved, // StarMapObject.jurisdiction of the object or its nearest ancestor (key into `jurisdictions`)
        gate: /^RR_JP_/.test(object.id) ? /^(.+) Gateway$/.exec(object.name?.en || '')?.[1] : undefined, // INFERRED from names only: jump-point station (record RR_JP_*) -> the system its display name "<System> Gateway" points to
        p: world ? km(world) : undefined, // [x, y, z] km in the system frame; missing = not placed in the container files (use `at`, else the body's position)
        at: world ? undefined : lagrangeFromName(object.id), // INFERRED from the record name only (RR_P<planet>_L<n> -> Pyro<planet>_L<n>): lagrange point to stand in for a station without a position
        lp: world && bodyWorld && object.surface ? world.map((value, i) => round((value - bodyWorld[i]) / 1000, 1)) : undefined, // surface places: km from the body centre (same axes as p)
    });
}).sort((x, y) => SYSTEM_ORDER.indexOf(x.system) - SYSTEM_ORDER.indexOf(y.system) || x.id.localeCompare(y.id, 'en', { numeric: true }));

// ---- distance comparison against UEX (measurement only) -----------------------------------------
const bodyById = new Map(bodies.map((body) => [body.id, body]));
const locationById = new Map(locations.map((location) => [location.id, location]));
let distanceJoin = null;
const uexOrbits = uex.orbitRows.map(([id, from, to, distance, version]) => ({ id, id_orbit_origin: from, id_orbit_destination: to, distance, game_version: version, orbit_origin_name: uex.orbitNames[from], orbit_destination_name: uex.orbitNames[to] }));
const ROMAN = { I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7, VIII: 8, IX: 9 };
{
    // UEX orbit name -> our body / location id
    const planetByName = new Map(bodies.filter((body) => body.kind === 'planet' || body.kind === 'star').map((body) => [norm(body.name?.en), body]));
    const orbitTarget = (name) => {
        const lagrange = /^(.*) Lagrange Point (\d)$/.exec(name);
        if (lagrange) {
            const numbered = /^(Stanton|Pyro|Nyx) ([IVX]+)$/.exec(lagrange[1]); // UEX writes "Pyro VI"; the game record is Pyro6 (shown in game under its own name)
            const planet = planetByName.get(norm(lagrange[1])) || (numbered && bodyById.get(`${numbered[1]}${ROMAN[numbered[2]]}`)); const body = planet && bodyById.get(`${planet.id}_L${lagrange[2]}`);
            return body?.p ? { id: body.id, p: body.p, system: body.system } : null;
        }
        const gateway = /^(.*) Gateway \((\w+) system\)$/.exec(name);
        if (gateway) { const hit = locations.find((location) => location.system === gateway[2] && norm(location.name?.en) === norm(`${gateway[1]} Gateway`)); return hit?.p ? { id: hit.id, p: hit.p, system: hit.system } : null; }
        const plain = norm(name.replace(/\(Star\)/, ''));
        const found = [...bodies.filter((item) => ['star', 'planet', 'moon'].includes(item.kind)), ...locations].filter((item) => norm(item.name?.en) === plain && item.p);
        return found.length === 1 ? { id: found[0].id, p: found[0].p, system: found[0].system } : null; // none, or the same name in two places: not matched
    };
    const orbitNames = new Map();
    for (const row of uexOrbits) { orbitNames.set(row.id_orbit_origin, row.orbit_origin_name); orbitNames.set(row.id_orbit_destination, row.orbit_destination_name); }
    const orbitMap = {}; const orbitUnmatched = [];
    for (const [id, name] of [...orbitNames].sort((x, y) => x[0] - y[0])) { const target = orbitTarget(name); if (target) orbitMap[id] = target.id; else orbitUnmatched.push(name); }
    const targets = new Map([...orbitNames].map(([id, name]) => [id, orbitTarget(name)]));
    const pairs = []; const seen = new Set(); let crossSystem = 0;
    for (const row of uexOrbits) {
        const a = targets.get(row.id_orbit_origin); const b = targets.get(row.id_orbit_destination);
        if (!a || !b) continue;
        if (a.system !== b.system) { crossSystem += 1; continue; } // two systems have separate coordinate frames: no straight line to compare
        const key = [row.id_orbit_origin, row.id_orbit_destination].sort((x, y) => x - y).join('-');
        if (seen.has(key)) continue; seen.add(key);
        const game = Math.hypot(a.p[0] - b.p[0], a.p[1] - b.p[1], a.p[2] - b.p[2]) / 1e6; // km -> Gm
        pairs.push({ from: a.id, to: b.id, game: round(game, 2), uex: Number(row.distance), v: row.game_version, system: a.system });
    }
    const diffs = pairs.map((pair) => Math.abs(pair.game - pair.uex)).sort((x, y) => x - y);
    const rel = pairs.filter((pair) => pair.game > 1).map((pair) => Math.abs(pair.game - pair.uex) / pair.game).sort((x, y) => x - y);
    const quantile = (list, q) => (list.length ? round(list[Math.min(list.length - 1, Math.floor(list.length * q))], 3) : null);
    const perSystem = {};
    for (const system of SYSTEM_ORDER) { const list = pairs.filter((pair) => pair.system === system); if (!list.length) continue; const d = list.map((pair) => Math.abs(pair.game - pair.uex)).sort((x, y) => x - y); perSystem[system] = { pairs: list.length, within1Gm: d.filter((x) => x <= 1).length, medianAbsGm: quantile(d, 0.5), maxAbsGm: quantile(d, 1) }; }
    // A fixed, readable sample: the pairs between planets and the worst five.
    const planetPairs = pairs.filter((pair) => bodyById.get(pair.from)?.kind === 'planet' && bodyById.get(pair.to)?.kind === 'planet');
    const worst = [...pairs].sort((x, y) => Math.abs(y.game - y.uex) - Math.abs(x.game - x.uex) || x.from.localeCompare(y.from) || x.to.localeCompare(y.to)).slice(0, 5);
    const strip = (pair) => ({ from: pair.from, to: pair.to, gameGm: pair.game, uexGm: pair.uex, uexGameVersion: pair.v });
    // Terminal pair sample (UEX terminals_distances), compared through the terminal id map.
    const terminalSamples = [];
    {
        const byCode = new Map(uexTerminals.map((terminal) => [terminal.code, terminal]));
        for (const data of uex.terminalPairs) {
            const from = locationById.get(terminalJoin.map[byCode.get(data.from)?.id]); const to = locationById.get(terminalJoin.map[byCode.get(data.to)?.id]);
            const pa = from?.p || bodyById.get(from?.body)?.p; const pb = to?.p || bodyById.get(to?.body)?.p;
            if (pa && pb && from.system === to.system) terminalSamples.push({ from: from.id, to: to.id, gameGm: round(Math.hypot(pa[0] - pb[0], pa[1] - pb[1], pa[2] - pb[2]) / 1e6, 2), uexGm: Number(data.distance) });
        }
    }
    distanceJoin = {
        unit: 'Gm (1e9 m)',
        method: 'UEX orbits_distances rows (whole Gm, orbit to orbit) against straight-line distance between game-file positions of the matched bodies. Each unordered pair counted once; pairs in two different systems are not comparable (separate coordinate frames).',
        uexRows: uexOrbits.length, uexOrbits: orbitNames.size, orbitsMatched: Object.keys(orbitMap).length, orbitsUnmatched: orbitUnmatched,
        orbitMap, // UEX orbit id -> bodies[].id or locations[].id
        pairsCompared: pairs.length, crossSystemRowsSkipped: crossSystem,
        within1Gm: diffs.filter((d) => d <= 1).length, within5Percent: rel.filter((d) => d <= 0.05).length,
        medianAbsGm: quantile(diffs, 0.5), p90AbsGm: quantile(diffs, 0.9), maxAbsGm: quantile(diffs, 1),
        perSystem,
        uexGameVersions: Object.fromEntries(Object.entries(uexOrbits.reduce((count, row) => { count[row.game_version] = (count[row.game_version] || 0) + 1; return count; }, {})).sort()),
        samples: planetPairs.sort((x, y) => x.from.localeCompare(y.from) || x.to.localeCompare(y.to)).map(strip),
        worst: worst.map(strip),
        terminalSamples,
    };
}

// ============================================================================================
// 6. Output
// ============================================================================================
const header = {
    version: `${build.Branch || ''}.${build.RequestedP4ChangeNum || ''}`.replace(/^sc-alpha-/, ''), gameVersion: build.Version, builtAt: new Date().toISOString(),
    source: 'game-files', sourceHash: sha(dcb), koSource: ko ? 'korean-patch' : undefined,
};
const withPosition = locations.filter((location) => location.p).length;
const cargoOut = {
    ...header,
    note: 'Game-file values. Ship ids are data/canonical/ships-canonical.json ids. Grid sizes are in cargo cells (1 cell = 1.25 m = 1 SCU). `scu` and `g` describe the DEFAULT loadout only: scu 0 means no cargo grid there, not "cannot carry cargo" (optional modules, ore pods and salvage holds are not counted). A ship without `scu` has a grid or container we could not resolve (unknown, see checks.cargoUnresolvedWhy); a ship without `qd` has no quantum drive in its default loadout.',
    cell: CELL,
    ships,
    drives: Object.fromEntries(Object.entries(drives).filter(([id]) => usedDrives.has(id)).sort((x, y) => x[0].localeCompare(y[0]))),
    checks: {
        ships: ships.length, withGrids: ships.filter((ship) => ship.g).length, ground: ships.filter((ship) => ship.k === 'g').length, withDrive: ships.filter((ship) => ship.qd).length,
        cargoComparedWithCanonical: ships.length, cargoMismatches, // every ship with a resolved total: grid total vs ships-canonical.json cargoScu
        cargoUnresolved: ships.filter((ship) => ship.scu === undefined).map((ship) => ship.id), // a default-loadout entry, grid or container record could not be resolved: total unknown here
        cargoUnresolvedWhy, // ship id -> what could not be resolved
        cargoUnknownButCanonicalNumber, // unknown here while ships-canonical.json (built elsewhere) still has a number; that number is a parsing-gap value
        zeroScu: ships.filter((ship) => ship.scu === 0).length, // ships whose default loadout has no cargo grid
        tankMismatches, // quantum tank vs ships-canonical.json fuel.quantumScu
        notes: shipNotes,
    },
    unknown: [
        'Cargo from optional modules (e.g. Retaliator cargo modules), mining ore pods and salvage holds: not in the default loadout / not cargo grids, so not in `scu` or `g`.',
        'Where each grid sits in the hull and the size of doors / ramps (VehicleComponentParams.cargoEntrySize is 0,0 on all but one ship).',
        'Box rotation and stacking rules (CargoGridOccupantProperties not read): `box` / `minBox` assume any rotation is allowed (limits and box footprints are compared after sorting their three sizes); if the game keeps the axis order, some values are too large (e.g. polaris: max [2,2,8] on a grid 4 cells high gives box 32).',
        'Unit of drives[].fuel (SCItemQuantumDriveParams.quantumFuelRequirement) is not stated in the files; the travel estimate assumes SCU of quantum fuel per Gm.',
        'Whether a ship supports automatic loading is not a per-ship game value (only CargoControllerParams.cargoDeckLoaded exists).',
    ],
};
const worldOut = {
    ...header,
    positionsSource: 'Data.p4k ObjectContainers/PU/system/*.socpak', positionsHash: sha(JSON.stringify(positionData.rows)),
    note: 'Game-file values, except that the location list also includes places a UEX commodity terminal maps to (joins.terminals; they have no trade amenity in `am`). Positions are a static snapshot in km with the star at the origin (bodies orbit and rotate in game). No prices, stock or shop lists: those come from UEX.',
    boxes, loading,
    groups: groupsOut,
    jurisdictions,
    illegalKinds: { p: 'Jurisdiction.prohibitedResources', 'c<n>': 'Jurisdiction.controlledSubstanceClasses[n].resources; limit in controlledMaxScu[jurisdiction][n] (SCU). Which slot is the harsher class is not known.' },
    controlledMaxScu: controlledClasses,
    commodities,
    amenities,
    systems: SYSTEM_ORDER,
    bodies, locations,
    joins: {
        input: SNAPSHOT_PATH, inputHash: sha(JSON.stringify(uex)), // reduced UEX responses the three UEX joins below were computed from
        terminals: terminalJoin,
        refineries: refineryJoin,
        distance: distanceJoin ? {
            ...distanceJoin,
            use: 'game-positions',
            why: 'Game positions exist for all three systems at 1 km resolution and belong to the current build; UEX orbit distances are whole Gm, orbit-to-orbit only (every terminal on one orbit gets the same value) and stamped with older game versions. Use UEX distance only as a fallback for a place with no game position and no positioned body, and for crossing between systems (not a straight line).',
        } : null,
        travel: {
            module: 'scripts/trade/travel-model.mjs', function: 'quantumTravel(distanceM, drive)', status: TRAVEL_MODEL_STATUS,
            formula: 'flight = d/v + v/a when d > v*v/a, else 2*sqrt(d/a); computed with a = a1 and a = a2, reported as a range, seconds = middle; total = spool + flight; cooldown listed separately; fuel = fuel * d[Gm]',
            inputs: { v: 'drives[].speed (SQuantumDriveParams.driveSpeed)', a1: 'drives[].a1 (stageOneAccelRate)', a2: 'drives[].a2 (stageTwoAccelRate)', spool: 'drives[].spool (spoolUpTime)', cool: 'drives[].cool (cooldownTime)', fuel: 'drives[].fuel (quantumFuelRequirement)' },
            notValidated: ['no in-game jump was timed', 'when the game switches from stage one to stage two acceleration is not in the files', 'fuel unit (assumed SCU per Gm)', 'calibration time, route bending around bodies and jump tunnels are not modelled'],
            example: (() => { const ship = ships.find((item) => item.id === 'c2-hercules'); const a = bodyById.get('Stanton1'); const b = bodyById.get('Stanton2'); if (!ship?.qd || !a?.p || !b?.p) return undefined; const d = Math.hypot(a.p[0] - b.p[0], a.p[1] - b.p[1], a.p[2] - b.p[2]) * 1000; const t = quantumTravel(d, drives[ship.qd]); return { ship: ship.id, drive: ship.qd, from: 'Stanton1', to: 'Stanton2', distanceGm: round(d / 1e9, 2), minSeconds: round(t.minSeconds, 1), maxSeconds: round(t.maxSeconds, 1), seconds: round(t.seconds, 1), totalSeconds: round(t.totalSeconds, 1), fuelScu: round(t.fuelScu, 3) }; })(),
        },
    },
    checks: {
        commodities: commodities.length, locations: locations.length, locationsWithPosition: withPosition, bodies: bodies.length,
        locationsWithTradeAmenity: locations.filter((location) => location.am?.includes('fe') || location.am?.includes('ld')).length,
        locationsListedByUexTerminalOnly: locations.filter((location) => !(location.am?.includes('fe') || location.am?.includes('ld') || location.am?.includes('ref'))).length, // no trade / refinery amenity in the game files; listed because a UEX commodity terminal maps to it
        positionContainersOpened: positionData.containersOpened, positionContainersMissing: positionData.containersMissing,
    },
    unknown: prune({
        danglingBoxRefs: danglingBoxes, // ResourceType.defaultCargoContainers entries that point to records missing from the file
        locationsWithoutName: locations.filter((location) => !location.name).map((location) => location.id),
        locationsWithoutPosition: locations.filter((location) => !location.p).map((location) => location.id), // listed, but no station container was found in the system files
        locationsSkipped: skippedLocations, // trade amenity in the star map, but neither a display name nor a position: left out of `locations`
        bodiesWithoutPosition, // star map records of body type that are not placed in the system files: left out of `bodies`
        other: [
            'Number and exact size of pads / hangars per location (amenities only give the largest size class).',
            'Whether amenity tags match the live game at every location (not checked in game).',
            'Atmosphere height (no field found).',
            'Hand / tractor loading time per box (loading.manual).',
            'Units of boxes[].load / unload and loading.baseLoad / baseUnload (taken as seconds), loading.deckPerScu (seconds per SCU), boxes[].fee and loading.baseFee (taken as aUEC): the records hold bare numbers, the units are read from the field names only and were not confirmed in game.',
            'Jump points: the game database has only two StarMapObject records of type JumpPoint (Stanton-Terra, Stanton-Magnus), so bodies[kind=jump] is NOT a list of jump points (none for Stanton-Pyro, none at all in Pyro and Nyx). Use locations with `gate` (the gateway stations) instead. Jump tunnel length / time is not in these files.',
        ],
    }),
};

const strip = (data) => { const copy = { ...data }; delete copy.builtAt; return JSON.stringify(copy); };
const targets = [['data/trade/cargo.json', cargoOut], ['data/trade/world.json', worldOut]];
if (CHECK) {
    let different = false;
    if (UEX_DIR) { const same = existsSync(snapshotFile) && JSON.stringify(readJson(snapshotFile)) === JSON.stringify(uex); console.log(`${same ? 'same' : 'DIFFERENT'}: ${SNAPSHOT_PATH}`); if (!same) different = true; }
    for (const [path, data] of targets) {
        const file = resolve(ROOT, path);
        const same = existsSync(file) && strip(readJson(file)) === strip(data);
        console.log(`${same ? 'same' : 'DIFFERENT'}: ${path}`);
        if (!same) different = true;
    }
    if (p4k) p4k.close();
    process.exit(different ? 1 : 0);
}
mkdirSync(resolve(ROOT, 'data/trade'), { recursive: true });
if (UEX_DIR) { const text = `${JSON.stringify(uex)}\n`; writeFileSync(snapshotFile, text); console.log(`${SNAPSHOT_PATH}: ${Buffer.byteLength(text)} bytes raw (build input, not shipped to browsers)`); }
for (const [path, data] of targets) {
    const text = `${JSON.stringify(data)}\n`;
    writeFileSync(resolve(ROOT, path), text);
    console.log(`${path}: ${Buffer.byteLength(text)} bytes raw, ${zlib.gzipSync(text).length} bytes gzip`);
}
if (p4k) p4k.close();
console.log(`ships ${ships.length} (grids ${cargoOut.checks.withGrids}, ground ${cargoOut.checks.ground}, drive ${cargoOut.checks.withDrive}); cargo mismatches ${cargoMismatches.length}; tank mismatches ${tankMismatches.length}`);
console.log(`commodities ${commodities.length}; bodies ${bodies.length}; locations ${locations.length} (position ${withPosition}); UEX terminals ${terminalJoin ? `${terminalJoin.matched}/${terminalJoin.total}` : 'not measured'}; distance pairs ${distanceJoin ? distanceJoin.pairsCompared : 'not measured'}`);
