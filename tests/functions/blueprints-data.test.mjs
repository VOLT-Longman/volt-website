import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { categoryKind, contextOf, modifierOf, numberFormat, optionOf, partitionedSeconds, recipeOf, table, tradeNeed, unitText } from '../../scripts/crafting/build-blueprints-data.mjs';

const data = (path) => JSON.parse(readFileSync(new URL(`../../data/${path}`, import.meta.url)));

// Minimal stand-ins for the builder's lookup tables.
function helpers() {
    const materials = table(); const slots = table(); const mods = table(); const stats = table();
    return {
        materials, slots, mods, stats,
        resource: (id) => materials.add(id, () => ({ id })),
        item: (cls) => materials.add(cls, () => ({ id: cls, item: cls })),
        slot: (info) => slots.add(info.debugName, () => ({ debug: info.debugName })),
        modifier: (modifier) => { const value = modifierOf(modifier, (id) => stats.add(id, () => ({ id }))); return mods.add(JSON.stringify(value), () => value); },
    };
}
const resource = (id, scu, minQuality = 0, context = []) => ({ __type: 'CraftingCost_Resource', context, resource: { name: `ResourceType.${id}` }, quantity: { __type: 'SStandardCargoUnit', standardCargoUnits: Math.fround(scu) }, minQuality });
const item = (cls, quantity, minQuality = 0) => ({ __type: 'CraftingCost_Item', context: [], entityClass: { name: `EntityClassDefinition.${cls}` }, quantity, minQuality });
const slot = (name, count, options, context = []) => ({ __type: 'CraftingCost_Select', context, nameInfo: { debugName: name, displayName: '@LOC_PLACEHOLDER' }, count, options });
const costs = (count, slots, time = { days: 0, hours: 0, minutes: 2, seconds: 20 }) => ({ craftTime: time, mandatoryCost: slot('ASPECTS', count, slots), optionalCosts: [] });
const linear = (startQuality, endQuality, modifierAtStart, modifierAtEnd) => ({ __type: 'CraftingGameplayPropertyModifierValueRange_Linear', startQuality, endQuality, modifierAtStart: Math.fround(modifierAtStart), modifierAtEnd: Math.fround(modifierAtEnd) });
const modifiers = (...list) => ({ __type: 'CraftingCostContext_ResultGameplayPropertyModifiers', gameplayPropertyModifiers: { __type: 'CraftingGameplayPropertyModifiers_List', gameplayPropertyModifiers: list } });
const stat = (id, valueRanges) => ({ __type: 'CraftingGameplayPropertyModifierCommon', gameplayPropertyRecord: { name: `CraftingGameplayPropertyDef.${id}` }, valueRanges });

test('alternative materials of one slot stay separate options and are never summed', () => {
    const h = helpers();
    const recipe = recipeOf(costs(1, [slot('FRAME', 1, [resource('Iron', 0.2), resource('Tungsten', 0.3, 500)])]), h);
    assert.equal(recipe.slots.length, 1);
    assert.equal(recipe.slots[0].pick, 1, 'one of the two options is chosen');
    assert.deepEqual(recipe.slots[0].o, [{ mat: 0, scu: 0.2, q: 0 }, { mat: 1, scu: 0.3, q: 500 }]);
    assert.deepEqual(h.materials.list.map((m) => m.id), ['Iron', 'Tungsten']);
});

test('a recipe that needs fewer slots than it lists keeps every slot and says how many to pick', () => {
    const recipe = recipeOf(costs(2, [slot('A', 1, [resource('Taranite', 0.03)]), slot('B', 1, [resource('Aslarite', 0.02)]), slot('C', 1, [resource('Lindinium', 0.03)])]), helpers());
    assert.equal(recipe.pick, 2);
    assert.equal(recipe.slots.length, 3);
    assert.ok(recipe.slots.every((entry) => entry.pick === undefined && entry.o.length === 1));
    assert.equal(recipeOf(costs(3, [slot('A', 1, [resource('Iron', 1)]), slot('B', 1, [resource('Iron', 1)]), slot('C', 1, [resource('Iron', 1)])]), helpers()).pick, undefined);
});

