#!/usr/bin/env node
/**
 * 로드아웃 편집기용 자료 생성 — 설치된 게임 파일에서 직접 뽑는다.
 *
 * 입력: Star Citizen 설치 폴더의 Data.p4k (읽기 전용)
 *   - Data\Game2.dcb                부품·함선·탄약 정의 (scripts/gamedata/dataforge.mjs)
 *   - Data\Scripts\Entities\Vehicles\Implementations\Xml\*.xml   함선 장착 자리
 *   - Data\Localization\english\global.ini                        이름 원문
 * 출력: data/loadout/{meta,index,items}.json, data/loadout/ships/<class>.json
 *
 * 사용: node scripts/loadout/build-loadout-data.mjs [--p4k <Data.p4k 경로>] [--cache-dir <폴더>]
 *   --cache-dir: 꺼낸 Game2.dcb 등을 그 폴더에 저장·재사용한다(개발용. 148GB 묶음을 매번 읽지 않게).
 * 외부 서비스에 접근하지 않는다(네트워크 호출 없음). 구매처·가격은 화면이 UEX 프록시로 따로 조회한다.
 */
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DataForge } from '../gamedata/dataforge.mjs';
import { P4k, parseCryXml } from '../gamedata/p4k.mjs';
import { isExcludedShip } from '../../functions/_shared/ship-catalog-policy.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = resolve(ROOT, 'data/loadout');
const calc = createRequire(import.meta.url)(resolve(ROOT, 'js/loadout-calc.js'));
const arg = (name, fallback) => { const index = process.argv.indexOf(name); return index > -1 ? process.argv[index + 1] : fallback; };
const P4K_PATH = arg('--p4k', 'C:/Program Files/Roberts Space Industries/StarCitizen/LIVE/Data.p4k');
const CACHE = arg('--cache-dir', null);

// ---- 게임 파일 읽기 ---------------------------------------------------------
function loadGameFiles() {
    const cached = (name) => (CACHE ? resolve(CACHE, name) : null);
    const vehicleDir = cached('vehicles');
    if (CACHE && existsSync(cached('Game2.dcb')) && existsSync(cached('global.ini')) && existsSync(vehicleDir) && existsSync(cached('build.json'))) {
        const xml = new Map(readdirSync(vehicleDir).map((file) => [file.toLowerCase(), readFileSync(resolve(vehicleDir, file))]));
        return { dcb: readFileSync(cached('Game2.dcb')), ini: readFileSync(cached('global.ini'), 'utf8'), xml, build: JSON.parse(readFileSync(cached('build.json'), 'utf8')) };
    }
    const p4k = new P4k(P4K_PATH);
    const wanted = p4k.find((name) => /^Data\\Game2\.dcb$/i.test(name) || /^Data\\Localization\\english\\global\.ini$/i.test(name)
        || /^Data\\Scripts\\Entities\\Vehicles\\Implementations\\Xml\\[^\\]+\.xml$/i.test(name));
    const pick = (pattern) => wanted.find((entry) => pattern.test(entry.name));
    const dcb = p4k.extract(pick(/Game2\.dcb$/i));
    const ini = p4k.extract(pick(/global\.ini$/i)).toString('utf8');
    const xml = new Map();
    for (const entry of wanted) if (/\.xml$/i.test(entry.name)) xml.set(entry.name.split('\\').pop().toLowerCase(), p4k.extract(entry));
    p4k.close();
    let build = {};
    try { build = JSON.parse(readFileSync(resolve(dirname(P4K_PATH), 'build_manifest.id'), 'utf8')).Data || {}; } catch (_error) { /* 버전 표기만 비운다 */ }
    if (CACHE) {
        mkdirSync(vehicleDir, { recursive: true });
        writeFileSync(cached('Game2.dcb'), dcb); writeFileSync(cached('global.ini'), ini); writeFileSync(cached('build.json'), JSON.stringify(build));
        for (const [file, buffer] of xml) writeFileSync(resolve(vehicleDir, file), buffer);
    }
    return { dcb, ini, xml, build };
}

