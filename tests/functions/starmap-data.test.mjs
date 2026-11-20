import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import zlib from 'node:zlib';
import { decodeSuperGuid, dropReason, firstJson, geoOf, kindOf, KIND_ORDER, ownsTexture, parseTextXml, qconj, qmul, qrot, SCHEMA, SYSTEMS, textureKey } from '../../scripts/starmap/build-starmap-data.mjs';

const path = (name) => new URL(`../../data/${name}`, import.meta.url);
const data = (name) => JSON.parse(readFileSync(path(name)));
const index = data('starmap/index.json');
const systems = Object.fromEntries(SYSTEMS.map((system) => [system.id, data(`starmap/${system.id}.json`)]));
const world = data('trade/world.json');
const helper = data('mining/helper.json');
const mining = data('mining/mining.json');
const missions = data('contracts/missions.json');
const all = Object.values(systems).flatMap((file) => file.objects.map((object) => ({ ...object, sys: file.system })));
const byId = new Map(all.map((object) => [object.id, object]));
const km = (a, b) => Math.hypot(...a.map((v, i) => v - b[i])) / 1000;

// ---- pure helpers -----------------------------------------------------------------------------
test('quaternions are w,x,y,z and rotate the way the container files need', () => {
    const half = Math.SQRT1_2;
    const quarterTurnZ = [half, 0, 0, half];
    const turned = qrot(quarterTurnZ, [1, 0, 0]);
    assert.ok(Math.abs(turned[0]) < 1e-12 && Math.abs(turned[1] - 1) < 1e-12 && Math.abs(turned[2]) < 1e-12);
    // microTech's container is turned half a turn about z (rot="0,0,0,1"): a moon written at +x,+y sits at -x,-y
    assert.deepEqual(qrot([0, 0, 0, 1], [63715944, 16904286, 0]).map(Math.round), [-63715944, -16904286, 0]);
    const back = qrot(qconj(quarterTurnZ), turned);
    assert.ok(Math.abs(back[0] - 1) < 1e-12 && Math.abs(back[1]) < 1e-12);
    assert.deepEqual(qmul([1, 0, 0, 0], quarterTurnZ), quarterTurnZ);
});

test('geoOf gives latitude, longitude and height above the radius', () => {
    assert.deepEqual(geoOf([1000, 0, 0], 900), [0, 0, 100]);
    assert.deepEqual(geoOf([0, 0, -500], 500), [-90, 0, 0]);
    assert.deepEqual(geoOf([0, 2000, 0], 1000), [0, 90, 1000]);
    assert.equal(geoOf([0, 0, 0], 10), null);
    // Lorville, from the body-fixed position in the Hurston container
    assert.deepEqual(geoOf([-328989, -752435, 572120], 1000000), [34.864, -113.6165, 856]);
});

test('texture keys follow the shared rule and borrowed textures are recognised', () => {
    assert.equal(textureKey('ui/starmap/textures/Nyx/ui_sm_nyx_2.tif'), 'ui_sm_nyx_2');
    assert.equal(textureKey('UI\\starmap\\textures\\Stanton\\UI_SM_Stanton_1_Hurston.dds'), 'ui_sm_stanton_1_hurston');
    assert.equal(ownsTexture('Stanton2c', 'ui_sm_stanton_2c_crusader_yela'), true);
    assert.equal(ownsTexture('Stanton2', 'ui_sm_stanton_2_crusader'), true);
    assert.equal(ownsTexture('Stanton2', 'ui_sm_stanton_2c_crusader_yela'), false);
    assert.equal(ownsTexture('Pyro5', 'ui_sm_pyro_5a'), false);
    assert.equal(ownsTexture('Pyro5a', 'ui_sm_pyro_5a'), true);
    assert.equal(ownsTexture('Nyx1', 'ui_sm_nyx_1'), true);
    assert.equal(ownsTexture('Delamar', 'delamar_global_starmap_diff'), false);
});