test('SCU amounts and loose pieces keep their own unit, and the same resource in two slots is not merged', () => {
    const h = helpers();
    const recipe = recipeOf(costs(3, [slot('A', 1, [resource('Iron', 0.36)]), slot('B', 1, [item('Harvestable_Mineral_1H_Hadanite', 13, 1)]), slot('C', 1, [resource('Iron', 0.1)])]), h);
    assert.deepEqual(recipe.slots[0].o[0], { mat: 0, scu: 0.36, q: 0 });
    assert.deepEqual(recipe.slots[1].o[0], { mat: 1, pc: 13, q: 1 });
    assert.equal('scu' in recipe.slots[1].o[0], false);
    assert.deepEqual(recipe.slots[2].o[0], { mat: 0, scu: 0.1, q: 0 });
    assert.equal(recipe.s, 140);
    assert.deepEqual(optionOf({ __type: 'CraftingCost_Resource', context: [], resource: { name: 'ResourceType.Gold' }, quantity: { __type: 'SMicroCargoUnit', microSCU: 250000 }, minQuality: 0 }, h), { mat: 2, scu: 0.25, q: 0 });
});

test('missing or unknown source values fail loudly instead of becoming zero', () => {
    const h = helpers();
    assert.throws(() => optionOf({ __type: 'CraftingCost_Resource', context: [], resource: { name: 'ResourceType.Gold' }, quantity: {}, minQuality: 0 }, h), /quantity/);
    assert.throws(() => optionOf({ __type: 'CraftingCost_Item', context: [], entityClass: { name: 'EntityClassDefinition.X' }, minQuality: 0 }, h), /quantity/);
    assert.throws(() => optionOf({ __type: 'CraftingCost_Mystery' }, h), /Unknown cost option/);
    assert.throws(() => recipeOf({ mandatoryCost: resource('Iron', 1), optionalCosts: [] }, h), /expected CraftingCost_Select/);
    assert.throws(() => recipeOf({ ...costs(1, [slot('A', 1, [resource('Iron', 1)])]), optionalCosts: [resource('Iron', 1)] }, h), /optionalCosts/);
    assert.throws(() => contextOf({ context: [{ __type: 'CraftingCostContext_New' }] }, h), /Unknown cost context/);
    assert.equal(partitionedSeconds(undefined), undefined);
    assert.equal(partitionedSeconds({ days: 1, hours: 1, minutes: 1, seconds: 1 }), 90061);
});

test('stat modifiers keep the game ranges; a null range leaves the range out, and the quantity multiplier is not applied', () => {
    const h = helpers();
    const recipe = recipeOf(costs(2, [
        slot('CARAPACE', 1, [resource('Ouratite', 0.04, 0, [{ __type: 'CraftingCostContext_QuantityMultiplier', multiplier: Math.fround(1.15) }])], [modifiers(stat('GPP_Armor_DamageMitigation', [linear(0, 1000, 0.85, 1.15)]))]),
        slot('LINER', 1, [resource('Aslarite', 0.02)], [null, modifiers(stat('GPP_Armor_TemperatureMin', [linear(0, 500, 0.8, 1), linear(501, 1000, 1, 1.2)]), stat('GPP_Armor_DamageMitigation', [null]))]),
    ]), h);
    assert.deepEqual(recipe.slots[0].o[0], { mat: 0, scu: 0.04, q: 0, x: 1.15 });
    assert.deepEqual(h.mods.list[recipe.slots[0].f[0]], { s: 0, r: [[0, 1000, 0.85, 1.15]] });
    assert.deepEqual(h.mods.list[recipe.slots[1].f[0]], { s: 1, r: [[0, 500, 0.8, 1], [501, 1000, 1, 1.2]] });
    assert.deepEqual(h.mods.list[recipe.slots[1].f[1]], { s: 0 }, 'stat is named, range is unknown');
    const additive = modifierOf(stat('GPP_ItemResource_PowerGeneration', [{ __type: 'CraftingGameplayPropertyModifierValueRange_LinearIntegerAdditive', startQuality: 0, endQuality: 399, additiveModifierAtStart: -1, additiveModifierAtEnd: -1 }]), () => 7);
    assert.deepEqual(additive, { s: 7, add: 1, r: [[0, 399, -1, -1]] });
    assert.deepEqual(contextOf({ context: [{ __type: 'CraftingCostContext_ResultCompositionInclusion', option: 'Exclude' }] }, h), { inc: 0 });
});

