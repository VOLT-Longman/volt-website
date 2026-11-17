// 게임 파일(Game2.dcb · 함선 구조 XML)에서 로드아웃 계산에 필요한 원본 값을 뽑아 data/loadout-research/*.json 으로 적는다.
//   node scripts/loadout-research/extract-profiles.mjs --cache-dir <게임 캐시 폴더>
// 원칙: 원본 필드 이름을 그대로 둔다. 없는 값은 null 로 두고 0 으로 채우지 않는다. 계산값은 derived 아래에만 둔다.
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { args, requireDir, loadGame, repoJson, manifestBase, enumTable, OUT_DATA } from './lib.mjs';
import { parseCryXml } from '../gamedata/p4k.mjs';
import * as calc from './calc.mjs';

const a = args();
const cacheDir = requireDir(a['cache-dir'], 'cache-dir');
const game = loadGame(cacheDir);
const { df } = game;
const enums = enumTable(df);
const items = repoJson('data/loadout/items.json').items;
const shipIndex = repoJson('data/loadout/index.json').ships;
const meta = manifestBase(game);

// ---- 공용 ---------------------------------------------------------------
const sig = (n) => (typeof n === 'number' && Number.isFinite(n) ? Number(n.toPrecision(7)) : null);
const DROP = /audio|sound|rtpc|effect|vfx|^anim|animation|camera|shake|geometry|material|particle|helper|vibration|^hud|interaction|localization|icon|thumbnail|decal|message|fragment|reticle|backwash|tint|^ui|weaponAIData|aiProperties|recoil|aimModifier|scopeZoom|overrideDisplayStats/i;
// 원본 구조를 그대로 옮기되 연출·음향 가지는 버린다. 참조는 "@이름" 문자열로 바꾼다.
function clean(value, { depth = 8, drop = DROP, keepNull = false } = {}) {
    if (value === null || value === undefined) return null;
    if (typeof value === 'number') return sig(value);
    if (typeof value !== 'object') return value;
    if (depth < 0) return undefined;
    if (Array.isArray(value)) return value.map((v) => clean(v, { depth: depth - 1, drop, keepNull }));
    if (value.__record) return `@${value.name}`;
    const out = {};
    for (const key of Object.keys(value)) {
        if (key === '__type' || drop.test(key)) continue;
        const v = clean(value[key], { depth: depth - 1, drop, keepNull });
        if (v === undefined || (!keepNull && (v === null || v === '' || (Array.isArray(v) && !v.length)))) continue;
        out[key] = v;
    }
    return out;
}
function dropNulls(value) {
    if (Array.isArray(value)) return value.map(dropNulls);
    if (value && typeof value === 'object') { const out = {}; for (const [k, v] of Object.entries(value)) { if (v === null || v === undefined) continue; out[k] = dropNulls(v); } return out; }
    return value;
}
const comp = (entity, type) => (entity?.Components || []).find((c) => c && c.__type === type);
const comps = (entity, re) => (entity?.Components || []).filter((c) => c && re.test(c.__type));
const entityOf = (key, depth = 12) => { const record = game.byId.get(key) || game.byClass.get(String(key).toLowerCase()); return record ? { record, entity: game.entity(record, depth) } : null; };
const follow = (ref, depth = 10) => { const record = ref?.__record ? df.recordById.get(ref.__record) : null; return record ? df.readRecord(record, depth) : null; };
const DAMAGE = { DamagePhysical: 'physical', DamageEnergy: 'energy', DamageDistortion: 'distortion', DamageThermal: 'thermal', DamageBiochemical: 'biochemical', DamageStun: 'stun' };
const damageOf = (block) => { if (!block) return null; const out = {}; for (const [k, name] of Object.entries(DAMAGE)) out[name] = sig(block[k]) ?? null; return out; };
const curve = (c) => (c?.points ? c.points.map((p) => [sig(p.x), sig(p.y)]) : null);
const ident = (id, item) => ({ uuid: id, cls: item.cls, name: item.name, type: item.type, sub: item.sub ?? null, size: item.size ?? null, grade: item.grade ?? null, hidden: Boolean(item.hidden), alias: item.alias ?? null });

// 품목을 한 줄씩 적어 파일 크기와 차이 비교를 다루기 쉽게 한다.
function writeProfile(file, head, maps) {
    mkdirSync(OUT_DATA, { recursive: true });
    const lines = [`{`];
    const headKeys = Object.keys(head);
    for (const k of headKeys) lines.push(`${JSON.stringify(k)}: ${JSON.stringify(head[k], null, 1)},`);
    const mapKeys = Object.keys(maps);
    mapKeys.forEach((k, mi) => {
        const entries = Object.entries(maps[k]);
        lines.push(`${JSON.stringify(k)}: {`);
        entries.forEach(([id, v], i) => { lines.push(`${JSON.stringify(id)}: ${JSON.stringify(v)}${i < entries.length - 1 ? ',' : ''}`); });
        lines.push(`}${mi < mapKeys.length - 1 ? ',' : ''}`);
    });
    lines.push('}');
    writeFileSync(resolve(OUT_DATA, file), `${lines.join('\n')}\n`);
    console.log(`wrote data/loadout-research/${file}: ${mapKeys.map((k) => `${k}=${Object.keys(maps[k]).length}`).join(', ')}`);
}

