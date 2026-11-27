// Build the comparison shared by Ship DB and VOLT AI from the released stock loadouts.
import { readFileSync, writeFileSync } from 'node:fs';
import calc from '../../js/loadout-calc.js';

const base = new URL('../../data/loadout/', import.meta.url);
const read = file => JSON.parse(readFileSync(new URL(file, base), 'utf8'));
const { items } = read('items.json');
const { names } = read('ko.json');
const { released } = read('availability.json');
const extra = read('comparison.json');
if (extra.gameVersion === read('meta.json').gameVersion) {
    for (const [id, fields] of Object.entries(extra.items)) if (items[id]) Object.assign(items[id], fields);
}
const ships = {};
const parts = {};
for (const { cls, volt } of read('index.json').ships) {
    if (!volt || !released.includes(cls)) continue;
    const ship = read(`ships/${cls}.json`);
    const totals = calc.summarize(ship, items, {});
    const equipment = {};
    calc.walkLoadout(ship, items, {}, ({ item, itemId }) => {
        if (!item) return;
        const group = calc.isGun(item) ? 'weapon' : ({ Shield: 'shield', Cooler: 'cooler', PowerPlant: 'power' })[item.type];
        if (!group) return;
        parts[itemId] = { group, en: item.name, ko: names[itemId] || item.name, size: item.size };
        equipment[itemId] = (equipment[itemId] || 0) + 1;
    });
    ships[volt] = { pilot: totals.dps.pilot, sustain: totals.sustain.pilot, turret: totals.dps.turret,
        shield: totals.shield.hp, regen: totals.shield.regen, armor: ship.base?.armor?.hp ?? null, equipment };
}
const target = new URL('stock-comparison.json', base);
const output = JSON.stringify({ ships, parts }) + '\n';
if (process.argv.includes('--check')) {
    if (readFileSync(target, 'utf8') !== output) throw Error('Run node scripts/loadout/build-stock-comparison.mjs');
} else writeFileSync(target, output);
