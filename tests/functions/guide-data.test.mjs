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
