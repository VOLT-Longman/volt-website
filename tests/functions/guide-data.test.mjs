import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { haulingCargo, miningTraits } from '../../scripts/gamedata/guide-extract.mjs';

const data = (path) => JSON.parse(readFileSync(new URL(`../../data/${path}`, import.meta.url)));

test('separate delivery orders with identical cargo retain their source and bounds', () => {
    const order = (n, min, max) => ({ missionVariableName: `Dropoff${n}`, value: { haulingOrderContent: [{ __type: 'HaulingOrderContent_Resource', resource: { name: 'ResourceType.OrganiMass' }, minSCU: min, maxSCU: max, maxContainerSize: 16 }] } });
    const cargo = haulingCargo({ properties: [order(1, 44, 0), order(2, 44, 0), order(3, 40, 40)] });
    assert.deepEqual(cargo.map((row) => [row.order, row.min, row.max]), [['Dropoff1', 44, 0], ['Dropoff2', 44, 0], ['Dropoff3', 40, 40]]);
    assert.equal(haulingCargo({ __type: 'HaulingOrderContent_Resource', resource: { name: 'ResourceType.Gold' } })[0].min, undefined);
});

test('conflicting or missing mining traits are not replaced by the last record or zero', () => {
    assert.equal(miningTraits([{ elementResistance: 0 }, { elementResistance: -1 }]).resistance, undefined);
    assert.equal(miningTraits([{ elementResistance: 0 }, {}]).resistance, undefined);
    assert.equal(miningTraits([{ elementResistance: 0 }]).resistance, 0);
});

test('generated guides retain audited source values and the same game build', () => {
    const mining = data('mining/mining.json'), hauling = data('contracts/hauling.json'), crafting = data('loadout/crafting.json');
    for (const guide of [mining, hauling, crafting]) {
        assert.equal(guide.gameVersion, data('loadout/meta.json').gameVersion);
        assert.equal(guide.sourceHash, '005984f5507314a0d5dc3a8d7457bffc03578eeabb1e5da6e6c2d010e81649f4');
    }
    const aphorite = mining.minerals.find((item) => item.id === 'Aphorite');
    assert.deepEqual(aphorite.elementSources, ['MinableElement_FPS_Aphorite']);
    assert.equal(aphorite.resistance, 0);
    assert.equal(aphorite.window, 0.7);
    const cargo = hauling.contracts.find((item) => item.id === 'HaulCargo_SingleToMulti_Interstellar_Bulk_OrganiMass').cargo;
    assert.deepEqual(cargo.map((row) => row.min), [44, 44, 40]);
    assert.equal(new Set(cargo.map((row) => row.order)).size, 3);
    const mineable = new Set(mining.minerals.flatMap((item) => [item.id, item.refined?.id]));
    assert.ok(crafting.miningResources.every((id) => mineable.has(id)));
    assert.ok(!crafting.miningResources.includes('Sadaryx'));
    assert.ok(Object.values(crafting.recipes).every((recipe) => recipe.tier === 0 && recipe.blueprint));
});

test('hauling availability regions follow named game starmap references', () => {
    const { localities, contracts } = data('contracts/hauling.json');
    for (const [region, id, english] of [['RegionA', 'Pyro1', 'Pyro I'], ['RegionB', 'Pyro3', 'Bloom'], ['RegionC', 'Pyro4', 'Pyro IV'], ['RegionD', 'Pyro6', 'Terminus']]) {
        assert.equal(localities[region].source, 'MissionLocality.availableLocations');
        const place = localities[region].members.find(p => p.id === id);
        assert.equal(place.name.en, english);
        assert.ok(place.name.ko);
    }
    assert.deepEqual(localities.PyroAndNyx.members.map(p => p.name.ko), ['파이로', '닉스']);
    assert.equal(contracts.filter(c => c.cargo?.length).length, 36);
    assert.ok(contracts.every(c => c.reward === undefined), 'Do not invent missing aUEC payouts');
});

// ---- mining guide extension (scripts/mining/build-mining-data.mjs) ----
const LOCATION_TYPES = ['planet', 'moon', 'belt', 'lagrange', 'cluster'];
const SITE_TYPES = ['cluster', 'cave', 'event', 'site'];

