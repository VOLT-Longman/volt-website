import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const calc = createRequire(import.meta.url)('../../js/loadout-calc.js');
const read = (path) => JSON.parse(readFileSync(new URL(`../../data/loadout/${path}.json`, import.meta.url), 'utf8'));
const systems = read('comparison');
const items = read('items').items;
for (const [id, values] of Object.entries(systems.items)) Object.assign(items[id], values);
const ship = (cls) => ({ ...read(`ships/${cls}`), systems: systems.ships[cls] });
const prospector = ship('misc_prospector');
const head = 'hardpoint_mining_arm/hardpoint_mining_laser/hardpoint_mining_laser';
const modulePath = `${head}/BONE_ItemPort_Consumable_1`;
const rieger = '44b6d85a-ad86-479b-8cd9-5b3d9ab9eddc';
const surge = '46643b07-bb39-4ac1-83e4-d428f0c01a75';

test('채광: 원본 헤드 출력과 확인된 단일 배수만 적용하며 총기 DPS와 분리한다', () => {
    const stock = calc.miningHeads(prospector, items, {})[0];
    assert.equal(stock.power.value, 2340);
    assert.equal(stock.extraction.value, 1850);
    const overrides = { [modulePath]: rieger };
    const result = calc.miningHeads(prospector, items, overrides)[0];
    assert.ok(Math.abs(result.power.value - 2691) < 1e-8);
    assert.equal(result.extraction.value, 1850);
    assert.deepEqual(calc.summarize(prospector, items, overrides).dps, calc.summarize(prospector, items, {}).dps);
    assert.equal(items[rieger].miningModule.effects.optimalChargeWindowSizeModifier.value, -10);
    assert.equal(items[rieger].miningModule.effects.optimalChargeWindowSizeModifier.kind, 'FloatModifierMultiplicative');
});

test('채광 활성형: 활성 여부와 상위 전원에 따라 출력이 바뀌며 지속 시간·횟수는 원본을 보존한다', () => {
    const overrides = { [modulePath]: surge };
    const operation = { activeModules: { [modulePath]: true } };
    assert.equal(calc.miningHeads(prospector, items, overrides)[0].power.value, 2340);
    assert.equal(calc.miningHeads(prospector, items, overrides, { operation })[0].power.value, 3510);
    assert.equal(calc.miningHeads(prospector, items, overrides, { operation, off: { hardpoint_mining_arm: true } })[0].power.value, 0);
    assert.equal(calc.miningHeads(prospector, items, overrides, { operation, off: { [modulePath]: true } })[0].power.value, 2340);
    assert.equal(items[surge].miningModule.duration, 15);
    assert.equal(items[surge].miningModule.charges, 7);
});

test('채광 중첩·누락은 수치를 지어내지 않으며 다른 헤드에 효과를 전파하지 않는다', () => {
    const id = '8bfc261a-6c67-4bec-b5b5-71407e086ec9';
    const setup = { slots: [
        { port: 'head1', item: id, ch: [{ port: 'm1', item: rieger }, { port: 'm2', item: surge }] },
        { port: 'head2', item: id, ch: [{ port: 'm1', item: rieger }] },
    ] };
    const result = calc.miningHeads(setup, items, {}, { operation: { activeModules: { 'head1/m2': true } } });
    assert.equal(result[0].power.value, null);
    assert.equal(result[0].power.verified, false);
    assert.equal(result[0].extraction.value, 1850);
    assert.ok(Math.abs(result[1].power.value - 2691) < 1e-8);
    const missing = { ...items, [rieger]: { ...items[rieger], miningModule: { ...items[rieger].miningModule, power: null } } };
    assert.equal(calc.miningHeads(prospector, missing, { [modulePath]: rieger })[0].power.value, null);
});