test('kinds: Lagrange points and jump points are told apart from the game type they borrow', () => {
    assert.equal(kindOf('Stanton1_L1', 'Asteroid'), 'lagrange');
    assert.equal(kindOf('Pyro5_L4_02', 'Asteroid'), 'asteroid');
    assert.equal(kindOf('JumpPoint_Stanton_Pyro', 'Anomaly'), 'jump');
    assert.equal(kindOf('JumpPoint_Stanton_Terra', 'JumpPoint'), 'jump');
    assert.equal(kindOf('JumpPoint_Stanton_Pyro_Wrecksite', 'Anomaly'), 'anomaly');
    assert.equal(kindOf('RR_HUR_L1', 'Manmade_VisibleOnInteraction'), 'station');
    assert.equal(kindOf('Stanton1_Lorville', 'LandingZone'), 'city');
    assert.equal(kindOf('x', 'Outpost_InvalidQT'), 'outpost');
    assert.equal(kindOf('x', 'SomethingNew'), 'other');
});

test('drop rule: templates, beacons, markers and unplaced records go; referenced or body records stay', () => {
    const base = { system: 'stanton', hidden: false, positioned: true, joined: false };
    assert.equal(dropReason({ ...base, id: 'JumpPoint_TEMPLATE', type: 'Anomaly' }), 'template');
    assert.equal(dropReason({ ...base, id: 'MISSION_QT_Patrol_Beacon', type: 'Manmade' }), 'beacon');
    assert.equal(dropReason({ ...base, id: 'KeegerBelt_MissionLocation', type: 'Asteroid' }), 'beacon');
    assert.equal(dropReason({ ...base, id: 'YouAreHereMarker', type: 'YouAreHere' }), 'uiMarker');
    assert.equal(dropReason({ ...base, id: 'StantonSolarSystem', type: 'SolarSystem' }), 'solarSystemRecord');
    assert.equal(dropReason({ ...base, id: 'OxygenDispenser', type: 'Manmade', system: undefined }), 'noSystem');
    assert.equal(dropReason({ ...base, id: 'Ellis3', type: 'Planet' }), 'foreignBody');
    assert.equal(dropReason({ ...base, id: 'Nyx_Kaboos_017', type: 'Outpost', hidden: true, positioned: false }), 'hiddenUnplaced');
    assert.equal(dropReason({ ...base, id: 'IasiPlatform_003', type: 'PointOfInterest', positioned: false }), 'visibleUnplaced');
    assert.equal(dropReason({ ...base, id: 'RR_P1_L2', type: 'Manmade_VisibleOnInteraction', positioned: false, joined: true }), null);
    assert.equal(dropReason({ ...base, id: 'Delamar', type: 'Moon', positioned: false }), null);
    assert.equal(dropReason({ ...base, id: 'JumpPoint_Nyx_Odin', type: 'Anomaly', positioned: false }), null);
    assert.equal(dropReason({ ...base, id: 'PrivateMiningPoint_Stanton_001', type: 'Asteroid', hidden: true }), null);
});

test('small readers: container XML, jump link text, planet .ale JSON', () => {
    const tree = parseTextXml('<ObjectContainer name="x"><ChildObjectContainers><Child name="a/m&amp;v_bar.socpak" pos="1,2,3"/><Child name="b"><ChildObjectContainers><Child name="c"/></ChildObjectContainers></Child></ChildObjectContainers></ObjectContainer>');
    assert.equal(tree.children[0].children[0].attrs.name, 'a/m&v_bar.socpak');
    assert.equal(tree.children[0].children[1].children[0].children[0].attrs.name, 'c');
    const link = decodeSuperGuid('0DF49E57-1114-4aa8-9d0b-0cf4399b1887.40fa0e04-0000-0000-0000-000000000000.454be3af-4423-5040-12a8-ef18f5e3d880.48519278-0000-0000-0000-000000000000');
    assert.equal(link.system, '0df49e57-1114-4aa8-9d0b-0cf4399b1887');
    assert.equal(link.container, '454be3af-4423-5040-12a8-ef18f5e3d880');
    assert.equal(decodeSuperGuid('not-a-link'), null);
    assert.deepEqual(firstJson(Buffer.from('CrCh\0\0{ not json }\0{"data":{"General":{"s":"a}b"}}}tail')), { data: { General: { s: 'a}b' } } });
    assert.equal(firstJson(Buffer.from('no braces')), null);
});

