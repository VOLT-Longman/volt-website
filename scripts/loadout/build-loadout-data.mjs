#!/usr/bin/env node
/**
 * 로드아웃 편집기용 자료 생성.
 *
 * Erkul Games LIVE 카탈로그(함선 장착 자리 + 부품 수치)를 받아 화면이 쓰는 작은 JSON으로 줄인다.
 *   data/loadout/meta.json            원본 버전·생성 시각·개수
 *   data/loadout/items.json           부품 사전 (id → 수치)
 *   data/loadout/index.json           함선 목록 (선택 상자용)
 *   data/loadout/ships/<class>.json   함선별 장착 자리 트리
 *
 * 사용: node scripts/loadout/build-loadout-data.mjs [--cache-dir <폴더>]
 *   --cache-dir: 내려받은 원본을 그 폴더에 저장·재사용한다(개발용). 지정하지 않으면 매번 내려받는다.
 * 구매처·가격은 여기서 굽지 않는다 — 화면이 UEX 프록시(/api/uex/items*)로 그때그때 조회한다.
 */
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = resolve(ROOT, 'data/loadout');
const BASE = 'https://cdn.erkul.games/LIVE/';
const calc = createRequire(import.meta.url)(resolve(ROOT, 'js/loadout-calc.js'));
const cacheArg = process.argv.indexOf('--cache-dir');
const CACHE = cacheArg > -1 ? resolve(process.argv[cacheArg + 1]) : null;
if (CACHE) mkdirSync(CACHE, { recursive: true });