// ---- 공용 도우미 ------------------------------------------------------------
const RELEVANT_TYPES = new Set(['WeaponGun', 'Turret', 'TurretBase', 'MissileLauncher', 'BombLauncher', 'GroundVehicleMissileLauncher', 'Missile', 'Bomb', 'Shield', 'PowerPlant',
    'Cooler', 'QuantumDrive', 'JumpDrive', 'Radar', 'WeaponMining', 'WeaponDefensive', 'EMP', 'QuantumInterdictionGenerator', 'SalvageHead',
    'TractorBeam', 'ToolArm', 'Module', 'UtilityTurret', 'MiningModifier', 'SalvageModifier', 'TowingBeam']);
const DAMAGE_FIELDS = [['physical', 'DamagePhysical'], ['energy', 'DamageEnergy'], ['distortion', 'DamageDistortion'], ['thermal', 'DamageThermal'], ['biochemical', 'DamageBiochemical'], ['stun', 'DamageStun']];
const DAMAGE_KEYS = DAMAGE_FIELDS.map(([key]) => key);
const GRADES = ['', 'A', 'B', 'C', 'D', 'E', 'F'];
const round = (value, digits = 4) => (Number.isFinite(Number(value)) ? Number(Number(value).toFixed(digits)) : undefined);
const prune = (object) => {
    for (const key of Object.keys(object)) {
        const value = object[key];
        if (value === undefined || value === null || value === '' || (Array.isArray(value) && !value.length)
            || (typeof value === 'object' && !Array.isArray(value) && !Object.keys(prune(value)).length)) delete object[key];
    }
    return object;
};
const damageOf = (info) => {
    const out = {};
    for (const [key, field] of DAMAGE_FIELDS) if (Number(info?.[field])) out[key] = round(info[field]);
    return Object.keys(out).length ? out : undefined;
};
const component = (entity, type) => (entity?.Components || []).find((entry) => entry && entry.__type === type);
const tagList = (value) => String(value || '').split(/\s+/).filter(Boolean);