test('전력 계획: 모든 함선의 자동 분배는 공급량과 최소 작동량을 동시에 지킨다', () => {
    for (const cls of Object.keys(systems.ships)) {
        const model = ship(cls);
        const plan = calc.powerPlan(model, items, {});
        assert.ok(plan.allocated <= plan.capacity && plan.remaining >= 0, `${cls}: default`);
        const operation = { power: calc.autoPowerPlan(plan) };
        const allocated = calc.powerPlan(model, items, {}, { operation });
        assert.ok(allocated.remaining >= 0, cls);
        for (const group of allocated.groups) {
            assert.ok(group.allocated === 0 || group.allocated >= group.min, `${cls} ${group.key}`);
            assert.ok(group.allocated <= group.max, cls);
        }
    }
    assert.deepEqual(calc.autoPowerPlan({ generation: 1, groups: [{ key: 'shields', min: 2, max: 4 }] }), { shields: 0 });
});

test('전력 계획은 캐패시터 환산식을 추정하지 않으며 공유 입력을 제한한다', () => {
    const stalker = ship('aegs_avenger_stalker');
    const plan = calc.powerPlan(stalker, items, {});
    assert.equal(plan.groups.find((g) => g.key === 'weapons').max, 4);
    const operation = calc.sanitizeOperation(stalker, items, {}, { power: { weapons: -500, engines: Infinity, bogus: 99 }, activeModules: { fake: true } });
    assert.equal(operation.power.weapons, 0);
    assert.deepEqual(operation.power, calc.sanitizeOperation(stalker, items, {}, { power: { weapons: 0 } }).power);
    assert.equal(operation.power.bogus, undefined);
    assert.deepEqual(operation.activeModules, {});
    assert.deepEqual(calc.summarize(stalker, items, {}, { operation }), calc.summarize(stalker, items, {}));
    assert.deepEqual(calc.sanitizeOperation(prospector, items, { [modulePath]: rieger }, { activeModules: { [modulePath]: true } }).activeModules, {});
});

test('파워플랜트 교체·제거: 기본/저장 배정은 현재 장착 출력에 맞고 기존 0 배정을 보존한다', () => {
    const titan = ship('aegs_avenger_titan');
    let path;
    calc.walkLoadout(titan, items, {}, (node) => { if (node.item?.type === 'PowerPlant') path = node.path; });
    const stock = calc.powerPlan(titan, items, {});
    assert.equal(stock.capacity, 15);
    assert.equal(stock.allocated, 15);
    const requested = Object.fromEntries(stock.groups.map((group) => [group.key, group.max]));
    requested.weapons = 0;
    const original = { power: requested };
    const snapshot = JSON.stringify(original);
    const low = { [path]: '0a713a9d-7e70-4586-87a6-ce08c337a8ea' }; // DeltaMax 13
    const saved = calc.sanitizeOperation(titan, items, low, original);
    const reduced = calc.powerPlan(titan, items, low, { operation: saved });
    assert.equal(reduced.capacity, 13);
    assert.ok(reduced.allocated <= 13);
    assert.equal(saved.power.weapons, 0);
    assert.equal(JSON.stringify(original), snapshot);
    const high = { [path]: 'd89b535f-8187-4840-b5f4-3230c789dfd1' }; // QuadraCell 17
    const increased = calc.powerPlan(titan, items, high, { operation: saved });
    assert.equal(increased.capacity, 17);
    assert.equal(increased.allocated, reduced.allocated);
    assert.deepEqual(increased.groups.map((g) => g.allocated), reduced.groups.map((g) => g.allocated));
    for (const options of [{ overrides: { [path]: '' } }, { off: { [path]: true } }]) {
        const plan = calc.powerPlan(titan, items, options.overrides || {}, { off: options.off, operation: original });
        assert.equal(plan.capacity, 0);
        assert.equal(plan.allocated, 0);
        assert.equal(plan.remaining, 0);
    }
});