// ---- generated files --------------------------------------------------------------------------
test('files are from the same game build as the screens they join to', () => {
    assert.equal(index.schema, SCHEMA);
    assert.equal(index.source, 'game-files');
    for (const other of [world, helper, mining, missions]) { assert.equal(index.gameVersion, other.gameVersion); assert.equal(index.sourceHash, other.sourceHash); }
    assert.deepEqual(index.systems.map((system) => system.id), ['stanton', 'pyro', 'nyx']);
    for (const system of index.systems) {
        const file = systems[system.id];
        assert.equal(file.gameVersion, index.gameVersion);
        assert.equal(file.schema, SCHEMA);
        assert.equal(file.star, system.star);
        assert.equal(system.file, `data/starmap/${system.id}.json`);
        assert.equal(system.counts.objects, file.objects.length);
        assert.equal(system.counts.positioned, file.objects.filter((object) => object.pos).length);
        assert.equal(system.counts.noPosition, file.objects.filter((object) => object.nopos).length);
    }
    assert.equal(index.assetVersion, null, 'placeholder: the texture release id lives in data/starmap/textures.json');
    assert.equal(index.checks.kept, all.length);
    assert.equal(index.checks.records, all.length + Object.values(index.dropped).reduce((sum, n) => sum + n, 0));
});

test('every object is well formed and nothing is a made-up zero', () => {
    assert.equal(byId.size, all.length, 'ids are unique across the three systems');
    const kinds = new Set(KIND_ORDER);
    for (const file of Object.values(systems)) {
        const ids = new Set(file.objects.map((object) => object.id));
        assert.equal(file.objects[0].id, file.star);
        const seen = new Set();
        for (const object of file.objects) {
            assert.ok(kinds.has(object.kind), `${object.id} kind`);
            assert.ok(index.kinds[object.kind] && index.types[object.type], `${object.id} kind / type are described in index.json`);
            if (object.id === file.star) assert.equal(object.parent, undefined); else assert.ok(seen.has(object.parent), `${object.id}: parent ${object.parent} comes earlier in the list`);
            seen.add(object.id);
            for (const key of ['in', 'body']) if (object[key]) assert.ok(ids.has(object[key]), `${object.id}.${key}`);
            assert.ok(Boolean(object.pos) !== Boolean(object.nopos), `${object.id} has exactly one of pos / nopos`);
            if (object.pos) assert.ok(object.pos.length === 3 && object.pos.every(Number.isSafeInteger), `${object.id} pos`);
            assert.ok(Boolean(object.name) !== Boolean(object.noName), `${object.id} has exactly one of name / noName`);
            if (object.name) assert.ok(object.name.en && object.name.ko !== object.name.en, `${object.id} name`);
            if (object.r !== undefined) assert.ok(object.r > 1, `${object.id} radius is not a placeholder`);
            if (object.rel) { assert.ok(object.body && object.geo && object.rel.every(Number.isSafeInteger), `${object.id} rel / geo`); assert.ok(Math.abs(object.geo[0]) <= 90 && Math.abs(object.geo[1]) <= 180); }
            if (object.surf) assert.ok(object.geo, `${object.id} surface place has lat / long`);
            if (object.qt) assert.ok(object.qt.length === 3 && object.qt.every(Number.isFinite));
            if (object.law) assert.ok(index.laws[object.law], `${object.id} law ${object.law}`);
            for (const code of object.am || []) assert.ok(index.amenities[code] && world.amenities[code], `${object.id} amenity ${code}`);
            for (const key of ['speed', 'period', 'orbitSpeed', 'angle']) assert.equal(object[key], undefined, 'no orbital motion is invented');
            if (['star', 'planet', 'moon'].includes(object.kind)) assert.ok(Boolean(object.tex) !== Boolean(object.texNone), `${object.id} has a texture key or the reason there is none`);
            else assert.ok(!object.tex && !object.texNone);
        }
    }
});