// ---- 자원(전력·냉각) --------------------------------------------------------
const amount = (x) => { if (!x) return null; const key = Object.keys(x).find((k) => k !== '__type'); return key ? { value: sig(x[key]), unit: key } : null; };
function resourceProfile(entity) {
    const rc = comp(entity, 'ItemResourceComponentParams');
    if (!rc) return null;
    return {
        isRelay: rc.isRelay ?? null, defaultPriority: rc.defaultPriority ?? null,
        states: (rc.states || []).filter(Boolean).map((s) => ({
            name: s.name,
            deltas: (s.deltas || []).filter(Boolean).map((d) => ({
                kind: String(d.__type || '').replace('ItemResourceDelta', ''),
                minimumConsumptionFraction: sig(d.minimumConsumptionFraction),
                consumption: d.consumption ? { resource: d.consumption.resource, ...amount(d.consumption.resourceAmountPerSecond) } : null,
                generation: d.generation ? { resource: d.generation.resource, ...amount(d.generation.resourceAmountPerSecond) } : null,
                dynamicAmountOverride: d.dynamicAmountOverride?.__type || d.dynamicResourceOverride?.__type || null,
            })),
            em: s.signatureParams?.EMSignature ? { nominal: sig(s.signatureParams.EMSignature.nominalSignature), decayRate: sig(s.signatureParams.EMSignature.decayRate), functionalityCurve: curve(s.signatureParams.EMSignature.functionalityCurve) } : null,
            ir: s.signatureParams?.IRSignature ? { nominal: sig(s.signatureParams.IRSignature.nominalSignature), decayRate: sig(s.signatureParams.IRSignature.decayRate), functionalityCurve: curve(s.signatureParams.IRSignature.functionalityCurve) } : null,
            powerRanges: s.powerRanges ? Object.fromEntries(['low', 'medium', 'high'].map((k) => [k, s.powerRanges[k] ? { start: sig(s.powerRanges[k].start), modifier: sig(s.powerRanges[k].modifier), registerRange: s.powerRanges[k].registerRange } : null])) : null,
        })),
        functionalityModifiers: clean(rc.functionalityModifiers), powerPlantOverride: clean(rc.powerPlantOverride),
        selfRepair: clean(rc.selfRepair), repairRestoreRatio: sig(rc.repairRestoreRatio),
    };
}
function temperatureProfile(entity) {
    const t = comp(entity, 'SEntityPhysicsControllerParams')?.PhysType?.temperature;
    if (!t) return null;
    const r = t.itemResourceParams;
    return {
        enable: t.enable ?? null, initialTemperature: sig(t.initialTemperature), internalTemperatureGeneration: sig(t.internalTemperatureGeneration),
        coolingEqualization: t.coolingEqualizationParams ? { rate: sig(t.coolingEqualizationParams.coolingEqualizationRate), temperatureDifference: sig(t.coolingEqualizationParams.temperatureDifference) } : null,
        irFromTemperature: t.signatureParams ? { enable: t.signatureParams.enable, minimumTemperatureForIR: sig(t.signatureParams.minimumTemperatureForIR), temperatureToIR: sig(t.signatureParams.temperatureToIR) } : null,
        operating: r ? {
            poweredAmbientCoolingMultiplier: sig(r.poweredAmbientCoolingMultiplier), minOperatingTemperature: sig(r.minOperatingTemperature), minCoolingTemperature: sig(r.minCoolingTemperature),
            enableOverheat: r.enableOverheat ?? null, overheatTemperature: sig(r.overheatTemperature), overheatWarningTemperature: sig(r.overheatWarningTemperature), overheatRecoveryTemperature: sig(r.overheatRecoveryTemperature),
            stateHeat: (r.stateHeatGenerationValues || []).filter(Boolean).map((h) => ({ state: h.state?.name ?? null, resource: h.resource ?? null, baselineTemperatureChange: sig(h.baselineTemperatureChange) })),
        } : null,
        misfireTemperatureRange: t.misfireTemperatureRange ? [sig(t.misfireTemperatureRange.minimum), sig(t.misfireTemperatureRange.maximum)] : null,
    };
}
function healthProfile(entity) {
    const h = comp(entity, 'SHealthComponentParams');
    if (!h) return null;
    const r = h.DamageResistances || {};
    const entry = (e) => (e ? { multiplier: sig(e.Multiplier), threshold: sig(e.Threshold) } : null);
    return { health: sig(h.Health), damageCap: sig(h.DamageCap), resistance: { physical: entry(r.PhysicalResistance), energy: entry(r.EnergyResistance), distortion: entry(r.DistortionResistance) } };
}
const controlProfile = (entity) => { const c = comp(entity, 'ItemControlComponentParams'); return c ? { turnedOnByDefault: c.turnedOnByDefault ?? null, forceOn: c.forceOn ?? null, masterModeExclusionsOverride: clean(c.masterModeExclusionsOverride) } : null; };
function powerEntry(entity) {
    const resource = resourceProfile(entity);
    if (!resource) return null;
    // 원본에 없는 칸은 싣지 않는다(해당 없음). null 은 '있어야 하는데 확인하지 못한 값'에만 쓴다.
    return dropNulls({ resource, temperature: temperatureProfile(entity), distortion: clean(comp(entity, 'SDistortionParams')), health: healthProfile(entity), control: controlProfile(entity) });
}

