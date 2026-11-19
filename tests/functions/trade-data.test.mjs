import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { distanceMeters, quantumTravel, trapezoidSeconds, TRAVEL_MODEL_STATUS } from '../../scripts/trade/travel-model.mjs';

const data = (path) => JSON.parse(readFileSync(new URL(`../../data/${path}`, import.meta.url)));
const cargo = data('trade/cargo.json');
const world = data('trade/world.json');
const canonical = data('canonical/ships-canonical.json');
const volume = (cells) => cells[0] * cells[1] * cells[2];

test('travel model: plain kinematics, a range instead of a guessed switch point, nothing invented for missing input', () => {
    // long trip: cruise time plus one ramp time
    assert.equal(trapezoidSeconds(1000, 10, 5), 1000 / 10 + 10 / 5);
    // short trip never reaches cruise speed: 2 * sqrt(d / a)
    assert.equal(trapezoidSeconds(10, 10, 5), 2 * Math.sqrt(10 / 5));
    // the two branches meet at d = v * v / a
    assert.ok(Math.abs(trapezoidSeconds(20, 10, 5) - 4) < 1e-9);
    assert.equal(trapezoidSeconds(1000, 10, 0), 100);
    assert.equal(quantumTravel(1e9, null), null);
    assert.equal(quantumTravel(1e9, { a1: 5 }), null);
    const trip = quantumTravel(32e9, { speed: 532468704, a1: 4259250, a2: 5427125, spool: 9.3, cool: 24, fuel: 0.03864 });
    assert.equal(trip.status, TRAVEL_MODEL_STATUS);
    assert.equal(trip.status, 'unvalidated-estimate');
    assert.ok(trip.cruiseOnlySeconds < trip.minSeconds && trip.minSeconds < trip.seconds && trip.seconds < trip.maxSeconds);
    assert.ok(Math.abs(trip.totalSeconds - (trip.seconds + 9.3)) < 1e-9);
    assert.equal(trip.cooldownSeconds, 24);
    assert.ok(Math.abs(trip.fuelScu - 0.03864 * 32) < 1e-9);
    const bare = quantumTravel(1e9, { speed: 1e8 });
    assert.equal(bare.seconds, 10);
    assert.equal(bare.spoolSeconds, undefined);
    assert.equal(bare.fuelScu, undefined);
    assert.equal(distanceMeters([0, 0, 0], [3, 4, 0]), 5000);
    assert.equal(distanceMeters(null, [1, 2, 3]), null);
});

test('trade data comes from the same game build as the other guides', () => {
    const meta = data('loadout/meta.json');
    for (const file of [cargo, world]) {
        assert.equal(file.gameVersion, meta.gameVersion);
        assert.equal(file.gameVersion, canonical.gameVersion);
        assert.equal(file.sourceHash, canonical.sourceSha256);
        assert.equal(file.sourceHash, data('mining/mining.json').sourceHash);
        assert.equal(file.source, 'game-files');
        assert.equal(file.koSource, 'korean-patch');
    }
});

