#!/usr/bin/env node
/**
 * 개인 장비(무기·방어구) 안내용 자료 — 설치된 게임 파일에서 직접 뽑는다.
 *
 * 입력(--cache-dir): Game2.dcb, global.ini(영어), build.json.  선택: --ko-ini <한국어 패치 global.ini>
 * 출력: data/gear/weapons.json, data/gear/armor.json
 * 사용: node scripts/gear/build-gear-data.mjs --cache-dir <폴더> [--ko-ini <경로>]
 * 외부 서비스에 접근하지 않는다. 판매처·가격은 화면이 UEX 프록시로 따로 조회한다.
 *
 * 변종(도색·한정판) 처리: 같은 기본형(클래스명 앞부분)이고 수치가 완전히 같은 것끼리 한 묶음으로 만든다.
 *   묶음의 대표는 기본형 클래스 그 자체, 없으면 이름이 가장 짧은 것. 변종은 지우지 않고 variants 에 남긴다
 *   (판매처·가격은 변종마다 다르므로 고유번호를 함께 싣는다). 수치가 다른 변종은 별도 묶음이 된다.
 *
 * 연사: 순차 발사 무기는 발사 순서의 대기 시간으로 실제 연사를 계산한다(rate.basis = sequence).
 *   연사·점사 무기는 원본 값 그대로(automatic). 단발·충전식은 원본 값이 "최대 한도"다(upperBound) —
 *   장전 동작·충전 시간이 수치로 적혀 있지 않아 실제는 더 느릴 수 있다.
 * 값은 게임 파일 그대로이며 게임 안에서 실측한 값이 아니다.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { DataForge } from '../gamedata/dataforge.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const arg = (name) => { const index = process.argv.indexOf(name); return index > -1 ? process.argv[index + 1] : null; };
const CACHE = arg('--cache-dir');
if (!CACHE || !existsSync(resolve(CACHE, 'Game2.dcb'))) { console.error('--cache-dir <Game2.dcb 가 있는 폴더> 가 필요합니다.'); process.exit(2); }
const dcb = readFileSync(resolve(CACHE, 'Game2.dcb'));
const df = new DataForge(dcb);
const manifest = JSON.parse(readFileSync(resolve(CACHE, existsSync(resolve(CACHE, 'build.json')) ? 'build.json' : 'build_manifest.id'), 'utf8'));
const build = manifest.Data || manifest;
function loadIni(path) {
    const map = new Map();
    for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) { const at = line.indexOf('='); if (at > 0) map.set(line.slice(0, at).replace(/^﻿/, '').replace(/,P$/i, '').trim().toLowerCase(), line.slice(at + 1).trim()); }
    return map;
}
const en = loadIni(resolve(CACHE, 'global.ini'));
const koPath = arg('--ko-ini');
const ko = koPath && existsSync(koPath) ? loadIni(koPath) : null;
const lookup = (map, key) => { if (!map || !key || !String(key).startsWith('@')) return undefined; const value = map.get(String(key).slice(1).toLowerCase()); return value && !/LOC_|PLACEHOLDER/.test(value) ? value.replace(/\\n/g, ' ').replace(/<[^>]+>/g, '').trim() : undefined; };

const idOf = (record) => record.name.split('.').slice(1).join('.');
const round = (value, digits = 2) => (Number.isFinite(Number(value)) && Number(value) !== 0 ? Number(Number(value).toFixed(digits)) : undefined);
const prune = (object) => Object.fromEntries(Object.entries(object).filter(([, v]) => v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && !v.length) && !(typeof v === 'object' && !Array.isArray(v) && !Object.keys(v).length)));
const component = (entity, type) => (entity.Components || []).find((c) => c && c.__type === type);
const recordById = new Map(df.records.map((record) => [record.id, record]));
const follow = (ref, depth = 8) => { const record = ref?.__record ? recordById.get(ref.__record) : null; return record ? { record, data: df.readRecord(record, depth) } : null; };
const manufacturers = new Map(df.recordsOfType('SCItemManufacturer').map((record) => [record.id, df.readRecord(record, 3)]));
const manufacturerOf = (ref) => { const m = ref?.__record ? manufacturers.get(ref.__record) : null; return m ? lookup(en, m.Localization?.Name) : undefined; };

const DAMAGE = { DamagePhysical: 'physical', DamageEnergy: 'energy', DamageDistortion: 'distortion', DamageThermal: 'thermal', DamageBiochemical: 'biochemical', DamageStun: 'stun' };
const damageOf = (info) => prune(Object.fromEntries(Object.entries(DAMAGE).map(([key, name]) => [name, round(info?.[key], 2)])));

function ammoOf(ref) {
    const ammo = follow(ref); if (!ammo) return undefined;
    const p = ammo.data.projectileParams || {}; const drop = p.damageDropParams || {};
    const damage = damageOf(p.damage); const type = Object.keys(damage)[0];
    return prune({
        dmg: damage, speed: round(ammo.data.speed, 0), range: ammo.data.speed && ammo.data.lifetime ? round(ammo.data.speed * ammo.data.lifetime, 0) : undefined,
        // 거리별 피해 감소(주 피해 종류 기준): [감소 시작 거리(m), 미터당 감소, 최저 피해]
        drop: type && drop.damageDropMinDistance ? [round(drop.damageDropMinDistance[`Damage${type[0].toUpperCase()}${type.slice(1)}`], 1), round(drop.damageDropPerMeter?.[`Damage${type[0].toUpperCase()}${type.slice(1)}`], 3), round(drop.damageDropMinDamage?.[`Damage${type[0].toUpperCase()}${type.slice(1)}`], 2)].map((v) => v ?? 0) : undefined,
        blast: p.detonationParams?.explosionParams ? prune({ dmg: damageOf(p.detonationParams.explosionParams.damage), radius: round(p.detonationParams.explosionParams.maxRadius, 1) }) : undefined,
    });
}

// 발사 방식. kind: single | rapid | burst | charged | beam | sequence | other
function modesOf(actions, out = []) {
    for (const action of (actions || []).filter(Boolean)) {
        const type = action.__type.replace(/^SWeaponAction/, '').replace(/Params$/, '');
        const name = (lookup(en, action.localisedName) || action.name || '').replace(/[[\]]/g, '') || undefined;
        if (type === 'Sequence') {
            const entries = (action.sequenceEntries || []).filter((entry) => entry?.weaponAction);
            const seconds = entries.reduce((sum, entry) => sum + (entry.unit === 'RPM' ? (entry.delay > 0 ? 60 / entry.delay : 0) : Number(entry.delay) || 0) * Math.max(1, entry.repetitions || 1), 0);
            const simple = entries.every((entry) => /FireSingle/.test(entry.weaponAction.__type));
            const shots = entries.reduce((sum, entry) => sum + ((entry.weaponAction.launchParams?.ammoCost ?? 1) > 0 ? Math.max(1, entry.repetitions || 1) : 0), 0);
            const inner = entries.map((entry) => entry.weaponAction.fireRate).filter(Boolean);
            const cap = inner.length ? Math.max(...inner) : undefined;
            const first = entries[0]?.weaponAction;
            out.push(prune({
                k: 'sequence', name, rpm: simple && seconds > 0 ? round(Math.min(shots * 60 / seconds, cap ?? Infinity), 0) : (seconds > 0 ? round(60 / seconds, 0) : round(cap, 0)),
                raw: round(cap, 0), shots: shots > 1 ? shots : undefined, pulls: shots > 1 && seconds > 0 && action.mode === 'Automatically' ? round(60 / seconds, 0) : undefined,
                sequenceMode: action.mode, cycleSeconds: round(seconds, 3),
                burst: first?.shotCount || undefined, pellets: first?.launchParams?.pelletCount > 1 ? first.launchParams.pelletCount : undefined, basis: 'sequence',
            }));
            continue;
        }
        if (/^(Parallel|DynamicCondition)$/.test(type)) {
            modesOf([...(action.weaponActions || []), action.defaultWeaponAction, ...(action.conditionalWeaponActions || []).map((entry) => entry.weaponAction)], out); continue;
        }
        const fire = action.weaponAction || action; const launch = fire.launchParams || {};
        const k = /Charged/.test(type) ? 'charged' : /Rapid/.test(type) ? 'rapid' : /Burst/.test(type) ? 'burst' : /Beam/.test(type) ? 'beam' : /FireSingle/.test(type) ? 'single' : 'other';
        if (k === 'other' && !fire.fireRate) continue;
        out.push(prune({
            k, name, rpm: round(fire.fireRate, 0), burst: fire.shotCount || undefined, pellets: launch.pelletCount > 1 ? launch.pelletCount : undefined,
            charge: action.weaponAction ? prune({ time: round(action.chargeTime, 2), mult: round(action.maxChargeModifier?.damageMultiplier, 2) }) : undefined,
            beam: fire.damagePerSecond ? damageOf(fire.damagePerSecond) : undefined,
            basis: k === 'rapid' || k === 'burst' ? 'automatic' : k === 'beam' ? undefined : 'upperBound',
        }));
    }
    return out;
}
function slotsOf(entity) {
    const out = {};
    for (const port of component(entity, 'SItemPortContainerComponentParams')?.Ports || []) {
        const sub = (port.Types || []).flatMap((rule) => rule.SubTypes || []).find((s) => ['IronSight', 'Barrel', 'BottomAttachment'].includes(s));
        if (sub) out[sub === 'IronSight' ? 'optics' : sub === 'Barrel' ? 'barrel' : 'under'] = port.MaxSize;
    }
    return out;
}

const TOOLS = new Set(['multitool', 'tractor', 'medgun', 'salvage', 'fire', 'binoculars', 'cutter']);
const KIND_ALIASES = { melee: 'knife', gren: 'grenade', glauncher: 'launcher', special: 'launcher', toy: 'pistol' };
const weaponFamily = (cls) => ((cls.match(/^([a-z]+_[a-z]+_[a-z]+_\d+)/i) || cls.match(/^([a-z]+_[a-z]+_\d+)/i) || [])[1] || cls).toLowerCase();
const armorFamily = (cls) => ((cls.match(/^(.+?_(?:core|arms|legs|helmet|undersuit|backpack|flightsuit|suit)_\d+)/i) || [])[1] || cls.replace(/(_\d+){1,2}$/, '')).toLowerCase();
const INTERNAL = /_ai$|_AI_|_npc|_template|_test|placeholder|_prop$|_dev|gungame|^mannequin_/i;

const weapons = []; const armor = [];
for (const record of df.recordsOfType('EntityClassDefinition')) {
    const isWeapon = /\/entities\/scitem\/weapons\/fps_weapons\//.test(record.file) && !/\/dev\//.test(record.file);
    const isArmor = /\/entities\/scitem\/characters\/human\/(armor|starwear|undersuit)/.test(record.file);
    if (!isWeapon && !isArmor) continue;
    const cls = idOf(record); if (INTERNAL.test(cls)) continue;
    const entity = df.readRecord(record, 12);
    const def = component(entity, 'SAttachableComponentParams')?.AttachDef; if (!def) continue;
    const name = lookup(en, def.Localization?.Name); if (!name || /^(PH|TBD|PLACEHOLDER)$/i.test(name)) continue;
    const nameKo = lookup(ko, def.Localization?.Name);
    const base = { uuid: record.id, cls, en: name, ko: nameKo && nameKo !== name ? nameKo : undefined, mfr: manufacturerOf(def.Manufacturer), mass: round(component(entity, 'SEntityPhysicsControllerParams')?.PhysType?.Mass, 2) };
    if (isWeapon && def.Type === 'WeaponPersonal') {
        const weapon = component(entity, 'SCItemWeaponComponentParams');
        const magazine = follow(weapon?.ammoContainerRecord);
        const container = magazine ? component(magazine.data, 'SAmmoContainerComponentParams') : component(entity, 'SAmmoContainerComponentParams');
        const token = cls.split('_')[1]?.toLowerCase(); const kind = TOOLS.has(token) ? 'tool' : KIND_ALIASES[token] || token;
        weapons.push({ ...base, family: weaponFamily(cls), stats: prune({ kind, size: def.Size, specialMode: /_ea_elim$/i.test(cls) ? 'elimination' : undefined, combatVerified: kind === 'tool' ? false : undefined, modes: modesOf(weapon?.fireActions), mag: container?.maxAmmoCount || undefined, ammo: ammoOf(container?.ammoParamsRecord), slots: slotsOf(entity) }) });
    } else if (isArmor && /^Char_Armor_/.test(def.Type)) {
        const suit = component(entity, 'SCItemSuitArmorParams'); const clothing = component(entity, 'SCItemClothingParams');
        const resistance = follow(suit?.damageResistance, 4)?.data?.damageResistance;
        const inventory = follow(component(entity, 'SCItemInventoryContainerComponentParams')?.containerParams, 4)?.data;
        const ports = component(entity, 'SItemPortContainerComponentParams')?.Ports || [];
        const countPorts = (test) => ports.filter((port) => (port.Types || []).some((rule) => test(rule.Type, rule.SubTypes || []))).length;
        const slot = def.Type.replace('Char_Armor_', '').toLowerCase();
        const cut = (key) => (resistance?.[key]?.Multiplier !== undefined ? Math.round((1 - resistance[key].Multiplier) * 100) : undefined);
        armor.push({ ...base, family: armorFamily(cls), stats: prune({
            slot: slot === 'torso' ? 'core' : slot, cls: ['Light', 'Medium', 'Heavy'].includes(def.SubType) ? def.SubType.toLowerCase() : undefined,
            covers: [...new Set((suit?.protectedBodyParts || []).map((part) => String(part.name || '').split('.').pop()))].sort(),
            // 피해 감소율(%): 물리·에너지·디스토션·열·생화학·기절
            cut: resistance ? [cut('PhysicalResistance'), cut('EnergyResistance'), cut('DistortionResistance'), cut('ThermalResistance'), cut('BiochemicalResistance'), cut('StunResistance')].map((v) => v ?? 0) : undefined,
            temp: clothing?.TemperatureResistance ? [Math.round(clothing.TemperatureResistance.MinResistance), Math.round(clothing.TemperatureResistance.MaxResistance)] : undefined,
            rad: clothing?.RadiationResistance?.MaximumRadiationCapacity ? [Math.round(clothing.RadiationResistance.MaximumRadiationCapacity), round(clothing.RadiationResistance.RadiationDissipationRate, 1) ?? 0] : undefined,
            store: inventory?.inventoryType?.capacity?.microSCU || undefined,
            guns: countPorts((type) => type === 'WeaponPersonal') || undefined, mags: countPorts((type, subs) => type === 'WeaponAttachment' && subs.includes('Magazine')) || undefined,
        }) });
    }
}

// 변종 묶기: 같은 기본형 + 수치가 완전히 같은 것.
function group(list, rankOf, commonNames = false) {
    const map = new Map();
    for (const item of list) { const key = `${item.family}|${item.mass}|${JSON.stringify(item.stats)}`; map.set(key, [...(map.get(key) || []), item]); }
    const used = new Map();
    return [...map.values()].map((items) => {
        const slotWord = { helmet: /\bhelmet\b/i, core: /\bcore\b/i, arms: /\barms\b/i, legs: /\blegs\b/i, backpack: /\bbackpack\b/i }[items[0].stats.slot];
        const sorted = [...items].sort((a, b) => Number(slotWord?.test(b.en) || false) - Number(slotWord?.test(a.en) || false) || Number(b.cls.toLowerCase() === b.family) - Number(a.cls.toLowerCase() === a.family) || a.en.length - b.en.length || a.en.localeCompare(b.en));
        const head = sorted[0]; const n = used.get(head.family) || 0; used.set(head.family, n + 1);
        // 방어구는 변종 이름의 공통 앞부분(제품군 이름)을 묶음 이름으로 쓴다. 예: "ADP-mk4 Core Exec/Woodland" → "ADP-mk4 Core".
        const common = (names) => { const words = names.map((value) => value.split(' ')); const out = []; for (let i = 0; i < words[0].length; i += 1) { if (words.every((list) => list[i] === words[0][i])) out.push(words[0][i]); else break; } return out.join(' '); };
        const line = commonNames && sorted.length > 1 ? { en: common(sorted.map((item) => item.en)), ko: sorted.every((item) => item.ko) ? common(sorted.map((item) => item.ko)) : '' } : null;
        const title = line && line.en.split(' ').length >= 2 && (!slotWord || slotWord.test(line.en)) ? prune({ en: line.en, ko: line.ko && line.ko.split(' ').length >= 2 ? line.ko : undefined }) : prune({ en: head.en, ko: head.ko });
        return prune({
            id: n ? `${head.family}~${n + 1}` : head.family, name: title, mfr: head.mfr, mass: head.mass, ...head.stats,
            variants: sorted.map((item) => (item.ko ? [item.uuid, item.en, item.ko] : [item.uuid, item.en])),
        });
    }).sort((a, b) => rankOf(a) - rankOf(b) || a.name.en.localeCompare(b.name.en));
}
const WEAPON_ORDER = ['pistol', 'smg', 'rifle', 'lmg', 'hmg', 'shotgun', 'sniper', 'launcher', 'crossbow', 'grenade', 'knife', 'tool'];
const ARMOR_ORDER = ['helmet', 'core', 'arms', 'legs', 'undersuit', 'backpack'];
const weaponGroups = group(weapons, (g) => { const i = WEAPON_ORDER.indexOf(g.kind); return i < 0 ? 99 : i; });
const armorGroups = group(armor, (g) => { const i = ARMOR_ORDER.indexOf(g.slot); return (i < 0 ? 99 : i) * 10 + ['light', 'medium', 'heavy'].indexOf(g.cls); }, true);
// 같은 묶음 이름이라도 수치·기본형이 다르면 합치지 않는다. 대표 변종의 정식 이름으로 구분한다.
const titleCounts = new Map();
for (const g of armorGroups) titleCounts.set(`${g.slot}|${g.name.en}`, (titleCounts.get(`${g.slot}|${g.name.en}`) || 0) + 1);
for (const g of armorGroups) if (titleCounts.get(`${g.slot}|${g.name.en}`) > 1) g.name = prune({ en: g.variants[0][1], ko: g.variants[0][2] });

const meta = { version: `${String(build.Branch || '').replace(/^sc-alpha-/, '')}.${build.RequestedP4ChangeNum || ''}`, gameVersion: build.Version, builtAt: new Date().toISOString(), source: 'game-files', sourceSha256: createHash('sha256').update(dcb).digest('hex'), koSource: ko ? 'korean-patch' : undefined };
mkdirSync(resolve(ROOT, 'data/gear'), { recursive: true });
writeFileSync(resolve(ROOT, 'data/gear/weapons.json'), `${JSON.stringify({ ...meta, note: 'variants = [고유번호, 영어 이름, 한글 이름]. modes[].basis: sequence(계산) | automatic(원본) | upperBound(원본·최대 한도).', groups: weaponGroups })}\n`);
writeFileSync(resolve(ROOT, 'data/gear/armor.json'), `${JSON.stringify({ ...meta, note: 'cut = 피해 감소율(%) [물리, 에너지, 디스토션, 열, 생화학, 기절]. temp = 견디는 온도 [최저, 최고]. rad = [방사선 용량, 해소율]. store = 수납(µSCU).', groups: armorGroups })}\n`);
// ---- 신체: 부위별 체력과 피해 배율 (착용·피해 시험용) -----------------------------
// 출처: BodyHealthConfig.HealthConfig_Player (부위별 피해 배율), ActorStatusComponent.PlayerStatus (체력 수치).
const healthConfig = df.readRecord(df.recordsOfType('BodyHealthConfig').find((record) => idOf(record) === 'HealthConfig_Player'), 6);
const playerStatus = df.readRecord(df.recordsOfType('ActorStatusComponent').find((record) => idOf(record) === 'PlayerStatus'), 4);
const statMax = new Map((playerStatus.actorStats || []).map((stat) => [stat.statType, stat.maximumStatValue]));
const partRecords = new Map(df.recordsOfType('BodyPart').map((record) => [idOf(record), df.readRecord(record, 2)]));
const parts = [];
for (const config of healthConfig.bodyPartConfigs || []) {
    for (const ref of config.bodyParts || []) {
        const id = String(ref.name || '').split('.').pop();
        parts.push({ id, health: statMax.get(partRecords.get(id)?.partHealthStat), armored: round(config.damageMultiplier, 3) ?? 0, naked: round(config.nakedDamageMultiplier, 3) ?? 0, head: config.isHeadShot || undefined });
    }
}
// 방어구 부위가 덮는 신체 부위 (SCItemSuitArmorParams.protectedBodyParts 를 부위 종류별로 확인한 결과와 같다).
const covers = { helmet: ['head'], core: ['torso'], arms: ['leftArm', 'rightArm'], legs: ['leftLeg', 'rightLeg'], undersuit: ['torso', 'leftArm', 'rightArm', 'leftLeg', 'rightLeg'], backpack: [] };
writeFileSync(resolve(ROOT, 'data/gear/body.json'), `${JSON.stringify({ ...meta, note: 'pool = 전체 체력(HealthPool). parts[].health = 부위 체력, armored = 방어구로 덮인 부위의 피해 배율, naked = 덮이지 않은 부위의 피해 배율. 게임 파일 값.', pool: statMax.get('HealthPool'), parts, covers })}
`);
const size = (file) => Math.round(readFileSync(resolve(ROOT, file)).length / 1024);
console.log(`신체: 체력 ${statMax.get('HealthPool')}, 부위 ${parts.length}곳`);
console.log(`개인 장비: 무기 ${weapons.length}종 → ${weaponGroups.length}묶음(${size('data/gear/weapons.json')}KB), 방어구 ${armor.length}종 → ${armorGroups.length}묶음(${size('data/gear/armor.json')}KB)`);