// ---- 무기 -------------------------------------------------------------------
const STAT_DEFAULT = (key, v) => (typeof v === 'boolean' ? v === false : /Multiplier$|^extractionEfficiency$/.test(key) ? v === 1 : v === 0);
function nonDefaultStats(block) {
    if (!block) return null;
    const out = {};
    const walk = (node, prefix) => {
        for (const k of Object.keys(node)) {
            if (k === '__type' || /recoil|aimModifier/i.test(k)) continue;
            const v = node[k];
            if (v && typeof v === 'object') walk(v, `${prefix}${k}.`);
            else if (v !== null && !STAT_DEFAULT(k, v)) out[`${prefix}${k}`] = sig(v) ?? v;
        }
    };
    walk(block, '');
    return out;
}
function actionOf(action) {
    if (!action) return null;
    const type = String(action.__type || '').replace(/^SWeaponAction|Params$/g, '');
    const launch = action.launchParams;
    const base = { type, name: action.name ?? null };
    if (launch) base.launch = { ammoCost: sig(launch.ammoCost), heatCost: sig(launch.heatCost), pelletCount: sig(launch.pelletCount), damageMultiplier: sig(launch.damageMultiplier), projectileType: launch.projectileType ?? null, spread: launch.spreadParams ? { min: sig(launch.spreadParams.min), max: sig(launch.spreadParams.max), firstAttack: sig(launch.spreadParams.firstAttack), attack: sig(launch.spreadParams.attack), decay: sig(launch.spreadParams.decay) } : null };
    for (const k of ['fireRate', 'heatPerShot', 'wearPerShot', 'shotCount', 'cooldownTime', 'chargeTime', 'overchargeTime', 'overchargedTime', 'spinUpTime', 'spinDownTime', 'fullDamageRange', 'zeroDamageRange', 'heatPerSecond', 'hitRadius', 'toggle', 'minEnergyDraw', 'maxEnergyDraw', 'energyRate', 'fireOnFullCharge', 'fireOnlyOnFullCharge', 'mode']) if (action[k] !== undefined && action[k] !== null) base[k] = sig(action[k]) ?? action[k];
    if (action.damagePerSecond) base.damagePerSecond = damageOf(action.damagePerSecond);
    if (action.maxChargeModifier) base.maxChargeModifier = nonDefaultStats(action.maxChargeModifier);
    if (action.overchargeModifier) base.overchargeModifier = nonDefaultStats(action.overchargeModifier);
    if (action.sequenceEntries) base.sequence = action.sequenceEntries.filter(Boolean).map((e) => ({ delay: sig(e.delay), unit: e.unit ?? null, repetitions: sig(e.repetitions), action: actionOf(e.weaponAction) }));
    if (action.weaponAction) base.inner = actionOf(action.weaponAction);
    return base;
}
function ammoOf(ref) {
    const ammo = follow(ref);
    if (!ammo) return null;
    const p = ammo.projectileParams || {};
    const det = p.detonationParams?.explosionParams;
    return {
        record: ref.name, size: sig(ammo.size), speed: sig(ammo.speed), lifetime: sig(ammo.lifetime), inheritVelocity: sig(ammo.inheritVelocity),
        damage: damageOf(p.damage), detonation: det ? { damage: damageOf(det.damage), minRadius: sig(det.minRadius), maxRadius: sig(det.maxRadius) } : null,
        impactRadius: sig(p.impactRadius), minImpactRadius: sig(p.minImpactRadius),
        damageDrop: clean(p.damageDropParams), pierceability: sig(ammo.physicsControllerParams?.PhysType?.pierceability),
        pierceabilityParams: clean(p.pierceabilityParams), penetration: clean(p.penetrationParams),
        resourceType: ammo.resourceType?.name ?? null, conversionRateMicroSCU: sig(ammo.conversionRate?.microSCU),
    };
}
function weaponEntry(id, item, entity) {
    const w = comp(entity, 'SCItemWeaponComponentParams');
    if (!w) return null;
    const box = comp(entity, 'SAmmoContainerComponentParams');
    const c = w.connectionParams || {};
    const modes = (w.fireActions || []).map(actionOf);
    const ammo = ammoOf(box?.ammoParamsRecord);
    const heat = c.simplifiedHeatParams ? clean(c.simplifiedHeatParams) : null;
    const regen = w.weaponRegenConsumerParams ? clean(w.weaponRegenConsumerParams, { keepNull: true }) : null;
    const out = {
        ...ident(id, item), modes, ammo, maxAmmoCount: sig(box?.maxAmmoCount), initialAmmoCount: sig(box?.initialAmmoCount), maxRestockCount: sig(box?.maxRestockCount),
        connection: { powerActiveCooldown: sig(c.powerActiveCooldown), heatRateOnline: sig(c.heatRateOnline), lockOnOverheat: c.lockOnOnverheat ?? null, heatReduceWhenOverheatIsFixed: sig(c.heatReduceWhenOverheatIsFixed) },
        simplifiedHeat: heat, regen,
        statBlocks: Object.fromEntries(['noPowerStats', 'underpowerStats', 'overpowerStats', 'overclockStats', 'heatStats'].map((k) => [k, nonDefaultStats(c[k])])),
        gimbalModeModifier: w.gimbalModeModifierRecord?.name ?? null, aimableAngles: w.aimableAnglesRecord?.name ?? null,
        powerUse: (resourceProfile(entity)?.states?.[0]?.deltas || []).filter((d) => d.consumption?.resource === 'Power').map((d) => ({ ...d.consumption, minimumConsumptionFraction: d.minimumConsumptionFraction }))[0] || null,
        health: healthProfile(entity),
    };
    out.derived = calc.weaponDerived(out);
    return out;
}

// ---- 함선 기본 장착 훑기 ------------------------------------------------------
function walkLoadout(entries, visit, path = '') {
    for (const entry of entries || []) {
        if (!entry) continue;
        const record = entry.entityClassReference?.__record ? df.recordById.get(entry.entityClassReference.__record) : (entry.entityClassName ? game.byClass.get(String(entry.entityClassName).toLowerCase()) : null);
        if (!record) continue;
        const port = `${path}${entry.itemPortName}`;
        const entity = game.entity(record, 12);
        visit(record, entity, port);
        const nested = entry.loadout?.entries?.length ? entry.loadout.entries : (comp(entity, 'SEntityComponentDefaultLoadoutParams')?.loadout?.entries || []);
        walkLoadout(nested, visit, `${port}/`);
    }
}
const xmlDir = resolve(cacheDir, 'vehicles');
const xmlFiles = new Map(readdirSync(xmlDir).map((f) => [f.toLowerCase(), resolve(xmlDir, f)]));

