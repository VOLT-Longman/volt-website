// 조사: 개인 장비(무기·탄·부착물·방어구)를 게임 원본에서 통째로 뽑는다.
//   node scripts/loadout-research/extract-fps.mjs --cache-dir <폴더>
// 출력: data/loadout-research/fps-weapons.json, fps-attachments.json, fps-armor.json
// 값은 원본 그대로다. 도색·소품 변형은 지우지 않고 family(기본형)로 묶어 둔다.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { args, requireDir, loadGame, writeData, manifestBase } from './lib.mjs';

const a = args();
const cacheDir = requireDir(a['cache-dir'], 'cache-dir');
const game = loadGame(cacheDir);
const { df } = game;
const base = manifestBase(game);
const short = (ref) => (ref?.name ? String(ref.name).split('.').slice(1).join('.') : undefined);
const round = (value, digits = 3) => (Number.isFinite(Number(value)) ? Number(Number(value).toFixed(digits)) : undefined);
const prune = (object) => Object.fromEntries(Object.entries(object).filter(([, v]) => v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && !v.length) && !(typeof v === 'object' && !Array.isArray(v) && !Object.keys(v).length)));

const ini = new Map();
for (const line of readFileSync(resolve(cacheDir, 'global.ini'), 'utf8').split(/\r?\n/)) {
    const at = line.indexOf('='); if (at < 1) continue;
    ini.set(line.slice(0, at).replace(/^﻿/, '').replace(/,P$/i, '').trim().toLowerCase(), line.slice(at + 1).trim());
}
const text = (key) => { if (!key || !String(key).startsWith('@')) return undefined; const value = ini.get(String(key).slice(1).toLowerCase()); return value && !/LOC_|PLACEHOLDER/.test(value) ? value.replace(/\\n/g, ' ').trim() : undefined; };
const manufacturers = new Map(df.recordsOfType('SCItemManufacturer').map((record) => [record.id, df.readRecord(record, 3)]));
const manufacturerOf = (ref) => { const m = ref?.__record ? manufacturers.get(ref.__record) : null; return m ? prune({ code: m.Code, name: text(m.Localization?.Name) }) : undefined; };
const recordById = new Map(df.records.map((record) => [record.id, record]));
const follow = (ref, depth = 8) => { const record = ref?.__record ? recordById.get(ref.__record) : null; return record ? { record, data: df.readRecord(record, depth) } : null; };

const DAMAGE = ['DamagePhysical', 'DamageEnergy', 'DamageDistortion', 'DamageThermal', 'DamageBiochemical', 'DamageStun'];
const damageOf = (info) => prune(Object.fromEntries(DAMAGE.map((key) => [key.replace('Damage', '').toLowerCase(), round(info?.[key], 3) || undefined])));
const total = (damage) => round(Object.values(damage || {}).reduce((sum, value) => sum + value, 0), 3);

function ammoOf(ref) {
    const ammo = follow(ref, 8); if (!ammo) return undefined;
    const p = ammo.data.projectileParams || {}; const drop = p.damageDropParams || {};
    const damage = damageOf(p.damage);
    return prune({
        id: ammo.record.name.split('.').slice(1).join('.'), speed: round(ammo.data.speed, 1), lifetime: round(ammo.data.lifetime, 2),
        range: ammo.data.speed && ammo.data.lifetime ? round(ammo.data.speed * ammo.data.lifetime, 0) : undefined,
        damage, damageTotal: total(damage),
        drop: prune({ start: damageOf(drop.damageDropMinDistance), perMeter: damageOf(drop.damageDropPerMeter), floor: damageOf(drop.damageDropMinDamage) }),
        pierceability: round(ammo.data.physicsControllerParams?.PhysType?.pierceability, 2),
        explosion: p.detonationParams?.explosionParams ? prune({ damage: damageOf(p.detonationParams.explosionParams.damage), radius: round(p.detonationParams.explosionParams.maxRadius, 2) }) : undefined,
    });
}

