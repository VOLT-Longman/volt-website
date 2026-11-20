#!/usr/bin/env node
/**
 * Star-map data (성계지도), extracted from the installed game files. The data contract is docs/starmap-data.md.
 *
 * Inputs (read only):
 *   --cache-dir <dir>   Game2.dcb, global.ini (English), build.json (same folder the trade / mining / mission builds use).
 *                       The container walk over Data.p4k is cached here as starmap/walk-<build>.json.
 *   --ko-ini <file>     Korean patch global.ini (optional; without it Korean names are left out)
 *   --p4k <file>        Data.p4k (only opened when the cached walk is missing or stale)
 *   --rewalk            ignore the cached walk and read Data.p4k again
 *   --check             write nothing; exit 1 when the files on disk differ (builtAt ignored)
 *   Site data that is JOINED (never copied): data/trade/world.json, data/mining/helper.json, data/mining/mining.json,
 *   data/contracts/missions.json. Build those first; this script must be re-run after any of them changes.
 *
 * Outputs: data/starmap/index.json, data/starmap/stanton.json, data/starmap/pyro.json, data/starmap/nyx.json,
 *          data/starmap/links.json (what the other screens may link to; scripts/starmap/build-link-index.mjs)
 * Usage:   node scripts/starmap/build-starmap-data.mjs --cache-dir <dir> [--ko-ini <file>] [--p4k <file>] [--check]
 *
 * Where each value comes from:
 *   hierarchy, names, radius, flags, QT radii, amenities, rings   Game2.dcb  StarMapObject / StarMapObjectType records
 *   positions                                                      Data.p4k   ObjectContainers/PU/system/<sys>/<sys>system.socpak and
 *                                                                             every container it references (Child pos / rot / starMapRecord)
 *   jump links                                                     Data.p4k   JumpPoint_Permanent entity (jumpGateSuperGuid) in jump-point containers
 *   mission sites                                                  Data.p4k   SMissionLocationObjectMetadataParams.template on placed entities
 *   planet radius / rotation / gravity / atmosphere (raw)          Data.p4k   <planet>.xml and <planet>.ale of each body container
 *   texture key                                                    Data.p4k   StarMapObject.starMapMaterialPath -> .mtl Texture[Map=TexSlot4]
 *
 * Rules: numbers are game-file values. Nothing orbits in the files, so nothing here moves. A value the files do not hold is
 * left out (never written as 0). Anything this script infers carries a flag (`guess`, `derived`, `via`, `own`) so the screen can
 * mark it "추정" or leave it out. Fan sites are not used. Data problems are fixed here, never by editing the JSON.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import zlib from 'node:zlib';
import { DataForge } from '../gamedata/dataforge.mjs';
import { P4k, parseCryXml } from '../gamedata/p4k.mjs';
import { buildLinkIndex, LINKS_PATH, writeLinkIndex } from './build-link-index.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const SCHEMA = 1;
const WALK_VERSION = 4;
export const SYSTEMS = [
    { id: 'stanton', star: 'StantonStar', record: 'Stanton' },
    { id: 'pyro', star: 'PyroStar', record: 'Pyro' },
    { id: 'nyx', star: 'NyxStar', record: 'Nyx' },
];

// ============================================================================================
// Pure helpers (exported for tests/functions/starmap-data.test.mjs)
// ============================================================================================
/** Quaternions are [w, x, y, z], the order the container XML writes `rot`. */
export const qmul = (a, b) => [a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3], a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2], a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1], a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0]];
export const qconj = (q) => [q[0], -q[1], -q[2], -q[3]];
export const qrot = (q, v) => { const r = qmul(qmul(q, [0, v[0], v[1], v[2]]), qconj(q)); return [r[1], r[2], r[3]]; };

/**
 * Body-fixed latitude / longitude / altitude of a point given in the body's own frame (metres, body centre at 0).
 * lat = asin(z / |p|), lon = atan2(y, x): the zero meridian is OUR convention (the +x axis of the body container); the in-game
 * longitude origin and sign were not checked. alt = |p| - radius.
 */
export function geoOf(rel, radius) {
    const distance = Math.hypot(rel[0], rel[1], rel[2]);
    if (!(distance > 0)) return null;
    const deg = (rad) => Number((rad * 180 / Math.PI).toFixed(4));
    return [deg(Math.asin(Math.max(-1, Math.min(1, rel[2] / distance)))), deg(Math.atan2(rel[1], rel[0])), Math.round(distance - radius)];
}

/** docs/starmap-assets.md key rule (same as scripts/starmap/export-textures.mjs): texture file -> base name, no extension, lower case. */
export function textureKey(file) {
    return String(file || '').split('\\').join('/').split('/').pop().replace(/\.[a-z0-9]+$/i, '').toLowerCase();
}

/**
 * Is a star-map texture this body's own? The game points some bodies at another body's material (Pyro V uses the moon Ignis's
 * ui_sm_pyro_5a). The texture is the body's own when its name carries the body's own number: Stanton2c -> "stanton_2c",
 * Pyro5 -> "pyro_5" followed by "_" or the end, so "ui_sm_pyro_5a" is NOT Pyro5's.
 */
export function ownsTexture(id, key) {
    const match = /^(Stanton|Pyro|Nyx)(\d+)([a-z]?)$/.exec(id || '');
    if (!match || !key) return false;
    return new RegExp(`(^|_)${match[1].toLowerCase()}_${match[2]}${match[3]}(_|$)`).test(key);
}

/** StarMapObjectType.name -> the map's own, smaller set of kinds. Lagrange points and most jump points are typed Asteroid / Anomaly in the game. */
export function kindOf(id, type) {
    if (type === 'Star') return 'star';
    if (type === 'Planet') return 'planet';
    if (type === 'Moon') return 'moon';
    if (/^(Stanton|Pyro|Nyx)\d+_L\d$/.test(id)) return 'lagrange';
    if (/^JumpPoint_[A-Za-z]+_[A-Za-z]+$/.test(id) || type === 'JumpPoint') return 'jump'; // JumpPoint_<here>_<there>; not JumpPoint_Stanton_Pyro_Wrecksite
    if (type === 'Manmade' || type === 'Manmade_VisibleOnInteraction') return 'station';
    if (type === 'LandingZone') return 'city';
    if (type === 'Outpost' || type === 'Outpost_InvalidQT') return 'outpost';
    if (type === 'PointOfInterest') return 'poi';
    if (type === 'NavPoint') return 'nav';
    if (type === 'Asteroid' || type === 'Asteroid_ValidQT') return 'asteroid';
    if (type === 'Anomaly') return 'anomaly';
    return 'other';
}
export const KIND_ORDER = ['star', 'planet', 'moon', 'lagrange', 'jump', 'station', 'city', 'outpost', 'poi', 'nav', 'asteroid', 'anomaly', 'other'];

/** Records that sit under a system's star but belong to a system that is not built. Left out, with the reason. */
export const FOREIGN_BODIES = { Ellis3: 'planet record of the Ellis system ("Green") parented to StantonStar; not placed in the Stanton containers' };

/**
 * Why a StarMapObject record is NOT on the map; null when it stays. `record` = { id, type, system, hidden, positioned, joined }.
 * The first four tests use only the record itself; the last one drops records that have no static placement in the system
 * containers unless another screen's data refers to them or they are a body / jump point (kept and flagged `nopos`).
 */
export function dropReason(record) {
    const { id, type } = record;
    if (/TEMPLATE|_Template$/i.test(id)) return 'template';
    if (/^(MISSION_|PLAYER_|PARTY_|UNATTENDED_)/.test(id) || /MissionLocation$/.test(id)) return 'beacon';
    if (/^(YouAreHereMarker|CardinalPoint|QuantumTracePointStarMapRecord|PlaceholderStarMapRecord|SpecialEvent)/.test(id) || ['YouAreHere', 'CardinalPoint', 'QuantumTracePoint'].includes(type)) return 'uiMarker';
    if (type === 'SolarSystem') return 'solarSystemRecord';
    if (!record.system) return 'noSystem';
    if (FOREIGN_BODIES[id]) return 'foreignBody';
    if (record.positioned || record.joined) return null;
    const kind = kindOf(id, type);
    if (kind === 'star' || kind === 'planet' || kind === 'moon' || kind === 'jump') return null;
    return record.hidden ? 'hiddenUnplaced' : 'visibleUnplaced';
}