test('mining guide keeps the fields the current page reads', () => {
    const mining = data('mining/mining.json');
    assert.equal(mining.minerals.length, 33);
    assert.equal(mining.locations.length, 43);
    assert.equal(typeof mining.note, 'string');
    assert.ok(mining.note.startsWith('비중과 함량은 게임 파일 값이며 게임 안 실측값이 아니다.'));
    for (const location of mining.locations) {
        assert.ok(location.id && location.name.en && ['body', 'area'].includes(location.kind), location.id);
        assert.ok(location.groups.length, location.id);
        for (const group of location.groups) {
            assert.ok(['ship', 'vehicle', 'hand'].includes(group.mode));
            assert.ok(group.rocks.length);
            const total = group.rocks.reduce((sum, rock) => sum + rock.share, 0);
            assert.ok(Math.abs(total - 100) < 0.6, `${location.id} ${group.mode} shares add up to ${total}`);
            for (const rock of group.rocks) for (const part of rock.minerals) assert.ok(mining.minerals.some((mineral) => mineral.id === part.id), part.id);
        }
    }
    for (const mineral of mining.minerals) assert.ok(mineral.modes.length && mineral.elementSources.length, mineral.id);
    const hurstonShip = mining.locations.find((item) => item.id === 'Stanton1').groups.find((group) => group.mode === 'ship');
    assert.deepEqual(hurstonShip.rocks.map((rock) => rock.share), [44, 44, 10, 2]);
    assert.equal(new Set(mining.locations.map((item) => item.id)).size, mining.locations.length);
});

test('every mining location has a type and a star system; event and test tables stay out of locations', () => {
    const mining = data('mining/mining.json');
    for (const location of mining.locations) {
        assert.ok(LOCATION_TYPES.includes(location.type), `${location.id}: ${location.type}`);
        assert.ok(['Stanton', 'Pyro', 'Nyx'].includes(location.system), location.id);
    }
    assert.equal(mining.locations.find((item) => item.id === 'Stanton1').type, 'planet');
    assert.equal(mining.locations.find((item) => item.id === 'Stanton2c').type, 'moon');
    assert.equal(mining.locations.find((item) => item.id === 'AaronHalo').type, 'belt');
    assert.equal(mining.locations.find((item) => item.id === 'Lagrange_A').type, 'lagrange');
    assert.equal(mining.locations.find((item) => item.id === 'Pyro_AkiroCluster').type, 'cluster');
    assert.ok(!mining.locations.some((item) => /ResourceRush|ShipGraveyard|SpaceDerelict|^AsteroidCluster_/.test(item.id)));
    const siteIds = mining.sites.flatMap((site) => [site.id, ...(site.also || [])]);
    assert.equal(new Set(siteIds).size, siteIds.length);
    for (const site of mining.sites) {
        assert.ok(SITE_TYPES.includes(site.type), `${site.id}: ${site.type}`);
        assert.ok(site.groups || site.salvage || site.slots, site.id);
        for (const slot of site.slots || []) for (const item of slot.items) {
            assert.ok(item.rock ? mining.rocks[item.rock] : mining.harvestables[item.plant], `${site.id} ${item.rock || item.plant}`);
            assert.ok(Number.isFinite(item.w));
        }
    }
    assert.ok(mining.sites.some((site) => site.type === 'cave') && mining.sites.some((site) => site.type === 'event'));
    // The deepest-slot weight is read out, not dropped.
    const hurstonCave = mining.sites.find((site) => site.id === 'Cave_Hurston_Rich');
    assert.deepEqual(hurstonCave.slots[0].items.find((item) => item.rock === 'FPS_Composition_JanaliteDeposit'), { rock: 'FPS_Composition_JanaliteDeposit', w: 0.2, wDeep: 0.4 });
});

