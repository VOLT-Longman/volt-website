import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { buildPriceTable, onRequestGet } from '../../functions/api/uex/loadout-prices.js';

const require = createRequire(import.meta.url);
const calc = require('../../js/loadout-calc.js');
const read = (path) => JSON.parse(readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8'));
const items = read('data/loadout/items.json').items;
const meta = read('data/loadout/meta.json');
const asgard = read('data/loadout/ships/anvl_asgard.json');

test('레이더 전종 교체: 내부 배터리를 편집 슬롯으로 만들지 않고 옛 빈 배터리 설정도 버린다', () => {
    const radars = Object.entries(items).filter(([, item]) => item.type === 'Radar');
    assert.ok(radars.length >= 68);
    for (const [id, radar] of radars) {
        const ship = { slots: [{ port: 'radar', kind: 's', min: radar.size, max: radar.size, acc: [{ type: 'Radar' }], item: '' }] };
        const nodes = [];
        calc.walkLoadout(ship, items, { radar: id }, node => nodes.push(node));
        assert.deepEqual(nodes.map(node => node.path), ['radar'], radar.name);
        assert.deepEqual(calc.sanitizeOverrides(ship, items, { radar: id, 'radar/BatteryPort': '' }), { radar: id });
    }
});

const findSlot = (ship, predicate) => {
    let found = null;
    calc.walkLoadout(ship, items, {}, (node) => { if (!found && predicate(node)) found = node; });
    return found;
};

test('로드아웃 자료: 출처·버전이 기록되고 함선 목록·파일·부품 참조가 서로 맞는다', () => {
    assert.equal(meta.source, 'game-files');
    assert.equal(meta.sourceName, 'Star Citizen 게임 파일');
    assert.equal(meta.priceSource, 'UEX');
    assert.match(meta.version, /^\d+\.\d+\.\d+-LIVE\.\d+$/);
    const index = read('data/loadout/index.json');
    assert.equal(index.version, meta.version);
    assert.equal(read('data/loadout/items.json').version, meta.version);
    const files = readdirSync(new URL('../../data/loadout/ships/', import.meta.url)).map((file) => file.replace(/\.json$/, '')).sort();
    assert.deepEqual(index.ships.map((ship) => ship.cls).sort(), files);
    assert.equal(meta.counts.ships, files.length);
    assert.equal(meta.counts.items, Object.keys(items).length);
    assert.ok(files.length >= 200 && Object.keys(items).length >= 1000);
    // 모든 슬롯의 기본 부품은 부품 사전이나 그 함선의 전용 목록에서 찾을 수 있어야 한다.
    for (const cls of files) {
        const ship = read(`data/loadout/ships/${cls}.json`);
        calc.walkLoadout(ship, items, {}, ({ slot, item, path }) => {
            if (slot.item) assert.ok(item, `${cls} ${path}: 부품 ${slot.item} 누락`);
        });
    }
});

test('계산식: 게임 파일 수치로 계산한 기본 장착 화력 (게임 4.10 기준 기대값)', () => {
    // 판터 리피터: 에너지 43.65 × 분당 750발 ÷ 60 = 545.6
    const panther = Object.values(items).find((item) => item.cls === 'KLWE_LaserRepeater_S3');
    assert.equal(panther.name, 'CF-337 Panther Repeater');
    assert.ok(Math.abs(calc.weaponStats(panther).dps - 545.6) < 0.5);
    const totals = calc.summarize(asgard, items, {});
    // 아스가르드: 파일럿 무장 판터 6정, 하부 유인 터렛 라이노 2정, 문 기총 2정
    assert.equal(Math.round(totals.dps.pilot), 3274);
    assert.equal(totals.shield.hp, 42240);
    assert.equal(totals.missiles.count, 16);
    assert.ok(totals.dps.pilot > 0 && totals.dps.turret > 0);
    assert.ok(Math.abs(totals.dps.pilot + totals.dps.turret - totals.dps.total) < 0.001);
    assert.ok(totals.shield.hp > 0 && totals.power.gen > 0 && totals.missiles.count > 0 && totals.quantum.speed > 0);
});

test('계산식: 무기 종류별 초당 피해', () => {
    assert.deepEqual(calc.weaponStats({ w: { kind: 'single', rpm: 120, dmg: { energy: 50, physical: 10 } } }), { alpha: 60, dps: 120, byType: { physical: 20, energy: 100 } });
    assert.equal(calc.weaponStats({ w: { kind: 'rapid', rpm: 600, pellets: 8, mult: 0.5, dmg: { physical: 10 } } }).dps, 400);
    assert.equal(calc.weaponStats({ w: { kind: 'charged', rpm: 60, charge: 1.5, cooldown: 0.5, dmg: { energy: 300 } } }).dps, 100);
    assert.equal(calc.weaponStats({ w: { kind: 'beam', beamDps: { energy: 700 } } }).dps, 700);
    assert.deepEqual(calc.weaponStats({ name: '무기 아님' }), { alpha: 0, dps: 0, byType: {} });
    assert.equal(calc.weaponRange({ w: { speed: 1200, life: 1.67 } }), 2004);
});

test('장착 규칙: 크기·종류가 맞는 부품만, 전용 부품은 해당 함선에만', () => {
    const slot = { min: 3, max: 3, acc: [{ type: 'WeaponGun', subs: ['Gun'] }] };
    assert.equal(calc.fitsSlot({ type: 'WeaponGun', sub: 'Gun', size: 3 }, slot, {}), true);
    assert.equal(calc.fitsSlot({ type: 'WeaponGun', sub: 'Gun', size: 4 }, slot, {}), false);
    assert.equal(calc.fitsSlot({ type: 'WeaponGun', sub: 'Rocket', size: 3 }, slot, {}), false);
    assert.equal(calc.fitsSlot({ type: 'Shield', size: 3 }, slot, {}), false);
    const bespoke = { type: 'WeaponGun', sub: 'Gun', size: 3, req: ['ANVL_Asgard'] };
    assert.equal(calc.fitsSlot(bespoke, slot, { tags: ['other_ship'] }), false);
    assert.equal(calc.fitsSlot(bespoke, slot, { tags: ['$anvl_asgard'] }), true);
});

test('편집: 무기를 바꾸면 화력이 달라지고, 공유 문자열로 그대로 복원된다', () => {
    const gun = findSlot(asgard, (node) => node.slot.kind === 's' && node.item?.w);
    assert.ok(gun, '바꿀 수 있는 무기 자리가 있어야 한다');
    const before = calc.summarize(asgard, items, {});
    const current = calc.weaponStats(gun.item).dps;
    const [betterId] = Object.entries(items).find(([id, item]) => id !== gun.itemId && calc.fitsSlot(item, gun.slot, { tags: gun.tags }) && calc.weaponStats(item).dps > current);
    const overrides = { [gun.path]: betterId };
    const after = calc.summarize(asgard, items, overrides);
    assert.ok(after.dps.total > before.dps.total);
    assert.equal(after.changed, 1);
    assert.equal(calc.summarize(asgard, items, { [gun.path]: '' }).weapons, before.weapons - 1);
    const restored = calc.decodeOverrides(calc.encodeOverrides(overrides));
    assert.deepEqual(restored, overrides);
    assert.deepEqual(calc.sanitizeOverrides(asgard, items, restored), overrides);
});

test('편집: 맞지 않는 저장값·깨진 공유 문자열은 버린다', () => {
    const gun = findSlot(asgard, (node) => node.slot.kind === 's' && node.item?.w);
    const fixed = findSlot(asgard, (node) => node.slot.kind === 'f' && node.item);
    const shieldId = Object.keys(items).find((id) => items[id].type === 'Shield');
    const dirty = { [gun.path]: shieldId, [fixed.path]: gun.itemId, 'no/such/slot': gun.itemId, [`${gun.path}/ghost`]: 'x' };
    assert.deepEqual(calc.sanitizeOverrides(asgard, items, dirty), {});
    assert.deepEqual(calc.decodeOverrides('%E0%A4%A=1&=x&novalue&a%2Fb=c'), { 'a/b': 'c' });
});

test('편집: 랙을 바꾸면 원래 실려 있던 미사일은 빠지고 새 랙의 빈자리가 열린다', () => {
    let rack = null; let ship = null;
    for (const cls of ['anvl_arrow', 'aegs_gladius', 'anvl_hornet_f7c', 'aegs_avenger_titan']) {
        ship = read(`data/loadout/ships/${cls}.json`);
        rack = findSlot(ship, (node) => node.slot.kind === 's' && node.item?.type === 'MissileLauncher' && (node.slot.ch || []).length);
        if (rack) break;
    }
    assert.ok(rack, '교체 가능한 미사일 랙을 가진 함선이 있어야 한다');
    const before = calc.summarize(ship, items, {});
    const [otherId, other] = Object.entries(items).find(([id, item]) => id !== rack.itemId && item.type === 'MissileLauncher' && (item.ports || []).length && calc.fitsSlot(item, rack.slot, { tags: rack.tags }));
    const overrides = { [rack.path]: otherId };
    const after = calc.summarize(ship, items, overrides);
    assert.ok(after.missiles.count < before.missiles.count);
    const opened = [];
    calc.walkLoadout(ship, items, overrides, (node) => { if (node.path.startsWith(`${rack.path}/`)) opened.push(node); });
    assert.equal(opened.length, other.ports.length);
    assert.ok(opened.every((node) => !node.item));
});

function withUpstream(handler) {
    const originalFetch = globalThis.fetch; const originalCaches = globalThis.caches;
    const calls = []; const store = new Map(); const pending = [];
    globalThis.fetch = async (url) => { calls.push(String(url)); return handler(String(url)); };
    globalThis.caches = { default: { async match(request) { return store.get(request.url)?.clone() ?? null; }, async put(request, response) { store.set(request.url, response); } } };
    const run = (query) => onRequestGet({ request: new Request(`https://www.volt.ceo/api/uex/loadout-prices${query}`), env: { UEX_API_BASE_URL: 'https://uex.test/2.0' }, waitUntil: (promise) => pending.push(promise) });
    return { calls, store, run, async restore() { await Promise.all(pending); globalThis.fetch = originalFetch; globalThis.caches = originalCaches; } };
}
const ok = (data) => new Response(JSON.stringify({ status: 'ok', data }), { status: 200, headers: { 'Content-Type': 'application/json' } });

test('가격표: 고유번호로 묶고, 살 수 있는 곳만 싼 순서로 남긴다', () => {
    const table = buildPriceTable(
        [{ id: 1, uuid: 'AAAA-1' }, { id: 2, uuid: '' }, { id: 3, uuid: 'cccc-3' }],
        [
            { id_item: 1, price_buy: 300, terminal_name: 'B', city_name: 'Area 18', star_system_name: 'Stanton' },
            { id_item: 1, price_buy: 100, terminal_name: 'A', space_station_name: 'Port Tressler', star_system_name: 'Stanton' },
            { id_item: 1, price_buy: 0, terminal_name: 'sell only' },
            { id_item: 2, price_buy: 50, terminal_name: 'no uuid' },
            { id_item: 9, price_buy: 50, terminal_name: 'unknown item' },
        ],
    );
    assert.deepEqual(Object.keys(table), ['aaaa-1']);
    assert.deepEqual(table['aaaa-1'], [
        { shop: 'A', place: 'Port Tressler', system: 'Stanton', price: 100 },
        { shop: 'B', place: 'Area 18', system: 'Stanton', price: 300 },
    ]);
});

test('가격 조회: 허용된 분류만 받고, 같은 분류는 캐시로 한 번만 업스트림을 부른다', async () => {
    const upstream = withUpstream((url) => ok(url.includes('items_prices')
        ? [{ id_item: 7, price_buy: 15461, terminal_name: 'CenterMass', city_name: 'Area 18', star_system_name: 'Stanton' }]
        : [{ id: 7, uuid: '26838ca7-418a-47d2-8429-7339ebbb8993' }]));
    try {
        for (const bad of ['', '?category=abc', '?category=6', '?category=32%20OR%201', '?category=9999']) assert.equal((await upstream.run(bad)).status, 400, bad);
        assert.equal(upstream.calls.length, 0);
        const first = await upstream.run('?category=32');
        assert.equal(first.status, 200);
        const body = await first.json();
        assert.equal(body.meta.source, 'uex');
        assert.equal(body.data['26838ca7-418a-47d2-8429-7339ebbb8993'][0].price, 15461);
        assert.deepEqual(upstream.calls.sort(), ['https://uex.test/2.0/items?id_category=32', 'https://uex.test/2.0/items_prices?id_category=32']);
        await upstream.restore();
        const again = withUpstream(() => { throw new Error('캐시가 있으면 업스트림을 부르지 않는다'); });
        again.store.set('https://www.volt.ceo/__uex-cache/loadout-prices/v2/32', ok({}));
        assert.equal((await again.run('?category=32&x=1')).status, 200);
        assert.equal(again.calls.length, 0);
        await again.restore();
    } finally { await upstream.restore(); }
});

test('가격 조회: 업스트림 오류는 캐시하지 않고 오류로 돌려준다', async () => {
    const upstream = withUpstream((url) => (url.includes('items_prices') ? new Response('down', { status: 500 }) : ok([])));
    try {
        assert.equal((await upstream.run('?category=23')).status, 503);
        assert.equal(upstream.store.size, 0);
    } finally { await upstream.restore(); }
});

test('함선 고유 수치: 비행·선체·장갑·연료가 게임 파일에서 채워지고, 퀀텀 항속·이동 시간을 계산한다', () => {
    assert.deepEqual(asgard.base.flight, { scm: 203, boost: 425, boostBack: 240, max: 1075, pitch: 32.5, yaw: 27.5, roll: 95 });
    assert.equal(asgard.base.hull, 77000);
    assert.equal(asgard.base.armor.physical, 0.7);
    assert.equal(asgard.base.armor.energy, 0.5);
    assert.equal(asgard.base.fuel.qt, 7.7);
    assert.ok(asgard.base.fuel.h2 > 0, '수소 연료 탱크');
    const quantum = calc.summarize(asgard, items, {}).quantum;
    assert.equal(Math.round(quantum.range), 706);
    // 30Gm: 스풀링 6.9초 + 순항 + 가속·감속
    assert.equal(Math.round(calc.quantumTravelTime(quantum, 30)), 160);
    // 아주 짧은 거리는 최고 속도에 닿기 전에 감속한다.
    assert.ok(calc.quantumTravelTime(quantum, 1) < calc.quantumTravelTime(quantum, 2));
    assert.equal(calc.quantumTravelTime(quantum, 0), 0);
    assert.equal(calc.quantumTravelTime(null, 30), 0);
    // 우주선은 모두 비행 수치가 있어야 한다(지상 차량 제외).
    const missing = readdirSync(new URL('../../data/loadout/ships/', import.meta.url)).map((file) => read(`data/loadout/ships/${file}`)).filter((ship) => !ship.ground && !ship.base?.flight).map((ship) => ship.cls);
    assert.deepEqual(missing, []);
});

test('전원 끄기: 꺼 둔 부품과 그 아래 부품은 화력·실드·소비 전력·시그니쳐에서 빠진다', () => {
    const stock = calc.summarize(asgard, items, {});
    const shields = []; const guns = [];
    calc.walkLoadout(asgard, items, {}, (node) => { if (node.item?.sh) shields.push(node.path); if (node.item?.w && node.depth > 0) guns.push(node.path); });
    const oneOff = calc.summarize(asgard, items, {}, { off: { [shields[0]]: true } });
    assert.equal(oneOff.off, 1);
    assert.equal(oneOff.shield.count, stock.shield.count - 1);
    assert.ok(oneOff.shield.hp < stock.shield.hp && oneOff.power.use < stock.power.use && oneOff.signature.em < stock.signature.em);
    assert.equal(oneOff.dps.total, stock.dps.total);
    // 상위 부품(마운트·터렛)을 끄면 그 아래 무기도 함께 빠진다.
    const parent = guns[0].split('/').slice(0, -1).join('/');
    assert.ok(calc.summarize(asgard, items, {}, { off: { [parent]: true } }).dps.total < stock.dps.total);
    // false 값과 빈 옵션은 영향을 주지 않는다.
    assert.deepEqual(calc.summarize(asgard, items, {}, { off: { [shields[0]]: false } }), stock);
});

test('서비스 워커: 로드아웃 자료 전체는 캐시 우선 처리에서 빠진다', () => {
    const source = readFileSync(new URL('../../sw.js', import.meta.url), 'utf8');
    const bypass = source.indexOf("url.pathname.startsWith('/data/loadout/')");
    const cacheFirst = source.indexOf('cache.match(request)');
    assert.ok(bypass > 0, '버전 확인 파일 예외가 있어야 함');
    assert.ok(bypass < cacheFirst, '예외는 캐시 조회보다 먼저 판단해야 함');
});

test('대표 제품 정리: 내부 변형은 숨기고 원본은 남기며, 같은 이름의 함선·제품이 선택 목록에 겹치지 않는다', () => {
    const index = read('data/loadout/index.json');
    // 함선: 같은 이름이 둘 이상 나오지 않고, 옛 클래스명은 새 클래스로 이어진다.
    const shipNames = index.ships.map((ship) => ship.name);
    assert.equal(new Set(shipNames).size, shipNames.length, '함선 이름 중복 없음');
    assert.equal(index.aliases.rsi_constellation_phoenix, 'rsi_constellation_phoenix_gs');
    assert.equal(index.aliases.rsi_constellation_taurus, 'rsi_constellation_taurus_gs');
    for (const target of Object.values(index.aliases)) assert.ok(index.ships.some((ship) => ship.cls === target), `별칭 대상 ${target}`);

    // 부품: 레버넌트·올스탑의 내부 변형은 원본을 남긴 채 숨기고 대표 제품을 가리킨다.
    const byCls = Object.fromEntries(Object.entries(items).map(([id, item]) => [item.cls, { id, ...item }]));
    for (const [variant, primary] of [['APAR_BallisticGatling_S4_LowPoly', 'APAR_BallisticGatling_S4'], ['SHLD_GODI_S01_AllStop_SCItem_ResistGasclouds', 'SHLD_GODI_S01_AllStop_SCItem']]) {
        assert.equal(byCls[variant].hidden, true, variant);
        assert.equal(byCls[variant].alias, byCls[primary].id, variant);
        assert.equal(byCls[primary].hidden, undefined, primary);
    }
    // 숨긴 부품은 어떤 함선의 기본 장착에도 쓰이지 않거나, 대표와 수치가 완전히 같다(기본 수치가 달라지지 않는다).
    const used = new Set();
    for (const file of readdirSync(new URL('../../data/loadout/ships/', import.meta.url))) {
        const walk = (slots) => { for (const slot of slots || []) { if (slot.item) used.add(slot.item); walk(slot.ch); } };
        walk(read(`data/loadout/ships/${file}`).slots);
    }
    const strip = ({ cls: _cls, alias: _alias, hidden: _hidden, variant: _variant, ...rest }) => JSON.stringify(rest);
    for (const [id, item] of Object.entries(items)) {
        if (!item.alias) continue;
        assert.ok(items[item.alias] && !items[item.alias].alias, `${item.cls}의 대표는 실제 대표 제품이어야 함`);
        if (item.hidden && used.has(id)) assert.equal(strip(item), strip(items[item.alias]), `${item.cls}: 쓰이는 부품을 숨기려면 수치가 같아야 함`);
        if (item.variant) assert.ok(used.has(id) && strip(item) !== strip(items[item.alias]), `${item.cls}: 전용 변형은 실제로 쓰이고 수치가 달라야 함`);
    }
    // 낱개 제품 종류에서는 보이는 것 중 이름·크기·제조사가 같은 것이 "전용 변형" 표시 없이 겹치지 않는다.
    const seen = new Map();
    for (const item of Object.values(items)) {
        if (item.hidden || item.variant || item.name === item.cls) continue;
        if (!['WeaponGun', 'Shield', 'PowerPlant', 'Cooler', 'QuantumDrive', 'Radar', 'Missile'].includes(item.type)) continue;
        const key = [item.type, item.size, item.name, item.mfrCode].join('|');
        assert.equal(seen.get(key), undefined, `겹치는 제품: ${key} (${seen.get(key)} / ${item.cls})`);
        seen.set(key, item.cls);
    }
    // 한국어 표기: 모든 함선에 한국어 이름이 있다.
    const ko = read('data/loadout/ko.json');
    assert.deepEqual(index.ships.filter((ship) => !ko.ships[ship.cls]).map((ship) => ship.cls), []);
});

test('지속 DPS: 실탄은 과열, 에너지는 축전 탄창을 넣어 계산하고 순간 DPS를 넘지 않는다', () => {
    const byClass = (cls) => Object.values(items).find((item) => item.cls === cls);
    // 실탄 개틀링: 1발 0.512씩 올라 196발째에 과열(한도 100), 2.61초 뒤 다시 쏜다.
    const gatling = calc.weaponSustain(byClass('GATS_BallisticGatling_S3'));
    assert.equal(gatling.limit, 'heat');
    assert.equal(gatling.shots, 196);
    assert.ok(Math.abs(gatling.dps - 632.1) < 0.5, `개틀링 지속 ${gatling.dps}`);
    // 에너지 리피터: 75발을 6초에 쏘고, 0.74초 뒤부터 초당 15발씩 다시 찬다.
    const repeater = calc.weaponSustain(byClass('KLWE_LaserRepeater_S3'));
    assert.equal(repeater.limit, 'cap');
    assert.ok(Math.abs(repeater.dps - 278.9) < 0.5, `리피터 지속 ${repeater.dps}`);
    // 발사 간격 사이에 다 식는 느린 실탄 캐논은 제한이 없다.
    const cannon = calc.weaponSustain(byClass('BEHR_BallisticCannon_S4'));
    assert.equal(cannon.limit, '');
    assert.equal(cannon.dps, calc.weaponStats(byClass('BEHR_BallisticCannon_S4')).dps);
    for (const item of Object.values(items)) {
        if (!item.w) continue;
        const sustained = calc.weaponSustain(item); const burst = calc.weaponStats(item).dps;
        assert.ok(sustained.dps <= burst + 1e-9 && sustained.dps >= 0, `${item.cls} 지속 ${sustained.dps} > 순간 ${burst}`);
    }
    // 함선 합계: 어벤저 스토커 기본 장착(순간 2,360 · 지속 1,460).
    const stalker = calc.summarize(read('data/loadout/ships/aegs_avenger_stalker.json'), items, {});
    assert.equal(Math.round(stalker.dps.total), 2360);
    assert.equal(Math.round(stalker.sustain.total), 1460);
    assert.ok(Math.abs(stalker.sustain.pilot + stalker.sustain.turret - stalker.sustain.total) < 1e-6);
});

test('부품 수치 보강: 디스토션·로켓은 폭발 피해를 쓰고, 폭탄·EMP·퀀텀 차단기·채광 레이저 수치가 채워진다', () => {
    const byClass = (cls) => Object.values(items).find((item) => item.cls === cls);
    // 피해가 폭발 쪽에만 적힌 무기도 화력이 0이 아니다.
    assert.ok(Math.abs(calc.weaponStats(byClass('ASAD_DistortionRepeater_S3')).dps - 337.8) < 0.5);
    assert.equal(Object.keys(byClass('ASAD_DistortionRepeater_S3').w.dmg).join(), 'distortion');
    assert.equal(calc.weaponStats(byClass('RPOD_S1_FSKI_3x_S3')).alpha, 150);
    for (const item of Object.values(items)) {
        if (item.type === 'WeaponGun' && item.w && !item.hidden) assert.ok(calc.weaponStats(item).dps > 0, `${item.cls} 화력 0`);
        if (item.type === 'Bomb') assert.ok(calc.sumDamage(item.ms?.dmg) > 0 && item.ms.radius > 0, `${item.cls} 폭탄 수치`);
        if (item.type === 'EMP') assert.ok(item.emp?.dmg > 0 && item.emp.radius > 0, `${item.cls} EMP 수치`);
    }
    assert.ok(byClass('QDMP_WETK_S01_Burke').qig.range > 0);
    assert.equal(byClass('Mining_Laser_SHIN_Hofstede_S2').mine.resist, -30);
    // 채광 레이저는 전투 화력에 넣지 않는다(프로스펙터는 S1 리피터 2정만).
    const prospector = calc.summarize(read('data/loadout/ships/misc_prospector.json'), items, {});
    assert.equal(prospector.weapons, 2);
    assert.equal(Math.round(prospector.dps.total), 437);
    // 미사일 랙의 탑재 수, 디코이·노이즈 수량.
    const rack = Object.values(items).find((item) => item.cls === 'MRCK_S03_BEHR_Dual_S02');
    assert.deepEqual(calc.rackLoad(rack), { count: 2, size: 2 });
    const stalker = calc.summarize(read('data/loadout/ships/aegs_avenger_stalker.json'), items, {});
    assert.ok(stalker.counter.decoy > 0 && stalker.counter.noise > 0);
});

test('가격 새로고침: 오래된 캐시는 갱신하고 1분 이내 반복 조회는 공유 캐시를 쓴다', async () => {
    const upstream = withUpstream((url) => ok(url.includes('items?') ? [{ id: 1, uuid: 'test' }] : [{ id_item: 1, price_buy: 10 }]));
    try {
        upstream.store.set('https://www.volt.ceo/__uex-cache/loadout-prices/v2/32', new Response(JSON.stringify({ data: {}, meta: { fetchedAt: new Date(Date.now() - 120000).toISOString() } })));
        const refreshed = await upstream.run('?category=32&refresh=1');
        assert.equal(refreshed.status, 200);
        assert.equal(refreshed.headers.get('cache-control'), 'no-store');
        assert.equal(upstream.calls.length, 2);
        const again = await upstream.run('?category=32&refresh=1');
        assert.equal(again.status, 200); assert.equal(upstream.calls.length, 2);
        assert.equal(again.headers.get('cache-control'), 'no-store');
    } finally { await upstream.restore(); }
});

test('모든 함선 슬롯 경로가 유일하고, 장착 규칙 없는 슬롯은 교체를 거절한다', () => {
    for (const file of readdirSync(new URL('../../data/loadout/ships/', import.meta.url))) {
        const ship = read(`data/loadout/ships/${file}`); const paths = new Set();
        calc.walkLoadout(ship, items, {}, ({ path, slot }) => {
            assert.ok(!paths.has(path), `${file}: duplicate ${path}`); paths.add(path);
            if (slot.kind === 's') assert.ok(slot.acc?.length, `${file}: unrestricted ${path}`);
        });
    }
    const ship = read('data/loadout/ships/rsi_constellation_mk5_centaurus.json');
    const shield = Object.values(items).find(item => item.type === 'Shield' && item.size === 3);
    let checked = 0;
    calc.walkLoadout(ship, items, {}, ({ slot, path }) => {
        if (!/^hardpoint_turret_(upper|lower)\/hardpoint_gun_[^/]+$/.test(path)) return;
        assert.equal(calc.fitsSlot(shield, slot, {}), false); checked++;
    });
    assert.equal(checked, 8);
    const x1 = read('data/loadout/ships/orig_x1_force.json');
    assert.equal(calc.summarize(x1, items, {}).weapons, 1);
});

test('추출 정리: 같은 장착 중복은 합치고 서로 다른 중복은 빌드를 중지한다', () => {
    const slot = { port: 'gun', kind: 's', acc: [{ type: 'WeaponGun' }], item: 'a' };
    assert.deepEqual(calc.normalizeSlots([slot, { ...slot }]), [slot]);
    assert.throws(() => calc.normalizeSlots([slot, { ...slot, item: 'b' }]), /Conflicting loadout port/);
    assert.equal(calc.normalizeSlots([{ port: 'unknown', kind: 's' }])[0].kind, 'f');
    assert.equal(calc.fitsSlot({ type: 'Shield', size: 3 }, { min: 3, max: 3 }, {}), false);
});

test('임시 폭탄 랙은 스토커의 후보·공유 설정에서 제외하고 실제 A2 폭탄은 유지한다', () => {
    const ship = read('data/loadout/ships/aegs_avenger_stalker.json');
    const rack = findSlot(ship, node => node.item?.type === 'MissileLauncher');
    const temporary = '549964bb-a674-41ba-86d5-55a6d3c25931';
    assert.equal(calc.fitsSlot(items[temporary], rack.slot, rack), false);
    assert.deepEqual(calc.sanitizeOverrides(ship, items, { [rack.path]: temporary }), {});
    assert.equal(calc.fitsSlot(items['f8d3a1e1-0d75-45bb-a453-898a7cf83382'], rack.slot, rack), true);
    const a2 = read('data/loadout/ships/crus_starlifter_a2.json');
    const bombs = [];
    calc.walkLoadout(a2, items, {}, node => { if (node.item?.type === 'Bomb') bombs.push(node); });
    assert.ok(bombs.length > 0);
    for (const node of bombs) assert.equal(calc.fitsSlot(node.item, node.slot, node), true);
});

test('프로스펙터 기본 채광 헤드와 교체 헤드에 모듈을 장착하고 복원한다', () => {
    const ship = read('data/loadout/ships/misc_prospector.json');
    const head = findSlot(ship, node => node.item?.type === 'WeaponMining');
    const moduleId = '2ceb0de9-105b-434e-a152-8af1fd1660d0';
    for (const [id, count] of [[head.itemId, 1], ['81e1a10a-c7bd-401f-92e1-284115dcd6e1', 2]]) {
        const overrides = { [head.path]: id };
        const slots = [];
        calc.walkLoadout(ship, items, overrides, node => { if (node.slot.acc?.some(rule => rule.type === 'MiningModifier')) slots.push(node); });
        assert.equal(slots.length, count);
        assert.equal(calc.fitsSlot(items[moduleId], slots[0].slot, slots[0]), true);
        overrides[slots[0].path] = moduleId;
        assert.equal(calc.sanitizeOverrides(ship, items, overrides)[slots[0].path], moduleId);
    }
    assert.equal(calc.fitsSlot(items[moduleId], { min: 1, max: 1, acc: [{ type: 'WeaponGun' }] }, {}), false);
});

test('퀀텀 이동 계산에 잘못된 거리를 넣으면 시간이 나오지 않는다', () => {
    const quantum = { speed: 2e8, accel: 1e7, spool: 4 };
    for (const distance of [-1, 0, NaN, Infinity]) assert.equal(calc.quantumTravelTime(quantum, distance), 0);
    assert.ok(calc.quantumTravelTime(quantum, 30) > 0);
});