test('category grouping and unit text helpers', () => {
    assert.deepEqual(['FPSArmours', 'FPSWeapons', 'VehicleComponentS0', 'VehicleWeaponsS6', 'MissionItem', 'Medical'].map(categoryKind), ['armor', 'fpsWeapon', 'shipComponent', 'shipWeapon', 'missionItem', 'other']);
    assert.equal(unitText('%.2f M'), 'M');
    assert.equal(unitText('%+.2f %%'), '%');
    assert.equal(unitText(undefined), undefined);
    assert.deepEqual(numberFormat('%+.2f %%'), { sign: 1, dp: 2 });
    assert.deepEqual(numberFormat('%.2f M'), { dp: 2 });
    assert.deepEqual(numberFormat('Rating'), {});
    assert.deepEqual(numberFormat(undefined), {});
});

test('a trade requirement placeholder is filled by the override with the same variable; an override nothing reads is not added', () => {
    const row = (order) => ({ res: order.resource, scu: order.minSCU });
    const fixed = (resource, minSCU) => ({ __type: 'HaulingOrder_Resource', resource, minSCU });
    const placeholder = (variable, content = []) => ({ __type: 'HaulingOrder_Property', haulingOrdersProperty: { missionVariableName: variable, property: { value: { __type: 'MissionPropertyValue_HaulingOrders', haulingOrderContent: content } } } });
    const template = (...orders) => ({ objectiveTokens: [{ objectiveHandler: { haulingOrders: orders } }] });
    const contract = (variable, ...content) => ({ paramOverrides: { propertyOverrides: [{ missionVariableName: variable, value: { __type: 'MissionPropertyValue_HaulingOrders', haulingOrderContent: content } }, { missionVariableName: 'Other', value: { __type: 'MissionPropertyValue_Locations' } }] } });
    const content = (resource, minSCU) => ({ __type: 'HaulingOrderContent_Resource', resource, minSCU });
    // The Polaris-parts case: a fixed 24 SCU row, no placeholder, and an override with the same 24 SCU. It must count once.
    assert.deepEqual(tradeNeed(template(fixed('Quantanium', 24)), contract('HaulingOverride', content('Quantanium', 24)), row), { need: [{ res: 'Quantanium', scu: 24 }], unused: ['HaulingOverride'] });
    // Placeholder filled by the override, in template order.
    assert.deepEqual(tradeNeed(template(fixed('Iron', 1), placeholder('HaulingOverride'), fixed('Gold', 3)), contract('HaulingOverride', content('Tin', 2)), row), { need: [{ res: 'Iron', scu: 1 }, { res: 'Tin', scu: 2 }, { res: 'Gold', scu: 3 }], unused: [] });
    // No override: the placeholder's own default content is used (empty in the current files).
    assert.deepEqual(tradeNeed(template(placeholder('HaulingOverride', [content('Tin', 5)])), { paramOverrides: { propertyOverrides: [] } }, row), { need: [{ res: 'Tin', scu: 5 }], unused: [] });
    assert.deepEqual(tradeNeed(template(fixed('Iron', 1), placeholder('HaulingOverride')), {}, row), { need: [{ res: 'Iron', scu: 1 }], unused: [] });
    // An override for a different variable than the placeholder reads is not added.
    assert.deepEqual(tradeNeed(template(placeholder('A')), contract('B', content('Tin', 2)), row), { need: [], unused: ['B'] });
    assert.throws(() => tradeNeed(template({ __type: 'HaulingOrder_Property', haulingOrdersProperty: {} }), {}, row), /mission variable/);
});