test('positions: the frame, known distances, and agreement with the trade data', () => {
    for (const file of Object.values(systems)) assert.deepEqual(byId.get(file.star).pos, [0, 0, 0]);
    assert.deepEqual(byId.get('Stanton1').pos, [12850457093, 0, 0]);
    const starKm = (id) => Math.round(km(byId.get(id).pos, [0, 0, 0]));
    assert.equal(starKm('Stanton2'), 19148528);
    assert.equal(starKm('Stanton4'), 43443353);
    assert.equal(starKm('Pyro5'), 42937353);
    assert.equal(starKm('Nyx3'), 38000005);
    assert.equal(Math.round(km(byId.get('Stanton2b').pos, byId.get('Stanton2').pos)), 63277); // Daymar - Crusader
    assert.equal(Math.round(km(byId.get('Pyro4').pos, byId.get('Pyro5').pos)), 375909);
    // z matters: Stanton's jump points are far off the orbital plane
    assert.ok(byId.get('JumpPoint_Stanton_Magnus').pos[2] > 2e10);
    assert.ok(byId.get('JumpPoint_Stanton_Pyro').pos[2] < -2e9);
    // same source, same rule as data/trade/world.json (km there, m here)
    let compared = 0;
    for (const item of [...world.locations, ...world.bodies]) {
        const object = byId.get(item.id);
        assert.ok(object, `${item.id} of world.json is on the map`);
        if (!item.p) { assert.equal(object.nopos, 1, `${item.id} has no position in either file`); continue; }
        assert.ok(km(object.pos, item.p.map((v) => v * 1000)) < 1.5, `${item.id} position differs from world.json`);
        compared += 1;
    }
    assert.equal(compared, 326);
    assert.deepEqual(index.systems.find((system) => system.id === 'pyro').frame.rootRotation, [0.73592, 0, 0, -0.677068]);
});

test('the two gaps of the old position walk are closed', () => {
    // deeper than three containers / outside pu/system and pu/loc
    for (const id of ['Hospital_Stanton1_Lorville', 'Hospital_Stanton4_NewBabbage', 'Hospital_Nyx_Levski', 'Stanton2_housing_grimhex_clinic']) assert.ok(byId.get(id)?.pos, `${id} has a position`);
    assert.ok(index.checks.walk.maxDepth >= 9);
    // ArcCorp area nav points are static entities inside stanton3.ale
    for (const id of ['Area04', 'Area06', 'Area11', 'Area17', 'Area20']) {
        const area = byId.get(id);
        assert.equal(area.body, 'Stanton3');
        assert.ok(Math.abs(area.geo[2]) < 5000, `${id} sits on ArcCorp's surface`);
    }
    assert.deepEqual(byId.get('Area04').rel, [-314337, -601493, 423700]);
});

test('surface places carry body-fixed coordinates that agree with their system position', () => {
    const lorville = byId.get('Stanton1_Lorville');
    assert.deepEqual([lorville.body, lorville.surf, lorville.geo], ['Stanton1', 1, [34.864, -113.6165, 856]]);
    for (const object of all.filter((item) => item.rel)) {
        const body = byId.get(object.body);
        assert.ok(['planet', 'moon'].includes(body.kind));
        // |rel| is the distance to the body centre whatever the body's rotation is
        assert.ok(Math.abs(Math.hypot(...object.rel) - Math.hypot(...object.pos.map((v, i) => v - body.pos[i]))) < 3, `${object.id} rel length`);
        assert.ok(Math.abs(object.geo[2] - (Math.hypot(...object.rel) - (body.phys?.r || body.r))) < 2, `${object.id} altitude is measured from the body radius`);
    }
    const surface = all.filter((item) => item.surf);
    assert.ok(surface.length > 500);
    for (const object of surface) assert.ok(object.geo[2] > -5000 && object.geo[2] < 100000, `${object.id} altitude ${object.geo[2]} m`);
    assert.equal(byId.get('RR_HUR_LEO_CLINIC').surf, undefined, 'a clinic inside an orbital station is not a surface place');
});

