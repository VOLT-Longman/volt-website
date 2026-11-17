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
const RELEVANT_TYPES = new Set(calc.COMPONENT_TYPES);
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
    // 0.0001 같은 자리표시 값은 피해로 치지 않는다(디스토션 무기의 탄체 피해 등).
    for (const [key, field] of DAMAGE_FIELDS) if (Number(info?.[field]) >= 0.001) out[key] = round(info[field]);
    return Object.keys(out).length ? out : undefined;
};
// 탄이 맞을 때의 피해 + 터질 때의 피해. 디스토션 무기와 로켓은 피해가 폭발 쪽에만 적혀 있다.
const ammoDamage = (projectile) => {
    const hit = damageOf(projectile?.damage) || {}; const blast = damageOf(projectile?.detonationParams?.explosionParams?.damage) || {};
    const out = { ...hit };
    for (const [key, value] of Object.entries(blast)) out[key] = round((out[key] || 0) + value);
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
    const nameKeys = { ships: {}, items: {}, roles: {}, makers: {} };
    const keyOf = (key) => String(key || '').replace(/^@/, '').toLowerCase();
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
            if (data?.Localization?.Name) nameKeys.makers[code.toUpperCase()] = keyOf(data.Localization.Name);
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
        // heat: 1발 쏠 때 오르는 열(실탄 무기의 과열 계산에 쓴다).
        const base = { pellets: launch?.pelletCount > 1 ? launch.pelletCount : undefined, mult: launch && launch.damageMultiplier !== 1 ? round(launch.damageMultiplier) : undefined, heat: round(action.heatPerShot, 4) || undefined };
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
        const bomb = component(entity, 'SCItemBombParams');
        const emp = component(entity, 'SCItemEMPParams');
        const dampener = component(entity, 'SCItemQuantumInterdictionGeneratorParams');
        const mining = component(entity, 'SEntityComponentMiningLaserParams')?.miningLaserModifiers;
        const percent = (entry) => (entry && Number(entry.value) ? round(entry.value, 1) : undefined);
        let w;
        if (weapon) {
            const action = compactAction(weapon.fireActions?.[0]);
            const ammo = followRecord(ammoBox?.ammoParamsRecord);
            if (action) {
                const regen = weapon.weaponRegenConsumerParams;
                // 과열 한도·식는 속도·과열 뒤 다시 쏠 수 있을 때까지의 시간.
                const heat = weapon.connectionParams?.simplifiedHeatParams;
                w = prune({
                    ...action,
                    modes: weapon.fireActions.length > 1 ? weapon.fireActions.length : undefined,
                    speed: round(ammo?.speed, 1), life: round(ammo?.lifetime, 2), dmg: ammoDamage(ammo?.projectileParams),
                    ammo: ammoBox?.maxAmmoCount || undefined,
                    oh: heat && action.heat ? prune({ max: round(heat.overheatTemperature, 2), cool: round(heat.coolingPerSecond, 2), start: round(heat.timeTillCoolingStarts, 3), fix: round(heat.overheatFixTime, 3), after: round(heat.temperatureAfterOverheatFix, 2) || undefined }) : undefined,
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
            // 폭탄도 미사일과 같은 칸(ms)에 싣는다: 피해와 폭발 반경.
            ...(bomb && !missile ? { ms: prune({ dmg: damageOf(bomb.explosionParams?.damage), radius: round(bomb.explosionParams?.maxRadius, 0) }) } : {}),
            emp: emp ? prune({ dmg: round(emp.distortionDamage, 0), radius: round(emp.empRadius, 0), charge: round(emp.chargeTime, 1), cool: round(emp.cooldownTime, 1) }) : undefined,
            qig: dampener ? prune({ range: round(dampener.jammerSettings?.jammerRange, 0), charge: round(dampener.quantumInterdictionPulseSettings?.chargeTimeSecs, 1), radius: dampener.quantumInterdictionPulseSettings?.radiusMeters > 1 ? round(dampener.quantumInterdictionPulseSettings.radiusMeters, 0) : undefined, cool: round(dampener.quantumInterdictionPulseSettings?.cooldownTimeSecs, 1) }) : undefined,
            mine: mining ? prune({ instab: percent(mining.laserInstability), resist: percent(mining.resistanceModifier), window: percent(mining.optimalChargeWindowSizeModifier), rate: percent(mining.optimalChargeWindowRateModifier) }) : undefined,
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
            const nameKey = keyOf(component(entityOf(record), 'SAttachableComponentParams')?.AttachDef?.Localization?.Name);
            if (nameKey) nameKeys.items[record.id] = nameKey;
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

    // 선체: 함선 구조 XML의 부위별 내구도 합과 전체 질량.
    function hullStats(xml) {
        if (!xml) return {};
        let hull = 0; let mass = 0;
        const walk = (node) => {
            if (node.tag === 'Part') { hull += Number(node.attrs.damageMax) || 0; mass += Number(node.attrs.mass) || 0; }
            for (const child of node.children) walk(child);
        };
        walk(xml);
        return { hull: round(hull, 0) || undefined, mass: round(mass, 0) || undefined };
    }

    // 바꿀 수 없는 기본 장비에서 읽는 수치: 비행 제어기(속도·선회), 연료 탱크, 장갑.
    function fixedEquipment(entries) {
        const out = {}; let hydrogen = 0; let quantumFuel = 0;
        for (const entry of entries || []) {
            const record = entry.entityClassReference?.__record ? df.recordById.get(entry.entityClassReference.__record)
                : (entry.entityClassName ? recordByClass.get(String(entry.entityClassName).toLowerCase()) : null);
            if (!record) continue;
            const entity = entityOf(record);
            const ifcs = component(entity, 'IFCSParams');
            if (ifcs && !out.flight) {
                out.flight = prune({
                    scm: round(ifcs.scmSpeed, 0), boost: round(ifcs.boostSpeedForward, 0), boostBack: round(ifcs.boostSpeedBackward, 0), max: round(ifcs.maxSpeed, 0),
                    pitch: round(ifcs.maxAngularVelocity?.x, 1), yaw: round(ifcs.maxAngularVelocity?.z, 1), roll: round(ifcs.maxAngularVelocity?.y, 1),
                });
            }
            const armor = component(entity, 'SCItemVehicleArmorParams');
            if (armor && !out.armor) {
                out.armor = prune({
                    hp: round(component(entity, 'SHealthComponentParams')?.Health, 0),
                    physical: round(armor.damageMultiplier?.DamagePhysical, 3), energy: round(armor.damageMultiplier?.DamageEnergy, 3), distortion: round(armor.damageMultiplier?.DamageDistortion, 3),
                    ir: round(armor.signalInfrared, 3), em: round(armor.signalElectromagnetic, 3), cs: round(armor.signalCrossSection, 3),
                });
            }
            if (component(entity, 'SCItemFuelTankParams')) {
                const tank = component(entity, 'ResourceContainer');
                const amount = Number(tank?.capacity?.standardCargoUnits) || 0;
                const kinds = (tank?.inclusiveResources || []).map((resource) => String(resource?.name || ''));
                if (kinds.some((kind) => /QuantumFuel/i.test(kind))) quantumFuel += amount;
                else if (kinds.some((kind) => /Hydrogen|PlasmaFuel/i.test(kind))) hydrogen += amount;
            }
        }
        if (hydrogen || quantumFuel) out.fuel = prune({ h2: round(hydrogen, 2) || undefined, qt: round(quantumFuel, 2) || undefined });
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
        nameKeys.ships[cls.toLowerCase()] = keyOf(vehicle.vehicleName);
        // 역할(경전투기 등)의 문자열 열쇠 — 한국어 패치 표기를 찾을 때 쓴다. 영문 역할명 기준으로 모은다.
        if (localize(vehicle.vehicleRole)) nameKeys.roles[localize(vehicle.vehicleRole)] = keyOf(vehicle.vehicleRole);
        const xmlFile = String(vehicle.vehicleDefinition || '').split('/').pop().toLowerCase();
        const xml = game.xml.get(xmlFile) ? parseCryXml(game.xml.get(xmlFile)) : null;
        const ports = xml ? xmlPorts(xml) : new Map();
        for (const port of compactPorts(entity)) if (!ports.has(port.name.toLowerCase())) ports.set(port.name.toLowerCase(), port);
        const defaultEntries = component(entity, 'SEntityComponentDefaultLoadoutParams')?.loadout?.entries;
        const slots = buildSlots(defaultEntries, ports);
        if (!slots.length) continue;
        const base = prune({ crew: vehicle.crewSize, ...hullStats(xml), ...fixedEquipment(defaultEntries) });
        const manufacturer = manufacturerOf(vehicle.manufacturer);
        ships.set(cls.toLowerCase(), prune({
            cls: cls.toLowerCase(), ref: record.id, name: name.replace(/\s+/g, ' '), mfr: manufacturer.name, mfrCode: manufacturer.code,
            size: Number(xml?.attrs.size) || undefined, role: localize(vehicle.vehicleRole) || undefined,
            volt: voltIds.get(cls.toLowerCase()), ground: /\/groundvehicles\//i.test(record.file) ? true : undefined,
            tags: tagList(xml?.attrs.itemPortTags), base,
            slots,
        }));
    }

    // ---- 쓰기 ---------------------------------------------------------------
    const version = [game.build.Branch?.replace(/^sc-alpha-/, ''), game.build.RequestedP4ChangeNum].filter(Boolean).join('-LIVE.') || 'unknown';
    // 함선 파일만 비우고 다시 쓴다. 한국어 표기(ko.json)는 다른 생성기(loadout:ko)의 결과물이라 지우지 않는다.
    rmSync(resolve(OUT, 'ships'), { recursive: true, force: true });
    mkdirSync(resolve(OUT, 'ships'), { recursive: true });
    const write = (file, value) => writeFileSync(resolve(OUT, file), `${JSON.stringify(value)}\n`);
    // ---- 대표 제품 정리 ------------------------------------------------------
    // 게임 파일에는 같은 제품의 내부용 변형(_LowPoly, 행사·NPC·환경 전용 등)이 따로 들어 있다.
    // 원본은 계산·기본 장착 복원을 위해 그대로 두되, 이름·제조사·종류·크기가 같은 묶음마다 대표 하나를 정한다.
    //   alias  : 대표 제품의 id (이름 표기·검색·이전 저장 자료 해석에 쓴다)
    //   hidden : 선택 목록에서 숨김 — 대표와 수치가 완전히 같거나, 어떤 함선의 기본 장착에도 쓰이지 않는 변형
    //   variant: 수치가 다르고 실제 함선에 달려 나오는 전용 변형 — 숨기지 않고 "전용 변형"으로 구분해 보여준다
    const usage = new Map();
    for (const ship of ships.values()) {
        const walk = (slots) => { for (const slot of slots || []) { if (slot.item) usage.set(slot.item, (usage.get(slot.item) || 0) + 1); walk(slot.ch); } };
        walk(ship.slots);
    }
    const productGroups = new Map();
    for (const [id, item] of Object.entries(items)) {
        if (item.name === item.cls) continue; // 이름 없는 내장 부품은 묶지 않는다
        const key = [item.type, item.size, item.name, item.mfrCode].join('|');
        productGroups.set(key, [...(productGroups.get(key) || []), id]);
    }
    // 낱개 제품으로 사고파는 종류만 대표·전용 변형을 가린다. 터렛·마운트·랙처럼 함선마다 따로 만든 구조물은
    // 이름이 같아도("Remote Turret" 등) 서로 다른 물건이므로, 수치까지 완전히 같고 쓰이지 않는 복사본만 숨긴다.
    const PRODUCT_TYPES = new Set(['WeaponGun', 'Shield', 'PowerPlant', 'Cooler', 'QuantumDrive', 'JumpDrive', 'Radar', 'Missile', 'Bomb', 'EMP', 'QuantumInterdictionGenerator', 'WeaponMining', 'MiningModifier', 'SalvageModifier', 'SalvageHead', 'TractorBeam']);
    const sameStats = (a, b) => { const strip = ({ cls: _cls, ...rest }) => JSON.stringify(rest); return strip(a) === strip(b); };
    const productStats = { groups: 0, hidden: 0, variants: 0 };
    for (const ids of productGroups.values()) {
        if (ids.length < 2) continue;
        productStats.groups += 1;
        // 대표: 실제 함선에 쓰이는 것 가운데 클래스명이 가장 짧은 일반형(변형은 일반형 이름 뒤에 _LowPoly, _Turret, 함선명 등이 붙는다). 같으면 더 많이 쓰이는 것.
        const primary = [...ids].sort((a, b) => Number(Boolean(usage.get(b))) - Number(Boolean(usage.get(a))) || items[a].cls.length - items[b].cls.length || (usage.get(b) || 0) - (usage.get(a) || 0) || items[a].cls.localeCompare(items[b].cls))[0];
        for (const id of ids) {
            if (id === primary) continue;
            const identical = sameStats(items[id], items[primary]);
            if (!PRODUCT_TYPES.has(items[id].type)) {
                if (identical && !usage.get(id)) { items[id].alias = primary; items[id].hidden = true; productStats.hidden += 1; }
                continue;
            }
            items[id].alias = primary;
            if (identical || !usage.get(id)) { items[id].hidden = true; productStats.hidden += 1; }
            else { items[id].variant = true; productStats.variants += 1; }
        }
    }
    // 함선: 같은 함선의 옛 정의와 새 정의(_gs)가 함께 있으면 새 정의만 싣고, 옛 클래스명은 별칭으로 남긴다
    // (이전에 저장한 구성·공유 링크가 계속 열리게).
    const shipAliases = {};
    for (const cls of [...ships.keys()]) {
        if (ships.has(`${cls}_gs`)) { shipAliases[cls] = `${cls}_gs`; ships.delete(cls); if (!nameKeys.ships[`${cls}_gs`]) nameKeys.ships[`${cls}_gs`] = nameKeys.ships[cls]; delete nameKeys.ships[cls]; }
    }
    const shipList = [...ships.values()].map((ship) => prune({ cls: ship.cls, name: ship.name, mfr: ship.mfr, mfrCode: ship.mfrCode, size: ship.size, role: ship.role, volt: ship.volt, ground: ship.ground }))
        .sort((a, b) => a.name.localeCompare(b.name));
    write('items.json', { version, items });
    write('index.json', { version, ships: shipList, aliases: shipAliases });
    // 이름 문자열 열쇠: 한국어 표기 생성기(loadout:ko)가 같은 열쇠로 한국어 패치를 찾는다. 화면에서는 쓰지 않는다.
    write('namekeys.json', nameKeys);
    console.log(`대표 제품 정리: 묶음 ${productStats.groups}개, 숨긴 내부 변형 ${productStats.hidden}종, 전용 변형 ${productStats.variants}종, 함선 별칭 ${Object.keys(shipAliases).length}척`);
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