// ---- generated file -----------------------------------------------------------------
const blueprints = data('crafting/blueprints.json');
const outputClass = (blueprint) => (blueprint.noOutput ? undefined : blueprint.o || blueprint.id.replace(/^BP_CRAFT_/, ''));

test('blueprint data comes from the same game build as the other guides', () => {
    assert.equal(blueprints.gameVersion, data('loadout/meta.json').gameVersion);
    assert.equal(blueprints.sourceHash, data('mining/helper.json').sourceHash);
    assert.equal(blueprints.source, 'game-files');
    assert.equal(blueprints.koSource, 'korean-patch');
});

test('every creation blueprint is present once with a recipe, and table references resolve', () => {
    const list = blueprints.blueprints;
    assert.equal(list.length, 1634);
    assert.equal(new Set(list.map((b) => b.id)).size, list.length);
    const kinds = {};
    for (const blueprint of list) {
        const kind = blueprints.categories[blueprint.c].kind; kinds[kind] = (kinds[kind] || 0) + 1;
        const recipe = blueprints.recipes[blueprint.r];
        assert.ok(recipe && recipe.slots.length > 0, blueprint.id);
        assert.ok(Number.isInteger(recipe.s) && recipe.s > 0, `${blueprint.id} craft time`);
        assert.equal(blueprint.more, undefined, 'no blueprint has a second tier in this build');
        if (blueprint.t !== undefined) assert.ok(blueprints.itemTypes[blueprint.t]);
        if (blueprint.m !== undefined) assert.ok(blueprints.makers[blueprint.m]);
        if (/^(armor|fpsWeapon)$/.test(kind) && !blueprint.noOutput) assert.match(blueprint.u, /^[0-9a-f]{8}-[0-9a-f]{4}-/);
    }
    assert.deepEqual(kinds, { armor: 937, fpsWeapon: 213, shipComponent: 381, shipWeapon: 99, missionItem: 4 });
    for (const recipe of blueprints.recipes) {
        if (recipe.pick !== undefined) assert.ok(recipe.pick < recipe.slots.length);
        for (const entry of recipe.slots) {
            assert.ok(blueprints.slotNames[entry.n]);
            for (const index of entry.f || []) assert.ok(blueprints.stats[blueprints.mods[index].s].name.en);
            for (const option of entry.o) {
                assert.ok(blueprints.materials[option.mat], 'material reference');
                assert.equal(('scu' in option) + ('pc' in option), 1, 'exactly one unit per cost');
                assert.ok((option.scu ?? option.pc) > 0);
                assert.ok(Number.isInteger(option.q) && option.q >= 0 && option.q <= 1000);
                if ('pc' in option) assert.ok(Number.isInteger(option.pc) && blueprints.materials[option.mat].item);
            }
        }
    }
    assert.equal(list.filter((b) => b.name?.en).length, 1630);
    assert.ok(list.filter((b) => b.name?.ko).length >= 1600);
    assert.deepEqual(list.filter((b) => b.noOutput).map((b) => b.id), ['BP_CRAFT_COOL_S04_CNOU_Pioneer']);
});