/** jumpGateSuperGuid = "<destination SSolarSystem record>.<destination star container>.<destination jump container>.<destination entity>" */
export function decodeSuperGuid(text) {
    const parts = String(text || '').toLowerCase().split('.');
    return parts.length === 4 && parts.every((part) => /^[0-9a-f-]{36}$/.test(part)) ? { system: parts[0], star: parts[1], container: parts[2], entity: parts[3] } : null;
}

export function unzip(buffer) {
    const end = buffer.lastIndexOf(Buffer.from([0x50, 0x4b, 5, 6])); if (end < 0) throw new Error('socpak: no zip end record');
    const count = buffer.readUInt16LE(end + 10); let p = buffer.readUInt32LE(end + 16); const out = [];
    for (let i = 0; i < count && buffer.readUInt32LE(p) === 0x02014b50; i += 1) {
        const method = buffer.readUInt16LE(p + 10); const comp = buffer.readUInt32LE(p + 20); const nameLen = buffer.readUInt16LE(p + 28); const extraLen = buffer.readUInt16LE(p + 30); const commentLen = buffer.readUInt16LE(p + 32); const offset = buffer.readUInt32LE(p + 42);
        out.push({ name: buffer.toString('utf8', p + 46, p + 46 + nameLen), read() { const at = offset + 30 + buffer.readUInt16LE(offset + 26) + buffer.readUInt16LE(offset + 28); const data = buffer.subarray(at, at + comp); return method === 0 ? data : method === 8 ? zlib.inflateRawSync(data) : zlib.zstdDecompressSync(data); } });
        p += 46 + nameLen + extraLen + commentLen;
    }
    return out;
}
const XML_ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
/** Minimal reader for the plain-text container XML. Attribute values are entity-decoded ("m&amp;v" is a real folder name). */
export function parseTextXml(xml) {
    const tagPattern = /<(\/?)([A-Za-z_][\w.]*)((?:\s+[\w:.]+="[^"]*")*)\s*(\/?)>/g; const stack = [{ tag: 'root', attrs: {}, children: [] }];
    for (let m = tagPattern.exec(xml); m; m = tagPattern.exec(xml)) {
        if (m[1]) { if (stack.length > 1) stack.pop(); continue; }
        const attrs = {};
        for (const a of m[3].matchAll(/([\w:.]+)="([^"]*)"/g)) attrs[a[1]] = a[2].includes('&') ? a[2].replace(/&(amp|lt|gt|quot|apos);/g, (_, name) => XML_ENTITIES[name]) : a[2];
        const node = { tag: m[2], attrs, children: [] }; stack.at(-1).children.push(node); if (!m[4]) stack.push(node);
    }
    return stack[0].children[0];
}
const anyXml = (data) => (data.toString('latin1', 0, 7) === 'CryXmlB' ? parseCryXml(data) : parseTextXml(data.toString('utf8')));

/** First JSON document embedded in a planet .ale file (a "CrCh" wrapper around JSON text). */
export function firstJson(data) {
    const text = data.toString('latin1');
    for (let start = text.indexOf('{'); start >= 0; start = text.indexOf('{', start + 1)) {
        let depth = 0; let inString = false; let end = -1;
        for (let i = start; i < text.length; i += 1) {
            const c = text[i];
            if (inString) { if (c === '\\') i += 1; else if (c === '"') inString = false; } else if (c === '"') inString = true; else if (c === '{') depth += 1; else if (c === '}') { depth -= 1; if (!depth) { end = i; break; } }
        }
        if (end < 0) return null;
        try { return JSON.parse(Buffer.from(text.slice(start, end + 1), 'latin1').toString('utf8')); } catch { /* not JSON: try the next brace */ }
    }
    return null;
}

const round = (value, digits = 3) => (Number.isFinite(value) ? Number(value.toFixed(digits)) : undefined);
const prune = (object) => Object.fromEntries(Object.entries(object).filter(([, v]) => v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && !v.length) && !(typeof v === 'object' && !Array.isArray(v) && !Object.keys(v).length)));
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const naturalCompare = (a, b) => a.localeCompare(b, 'en', { numeric: true, sensitivity: 'base' }) || (a < b ? -1 : a > b ? 1 : 0);

// ============================================================================================
// Data.p4k: walk every star-system container tree
// ============================================================================================
const ZERO_GUID = /^0{8}-/;
const NEEDLES = ['tarMapRecord', 'tarmapRecord', 'SMissionLocationObjectMetadataParams', 'jumpGateSuperGuid'].map((text) => Buffer.from(text, 'latin1'));
const hasNeedle = (data) => NEEDLES.some((needle) => data.includes(needle));

/** starmapRecord GUIDs, mission-location template GUIDs and the jump link found on / below one entity node. */
function entityInfo(node) {
    const info = {};
    const add = (key, value) => { if (!info[key]) info[key] = []; info[key].push(value.toLowerCase()); };
    const visit = (n) => {
        for (const [key, value] of Object.entries(n.attrs)) {
            if (/^star[mM]apRecord$/.test(key) && value && !ZERO_GUID.test(value)) add('sm', value);
            if (key === 'jumpGateSuperGuid' && value) info.jump = value.toLowerCase();
        }
        if (n.attrs.__type === 'SMissionLocationObjectMetadataParams' && n.attrs.template && !ZERO_GUID.test(n.attrs.template)) add('tpl', n.attrs.template);
        n.children.forEach(visit);
    };
    visit(node);
    return info.sm || info.tpl || info.jump ? info : null;
}

/**
 * Returns { rows, areas, materials, missing, stats }.
 *   rows   one per placed thing that carries a StarMapObject GUID, a mission-location template or a planet:
 *          k 'c' = a <Child> container placement, 'e' = a static entity inside a container's .soc / .ale.
 *          p = metres in the system frame; q = world rotation [w,x,y,z] ('c' rows); par = index of the nearest row above it.
 *   areas  placements of the containers named in `wantedBases` (mining-area containers), with the nearest row above.
 * Child pos is relative to the parent Child and turned by the parent's rotation. There is no depth limit; a container
 * that is already open further up the same branch is not opened again (cycle guard).
 */