test('records without a position are kept, flagged, and never given coordinates; unplaced stations offer no trade, refining or guessed spot', () => {
    const restStops = ['RR_P1_L2', 'RR_P1_L3', 'RR_P1_L4', 'RR_P1_L5', 'RR_P2_L3', 'RR_P3_L2', 'RR_P3_L5', 'RR_P5_L1', 'RR_P5_L3', 'RR_P6_L1', 'RR_P6_L2'];
    for (const id of restStops) {
        const stop = byId.get(id);
        assert.deepEqual([stop.nopos, stop.pos, stop.rel, stop.geo], [1, undefined, undefined, undefined], id);
        assert.equal(stop.parent, 'PyroStar');
        // placed in no container and no UEX terminal: nothing shows the station can be visited
        assert.deepEqual([stop.unplaced, stop.trade, stop.refinery, stop.guess, stop.uex, stop.uexRef], [1, undefined, undefined, undefined, undefined, undefined], id);
    }
    assert.deepEqual(index.checks.unplacedStations, [...restStops, 'RR_P2_LEO'].sort((a, b) => a.localeCompare(b, 'en', { numeric: true })));
    // every unplaced record is one of those stations or a record parented to one; none has a position or a link to another screen's terminal
    const unplaced = all.filter((item) => item.unplaced);
    assert.equal(unplaced.length, 22);
    for (const object of unplaced) {
        assert.ok(index.checks.unplacedStations.includes(object.id) || index.checks.unplacedStations.includes(object.parent), object.id);
        assert.deepEqual([object.pos, object.guess, object.trade, object.refinery], [undefined, undefined, undefined, undefined], object.id);
    }
    // a station that IS placed keeps its flags (the rule only removes what the files give no evidence for)
    assert.deepEqual([byId.get('RR_P2_L4').trade, byId.get('RR_P2_L4').refinery, byId.get('RR_P2_L4').unplaced], [1, 1, undefined]);
    assert.equal(all.filter((item) => item.nopos && (item.trade || item.refinery)).length, 0);
    assert.deepEqual([byId.get('Delamar').nopos, byId.get('Delamar').parent, byId.get('Delamar').guess], [1, 'NyxStar', undefined]);
    assert.equal(byId.has('Ellis3'), false);
    // the name rule behind `guess` holds for every rest stop that does have a position
    assert.deepEqual([index.checks.restStopGuess.tested, index.checks.restStopGuess.agreed, index.checks.restStopGuess.failed], [11, 11, []]);
    for (const object of all.filter((item) => item.guess)) assert.equal(object.nopos, 1);
    assert.deepEqual(all.filter((item) => item.nopos && item.kind !== 'jump').map((item) => item.sys).filter((sys) => sys === 'stanton'), []);
});

test('jump links: three working pairs, each two-way, the rest flagged not usable', () => {
    assert.deepEqual(index.links.map((link) => `${link.a.jump}<>${link.b.jump}`).sort(), ['JumpPoint_Pyro_Nyx<>JumpPoint_Nyx_Pyro', 'JumpPoint_Stanton_Magnus<>JumpPoint_Nyx_Castra', 'JumpPoint_Stanton_Pyro<>JumpPoint_Pyro_Stanton']);
    for (const link of index.links) {
        for (const [end, other] of [[link.a, link.b], [link.b, link.a]]) {
            const jump = systems[end.sys].jumps.find((item) => item.id === end.jump);
            assert.deepEqual([jump.usable, jump.to, jump.peer], [1, other.sys, other.jump]);
            assert.deepEqual(end.pos, byId.get(end.jump).pos);
            assert.ok(km(end.entry, end.pos) < 100, 'the jump entity sits within 100 km of its container');
            assert.ok(km(byId.get(end.station).pos, end.pos) < 1000, 'gateway station is next to the jump point');
            assert.equal(byId.get(end.station).gate, end.jump);
            const named = /^JumpPoint_[A-Za-z]+_([A-Za-z]+)$/.exec(end.jump)[1];
            assert.deepEqual(byId.get(end.jump).jump, { usable: 1, to: other.sys, ...(named.toLowerCase() === other.sys ? {} : { named }), peer: other.jump, station: end.station });
        }
    }
    const jumps = Object.values(systems).flatMap((file) => file.jumps);
    assert.equal(jumps.length, all.filter((object) => object.kind === 'jump').length);
    assert.equal(jumps.filter((jump) => jump.usable).length, 6);
    const dead = jumps.filter((jump) => !jump.usable);
    assert.deepEqual(dead.map((jump) => jump.toName).sort(), ['Bremen', 'Cano', 'Castra', 'Hadrian', 'Odin', 'Oso', 'Terra', 'Terra', 'Tohil', 'Virgil']);
    for (const jump of dead) assert.deepEqual([jump.to, jump.peer, jump.entry], [undefined, undefined, undefined]);
    // the record names mislead; the files say where each one really goes
    assert.equal(systems.stanton.jumps.find((jump) => jump.id === 'JumpPoint_Stanton_Magnus').to, 'nyx');
    assert.equal(systems.nyx.jumps.find((jump) => jump.id === 'JumpPoint_Nyx_Castra').to, 'stanton');
    // ... and the name's own system is kept (`named`) so the screen can say that the record name and the files disagree
    assert.deepEqual(jumps.filter((jump) => jump.named).map((jump) => [jump.id, jump.named, jump.to]), [['JumpPoint_Stanton_Magnus', 'Magnus', 'nyx'], ['JumpPoint_Nyx_Castra', 'Castra', 'stanton']]);
    // agrees with the gateway names the trade data inferred
    for (const location of world.locations.filter((item) => item.gate)) {
        const jump = byId.get(byId.get(location.id).gate).jump;
        assert.equal((jump.to || jump.toName).toLowerCase(), location.gate.toLowerCase(), location.id);
    }
});