test('audited sample recipes match the game records', () => {
    const find = (id) => blueprints.blueprints.find((b) => b.id === id);
    const recipeOfId = (id) => blueprints.recipes[find(id).r];
    const material = (option) => blueprints.materials[option.mat].id;
    const statIds = (entry) => entry.f.map((index) => blueprints.stats[blueprints.mods[index].s].id).sort();

    // CraftingBlueprintRecord.BP_CRAFT_cds_undersuit_helmet_01_01_01: 1 min 30 s, SUIT UNDERLAY = Silicon 0.03 SCU, temperature 0.8..1.2.
    const helmet = recipeOfId('BP_CRAFT_cds_undersuit_helmet_01_01_01');
    assert.equal(helmet.s, 90);
    assert.equal(helmet.slots.length, 1);
    assert.equal(blueprints.slotNames[helmet.slots[0].n].name.en, 'Suit Underlay');
    assert.deepEqual([material(helmet.slots[0].o[0]), helmet.slots[0].o[0].scu, helmet.slots[0].o[0].q], ['Silicon', 0.03, 0]);
    assert.deepEqual(statIds(helmet.slots[0]), ['GPP_Armor_TemperatureMax', 'GPP_Armor_TemperatureMin']);
    assert.deepEqual(blueprints.mods[helmet.slots[0].f[0]].r, [[0, 1000, 0.8, 1.2]]);
    assert.equal(find('BP_CRAFT_cds_undersuit_helmet_01_01_01').name.ko, 'A23 비행 헬멧 우드랜드');

    // BP_CRAFT_thp_light_legs_01_01_01: mandatoryCost.count 2 with 3 slots = alternatives. The game value 9 for modifierAtStart is kept as written.
    const legs = recipeOfId('BP_CRAFT_thp_light_legs_01_01_01');
    assert.equal(legs.pick, 2);
    assert.deepEqual(legs.slots.map((entry) => material(entry.o[0])), ['Taranite', 'Aslarite', 'Lindinium']);
    assert.deepEqual(blueprints.mods[legs.slots[0].f[0]].r, [[0, 1000, 9, 1.1]]);
    assert.equal(blueprints.mods[legs.slots[2].f[0]].r, undefined, 'null value range in the game file');
    assert.equal(blueprints.recipes.filter((recipe) => recipe.pick !== undefined).length, 1);

    // BP_CRAFT_AMRS_LaserCannon_S6: SCU and pieces side by side.
    const cannon = recipeOfId('BP_CRAFT_AMRS_LaserCannon_S6');
    assert.equal(cannon.s, 9060);
    assert.deepEqual(cannon.slots.map((entry) => [material(entry.o[0]), entry.o[0].scu, entry.o[0].pc, entry.o[0].q]), [['Agricium', 6.74, undefined, 1], ['Hadanite', undefined, 135, 1], ['Dolivine', undefined, 135, 1]]);

    // CraftingCostContext_QuantityMultiplier 1.15 on Ouratite is kept apart from the amount.
    const arms = recipeOfId('BP_CRAFT_slaver_armor_medium_arms_01_01_01');
    assert.deepEqual([material(arms.slots[0].o[0]), arms.slots[0].o[0].scu, arms.slots[0].o[0].x], ['Ouratite', 0.04, 1.15]);
    assert.equal(find('BP_HRST_LaserScatterGun_S2').o, 'HRST_LaserScatterGun_S2');
});

test('default-owned blueprints and dismantle values are the CraftingGlobalParams / GlobalGenericDismantle values', () => {
    assert.deepEqual(blueprints.blueprints.filter((b) => b.d).map((b) => b.id).sort(), [
        'BP_CRAFT_behr_pistol_ballistic_01', 'BP_CRAFT_behr_pistol_ballistic_01_mag', 'BP_CRAFT_behr_rifle_ballistic_01', 'BP_CRAFT_behr_rifle_ballistic_01_mag',
        'BP_CRAFT_cds_armor_light_arms_01_01_01', 'BP_CRAFT_cds_armor_light_core_01_01_01', 'BP_CRAFT_cds_armor_light_helmet_01_01_01', 'BP_CRAFT_cds_armor_light_legs_01_01_01']);
    assert.equal(blueprints.dismantle.id, 'GlobalGenericDismantle');
    assert.equal(blueprints.dismantle.efficiency, 0.5);
    assert.equal(blueprints.dismantle.s, 15);
    assert.deepEqual(blueprints.dismantle.noReturn.resources, ['Quantanium', 'Stileron', 'Savrilium', 'Lindinium', 'Riccite', 'Ouratite']);
    assert.deepEqual(blueprints.dismantle.noReturn.items, ['Harvestable_Mineral_1H_Janalite', 'Harvestable_Ore_1H_SaldyniumOre']);
    assert.deepEqual(blueprints.materials.filter((m) => m.noReturn).map((m) => m.id).sort(), ['Janalite', 'Lindinium', 'Ore_Saldynium', 'Ouratite', 'Quantanium', 'Riccite', 'Savrilium', 'Stileron']);
    assert.equal(blueprints.globals.defaultQuality, 500);
});