// 발사 방식: 단발·연사·점사·충전·빔 등. 묶음(순차·병렬·조건) 안쪽까지 따라간다.
function modesOf(actions, out = []) {
    for (const action of (actions || []).filter(Boolean)) {
        const type = action.__type.replace(/^SWeaponAction/, '').replace(/Params$/, '');
        if (/^(Sequence|Parallel|DynamicCondition)$/.test(type)) {
            const inner = action.sequenceEntries?.map((entry) => entry.weaponAction) || action.weaponActions || action.defaultWeaponAction ? [...(action.sequenceEntries?.map((entry) => entry.weaponAction) || []), ...(action.weaponActions || []), action.defaultWeaponAction, ...(action.conditionalWeaponActions || []).map((entry) => entry.weaponAction)] : [];
            modesOf(inner, out); continue;
        }
        const fire = action.weaponAction || action; const launch = fire.launchParams || {};
        out.push(prune({
            kind: type.replace(/^Fire/, ''), name: text(action.localisedName) || action.name,
            rpm: round(fire.fireRate, 0), burst: fire.shotCount || undefined, pellets: launch.pelletCount > 1 ? launch.pelletCount : undefined,
            ammoPerShot: launch.ammoCost > 1 ? launch.ammoCost : undefined,
            spread: launch.spreadParams ? [round(launch.spreadParams.min, 2), round(launch.spreadParams.max, 2)] : undefined,
            charge: action.weaponAction ? prune({ time: round(action.chargeTime, 2), overcharge: round(action.overchargeTime, 2), cooldown: round(action.cooldownTime, 2), damageMultiplier: round(action.maxChargeModifier?.damageMultiplier, 2) }) : undefined,
            beamDps: fire.damagePerSecond ? damageOf(fire.damagePerSecond) : undefined, heatPerShot: round(fire.heatPerShot, 3) || undefined,
        }));
    }
    return out;
}

const portsOf = (entity) => (game.component(entity, 'SItemPortContainerComponentParams')?.Ports || []).map((port) => prune({
    name: port.Name, min: port.MinSize, max: port.MaxSize, types: (port.Types || []).map((rule) => [rule.Type, ...(rule.SubTypes || []).filter((s) => s && s !== 'UNDEFINED')].join('/')),
})).filter((port) => port.types?.length);

// 도색·소품 변형을 묶는 기본형 이름.
const weaponFamily = (cls) => (cls.match(/^([a-z]+_[a-z]+_[a-z]+_\d+)/i) || cls.match(/^([a-z]+_[a-z]+_\d+)/i) || [])[1]?.toLowerCase();
const armorFamily = (cls) => ((cls.match(/^(.+?_(?:core|arms|legs|helmet|undersuit|backpack|flightsuit|suit)_\d+)/i) || [])[1] || cls.replace(/(_\d+){1,2}$/, '')).toLowerCase();
const variantNote = (cls, family) => (family ? cls.slice(family.length).replace(/^_/, '') : '') || undefined;

function common(record, entity, def) {
    return { id: record.id, cls: game.clsOf(record), name: text(def.Localization?.Name), type: def.Type, sub: def.SubType !== 'UNDEFINED' ? def.SubType : undefined, size: def.Size, grade: def.Grade,
        manufacturer: manufacturerOf(def.Manufacturer), mass: round(game.component(entity, 'SEntityPhysicsControllerParams')?.PhysType?.Mass, 3), tags: String(def.Tags || '').split(/\s+/).filter(Boolean) };
}

