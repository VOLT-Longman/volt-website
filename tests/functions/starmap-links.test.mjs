import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import zlib from 'node:zlib';
import { buildLinkIndex, linkIndexFromDisk, LINK_SYSTEMS } from '../../scripts/starmap/build-link-index.mjs';

// data/starmap/links.json: the small list the trade, mission and mining screens read to decide whether a place gets a
// "지도에서 보기" link. It must say exactly what the system files say, and every other screen's key must reach it.

const path = (name) => new URL(`../../data/${name}`, import.meta.url);
const data = (name) => JSON.parse(readFileSync(path(name)));
const links = data('starmap/links.json');
const index = data('starmap/index.json');
const systems = Object.fromEntries(LINK_SYSTEMS.map((system) => [system, data(`starmap/${system}.json`)]));
const flat = [...LINK_SYSTEMS.flatMap((system) => links.places[system]), ...LINK_SYSTEMS.flatMap((system) => links.guess[system])];
const onMap = new Set(flat);

test('links.json is exactly what the build makes from the files on disk', () => {
    assert.deepEqual(links, linkIndexFromDisk());
    assert.equal(readFileSync(path('starmap/links.json'), 'utf8'), `${JSON.stringify(linkIndexFromDisk())}\n`);
    assert.equal(links.version, index.version);
    assert.equal(links.sourceHash, index.sourceHash);
});

test('only places the map can point at are listed', () => {
    for (const system of LINK_SYSTEMS) {
        const objects = systems[system].objects;
        assert.deepEqual(links.places[system], objects.filter((object) => object.pos).map((object) => object.id));
        assert.deepEqual(links.guess[system], objects.filter((object) => !object.pos && object.guess).map((object) => object.id));
        for (const object of objects.filter((item) => !item.pos && !item.guess)) assert.ok(!onMap.has(object.id), `${object.id} has no position and no guess`);
    }
    assert.equal(flat.length, onMap.size, 'ids are unique across systems');
    assert.equal(links.places.stanton.length + links.places.pyro.length + links.places.nyx.length, 1203);
    // no guessed spot is offered any more: the 12 unplaced Pyro stations (and their clinics) have no UEX terminal either
    assert.deepEqual(links.guess, { stanton: [], pyro: [], nyx: [] });
    for (const id of systems.pyro.objects.filter((object) => object.unplaced).map((object) => object.id)) assert.ok(!onMap.has(id), id);
});

test('UEX terminals, mining areas and mission sites resolve to listed places', () => {
    const world = data('trade/world.json');
    for (const [terminal, id] of Object.entries(links.uex)) assert.ok(onMap.has(id), `terminal ${terminal} -> ${id}`);
    for (const [terminal, id] of Object.entries(world.joins.terminals.map)) assert.equal(links.uex[terminal], id, `commodity terminal ${terminal}`);
    for (const [terminal, id] of Object.entries(world.joins.refineries.map)) assert.ok(links.uex[terminal], `refinery terminal ${terminal} (${id})`);
    assert.deepEqual(links.areas, index.regionSystems);
    for (const [id, site] of Object.entries(links.sites)) {
        assert.ok(index.siteSystems[id], id);
        for (const n of [...(site.at || []), ...(site.near || [])]) assert.ok(flat[n], `${id} -> ${n}`);
        assert.ok(site.at || site.near || site.spots, id);
    }
    const expectedAt = new Set(LINK_SYSTEMS.flatMap((system) => systems[system].sites.RestStop_Stanton_4_PortTressler?.at || []));
    assert.deepEqual(new Set(links.sites.RestStop_Stanton_4_PortTressler.at.map((n) => flat[n])), expectedAt);
});

test('buildLinkIndex leaves out what cannot be shown', () => {
    const made = buildLinkIndex({ version: 'v', gameVersion: 'g', sourceHash: 'h', regionSystems: { Belt: ['stanton'] }, siteSystems: { A: ['stanton'], B: ['pyro'], C: ['nyx'] } }, {
        stanton: { objects: [{ id: 'Here', pos: [1, 2, 3], uex: [7] }, { id: 'Lost', nopos: 1, uex: [8] }], sites: { A: { at: ['Here', 'Lost'] } } },
        pyro: { objects: [{ id: 'Maybe', nopos: 1, guess: { at: 'X' }, uexRef: [9] }], sites: { B: { near: ['Maybe'], via: 'tag' } } },
        nyx: { objects: [], sites: { C: { at: ['Nowhere'] } } },
    });
    assert.deepEqual(made.places, { stanton: ['Here'], pyro: [], nyx: [] });
    assert.deepEqual(made.guess, { stanton: [], pyro: ['Maybe'], nyx: [] });
    assert.deepEqual(made.uex, { 7: 'Here', 9: 'Maybe' });
    assert.deepEqual(made.sites, { A: { at: [0] }, B: { near: [1] } });
    assert.deepEqual(made.areas, { Belt: ['stanton'] });
});

test('the file stays small: it is fetched by every helper screen', () => {
    assert.ok(zlib.gzipSync(readFileSync(path('starmap/links.json')), { level: 9 }).length < 16000);
});