test('materials link to the mining guide by id wherever the material is mined', () => {
    const mining = data('mining/helper.json');
    const minerals = new Map(mining.minerals.map((mineral) => [mineral.id, mineral]));
    assert.equal(blueprints.materials.length, 37);
    for (const material of blueprints.materials) {
        assert.ok(material.name?.en && material.name?.ko, material.id);
        if (!material.mine) continue;
        const mineral = minerals.get(material.mine);
        assert.ok(mineral, `${material.id} -> ${material.mine}`);
        assert.ok(mineral.id === material.id || mineral.refined?.id === material.id, 'material id is the mineral id or its refined id');
    }
    assert.deepEqual(blueprints.materials.filter((m) => !m.mine).map((m) => m.id).sort(), ['Carinite', 'Ore_Saldynium', 'Sadaryx', 'YormandiEye']);
    // Every mineral or refined product of the mining guide that a recipe uses must carry the link.
    const mineable = new Set(mining.minerals.flatMap((mineral) => [mineral.id, mineral.refined?.id]));
    assert.ok(blueprints.materials.every((m) => Boolean(m.mine) === mineable.has(m.id)));
});

test('blueprint pools keep the game weights and only point at real blueprints', () => {
    const ids = Object.keys(blueprints.pools);
    assert.equal(ids.length, 176);
    let entries = 0; let missing = 0;
    for (const id of ids) {
        const pool = blueprints.pools[id];
        for (const [index, weight] of pool.e || []) { entries += 1; assert.ok(blueprints.blueprints[index], id); assert.equal(weight, 1); }
        missing += pool.missing || 0;
    }
    assert.equal(entries, 838);
    assert.equal(missing, 2, 'two pool entries have a null blueprint reference in the game file');
    const generic = blueprints.pools.BP_MISSIONREWARD_RDC_Generic.e.map(([index]) => blueprints.blueprints[index].id);
    assert.ok(generic.includes('BP_CRAFT_gmni_shotgun_ballistic_01') && generic.includes('BP_CRAFT_kap_combat_heavy_core_02_01_01'));
    assert.deepEqual(blueprints.pools.BP_MISSIONREWARD_Mining_Modules_Passive_Overrun.e.map(([index]) => blueprints.blueprints[index].id), ['BP_CRAFT_Mining_Modules_Passive_Overrun']);
    assert.ok(blueprints.eventTiers.every((tier) => tier.minPoints > 0 && tier.pools.every((id) => blueprints.pools[id])));
    assert.ok(blueprints.unknowns.poolDraw, 'pool draw rule stays an explicit unknown');
});

test('the earlier loadout crafting file agrees with the full blueprint data', () => {
    const crafting = data('loadout/crafting.json');
    const byId = new Map(blueprints.blueprints.map((b) => [b.id, b]));
    let compared = 0;
    for (const [cls, old] of Object.entries(crafting.recipes)) {
        const blueprint = byId.get(old.blueprint);
        assert.ok(blueprint, old.blueprint);
        assert.equal(outputClass(blueprint), cls);
        const recipe = blueprints.recipes[blueprint.r];
        assert.equal(recipe.s, old.s);
        assert.equal(recipe.pick, undefined);
        const options = recipe.slots.flatMap((entry) => { assert.equal(entry.o.length, 1); return entry.o; });
        const scu = options.filter((o) => 'scu' in o).map((o) => [blueprints.materials[o.mat].id, o.scu]);
        const pieces = options.filter((o) => 'pc' in o).map((o) => [blueprints.materials[o.mat].id, o.pc]);
        const sorted = (rows) => rows.map(([id, amount]) => `${id}:${Number(amount.toFixed(3))}`).sort();
        assert.deepEqual(sorted(scu), sorted(old.m || []), cls);
        assert.deepEqual(sorted(pieces.map(([id, amount]) => [id === 'Ore_Saldynium' ? 'Harvestable_Ore_1H_SaldyniumOre' : id, amount])), sorted(old.p || []), cls);
        compared += 1;
    }
    assert.equal(compared, 465);
});