test('every canonical ship is present and its grid total equals the canonical cargo figure', () => {
    const byId = new Map(cargo.ships.map((ship) => [ship.id, ship]));
    assert.equal(byId.size, cargo.ships.length, 'duplicate ship id');
    assert.equal(cargo.ships.length, canonical.ships.length);
    const mismatches = [];
    for (const ship of canonical.ships) {
        const ours = byId.get(ship.id);
        assert.ok(ours, `missing ship ${ship.id}`);
        const fromGrids = ours.g ? ours.g.reduce((sum, grid) => sum + volume(grid.c) * (grid.n || 1), 0) : 0;
        if (ours.scu !== undefined) assert.equal(ours.scu, fromGrids, `${ship.id}: scu is not the sum of its grids`);
        // a total we resolved must equal the canonical figure; a total we could not resolve is left out, never written as 0
        if (ours.scu !== undefined && ours.scu !== ship.cargoScu) mismatches.push(`${ship.id}: grids ${ours.scu} vs canonical ${ship.cargoScu}`);
        if (ours.scu === undefined) assert.ok(cargo.checks.cargoUnresolvedWhy[ship.id]?.length, `${ship.id}: unresolved without a reason`);
    }
    assert.deepEqual(mismatches, []);
    // A container record missing from the game database makes the total unknown whatever the item's type says:
    // the Ursa's rear grid item is typed "Cargo", not "CargoGrid", and used to slip through as scu 0.
    assert.deepEqual(cargo.checks.cargoUnresolved, ['f7c-hornet-mk-i', 'ursa', 'ursa-fortuna', 'ursa-medivac']);
    for (const id of ['ursa', 'ursa-fortuna', 'ursa-medivac']) {
        assert.ok(!('scu' in byId.get(id)), `${id}: unknown total must be left out`);
        assert.match(cargo.checks.cargoUnresolvedWhy[id][0], /RSI_Ursa_CargoGrid_Rear/);
    }
    // ships-canonical.json (another builder) still says 0 for these; the disagreement is listed, not hidden
    assert.deepEqual(cargo.checks.cargoUnknownButCanonicalNumber, canonical.ships.filter((ship) => byId.get(ship.id).scu === undefined && Number.isFinite(ship.cargoScu)).map((ship) => ({ id: ship.id, canonical: ship.cargoScu })));
    assert.equal(cargo.checks.zeroScu, cargo.ships.filter((ship) => ship.scu === 0).length);
    assert.match(cargo.note, /DEFAULT loadout only/);
    assert.deepEqual(cargo.checks.cargoMismatches, []);
    assert.equal(cargo.checks.cargoComparedWithCanonical, canonical.ships.length);
    assert.deepEqual(cargo.checks.cargoUnresolved, cargo.ships.filter((ship) => ship.scu === undefined).map((ship) => ship.id));
    assert.deepEqual(cargo.checks.tankMismatches, []);
});

test('cargo grids keep cell dimensions and box limits from the game records', () => {
    const ship = (id) => cargo.ships.find((item) => item.id === id);
    assert.equal(cargo.cell, 1.25);
    assert.deepEqual(ship('c2-hercules').g, [{ c: [8, 15, 4], max: [8, 8, 2], box: 32 }, { c: [6, 9, 4], max: [6, 8, 2], box: 32 }]);
    assert.equal(ship('c2-hercules').scu, 696);
    assert.deepEqual(ship('avenger-titan').g, [{ c: [2, 4, 1], max: [2, 2, 1], box: 4 }]);
    const hullC = ship('hull-c');
    assert.equal(hullC.scu, 4608);
    assert.equal(hullC.deck, 1);
    assert.equal(hullC.dock, 1);
    assert.ok(hullC.g.every((grid) => grid.box === 32 && grid.minBox === 32 && grid.n === 8));
    assert.deepEqual(cargo.ships.filter((item) => item.deck).map((item) => item.id), ['hull-c']);
    const sizes = new Set(world.boxes.map((box) => box.scu));
    let gridCount = 0;
    for (const item of cargo.ships) {
        assert.ok(!(item.scu === 0 && item.g), `${item.id}: zero total with grids`);
        for (const grid of item.g || []) {
            gridCount += grid.n || 1;
            assert.ok(grid.c.every((cells) => Number.isInteger(cells) && cells > 0), `${item.id}: grid cells`);
            assert.ok(grid.max && sizes.has(grid.box), `${item.id}: max box`);
            if (grid.minBox !== undefined) assert.ok(sizes.has(grid.minBox) && grid.minBox <= grid.box, `${item.id}: min box`);
        }
    }
    assert.equal(gridCount, 301);
    assert.equal(cargo.checks.withGrids, 100);
    assert.equal(cargo.ships.filter((item) => item.g).length, 100);
    assert.deepEqual(cargo.ships.filter((item) => item.k === 'g' && item.g).map((item) => item.id).sort(), ['csv-sm', 'cyclone', 'mule', 'utv']);
    assert.equal(cargo.ships.filter((item) => item.k === 'g').length, 27);
});

