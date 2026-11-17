// Extract only source-defined operating values. No calculator-site data or formulas.
import fs from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { DataForge } from '../gamedata/dataforge.mjs';

const cache = process.argv[process.argv.indexOf('--cache-dir') + 1];
if (!process.argv.includes('--cache-dir') || !cache) throw new Error('--cache-dir is required');
const ref = 'd25e75d5c6e1881749779e680177aa8bb22f149c';
const research = JSON.parse(execFileSync('git', ['show', `${ref}:data/loadout-research/power-profiles.json`], { maxBuffer: 20e6 }));
const bytes = fs.readFileSync(resolve(cache, 'Game2.dcb'));
const df = new DataForge(bytes);
if (!df.consistent) throw new Error('DataForge layout mismatch');
const build = JSON.parse(fs.readFileSync(resolve(cache, 'build_manifest.id'), 'utf8')).Data;
const meta = JSON.parse(fs.readFileSync('data/loadout/meta.json', 'utf8'));
if (build.Version !== meta.gameVersion || research.meta.gameBuild !== build.Version) throw new Error('Game builds do not match');
const catalog = JSON.parse(fs.readFileSync('data/loadout/items.json', 'utf8')).items;
const comp = (entity, type) => entity.Components?.find((entry) => entry?.__type === type);
const number = (v) => typeof v === 'number' && Number.isFinite(v) ? Number(v.toFixed(6)) : null;
const effects = (params) => Object.fromEntries(Object.entries(params || {}).filter(([, v]) => v && /^FloatModifier/.test(v.__type || '')).map(([key, value]) => [key, { kind: value.__type, value: number(value.value) }]));
const items = {};
const sigNames = ['Infrared', 'Electromagnetic', 'CrossSection', 'Decibel', 'Resource', 'Identity', 'CommsSignal', 'Interactable'];
for (const [id, item] of Object.entries(catalog)) {
    const record = df.recordById.get(id);
    if (!record) continue;
    const entity = df.readRecord(record, 12);
    const data = {};
    const res = research.items[id]?.resource?.states?.find((s) => s.name === 'Online');
    const power = res?.deltas?.filter((d) => d.consumption?.resource === 'Power') || [];
    if (power.length) data.powerLimits = { max: number(power.reduce((sum, d) => sum + d.consumption.value, 0)), min: number(power.reduce((sum, d) => sum + d.consumption.value * d.minimumConsumptionFraction, 0)) };
    const radar = comp(entity, 'SCItemRadarComponentParams');
    if (radar) data.radar = {
        signatures: Object.fromEntries(sigNames.map((name, index) => { const s = radar.signatureDetection[index]; return [name, { sensitivity: number(s.sensitivity), piercing: number(s.piercing), permitPassiveDetection: s.permitPassiveDetection, permitActiveDetection: s.permitActiveDetection }]; })),
        aim: Object.fromEntries(Object.entries(radar.aimAssist || {}).filter(([key]) => key !== '__type').map(([key, v]) => [key, number(v)])), ping: number(radar.pingProperties?.cooldownTime),
    };
    const head = comp(entity, 'SEntityComponentMiningLaserParams');
    if (head) {
        const actions = comp(entity, 'SCItemWeaponComponentParams')?.fireActions || [];
        const beam = (action) => action?.__type === 'SWeaponActionFireBeamParams' ? number(Object.entries(action.damagePerSecond || {}).filter(([key, v]) => key.startsWith('Damage') && typeof v === 'number' && v >= 0.001).reduce((sum, [, v]) => sum + v, 0)) : null;
        data.miningHead = { power: beam(actions[0]), extraction: beam(actions[1]), effects: effects(head.miningLaserModifiers), throttleMinimum: number(head.throttleMinimum) };
    }
    const mod = comp(entity, 'EntityComponentAttachableModifierParams');
    if (item.type === 'MiningModifier' && mod) {
        const rawEffects = mod.modifiers?.find((v) => v?.MiningLaserModifier)?.MiningLaserModifier;
        const modifiers = effects(rawEffects);
        const powerMod = mod.modifiers?.find((v) => v?.__type === 'ItemWeaponModifiersParams' && v.fireActionIndex === 0);
        const extractMod = mod.modifiers?.find((v) => v?.__type === 'ItemWeaponModifiersParams' && v.fireActionIndex === 1);
        const times = [...new Set((mod.modifiers || []).map((v) => number(v?.modifierLifetime?.lifetime)).filter((v) => v !== null))];
        const value = (key) => modifiers[key]?.value ?? 0;
        data.miningModule = {
            power: number(powerMod?.weaponModifier?.weaponStats?.damageMultiplier), extraction: number(extractMod?.weaponModifier?.weaponStats?.damageMultiplier),
            resistance: value('resistanceModifier'), instability: value('laserInstability'), window: value('optimalChargeWindowSizeModifier'), chargeRate: value('optimalChargeWindowRateModifier'),
            effects: modifiers, activation: mod.activationMethod, duration: times.length === 1 ? times[0] : null, charges: number(mod.charges),
        };
    }
    if (Object.keys(data).length) items[id] = data;
}
const ships = {};
for (const [cls, ship] of Object.entries(research.ships)) {
    const fixed = [];
    for (const [name, count] of Object.entries(ship.fixedItems || {})) {
        const item = research.fixedItems[name];
        if (!item) continue;
        const deltas = item.resource?.states?.find((s) => s.name === 'Online')?.deltas?.filter((d) => d.consumption?.resource === 'Power') || [];
        const max = deltas.reduce((sum, d) => sum + d.consumption.value * count, 0);
        if (max > 0) fixed.push({ id: item.uuid, type: item.type, count, max: number(max), min: number(deltas.reduce((sum, d) => sum + d.consumption.value * d.minimumConsumptionFraction * count, 0)) });
    }
    ships[cls] = { pools: ship.powerPools, fixed };
}
const result = {
    source: 'Star Citizen game files / VOLT extraction', gameVersion: build.Version, gameChangelist: build.RequestedP4ChangeNum,
    sourceSha256: createHash('sha256').update(bytes).digest('hex'), researchCommit: ref,
    sourceFields: ['SCItemRadarComponentParams', 'SEntityComponentMiningLaserParams', 'EntityComponentAttachableModifierParams', 'ItemResourceComponentParams.states[Online].deltas', 'SItemPortContainerComponentParams.resourceNetworkPowerPools'],
    limitations: { miningCombination: 'Only a single non-neutral power multiplier per channel is evaluated; overlapping modifiers remain separate.', radarDetectionDistance: 'unverified', partialPowerPerformance: 'unverified; allocation is a budget plan, not an ammo/regen simulation' },
    items, ships,
};
fs.writeFileSync('data/loadout/comparison.json', `${JSON.stringify(result, null, 2)}\n`);
console.log(`Operating values: ${Object.keys(items).length} items, ${Object.keys(ships).length} ships; build ${build.Version}`);