// ---- 수집 -------------------------------------------------------------------
const power = {}; const weapons = {}; const ordnance = {}; const shields = {}; const drives = {}; const jumpDrives = {}; const radars = {}; const turrets = {}; const utility = {};
const FIXED_TYPES = new Set(['ShieldController', 'FlightController', 'MainThruster', 'ManneuverThruster', 'FuelTank', 'QuantumFuelTank', 'ExternalFuelTank', 'FuelIntake', 'Relay', 'LifeSupportGenerator', 'WheeledController', 'Armor']);
const fixedPower = {}; // 교체할 수 없는 기본 장비(추진기·제어기·탱크 등)는 클래스명으로 한 번만 싣는다.
for (const [id, item] of Object.entries(items)) {
    const found = entityOf(id);
    if (!found) { continue; }
    const { entity } = found;
    const p = powerEntry(entity);
    if (p) power[id] = { ...ident(id, item), ...p };
    if (item.type === 'WeaponGun' || item.type === 'WeaponMining' || item.type === 'WeaponDefensive' || item.type === 'TractorBeam' || item.type === 'TowingBeam' || item.type === 'SalvageHead') {
        const w = weaponEntry(id, item, entity);
        if (w && item.type === 'WeaponGun') weapons[id] = w;
        else if (w) utility[id] = { ...w, mining: clean(comp(entity, 'SEntityComponentMiningLaserParams')), salvage: clean(comp(entity, 'SCItemSalvageHeadParams') || comp(entity, 'SalvageHeadParams')), tractor: clean(comps(entity, /TractorBeam/)[0]), countermeasure: clean(comps(entity, /Countermeasure/i)[0]) };
    }
    if (item.type === 'MiningModifier' || item.type === 'SalvageModifier') utility[id] = { ...ident(id, item), modifier: clean(comps(entity, /Modifier|MiningLaser|Salvage/i).map((c) => ({ component: c.__type, ...c }))), charges: sig(comp(entity, 'SAmmoContainerComponentParams')?.maxAmmoCount) };
    const missile = comp(entity, 'SCItemMissileParams'); const bomb = comp(entity, 'SCItemBombParams'); const emp = comp(entity, 'SCItemEMPParams'); const qig = comp(entity, 'SCItemQuantumInterdictionGeneratorParams');
    if (missile || bomb || emp || qig) {
        const m = missile || bomb;
        ordnance[id] = {
            ...ident(id, item),
            missile: m ? { requiresLauncher: m.requiresLauncher ?? null, maxLifetime: sig(m.maxLifetime), armTime: sig(m.armTime), igniteTime: sig(m.igniteTime), explosionSafetyDistance: sig(m.explosionSafetyDistance), projectileProximity: sig(m.projectileProximity),
                explosion: m.explosionParams ? { damage: damageOf(m.explosionParams.damage), minRadius: sig(m.explosionParams.minRadius), maxRadius: sig(m.explosionParams.maxRadius), minPhysRadius: sig(m.explosionParams.minPhysRadius), maxPhysRadius: sig(m.explosionParams.maxPhysRadius), friendlyFire: m.explosionParams.friendlyFire ?? null, hitType: m.explosionParams.hitType ?? null } : null,
                cluster: clean(m.clusterParams), guidance: m.GCSParams ? { isDumbMissile: m.GCSParams.isDumbMissile, linearSpeed: sig(m.GCSParams.linearSpeed), boostPhaseDuration: sig(m.GCSParams.boostPhaseDuration), fuelTankSize: sig(m.GCSParams.fuelTankSize), terminalPhaseEngagementTime: sig(m.GCSParams.terminalPhaseEngagementTime), terminalPhaseEngagementAngle: sig(m.GCSParams.terminalPhaseEngagementAngle), interceptAngularSpeed: sig(m.GCSParams.interceptPhase?.angularSpeed), terminalAngularSpeed: sig(m.GCSParams.terminalPhase?.angularSpeed) } : null,
                targeting: clean(m.targetingParams), penetration: clean(m.penetrationParams) } : null,
            emp: clean(emp), interdiction: clean(qig),
        };
    }
    const shield = comp(entity, 'SCItemShieldGeneratorParams');
    if (shield) {
        const pair = (list) => (Array.isArray(list) ? Object.fromEntries((enums.get('DamageTypes') || []).map((name, i) => [name.toLowerCase(), list[i] ? { min: sig(list[i].Min), max: sig(list[i].Max) } : null])) : null);
        const { ShieldResistance: _r, ShieldAbsorption: _a, ...rest } = shield;
        shields[id] = { ...ident(id, item), params: clean(rest), resistance: pair(shield.ShieldResistance), absorption: pair(shield.ShieldAbsorption), power: power[id]?.resource?.states?.[0] || null };
    }
    const quantum = comp(entity, 'SCItemQuantumDriveParams');
    if (quantum) {
        const leg = (p) => (p ? { driveSpeed: sig(p.driveSpeed), cooldownTime: sig(p.cooldownTime), stageOneAccelRate: sig(p.stageOneAccelRate), stageTwoAccelRate: sig(p.stageTwoAccelRate), engageSpeed: sig(p.engageSpeed), spoolUpTime: sig(p.spoolUpTime), calibrationRate: sig(p.calibrationRate), minCalibrationRequirement: sig(p.minCalibrationRequirement), maxCalibrationRequirement: sig(p.maxCalibrationRequirement), calibrationProcessAngleLimit: sig(p.calibrationProcessAngleLimit), calibrationWarningAngleLimit: sig(p.calibrationWarningAngleLimit), calibrationDelayInSeconds: sig(p.calibrationDelayInSeconds), travellingFuel: (p.travellingState?.deltas || []).filter((d) => d?.consumption?.resource === 'QuantumFuel').map((d) => ({ ...amount(d.consumption.resourceAmountPerSecond), dynamicAmountOverride: d.dynamicAmountOverride?.__type || null }))[0] || null } : null);
        drives[id] = { ...ident(id, item), quantumFuelRequirement: sig(quantum.quantumFuelRequirement), jumpRange: quantum.jumpRange > 1e30 ? 'unlimited' : sig(quantum.jumpRange), disconnectRange: sig(quantum.disconnectRange), params: leg(quantum.params), splineJumpParams: leg(quantum.splineJumpParams), heatParams: clean(quantum.heatParams), interdictionEffectTime: sig(quantum.interdictionEffectTime) };
    }
    if (item.type === 'JumpDrive') jumpDrives[id] = { ...ident(id, item), params: clean(comps(entity, /JumpDrive/i)[0]), power: power[id]?.resource?.states || null };
    const radar = comp(entity, 'SCItemRadarComponentParams');
    if (radar) {
        const types = enums.get('ESignatureType') || [];
        radars[id] = {
            ...ident(id, item),
            signatureDetection: Object.fromEntries((radar.signatureDetection || []).map((d, i) => [types[i] || `index${i}`, d ? { sensitivity: sig(d.sensitivity), deltaSignatureSensitivity: sig(d.deltaSignatureSensitivity), piercing: sig(d.piercing), deltaSignaturePierce: sig(d.deltaSignaturePierce), permitPassiveDetection: d.permitPassiveDetection, permitActiveDetection: d.permitActiveDetection } : null])),
            sensitivityModifiers: clean(radar.sensitivityModifiers), pingProperties: clean(radar.pingProperties), sharedParams: radar.sharedParams?.name ?? null,
            other: clean(Object.fromEntries(Object.entries(radar).filter(([k]) => !/signatureDetection|sensitivityModifiers|pingProperties|contactGroups|deltaSignatureSpike|__type/.test(k))), { depth: 3 }),
            power: power[id]?.resource?.states?.[0] || null,
        };
    }
    if (item.type === 'Turret' || item.type === 'TurretBase' || item.type === 'UtilityTurret') {
        const turret = comp(entity, 'SCItemTurretParams');
        turrets[id] = {
            ...ident(id, item), tags: item.tags || [], componentTypes: (entity.Components || []).map((c) => c?.__type).filter((t) => /Turret|Seat|Remote|Aimable|Weapon|PDC|PointDefen[cs]e|AI/i.test(t || '')),
            turret: turret ? clean({ ...Object.fromEntries(Object.entries(turret).filter(([k]) => !/movementList|rotation|joint|pitch|yaw/i.test(k))) }, { depth: 3 }) : null,
        };
    }
}