async function readBin(path, sha256) {
    if (typeof path !== 'string' || !/^[a-zA-Z0-9_./-]+\.bin$/.test(path) || path.includes('..')) throw new Error(`Invalid catalog path: ${path}`);
    const cacheFile = CACHE ? resolve(CACHE, `${path.replace(/[^a-zA-Z0-9_.-]/g, '_')}.json`) : null;
    if (cacheFile && existsSync(cacheFile)) return JSON.parse(readFileSync(cacheFile, 'utf8'));
    const response = await fetch(BASE + path, { signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error(`Erkul catalog HTTP ${response.status}: ${path}`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (sha256 && createHash('sha256').update(bytes).digest('hex') !== sha256) throw new Error(`Erkul catalog hash mismatch: ${path}`);
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    const json = JSON.parse(await new Response(stream).text());
    if (cacheFile) writeFileSync(cacheFile, JSON.stringify(json));
    return json;
}

// 편집기에 싣는 부품 묶음. 도색·비행 블레이드·제조사 목록은 제외한다.
const FAMILIES = ['weapons', 'rocketpods', 'shields', 'powerplants', 'coolers', 'quantumdrives', 'jumpdrives', 'missiles', 'bombs',
    'missileracks', 'turrets', 'mounts', 'radars', 'mininglasers', 'emps', 'qeds', 'salvageheads', 'tractorbeams', 'modules', 'utilities'];
// 장착 자리 트리에 남길 부품 종류(문·좌석·추진기·연료 탱크 등 편집과 무관한 것은 버린다).
const RELEVANT_TYPES = new Set(['WeaponGun', 'Turret', 'TurretBase', 'MissileLauncher', 'BombLauncher', 'Missile', 'Bomb', 'Shield', 'PowerPlant',
    'Cooler', 'QuantumDrive', 'JumpDrive', 'Radar', 'WeaponMining', 'WeaponDefensive', 'EMP', 'QuantumInterdictionGenerator', 'SalvageHead',
    'TractorBeam', 'ToolArm', 'Module', 'UtilityTurret', 'MiningModifier', 'SalvageModifier', 'TowingBeam', 'SpaceMine']);
const DAMAGE_KEYS = ['physical', 'energy', 'distortion', 'thermal', 'biochemical', 'stun'];

const round = (value, digits = 4) => (Number.isFinite(Number(value)) ? Number(Number(value).toFixed(digits)) : undefined);
const compactDamage = (damage) => {
    const out = {};
    for (const key of DAMAGE_KEYS) if (Number(damage?.[key])) out[key] = round(damage[key]);
    return Object.keys(out).length ? out : undefined;
};
const prune = (object) => {
    for (const key of Object.keys(object)) {
        const value = object[key];
        if (value === undefined || value === null || value === '' || (Array.isArray(value) && !value.length)
            || (typeof value === 'object' && !Array.isArray(value) && !Object.keys(prune(value)).length)) delete object[key];
    }
    return object;
};

function resourceFlows(item) {
    const totals = { power: { use: 0, gen: 0 }, cool: { use: 0, gen: 0 } };
    const state = (item.resource?.states || []).find((entry) => entry.name === 'Online') || item.resource?.states?.[0];
    for (const flow of state?.flows || []) {
        for (const entry of flow.consumes || []) {
            if (entry.resource === 'Power') totals.power.use += Number(entry.units) || 0;
            if (entry.resource === 'Coolant') totals.cool.use += Number(entry.units) || 0;
        }
        for (const entry of flow.produces || []) {
            if (entry.resource === 'Power') totals.power.gen += Number(entry.units) || 0;
            if (entry.resource === 'Coolant') totals.cool.gen += Number(entry.units) || 0;
        }
    }
    return { power: totals.power, cool: totals.cool, em: state?.signature?.em?.nominal, ir: state?.signature?.ir?.nominal };
}

function compactPorts(ports) {
    return (ports || []).map((port) => prune({
        name: port.name, min: port.minSize, max: port.maxSize,
        acc: (port.accepts || []).map((rule) => prune({ type: rule.type, subs: rule.subTypes })),
        ed: port.flags?.uneditable ? false : undefined,
    }));
}

function compactAction(action) {
    return prune({
        kind: action.kind, rpm: round(action.fireRate, 2), pellets: action.pelletCount > 1 ? action.pelletCount : undefined,
        mult: action.damageMultiplier !== 1 ? round(action.damageMultiplier) : undefined,
        charge: round(action.chargeTime), cooldown: round(action.cooldownTime), shots: action.shotCount,
        beamDps: compactDamage(action.damagePerSecond),
    });
}

function compactWeapon(body) {
    const actions = body?.fireActions || [];
    const action = actions[0];
    const ammo = body?.ammo;
    if (!action) return undefined;
    return prune({
        ...compactAction(action),
        // 발사 방식이 여럿인 무기는 첫 번째(기본) 방식만 싣는다. 나머지는 대부분 선택형 사격 모드라
        // 함께 더하면 화력이 2~3배로 부풀려진다(225척 중 68척만 원본과 일치 → 기본 방식만 쓰면 200척 이상).
        modes: actions.length > 1 ? actions.length : undefined,
        fullRange: round(action.fullDamageRange, 0), zeroRange: round(action.zeroDamageRange, 0),
        speed: round(ammo?.speed, 1), life: round(ammo?.lifetime, 2), dmg: compactDamage(ammo?.damage),
        ammo: ammo?.maxAmmoCount || undefined,
        regen: body.regen ? prune({ load: body.regen.maxAmmoLoad, perSec: round(body.regen.maxRegenPerSec, 2), cd: round(body.regen.regenerationCooldown, 2) }) : undefined,
    });
}

function compactItem(item, manufacturers) {
    const flows = resourceFlows(item);
    const weaponBody = item.weapon || item.rocket || item.mining;
    const range = (pair) => [round(pair?.min, 3) || 0, round(pair?.max, 3) || 0];
    const mapPairs = (table) => {
        if (!table) return undefined;
        const out = {};
        for (const key of DAMAGE_KEYS) if (table[key] && (table[key].min || table[key].max)) out[key] = range(table[key]);
        return out;
    };
    return prune({
        cls: item.className,
        cat: String(item.category || '').replace(/^Assembled/, '') || item.type,
        type: item.type, sub: item.subType, size: item.size, grade: item.grade,
        klass: item.i18n?.class, dtype: item.i18n?.displayType,
        name: item.i18n?.name || item.i18n?.shortName || item.className, short: item.i18n?.shortName,
        desc: item.i18n?.description,
        mfr: manufacturers.get(String(item.manufacturer?.className || '').toLowerCase()),
        mfrCode: String(item.manufacturer?.className || '').toUpperCase() || undefined,
        hp: item.health?.hp, mass: item.mass, tags: item.tags, req: item.requiredTags,
        power: flows.power, cool: flows.cool, em: round(flows.em, 0), ir: round(flows.ir, 0),
        wclass: item.weaponType ? `${item.weaponType.class || ''} ${item.weaponType.form || ''}`.trim() : undefined,
        w: item.weapon || item.rocket ? compactWeapon(weaponBody) : undefined,
        sh: item.shield ? {
            hp: item.shield.maxShieldHealth, regen: round(item.shield.maxShieldRegen, 1),
            downDelay: round(item.shield.downedRegenDelay, 2), dmgDelay: round(item.shield.damagedRegenDelay, 2),
            res: mapPairs(item.shield.resistance), abs: mapPairs(item.shield.absorption),
        } : undefined,
        qd: item.qdrive ? {
            speed: item.qdrive.params?.driveSpeed, spool: round(item.qdrive.params?.spoolUpTime, 2), cool: round(item.qdrive.params?.cooldownTime, 2),
            fuel: item.qdrive.quantumFuelRequirement, s1: item.qdrive.params?.stageOneAccelRate, s2: item.qdrive.params?.stageTwoAccelRate,
        } : undefined,
        ms: item.missile || item.bomb ? {
            dmg: compactDamage((item.missile || item.bomb).damage),
            speed: round((item.missile || item.bomb).gcs?.linearSpeed, 0),
            signal: (item.missile || item.bomb).targeting?.trackingSignalType,
            lock: round((item.missile || item.bomb).targeting?.lockTime, 2),
            rangeMin: round((item.missile || item.bomb).targeting?.lockRangeMin, 0),
            rangeMax: round((item.missile || item.bomb).targeting?.lockRangeMax, 0),
        } : undefined,
        emp: item.emp ? { dmg: item.emp.distortionDamage, radius: item.emp.empRadius, charge: item.emp.chargeTime, cooldown: item.emp.cooldownTime } : undefined,
        qed: item.jammer ? { range: item.jammer.rangeMeters } : undefined,
        ports: compactPorts(item.ports),
    });
}

function isRelevant(item) {
    return Boolean(item) && RELEVANT_TYPES.has(item.type);
}

function buildSlots(slots, hardpointsByName, items, extra, manufacturers) {
    const out = [];
    for (const slot of slots || []) {
        const item = slot.item;
        const hardpoint = slot.hardpoint || hardpointsByName.get(slot.portName);
        const children = buildSlots(slot.children, hardpointsByName, items, extra, manufacturers);
        const accepts = (hardpoint?.accepts || []).filter((rule) => RELEVANT_TYPES.has(rule.type));
        if (!isRelevant(item) && !children.length && !(slot.kind === 'swappable' && accepts.length)) continue;
        if (item?.ref && !items[item.ref] && !extra[item.ref]) extra[item.ref] = compactItem(item, manufacturers);
        out.push(prune({
            port: slot.portName, kind: slot.kind === 'swappable' ? 's' : 'f',
            min: hardpoint?.minSize, max: hardpoint?.maxSize,
            acc: (hardpoint?.accepts || []).map((rule) => prune({ type: rule.type, subs: rule.subTypes })),
            item: item?.ref, ch: children,
        }));
    }
    return out;
}

function voltIdMap() {
    const text = readFileSync(resolve(ROOT, 'data/ship-live-stats.js'), 'utf8');
    const marker = 'window.VOLT_SHIP_LIVE_STATS = ';
    const stats = JSON.parse(text.slice(text.indexOf(marker) + marker.length).trim().replace(/;$/, ''));
    return new Map(Object.entries(stats).map(([id, row]) => [String(row.erkulLocalName || '').toLowerCase(), id]));
}

async function main() {
    const manifest = await readBin('catalog.bin');
    if (manifest.schemaVersion !== 8 || manifest.branch !== 'LIVE') throw new Error('Unsupported Erkul LIVE catalog schema');
    const families = {};
    for (const family of manifest.families) {
        if (family.kind === 'manufacturers' || FAMILIES.includes(family.kind)) families[family.kind] = await readBin(family.path, family.sha256);
    }
    const manufacturers = new Map((families.manufacturers || []).map((row) => [String(row.className || '').toLowerCase(), row.i18n?.name || row.code]));

    const items = {};
    for (const kind of FAMILIES) for (const item of families[kind] || []) if (item.ref) items[item.ref] = compactItem(item, manufacturers);

    const index = await readBin(manifest.singles.find((single) => single.kind === 'index').path);
    const indexByRef = new Map(index.ships.map((ship) => [ship.ref, ship]));
    const voltIds = voltIdMap();
    const shipList = [];
    const shipFiles = new Map();
    const validation = { ships: 0, dpsMatch: 0, mismatches: [] };
    for (const group of manifest.groups) {
        if (!['ships', 'groundvehicles'].includes(group.kind)) continue;
        const groupIndex = await readBin(group.indexPath, group.indexSha256);
        for (let offset = 0; offset < groupIndex.blobs.length; offset += 6) {
            const batch = await Promise.all(groupIndex.blobs.slice(offset, offset + 6).map((blob) => readBin(blob.path, blob.sha256)));
            for (const full of batch) {
                const meta = indexByRef.get(full.ref);
                if (!meta) continue;
                const hardpoints = new Map((full.vehicle?.hardpoints || []).map((port) => [port.name, port]));
                const extra = {};
                const slots = buildSlots(full.slots, hardpoints, items, extra, manufacturers);
                const p = full.precomputed || {};
                const ship = prune({
                    cls: full.className, ref: full.ref, name: meta.name, mfr: meta.manufacturerName, size: meta.size, role: meta.role,
                    volt: voltIds.get(String(full.className).toLowerCase()), ground: group.kind === 'groundvehicles' ? true : undefined,
                    tags: full.vehicle?.itemPortTags,
                    base: {
                        hp: p.hp?.total, cargo: p.cargo, scm: p.flight?.scmSpeed, max: p.flight?.maxSpeed,
                        qtFuel: p.fuel?.quantumCapacity, h2Fuel: p.fuel?.hydrogenCapacity, crew: meta.crewSize,
                        refDps: p.dps?.burst, refRangeGm: p.quantum?.rangeGm,
                    },
                    slots, extra,
                });
                shipFiles.set(full.className, ship);
                shipList.push(prune({ cls: full.className, name: meta.name, mfr: meta.manufacturerName, size: meta.size, role: meta.role, volt: ship.volt, ground: ship.ground }));
                // 계산식 검증: 기본 장착 화력을 원본의 미리 계산된 값과 비교한다.
                const totals = calc.summarize(ship, items, {});
                validation.ships += 1;
                const reference = Number(p.dps?.burst) || 0;
                if (Math.abs(totals.dps.total - reference) <= Math.max(2, reference * 0.01)) validation.dpsMatch += 1;
                else validation.mismatches.push({ cls: full.className, ours: Math.round(totals.dps.total), reference });
            }
        }
    }
    shipList.sort((a, b) => a.name.localeCompare(b.name));

    rmSync(resolve(OUT, 'ships'), { recursive: true, force: true });
    mkdirSync(resolve(OUT, 'ships'), { recursive: true });
    const write = (file, value) => writeFileSync(resolve(OUT, file), `${JSON.stringify(value)}\n`);
    write('items.json', { version: manifest.dataVersion, items });
    write('index.json', { version: manifest.dataVersion, ships: shipList });
    for (const [cls, ship] of shipFiles) write(`ships/${cls}.json`, ship);
    const meta = {
        source: 'erkul-live', sourceName: 'Erkul Games', sourceUrl: 'https://www.erkul.games/',
        priceSource: 'UEX', priceSourceUrl: 'https://uexcorp.space/',
        version: manifest.dataVersion, generatedAt: manifest.generatedAt, builtAt: new Date().toISOString(),
        counts: { items: Object.keys(items).length, ships: shipList.length },
        validation: { ships: validation.ships, dpsMatch: validation.dpsMatch, mismatches: validation.mismatches.sort((a, b) => a.cls.localeCompare(b.cls)) },
    };
    writeFileSync(resolve(OUT, 'meta.json'), `${JSON.stringify(meta, null, 2)}\n`);
    const bytes = (file) => readFileSync(resolve(OUT, file)).length;
    const shipBytes = readdirSync(resolve(OUT, 'ships')).reduce((total, file) => total + bytes(`ships/${file}`), 0);
    console.log(`Erkul ${manifest.dataVersion}: 부품 ${meta.counts.items}종, 함선 ${meta.counts.ships}척`);
    console.log(`크기: items ${Math.round(bytes('items.json') / 1024)}KB, index ${Math.round(bytes('index.json') / 1024)}KB, ships ${Math.round(shipBytes / 1024)}KB (${shipFiles.size} files)`);
    console.log(`기본 장착 화력 일치(±1%): ${validation.dpsMatch}/${validation.ships}`);
    for (const row of meta.validation.mismatches.slice(0, 40)) console.log(`  불일치 ${row.cls}: 계산 ${row.ours} / 원본 ${row.reference}`);
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