test('fabricators and trades carry only values read from the files', () => {
    assert.deepEqual(blueprints.stations.map((station) => station.name.en), ['RediMake Item Fabricator AA Support', 'RediMake Item Fabricator']);
    const used = new Set(blueprints.categories.map((category) => category.id));
    for (const station of blueprints.stations) assert.ok([...used].every((id) => station.make.cats.includes(id)));
    assert.equal(blueprints.trades.length, 69);
    assert.equal(new Set(blueprints.trades.map((trade) => trade.id)).size, 69);
    for (const trade of blueprints.trades) {
        assert.match(trade.id, /^[0-9a-f]{8}-/);
        assert.match(trade.type, /^WIkelo_/);
        assert.ok(trade.need?.length, `${trade.key} lists what to bring`);
        assert.ok(trade.give?.length || trade.roll?.length || trade.bp?.length, `${trade.key} lists what is received`);
        for (const row of trade.need) assert.ok(row.res || blueprints.tradeItems[row.i]);
        for (const [pool] of trade.bp || []) assert.ok(blueprints.pools[pool], pool);
        if (trade.name?.ko) assert.doesNotMatch(trade.name.ko, /평판\]\s*$/);
    }
    // Requirement rows: item rows carry i/min/max, resource rows carry res/minScu/maxScu. Almost half of the item rows have max 0 with min above 0.
    const rows = blueprints.trades.flatMap((trade) => trade.need);
    assert.equal(rows.length, 298);
    assert.equal(rows.filter((row) => 'i' in row).length, 291);
    assert.equal(rows.filter((row) => 'i' in row && row.max === 0 && row.min > 0).length, 134);
    assert.ok(rows.every((row) => ('i' in row) !== ('res' in row)));
    // TheCollector_Favours_PolarisParts: the template's fixed Quantanium 24 SCU row counts once; the override its template never reads is flagged, not added.
    const polaris = blueprints.trades.find((trade) => trade.key === 'TheCollector_Favours_PolarisParts');
    assert.deepEqual(polaris.need, [{ res: 'Quantanium', minScu: 24, maxScu: 24 }]);
    assert.equal(polaris.ovUnused, 1);
    assert.deepEqual(blueprints.trades.filter((trade) => trade.ovUnused).map((trade) => trade.key), ['TheCollector_Favours_PolarisParts']);
    assert.ok(blueprints.unknowns.tradeOverrideUnused);
    // Access conditions: every released trade has a crime stat range; identical sets are stored once.
    assert.equal(new Set(blueprints.tradeAccess.map((entry) => JSON.stringify(entry))).size, blueprints.tradeAccess.length);
    for (const trade of blueprints.trades) { const access = blueprints.tradeAccess[trade.a]; assert.ok(access, trade.key); assert.deepEqual(access.crime, [0, 2]); assert.deepEqual(access.tags, ['IntroDone']); }
    const gated = blueprints.trades.filter((trade) => blueprints.tradeAccess[trade.a].rep);
    assert.deepEqual(gated.map((trade) => [trade.key, blueprints.tradeAccess[trade.a].rep.min.id, blueprints.tradeAccess[trade.a].rep.min.rep]), [
        ['TheCollector_Vehicle_Small_Kruger_Wolf_Unique', 'ReputationStanding_Wikelo_001', 340], ['TheCollector_Vehicle_Super_Idris', 'ReputationStanding_Wikelo_002', 999]]);
    assert.ok(gated.every((trade) => blueprints.tradeAccess[trade.a].rep.scope === 'Wikelo' && blueprints.tradeAccess[trade.a].rep.min.name.ko));
    // Weighted rewards: only the weights that occur in released trades.
    const weights = {};
    for (const trade of blueprints.trades) for (const group of trade.roll || []) weights[group.w] = (weights[group.w] || 0) + 1;
    assert.deepEqual(weights, { 1: 20, 0.15: 1 });
    assert.ok(blueprints.trades.every((trade) => !trade.roll || trade.roll.length === 1));
    const orb = blueprints.trades.find((trade) => trade.key === 'TheCollector_OrbArm');
    assert.equal(orb.id, 'eda899b9-c58b-48df-88d9-6b34368af2f2');
    assert.deepEqual(orb.need.map((row) => [blueprints.tradeItems[row.i].id, row.min, row.max])[0], ['Harvestable_Mineral_1H_CarinitePure', 1, 1]);
    assert.deepEqual(orb.roll[0].items.map((row) => blueprints.tradeItems[row.i].id), ['qrt_combat_heavy_arms_02_02_01', 'qrt_combat_heavy_legs_02_02_01', 'qrt_combat_heavy_core_02_02_01', 'qrt_combat_heavy_helmet_02_02_01']);
});