test('default quantum drives resolve and carry real parameters, never a parsing zero', () => {
    const withDrive = cargo.ships.filter((ship) => ship.qd);
    assert.equal(withDrive.length, 173);
    for (const ship of withDrive) {
        const drive = cargo.drives[ship.qd];
        assert.ok(drive, `${ship.id}: drive ${ship.qd} missing`);
        assert.ok(ship.qt > 0, `${ship.id}: quantum tank`);
    }
    assert.deepEqual(Object.keys(cargo.drives).sort(), [...new Set(withDrive.map((ship) => ship.qd))].sort(), 'only drives that a ship uses are shipped');
    for (const [id, drive] of Object.entries(cargo.drives)) {
        for (const field of ['speed', 'a1', 'a2', 'spool', 'cool', 'fuel']) assert.ok(drive[field] > 0, `${id}.${field}`);
        assert.ok(drive.name?.en, `${id}: name`);
    }
    assert.ok(cargo.ships.filter((ship) => ship.k === 'g').every((ship) => !ship.qd));
    const kama = cargo.drives.QDRV_JUST_S03_Kama_SCItem;
    assert.deepEqual([kama.speed, kama.a1, kama.a2, kama.spool, kama.cool, kama.fuel, kama.size], [532468704, 4259250, 5427125, 9.3, 24, 0.03864, 3]);
    assert.equal(kama.name.ko, '카마');
    assert.equal(cargo.ships.find((ship) => ship.id === 'c2-hercules').qd, 'QDRV_JUST_S03_Kama_SCItem');
    // the Caterpillar's second drive sits in its detachable command module and must not replace the hull drive
    assert.equal(cargo.ships.find((ship) => ship.id === 'caterpillar').qd, 'QDRV_WETK_S03_Pontes_SCItem');
});

test('seven box sizes with footprints and auto-loading seconds from the game cargo loading params', () => {
    assert.deepEqual(world.boxes.map((box) => [box.scu, box.cells, box.load, box.unload]), [
        [1, [1, 1, 1], 2, 2], [2, [1, 2, 1], 3, 3], [4, [2, 2, 1], 5, 5], [8, [2, 2, 2], 8, 8], [16, [2, 4, 2], 12, 12], [24, [2, 6, 2], 15, 15], [32, [2, 8, 2], 18, 18],
    ]);
    for (const box of world.boxes) assert.equal(volume(box.cells), box.scu);
    assert.equal(world.loading.baseLoad, 120);
    assert.equal(world.loading.baseUnload, 120);
    assert.equal(world.loading.manual, null, 'manual loading time is not a game value');
});

test('commodities have names, groups, box sizes and per-jurisdiction legality', () => {
    const ids = world.commodities.map((item) => item.id);
    assert.equal(new Set(ids).size, ids.length);
    assert.equal(ids.length, 192);
    const allowed = new Set([0.125, ...world.boxes.map((box) => box.scu)]);
    for (const item of world.commodities) {
        assert.ok(item.name.en, item.id);
        assert.ok(world.groups[item.group], `${item.id}: group ${item.group}`);
        assert.ok(item.boxes.length && item.boxes.every((size) => allowed.has(size)), `${item.id}: boxes`);
        for (const [jurisdiction, kind] of Object.entries(item.illegal || {})) {
            assert.ok(world.jurisdictions[jurisdiction], `${item.id}: jurisdiction ${jurisdiction}`);
            assert.match(kind, /^(p|c\d)$/);
            if (kind !== 'p') assert.ok(Number.isFinite(world.controlledMaxScu[jurisdiction]?.[Number(kind.slice(1))]) || world.jurisdictions[jurisdiction].inherits, `${item.id}: class limit`);
        }
    }
    assert.ok(world.commodities.filter((item) => item.name.ko).length >= 189);
    const byId = new Map(world.commodities.map((item) => [item.id, item]));
    assert.equal(byId.get('Gold').name.ko, '금');
    assert.equal(byId.get('Gold').group, 'Metal');
    assert.deepEqual(byId.get('Widow').illegal.UEE, 'c0');
    // a jurisdiction that respects its parent's laws inherits the parent's list
    assert.equal(byId.get('Widow').illegal.HurstonDynamics, 'c0');
    assert.equal(byId.get('Maze').illegal.HurstonDynamics, 'c1');
    assert.equal(byId.get('Maze').illegal.UEE, undefined);
    assert.equal(byId.get('Gold').illegal, undefined);
    // Vlk_Fang's crate references are missing from the file: reported as unknown, not shipped as "no boxes"
    assert.ok(!byId.has('Vlk_Fang'));
    assert.ok(world.unknown.danglingBoxRefs.some((ref) => ref.startsWith('Vlk_Fang.')));
});