test('base scan signature and cluster sizes allow "signature value -> rock x count"', () => {
    const mining = data('mining/mining.json');
    const rows = [...mining.locations, ...mining.sites].flatMap((place) => (place.groups || []).flatMap((group) => group.rocks));
    assert.ok(rows.length > 200);
    for (const rock of rows) {
        assert.ok(mining.rocks[rock.id]?.sig > 0, `${rock.id} has a base signature`);
        assert.ok(mining.clusters[rock.cluster], `${rock.id} cluster ${rock.cluster}`);
    }
    assert.equal(mining.rocks.CommonShipMineablesAsteroid_Iron.sig, 4270);
    assert.equal(mining.rocks.CommonShipMineables_Iron.sig, 4270);
    assert.equal(mining.rocks.LegendaryShipMineables_Quantainium.sig, 3170);
    assert.equal(mining.rocks.LegendaryShipMineables_Quantainium.tier, 'legendary');
    assert.equal(mining.rocks.GroundVehicle_Composition_BeradomDeposit.sig, 4000);
    assert.equal(mining.rocks.FPS_Composition_HadaniteDeposit.sig, 3000);
    assert.deepEqual(mining.clusters.CommonShipMineable_Cluster, { chance: 100, sizes: [{ w: 0.1, min: 6, max: 6 }, { w: 0.3, min: 5, max: 5 }, { w: 0.6, min: 4, max: 4 }] });
    assert.deepEqual(mining.clusters.LegendaryShipMineable_Cluster, { chance: 25, sizes: [{ w: 0.1, min: 2, max: 2 }] });
    // Identify a typed scanner value: which rock and how many, using only stored facts (the x count rule itself is flagged unverified).
    const identify = (value) => Object.entries(mining.rocks).filter(([, rock]) => rock.sig && value % rock.sig === 0).map(([id, rock]) => `${id} x${value / rock.sig}`);
    assert.deepEqual(identify(4270 * 5), ['CommonShipMineables_Iron x5', 'CommonShipMineablesAsteroid_Iron x5']);
    assert.deepEqual(identify(3170 * 2), ['LegendaryShipMineables_Quantainium x2', 'LegendaryShipMineablesAsteroid_Quantainium x2']);
    assert.match(mining.unknowns.scanner, /확인/);
    assert.match(mining.note, /share/);
    assert.match(mining.note, /rocks\[\]\.sig/);
});

test('mining groups carry file weights and both parts of a two-part ore stay labelled', () => {
    const mining = data('mining/mining.json');
    const hurston = mining.locations.find((item) => item.id === 'Stanton1');
    assert.deepEqual(hurston.groups.map((group) => [group.mode, group.weight]), [['vehicle', 12.5], ['hand', 25], ['ship', 6]]);
    assert.equal(mining.locations.find((item) => item.id === 'AaronHalo').groups[0].weight, 0.3);
    const aluminum = hurston.groups.find((group) => group.mode === 'ship').rocks.find((rock) => rock.id === 'CommonShipMineables_Aluminum');
    assert.deepEqual(aluminum.minerals.map((part) => [part.id, part.qualityScale]), [['Ore_Aluminum', 1], ['Ore_Aluminum', 0.49], ['Raw_Corundum', 0.789]]);
    for (const location of mining.locations) for (const group of location.groups) {
        assert.ok(group.weight > 0, `${location.id} ${group.mode}`);
        for (const rock of group.rocks) for (const part of rock.minerals) assert.ok(part.qualityScale > 0 && part.qualityScale <= 1);
    }
});