test('review fixes: shared region names, claims kept apart, stand-in bodies, live terminals', () => {
    const region = (sys, id) => systems[sys].regions.find((item) => item.id === id);
    // a mining table named after a place in another system is flagged where it is used elsewhere (the screen must not show that name as this place's name)
    assert.equal(region('stanton', 'Stanton2c_Belt').shared, undefined);
    assert.deepEqual([region('pyro', 'Stanton2c_Belt').shared, region('pyro', 'Stanton2c_Belt').at], ['stanton', ['Pyro6']]);
    assert.equal(region('nyx', 'Pyro_DeepSpaceAsteroids').shared, 'pyro');
    assert.equal(region('pyro', 'Pyro_DeepSpaceAsteroids').shared, undefined);
    for (const file of Object.values(systems)) for (const item of file.regions) if (item.shared) assert.notEqual(item.shared, file.system, item.id);
    // Lagrange type C: the five declared points and what sits inside them; mining claims inside OTHER fields use the same table but are listed apart
    const typeC = region('stanton', 'Lagrange_C');
    const declared = helper.locations.find((location) => location.id === 'Lagrange_C').usedBy;
    const within = (id) => { for (let cur = byId.get(id), guard = 0; cur && guard < 12; guard += 1) { if (declared.includes(cur.id)) return true; cur = byId.get(cur.in) || byId.get(cur.parent); } return false; };
    for (const id of typeC.at) assert.ok(within(id), `${id} is inside a type C point`);
    for (const id of typeC.also) { assert.ok(!within(id), id); assert.match(id, /^PrivateMiningPoint_/); assert.ok(byId.get(id).areas.includes('Lagrange_C')); }
    assert.deepEqual([typeC.at.length, typeC.also.length], [50, 120]);
    assert.ok(typeC.also.includes('PrivateMiningPoint_Stanton1_L1_001'));
    for (const file of Object.values(systems)) for (const item of file.regions) for (const id of item.also || []) assert.ok(!item.at.includes(id), `${item.id}: ${id} in both lists`);
    // Nyx I-III are placed through a stand-in container: their size is a placeholder
    assert.deepEqual(all.filter((item) => item.stub).map((item) => [item.id, item.r, item.phys]), [['Nyx1', 1000000, undefined], ['Nyx2', 1000000, undefined], ['Nyx3', 1000000, undefined]]);
    for (const item of all.filter((object) => ['planet', 'moon'].includes(object.kind) && object.pos && !object.stub)) assert.ok(item.phys?.r > 0, `${item.id} has a container radius`);
    // terminals UEX marks as not live are kept for look-ups but left out of uexLive
    const snapshot = JSON.parse(readFileSync(new URL('../../scripts/trade/uex-join-snapshot.json', import.meta.url)));
    const notLive = new Set(snapshot.terminals.filter((terminal) => terminal.is_available_live === 0).map((terminal) => terminal.id));
    assert.deepEqual([byId.get('RR_JP_StantonPyro').uex, byId.get('RR_JP_StantonPyro').uexLive], [[252, 318, 329], [252]]);
    for (const item of all.filter((object) => object.uex)) {
        const live = item.uex.filter((terminal) => !notLive.has(terminal));
        assert.deepEqual(item.uexLive, live.length && live.length < item.uex.length ? live : undefined, item.id);
    }
});