const weapons = []; const attachments = []; const armor = [];
for (const record of game.records) {
    const isWeaponFile = /\/entities\/scitem\/weapons\//.test(record.file); const isArmorFile = /\/entities\/scitem\/characters\/human\/(armor|starwear|undersuit)/.test(record.file);
    if (!isWeaponFile && !isArmorFile) continue;
    const entity = game.entity(record, 12); const def = game.attach(entity);
    if (!def) continue;
    const cls = game.clsOf(record);
    const skip = /_ai$|_AI_|_npc|_template|_test|placeholder|_prop$|_dev/i.test(cls) || /\/dev\//.test(record.file);
    if (def.Type === 'WeaponPersonal') {
        const weapon = game.component(entity, 'SCItemWeaponComponentParams');
        const magazine = follow(weapon?.ammoContainerRecord, 8);
        const container = magazine ? game.component(magazine.data, 'SAmmoContainerComponentParams') : game.component(entity, 'SAmmoContainerComponentParams');
        const family = weaponFamily(cls);
        weapons.push(prune({ ...common(record, entity, def), family, variant: variantNote(cls.toLowerCase(), family), internal: skip || !text(def.Localization?.Name) || undefined,
            modes: modesOf(weapon?.fireActions), magazine: magazine ? magazine.record.name.split('.').slice(1).join('.') : undefined, magazineSize: container?.maxAmmoCount || undefined,
            ammo: ammoOf(container?.ammoParamsRecord), ports: portsOf(entity) }));
    } else if (def.Type === 'WeaponAttachment') {
        const container = game.component(entity, 'SAmmoContainerComponentParams');
        const modifier = game.component(entity, 'SWeaponModifierComponentParams')?.modifier?.weaponStats;
        attachments.push(prune({ ...common(record, entity, def), internal: skip || !text(def.Localization?.Name) || undefined, magazineSize: container?.maxAmmoCount || undefined, ammo: container ? ammoOf(container.ammoParamsRecord) : undefined,
            modifier: modifier ? prune({ fireRate: round(modifier.fireRateMultiplier, 3), damage: round(modifier.damageMultiplier, 3), projectileSpeed: round(modifier.projectileSpeedMultiplier, 3), recoil: round(modifier.recoilModifier?.fireRecoilStrengthMultiplier, 3), zoom: round(modifier.aimModifier?.zoomScale, 3), zoomTime: round(modifier.aimModifier?.zoomTimeScale, 3) }) : undefined }));
    } else if (/^Char_Armor_|^Char_Clothing_|^Suit/.test(def.Type) && /^Char_Armor_/.test(def.Type)) {
        const suit = game.component(entity, 'SCItemSuitArmorParams'); const clothing = game.component(entity, 'SCItemClothingParams');
        const resistance = follow(suit?.damageResistance, 4)?.data?.damageResistance;
        const inventory = follow(game.component(entity, 'SCItemInventoryContainerComponentParams')?.containerParams, 4)?.data;
        const family = armorFamily(cls);
        armor.push(prune({ ...common(record, entity, def), slot: def.Type.replace('Char_Armor_', '').toLowerCase(), family, variant: variantNote(cls.toLowerCase(), family), internal: skip || !text(def.Localization?.Name) || undefined,
            resistanceProfile: short(suit?.damageResistance),
            takes: resistance ? prune({ physical: round(resistance.PhysicalResistance?.Multiplier, 3), energy: round(resistance.EnergyResistance?.Multiplier, 3), distortion: round(resistance.DistortionResistance?.Multiplier, 3), thermal: round(resistance.ThermalResistance?.Multiplier, 3), biochemical: round(resistance.BiochemicalResistance?.Multiplier, 3), stun: round(resistance.StunResistance?.Multiplier, 3) }) : undefined,
            temperature: clothing?.TemperatureResistance ? [round(clothing.TemperatureResistance.MinResistance, 0), round(clothing.TemperatureResistance.MaxResistance, 0)] : undefined,
            radiation: clothing?.RadiationResistance ? prune({ capacity: round(clothing.RadiationResistance.MaximumRadiationCapacity, 0), dissipation: round(clothing.RadiationResistance.RadiationDissipationRate, 1) }) : undefined,
            storageMicroSCU: inventory?.inventoryType?.capacity?.microSCU || undefined, ports: portsOf(entity) }));
    }
}
const byName = (x, y) => (x.name || x.cls).localeCompare(y.name || y.cls) || x.cls.localeCompare(y.cls);
const families = (list) => { const map = new Map(); for (const item of list) if (item.family && !item.internal) map.set(item.family, (map.get(item.family) || 0) + 1); return map.size; };
writeData('fps-weapons.json', { ...base, note: 'takes/damage 등은 원본 값. family = 도색·소품 변형을 묶는 기본형. internal = 이름이 없거나 AI·시험용.', weapons: weapons.sort(byName) });
writeData('fps-attachments.json', { ...base, attachments: attachments.sort(byName) });
writeData('fps-armor.json', { ...base, note: 'takes = 받는 피해 비율(낮을수록 단단하다). temperature = 견디는 온도 범위(도).', armor: armor.sort(byName) });
console.log(`무기 ${weapons.length}(내부 ${weapons.filter((w) => w.internal).length}, 기본형 ${families(weapons)}), 부착물 ${attachments.length}, 방어구 ${armor.length}(내부 ${armor.filter((x) => x.internal).length}, 기본형 ${families(armor)})`);