// ---- 전역 규칙 레코드 ---------------------------------------------------------
const recordsOf = (prefix) => df.records.filter((r) => r.name.startsWith(`${prefix}.`));
const rn = df.readRecord(recordsOf('ItemResourceNetworkGlobal')[0], 8);
const mm = df.readRecord(recordsOf('MasterModeExclusionGlobalParams')[0], 6);
const globals = {
    itemResourceNetwork: { record: 'ItemResourceNetworkGlobal.ItemResourceNetworkGlobal', maxPowerToCoolantRatio: sig(rn.maxPowerToCoolantRatio), thrusterCoolantMultiplier: sig(rn.thrusterCoolantMultiplier), powerBaseConversionRate: sig(rn.powerBaseConversionRate), networkResources: (rn.networkResources || []).map((r) => ({ name: r.name, containerResources: (r.containerResources || []).map((c) => c?.name), affectsItemFunctionality: r.affectsItemFunctionality, isShared: r.isShared, itemMustBeOnline: r.itemMustBeOnline })) },
    masterModeExclusions: { record: 'MasterModeExclusionGlobalParams.MasterModeExclusionGlobalParams', masterModes: enums.get('EMasterMode') || null, exclusions: (mm.exclusions || []).map((e) => ({ itemType: e.itemType, excludedIn: e.masterModeExclusions })) },
    capacitorAssignmentCurves: Object.fromEntries(recordsOf('CapacitorAssignmentInputOutputDef').map((r) => [r.name.split('.')[1], clean(df.readRecord(r, 6))])),
    enums: Object.fromEntries(['ESignatureType', 'EMasterMode', 'EGimbalMode', 'EAimableUser', 'EAimableAimType', 'EAimableGimbalState', 'DamageTypes', 'EThrusterType', 'EItemResourceNegativeStates'].map((k) => [k, enums.get(k) || null])),
};
const gimbalModes = enums.get('EGimbalMode') || [];
const gimbalModifiers = Object.fromEntries(recordsOf('WeaponGimbalModeModifierDef').map((r) => {
    const data = df.readRecord(r, 8);
    return [r.name.split('.')[1], Object.fromEntries((data.weaponGimbalModeModifiers || []).map((m, i) => [gimbalModes[i] || `index${i}`, m ? nonDefaultStats(m.weaponStats) : null]))];
}));
const radarGlobal = clean(df.readRecord(recordsOf('RadarSystemGlobalParams')[0], 8));
const radarShared = Object.fromEntries(recordsOf('RadarSystemSharedParams').map((r) => [r.name.split('.')[1], clean(df.readRecord(r, 8), { depth: 6 })]));

