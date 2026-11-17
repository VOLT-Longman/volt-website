import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { buildNamedPrices, buildPriceTable } from '../../functions/api/uex/loadout-prices.js';
const require = createRequire(import.meta.url);
const { plan, shopKey, families } = require('../../js/loadout-planner.js');
const shop = (name, price, place = 'Area 18') => ({ shop: name, price, place, system: 'Stanton' });
const row = (id, qty, shops) => ({ id, qty, info: { shops } });
const basket = [row('a', 2, [shop('A', 10), shop('Hub', 12)]), row('b', 1, [shop('B', 5), shop('Hub', 8)]), row('c', 1, [shop('Hub', 3)])];
test('최저가와 다품종 상점 묶기를 구분하고 수량을 합계에 반영한다', () => {
    const cheap = plan(basket); const grouped = plan(basket, { mode: 'grouped' });
    assert.equal(cheap.total, 28); assert.equal(cheap.groups.length, 3);
    assert.equal(grouped.total, 35); assert.equal(grouped.groups.length, 1);
    assert.equal(grouped.groups[0].rows.length, 3); assert.equal(grouped.cheapest, 28);
});
test('수량보다 종류 수를 우선하고 동률이면 합계가 싼 상점을 고른다', () => {
    const result = plan([row('x', 99, [shop('X', 1)]), row('y', 1, [shop('Y', 3), shop('Z', 4)]), row('z', 1, [shop('Y', 3), shop('Z', 4)])], { mode: 'grouped' });
    assert.equal(result.groups[1].shop.shop, 'Y');
    assert.equal(result.assigned.get('y').shop, 'Y');
});
test('직접 지정한 상점을 유지하고 같은 이름의 다른 지점을 합치지 않는다', () => {
    const fixed = shop('Hub', 12);
    const result = plan(basket, { mode: 'grouped', shops: { a: shopKey(fixed) } });
    assert.equal(result.groups.length, 1);
    const branches = plan([row('a', 1, [shop('Shop', 1, 'A')]), row('b', 1, [shop('Shop', 1, 'B')])]);
    assert.equal(branches.groups.length, 2);
});
test('판매처가 사라진 수동 지정은 조용히 다른 곳으로 바꾸지 않고 미확인으로 남긴다', () => {
    const result = plan([...basket, row('unknown', 1, [])], { shops: { a: shopKey(shop('Gone', 9)) } });
    assert.equal(result.unknown.length, 2); assert.ok(result.missing.has('a')); assert.equal(result.total, 8);
});
test('사용자가 정한 방문 순서를 보존한다', () => {
    const keys = plan(basket).groups.map((g) => g.key).reverse();
    assert.deepEqual(plan(basket, { order: keys }).groups.map((g) => g.key), keys);
});
test('UEX UUID 없는 레이더의 이름·크기·뉴배버지 판매처를 보존한다', () => {
    const named = buildNamedPrices([{ id: 1, name: 'Ecouter', uuid: '', size: '1' }], [{ id_item: 1, id_terminal: 130, price_buy: 10, terminal_name: 'Omega Pro', city_name: 'New Babbage', star_system_name: 'Stanton' }]);
    assert.equal(named[0].name, 'Ecouter'); assert.equal(named[0].size, 1); assert.equal(named[0].shops[0].place, 'New Babbage'); assert.equal(named[0].shops[0].terminalId, 130);
});
test('가격표는 12개 이후 판매처를 자르지 않고 같은 지점의 중복 가격은 최저가 하나로 합친다', () => {
    const prices = Array.from({ length: 15 }, (_, i) => ({ id_item: 1, id_terminal: i + 1, terminal_name: `shop${i}`, price_buy: i + 1 }));
    const table = buildPriceTable([{ id: 1, uuid: 'uuid' }], [...prices, { ...prices[0], price_buy: 90 }]);
    assert.equal(table.uuid.length, 15); assert.equal(table.uuid[0].price, 1);
});
test('도색 변종만 원형 아래에 묶고 크기가 다른 무기와 내부 변형은 합치지 않는다', () => {
    const items = JSON.parse(readFileSync(new URL('../../data/loadout/items.json', import.meta.url))).items;
    const map = families(items);
    assert.equal(map.get('e4870a3c-b2f8-462b-8be2-dd04520551cf'), 'bd13235d-1261-4b71-b32f-aed1a8beb526');
    assert.ok(!map.has('35d956a4-8297-4327-bb05-415af9f6531a'));
    for (const [child, parent] of map) assert.equal(items[child].size, items[parent].size);
});
test('함선 선택 자료는 출시 확인 목록과 미확인 목록이 겹치지 않는다', () => {
    const data = JSON.parse(readFileSync(new URL('../../data/loadout/availability.json', import.meta.url)));
    assert.ok(data.released.includes('anvl_asgard')); assert.ok(!data.released.includes('aegs_javelin'));
    assert.ok(data.excluded.every((s) => !data.released.includes(s.cls)));
    assert.equal(new Set(data.released).size, data.released.length);
});