test('공급 칸: 복수 파워플랜트만 합산하고 소수 출력과 부족한 최소 배정을 안전하게 처리한다', () => {
    const model = { slots: [{ port: 'p1', item: 'p1' }, { port: 'p2', item: 'p2' }, { port: 'shield', item: 'shield' }] };
    const catalog = {
        p1: { type: 'PowerPlant', power: { gen: 2.5 } },
        p2: { type: 'PowerPlant', power: { gen: 2.25 } },
        shield: { type: 'Shield', power: { gen: 100 }, powerLimits: { min: 4, max: 6 } },
    };
    const plan = calc.powerPlan(model, catalog, {});
    assert.equal(plan.generation, 4.75);
    assert.equal(plan.capacity, 4);
    assert.equal(plan.allocated, 4);
    assert.equal(plan.plants.length, 2);
    const operation = calc.sanitizeOperation(model, catalog, {}, { power: { shields: 6 } }, { off: { p1: true } });
    assert.equal(operation.power.shields, 0);
    assert.equal(calc.powerPlan(model, catalog, {}, { off: { p1: true }, operation }).remaining, 2);
});

test('레이더: 8종 시그니처·조준 보조·전력 요구량은 같은 게임 빌드의 원본 값이다', () => {
    assert.equal(systems.gameVersion, read('meta').gameVersion);
    assert.match(systems.sourceSha256, /^[a-f0-9]{64}$/);
    const radar = items['b0ccd135-4424-417c-95e4-594a88d9b72f'];
    assert.equal(Object.keys(radar.radar.signatures).length, 8);
    assert.equal(radar.radar.signatures.Resource.sensitivity, 1);
    assert.equal(radar.radar.signatures.CrossSection.permitPassiveDetection, false);
    assert.equal(radar.radar.signatures.CrossSection.permitActiveDetection, true);
    assert.equal(radar.radar.aim.distanceMinAssignment, 845);
    assert.equal(radar.radar.aim.distanceMaxAssignment, 1105);
    assert.equal(radar.radar.ping, 2.5);
    assert.equal(radar.powerLimits.min, 2);
});

test('타이탄 실드: 각 2칸 전원을 독립 제어하고 전력·성능·복원을 일치시킨다', () => {
    const titan = ship('aegs_avenger_titan');
    const left = 'hardpoint_shield_generator_left', right = 'hardpoint_shield_generator_right';
    const before = calc.powerPlan(titan, items, {});
    const first = calc.togglePower(titan, items, {}, left);
    const plan = calc.powerPlan(titan, items, {}, first);
    const shields = plan.groups.find(group => group.key === 'shields');
    assert.equal(shields.members.length, 2);
    assert.equal(shields.min, 2); assert.equal(shields.max, 3); assert.equal(shields.allocated, 2);
    assert.equal(plan.remaining, before.remaining + 2);
    assert.equal(calc.summarize(titan, items, {}, first).shield.hp, 2160);
    const both = calc.togglePower(titan, items, {}, right, first);
    assert.equal(calc.summarize(titan, items, {}, both).shield.hp, 0);
    assert.equal(calc.powerPlan(titan, items, {}, both).groups.find(group => group.key === 'shields').members.length, 2);
    const one = calc.togglePower(titan, items, {}, left, both);
    assert.deepEqual(one.off, { [right]: true });
    assert.equal(calc.powerPlan(titan, items, {}, one).groups.find(group => group.key === 'shields').allocated, 2);
    const restored = calc.togglePower(titan, items, {}, right, one);
    assert.deepEqual(restored.off, {});
    assert.equal(calc.summarize(titan, items, {}, restored).shield.hp, 4320);
    assert.deepEqual(calc.powerPlan(titan, items, {}, restored).groups.map(group => group.allocated), before.groups.map(group => group.allocated));
});

test('실드 재시작: 다른 계통의 배정을 빼앗지 않고 부족한 칸을 알린다', () => {
    const titan = ship('aegs_avenger_titan');
    const left = 'hardpoint_shield_generator_left';
    const options = calc.togglePower(titan, items, {}, left);
    options.operation.power.weapons += 2;
    const snapshot = JSON.stringify(options);
    const result = calc.togglePower(titan, items, {}, left, options);
    assert.deepEqual(result, { blocked: true, needed: 2 });
    assert.equal(JSON.stringify(options), snapshot);
    assert.equal(calc.togglePower(titan, items, {}, 'unknown', options), null);
});
