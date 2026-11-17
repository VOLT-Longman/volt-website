import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const calc = require('../../js/loadout-calc.js');
const { items } = require('../../data/loadout/items.json');
const ship = (name) => require(`../../data/loadout/ships/${name}.json`);

function slotCandidates(shipData, overrides = {}) {
    const out = new Map();
    calc.walkLoadout(shipData, items, overrides, (node) => {
        if (node.slot.kind !== 's') return;
        out.set(node.path, Object.entries(items).filter(([, item]) => !item.hidden && calc.fitsSlot(item, node.slot, { tags: node.tags })).map(([id]) => id));
    });
    return out;
}

test('전용 부품은 자리 자체의 표지로도 맞춰진다', () => {
    const module = { type: 'MiningModifier', sub: 'Gun', size: 1, req: ['miningConsumable'] };
    const slot = { min: 1, max: 1, acc: [{ type: 'MiningModifier', subs: ['Gun'] }] };
    assert.equal(calc.fitsSlot(module, slot, { tags: ['MISC_Prospector_Base'] }), false);
    assert.equal(calc.fitsSlot(module, { ...slot, tags: ['miningConsumable', 'Consumable1'] }, { tags: ['MISC_Prospector_Base'] }), true);
});

test('스토커의 미사일 랙 후보에 개발용 임시 폭탄 랙이 없다', () => {
    const candidates = slotCandidates(ship('aegs_avenger_stalker'));
    const rack = candidates.get('hardpoint_weapon_missilerack_right_wing');
    assert.ok(rack.length > 0);
    for (const id of rack) assert.doesNotMatch(items[id].cls, /(^|_)TEMP(_|$)/, items[id].cls);
    // 일반 랙 교체는 그대로 된다.
    assert.ok(rack.some((id) => items[id].cls === 'MRCK_S03_BEHR_Dual_S02'));
    assert.ok(rack.some((id) => items[id].type === 'MissileLauncher' && items[id].cls !== 'MRCK_S03_BEHR_Dual_S02'));
});

test('프로스펙터: 기본 채광 레이저와 바꾼 레이저 모두 모듈 자리에 후보가 있다', () => {
    const prospector = ship('misc_prospector');
    const laserPath = 'hardpoint_mining_arm/hardpoint_mining_laser/hardpoint_mining_laser';
    const stock = slotCandidates(prospector);
    const stockModules = [...stock].filter(([path]) => path.startsWith(`${laserPath}/`));
    assert.equal(stockModules.length, 1, '기본 Arbor MH1은 모듈 자리 1곳');
    assert.ok(stockModules[0][1].length >= 20);

    const helix = Object.entries(items).find(([, item]) => item.cls === 'Mining_Laser_THCN_Helix_S1')[0];
    const swapped = slotCandidates(prospector, { [laserPath]: helix });
    const helixModules = [...swapped].filter(([path]) => path.startsWith(`${laserPath}/`));
    assert.equal(helixModules.length, 2, 'Helix I은 모듈 자리 2곳');
    for (const [, ids] of helixModules) {
        assert.ok(ids.length >= 20);
        assert.ok(ids.every((id) => items[id].type === 'MiningModifier'));
    }
});