// ---- 함선 -------------------------------------------------------------------
const shipPower = {}; const shipDefense = {}; const shipFlight = {}; const shipQuantum = {}; const shipRadar = {};
const thrusterTypes = enums.get('EThrusterType') || [];
for (const ship of shipIndex) {
    const found = entityOf(ship.cls);
    if (!found) continue;
    const { entity, record } = found;
    const vehicle = comp(entity, 'VehicleComponentParams') || {};
    const ports = comp(entity, 'SItemPortContainerComponentParams');
    const signature = comp(entity, 'SSCSignatureSystemParams');
    const cs = signature?.radarProperties?.crossSectionParams;
    const shipFile = repoJson(`data/loadout/ships/${ship.cls}.json`);
    const sums = { powerGeneration: 0, powerUseMax: 0, powerUseMin: 0, coolantGeneration: 0, coolantUse: 0 };
    const fixed = {}; const thrusters = []; const tanks = []; const emitters = []; const armors = []; const flight = []; const lifeSupport = []; const intakes = [];
    walkLoadout(comp(entity, 'SEntityComponentDefaultLoadoutParams')?.loadout?.entries, (rec, e, port) => {
        const cls = game.clsOf(rec); const def = game.attach(e) || {};
        const res = resourceProfile(e);
        for (const d of res?.states?.[0]?.deltas || []) {
            if (d.generation?.resource === 'Power') sums.powerGeneration += d.generation.value || 0;
            if (d.generation?.resource === 'Coolant') sums.coolantGeneration += d.generation.value || 0;
            if (d.consumption?.resource === 'Power') { sums.powerUseMax += d.consumption.value || 0; sums.powerUseMin += (d.consumption.value || 0) * (d.minimumConsumptionFraction ?? 0); }
            if (d.consumption?.resource === 'Coolant') sums.coolantUse += d.consumption.value || 0;
        }
        if (res && !items[rec.id]) { fixed[cls] = (fixed[cls] || 0) + 1; if (!fixedPower[cls] && FIXED_TYPES.has(def.Type)) fixedPower[cls] = { uuid: rec.id, cls, type: def.Type ?? null, sub: def.SubType ?? null, size: def.Size ?? null, ...powerEntry(e) }; }
        const thr = comp(e, 'SCItemThrusterParams');
        if (thr) thrusters.push({ cls, uuid: rec.id, thrusterType: thr.thrusterType, thrustCapacity: sig(thr.thrustCapacity), thrustCapacityNew: sig(thr.thrustCapacityNew), fuelBurnRatePer10KNewton: sig(thr.fuelBurnRatePer10KNewton), fuelBurnRatePer10KNewtonRN: sig(thr.fuelBurnRatePer10KNewtonRN?.standardResourceUnits), minHealthThrustMultiplier: sig(thr.minHealthThrustMultiplier), onlyActiveInVTOL: thr.onlyActiveInVTOL, noFuelThresholdRatio: sig(thr.noFuelThresholdRatio) });
        if (comp(e, 'SCItemFuelTankParams')) { const c = comp(e, 'ResourceContainer'); tanks.push({ port, cls, uuid: rec.id, type: def.Type, capacity: amount(c?.capacity), resources: (c?.inclusiveResources || []).map((r) => r?.name) }); }
        if (def.Type === 'FuelIntake') intakes.push({ port, cls, uuid: rec.id, params: clean(comps(e, /FuelIntake/)[0]), resource: res?.states?.[0]?.deltas || null });
        const emitter = comp(e, 'SCItemShieldEmitterParams');
        if (emitter) emitters.push({ port, cls, uuid: rec.id, ...clean(emitter) });
        const armor = comp(e, 'SCItemVehicleArmorParams');
        if (armor) armors.push({ port, cls, uuid: rec.id, health: healthProfile(e), signalInfrared: sig(armor.signalInfrared), signalElectromagnetic: sig(armor.signalElectromagnetic), signalCrossSection: sig(armor.signalCrossSection), damageMultiplier: damageOf(armor.damageMultiplier), armorPenetrationResistance: armor.armorPenetrationResistance ? { basePenetrationReduction: sig(armor.armorPenetrationResistance.basePenetrationReduction), penetrationAbsorptionForType: damageOf(armor.armorPenetrationResistance.penetrationAbsorptionForType) } : null, armorDeflection: armor.armorDeflection ? { deflectionValue: damageOf(armor.armorDeflection.deflectionValue), healthCurve: curve(armor.armorDeflection.healthCurve) } : null });
        const ifcs = comp(e, 'IFCSParams');
        if (ifcs) {
            const ab = ifcs.afterburnerNew || ifcs.afterburner || {};
            flight.push({
                port, cls, uuid: rec.id, scmSpeed: sig(ifcs.scmSpeed), boostSpeedForward: sig(ifcs.boostSpeedForward), boostSpeedBackward: sig(ifcs.boostSpeedBackward), maxSpeed: sig(ifcs.maxSpeed), maxAngularVelocity: clean(ifcs.maxAngularVelocity),
                positiveLinearScale: clean(ifcs.positiveLinearScale), negativeLinearScale: clean(ifcs.negativeLinearScale), positiveAngularScale: clean(ifcs.positiveAngularScale), negativeAngularScale: clean(ifcs.negativeAngularScale),
                linearAccelDecay: sig(ifcs.linearAccelDecay), angularAccelDecay: sig(ifcs.angularAccelDecay), speedProfile: clean({ positiveLinearTimeToFullSpeed: ifcs.speedProfile?.positiveLinearTimeToFullSpeed, negativeLinearTimeToFullSpeed: ifcs.speedProfile?.negativeLinearTimeToFullSpeed, angularVelocity: ifcs.speedProfile?.angularVelocity }),
                powerCurves: { linearThrustPowerAssignmentModifier: curve(ifcs.accelerationData?.linearThrustPowerAssignmentModifier), angularThrustPowerAssignmentModifier: curve(ifcs.accelerationData?.angularThrustPowerAssignmentModifier), powerAssignmentRotationModifier: curve(ifcs.speedProfile?.powerAssignmentRotationModifier?.mapping), coreOffRotationModifier: curve(ifcs.speedProfile?.coreOffRotationModifier?.mapping), linearSpeedRotationModifier: curve(ifcs.speedProfile?.linearSpeedRotationModifier?.mapping) },
                afterburnerSource: ifcs.afterburnerNew ? 'afterburnerNew' : 'afterburner',
                afterburner: clean(Object.fromEntries(Object.entries(ab).filter(([k]) => !/Curve|Mapping/.test(k)))), afterburnerAngCapacitorScalingCurve: curve(ab.afterburnerAngCapacitorScalingCurve), afterburnerLegacy: ifcs.afterburnerNew && ifcs.afterburner ? clean(Object.fromEntries(Object.entries(ifcs.afterburner).filter(([k]) => /capacitor|Speed|AccelMultiplier/.test(k)))) : null,
                fuelUsage: clean(Object.fromEntries(Object.entries(ifcs.fuelUsageParams || {}).filter(([k]) => !/atmosphericModifier/.test(k)))), noFuelParams: clean(ifcs.noFuelParams), ifcsCore: clean(ifcs.ifcsCoreParams), modifiers: clean(ifcs.modifiers), authoredMotionLimits: clean(ifcs.authoredMotionLimits),
            });
        }
        if (def.Type === 'LifeSupportGenerator' || /LifeSupport/i.test(def.Type || '')) lifeSupport.push({ port, cls, uuid: rec.id, size: def.Size ?? null, resource: res?.states?.[0]?.deltas || null, params: clean(comps(e, /LifeSupport/i)[0]) });
    });
    const base = { cls: ship.cls, uuid: record.id, name: ship.name };
    shipPower[ship.cls] = {
        ...base, powerPools: (ports?.resourceNetworkPowerPools?.itemPools || []).filter(Boolean).map((p) => ({ kind: String(p.__type || '').replace('ResourceNetworkPowerPool', '') || null, itemType: p.itemType ?? null, poolSize: sig(p.poolSize), maxItemCount: sig(p.maxItemCount) })),
        maxDefaultDistribution: ports?.resourceNetworkPowerPools?.maxDefaultDistribution ?? null,
        defaultLoadoutTotals: Object.fromEntries(Object.entries(sums).map(([k, v]) => [k, sig(v)])), fixedItems: fixed,
        crossSection: cs?.crossSection ? { x: sig(cs.crossSection.x), y: sig(cs.crossSection.y), z: sig(cs.crossSection.z), source: String(cs.__type || '') } : null,
        emPool: clean(comp(entity, 'EMPoolParams')), armorSignalMultipliers: armors[0] ? { infrared: armors[0].signalInfrared, electromagnetic: armors[0].signalElectromagnetic, crossSection: armors[0].signalCrossSection } : null,
    };
    // 선체 부위: 함선 구조 XML 의 Part (이름·내구도·분리 비율·부모).
    const xmlFile = String(vehicle.vehicleDefinition || '').split('/').pop().toLowerCase();
    let parts = null; let hullTotal = null; let massTotal = null;
    if (xmlFiles.has(xmlFile)) {
        parts = []; hullTotal = 0; massTotal = 0;
        const walk = (node, parent) => {
            let name = parent;
            if (node.tag === 'Part') {
                name = node.attrs.name;
                const damageMax = Number(node.attrs.damageMax) || 0; const mass = Number(node.attrs.mass) || 0;
                hullTotal += damageMax; massTotal += mass;
                if (damageMax > 0) parts.push({ name, parent: parent || null, class: node.attrs.class || null, damageMax, mass: mass || null, detachRatio: node.attrs.detachRatio !== undefined ? Number(node.attrs.detachRatio) : null, skipPart: node.attrs.skipPart ?? null });
            }
            for (const child of node.children) walk(child, name);
        };
        walk(parseCryXml(readFileSync(xmlFiles.get(xmlFile))), null);
    }
    shipDefense[ship.cls] = {
        ...base, vehicleDefinition: xmlFile || null, modification: vehicle.modification || null,
        hull: { totalDamageMax: parts ? sig(hullTotal) : null, totalMass: parts ? sig(massTotal) : null, vehicleHullDamageNormalizationValue: sig(vehicle.vehicleHullDamageNormalizationValue), parts },
        penetration: { fusePenetrationDamageMultiplier: sig(vehicle.fusePenetrationDamageMultiplier), componentPenetrationDamageMultiplier: sig(vehicle.componentPenetrationDamageMultiplier), criticalPartExplosionChance: sig(vehicle.criticalPartExplosionChance), vehicleArmourModifiers: clean(vehicle.vehicleArmourModifiers), typesToHitWithExplosions: vehicle.typesToHitWithExplosions || null },
        armor: armors, shieldEmitters: emitters, shieldPool: (shipPower[ship.cls].powerPools || []).find((p) => p.itemType === 'Shield') || null,
    };
    // 같은 추진기는 한 줄로 묶고 개수를 적는다.
    const grouped = new Map();
    for (const t of thrusters) { const g = grouped.get(t.cls); if (g) g.count += 1; else grouped.set(t.cls, { ...t, count: 1 }); }
    const mass = shipFile.base?.mass ?? null;
    const thrustByType = {};
    for (const t of thrusters) thrustByType[t.thrusterType] = (thrustByType[t.thrusterType] || 0) + (t.thrustCapacity || 0);
    shipFlight[ship.cls] = { ...base, massKg: mass, massSource: 'vehicle XML Part@mass 합 (data/loadout/ships/*.json base.mass)', controller: flight[0] || null, thrusters: [...grouped.values()], thrustByType: Object.fromEntries(Object.entries(thrustByType).map(([k, v]) => [k, sig(v)])), derived: calc.flightDerived({ mass, thrustByType, controller: flight[0] }), tanks: tanks.filter((t) => !/Quantum/i.test(t.type || '')), intakes, lifeSupport };
    const qTanks = tanks.filter((t) => /Quantum/i.test(t.type || ''));
    shipQuantum[ship.cls] = { ...base, quantumFuelTanks: qTanks, quantumFuelCapacity: qTanks.length ? sig(qTanks.reduce((n, t) => n + (t.capacity?.value || 0), 0)) : null, capacityUnit: qTanks[0]?.capacity?.unit || null };
    shipRadar[ship.cls] = { ...base, crossSection: shipPower[ship.cls].crossSection, armorSignalMultipliers: shipPower[ship.cls].armorSignalMultipliers };
}
void thrusterTypes;

