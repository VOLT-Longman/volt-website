// Ship definitions may exist before release. Use RSI status, never UEX specs.
import { readFileSync, writeFileSync } from 'node:fs';
const read = (file) => JSON.parse(readFileSync(new URL('../../' + file, import.meta.url), 'utf8'));
const canonical = read('data/canonical/ships-canonical.json');
const release = read('data/external/rsi/ship-release-status.json');
const byClass = new Map(canonical.ships.map(ship => [ship.gameClass, ship]));
const released = []; const excluded = [];
for (const ship of read('data/loadout/index.json').ships) {
    const matched = byClass.get(ship.cls);
    if (matched?.catalogStatus === 'flight-ready' && matched.releaseSource === release.source) released.push(ship.cls);
    else excluded.push({cls:ship.cls, reason:matched?.catalogStatus === 'concept' ? 'concept' : 'unverified-release'});
}
writeFileSync(new URL('../../data/loadout/availability.json', import.meta.url), JSON.stringify({source:release.source,checkedAt:release.checkedAt,released,excluded},null,2)+'\n');
console.log(released.length + ' officially released loadouts; ' + excluded.length + ' excluded');