test('rings and regions: game ring numbers where the game has them, measured or missing otherwise', () => {
    assert.deepEqual(byId.get('StantonStar').rings, [{ inner: 19000000000, outer: 20500000000, depth: 29600000, density: 1, size: 50 }]);
    assert.deepEqual(byId.get('Stanton2c').rings, [{ inner: 482000, outer: 782000, depth: 2000, density: 0.2, size: 8 }]);
    assert.equal(all.filter((object) => object.rings).length, 2);
    const region = (sys, id) => systems[sys].regions.find((item) => item.id === id);
    assert.equal(region('stanton', 'AaronHalo').ring.of, 'StantonStar');
    assert.equal(region('stanton', 'Stanton2c_Belt').ring.of, 'Stanton2c');
    assert.deepEqual([region('pyro', 'Stanton2c_Belt').at, region('pyro', 'Stanton2c_Belt').noShape, region('pyro', 'Stanton2c_Belt').ring], [['Pyro6'], 1, undefined]);
    for (const id of ['Nyx_GlaciemRing', 'Nyx_KeegerBelt']) { const band = region('nyx', id).band; assert.equal(band.derived, 1); assert.ok(band.n > 10 && band.outer - band.inner < 1e8); }
    assert.ok(Math.abs(region('nyx', 'Nyx_GlaciemRing').band.inner / 1e9 - 15) < 0.01);
    assert.ok(Math.abs(region('nyx', 'Nyx_KeegerBelt').band.inner / 1e9 - 48) < 0.01);
    assert.deepEqual(region('stanton', 'Lagrange_A').at.filter((id) => byId.get(id).kind === 'lagrange'), ['Stanton1_L1', 'Stanton1_L4']);
    for (const file of Object.values(systems)) {
        for (const item of file.regions) {
            assert.ok(item.at.length, `${item.id} names at least one map object`);
            for (const id of item.at) { assert.equal(byId.get(id).sys, file.system); assert.ok(byId.get(id).areas.includes(item.id)); }
            assert.ok(index.regionSystems[item.id].includes(file.system));
        }
    }
});

test('joins: every key the trade, mining and mission screens use resolves or is listed', () => {
    const c = index.coverage;
    // trade
    assert.deepEqual([c.tradeLocations.total, c.tradeLocations.onMap, c.tradeLocations.missing], [world.locations.length, world.locations.length, []]);
    // every trade location is on the map; it carries the trade flag unless it is an unplaced station (no container placement, no UEX terminal)
    const unplaced = new Set(index.checks.unplacedStations);
    for (const location of world.locations) assert.equal(byId.get(location.id).trade, unplaced.has(location.id) ? undefined : 1, location.id);
    assert.equal(all.filter((object) => object.trade).length, world.locations.filter((location) => !unplaced.has(location.id)).length);
    const terminals = Object.entries(world.joins.terminals.map);
    for (const [terminal, id] of terminals) assert.ok(byId.get(id).uex.includes(Number(terminal)), `UEX terminal ${terminal} -> ${id}`);
    assert.equal(all.reduce((sum, object) => sum + (object.uex?.length || 0), 0), terminals.length);
    assert.equal(c.uexTerminals.terminalIds, world.joins.terminals.matched);
    for (const [terminal, id] of Object.entries(world.joins.refineries.map)) assert.ok(byId.get(id).uexRef.includes(Number(terminal)));
    // refineries and mining
    const desks = new Map(helper.refineryDesks.map((desk) => [desk.id, desk.terminalId]));
    assert.equal(desks.size, 20);
    assert.equal(desks.get('Nyx_Levski'), 788);
    assert.equal(all.filter((object) => object.refinery).length, desks.size);
    for (const [id, terminal] of desks) {
        assert.equal(byId.get(id).refinery, 1, id);
        assert.ok(byId.get(id).uexRef.includes(terminal), id);
    }
    for (const refinery of helper.refineries) assert.equal(byId.get(refinery.id).refinery, unplaced.has(refinery.id) ? undefined : 1, refinery.id);
    assert.equal(helper.refineries.filter((refinery) => unplaced.has(refinery.id)).length, 12);
    assert.equal(c.refineries.onMap, helper.refineries.length);
    for (const location of mining.locations.filter((item) => item.kind === 'body')) assert.equal(byId.get(location.id).mine, 1);
    for (const place of helper.places) assert.ok(place.tables.every((table) => byId.get(place.id).areas.includes(table)), `${place.id} lists its mining tables`);
    const areaIds = mining.locations.filter((item) => item.kind === 'area').map((item) => item.id);
    assert.deepEqual(areaIds.filter((id) => !index.regionSystems[id]).sort(), c.miningAreas.missing);
    assert.deepEqual(c.miningAreas.missing, helper.locations.filter((item) => item.kind === 'area' && item.unplaced).map((item) => item.id).sort(), 'only the tables the mining data itself marks as not placed are missing');
    // missions
    for (const id of Object.keys(missions.places)) assert.ok(byId.has(id) || c.missionPlaces.alias[id] || c.missionPlaces.missing.includes(id), id);
    assert.deepEqual(c.missionPlaces.missing, ['Nyx']);
    for (const [from, to] of Object.entries(c.missionPlaces.alias)) assert.equal(byId.get(to).kind, 'star', from);
    const siteIds = new Set(Object.keys(index.siteSystems));
    assert.equal(siteIds.size + c.missionSites.unresolved.length, missions.locations.length);
    assert.equal(c.missionSites.placed + c.missionSites.byTagOnly + c.missionSites.unresolved.length, c.missionSites.total);
    for (const location of missions.locations) assert.ok(siteIds.has(location.id) || c.missionSites.unresolved.includes(location.id), location.id);
    for (const file of Object.values(systems)) {
        for (const [id, site] of Object.entries(file.sites)) {
            assert.ok(index.siteSystems[id].includes(file.system));
            assert.ok(site.at || site.alt || site.spots || site.near, id);
            for (const at of site.at || []) assert.ok(byId.get(at).pos && byId.get(at).sys === file.system, `${id} at ${at}`);
            for (const [at, n] of site.alt || []) assert.ok(byId.get(at).more[n], `${id} alt ${at} ${n}`);
            for (const spot of site.spots || []) { assert.ok(byId.get(spot[0]).sys === file.system && [4, 7].includes(spot.length) && spot.slice(1).every(Number.isSafeInteger), `${id} spot`); }
            if (site.near) { assert.equal(site.via, 'tag'); for (const body of site.near) assert.ok(['star', 'planet', 'moon'].includes(byId.get(body).kind)); }
        }
    }
    // a site with a system in the mission data is found in that system
    for (const location of missions.locations.filter((item) => item.sys && index.siteSystems[item.id])) assert.ok(index.siteSystems[location.id].includes(location.sys.toLowerCase()), `${location.id} is in ${location.sys}`);
});