test('quality ranges come per mineral with system and place overrides', () => {
    const mining = data('mining/mining.json');
    const iron = mining.minerals.find((item) => item.id === 'Ore_Iron');
    assert.deepEqual(mining.quality.dists[iron.quality.dist], { min: 501, max: 1000, mean: 500, stddev: 143 });
    assert.deepEqual(mining.quality.overrides[iron.quality.over], [{ system: 'Pyro', min: 501, max: 1000, mean: 500, stddev: 149 }]);
    const hadanite = mining.minerals.find((item) => item.id === 'Hadanite');
    assert.deepEqual(mining.quality.dists[hadanite.quality.dist], { min: 201, max: 1000, mean: 201, stddev: 298 });
    const savrilium = mining.minerals.find((item) => item.id === 'Ore_Savrilium');
    const breaker = mining.quality.overrides[savrilium.quality.over].find((row) => row.place);
    assert.equal(breaker.min, 651);
    assert.equal(breaker.count, 61);
    assert.equal(breaker.system, 'Nyx');
    assert.equal(breaker.name.en, 'QV Breaker Station');
    assert.ok(breaker.name.ko);
    for (const mineral of [...mining.minerals, ...mining.extraMinerals]) {
        assert.ok(mining.quality.dists[mineral.quality.dist], mineral.id);
        if (mineral.quality.over) assert.ok(mining.quality.overrides[mineral.quality.over].length, mineral.id);
    }
    assert.deepEqual(Object.keys(mining.quality.byMode), ['ship', 'vehicle', 'hand']);
    assert.ok(mining.quality.byMode.hand.dists.includes('FPSMineable_QualityDistribution_Default'));
    assert.match(mining.unknowns.quality, /qualityScale/);
});

test('plants, wrecks and debris are listed per location with file weights', () => {
    const mining = data('mining/mining.json');
    const hurston = mining.locations.find((item) => item.id === 'Stanton1');
    assert.equal(hurston.harvest.weight, 35);
    assert.deepEqual(hurston.harvest.items[0], { id: 'Plant_Prota', share: 24.4, cluster: 'Harvestables_Cluster_Low' });
    assert.equal(mining.harvestables.Plant_Prota.name.en, 'Prota');
    assert.ok(mining.harvestables.Plant_Prota.name.ko);
    assert.equal(mining.harvestables.Plant_Prota.gives[0].id, 'Fruit_Prota');
    assert.deepEqual(mining.locations.filter((item) => item.harvest).map((item) => item.id), ['Stanton1', 'Stanton1a', 'Stanton2b', 'Stanton4', 'Pyro1', 'Pyro2', 'Pyro4']);
    for (const location of mining.locations.filter((item) => item.harvest)) for (const item of location.harvest.items) assert.ok(mining.harvestables[item.id]?.name?.en, item.id);
    assert.ok(hurston.areas.some((area) => area.name === 'Savanna' && area.mods.Plant_Pitambu === 2));
    assert.match(mining.unknowns.areas, /확인/);

    const halo = mining.locations.find((item) => item.id === 'AaronHalo');
    assert.deepEqual(halo.salvage.map((group) => [group.kind, group.weight]), [['fresh', 0.04], ['poor', 0.01], ['normal', 0.0057], ['elite', 0.00033]]);
    const fresh = mining.salvageSets[halo.salvage[0].set];
    assert.deepEqual(fresh.map((item) => item.id), ['SalvageScrap_ReclaimerMultiGeo', 'SalvageableDebris_C2', 'SalvageableDebris_890']);
    assert.equal(mining.wrecks.SalvageableDebris_C2.sig, 2400);
    assert.equal(mining.wrecks.SalvageableDebris_C2.name.en, 'Crusader C2 Hercules Starlifter');
    assert.equal(mining.wrecks.SalvageableDebris_C2.kind, 'ship');
    const withSalvage = mining.locations.filter((item) => item.salvage);
    assert.equal(withSalvage.length, 18);
    assert.ok(withSalvage.every((item) => !['planet', 'moon'].includes(item.type)));
    for (const place of [...mining.locations, ...mining.sites]) for (const group of place.salvage || []) {
        assert.ok(['fresh', 'poor', 'normal', 'elite'].includes(group.kind));
        for (const item of mining.salvageSets[group.set]) assert.ok(mining.wrecks[item.id], item.id);
    }
});