test('trading locations reference real bodies, amenities and jurisdictions', () => {
    const bodies = new Map(world.bodies.map((body) => [body.id, body]));
    assert.equal(bodies.size, world.bodies.length);
    for (const body of world.bodies) {
        assert.ok(world.systems.includes(body.system));
        assert.ok(Array.isArray(body.p) && body.p.length === 3, `${body.id}: every listed body has a position`);
        if (body.parent) assert.ok(bodies.has(body.parent), `${body.id}: parent`);
        if (body.kind === 'planet' || body.kind === 'moon') assert.ok(body.r > 0, `${body.id}: radius`);
    }
    const ids = world.locations.map((location) => location.id);
    assert.equal(new Set(ids).size, ids.length);
    for (const location of world.locations) {
        assert.ok(world.systems.includes(location.system), location.id);
        assert.ok(bodies.has(location.body), `${location.id}: body ${location.body}`);
        assert.equal(bodies.get(location.body).system, location.system);
        for (const code of location.am || []) assert.ok(world.amenities[code], `${location.id}: amenity ${code}`);
        assert.ok(world.jurisdictions[location.law], `${location.id}: jurisdiction`);
        assert.ok(location.name || location.p, `${location.id}: neither name nor position`);
        if (location.at) { assert.equal(location.p, undefined); assert.equal(bodies.get(location.at).kind, 'lagrange'); }
        if (location.surface) {
            // a surface place sits on its body: distance from the centre is the body radius (terrain height aside)
            const ratio = Math.hypot(...location.lp) / bodies.get(location.body).r;
            assert.ok(ratio > 0.97 && ratio < 1.03, `${location.id}: ${ratio}`);
        }
    }
    const trade = world.locations.filter((location) => location.am?.includes('fe') || location.am?.includes('ld'));
    assert.equal(trade.length, world.checks.locationsWithTradeAmenity);
    assert.equal(trade.length + world.unknown.locationsSkipped.length, 223, 'every star map object with a trade amenity is listed or named as skipped');
    assert.deepEqual(world.locations.filter((location) => !location.p).map((location) => location.id), world.unknown.locationsWithoutPosition);
    const lorville = world.locations.find((location) => location.id === 'Stanton1_Lorville');
    assert.equal(lorville.name.en, 'Lorville');
    assert.ok(lorville.name.ko.startsWith('로어빌'));
    assert.deepEqual([lorville.body, lorville.surface, lorville.hangar, lorville.law, lorville.type], ['Stanton1', 1, 'XL', 'HurstonDynamics', 'LandingZone']);
    assert.ok(lorville.am.includes('fe') && !lorville.am.includes('ref'));
    const station = world.locations.find((location) => location.id === 'RR_HUR_L1');
    assert.ok(station.am.includes('ref') && station.am.includes('fe') && station.surface === undefined);
    assert.deepEqual([station.pad, station.hangar], ['M', 'L']);
    assert.equal(new Set(world.locations.flatMap((location) => location.am || [])).has('ld'), true);
    // jump points: the star map has only two JumpPoint records, so gateways are found through `gate` on their stations
    assert.equal(world.bodies.filter((body) => body.kind === 'jump').length, 2);
    assert.deepEqual(world.locations.filter((location) => location.gate).map((location) => [location.id, location.system, location.gate]), [
        ['RR_JP_StantonMagnus', 'Stanton', 'Nyx'], ['RR_JP_StantonPyro', 'Stanton', 'Pyro'], ['RR_JP_StantonTerra', 'Stanton', 'Terra'],
        ['RR_JP_PyroNyx', 'Pyro', 'Nyx'], ['RR_JP_PyroStanton', 'Pyro', 'Stanton'], ['RR_JP_NyxCastra', 'Nyx', 'Stanton'], ['RR_JP_NyxPyro', 'Nyx', 'Pyro'],
    ]);
    assert.ok(world.unknown.other.some((text) => /Jump points/.test(text)) && world.unknown.other.some((text) => /^Units of boxes/.test(text)));
});