test('texture keys match the exported textures; stars and Pyro V have none', () => {
    assert.deepEqual(index.checks.textures.star.sort(), ['NyxStar', 'PyroStar', 'StantonStar']);
    assert.deepEqual(index.checks.textures.borrowed, ['Pyro5']);
    assert.deepEqual(index.checks.textures.none, ['Delamar']);
    assert.deepEqual(index.checks.textures.materialFilesMissing, []);
    const keys = all.filter((object) => object.tex).map((object) => object.tex);
    assert.equal(keys.length, 30);
    assert.equal(new Set(keys).size, 30, 'one texture per body');
    assert.equal(byId.get('Stanton1').tex, 'ui_sm_stanton_1_hurston');
    if (existsSync(path('starmap/textures.json'))) {
        const exported = data('starmap/textures.json');
        assert.deepEqual([...keys].sort(), Object.keys(exported.textures).sort());
    }
});

test('raw body numbers are passed through, not interpreted', () => {
    assert.deepEqual(byId.get('Stanton1').phys, { r: 1000000, rot: 2.48, atmo: 80, g: -9.81 });
    assert.deepEqual(byId.get('Stanton2').phys, { r: 7450010, rot: 5.1, atmo: 600, g: -9.81, gas: 1 });
    assert.equal(byId.get('Stanton2').r, 7450000);
    assert.equal(byId.get('Nyx1').phys, undefined, 'the Nyx planets point at a container that is not in the game archive');
    assert.equal(all.filter((object) => object.phys).length, 28);
    assert.match(index.units.phys, /not stated/);
});

test('files stay small enough for phones', () => {
    for (const system of index.systems) {
        const text = readFileSync(path(`starmap/${system.id}.json`));
        assert.deepEqual(system.bytes, { raw: text.length, gzip: zlib.gzipSync(text, { level: 9 }).length });
        assert.ok(system.bytes.gzip < 80000, `${system.id}.json is ${system.bytes.gzip} bytes gzipped`);
    }
    assert.ok(zlib.gzipSync(readFileSync(path('starmap/index.json')), { level: 9 }).length < 12000);
});