export function walkContainers(p4k, { wantedBases, materialPaths }) {
    const index = new Map(p4k.find((name) => name.toLowerCase().endsWith('.socpak')).map((entry) => [entry.name.toLowerCase().replaceAll('\\', '/'), entry]));
    const cache = new Map(); const stats = { socpakFiles: index.size, containersLoaded: 0, entityFilesParsed: 0, staticFilesScanned: 0, placements: 0, containersOpened: 0, maxDepth: 0 };
    const load = (key) => {
        if (cache.has(key)) return cache.get(key);
        const entry = index.get(key); let out = null;
        if (entry) {
            stats.containersLoaded += 1;
            const files = unzip(p4k.extract(entry)); const base = key.split('/').pop().replace('.socpak', '');
            const ents = new Map(); const statics = []; let planet = null; let tree = null;
            for (const file of files) {
                const lower = file.name.toLowerCase();
                if (/entdata\/.*\.entxml$/.test(lower)) {
                    const data = file.read(); if (!hasNeedle(data)) continue;
                    stats.entityFilesParsed += 1; const root = anyXml(data); const info = entityInfo(root);
                    if (info) ents.set(String(root.attrs.EntityCryGUID).toLowerCase(), info);
                } else if (/\.(soc|ale)$/.test(lower)) {
                    const data = file.read(); stats.staticFilesScanned += 1;
                    if (!hasNeedle(data)) continue;
                    for (let at = data.indexOf('CryXmlB\0', 0, 'latin1'); at >= 0; at = data.indexOf('CryXmlB\0', at + 8, 'latin1')) {
                        const length = data.readUInt32LE(at + 8); let root = null;
                        if (length > 44 && at + length <= data.length) { try { root = parseCryXml(data.subarray(at, at + length)); } catch { root = null; } }
                        if (!root) continue;
                        const visit = (n) => {
                            if (n.tag !== 'Entity') { n.children.forEach(visit); return; }
                            const info = entityInfo(n);
                            if (info) statics.push({ ...info, name: n.attrs.Name, cls: n.attrs.EntityClass, pos: (n.attrs.Pos || '0,0,0').split(',').map(Number), inner: file.name });
                        };
                        visit(root);
                    }
                }
            }
            const main = files.find((file) => file.name.toLowerCase() === `${base}.xml`);
            if (main) {
                tree = anyXml(main.read());
                const visit = (n) => {
                    if (n.attrs.planetRadius || n.attrs.planetRotationSpeed) planet = { radius: Number(n.attrs.planetRadius), rot: Number(n.attrs.planetRotationSpeed), axis: n.attrs.planetAxis };
                    if (n.tag !== 'ChildObjectContainers') n.children.forEach(visit);
                };
                visit(tree);
                const ale = planet && files.find((file) => file.name.toLowerCase() === `${base}.ale`);
                if (ale) {
                    const json = firstJson(ale.read()); const general = json?.data?.General;
                    if (general) Object.assign(planet, prune({ terrainRadius: general.tSphere?.fPlanetTerrainRadius, gas: general.tSphere?.bGasGiant === true ? true : undefined, gravity: general.tSphere?.physProperties?.fGravity, atmo: json.data.atmoParams?.General?.AtmoHeight }));
                }
            }
            out = { tree, ents, statics, planet };
        }
        cache.set(key, out); return out;
    };
    const rows = []; const areas = []; const missing = new Set();
    const short = (key) => key.replace(/^data\/objectcontainers\//, '');
    const point = (v) => v.map((n) => round(n, 3));
    const walk = (container, key, position, rotation, depth, system, parentRow, stack) => {
        stats.maxDepth = Math.max(stats.maxDepth, depth);
        for (const e of container.statics) rows.push(prune({ k: 'e', s: system, par: parentRow, g: e.sm, t: e.tpl, jump: e.jump, p: point(qrot(rotation, e.pos).map((v, i) => v + position[i])), in: short(key), en: e.name, cls: e.cls, d: depth }));
        const visit = (node, pos, rot, parent) => {
            for (const group of node.children) {
                if (group.tag !== 'ChildObjectContainers') continue;
                for (const child of group.children) {
                    stats.placements += 1;
                    const local = (child.attrs.pos || '0,0,0').split(',').map(Number); const localRot = (child.attrs.rot || '1,0,0,0').split(',').map(Number);
                    const world = qrot(rot, local).map((v, i) => v + pos[i]); const worldRot = qmul(rot, localRot);
                    const guid = String(child.attrs.guid || '').toLowerCase(); const ent = container.ents.get(guid);
                    const sm = [...new Set([child.attrs.starMapRecord, ...(ent?.sm || [])].filter((g) => g && !ZERO_GUID.test(g)).map((g) => g.toLowerCase()))];
                    let sub = child.attrs.external === '1' && child.attrs.name ? child.attrs.name.toLowerCase().replaceAll('\\', '/') : null;
                    if (sub && !sub.startsWith('data/')) sub = `data/${sub}`;
                    const open = sub && !stack.includes(sub); const loaded = open ? load(sub) : null;
                    let row = parent;
                    if (sm.length || ent?.tpl || loaded?.planet) {
                        row = rows.length;
                        rows.push(prune({ k: 'c', s: system, par: parent, g: sm, t: ent?.tpl, p: point(world), q: worldRot.map((n) => round(n, 12)), in: short(key), file: sub ? short(sub) : undefined, en: child.attrs.entityName, cg: guid, planet: loaded?.planet, d: depth }));
                    }
                    const base = sub ? sub.split('/').pop().replace('.socpak', '') : null;
                    if (base && wantedBases.has(base)) areas.push({ base, s: system, p: point(world), par: row });
                    visit(child, world, worldRot, row);
                    if (open) {
                        if (!loaded || !loaded.tree) { missing.add(short(sub)); continue; }
                        stats.containersOpened += 1; walk(loaded, sub, world, worldRot, depth + 1, system, row, [...stack, sub]);
                    }
                }
            }
        };
        visit(container.tree, position, rotation, parentRow);
    };
    for (const system of SYSTEMS) {
        const key = `data/objectcontainers/pu/system/${system.id}/${system.id}system.socpak`; const root = load(key);
        if (!root?.tree) throw new Error(`Missing system container ${key}`);
        walk(root, key, [0, 0, 0], [1, 0, 0, 0], 0, system.id, -1, [key]);
    }
    // star-map materials -> colour texture (TexSlot4) and, for stars, the flat colour
    const materials = {};
    const wantedMaterials = new Map(materialPaths.map((path) => [`data/${path.replaceAll('\\', '/').replace(/^\/+/, '').toLowerCase()}`.replace(/^data\/data\//, 'data/'), path]));
    for (const entry of p4k.find((name) => wantedMaterials.has(name.replaceAll('\\', '/').toLowerCase()))) {
        const path = wantedMaterials.get(entry.name.replaceAll('\\', '/').toLowerCase()); const data = p4k.extract(entry); const info = { found: true };
        if (data.toString('latin1', 0, 7) === 'CryXmlB') {
            const visit = (n) => {
                if (n.tag === 'Material' && n.attrs.Shader && !info.shader) { info.shader = n.attrs.Shader; if (n.attrs.Diffuse) info.diffuse = n.attrs.Diffuse; }
                if (n.tag === 'Texture' && n.attrs.Map === 'TexSlot4' && n.attrs.File && !info.tex4) info.tex4 = n.attrs.File;
                n.children.forEach(visit);
            };
            visit(parseCryXml(data));
        }
        materials[path] = info;
    }
    for (const path of materialPaths) if (!materials[path]) materials[path] = { found: false };
    return { rows, areas, materials, missing: [...missing].sort(), stats };
}

// ============================================================================================
// Build
// ============================================================================================
const AMENITY_CODES = { // same codes as data/trade/world.json `amenities` (scripts/trade/build-cargo-data.mjs)
    'Commodity Trading - Freight Elevator': 'fe', 'Commodity Trading - Loading Dock': 'ld', Refinery: 'ref', Docking: 'dock', Garage: 'gar',
    'Hangar S': 'hS', 'Hangar M': 'hM', 'Hangar L': 'hL', 'Hangar XL': 'hXL', 'Landing Pad S': 'pS', 'Landing Pad M': 'pM', 'Landing Pad L': 'pL', 'Landing Pad XL': 'pXL',
    'Vehicle Services': 'svc', 'Buy Vehicles': 'vbuy', 'Rent Vehicles': 'vrent', 'Buy and Rent Vehicles': 'vboth', Hospital: 'hosp', Clinic: 'clin', 'Food Court': 'food',
    'Buy Weapons': 'wpn', 'Buy Ship Items and Weapons': 'shipitm', 'Buy Armor': 'armor', 'Buy Clothing': 'cloth', 'Special Event': 'event',
};
// Kind labels. `key` = the game's own marker text (Korean patch wording). The game has no such text for two kinds; those are ours (own: 1).
const KIND_LABELS = {
    star: { key: '@Markers_Subtext_Star' }, planet: { key: '@Markers_Subtext_Planet' }, moon: { key: '@Markers_Subtext_Moon' },
    lagrange: { key: '@Markers_Subtext_LagrangePoint' }, jump: { own: { en: 'Jump point', ko: '점프 포인트' } },
    station: { key: '@Markers_Subtext_Manmade' }, city: { key: '@Markers_Subtext_LandingZone' }, outpost: { key: '@Markers_Subtext_Outpost' },
    poi: { own: { en: 'Point of interest', ko: '관심 지점' } }, nav: { key: '@Markers_Subtext_NavPoint' },
    asteroid: { key: '@Markers_Subtext_Asteroid' }, anomaly: { key: '@Markers_Subtext_Anomaly' }, other: { own: { en: 'Other', ko: '기타' } },
};
const SITE_NEAR_METRES = 100000; // a mission site this close to a map object is listed as "at" that object, without its own coordinates
const BODY_FRAME_RADII = 3;      // `body` / `rel` / `geo` are written only this close to a planet or moon (in body radii from its centre)
const GATEWAY_METRES = 1000000;  // a station this close to a jump point is taken as its gateway station

function main() {
    const arg = (name) => { const index = process.argv.indexOf(name); return index > -1 ? process.argv[index + 1] : null; };
    const CHECK = process.argv.includes('--check');
    const CACHE = arg('--cache-dir');
    if (!CACHE || !existsSync(resolve(CACHE, 'Game2.dcb'))) { console.error('--cache-dir <folder with Game2.dcb, global.ini, build.json> is required.'); process.exit(2); }
    const P4K_PATH = arg('--p4k') || 'C:/Program Files/Roberts Space Industries/StarCitizen/LIVE/Data.p4k';
    const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
    const dcb = readFileSync(resolve(CACHE, 'Game2.dcb'));
    const df = new DataForge(dcb);
    if (!df.consistent) throw new Error('DataForge layout mismatch');
    const build = readJson(resolve(CACHE, 'build.json'));

    const loadIni = (path) => {
        const map = new Map();
        for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
            const at = line.indexOf('='); if (at < 1) continue;
            map.set(line.slice(0, at).replace(/^\uFEFF/, '').replace(/,P$/i, '').trim().toLowerCase(), line.slice(at + 1).trim());
        }
        return map;
    };
    const en = loadIni(resolve(CACHE, 'global.ini'));
    const koPath = arg('--ko-ini');
    const ko = koPath && existsSync(koPath) ? loadIni(koPath) : null;
    const lookup = (map, key) => { if (!map || !key || !String(key).startsWith('@')) return undefined; const value = map.get(String(key).slice(1).toLowerCase()); return value && !/LOC_|PLACEHOLDER|UNINITIALIZED/.test(value) ? value.replace(/<[^>]+>/g, '').replace(/\\n/g, ' ').replace(/\s+/g, ' ').trim() || undefined : undefined; };
    /** {en, ko} from a localisation key; ko only when the Korean patch has a different text (no ko = same as English). */
    const names = (key) => { const english = lookup(en, key); const korean = lookup(ko, key); return english ? (korean && korean !== english ? { en: english, ko: korean } : { en: english }) : undefined; };
    const idOf = (record) => record.name.split('.').slice(1).join('.');
    const short = (ref) => (ref?.name ? String(ref.name).split('.').slice(1).join('.') : undefined);

    // ---- other screens' data (join targets) ----------------------------------------------------
    const dataFile = (path) => { const file = resolve(ROOT, path); if (!existsSync(file)) { console.error(`${path} is missing. Build it first (the star map joins to it).`); process.exit(2); } return readJson(file); };
    const world = dataFile('data/trade/world.json'); const helper = dataFile('data/mining/helper.json'); const mining = dataFile('data/mining/mining.json'); const missions = dataFile('data/contracts/missions.json');
    for (const [name, data] of [['world.json', world], ['helper.json', helper], ['mining.json', mining], ['missions.json', missions]]) if (data.gameVersion !== build.Version) throw new Error(`${name} is from game build ${data.gameVersion}, the cache is ${build.Version}. Rebuild it first.`);

    // ---- StarMapObject records -----------------------------------------------------------------
    const typeById = new Map(df.recordsOfType('StarMapObjectType').map((record) => [record.id, df.readRecord(record, 2)]));
    const amenityById = new Map(df.recordsOfType('StarMapAmenityTypeEntry').map((record) => [record.id, df.readRecord(record, 1)]));
    const amenities = {};
    for (const data of amenityById.values()) { const code = AMENITY_CODES[data.name]; if (!code) throw new Error(`Unknown amenity ${data.name}`); amenities[code] = prune({ name: names(data.displayName), game: data.name }); }
    const laws = {};
    for (const record of df.recordsOfType('Jurisdiction')) laws[idOf(record)] = prune({ name: names(df.readRecord(record, 1).name) });

    const smo = new Map(); // guid -> record
    for (const record of df.recordsOfType('StarMapObject')) {
        const data = df.readRecord(record, 3); const type = typeById.get(data.type?.__record);
        smo.set(record.id, {
            id: idOf(record), guid: record.id, type: type?.name, typeData: type, parentGuid: data.parent?.__record, nameKey: data.name, name: names(data.name),
            size: data.size, navIcon: data.navIcon, hidden: data.hideInStarmap === true, sub: data.onlyShowWhenParentSelected === true, orbit: data.showOrbitLine === true,
            jurisdiction: short(data.jurisdiction), material: data.starMapMaterialPath || undefined,
            qt: data.quantumTravelData ? [data.quantumTravelData.obstructionRadius, data.quantumTravelData.arrivalRadius, data.quantumTravelData.adoptionRadius] : undefined,
            rings: (data.asteroidRings || []).map((ring) => ({ inner: round(ring.innerRadius, 0), outer: round(ring.outerRadius, 0), depth: round(ring.depth, 0), density: round(ring.densityScale, 3), size: round(ring.sizeScale, 3) })),
            amenities: [...new Set((data.amenities || []).map((ref) => AMENITY_CODES[amenityById.get(ref.__record)?.name]).filter(Boolean))],
            tag: data.locationHierarchyTag?.__record,
        });
    }
    const byId = new Map([...smo.values()].map((record) => [record.id, record]));
    const starSystem = Object.fromEntries(SYSTEMS.map((system) => [system.star, system.id]));
    const chain = (record) => { const out = []; for (let cur = record, guard = 0; cur && guard < 40; cur = smo.get(cur.parentGuid), guard += 1) out.push(cur); return out; };
    for (const record of smo.values()) {
        const ancestors = chain(record);
        record.system = starSystem[ancestors.at(-1).id];
        record.law = ancestors.find((item) => item.jurisdiction)?.jurisdiction; // nearest ancestor (or itself) with StarMapObject.jurisdiction; inheritance is how the trade data reads it too
    }

    // ---- container walk (cached) ---------------------------------------------------------------
    const areaLocations = helper.locations.filter((location) => location.kind === 'area');
    const wantedBases = new Set(areaLocations.flatMap((location) => location.containers || []).map((base) => base.toLowerCase()));
    const materialPaths = [...new Set([...smo.values()].filter((record) => ['Star', 'Planet', 'Moon'].includes(record.type) && record.material).map((record) => record.material))].sort();
    const inputsHash = sha(JSON.stringify([[...wantedBases].sort(), materialPaths]));
    const walkFile = resolve(CACHE, 'starmap', `walk-${build.Version}.json`);
    let walked = !process.argv.includes('--rewalk') && existsSync(walkFile) ? readJson(walkFile) : null;
    if (!walked || walked.walkVersion !== WALK_VERSION || walked.gameVersion !== build.Version || walked.inputsHash !== inputsHash) {
        if (!existsSync(P4K_PATH)) throw new Error(`Data.p4k not found at ${P4K_PATH} and there is no usable cached walk (use --p4k)`);
        const manifest = resolve(dirname(P4K_PATH), 'build_manifest.id');
        if (existsSync(manifest) && readJson(manifest).Data?.Version !== build.Version) throw new Error('P4K and cached game builds differ');
        const p4k = new P4k(P4K_PATH);
        try { walked = { walkVersion: WALK_VERSION, gameVersion: build.Version, inputsHash, ...walkContainers(p4k, { wantedBases, materialPaths }) }; } finally { p4k.close(); }
        mkdirSync(dirname(walkFile), { recursive: true }); writeFileSync(walkFile, JSON.stringify(walked));
    }
    const { rows } = walked;

    // ---- positions -----------------------------------------------------------------------------
    // One record can be placed more than once. The placement used: in the record's own system, the shallowest container
    // depth, then the first met. The others are only counted (`multi`).
    const placements = new Map(); let foreignPlacements = 0; const unknownGuids = new Set();
    rows.forEach((row, index) => {
        for (const guid of row.g || []) {
            const record = smo.get(guid); if (!record) { unknownGuids.add(guid); continue; }
            if (record.system !== row.s) { foreignPlacements += 1; continue; }
            if (!placements.has(guid)) placements.set(guid, []);
            placements.get(guid).push(index);
        }
    });
    const rowOf = new Map();
    for (const [guid, list] of placements) rowOf.set(guid, [...list].sort((a, b) => rows[a].d - rows[b].d || a - b)[0]);
    const recordAtRow = new Map(); // row index -> record placed there (its chosen placement)
    for (const [guid, index] of rowOf) if (!recordAtRow.has(index)) recordAtRow.set(index, smo.get(guid));
    const anyRecordAtRow = (index) => recordAtRow.get(index) || (rows[index].g || []).map((guid) => smo.get(guid)).find((record) => record && record.system === rows[index].s);

    // ---- join keys of the other screens --------------------------------------------------------
    const uexTerminals = new Map(); for (const [terminal, id] of Object.entries(world.joins?.terminals?.map || {})) { if (!uexTerminals.has(id)) uexTerminals.set(id, []); uexTerminals.get(id).push(Number(terminal)); }
    const uexRefineries = new Map(); for (const [terminal, id] of Object.entries(world.joins?.refineries?.map || {})) { if (!uexRefineries.has(id)) uexRefineries.set(id, []); uexRefineries.get(id).push(Number(terminal)); }
    // UEX marks some terminals as not available in the live game (closed shops, event ships docked at a station). The map keeps every
    // terminal number for look-ups (`uex`), and lists the live ones apart (`uexLive`) when a place has both kinds, so its links open a working terminal.
    const uexSnapshotFile = resolve(ROOT, 'scripts/trade/uex-join-snapshot.json');
    const uexNotLive = new Set(existsSync(uexSnapshotFile) ? (readJson(uexSnapshotFile).terminals || []).filter((terminal) => terminal.is_available_live === 0).map((terminal) => Number(terminal.id)) : []);
    const tradeIds = new Set(world.locations.map((location) => location.id));
    const tradeBodyIds = new Set(world.bodies.map((body) => body.id));
    const refineryIds = new Set(helper.refineryDesks.map((desk) => desk.id));
    const miningBodyIds = new Set(mining.locations.filter((location) => location.kind === 'body').map((location) => location.id));
    const miningPlaceIds = new Set((helper.places || []).map((place) => place.id));
    const missionPlaceIds = new Set(Object.keys(missions.places || {}));
    const joinedIds = new Set([...tradeIds, ...tradeBodyIds, ...uexTerminals.keys(), ...uexRefineries.keys(), ...refineryIds, ...miningBodyIds, ...miningPlaceIds, ...missionPlaceIds]);

    // ---- which records stay --------------------------------------------------------------------
    const dropped = {}; const kept = new Map();
    for (const record of smo.values()) {
        const reason = dropReason({ id: record.id, type: record.type, system: record.system, hidden: record.hidden, positioned: rowOf.has(record.guid), joined: joinedIds.has(record.id) });
        if (reason) { dropped[reason] = (dropped[reason] || 0) + 1; continue; }
        kept.set(record.guid, record);
    }
    const keptAtRow = (index) => { const record = anyRecordAtRow(index); return record && kept.has(record.guid) ? record : null; };
    /** nearest kept record placed at this row or at a row above it: [record, row index] */
    const nearestKept = (index) => { for (let cur = index; cur >= 0; cur = rows[cur].par) { const record = keptAtRow(cur); if (record) return [record, cur]; } return [null, -1]; };
    const isBodyType = (record) => record.type === 'Planet' || record.type === 'Moon';

    // ---- objects -------------------------------------------------------------------------------
    const texture = (record) => {
        if (!['star', 'planet', 'moon'].includes(kindOf(record.id, record.type))) return {};
        const material = walked.materials[record.material];
        if (record.type === 'Star') return { texNone: 'star' };
        const key = material?.tex4 ? textureKey(material.tex4) : null;
        if (!key) return { texNone: 'none' };
        return ownsTexture(record.id, key) ? { tex: key } : { texNone: 'borrowed' };
    };
    const objects = new Map(); // id -> output object (insertion order fixed later)
    const internal = new Map(); // id -> { row, body, bodyRow }
    for (const record of kept.values()) {
        const kind = kindOf(record.id, record.type); const index = rowOf.get(record.guid); const row = index === undefined ? null : rows[index];
        const parent = chain(record).slice(1).find((item) => kept.has(item.guid));
        const object = { id: record.id, kind, type: record.type, parent: parent?.id, name: record.name };
        if (!record.name) object.noName = 1;
        if (row) {
            object.pos = row.p.map((v) => Math.round(v));
            // container tree: nearest kept record above (`in`), nearest planet / moon above (`body`)
            let bodyRow = -1; let within = null;
            for (let cur = row.par; cur >= 0; cur = rows[cur].par) {
                const above = keptAtRow(cur); if (!above) continue;
                if (!within) within = above;
                if (isBodyType(above) && rows[cur].k === 'c') { bodyRow = cur; break; }
                if (above.type === 'Star') break;
            }
            if (within && within.id !== object.parent) object.in = within.id;
            // body-fixed coordinates only for the ground and low orbit: within BODY_FRAME_RADII body radii of the centre (our cut-off).
            // Things placed in a planet's container but far out (asteroid bases 100,000 km away, Pyro V's clusters 4 Gm away) keep only `pos`.
            if (bodyRow >= 0 && Math.hypot(...row.p.map((v, i) => v - rows[bodyRow].p[i])) > BODY_FRAME_RADII * (rows[bodyRow].planet?.radius || keptAtRow(bodyRow).size)) bodyRow = -1;
            if (bodyRow >= 0 && kind !== 'planet' && kind !== 'moon') {
                const bodyRecord = keptAtRow(bodyRow); const origin = rows[bodyRow];
                const rel = qrot(qconj(origin.q), row.p.map((v, i) => v - origin.p[i]));
                const radius = origin.planet?.radius || bodyRecord.size;
                object.body = bodyRecord.id; object.rel = rel.map((v) => Math.round(v));
                const geo = geoOf(rel, radius); if (geo) object.geo = geo;
                // on the ground: a surface type in the game (StarMapObjectType.onParentSurface) with no station between it and the body
                if (record.typeData?.onParentSurface && !chain(record).slice(1).some((item) => kindOf(item.id, item.type) === 'station')) object.surf = 1;
            }
            internal.set(record.id, { row: index, bodyRow });
            // the same record placed again elsewhere (belt segments, repeated bases): every other placement, in file order
            const seen = new Set([object.pos.join()]); const more = [];
            for (const other of placements.get(record.guid)) { const p = rows[other].p.map((v) => Math.round(v)); if (!seen.has(p.join())) { seen.add(p.join()); more.push(p); } }
            if (more.length) object.more = more;
        } else object.nopos = 1;
        if (record.size > 1) object.r = round(record.size, 0); // 0.1 and 1 are placeholder sizes on outposts and landing zones
        if (record.qt) object.qt = record.qt.map((v) => round(v, 0));
        if (record.navIcon && record.navIcon !== 'Default') object.icon = record.navIcon;
        if (record.law) object.law = record.law;
        if (record.amenities.length) object.am = record.amenities;
        if (record.hidden) object.h = 1;
        if (record.sub) object.sub = 1;
        if (record.orbit) object.orbit = 1;
        if (record.rings.length) object.rings = record.rings;
        Object.assign(object, texture(record));
        // a planet / moon placed through a stand-in container (test/locations/dummyplanet): its star-map size is a placeholder, not a measured body
        if (row && (kind === 'planet' || kind === 'moon') && !row.planet && /(^|\/)test\/|dummy/i.test(row.file || '')) object.stub = 1;
        if (row?.planet) object.phys = prune({ r: round(row.planet.radius, 0), rot: round(row.planet.rot, 4), atmo: round(row.planet.atmo, 3), g: round(row.planet.gravity, 3), gas: row.planet.gas ? 1 : undefined });
        // joins
        if (tradeIds.has(record.id)) object.trade = 1;
        if (uexTerminals.has(record.id)) {
            object.uex = uexTerminals.get(record.id).sort((a, b) => a - b);
            const live = object.uex.filter((terminal) => !uexNotLive.has(terminal));
            if (live.length && live.length < object.uex.length) object.uexLive = live;
        }
        if (refineryIds.has(record.id)) object.refinery = 1;
        if (uexRefineries.has(record.id)) object.uexRef = uexRefineries.get(record.id).sort((a, b) => a - b);
        if (miningBodyIds.has(record.id)) object.mine = 1;
        if (missionPlaceIds.has(record.id)) object.mission = 1;
        objects.set(record.id, object);
    }
    // Rest stops with no placement: the record name says which Lagrange point / planet they belong to (RR_P1_L2 -> Pyro1_L2).
    // The same rule is checked against the rest stops that DO have a position; `guess` is only written when it never fails there.
    const guessTarget = (id) => { const m = /^RR_P(\d)_L(\d)$/.exec(id); if (m) return `Pyro${m[1]}_L${m[2]}`; const leo = /^RR_P(\d)_LEO$/.exec(id); return leo ? `Pyro${leo[1]}` : null; };
    const guessCheck = { rule: 'record name RR_P<n>_L<m> -> Pyro<n>_L<m>, RR_P<n>_LEO -> Pyro<n>', test: 'placed rest stops: is the station inside the container of that Lagrange point / parented to that planet', tested: 0, agreed: 0, maxDistanceM: 0, failed: [] };
    for (const object of objects.values()) {
        const target = guessTarget(object.id); if (!target || !object.pos || !objects.get(target)?.pos) continue;
        const distance = Math.hypot(...object.pos.map((v, i) => v - objects.get(target).pos[i]));
        guessCheck.tested += 1; guessCheck.maxDistanceM = Math.max(guessCheck.maxDistanceM, Math.round(distance));
        if (object.in === target || object.parent === target) guessCheck.agreed += 1; else guessCheck.failed.push(object.id); // placed inside that point's container / parented to that planet
    }
    if (guessCheck.tested && !guessCheck.failed.length) {
        // A guessed spot is only written for a place that is known to be in use (it has a UEX terminal) but has no placement.
        // Without that evidence a guess would send players to a spot where nothing may exist (see `unplaced` below).
        for (const object of objects.values()) { const target = guessTarget(object.id); if (object.nopos && target && objects.has(target) && (object.uex || object.uexRef)) object.guess = { at: target, by: 'record-name' }; }
    }
    // Stations that the database lists with trade / refinery services but that are placed in NO container and have NO UEX terminal
    // (Pyro's PYAM-FARSTAT-* placeholders). Nothing in the files shows they can be visited, so the map does not offer trade or
    // refining there and does not mark a spot: they stay in the list as `unplaced`, and so do the records parented to them.
    const unplacedStations = [];
    for (const object of objects.values()) {
        if (!object.nopos || object.kind !== 'station' || !(object.trade || object.am?.includes('ref')) || object.uex || object.uexRef) continue;
        delete object.trade; delete object.refinery; object.unplaced = 1; unplacedStations.push(object.id);
    }
    for (const object of objects.values()) if (object.nopos && unplacedStations.includes(object.parent)) object.unplaced = 1;

    // ---- jump points ---------------------------------------------------------------------------
    const solarSystems = new Map(df.recordsOfType('SSolarSystem').map((record) => [record.id, { name: df.readRecord(record, 1).Name, galactic: df.readRecord(record, 1).galacticPosition, starMapRecord: short(df.readRecord(record, 1).SolarSystemRecord) }]));
    const systemByRecord = (name) => SYSTEMS.find((system) => system.record === name)?.id;
    const rowByChildGuid = new Map(); rows.forEach((row, index) => { if (row.cg && !rowByChildGuid.has(row.cg)) rowByChildGuid.set(row.cg, index); });
    const jumpEntities = new Map(); // jump record id -> { link, entry }
    rows.forEach((row, index) => {
        if (!row.jump) return;
        const [record] = nearestKept(index); const link = decodeSuperGuid(row.jump);
        if (record && link && kindOf(record.id, record.type) === 'jump' && !jumpEntities.has(record.id)) jumpEntities.set(record.id, { link, entry: row.p.map((v) => Math.round(v)) });
    });
    const jumps = Object.fromEntries(SYSTEMS.map((system) => [system.id, []]));
    const links = [];
    for (const object of objects.values()) {
        if (object.kind !== 'jump') continue;
        const record = byId.get(object.id); const entity = jumpEntities.get(object.id); const jump = { id: object.id };
        if (entity) {
            const destination = systemByRecord(solarSystems.get(entity.link.system)?.name); const peerRow = rowByChildGuid.get(entity.link.container); const peer = peerRow === undefined ? null : keptAtRow(peerRow);
            if (!destination || !peer) throw new Error(`Jump link of ${object.id} does not resolve (${JSON.stringify(entity.link)})`);
            Object.assign(jump, { usable: 1, to: destination, peer: peer.id, entry: entity.entry });
            // the record name can point somewhere else than the files do (JumpPoint_Stanton_Magnus leads to Nyx): keep the name's system so the screen can say so
            const named = /^JumpPoint_[A-Za-z]+_([A-Za-z]+)$/.exec(object.id)?.[1];
            if (named && systemByRecord(named) !== destination) jump.named = named;
        } else {
            // no JumpPoint_Permanent entity in the container (or no container at all): not a working jump point in this build.
            // The far system is only known from the record name JumpPoint_<here>_<there>.
            const named = /^JumpPoint_[A-Za-z]+_([A-Za-z]+)$/.exec(object.id)?.[1];
            Object.assign(jump, { usable: 0, toName: named });
        }
        if (object.pos) {
            const near = [...objects.values()].filter((other) => other.kind === 'station' && other.pos && byId.get(other.id).system === record.system)
                .map((other) => [Math.hypot(...other.pos.map((v, i) => v - object.pos[i])), other]).filter(([distance]) => distance <= GATEWAY_METRES).sort((a, b) => a[0] - b[0])[0];
            if (near) { jump.station = near[1].id; near[1].gate = object.id; }
        }
        object.jump = prune({ usable: jump.usable, to: jump.to, toName: jump.toName, named: jump.named, peer: jump.peer, station: jump.station });
        jumps[record.system].push(prune(jump));
    }
    for (const system of SYSTEMS) {
        for (const jump of jumps[system.id]) {
            if (!jump.usable) continue;
            const back = jumps[jump.to].find((other) => other.id === jump.peer);
            if (!back || back.peer !== jump.id || back.to !== system.id) throw new Error(`Jump link ${jump.id} -> ${jump.peer} is not two-way in the files`);
            if (SYSTEMS.findIndex((s) => s.id === system.id) < SYSTEMS.findIndex((s) => s.id === jump.to)) {
                links.push({ a: prune({ sys: system.id, jump: jump.id, station: jump.station, pos: objects.get(jump.id).pos, entry: jump.entry }), b: prune({ sys: jump.to, jump: back.id, station: back.station, pos: objects.get(back.id).pos, entry: back.entry }) });
            }
        }
    }

    // ---- mining regions (area tables that are not one point) -------------------------------------
    const regions = Object.fromEntries(SYSTEMS.map((system) => [system.id, []]));
    const regionProblems = [];
    for (const location of areaLocations) {
        const bases = new Set((location.containers || []).map((base) => base.toLowerCase()));
        let placed = false;
        for (const system of SYSTEMS) {
            const spots = walked.areas.filter((area) => area.s === system.id && bases.has(area.base));
            const declared = new Set((location.usedBy || []).filter((id) => objects.has(id) && byId.get(id).system === system.id));
            const at = new Set(declared); const also = new Set();
            // A table with declared places (usedBy) covers those places and what sits inside them. The same table is also used by small
            // fields placed elsewhere (mining claims inside another Lagrange field): those go to `also`, so the region does not light up every point.
            const inside = (id) => { for (let cur = objects.get(id), guard = 0; cur && guard < 12; guard += 1) { if (declared.has(cur.id)) return true; cur = objects.get(cur.in) || objects.get(cur.parent); } return false; };
            for (const spot of spots) { const [record] = nearestKept(spot.par); if (!record) continue; if (!declared.size || inside(record.id)) at.add(record.id); else also.add(record.id); }
            if (!spots.length && !at.size) continue;
            placed = true;
            const region = { id: location.id, type: location.type, name: location.name, at: [...at].sort(naturalCompare) };
            if (also.size) region.also = [...also].sort(naturalCompare);
            // a table named after a place in another system (Stanton2c_Belt "Yela asteroid belt" is also used at Pyro VI): the name is not this place's name
            const home = String(location.system || '').toLowerCase();
            if (home && home !== system.id && SYSTEMS.some((item) => item.id === home)) region.shared = home;
            const ringed = region.at.map((id) => objects.get(id)).find((object) => object.rings && ['star', 'planet', 'moon'].includes(object.kind));
            if (location.type === 'belt' && ringed) region.ring = { of: ringed.id, ...ringed.rings[0] }; // StarMapObject.asteroidRings of the body this belt's container sits on
            else if (location.type === 'belt' && spots.length > 1) {
                // no ring record in the game: the band is MEASURED from where the belt's own containers are placed (distance from the star)
                const radii = spots.map((spot) => Math.hypot(spot.p[0], spot.p[1])); const heights = spots.map((spot) => spot.p[2]);
                region.band = { derived: 1, n: spots.length, inner: Math.round(Math.min(...radii)), outer: Math.round(Math.max(...radii)), zMin: Math.round(Math.min(...heights)), zMax: Math.round(Math.max(...heights)) };
            } else if (location.type === 'belt') region.noShape = 1;
            regions[system.id].push(region);
            for (const id of [...region.at, ...(region.also || [])]) { const object = objects.get(id); if (!object.areas) object.areas = []; object.areas.push(location.id); }
        }
        if (!placed) regionProblems.push(location.id);
    }

    // ---- mission sites (MissionLocationTemplate -> where it is placed) ---------------------------
    const templateRecords = new Map(df.recordsOfType('MissionLocationTemplate').map((record) => [record.id, record]));
    const templateIds = new Map([...templateRecords].map(([guid, record]) => [guid, idOf(record)]));
    const wantedTemplates = new Set(missions.locations.map((location) => location.id));
    const sites = Object.fromEntries(SYSTEMS.map((system) => [system.id, {}]));
    const siteSystems = new Map(); // template id -> Set(system)
    const siteEntry = (system, id) => {
        if (!siteSystems.has(id)) siteSystems.set(id, new Set());
        siteSystems.get(id).add(system);
        if (!sites[system][id]) sites[system][id] = { at: new Set(), alt: new Map(), spots: new Map() };
        return sites[system][id];
    };
    let siteSpotsRead = 0;
    rows.forEach((row, index) => {
        for (const guid of row.t || []) {
            const id = templateIds.get(guid); if (!id || !wantedTemplates.has(id)) continue;
            siteSpotsRead += 1;
            const [record, at] = nearestKept(index); if (!record) continue;
            const entry = siteEntry(row.s, id); const object = objects.get(record.id);
            const distance = Math.hypot(...row.p.map((v, i) => v - rows[at].p[i]));
            const wide = ['star', 'planet', 'moon', 'lagrange'].includes(object.kind);
            if (!wide && distance <= SITE_NEAR_METRES) {
                if (at === internal.get(record.id)?.row) entry.at.add(record.id);
                else { // at another placement of that record: [id, index into that object's `more`]
                    const key = rows[at].p.map((v) => Math.round(v)).join(); const n = (object.more || []).findIndex((p) => p.join() === key);
                    if (n < 0) entry.at.add(record.id); else entry.alt.set(`${record.id} ${n}`, [record.id, n]);
                }
            } else {
                // its own coordinates: on / around a body, or far from the nearest map object
                const spot = [record.id, ...row.p.map((v) => Math.round(v))];
                const bodyRow = isBodyType(record) && rows[at].k === 'c' ? at : internal.get(record.id)?.bodyRow ?? -1;
                if (bodyRow >= 0 && rows[bodyRow].q) { // same cut-off as objects: body-fixed coordinates only near the body
                    const offset = row.p.map((v, i) => v - rows[bodyRow].p[i]);
                    if (Math.hypot(...offset) <= BODY_FRAME_RADII * (rows[bodyRow].planet?.radius || keptAtRow(bodyRow).size)) spot.push(...qrot(qconj(rows[bodyRow].q), offset).map((v) => Math.round(v)));
                }
                entry.spots.set(spot.slice(0, 4).join(), spot);
            }
        }
    });
    // Sites with no placement: the template's tags name a body (Tag = StarMapObject.locationHierarchyTag). Body level only.
    const tagBodies = new Map();
    for (const record of kept.values()) if (record.tag && ['Star', 'Planet', 'Moon'].includes(record.type)) { if (!tagBodies.has(record.tag)) tagBodies.set(record.tag, []); tagBodies.get(record.tag).push(record); }
    const depthRank = { Moon: 0, Planet: 1, Star: 2 };
    const templateByName = new Map([...templateRecords.values()].map((record) => [idOf(record), record]));
    const sitesUnresolved = []; let sitesByTag = 0;
    for (const location of missions.locations) {
        if (siteSystems.has(location.id)) continue;
        const record = templateByName.get(location.id);
        const tags = record ? (df.readRecord(record, 3).locationData?.generalTags?.tags || []).map((ref) => ref?.__record).filter(Boolean) : [];
        const bodies = tags.flatMap((tag) => tagBodies.get(tag) || []).sort((a, b) => depthRank[a.type] - depthRank[b.type]);
        const best = bodies.filter((body) => depthRank[body.type] === depthRank[bodies[0]?.type]);
        if (!best.length) { sitesUnresolved.push(location.id); continue; }
        sitesByTag += 1;
        for (const body of best) { const entry = siteEntry(body.system, location.id); if (!entry.near) entry.near = new Set(); entry.near.add(body.id); }
    }
    const siteOut = (entry) => prune({ at: [...entry.at].sort(naturalCompare), alt: [...entry.alt.values()].sort((a, b) => naturalCompare(a[0], b[0]) || a[1] - b[1]), spots: [...entry.spots.values()].sort((a, b) => naturalCompare(a[0], b[0]) || a[1] - b[1] || a[2] - b[2] || a[3] - b[3]), near: entry.near ? [...entry.near].sort(naturalCompare) : undefined, via: entry.near ? 'tag' : undefined });

    // ---- order: tree order, children sorted by kind then id --------------------------------------
    const childrenOf = new Map();
    for (const object of objects.values()) { const key = object.parent || ''; if (!childrenOf.has(key)) childrenOf.set(key, []); childrenOf.get(key).push(object); }
    const kindRank = (object) => KIND_ORDER.indexOf(object.kind);
    const ordered = (rootId) => { const out = []; const visit = (object) => { out.push(object); for (const child of (childrenOf.get(object.id) || []).sort((a, b) => kindRank(a) - kindRank(b) || naturalCompare(a.id, b.id))) visit(child); }; visit(objects.get(rootId)); return out; };

    // ---- output --------------------------------------------------------------------------------
    const version = `${build.Branch || ''}.${build.RequestedP4ChangeNum || ''}`.replace(/^sc-alpha-/, '');
    const head = { schema: SCHEMA, version, gameVersion: build.Version, source: 'game-files', sourceHash: sha(dcb), koSource: ko ? 'korean-patch' : undefined };
    const systemFiles = {}; const systemSummaries = [];
    for (const system of SYSTEMS) {
        const list = ordered(system.star).map((object) => prune(object));
        const star = objects.get(system.star); const starRow = rows[internal.get(system.star).row];
        const solar = [...solarSystems.values()].find((item) => item.name === system.record);
        const counts = { objects: list.length, positioned: list.filter((object) => object.pos).length, noPosition: list.filter((object) => object.nopos).length, hidden: list.filter((object) => object.h).length, noName: list.filter((object) => object.noName).length, byKind: Object.fromEntries(KIND_ORDER.map((kind) => [kind, list.filter((object) => object.kind === kind).length]).filter(([, n]) => n)) };
        const reach = Math.max(...list.filter((object) => object.pos).map((object) => Math.hypot(...object.pos)));
        const frame = prune({ origin: system.star, rootRotation: starRow.q.some((v, i) => Math.abs(v - [1, 0, 0, 0][i]) > 1e-9) ? starRow.q.map((v) => round(v, 6)) : undefined });
        systemFiles[system.id] = {
            ...head, system: system.id, name: star.name, star: system.star, frame,
            objects: list, jumps: jumps[system.id].sort((a, b) => naturalCompare(a.id, b.id)), regions: regions[system.id].sort((a, b) => naturalCompare(a.id, b.id)),
            sites: Object.fromEntries(Object.keys(sites[system.id]).sort(naturalCompare).map((id) => [id, siteOut(sites[system.id][id])])),
        };
        systemSummaries.push(prune({ id: system.id, name: star.name, star: system.star, file: `data/starmap/${system.id}.json`, counts, reachM: Math.round(reach), galactic: solar?.galactic ? [solar.galactic.x, solar.galactic.y, solar.galactic.z].map((v) => round(v, 4)) : undefined, frame }));
    }

    // coverage: every key of the other screens, resolved or listed
    const has = (id) => objects.has(id); const positioned = (id) => Boolean(objects.get(id)?.pos);
    const cover = (ids) => { const list = [...new Set(ids)]; return { total: list.length, onMap: list.filter(has).length, withPosition: list.filter(positioned).length, noPosition: list.filter((id) => has(id) && !positioned(id)).sort(naturalCompare), missing: list.filter((id) => !has(id)).sort(naturalCompare) }; };
    const regionIds = new Set(SYSTEMS.flatMap((system) => regions[system.id].map((region) => region.id)));
    const solarAlias = Object.fromEntries([...solarSystems.values()].filter((item) => item.starMapRecord && systemByRecord(item.name)).map((item) => [item.starMapRecord, SYSTEMS.find((system) => system.record === item.name).star]));
    const missionPlaces = cover(Object.keys(missions.places || {}));
    missionPlaces.alias = Object.fromEntries(missionPlaces.missing.filter((id) => solarAlias[id]).map((id) => [id, solarAlias[id]]));
    missionPlaces.missing = missionPlaces.missing.filter((id) => !solarAlias[id]);
    const miningAreas = mining.locations.filter((location) => location.kind === 'area').map((location) => location.id);
    const coverage = {
        tradeLocations: cover(world.locations.map((location) => location.id)),
        tradeBodies: cover(world.bodies.map((body) => body.id)),
        uexTerminals: { ...cover(Object.values(world.joins?.terminals?.map || {})), uexTotal: world.joins?.terminals?.total, uexMatchedInWorld: world.joins?.terminals?.matched, terminalIds: Object.keys(world.joins?.terminals?.map || {}).length },
        uexRefineryTerminals: { ...cover(Object.values(world.joins?.refineries?.map || {})), terminalIds: Object.keys(world.joins?.refineries?.map || {}).length },
        refineries: cover(helper.refineries.map((refinery) => refinery.id)),
        miningBodies: cover(mining.locations.filter((location) => location.kind === 'body').map((location) => location.id)),
        miningPlaces: cover((helper.places || []).map((place) => place.id)),
        miningAreas: { total: miningAreas.length, asRegion: miningAreas.filter((id) => regionIds.has(id)).length, missing: miningAreas.filter((id) => !regionIds.has(id)).sort(naturalCompare) },
        missionPlaces,
        missionSites: { total: missions.locations.length, placed: missions.locations.filter((location) => siteSystems.has(location.id) && SYSTEMS.some((system) => { const entry = sites[system.id][location.id]; return entry && (entry.at.size || entry.alt.size || entry.spots.size); })).length, byTagOnly: sitesByTag, unresolved: sitesUnresolved.sort(naturalCompare), placementsRead: siteSpotsRead },
    };
    const kinds = Object.fromEntries(KIND_ORDER.map((kind) => { const label = KIND_LABELS[kind]; return [kind, label.key ? { name: names(label.key) } : { name: label.own, own: 1 }]; }));
    const typesUsed = new Set([...kept.values()].map((record) => record.type));
    const types = Object.fromEntries([...typeById.values()].filter((type) => typesUsed.has(type.name)).sort((a, b) => naturalCompare(a.name, b.name)).map((type) => [type.name, prune({ kind: kindOf('', type.name), name: names(type.classification), surface: type.onParentSurface ? 1 : undefined, qt: type.validQuantumTravelDestination ? 1 : undefined, marker: short(type.markerConfig) })]));
    const lawsUsed = new Set([...objects.values()].map((object) => object.law).filter(Boolean));
    // the stars' own star-map material: no texture, one flat colour (Material.Diffuse, linear RGB). Written only when all stars agree.
    const starColours = [...new Set(SYSTEMS.map((system) => walked.materials[byId.get(system.star).material]?.diffuse))];
    const starMaterial = starColours.length === 1 && starColours[0] ? { diffuse: starColours[0] } : null;
    const sizeOf = (data) => { const text = `${JSON.stringify(data)}\n`; return { raw: Buffer.byteLength(text), gzip: zlib.gzipSync(text, { level: 9 }).length }; };
    const index = {
        ...head, builtAt: new Date().toISOString(),
        positionsSource: 'Data.p4k ObjectContainers/PU/system/*system.socpak + every referenced container',
        joinedWith: { 'data/trade/world.json': world.sourceHash, 'data/mining/helper.json': helper.sourceHash, 'data/mining/mining.json': mining.sourceHash, 'data/contracts/missions.json': missions.sourceHash },
        assetVersion: null, texturesIndex: 'data/starmap/textures.json',
        units: { pos: 'm, system frame, star at 0,0,0', rel: 'm, body-fixed frame of `body`', geo: '[lat deg, lon deg, alt m] (zero meridian is our convention)', r: 'm', qt: '[obstruction, arrival, adoption] m', rings: 'm', phys: 'raw file numbers; units not stated in the files' },
        systems: systemSummaries.map((summary) => ({ ...summary, bytes: sizeOf(systemFiles[summary.id]) })),
        kinds, types, amenities, laws: Object.fromEntries(Object.entries(laws).filter(([id]) => lawsUsed.has(id))),
        starColor: starMaterial ? { linearRgb: starMaterial.diffuse.split(',').map((v) => round(Number(v), 4)), note: 'star-map star material (Hologram shader); the same flat colour for all three stars, no texture' } : undefined,
        links,
        // which system file(s) hold a mining region / a mission site (object ids carry their system in the other screens' data)
        regionSystems: Object.fromEntries([...regionIds].sort(naturalCompare).map((id) => [id, SYSTEMS.filter((system) => regions[system.id].some((region) => region.id === id)).map((system) => system.id)])),
        siteSystems: Object.fromEntries([...siteSystems.keys()].sort(naturalCompare).map((id) => [id, SYSTEMS.filter((system) => siteSystems.get(id).has(system.id)).map((system) => system.id)])),
        dropped, coverage,
        checks: prune({
            records: smo.size, kept: kept.size, walk: walked.stats, containersMissing: walked.missing,
            placementsInAnotherSystem: foreignPlacements, starMapGuidsNotInDatabase: unknownGuids.size,
            multiPlaced: [...objects.values()].filter((object) => object.more).length,
            restStopGuess: guessCheck, unplacedStations: [...unplacedStations].sort(naturalCompare), regionTablesNotPlaced: regionProblems,
            textures: { own: [...objects.values()].filter((object) => object.tex).length, ...Object.fromEntries(['star', 'borrowed', 'none'].map((why) => [why, [...objects.values()].filter((object) => object.texNone === why).map((object) => object.id)])), materialFilesMissing: Object.entries(walked.materials).filter(([, material]) => !material.found).map(([path]) => path) },
        }),
    };

    // ---- consistency (fail the build rather than ship something wrong) ---------------------------
    for (const system of SYSTEMS) {
        const ids = new Set(systemFiles[system.id].objects.map((object) => object.id));
        if (ids.size !== systemFiles[system.id].objects.length) throw new Error(`${system.id}: duplicate ids`);
        for (const object of systemFiles[system.id].objects) {
            for (const key of ['parent', 'in', 'body']) if (object[key] && !ids.has(object[key])) throw new Error(`${system.id}: ${object.id}.${key} -> ${object[key]} is not in the file`);
            if (object.pos && object.nopos) throw new Error(`${object.id}: pos and nopos`);
        }
    }
    const total = SYSTEMS.reduce((sum, system) => sum + systemFiles[system.id].objects.length, 0);
    if (total !== kept.size) throw new Error(`kept ${kept.size} records but wrote ${total}`);

    const strip = (data) => { const copy = { ...data }; delete copy.builtAt; return JSON.stringify(copy); };
    const targets = [['data/starmap/index.json', index], ...SYSTEMS.map((system) => [`data/starmap/${system.id}.json`, systemFiles[system.id]])];
    // the small list the other screens read to decide whether a place gets a "지도에서 보기" link (derived from the files above)
    const linkIndex = buildLinkIndex(index, systemFiles);
    if (CHECK) {
        let different = false;
        for (const [path, data] of targets) { const file = resolve(ROOT, path); const same = existsSync(file) && strip(readJson(file)) === strip(data); console.log(`${same ? 'same' : 'DIFFERENT'}: ${path}`); if (!same) different = true; }
        const linksSame = existsSync(resolve(ROOT, LINKS_PATH)) && readFileSync(resolve(ROOT, LINKS_PATH), 'utf8') === `${JSON.stringify(linkIndex)}
`;
        console.log(`${linksSame ? 'same' : 'DIFFERENT'}: ${LINKS_PATH}`);
        process.exit(different || !linksSame ? 1 : 0);
    }
    mkdirSync(resolve(ROOT, 'data/starmap'), { recursive: true });
    for (const [path, data] of targets) {
        const file = resolve(ROOT, path);
        if (existsSync(file) && strip(readJson(file)) === strip(data)) { console.log(`${path}: unchanged`); continue; } // keeps builtAt stable when nothing changed
        const text = `${JSON.stringify(data)}\n`; writeFileSync(file, text);
        console.log(`${path}: ${Buffer.byteLength(text)} bytes raw, ${zlib.gzipSync(text, { level: 9 }).length} bytes gzip`);
    }
    console.log(`${LINKS_PATH}: ${writeLinkIndex(linkIndex)}`);
    console.log(`records ${smo.size}, kept ${kept.size}, dropped ${JSON.stringify(dropped)}`);
    for (const summary of index.systems) console.log(`${summary.id}: ${summary.counts.objects} objects (${summary.counts.positioned} with position, ${summary.counts.noPosition} without, ${summary.counts.hidden} hidden), ${summary.bytes.raw} bytes raw / ${summary.bytes.gzip} gzip`);
    console.log(`jump links ${links.length}; mission sites placed ${coverage.missionSites.placed}/${coverage.missionSites.total} (+${coverage.missionSites.byTagOnly} by tag, ${coverage.missionSites.unresolved.length} unresolved); trade ${coverage.tradeLocations.onMap}/${coverage.tradeLocations.total}; mining areas ${coverage.miningAreas.asRegion}/${coverage.miningAreas.total}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
