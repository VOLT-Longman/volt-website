// Display-only values from our game-file research. Never imports Erkul assets/data.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
const ref = process.argv[2] || 'd25e75d5c6e1881749779e680177aa8bb22f149c';
const read = (name) => JSON.parse(execFileSync('git', ['show', `${ref}:data/loadout-research/${name}-profiles.json`], { maxBuffer: 20e6 }));
const radar = read('radar');
const utility = read('utility');
if (!radar.meta.gameBuild || radar.meta.gameBuild !== utility.meta.gameBuild) throw new Error('Radar and utility research must use the same game build.');
const items = {};
for (const [id, item] of Object.entries(radar.radars)) {
    items[id] = { radar: { signatures: item.signatureDetection, aim: item.other?.aimAssist, ping: item.pingProperties?.cooldownTime } };
}
for (const [id, item] of Object.entries(utility.items)) {
    if (item.type !== 'MiningModifier') continue;
    const component = item.modifier?.find((entry) => entry.component === 'EntityComponentAttachableModifierParams');
    if (!component) continue;
    const mods = component.modifiers || [];
    const laser = mods.find((entry) => entry.MiningLaserModifier)?.MiningLaserModifier || {};
    const value = (key) => laser[key]?.value ?? 0;
    items[id] = { miningModule: {
        power: mods.find((entry) => entry.fireActionIndex === 0)?.weaponModifier?.weaponStats?.damageMultiplier ?? 1,
        extraction: mods.find((entry) => entry.fireActionIndex === 1)?.weaponModifier?.weaponStats?.damageMultiplier ?? 1,
        resistance: value('resistanceModifier'), instability: value('laserInstability'),
        window: value('optimalChargeWindowSizeModifier'),
        chargeRate: value('optimalChargeWindowRateModifier'),
        activation: component.activationMethod,
    } };
}
fs.writeFileSync('data/loadout/comparison.json', `${JSON.stringify({
    source: 'Star Citizen game files / VOLT loadout research', researchCommit: ref,
    sourceFiles: ['data/loadout-research/radar-profiles.json', 'data/loadout-research/utility-profiles.json'],
    gameVersion: radar.meta.gameBuild, researchedAt: radar.meta.researchedAt,
    limitations: { miningCombination: 'unverified', radarDetectionDistance: 'unverified' }, items,
}, null, 2)}\n`);