// ---- 쓰기 -------------------------------------------------------------------
const status = (state, note) => ({ status: state, note });
writeProfile('power-profiles.json', {
    meta, verification: {
        itemValues: status('verified', '게임 파일의 ItemResourceComponentParams 를 그대로 옮김'),
        runtimeAllocation: status('unavailable', '공급 부족 시 배분 순서·powerRanges 적용 방식은 실행 코드에 있어 자료만으로 확정할 수 없음 (docs/loadout-research/formulas.md 4장)'),
    },
    fields: {
        'states[].deltas[].consumption': 'Components[ItemResourceComponentParams].states[].deltas[].consumption.{resource, resourceAmountPerSecond.<단위>}',
        'states[].deltas[].minimumConsumptionFraction': '같은 delta 의 minimumConsumptionFraction — 켜져 있기 위한 최소 요구 비율',
        'states[].powerRanges': '…states[].powerRanges.{low,medium,high}.{start,modifier,registerRange}',
        temperature: 'Components[SEntityPhysicsControllerParams].PhysType.temperature',
        'ships.*.powerPools': '함선 Components[SItemPortContainerComponentParams].resourceNetworkPowerPools.itemPools[]',
        'ships.*.crossSection': '함선 Components[SSCSignatureSystemParams].radarProperties.crossSectionParams.crossSection',
    },
    units: { units: '전력 칸(세그먼트)', standardResourceUnits: 'SRU/초 (냉각·실드 등 망 자원)', microResourceUnits: 'µRU/초', temperature: 'K', signature: '신호 단위(게임 내부)' },
    global: globals,
}, { items: power, fixedItems: fixedPower, ships: shipPower });
writeProfile('weapon-profiles.json', {
    meta, verification: { rawValues: status('verified', 'SCItemWeaponComponentParams · AmmoParams 원본'), sustained: status('conflicting', '사격 주기의 경계(마지막 발 뒤 간격 포함 여부)에 따라 두 값이 나옴 — derived.sustained.variants 참조'), penetration: status('unavailable', '관통·도탄 판정식은 실행 코드에 있음. 입력값만 실음') },
    fields: {
        modes: 'Components[SCItemWeaponComponentParams].fireActions[] (순차 사격은 sequence[].action, 충전식은 inner)',
        ammo: 'Components[SAmmoContainerComponentParams].ammoParamsRecord → AmmoParams.{speed,lifetime,projectileParams.*}',
        simplifiedHeat: '…connectionParams.simplifiedHeatParams', regen: '…weaponRegenConsumerParams',
        statBlocks: '…connectionParams.{noPowerStats,underpowerStats,overpowerStats,overclockStats,heatStats} — 기본값(배수 1, 가산 0)과 다른 칸만',
        gimbalModifiers: 'WeaponGimbalModeModifierDef.*.weaponGimbalModeModifiers[EGimbalMode]',
    },
    units: { fireRate: '발/분', speed: 'm/s', lifetime: '초', damage: '피해량/발', heatPerShot: '열/발', coolingPerSecond: '열/초', regen: '발 또는 발/초', spread: '도' },
    gimbalModifiers, enums: { EGimbalMode: gimbalModes, EAimableUser: enums.get('EAimableUser') || null },
}, { guns: weapons, ordnance, turrets });
writeProfile('defense-profiles.json', {
    meta, verification: { shieldValues: status('verified', 'SCItemShieldGeneratorParams 원본'), armorValues: status('verified', 'SCItemVehicleArmorParams 원본'), hullParts: status('verified', '함선 구조 XML Part@damageMax'), penetrationRule: status('unavailable', '관통·도탄·부위 파괴 결과의 판정식은 자료에 없음'), shieldFaces: status('conflicting', '면 구성은 SCItemShieldEmitterParams.FaceType 만 확인. 면별 분배식은 자료에 없음') },
    fields: {
        'shields.*.params': 'Components[SCItemShieldGeneratorParams]', 'shields.*.resistance': '…ShieldResistance[DamageTypes]', 'shields.*.absorption': '…ShieldAbsorption[DamageTypes]',
        'ships.*.armor': '기본 장착의 Armor 부품 Components[SCItemVehicleArmorParams] · SHealthComponentParams', 'ships.*.hull.parts': 'scripts/entities/vehicles/implementations/xml/<함선>.xml 의 Part',
        'ships.*.shieldEmitters': '기본 장착의 실드 제어기 Components[SCItemShieldEmitterParams]', 'ships.*.penetration': '함선 Components[VehicleComponentParams]',
    },
    units: { MaxShieldHealth: '실드량', MaxShieldRegen: '실드량/초', DownedRegenDelay: '초', DamagedRegenDelay: '초', damageMax: '부위 내구도', basePenetrationDistance: 'm (탄약 쪽)', deflectionValue: '게임 내부 단위' },
}, { shields, ships: shipDefense });
writeProfile('quantum-profiles.json', {
    meta, verification: { driveValues: status('verified', 'SCItemQuantumDriveParams 원본'), tankValues: status('verified', 'ResourceContainer.capacity.standardCargoUnits'), fuelUnit: status('conflicting', 'quantumFuelRequirement 의 거리 단위는 자료에 적혀 있지 않음. SCU/Gm 로 읽으면 게임 안 항속과 맞는 크기 (formulas.md 7장)'), travelProfile: status('unavailable', '가속 단계 전환 조건은 실행 코드에 있음') },
    fields: { quantumFuelRequirement: 'Components[SCItemQuantumDriveParams].quantumFuelRequirement', params: '….params (일반 퀀텀 이동)', splineJumpParams: '….splineJumpParams (경로 따라 이동)', 'ships.*.quantumFuelTanks': '기본 장착의 QuantumFuelTank → Components[ResourceContainer].capacity' },
    units: { driveSpeed: 'm/s', stageOneAccelRate: 'm/s²', stageTwoAccelRate: 'm/s²', spoolUpTime: '초', cooldownTime: '초', quantumFuelCapacity: 'SCU', quantumFuelRequirement: 'SCU/Gm (해석)' },
}, { drives, jumpDrives, ships: shipQuantum });
writeProfile('radar-profiles.json', {
    meta, verification: { radarValues: status('verified', 'SCItemRadarComponentParams 원본. 배열 칸은 ESignatureType 순서'), detectionRange: status('unavailable', '탐지 거리 = f(상대 신호, 민감도, 주변 신호) 의 식은 자료에 없음'), powerEffect: status('conflicting', '레이더 전력은 최소 요구 비율과 powerRanges 만 확인. 민감도에 곱해지는지 여부는 미확인') },
    fields: { signatureDetection: 'Components[SCItemRadarComponentParams].signatureDetection[ESignatureType]', 'ships.*.crossSection': '함선 Components[SSCSignatureSystemParams].radarProperties.crossSectionParams.crossSection (x,y,z 방향)' },
    units: { sensitivity: '배수', piercing: '배수', crossSection: 'm² 추정(자료에 단위 없음)' },
    global: radarGlobal, sharedParams: radarShared, signatureTypes: enums.get('ESignatureType') || null,
}, { radars, ships: shipRadar });
writeProfile('flight-profiles.json', {
    meta, verification: { controllerValues: status('verified', 'IFCSParams 원본'), thrusterValues: status('verified', 'SCItemThrusterParams 원본'), acceleration: status('conflicting', '추력 합 ÷ 질량 값이며 IFCS 축별 배율·추진기 방향을 반영하지 않음 (derived 참조)'), blades: status('unavailable', '이 빌드의 게임 파일에서 교체형 비행 블레이드 부품을 찾지 못함') },
    fields: { controller: '기본 장착의 FlightController → Components[IFCSParams]', thrusters: '기본 장착의 추진기 → Components[SCItemThrusterParams]', tanks: '기본 장착의 FuelTank → Components[ResourceContainer].capacity' },
    units: { scmSpeed: 'm/s', maxSpeed: 'm/s (NAV)', maxAngularVelocity: '도/초 (x=피치, y=롤, z=요)', thrustCapacity: 'N', massKg: 'kg', capacitorMax: '부스트 축전량', capacitorRegenPerSec: '/초' },
}, { ships: shipFlight });
writeProfile('utility-profiles.json', {
    meta, verification: { values: status('verified', '채광·샐비지·트랙터·대응 수단 부품의 원본 구성 요소'), combination: status('unavailable', '채광 헤드와 모듈의 조합식(곱·합)은 자료에 없음') },
    fields: { mining: 'Components[SEntityComponentMiningLaserParams]', modifier: '모듈 부품의 Modifier 계열 구성 요소', tractor: 'TractorBeam 계열 구성 요소' }, units: {},
}, { items: utility });
writeFileSync(resolve(OUT_DATA, '.extract-stats.json'), `${JSON.stringify({ power: Object.keys(power).length, fixedPower: Object.keys(fixedPower).length, guns: Object.keys(weapons).length, ordnance: Object.keys(ordnance).length, turrets: Object.keys(turrets).length, shields: Object.keys(shields).length, drives: Object.keys(drives).length, jumpDrives: Object.keys(jumpDrives).length, radars: Object.keys(radars).length, utility: Object.keys(utility).length, ships: Object.keys(shipPower).length })}\n`);