test('special deposits, event tables and unresolved rows are explicit, not guessed', () => {
    const mining = data('mining/mining.json');
    assert.ok(!mining.minerals.some((item) => item.id === 'Sadaryx'));
    assert.deepEqual(mining.extraMinerals.map((item) => item.id).sort(), ['Carinite', 'CarinitePure', 'Ore_Jaclium', 'Ore_Saldynium', 'Sadaryx']);
    const special = (id) => mining.special.find((item) => item.rock === id);
    assert.deepEqual(special('LegendaryShipMineablesAsteroid_Savrilium').at, ['Nyx_GlaciemRing', 'Nyx_KeegerBelt']);
    assert.equal(special('LegendaryShipMineablesAsteroid_Savrilium_RCD').siteOnly, true);
    assert.deepEqual(special('FPS_Composition_SadaryxDeposit').sites, ['V3SlotPreset_RockCracker']);
    assert.ok(mining.rocks.LegendaryShipMineablesAsteroid_Savrilium_RCD.minerals.some((part) => part.id === 'Ore_Savrilium'));
    for (const item of mining.special) assert.ok(item.tier === 'epic' || item.tier === 'legendary' || item.siteOnly, item.rock);
    // The gold event rock has an empty entity reference in the game file: named as unresolved, no invented rock.
    const rush = mining.sites.find((site) => site.id === 'ResourceRush_Gold');
    assert.equal(rush.type, 'event');
    assert.deepEqual(rush.groups, [{ mode: 'ship', weight: 0.5, unresolved: ['Mining_AsteroidGoldOnly'], rocks: [] }]);
    assert.ok(mining.locations.every((location) => location.groups.every((group) => !group.unresolved)));
});

test('Lagrange points link to their tables and refineries are a game-file list without yields', () => {
    const mining = data('mining/mining.json');
    const place = (id) => mining.places.find((item) => item.id === id);
    assert.deepEqual(place('Stanton1_L1'), { id: 'Stanton1_L1', name: { en: 'HUR L1' }, system: 'Stanton', type: 'lagrange', tables: ['Lagrange_A'] });
    assert.deepEqual(place('Stanton4_L2').tables, ['Lagrange_C']);
    assert.deepEqual(place('Pyro6_L3').tables, ['Pyro_Cool02']);
    assert.deepEqual(place('Pyro6'), { id: 'Pyro6', name: { en: 'Terminus', ko: '터미너스 [Terminus]' }, system: 'Pyro', type: 'belt', tables: ['Stanton2c_Belt'] });
    assert.equal(mining.places.filter((item) => item.type === 'lagrange' && item.system === 'Stanton').length, 20);
    assert.equal(mining.places.filter((item) => item.type === 'lagrange' && item.system === 'Pyro').length, 25);
    const tables = new Set(mining.locations.map((item) => item.id));
    for (const item of mining.places) {
        assert.ok(item.tables.length, item.id);
        for (const table of item.tables) assert.ok(tables.has(table), `${item.id} -> ${table}`);
    }
    for (const location of mining.locations.filter((item) => item.type === 'planet' || item.type === 'moon')) assert.ok(location.containers.includes(location.id.toLowerCase()), location.id);

    assert.equal(mining.refineries.length, 31);
    assert.equal(new Set(mining.refineries.map((item) => item.id)).size, 31);
    assert.ok(mining.refineries.every((item) => ['Stanton', 'Pyro', 'Nyx'].includes(item.system)));
    assert.deepEqual(mining.refineries.find((item) => item.id === 'RR_HUR_L1').name, { en: 'HUR-L1 Green Glade Station', ko: 'HUR-L1 그린 글레이드 스테이션 [Green Glade]' });
    // Refinery yield numbers are not in the game files and must not appear here.
    assert.ok(!/"(yield|yields|bonus|refineTime|refineCost)"/i.test(JSON.stringify(mining)));
    assert.match(mining.unknowns.refineries, /UEX/);
});

test('mining belt names come from the game text and the Korean patch, not hand-written', () => {
    const mining = data('mining/mining.json');
    const location = (id) => mining.locations.find((item) => item.id === id);
    assert.deepEqual(location('AaronHalo').name, { en: 'Aaron Halo', ko: '아론 헤일로' });
    assert.deepEqual(location('Nyx_GlaciemRing').name, { en: 'Glaciem Ring', ko: '글레시엠 고리' });
    assert.deepEqual(location('Nyx_KeegerBelt').name, { en: 'Keeger Belt', ko: '키거 소행성대' });
    for (const id of ['AaronHalo', 'Nyx_GlaciemRing', 'Nyx_KeegerBelt', 'Pyro_AkiroCluster', 'Stanton1']) assert.equal(location(id).named, true, id);
    // Labels we wrote ourselves stay marked as such (no `named`), and the data says so.
    for (const id of ['Lagrange_A', 'Stanton2c_Belt', 'Pyro_Cool01', 'Pyro_DeepSpaceAsteroids']) assert.equal(location(id).named, undefined, id);
    assert.ok(mining.sites.every((site) => site.named === undefined));
    assert.match(mining.unknowns.names, /named: true/);
});