test('joins: UEX terminal map, distance comparison and the travel estimate are recorded with their measurements', () => {
    const { terminals, distance, travel, refineries } = world.joins;
    const ids = new Set(world.locations.map((location) => location.id));
    // the UEX side is rebuilt from a snapshot kept in the repository, never from a previous world.json
    const snapshot = JSON.parse(readFileSync(new URL(`../../${world.joins.input}`, import.meta.url)));
    assert.equal(world.joins.inputHash, createHash('sha256').update(JSON.stringify(snapshot)).digest('hex'));
    assert.equal(snapshot.terminals.filter((terminal) => terminal.type === 'commodity').length, terminals.total);
    assert.equal(snapshot.orbitRows.length, distance.uexRows);
    assert.ok(!/price|scu_|status_/i.test(JSON.stringify(snapshot.terminals[0])), 'snapshot holds no prices or stock');
    // places listed only because a UEX commodity terminal maps to them have no trade / refinery amenity of their own
    const uexOnly = world.locations.filter((location) => !['fe', 'ld', 'ref'].some((code) => location.am?.includes(code)));
    assert.equal(uexOnly.length, world.checks.locationsListedByUexTerminalOnly);
    const mapped = new Set(Object.values(terminals.map));
    assert.ok(uexOnly.every((location) => mapped.has(location.id)));
    assert.equal(Object.keys(terminals.map).length, terminals.matched);
    assert.equal(terminals.matched + terminals.unmatched.length, terminals.total);
    for (const [uexId, locationId] of Object.entries(terminals.map)) { assert.match(uexId, /^\d+$/); assert.ok(ids.has(locationId), `terminal ${uexId} -> ${locationId}`); }
    assert.equal(terminals.map[12], 'Stanton3_Area18');
    assert.equal(terminals.map[27], 'GrimHEX');
    assert.equal(terminals.liveMatched, terminals.liveTotal, 'every terminal UEX marks as live has a game location');
    assert.ok(terminals.unmatched.every((row) => row.live === 0 && row.why));
    for (const locationId of Object.values(refineries.map)) assert.ok(ids.has(locationId));
    assert.equal(refineries.matched, refineries.uexRefineryTerminals);

    const known = new Set([...ids, ...world.bodies.map((body) => body.id)]);
    for (const target of Object.values(distance.orbitMap)) assert.ok(known.has(target), `orbit -> ${target}`);
    assert.equal(distance.use, 'game-positions');
    assert.ok(distance.pairsCompared >= 1000);
    assert.ok(distance.within1Gm / distance.pairsCompared > 0.99);
    assert.ok(distance.medianAbsGm < 0.5, 'UEX whole-Gm values differ from game positions by rounding only');
    for (const sample of [...distance.samples, ...distance.worst, ...distance.terminalSamples]) assert.ok(known.has(sample.from) && known.has(sample.to) && sample.gameGm >= 0 && Number.isFinite(sample.uexGm));
    // recompute one sample from the shipped positions
    const position = (id) => (world.bodies.find((body) => body.id === id) || world.locations.find((location) => location.id === id)).p;
    const hurstonCrusader = distance.samples.find((sample) => sample.from === 'Stanton2' && sample.to === 'Stanton1');
    assert.ok(Math.abs(distanceMeters(position('Stanton1'), position('Stanton2')) / 1e9 - hurstonCrusader.gameGm) < 0.01);
    assert.equal(hurstonCrusader.uexGm, 32);

    assert.equal(travel.status, 'unvalidated-estimate');
    assert.equal(travel.module, 'scripts/trade/travel-model.mjs');
    assert.ok(travel.notValidated.length >= 3);
    const ship = cargo.ships.find((item) => item.id === travel.example.ship);
    const again = quantumTravel(distanceMeters(position(travel.example.from), position(travel.example.to)), cargo.drives[ship.qd]);
    assert.ok(Math.abs(again.seconds - travel.example.seconds) < 0.1);
    assert.ok(Math.abs(again.fuelScu - travel.example.fuelScu) < 0.001);
});

test('shipped files stay compact and carry no prices', () => {
    const cargoText = readFileSync(new URL('../../data/trade/cargo.json', import.meta.url), 'utf8');
    const worldText = readFileSync(new URL('../../data/trade/world.json', import.meta.url), 'utf8');
    assert.ok(cargoText.length < 60_000, `cargo.json ${cargoText.length}`);
    assert.ok(worldText.length < 200_000, `world.json ${worldText.length}`);
    assert.ok(!/\n./.test(cargoText) && !/\n./.test(worldText), 'not pretty printed');
    assert.ok(!/price_buy|price_sell|"price"/i.test(cargoText + worldText));
});
