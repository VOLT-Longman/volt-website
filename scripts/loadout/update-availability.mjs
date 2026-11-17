// Refresh independently of the game-file build: concept/NPC definitions may exist in Data.p4k.
import { readFileSync, writeFileSync } from 'node:fs';
const read = (path) => JSON.parse(readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8'));
const vehicles = process.argv[2] ? JSON.parse(readFileSync(process.argv[2], 'utf8')).data : (await (await fetch('https://api.uexcorp.space/2.0/vehicles')).json()).data;
if (!Array.isArray(vehicles) || vehicles.length < 100) throw new Error('Incomplete UEX vehicle catalog');
const normalize = (name) => name.toLowerCase().replace(/[^a-z0-9]/g, '');
const aliases = {
    anvl_hornet_f7cm_heartseeker: 'Anvil F7C-M Super Hornet Heartseeker Mk I',
    anvl_ballista_dunestalker: 'Anvil Ballista Dunestalker', anvl_ballista_snowblind: 'Anvil Ballista Snowblind',
    drak_dragonfly: 'Drake Dragonfly Black', orig_600i: 'Origin 600i Explorer', orig_85x: 'Origin 85X',
    orig_m50: 'Origin M50', tmbl_nova: 'Tumbril Nova Tank', glsn_basher: "Grey's Market Basher", glsn_shiv: "Grey's Market Shiv",
};
const released = []; const excluded = [];
for (const ship of read('data/loadout/index.json').ships) {
    const matches = vehicles.filter((v) => normalize(v.name_full) === normalize(aliases[ship.cls] || ship.name));
    if (matches.length > 0 && matches.every((match) => match.is_concept === 0)) released.push(ship.cls);
    else excluded.push({ cls: ship.cls, reason: matches.length === 1 && matches[0].is_concept === 1 ? 'concept' : 'unverified-release' });
}
writeFileSync(new URL('../../data/loadout/availability.json', import.meta.url), `${JSON.stringify({ source: 'https://api.uexcorp.space/2.0/vehicles', checkedAt: new Date().toISOString(), released, excluded }, null, 2)}\n`);
console.log(`${released.length} released, ${excluded.length} excluded`, excluded);
