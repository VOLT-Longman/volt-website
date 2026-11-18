import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
const read = async (file) => JSON.parse(await readFile(new URL(`../../${file}`, import.meta.url), 'utf8'));

test('game-file catalog retains exact identities, source build, verified releases and unknown fields', async () => {
    const catalog = await read('data/canonical/ships-canonical.json');
    const identities = await read('data/canonical/ship-identities.json');
    const byId = new Map(catalog.ships.map(s => [s.id, s]));
    assert.equal(catalog.gameVersion, '4.10.200.58746');
    assert.equal(catalog.sourceSha256, '005984f5507314a0d5dc3a8d7457bffc03578eeabb1e5da6e6c2d010e81649f4');
    for (const identity of identities.records) {
        const ship = byId.get(identity.id);
        assert.equal(ship.gameClass, identity.cls);
        assert.equal(ship.source, 'game-files');
        assert.match(ship.gameRef, /^[a-f0-9-]{36}$/);
        assert.doesNotMatch(ship.nameKo || '', /\[[A-Za-z]/);
    }
    // AttachDef.Size is the item size; vehicle XML size is a different field.
    assert.equal(byId.get('135c').size, 'S1');
    assert.equal(byId.get('galaxy').size, 'S5');
    assert.equal(byId.get('liberator').size, 'S6');
    // Installed grids include sub-loadout XMLs and repeated grids on distinct ports.
    for (const [id, cargo] of [['135c', 6], ['890-jump', 388], ['nomad', 24], ['hull-a', 64], ['galaxy', 64], ['liberator', 400], ['hyun', 32]]) assert.equal(byId.get(id).cargoScu, cargo, id);
    assert.equal(byId.get('f7c-hornet-mk-i').cargoScu, null, 'Unresolved container must not become zero');
    for (const id of ['galaxy', 'liberator', 'marauder']) {
        assert.equal(byId.get(id).catalogStatus, 'flight-ready');
        assert.equal(byId.get(id).implemented, true);
    }
    assert.equal(byId.get('hyun').catalogStatus, 'unconfirmed');
    assert.equal(byId.get('hyun').implemented, false);
});

test('newly mapped loadouts use exact ship images and flagged localization keys are parsed', async () => {
    const index = await read('data/loadout/index.json');
    const imagery = await read('data/ship-imagery.json');
    for (const [cls, id] of [['rsi_galaxy', 'galaxy'], ['anvl_liberator', 'liberator']]) {
        const ship = index.ships.find(s => s.cls === cls);
        assert.equal(ship.volt, id);
        assert.ok(imagery.records.some(r => r.id === ship.volt && r.reviewStatus === 'verified'));
    }
    assert.ok(index.ships.some(s => s.cls === 'drak_pitbull'));
    const canonical = await read('data/canonical/ships-canonical.json');
    for (const id of ['pitbull', 'tiburon']) assert.ok(canonical.ships.find(s => s.id === id).descriptions.en);
});