test('stat units keep the game format: unit text per language, sign and decimals', () => {
    const stat = (id) => blueprints.stats.find((entry) => entry.id === id);
    assert.deepEqual([stat('GPP_Weapon_Tractor_MaxDist').unit, stat('GPP_Weapon_Tractor_MaxDist').sign, stat('GPP_Weapon_Tractor_MaxDist').dp], [{ en: 'M', ko: 'm' }, undefined, 2]);
    assert.deepEqual([stat('GPP_Armor_TemperatureMin').unit, stat('GPP_Armor_TemperatureMin').sign, stat('GPP_Armor_TemperatureMin').dp], [{ en: 'ºC' }, 1, 2]);
    assert.deepEqual([stat('GPP_Weapon_Damage').unit, stat('GPP_Weapon_Damage').sign], [{ en: '%' }, 1]);
    assert.deepEqual([stat('GPP_Weapon_Tractor_MaxVolume').unit, stat('GPP_Weapon_Tractor_MaxVolume').dp], [{ en: 'Rating' }, undefined]);
    assert.equal(stat('GPP_Health_MaxHealth').unit, undefined, 'no unit format in the game file');
    assert.ok(blueprints.unknowns.modifierApply, 'how a modifier value applies stays an explicit unknown');
});

test('pool and station oddities of the game file are kept and documented', () => {
    // Blueprint ids that do not follow BP_CRAFT_<output class>; `o` carries the output class for these.
    assert.deepEqual(blueprints.blueprints.filter((b) => !b.id.startsWith('BP_CRAFT_')).map((b) => b.id).sort(), ['BP_HRST_LaserScatterGun_S2', 'kap_combat_heavy_helmet_01_04_01']);
    assert.equal(blueprints.blueprints.filter((b) => b.o).length, 10);
    // Two pools list a blueprint more than once in the game file; the repeats are kept.
    const repeated = Object.keys(blueprints.pools).filter((id) => { const list = (blueprints.pools[id].e || []).map(([index]) => index); return new Set(list).size !== list.length; });
    assert.deepEqual(repeated.sort(), ['BP_MISSIONREWARD_NorthRockFPSKill_EliminateBoss', 'BP_MISSIONREWARD_VaughnGenerator_EliminateBoss']);
    // Mission modifiers that name a pool.
    assert.equal(blueprints.tempBlueprints.length, 2);
    assert.ok(blueprints.tempBlueprints.every((entry) => blueprints.pools[entry.pool] && entry.in === 'TheBackpocket'));
    // Fabricator category lists are de-duplicated and may name categories that no blueprint uses.
    const known = new Set(blueprints.categories.map((category) => category.id));
    for (const station of blueprints.stations) for (const queue of [station.make, station.dismantle]) assert.equal(new Set(queue.cats).size, queue.cats.length);
    assert.ok(blueprints.stations.some((station) => station.make.cats.some((id) => !known.has(id))));
    assert.ok(blueprints.unknowns.stationCategories);
});