test('tables no place uses are not shown as Lagrange fields; every Lagrange table names the points that use it', () => {
    const mining = data('mining/mining.json');
    const placeIds = new Set(mining.places.map((item) => item.id));
    for (const location of mining.locations) {
        for (const id of location.usedBy || []) {
            assert.ok(placeIds.has(id), `${location.id} usedBy ${id}`);
            assert.ok(mining.places.find((item) => item.id === id).tables.includes(location.id));
        }
        if (location.type === 'lagrange') assert.ok(location.usedBy?.length, location.id);
        if (location.unplaced) assert.ok(!location.usedBy && location.type !== 'lagrange', location.id);
    }
    for (const item of mining.places) for (const table of item.tables) assert.ok(mining.locations.find((location) => location.id === table).usedBy.includes(item.id));
    assert.deepEqual(mining.locations.filter((item) => item.unplaced).map((item) => [item.id, item.type, item.containers]), [['Lagrange_G', 'cluster', ['miningasteroid_006']], ['Lagrange_Occupied', 'cluster', ['miningasteroid_004']]]);
    assert.deepEqual(mining.sites.filter((item) => item.unplaced).map((item) => item.id), ['ResourceRush_Gold_HighDensity', 'SpaceDerelict_General']);
    assert.ok(mining.sites.filter((item) => item.unplaced).every((item) => !item.containers));
    // A table can be used outside the system its hand-written name suggests.
    assert.deepEqual(mining.locations.find((item) => item.id === 'Stanton2c_Belt').usedBy, ['Pyro6', 'Stanton2c']);
    // The archive scan covers containers outside the system folders and .pla files.
    assert.ok(mining.locations.find((item) => item.id === 'Stanton1').containers.includes('stanton1_planet_only'));
    assert.ok(mining.locations.find((item) => item.id === 'Stanton4').containers.includes('stanton4_planet_only'));
    for (const key of ['unplaced', 'containers', 'sharedTables', 'lagrangeStation', 'slots', 'plants']) assert.equal(typeof mining.unknowns[key], 'string', key);
    assert.equal(mining.unknowns.links, undefined);
});

test('scan signatures are ambiguous for hand and vehicle rocks and the data says so', () => {
    const mining = data('mining/mining.json');
    const sigs = (mode) => new Set(Object.values(mining.rocks).filter((rock) => rock.modes?.includes(mode) && rock.sig).map((rock) => rock.sig));
    assert.deepEqual([...sigs('hand')], [3000]);
    assert.deepEqual([...sigs('vehicle')], [4000]);
    assert.ok(sigs('ship').size > 20);
    const candidates = Object.entries(mining.rocks).filter(([, rock]) => rock.sig && 48000 % rock.sig === 0);
    assert.ok(candidates.some(([, rock]) => rock.modes.includes('hand')) && candidates.some(([, rock]) => rock.modes.includes('vehicle')));
    assert.match(mining.unknowns.sigShared, /48000/);
    // Non-plant entries in the plant list are labelled; Wuotan's self-reference is a game-file fact, kept and flagged.
    assert.equal(mining.harvestables.Scrap_CompBoard.kind, 'scrap');
    assert.equal(mining.harvestables.Scrap_CompBoard.sig, undefined);
    assert.equal(mining.harvestables.Plant_Prota.kind, 'plant');
    assert.equal(mining.harvestables.Plant_Wuotan.gives[0].id, 'Plant_Wuotan');
    assert.match(mining.unknowns.plants, /Plant_Wuotan/);
});