function main() {
    const game = loadGameFiles();
    const df = new DataForge(game.dcb);
    if (!df.consistent) throw new Error('DataForge layout mismatch — 게임 파일 형식이 바뀌었을 수 있습니다.');

    const strings = new Map();
    for (const line of game.ini.replace(/^\uFEFF/, '').split(/\r?\n/)) {
        const index = line.indexOf('=');
        if (index > 0) strings.set(line.slice(0, index).trim().toLowerCase(), line.slice(index + 1).trim());
    }
    const localize = (key) => {
        const value = strings.get(String(key || '').replace(/^@/, '').toLowerCase());
        return value && !/^@|^<=|PLACEHOLDER/i.test(value) ? value.replace(/\\n/g, '\n').trim() : '';
    };

    const entityRecords = df.recordsOfType('EntityClassDefinition');
    const classOf = (record) => record.name.replace(/^EntityClassDefinition\./, '');
    const recordByClass = new Map(entityRecords.map((record) => [classOf(record).toLowerCase(), record]));
    const entityCache = new Map();
    const entityOf = (record) => {
        if (!record) return null;
        if (!entityCache.has(record.id)) entityCache.set(record.id, df.readRecord(record, 9));
        return entityCache.get(record.id);
    };
    const followRecord = (reference, depth = 8) => {
        const record = reference?.__record ? df.recordById.get(reference.__record) : null;
        return record ? df.readRecord(record, depth) : null;
    };
    const manufacturerCache = new Map();
    const manufacturerOf = (reference) => {
        if (!reference?.__record) return {};
        if (!manufacturerCache.has(reference.__record)) {
            const data = followRecord(reference, 3);
            const code = String(reference.name || '').replace(/^SCItemManufacturer\./, '');
            manufacturerCache.set(reference.__record, { code: code.toUpperCase(), name: localize(data?.Localization?.Name) || code });
        }
        return manufacturerCache.get(reference.__record);
    };

    // ---- 부품 ---------------------------------------------------------------
    function compactAction(action) {
        if (!action) return null;
        if (action.__type === 'SWeaponActionSequenceParams') {
            const entry = action.sequenceEntries?.[0];
            const inner = compactAction(entry?.weaponAction);
            // 순차 사격은 묶음의 발사 간격(RPM)이 실제 연사 속도다.
            if (inner && entry?.unit === 'RPM' && entry.delay) inner.rpm = round(entry.delay, 2);
            return inner;
        }
        const launch = action.launchParams || action.weaponAction?.launchParams;
        const base = { pellets: launch?.pelletCount > 1 ? launch.pelletCount : undefined, mult: launch && launch.damageMultiplier !== 1 ? round(launch.damageMultiplier) : undefined };
        switch (action.__type) {
            case 'SWeaponActionFireSingleParams': return { kind: 'single', rpm: round(action.fireRate, 2), ...base };
            case 'SWeaponActionFireRapidParams': return { kind: 'rapid', rpm: round(action.fireRate, 2), ...base };
            case 'SWeaponActionFireBurstParams': return { kind: 'burst', rpm: round(action.fireRate, 2), shots: action.shotCount, cooldown: round(action.cooldownTime), ...base };
            case 'SWeaponActionFireChargedParams': {
                const inner = compactAction(action.weaponAction) || {};
                return { ...inner, kind: 'charged', charge: round(action.chargeTime), cooldown: round(action.cooldownTime) };
            }
            case 'SWeaponActionFireBeamParams': return { kind: 'beam', beamDps: damageOf(action.damagePerSecond), fullRange: round(action.fullDamageRange, 0), zeroRange: round(action.zeroDamageRange, 0) };
            default: return null;
        }
    }

    function resourceFlows(entity) {
        const params = component(entity, 'ItemResourceComponentParams');
        const state = (params?.states || []).find((entry) => entry?.name === 'Online') || params?.states?.[0];
        const totals = { power: { use: 0, gen: 0 }, cool: { use: 0, gen: 0 } };
        const amount = (value) => Number(value?.units ?? value?.standardResourceUnits ?? value?.centiSCU ?? 0) || 0;
        for (const delta of state?.deltas || []) {
            const produced = delta?.generation; const consumed = delta?.consumption;
            if (produced?.resource === 'Power') totals.power.gen += amount(produced.resourceAmountPerSecond);
            if (produced?.resource === 'Coolant') totals.cool.gen += amount(produced.resourceAmountPerSecond);
            if (consumed?.resource === 'Power') totals.power.use += amount(consumed.resourceAmountPerSecond);
            if (consumed?.resource === 'Coolant') totals.cool.use += amount(consumed.resourceAmountPerSecond);
        }
        return { ...totals, em: round(state?.signatureParams?.EMSignature?.nominalSignature, 0), ir: round(state?.signatureParams?.IRSignature?.nominalSignature, 0) };
    }

    function compactPorts(entity) {
        return (component(entity, 'SItemPortContainerComponentParams')?.Ports || []).map((port) => {
            const flags = tagList(port.Flags).map((flag) => flag.replace(/^\$/, '').toLowerCase());
            return prune({
                name: port.Name, min: port.MinSize, max: port.MaxSize,
                acc: (port.Types || []).map((rule) => prune({ type: rule.Type, subs: (rule.SubTypes || []).filter((sub) => sub && sub !== 'UNDEFINED') })),
                ed: flags.includes('uneditable') ? false : undefined,
            });
        });
    }

    function compactItem(record) {
        const entity = entityOf(record);
        const def = component(entity, 'SAttachableComponentParams')?.AttachDef;
        if (!def) return null;
        const cls = classOf(record);
        const description = localize(def.Localization?.Description);
        const klass = description.match(/Class:\s*([A-Za-z]+)/)?.[1];
        const dtype = description.match(/Item Type:\s*([^\n]+)/)?.[1]?.trim();
        const manufacturer = manufacturerOf(def.Manufacturer);
        const flows = resourceFlows(entity);
        const weapon = component(entity, 'SCItemWeaponComponentParams');
        const shield = component(entity, 'SCItemShieldGeneratorParams');
        const quantum = component(entity, 'SCItemQuantumDriveParams');
        const missile = component(entity, 'SCItemMissileParams');
        const ammoBox = component(entity, 'SAmmoContainerComponentParams');
        let w;
        if (weapon) {
            const action = compactAction(weapon.fireActions?.[0]);
            const ammo = followRecord(ammoBox?.ammoParamsRecord);
            if (action) {
                const regen = weapon.weaponRegenConsumerParams;
                w = prune({
                    ...action,
                    modes: weapon.fireActions.length > 1 ? weapon.fireActions.length : undefined,
                    speed: round(ammo?.speed, 1), life: round(ammo?.lifetime, 2), dmg: damageOf(ammo?.projectileParams?.damage),
                    ammo: ammoBox?.maxAmmoCount || undefined,
                    regen: regen?.maxAmmoLoad ? prune({ load: regen.maxAmmoLoad, perSec: round(regen.maxRegenPerSec, 2), cd: round(regen.regenerationCooldown, 2) }) : undefined,
                });
            }
        }
        const pairs = (list) => {
            if (!Array.isArray(list)) return undefined;
            const out = {};
            DAMAGE_KEYS.forEach((key, index) => { const row = list[index]; if (row && (row.Min || row.Max)) out[key] = [round(row.Min, 3) || 0, round(row.Max, 3) || 0]; });
            return out;
        };
        return prune({
            cls, type: def.Type, sub: def.SubType && def.SubType !== 'UNDEFINED' ? def.SubType : undefined, size: def.Size, grade: GRADES[def.Grade] || undefined,
            klass, dtype, name: localize(def.Localization?.Name) || cls, short: localize(def.Localization?.ShortName) || undefined,
            mfr: manufacturer.name, mfrCode: manufacturer.code,
            hp: round(component(entity, 'SHealthComponentParams')?.Health, 0),
            tags: tagList(def.Tags), req: tagList(def.RequiredTags),
            power: flows.power, cool: flows.cool, em: flows.em, ir: flows.ir,
            w,
            sh: shield ? { hp: round(shield.MaxShieldHealth, 0), regen: round(shield.MaxShieldRegen, 1), downDelay: round(shield.DownedRegenDelay, 2), dmgDelay: round(shield.DamagedRegenDelay, 2), res: pairs(shield.ShieldResistance), abs: pairs(shield.ShieldAbsorption) } : undefined,
            qd: quantum ? { speed: quantum.params?.driveSpeed, spool: round(quantum.params?.spoolUpTime, 2), cool: round(quantum.params?.cooldownTime, 2), fuel: quantum.quantumFuelRequirement, s1: quantum.params?.stageOneAccelRate, s2: quantum.params?.stageTwoAccelRate } : undefined,
            ms: missile ? {
                dmg: damageOf(missile.explosionParams?.damage), speed: round(missile.GCSParams?.linearSpeed, 0),
                signal: missile.targetingParams?.trackingSignalType, lock: round(missile.targetingParams?.lockTime, 2),
                rangeMin: round(missile.targetingParams?.lockRangeMin, 0), rangeMax: round(missile.targetingParams?.lockRangeMax, 0),
            } : undefined,
            ports: compactPorts(entity),
        });
    }

    const items = {};
    const ensureItem = (record) => {
        if (!record) return null;
        if (!items[record.id]) {
            const item = compactItem(record);
            if (!item) return null;
            items[record.id] = item;
        }
        return record.id;
    };
    // 편집 후보가 되는 부품: 함선용 부품 폴더에 있고, 종류가 편집 대상이며, 실제 이름이 있는 것.
    // (시험용·견본·AI 전용 정의는 이름이 없거나 자리표시 문구라서 여기서 걸러진다.)
    for (const record of entityRecords) {
        if (!/\/entities\/scitem\/(ships|vehicles)\//i.test(record.file)) continue;
        if (/template|_test|dummy|placeholder/i.test(record.name)) continue;
        const def = component(entityOf(record), 'SAttachableComponentParams')?.AttachDef;
        if (!def || !RELEVANT_TYPES.has(def.Type)) continue;
        if (!localize(def.Localization?.Name)) continue;
        ensureItem(record);
    }

    // ---- 함선 ---------------------------------------------------------------
    function xmlPorts(root) {
        const ports = new Map();
        const walk = (node) => {
            if (node.tag === 'Part') {
                const port = node.children.find((child) => child.tag === 'ItemPort');
                if (port && node.attrs.name) {
                    const types = port.children.filter((child) => child.tag === 'Types').flatMap((child) => child.children);
                    const flags = tagList(port.attrs.flags).map((flag) => flag.replace(/^\$/, '').toLowerCase());
                    ports.set(node.attrs.name.toLowerCase(), prune({
                        name: node.attrs.name, min: Number(port.attrs.minSize ?? port.attrs.minsize) || 0, max: Number(port.attrs.maxSize ?? port.attrs.maxsize) || 0,
                        acc: types.map((type) => prune({ type: type.attrs.type, subs: tagList(String(type.attrs.subtypes || '').replace(/,/g, ' ')) })),
                        ed: flags.includes('uneditable') ? false : undefined,
                    }));
                }
            }
            for (const child of node.children) walk(child);
        };
        walk(root);
        return ports;
    }

    function buildSlots(entries, portsByName) {
        const out = [];
        for (const entry of entries || []) {
            const port = portsByName.get(String(entry.itemPortName || '').toLowerCase());
            const record = entry.entityClassReference?.__record ? df.recordById.get(entry.entityClassReference.__record)
                : (entry.entityClassName ? recordByClass.get(String(entry.entityClassName).toLowerCase()) : null);
            const itemDef = record ? component(entityOf(record), 'SAttachableComponentParams')?.AttachDef : null;
            const accepts = (port?.acc || []).filter((rule) => RELEVANT_TYPES.has(rule.type));
            const relevant = itemDef ? RELEVANT_TYPES.has(itemDef.Type) : false;
            let children = [];
            if (record) {
                const childPorts = new Map(compactPorts(entityOf(record)).map((childPort) => [childPort.name.toLowerCase(), childPort]));
                const nested = entry.loadout?.entries || [];
                // 부품에 기본으로 달려 나오는 하위 부품(예: 짐벌 마운트의 무기)은 그 부품 자신의 기본 장착에 적혀 있다.
                const own = nested.length ? nested : (component(entityOf(record), 'SEntityComponentDefaultLoadoutParams')?.loadout?.entries || []);
                children = buildSlots(own, childPorts);
            }
            const editable = port ? port.ed !== false : false;
            if (!relevant && !children.length && !(editable && accepts.length)) continue;
            const itemId = record && (relevant || children.length) ? ensureItem(record) : undefined;
            out.push(prune({ port: entry.itemPortName, kind: editable ? 's' : 'f', min: port?.min, max: port?.max, acc: port?.acc, item: itemId || undefined, ch: children }));
        }
        return out;
    }

    const voltIds = (() => {
        const text = readFileSync(resolve(ROOT, 'data/ship-live-stats.js'), 'utf8');
        const marker = 'window.VOLT_SHIP_LIVE_STATS = ';
        const stats = JSON.parse(text.slice(text.indexOf(marker) + marker.length).trim().replace(/;$/, ''));
        return new Map(Object.entries(stats).map(([id, row]) => [String(row.erkulLocalName || '').toLowerCase(), id]));
    })();

    // 플레이어가 타는 함선·차량만 고른다: 함선 폴더에 있고, 실제 이름이 있으며, AI·임무·견본 변형이 아닌 것.
    const EXCLUDE_SHIP = /_(AI|NPC|PU|Unmanned|Template|S42|SQ42|Tutorial|EA|Derelict|Wreck|Hijacked|Boarded|Swarm|Indestructible|NoInterior|Piano|Test|Drone|Mission|Bombless|Fleetweek|ShipShowdown|Showdown|CitizenCon|Crim|Gang|Advocacy|UEE|Civilian|NineTails|XenoThreat|QIG|Transponder|Destruct|Hangar|Frontend|Showroom|Display|Dealer|Preview|Gamemaster|GM)(_|$)/i;
    // 같은 함선의 행사·도색·교육용·임시 변형(bis2950, collector_*, exec_*, teach, temp …)과 시설물.
    const EXCLUDE_VARIANT = /_(bis\d+|collector|exec|teach|temp|fw\d*\w*|btala|tsg|plat|citizencon\d*|tier_\d|s3bombs|prison|drug|nocrimesagainst|securitynetwork|stealth|military|mod|ballistic)(_|$)|^(eaobjective|orbital_sentry)/i;
    const ships = new Map();
    for (const record of entityRecords) {
        if (!/\/entities\/(spaceships|groundvehicles)\//i.test(record.file)) continue;
        const cls = classOf(record);
        if (EXCLUDE_SHIP.test(cls) || EXCLUDE_VARIANT.test(cls)) continue;
        // 소유자가 함선DB에서 영구 제외한 항목과 부속 모듈은 편집기에도 싣지 않는다.
        if (isExcludedShip(cls.toLowerCase(), record.id) || /^drak_command_module$/i.test(cls)) continue;
        const entity = entityOf(record);
        const vehicle = component(entity, 'VehicleComponentParams');
        if (!vehicle) continue;
        const name = localize(vehicle.vehicleName);
        if (!name) continue;
        const xmlFile = String(vehicle.vehicleDefinition || '').split('/').pop().toLowerCase();
        const xml = game.xml.get(xmlFile) ? parseCryXml(game.xml.get(xmlFile)) : null;
        const ports = xml ? xmlPorts(xml) : new Map();
        for (const port of compactPorts(entity)) if (!ports.has(port.name.toLowerCase())) ports.set(port.name.toLowerCase(), port);
        const slots = buildSlots(component(entity, 'SEntityComponentDefaultLoadoutParams')?.loadout?.entries, ports);
        if (!slots.length) continue;
        const manufacturer = manufacturerOf(vehicle.manufacturer);
        ships.set(cls.toLowerCase(), prune({
            cls: cls.toLowerCase(), ref: record.id, name: name.replace(/\s+/g, ' '), mfr: manufacturer.name, mfrCode: manufacturer.code,
            size: Number(xml?.attrs.size) || undefined, role: localize(vehicle.vehicleRole) || undefined,
            volt: voltIds.get(cls.toLowerCase()), ground: /\/groundvehicles\//i.test(record.file) ? true : undefined,
            tags: tagList(xml?.attrs.itemPortTags), base: { crew: vehicle.crewSize },
            slots,
        }));
    }

    // ---- 쓰기 ---------------------------------------------------------------
    const shipList = [...ships.values()].map((ship) => prune({ cls: ship.cls, name: ship.name, mfr: ship.mfr, size: ship.size, role: ship.role, volt: ship.volt, ground: ship.ground }))
        .sort((a, b) => a.name.localeCompare(b.name));
    const version = [game.build.Branch?.replace(/^sc-alpha-/, ''), game.build.RequestedP4ChangeNum].filter(Boolean).join('-LIVE.') || 'unknown';
    rmSync(OUT, { recursive: true, force: true });
    mkdirSync(resolve(OUT, 'ships'), { recursive: true });
    const write = (file, value) => writeFileSync(resolve(OUT, file), `${JSON.stringify(value)}\n`);
    write('items.json', { version, items });
    write('index.json', { version, ships: shipList });
    for (const ship of ships.values()) write(`ships/${ship.cls}.json`, ship);
    const sample = (cls) => { const ship = ships.get(cls); return ship ? Math.round(calc.summarize(ship, items, {}).dps.total) : null; };
    const meta = {
        source: 'game-files', sourceName: 'Star Citizen 게임 파일', sourceDetail: 'Data.p4k (Game2.dcb · 함선 구조 XML · global.ini)',
        priceSource: 'UEX', priceSourceUrl: 'https://uexcorp.space/',
        version, gameVersion: game.build.Version, builtAt: new Date().toISOString(),
        counts: { items: Object.keys(items).length, ships: shipList.length, records: df.records.length },
        samples: { anvl_asgard: sample('anvl_asgard'), aegs_gladius: sample('aegs_gladius'), anvl_arrow: sample('anvl_arrow') },
    };
    writeFileSync(resolve(OUT, 'meta.json'), `${JSON.stringify(meta, null, 2)}\n`);
    const bytes = (file) => readFileSync(resolve(OUT, file)).length;
    const shipBytes = readdirSync(resolve(OUT, 'ships')).reduce((total, file) => total + bytes(`ships/${file}`), 0);
    console.log(`게임 파일 ${version}: 부품 ${meta.counts.items}종, 함선 ${meta.counts.ships}척 (정의 ${df.records.length.toLocaleString()}건 중)`);
    console.log(`크기: items ${Math.round(bytes('items.json') / 1024)}KB, index ${Math.round(bytes('index.json') / 1024)}KB, ships ${Math.round(shipBytes / 1024)}KB`);
    console.log(`기본 장착 화력 표본: ${JSON.stringify(meta.samples)}`);
    const byType = {};
    for (const item of Object.values(items)) byType[item.type] = (byType[item.type] || 0) + 1;
    console.log(`부품 종류: ${Object.entries(byType).sort((a, b) => b[1] - a[1]).map(([type, count]) => `${type} ${count}`).join(', ')}`);
}

main();
