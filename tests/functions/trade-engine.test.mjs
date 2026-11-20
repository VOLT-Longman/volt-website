import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';
import { buildMarket } from '../../functions/api/uex/market.js';
import { buildTerminals } from '../../functions/api/uex/terminals.js';
import engine from '../../js/trade-engine.js';
import * as travelModel from '../../scripts/trade/travel-model.mjs';

// ── 손으로 검산할 수 있는 작은 세계 ─────────────────────────────────────────
// 드라이브: 속도 1e8 m/s, 가속 1e7 m/s² (두 단계 같음), 스풀 5초.
//   1e7 km(= 1e10 m) 비행 = 1e10/1e8 + 1e8/1e7 = 100 + 10 = 110초, 스풀 포함 115초.
const NOW = 1_800_000_000_000;
const HOUR_AGO = NOW / 1000 - 3600;
const ALL = [1, 2, 4, 8, 16, 24, 32];

const WORLD = {
    gameVersion: 'test-1', builtAt: '2026-11-19T00:00:00Z', source: 'game-files',
    boxes: [
        { scu: 1, cells: [1, 1, 1], load: 2, unload: 2, fee: 30 }, { scu: 2, cells: [1, 2, 1], load: 3, unload: 3, fee: 55 },
        { scu: 4, cells: [2, 2, 1], load: 5, unload: 5, fee: 100 }, { scu: 8, cells: [2, 2, 2], load: 8, unload: 8, fee: 190 },
        { scu: 16, cells: [2, 4, 2], load: 12, unload: 12, fee: 360 }, { scu: 24, cells: [2, 6, 2], load: 15, unload: 15, fee: 495 },
        { scu: 32, cells: [2, 8, 2], load: 18, unload: 18, fee: 680 },
    ],
    loading: { baseLoad: 120, baseUnload: 120, deckPerScu: 0.024, baseFee: 150, manual: null },
    jurisdictions: { Free: { name: { en: 'Free' } }, Strict: { name: { en: 'Strict' } }, Sub: { name: { en: 'Sub' }, parent: 'Strict', inherits: 1 } },
    commodities: [
        { id: 'Gold', name: { en: 'Gold', ko: '금' }, group: 'Metal', boxes: ALL },
        { id: 'Widow', name: { en: 'Widow' }, group: 'Vice', boxes: ALL, illegal: { Strict: 'p' } },
        { id: 'Iron', name: { en: 'Iron', ko: '철' }, group: 'Metal', boxes: ALL },
        { id: 'Tin', name: { en: 'Tin' }, group: 'Metal', boxes: ALL },
        { id: 'Zinc', name: { en: 'Zinc' }, group: 'Metal', boxes: ALL },
    ],
    bodies: [
        { id: 'Star1', kind: 'star', system: 'S1', p: [0, 0, 0] }, { id: 'P1', kind: 'planet', system: 'S1', parent: 'Star1', r: 1000, p: [2e7, 0, 0] },
        { id: 'Star2', kind: 'star', system: 'S2', p: [0, 0, 0] },
    ],
    locations: [
        { id: 'LA', name: { en: 'Alpha Station', ko: '알파 정거장' }, system: 'S1', body: 'Star1', law: 'Free', am: ['fe'], p: [0, 0, 0] },
        { id: 'LB', name: { en: 'Beta Station' }, system: 'S1', body: 'Star1', law: 'Strict', p: [1e7, 0, 0] },
        { id: 'LC', name: { en: 'Camp C' }, system: 'S1', body: 'P1', surface: 1, law: 'Sub', p: [2e7, 0, 0] },
        { id: 'LD', name: { en: 'Camp D' }, system: 'S1', body: 'P1', surface: 1, law: 'Free', p: [2e7, 100, 0] },
        { id: 'G12', name: { en: 'S2 Gateway' }, system: 'S1', body: 'Star1', gate: 'S2', law: 'Free', p: [0, 1e7, 0] },
        { id: 'G21', name: { en: 'S1 Gateway' }, system: 'S2', body: 'Star2', gate: 'S1', law: 'Free', p: [0, 0, 0] },
        { id: 'LE', name: { en: 'Echo Station' }, system: 'S2', body: 'Star2', law: 'Free', p: [1e7, 0, 0] },
    ],
    joins: { terminals: { map: { 1: 'LA', 2: 'LB', 3: 'LC', 4: 'LD', 5: 'LE', 6: 'LB' } } },
};

const CARGO = {
    gameVersion: 'test-1',
    ships: [
        { id: 'big', scu: 64, g: [{ c: [4, 8, 2], max: [2, 8, 2], box: 32 }], qd: 'D', qt: 1 },
        { id: 'decker', scu: 64, g: [{ c: [4, 8, 2], max: [2, 8, 2], box: 32 }], qd: 'D', qt: 0.05, deck: 1 },
        { id: 'min8', scu: 32, g: [{ c: [4, 4, 2], max: [2, 2, 2], min: [2, 2, 2], box: 8, minBox: 8 }], qd: 'D', qt: 1 },
        { id: 'mystery', qd: 'D' },
        { id: 'nohold', scu: 0, qd: 'D' },
        { id: 'small', scu: 16, g: [{ c: [2, 4, 2], max: [2, 4, 2], box: 16 }], qd: 'D', qt: 1 },
        { id: 'towed', scu: 16, g: [{ c: [2, 4, 2], max: [2, 4, 2], box: 16 }], k: 'g' },
    ],
    drives: { D: { name: { en: 'Test Drive' }, speed: 1e8, a1: 1e7, a2: 1e7, spool: 5, cool: 10, fuel: 0.01 } },
};

const TERMINALS = [
    { id: 1, type: 'commodity', name: 'Admin - Alpha', nick: 'Alpha', code: 'ALPHA', live: true, system: 'S1', stationId: 11, station: 'Alpha', flags: ['freightElevator'], maxBox: 32 },
    { id: 2, type: 'commodity', name: 'Admin - Beta', nick: 'Beta', live: true, system: 'S1', stationId: 12, flags: ['autoLoad', 'freightElevator'], maxBox: 32 },
    { id: 3, type: 'commodity', name: 'Camp C', live: true, system: 'S1', outpostId: 13 },
    { id: 4, type: 'commodity', name: 'Camp D', live: true, system: 'S1', outpostId: 14 },
    { id: 5, type: 'commodity', name: 'Echo', live: true, system: 'S2', stationId: 15 },
    { id: 6, type: 'commodity', name: 'Gone', live: false, system: 'S1' },
    { id: 7, type: 'commodity', name: 'Nowhere', live: true, system: 'S1' }, // 게임 위치와 이어지지 않는 터미널
    { id: 90, type: 'refinery', name: 'Refinery', live: true, system: 'S1' },
];
const COMMODITIES = [
    { id: 1, name: 'Gold', code: 'GOLD', is_illegal: 0 }, { id: 2, name: 'Widow', code: 'WIDO', is_illegal: 1 },
    { id: 3, name: 'Iron', code: 'IRON', is_illegal: 0 }, { id: 4, name: 'Tin', code: 'TIN', is_illegal: 0 }, { id: 5, name: 'Zinc', code: 'ZINC', is_illegal: 0 },
];

const buyGold = (extra = {}) => ({ t: 1, c: 1, buy: 100, stock: 1000, sb: 7, box: ALL, at: HOUR_AGO, ...extra });
const sellGold = (extra = {}) => ({ t: 2, c: 1, sell: 150, at: HOUR_AGO, ...extra });
const model = (market, extra = {}) => engine.buildModel({ market, terminals: TERMINALS, cargo: CARGO, world: WORLD, commodities: COMMODITIES, ...extra });
const S = (extra = {}) => ({ ship: 'small', now: NOW, ...extra });
const only = (result) => { assert.equal(result.ok, true, result.problem); assert.equal(result.routes.length, 1); return result.routes[0]; };
const near = (actual, expected, label) => assert.ok(Math.abs(actual - expected) < 1e-6, `${label || 'value'}: ${actual} !== ${expected}`);

test('the quantum travel functions mirror scripts/trade/travel-model.mjs', () => {
    assert.equal(engine.travel.STATUS, travelModel.TRAVEL_MODEL_STATUS);
    const realCargo = JSON.parse(readFileSync(new URL('../../data/trade/cargo.json', import.meta.url), 'utf8'));
    const drives = [...Object.values(realCargo.drives), CARGO.drives.D, { speed: 1e8 }, { speed: 1e8, a1: 5e6 }, null, { speed: 0 }];
    for (const drive of drives) {
        for (const distance of [0, 1, 5e8, 1e9, 3.192e10, 9e10, -1]) {
            assert.deepEqual(engine.travel.quantumTravel(distance, drive), travelModel.quantumTravel(distance, drive));
        }
    }
    for (const args of [[1e10, 1e8, 1e7], [5e8, 1e8, 1e7], [1e10, 1e8, 0], [0, 1e8, 1e7]]) {
        assert.equal(engine.travel.trapezoidSeconds(...args), travelModel.trapezoidSeconds(...args));
    }
    assert.equal(engine.travel.distanceMeters([0, 0, 0], [3, 4, 0]), travelModel.distanceMeters([0, 0, 0], [3, 4, 0]));
    assert.equal(engine.travel.distanceMeters(null, [1, 1, 1]), null);
    // 검산: 1e10 m → 100 + 10 = 110초 (+ 스풀 5초), 연료 0.01 × 10 Gm = 0.1
    const hand = engine.travel.quantumTravel(1e10, CARGO.drives.D);
    assert.equal(hand.seconds, 110); assert.equal(hand.totalSeconds, 115); near(hand.fuelScu, 0.1);
});

test('the market model keeps unknown values unknown and joins game locations', () => {
    const m = model([
        buyGold(), sellGold({ inv: 500, ss: 4 }),
        { t: 2, c: 3, sell: 30, at: HOUR_AGO },              // 수량 보고 없는 판매 줄
        { t: 1, c: 3, buy: 10, at: HOUR_AGO },                // 재고·상자 보고 없는 구매 줄
        { t: 999, c: 1, buy: 1, at: HOUR_AGO },               // 터미널 목록에 없는 줄
        { t: 90, c: 1, buy: 1, at: HOUR_AGO },                // 정제소 터미널은 거래 터미널이 아니다
    ]);
    assert.deepEqual(m.counts, { rows: 4, buyRows: 2, sellRows: 2, unknownTerminal: 2, notLive: 0 });
    const sheet = engine.terminalSheet(m, { now: NOW }, 1);
    assert.deepEqual(sheet.terminal.name, { en: 'Alpha Station', ko: '알파 정거장' });
    assert.deepEqual(sheet.terminal.flags, { freightElevator: true });      // 보고되지 않은 시설은 false 가 아니라 아예 없다
    assert.equal(sheet.terminal.locationId, 'LA'); assert.equal(sheet.terminal.law, 'Free'); assert.equal(sheet.terminal.isStation, true);
    assert.deepEqual(sheet.terminal.amenities, ['fe']);
    const [iron, gold] = sheet.buys;
    assert.equal(iron.c, 3); assert.equal(iron.stock, null); assert.equal(iron.box, null); assert.equal(iron.soldOut, false);
    assert.equal(gold.stock, 1000); assert.equal(gold.stockLevel, 7); assert.equal(gold.ageSeconds, 3600); assert.equal(gold.ageLevel, 'ok');
    assert.deepEqual(gold.name, { en: 'Gold', ko: '금' });
    const beta = engine.terminalSheet(m, { now: NOW }, 2);
    const ironSell = beta.sells.find((row) => row.c === 3);
    assert.equal(ironSell.inv, null); assert.equal(ironSell.level, null); assert.equal(ironSell.takes, null);
    const goldSell = beta.sells.find((row) => row.c === 1);
    assert.equal(goldSell.inv, 500); assert.equal(goldSell.level, 4); assert.equal(goldSell.takes, null); // 단계는 보여 주되 수량은 만들지 않는다
    const unjoined = engine.terminalSheet(m, { now: NOW }, 7).terminal;
    assert.equal(unjoined.locationId, null); assert.equal(unjoined.isStation, null); assert.equal(unjoined.hasPosition, false);
    assert.equal(engine.terminalSheet(m, {}, 12345).ok, false);
    assert.equal(engine.listTerminals(m).length, 6);                        // 정제소 빼고, 지금 게임에 없는 6번 빼고
    assert.equal(engine.listTerminals(m, { includeNotLive: true }).length, 7);
    // 상품 이름표를 주지 않으면 이름은 모름(null)이다.
    const nameless = engine.buildModel({ market: [buyGold()], terminals: TERMINALS, cargo: CARGO, world: WORLD });
    assert.equal(engine.commodityDetail(nameless, { now: NOW }, 1).name, null);
});

test('quantity is the smallest cap: ship, stock, budget, destination — each binding in turn', () => {
    // 함선 16 SCU, 금 100 → 150
    let route = only(engine.rankRoutes(model([buyGold(), sellGold()]), S()));
    let good = route.goods[0];
    assert.deepEqual(good.caps, { ship: 16, stock: 1000, budget: null, destination: null });
    assert.equal(good.quantity, 16); assert.equal(good.limitedBy, 'ship');
    assert.deepEqual(good.boxes, [{ scu: 16, count: 1 }]);
    assert.equal(route.investment, 1600); assert.equal(route.revenue, 2400); assert.equal(route.profit, 800);
    assert.equal(route.roi, 0.5); assert.equal(route.marginPerScu, 50); assert.equal(route.full, true); assert.equal(route.capacity, 16);

    route = only(engine.rankRoutes(model([buyGold({ stock: 10 }), sellGold()]), S()));
    good = route.goods[0];
    assert.equal(good.quantity, 10); assert.equal(good.limitedBy, 'stock');
    assert.deepEqual(good.boxes, [{ scu: 8, count: 1 }, { scu: 2, count: 1 }]);
    assert.equal(route.profit, 500); assert.equal(route.full, false);

    route = only(engine.rankRoutes(model([buyGold(), sellGold()]), S({ budget: 550 })));
    good = route.goods[0];
    assert.equal(good.caps.budget, 5); assert.equal(good.quantity, 5); assert.equal(good.limitedBy, 'budget');
    assert.deepEqual(good.boxes, [{ scu: 4, count: 1 }, { scu: 1, count: 1 }]);
    assert.equal(route.investment, 500); assert.equal(route.profit, 250);

    // 도착지가 받아 주는 양은 자료에 그 값이 있을 때만 쓴다 (지금 프록시에는 없다: 미래의 room 필드).
    route = only(engine.rankRoutes(model([buyGold(), sellGold({ room: 3 })]), S()));
    good = route.goods[0];
    assert.equal(good.quantity, 3); assert.equal(good.limitedBy, 'destination'); assert.equal(good.destination.takes, 3);
    assert.deepEqual(good.boxes, [{ scu: 2, count: 1 }, { scu: 1, count: 1 }]);
    assert.ok(!route.assumptions.includes('demand.unknown'));

    // 돈 0 은 "정하지 않음"과 다르다: 살 수 없다.
    assert.equal(engine.rankRoutes(model([buyGold(), sellGold()]), S({ budget: 0 })).routes.length, 0);
});

test('unknown demand stays unknown: inv / ss never cap the quantity', () => {
    for (const sell of [sellGold(), sellGold({ inv: 2, ss: 1 }), sellGold({ inv: 840, ss: 7 })]) {
        const route = only(engine.rankRoutes(model([buyGold(), sell]), S()));
        const good = route.goods[0];
        assert.equal(good.quantity, 16);
        assert.equal(good.caps.destination, null); assert.equal(good.destination.takes, null);
        assert.equal(good.destination.level, sell.ss ?? null); assert.equal(good.destination.inv, sell.inv ?? null);
        assert.equal(good.destination.full, sell.ss === 7);
        assert.ok(route.assumptions.includes('demand.unknown'));
    }
    // 가득 찼다고 보고된 판매처는 플레이어가 원할 때만 뺀다.
    const full = model([buyGold(), sellGold({ inv: 840, ss: 7 })]);
    const skipped = engine.rankRoutes(full, S(), { avoidFull: true });
    assert.equal(skipped.routes.length, 0); assert.equal(skipped.stats.fullDestination, 1);
});

test('unknown stock is not zero and not a cap; a reported zero is sold out', () => {
    const unknown = only(engine.rankRoutes(model([buyGold({ stock: undefined }), sellGold()]), S()));
    assert.equal(unknown.goods[0].quantity, 16); assert.equal(unknown.goods[0].stockKnown, false); assert.equal(unknown.goods[0].caps.stock, null);
    assert.ok(unknown.assumptions.includes('stock.unknown'));
    const known = only(engine.rankRoutes(model([buyGold(), sellGold()]), S()));
    assert.ok(!known.assumptions.includes('stock.unknown'));
    const soldOut = engine.rankRoutes(model([buyGold({ stock: 0 }), sellGold()]), S());
    assert.equal(soldOut.routes.length, 0); assert.equal(soldOut.stats.soldOut, 1);
});

test('box split honours the grid minimum and maximum, terminal limits and the player\'s sizes', () => {
    // 최소 8 SCU 상자만 받는 칸(8 × 4개): 재고 20 → 8 두 개 = 16, 나머지 4는 상자로 못 맞춘다.
    let route = only(engine.rankRoutes(model([buyGold({ stock: 20 }), sellGold()]), S({ ship: 'min8' })));
    assert.equal(route.goods[0].quantity, 16); assert.equal(route.goods[0].limitedBy, 'boxes');
    assert.deepEqual(route.goods[0].boxes, [{ scu: 8, count: 2 }]);
    assert.deepEqual(engine.shipProfile(model([]), S({ ship: 'min8' })).slots, [{ size: 8, minBox: 8, count: 4 }]);
    // 터미널이 1·2 SCU 상자만 팔면 그 상자로만: 64 SCU = 2 SCU × 32
    route = only(engine.rankRoutes(model([buyGold({ box: [1, 2] }), sellGold()]), S({ ship: 'big' })));
    assert.equal(route.goods[0].quantity, 64); assert.deepEqual(route.goods[0].boxes, [{ scu: 2, count: 32 }]);
    // 8 SCU 이상 상자만 파는데 칸의 최대가 8이 안 되면 못 싣는다 → 여기서는 최소 8 칸이라 8만 쓴다.
    route = only(engine.rankRoutes(model([buyGold({ box: [8, 16, 32] }), sellGold()]), S({ ship: 'min8' })));
    assert.deepEqual(route.goods[0].boxes, [{ scu: 8, count: 4 }]);
    assert.equal(engine.rankRoutes(model([buyGold({ box: [16, 32] }), sellGold()]), S({ ship: 'min8' })).routes.length, 0);
    // 도착 터미널의 최대 상자 8
    const smallDock = TERMINALS.map((row) => (row.id === 2 ? { ...row, maxBox: 8 } : row));
    route = only(engine.rankRoutes(engine.buildModel({ market: [buyGold(), sellGold()], terminals: smallDock, cargo: CARGO, world: WORLD, commodities: COMMODITIES }), S({ ship: 'big' })));
    assert.deepEqual(route.goods[0].boxes, [{ scu: 8, count: 8 }]);
    // 판매 줄에 상자 크기가 적혀 있으면 그것이 터미널 값보다 먼저다.
    route = only(engine.rankRoutes(model([buyGold(), sellGold({ box: [1, 2, 4] })]), S({ ship: 'big' })));
    assert.deepEqual(route.goods[0].boxes, [{ scu: 4, count: 16 }]);
    // 플레이어가 16 SCU 상자만 켰을 때: 4 × 8 × 2 칸에 16 SCU 네 개
    route = only(engine.rankRoutes(model([buyGold(), sellGold()]), S({ ship: 'big', boxes: [16] })));
    assert.deepEqual(route.goods[0].boxes, [{ scu: 16, count: 4 }]);
    assert.deepEqual(engine.shipProfile(model([]), S({ ship: 'big', boxes: [16] })).slots, [{ size: 16, minBox: 1, count: 4 }]);
    // 상자 크기 보고가 없으면 출발 터미널의 최대 상자까지로 가정하고 그렇게 표시한다.
    const dock4 = TERMINALS.map((row) => (row.id === 1 ? { ...row, maxBox: 4 } : row));
    route = only(engine.rankRoutes(engine.buildModel({ market: [buyGold({ box: undefined }), sellGold()], terminals: dock4, cargo: CARGO, world: WORLD, commodities: COMMODITIES }), S()));
    assert.deepEqual(route.goods[0].boxes, [{ scu: 4, count: 4 }]); assert.equal(route.goods[0].boxesAssumed, true);
    assert.ok(route.assumptions.includes('cargo.boxesAssumed'));
    // splitBoxes: 64 SCU 함선에 37 SCU = 32 + 4 + 1
    assert.deepEqual(engine.splitBoxes(model([]), S({ ship: 'big' }), 37), { scu: 37, boxes: [{ scu: 32, count: 1 }, { scu: 4, count: 1 }, { scu: 1, count: 1 }], boxCount: 3, leftover: 0 });
    assert.deepEqual(engine.splitBoxes(model([]), S({ ship: 'big' }), 100).scu, 64);
    assert.deepEqual(engine.splitBoxes(model([]), S({ ship: 'min8' }), 7), { scu: 0, boxes: [], boxCount: 0, leftover: 7 });
});

test('every real ship stacks to exactly its game cargo total when all box sizes are on', () => {
    const cargo = JSON.parse(readFileSync(new URL('../../data/trade/cargo.json', import.meta.url), 'utf8'));
    const world = JSON.parse(readFileSync(new URL('../../data/trade/world.json', import.meta.url), 'utf8'));
    const m = engine.buildModel({ market: [], terminals: [], cargo, world });
    let checked = 0;
    for (const ship of cargo.ships) {
        const profile = engine.shipProfile(m, { ship: ship.id });
        if (ship.scu === undefined) { assert.equal(profile.known, false); assert.equal(profile.capacity, null); continue; }
        assert.equal(profile.capacity, ship.scu, ship.id);
        if (ship.scu > 0) checked += 1;
    }
    assert.ok(checked >= 90);
    const hullC = engine.shipProfile(m, { ship: 'hull-c' });
    assert.equal(hullC.minBox, 32); assert.deepEqual(hullC.slots, [{ size: 32, minBox: 32, count: 144 }]);
    assert.equal(engine.splitBoxes(m, { ship: 'hull-c' }, 100).scu, 96); // 32 SCU 상자만 받는다
});

test('stale rows and rows without a report time are left out; the cut-off is the player\'s', () => {
    const fourDays = NOW / 1000 - 4 * 86400;
    const old = model([buyGold({ at: fourDays }), sellGold()]);
    const byDefault = engine.rankRoutes(old, S());
    assert.equal(byDefault.settings.maxAgeDays, 3);
    assert.equal(byDefault.routes.length, 0); assert.equal(byDefault.stats.tooOld, 1);
    const week = only(engine.rankRoutes(old, S({ maxAgeDays: 7 })));
    assert.equal(week.oldestAt, fourDays); assert.equal(week.goods[0].buyAt, fourDays); assert.equal(week.goods[0].sellAt, HOUR_AGO);
    const noTime = engine.rankRoutes(model([buyGold(), sellGold({ at: undefined })]), S({ maxAgeDays: 365 }));
    assert.equal(noTime.routes.length, 0); assert.equal(noTime.stats.ageUnknown, 1);
    const future = engine.rankRoutes(model([buyGold({ at: NOW / 1000 + 86400 }), sellGold()]), S());
    assert.equal(future.routes.length, 0); assert.equal(future.stats.ageUnknown, 1);
    assert.equal(engine.ageLevel(NOW / 1000 - 3 * 86400, 3, NOW), 'ok');
    assert.equal(engine.ageLevel(NOW / 1000 - 3 * 86400 - 1, 3, NOW), 'old');
    assert.equal(engine.ageLevel(null, 3, NOW), 'unknown');
    // 표에서는 오래된 보고도 나이와 함께 보이지만, 가장 싼 곳·비싼 곳 계산에는 들어가지 않는다.
    const detail = engine.commodityDetail(old, S(), 1);
    assert.equal(detail.buys[0].ageLevel, 'old'); assert.equal(detail.buys[0].ageSeconds, 4 * 86400);
    const summary = engine.commoditySummary(old, S()).rows[0];
    assert.equal(summary.cheapestBuy, null); assert.equal(summary.oldBuy, 1); assert.equal(summary.margin, null); assert.equal(summary.bestSell.price, 150);
    // 지금 게임에 없는 터미널의 줄은 쓰지 않는다.
    const gone = engine.rankRoutes(model([buyGold({ t: 6 }), sellGold()]), S());
    assert.equal(gone.routes.length, 0);
    assert.equal(engine.rankRoutes(model([buyGold({ t: 6 }), sellGold()]), S(), { includeNotLive: true }).routes.length, 1);
});

test('time model: every part is listed, defaults are ours and editable, profit per hour follows', () => {
    assert.deepEqual({ ...engine.TIME_DEFAULTS }, {
        loading: 'auto', takeoffSeconds: 120, landingSeconds: 180, atmosphereSeconds: 180, terminalSeconds: 60,
        manualBaseSeconds: 60, manualBoxSeconds: 30, sameBodySeconds: 600, jumpSeconds: 300,
    });
    const m = model([buyGold(), sellGold()]);
    let route = only(engine.rankRoutes(m, S()));
    // 1번 터미널은 자동 적재 보고가 없다 → 손으로: 60 + 30 × 상자 1개 = 90
    // 2번 터미널은 자동 적재 → 게임 값: 120 + 16 SCU 상자 12초 = 132
    assert.deepEqual(route.time.parts, { buy: 60, load: 90, depart: 120, flight: 115, arrive: 180, sell: 60, unload: 132 });
    assert.equal(route.seconds, 757);
    near(route.profitPerHour, 800 / 757 * 3600);
    assert.equal(route.time.load.mode, 'manual'); assert.equal(route.time.load.why, 'auto-not-reported');
    assert.equal(route.time.unload.mode, 'auto'); assert.equal(route.time.estimate, true);
    assert.equal(route.time.flight.mode, 'quantum'); assert.equal(route.time.flight.distanceM, 1e10);
    near(route.time.flight.fuelScu, 0.1); assert.equal(route.time.flight.fuelEnough, true);
    assert.equal(route.autoLoadFee, 150 + 360);                               // 내릴 때만 자동: 기본 150 + 16 SCU 상자 360. 이익에서 빼지 않는다
    for (const code of ['time.quantum', 'time.manual', 'time.autoLoad', 'price.static', 'cargo.packing', 'fuel.unit']) assert.ok(route.assumptions.includes(code), code);
    for (const code of route.assumptions) assert.ok(engine.ASSUMPTIONS[code]?.ko && engine.ASSUMPTIONS[code]?.en, code);

    // 플레이어가 값을 바꾸면 그대로 반영된다.
    route = only(engine.rankRoutes(m, S({ time: { loading: 'manual', takeoffSeconds: 0, landingSeconds: 10, terminalSeconds: 5, manualBaseSeconds: 0, manualBoxSeconds: 7 } })));
    assert.deepEqual(route.time.parts, { buy: 5, load: 7, depart: 0, flight: 115, arrive: 10, sell: 5, unload: 7 });
    assert.equal(route.autoLoadFee, null);
    assert.equal(engine.timeSettings({ landingSeconds: -5, loading: 'teleport', bogus: 1 }).landingSeconds, 180);
    assert.equal(engine.timeSettings({ loading: 'teleport' }).loading, 'auto');

    // 지표면: 뜨고 내릴 때 대기권 시간을 더한다. 1번(정거장) → 3번(지표면), 2e7 km = 200 + 10 + 5 = 215초
    route = only(engine.rankRoutes(model([buyGold(), sellGold({ t: 3 })]), S()));
    assert.equal(route.time.parts.flight, 215); assert.equal(route.time.parts.depart, 120); assert.equal(route.time.parts.arrive, 180 + 180);
    // 같은 행성 위의 두 곳: 퀀텀 식 대신 우리가 정한 값, 대기권 시간은 따로 더하지 않는다.
    route = only(engine.rankRoutes(model([buyGold({ t: 3 }), sellGold({ t: 4 })]), S()));
    assert.equal(route.time.flight.mode, 'same-body'); assert.equal(route.time.parts.flight, 600); assert.equal(route.time.flight.orbit, false);
    assert.equal(route.time.parts.depart, 120); assert.equal(route.time.parts.arrive, 180);
    assert.ok(route.assumptions.includes('time.sameBody'));
    // 다른 항성계: 게이트웨이까지 115 + 점프 300 + 게이트웨이에서 115
    route = only(engine.rankRoutes(model([buyGold(), sellGold({ t: 5 })]), S()));
    assert.equal(route.time.flight.mode, 'jump'); assert.equal(route.time.parts.flight, 530);
    assert.deepEqual(route.time.flight.gateways, ['G12', 'G21']); assert.ok(route.assumptions.includes('time.jump'));
    assert.equal(engine.travelBetween(model([]), S({ time: { jumpSeconds: 0 } }), 1, 5).seconds, 230);
    // 같은 곳의 두 터미널(2번과 6번은 같은 위치): 비행 0, 이착륙 없음
    const samePlace = engine.evaluateRoute(model([buyGold({ t: 6 }), sellGold()]), S(), { from: 6, to: 2 }, { includeNotLive: true }).route;
    assert.equal(samePlace.time.flight.mode, 'same-place'); assert.equal(samePlace.time.parts.flight + samePlace.time.parts.depart + samePlace.time.parts.arrive, 0);
    // 화물 갑판 함선: 상자별 값 대신 SCU당 값 (120 + 0.024 × 64). 연료통 0.05 < 0.1 → 모자람
    route = only(engine.rankRoutes(m, S({ ship: 'decker' })));
    near(route.time.parts.unload, 120 + 0.024 * 64); assert.equal(route.time.flight.fuelEnough, false);
});

test('a route whose time cannot be estimated is still listed, with profit per hour unknown', () => {
    // 위치를 모르는 터미널(7번)
    let route = only(engine.rankRoutes(model([buyGold(), sellGold({ t: 7 })]), S()));
    assert.equal(route.time.known, false); assert.equal(route.time.reason, 'no-position');
    assert.equal(route.seconds, null); assert.equal(route.profitPerHour, null); assert.equal(route.profit, 800);
    // 퀀텀 드라이브가 없는 지상 차량
    route = only(engine.rankRoutes(model([buyGold(), sellGold()]), S({ ship: 'towed' })));
    assert.equal(route.time.reason, 'no-drive'); assert.equal(route.profitPerHour, null);
    // 시간을 아는 경로가 먼저 온다.
    const mixed = engine.rankRoutes(model([buyGold(), sellGold({ t: 7, sell: 999 }), sellGold()]), S());
    assert.deepEqual(mixed.routes.map((row) => row.to), [2, 7]); assert.equal(mixed.stats.timeUnknown, 1);
});

test('ship problems are reported, never guessed', () => {
    const m = model([buyGold(), sellGold()]);
    assert.equal(engine.rankRoutes(m, { now: NOW }).problem, 'no-ship');
    assert.equal(engine.rankRoutes(m, S({ ship: 'ghost' })).problem, 'unknown-ship');
    assert.equal(engine.rankRoutes(m, S({ ship: 'mystery' })).problem, 'cargo-unknown');   // 게임 자료에 화물칸 값이 없다 — 0 이 아니다
    assert.equal(engine.rankRoutes(m, S({ ship: 'nohold' })).problem, 'no-cargo');
    assert.equal(engine.shipProfile(m, S({ ship: 'mystery' })).capacity, null);
    assert.equal(engine.shipProfile(m, S({ ship: 'nohold' })).capacity, 0);
    // 직접 입력한 화물칸: 모르는 함선도 계산할 수 있고, 그렇게 표시된다.
    const typed = only(engine.rankRoutes(m, S({ ship: 'mystery', capacityScu: 40 })));
    assert.equal(typed.quantity, 40); assert.deepEqual(typed.goods[0].boxes, [{ scu: 32, count: 1 }, { scu: 8, count: 1 }]);
    assert.ok(typed.assumptions.includes('cargo.capacityOverride'));
    assert.deepEqual(engine.listShips(m).find((ship) => ship.id === 'mystery'), { id: 'mystery', scu: null, ground: false, hasDrive: true, deck: false });
});

test('up to N goods per origin share the hold and the budget, best margin first', () => {
    const rows = [buyGold({ stock: 40 }), sellGold(), { t: 1, c: 3, buy: 10, stock: 1000, box: ALL, at: HOUR_AGO }, { t: 2, c: 3, sell: 30, at: HOUR_AGO }];
    const m = model(rows);
    let route = only(engine.rankRoutes(m, S({ ship: 'big' })));
    assert.deepEqual(route.goods.map((good) => [good.c, good.quantity]), [[1, 40]]);          // 기본은 한 가지
    route = only(engine.rankRoutes(m, S({ ship: 'big' }), { maxGoods: 2 }));
    // 금 40 (재고) = 32 + 8, 남은 24 SCU 에 철 24
    assert.deepEqual(route.goods.map((good) => [good.c, good.quantity, good.limitedBy]), [[1, 40, 'stock'], [3, 24, 'ship']]);
    assert.deepEqual(route.goods[0].boxes, [{ scu: 32, count: 1 }, { scu: 8, count: 1 }]);
    assert.deepEqual(route.goods[1].boxes, [{ scu: 24, count: 1 }]);
    assert.deepEqual(route.boxes, [{ scu: 32, count: 1 }, { scu: 24, count: 1 }, { scu: 8, count: 1 }]);
    assert.equal(route.quantity, 64); assert.equal(route.full, true);
    assert.equal(route.investment, 4000 + 240); assert.equal(route.revenue, 6000 + 720); assert.equal(route.profit, 2480);
    // 돈 4,100: 금에 4,000, 남은 100 으로 철 10
    route = only(engine.rankRoutes(m, S({ ship: 'big', budget: 4100 }), { maxGoods: 2 }));
    assert.deepEqual(route.goods.map((good) => [good.c, good.quantity, good.limitedBy]), [[1, 40, 'stock'], [3, 10, 'budget']]);
    assert.equal(route.investment, 4100); assert.equal(route.profit, 2000 + 200);
    // 가득 싣는 경로만
    assert.equal(engine.rankRoutes(m, S({ ship: 'big' }), { fullLoadOnly: true }).routes.length, 0);
    assert.equal(engine.rankRoutes(m, S({ ship: 'big' }), { fullLoadOnly: true, maxGoods: 2 }).routes.length, 1);
});

test('a few SCU of a high-margin good do not hide the good that fills the hold', () => {
    // 금: SCU당 차익 50, 재고 3 → 혼자 150.  철: SCU당 차익 20, 재고 넉넉 → 혼자 64 × 20 = 1,280.  주석: 차익 5, 혼자 320.
    const rows = [
        buyGold({ stock: 3 }), sellGold(),
        { t: 1, c: 3, buy: 10, stock: 1000, box: ALL, at: HOUR_AGO }, { t: 2, c: 3, sell: 30, at: HOUR_AGO },
        { t: 1, c: 4, buy: 10, stock: 1000, box: ALL, at: HOUR_AGO }, { t: 2, c: 4, sell: 15, at: HOUR_AGO },
    ];
    const m = model(rows);
    let route = only(engine.rankRoutes(m, S({ ship: 'big' })));
    assert.deepEqual(route.goods.map((good) => [good.c, good.quantity]), [[3, 64]]); assert.equal(route.profit, 1280);
    assert.deepEqual(engine.evaluateRoute(m, S({ ship: 'big' }), { from: 1, to: 2 }).route.goods.map((good) => good.c), [3]);
    // 두 가지: 차익 순(금 3 + 철 61 = 1,370)이 혼자 이익 순(철 64 = 1,280)보다 나으므로 그대로 둔다.
    route = only(engine.rankRoutes(m, S({ ship: 'big' }), { maxGoods: 2 }));
    assert.deepEqual(route.goods.map((good) => [good.c, good.quantity]), [[1, 3], [3, 61]]); assert.equal(route.profit, 1370);
    // 돈이 모자랄 때도 같은 규칙: 돈 100 → 금 1 (50) 보다 철 10 (200).
    route = only(engine.rankRoutes(m, S({ ship: 'big', budget: 100 })));
    assert.deepEqual(route.goods.map((good) => [good.c, good.quantity, good.limitedBy]), [[3, 10, 'budget']]);
    // 고른 상품만 싣는 요청은 그대로 따른다.
    assert.deepEqual(engine.evaluateRoute(m, S({ ship: 'big' }), { from: 1, to: 2, commodities: [1] }).route.goods.map((good) => [good.c, good.quantity]), [[1, 3]]);
});

test('same price in two places: the newer report is shown', () => {
    const older = NOW / 1000 - 2 * 86400;
    const m = model([
        buyGold({ t: 1, buy: 100, at: older }), buyGold({ t: 4, buy: 100, at: HOUR_AGO }),
        sellGold({ t: 2, sell: 150, at: older }), sellGold({ t: 5, sell: 150, at: HOUR_AGO }),
        { t: 1, c: 3, buy: 10, stock: 5, box: ALL, at: HOUR_AGO }, { t: 4, c: 3, buy: 10, stock: 5, box: ALL, at: HOUR_AGO },
    ]);
    const { rows } = engine.commoditySummary(m, S());
    const gold = rows.find((row) => row.c === 1);
    assert.equal(gold.cheapestBuy.t, 4); assert.equal(gold.bestSell.t, 5);
    assert.equal(rows.find((row) => row.c === 3).cheapestBuy.t, 1);                           // 시각까지 같으면 id 가 작은 쪽
});

test('return trip: loaded when something pays, otherwise an empty flight back', () => {
    const out = [buyGold(), sellGold()];
    const back = [{ t: 2, c: 3, buy: 10, stock: 100, box: ALL, at: HOUR_AGO }, { t: 1, c: 3, sell: 25, at: HOUR_AGO }];
    let result = engine.rankRoutes(model([...out, ...back]), S(), { returnTrip: true, from: 1 });
    let route = only(result);
    assert.equal(route.ret.from, 2); assert.equal(route.ret.to, 1);
    assert.deepEqual(route.ret.goods.map((good) => [good.c, good.quantity]), [[3, 16]]);
    assert.equal(route.ret.profit, 16 * 15);
    // 돌아오는 길: 2번에서 자동으로 싣고(132) 1번에서 손으로 내린다(90) → 역시 757초
    assert.equal(route.ret.seconds, 757);
    assert.deepEqual(route.roundTrip, { profit: 800 + 240, seconds: 1514, profitPerHour: 1040 / 1514 * 3600 });
    // 돌아올 때 쓸 돈 = 처음 돈 + 가는 길 이익
    route = only(engine.rankRoutes(model([...out, ...back]), S({ budget: 1600 }), { returnTrip: true, from: 1 }));
    assert.equal(route.ret.goods[0].caps.budget, Math.floor((1600 + 800) / 10));
    // 실을 것이 없으면 빈 배로: 출발 120 + 비행 115 + 착륙 180 = 415초
    route = only(engine.rankRoutes(model(out), S(), { returnTrip: true }));
    assert.equal(route.ret.empty, true); assert.equal(route.ret.seconds, 415); assert.equal(route.ret.profit, 0);
    assert.deepEqual(route.roundTrip, { profit: 800, seconds: 757 + 415, profitPerHour: 800 / 1172 * 3600 });
    // 돌아오는 길까지 넣으면 순위가 바뀔 수 있다.
    result = engine.rankRoutes(model([...out, ...back, { t: 3, c: 1, sell: 151, at: HOUR_AGO }]), S(), { returnTrip: true, from: 1, sort: 'profit' });
    assert.deepEqual(result.routes.map((row) => row.to), [2, 3]);
    assert.deepEqual(engine.rankRoutes(model([...out, ...back, { t: 3, c: 1, sell: 151, at: HOUR_AGO }]), S(), { from: 1, sort: 'profit' }).routes.map((row) => row.to), [3, 2]);
});

const NETWORK = [
    buyGold(), sellGold(),                                                                   // 1 → 2 금, 차익 50
    { t: 2, c: 3, buy: 10, stock: 100, box: ALL, at: HOUR_AGO }, { t: 3, c: 3, sell: 40, at: HOUR_AGO }, // 2 → 3 철, 차익 30
    { t: 3, c: 4, buy: 20, stock: 100, box: ALL, at: HOUR_AGO }, { t: 4, c: 4, sell: 45, at: HOUR_AGO }, // 3 → 4 주석, 차익 25
    { t: 4, c: 5, buy: 5, stock: 100, box: ALL, at: HOUR_AGO }, { t: 1, c: 5, sell: 15, at: HOUR_AGO },  // 4 → 1 아연, 차익 10
    { t: 1, c: 2, buy: 50, stock: 100, box: ALL, at: HOUR_AGO }, { t: 2, c: 2, sell: 500, at: HOUR_AGO }, // 1 → 2 위도우 (2번 관할에서 금지)
    { t: 5, c: 4, sell: 60, at: HOUR_AGO },                                                  // 3 → 5 주석 (다른 항성계)
];

test('filters: good, from, to, system, stations only, legal only, sorting and limit', () => {
    const m = model(NETWORK);
    const pairs = (filters, extra) => engine.rankRoutes(m, S(extra), { sort: 'profit', ...filters }).routes.map((row) => `${row.from}>${row.to}:${row.goods.map((good) => good.c).join('+')}`);
    assert.deepEqual(pairs({}), ['1>2:2', '3>5:4', '2>3:3', '3>4:4', '4>1:5']);
    assert.deepEqual(pairs({ legalOnly: true }), ['1>2:1', '3>5:4', '2>3:3', '3>4:4', '4>1:5']);
    assert.deepEqual(pairs({ commodity: 4 }), ['3>5:4', '3>4:4']);
    assert.deepEqual(pairs({ commodity: [1, 5] }), ['1>2:1', '4>1:5']);
    assert.deepEqual(pairs({ from: 3 }), ['3>5:4', '3>4:4']);
    assert.deepEqual(pairs({ to: [1, 4] }), ['3>4:4', '4>1:5']);
    assert.deepEqual(pairs({ system: 'S1' }), ['1>2:2', '2>3:3', '3>4:4', '4>1:5']);       // 양쪽 다 그 항성계
    assert.deepEqual(pairs({ toSystem: 's2' }), ['3>5:4']);
    assert.deepEqual(pairs({ fromSystem: 'S2' }), []);
    assert.deepEqual(pairs({ sameSystem: true, commodity: 4 }), ['3>4:4']);
    assert.deepEqual(pairs({ stationsOnly: true }), ['1>2:2']);                             // 3번·4번은 지표면
    assert.deepEqual(pairs({ limit: 2 }), ['1>2:2', '3>5:4']);
    assert.equal(engine.rankRoutes(m, S(), { limit: 2 }).total, 5);
    assert.deepEqual(pairs({ sort: 'margin', legalOnly: true }), ['1>2:1', '3>5:4', '2>3:3', '3>4:4', '4>1:5']);
    assert.deepEqual(pairs({ sort: 'roi', legalOnly: true }).slice(0, 2), ['2>3:3', '3>5:4']); // 철 300%, 주석 200%
    assert.deepEqual(pairs({ minProfit: 479 }), ['1>2:2', '3>5:4', '2>3:3']);
    // 합법 여부는 게임 파일의 관할 규칙에서 온다. 상위 관할을 따르는 곳(Sub → Strict)도 금지.
    const widow = engine.evaluateRoute(m, S(), { from: 1, to: 2, commodities: [2] }).route.goods[0];
    assert.equal(widow.legal, false); assert.deepEqual(widow.illegal, { from: null, to: 'p' }); assert.equal(widow.legalSource, 'game');
    assert.deepEqual(engine.legality(m, 2, 1, 3), { legal: false, from: null, to: 'p', source: 'game' });
    assert.deepEqual(engine.legality(m, 2, 1, 4), { legal: true, from: null, to: null, source: 'game' });
    assert.deepEqual(engine.legality(m, 2, 1, 7), { legal: false, from: null, to: null, source: 'uex' }); // 관할을 모르는 곳은 UEX 표시로
    assert.equal(engine.rankRoutes(m, S(), { legalOnly: true }).stats.illegal, 1);
});

test('evaluateRoute, all-ship comparison and next-leg suggestions', () => {
    const m = model(NETWORK);
    const one = engine.evaluateRoute(m, S(), { from: 1, to: 2 }, { legalOnly: true });
    assert.equal(one.route.profit, 800); assert.equal(one.route.seconds, 757);
    const nothing = engine.evaluateRoute(m, S(), { from: 2, to: 1 });
    assert.equal(nothing.ok, true); assert.equal(nothing.route.quantity, 0); assert.equal(nothing.route.profit, 0); assert.equal(nothing.route.seconds, 415);
    assert.equal(engine.evaluateRoute(m, S(), { from: 1, to: 555 }).problem, 'unknown-terminal');

    const compared = engine.compareShips(m, S(), { from: 1, to: 2 }, { legalOnly: true });
    assert.deepEqual(compared.unknownCargo, ['mystery']);
    assert.deepEqual(compared.rows.map((row) => [row.ship, row.quantity, row.profit]), [
        ['decker', 64, 3200], ['big', 64, 3200], ['min8', 32, 1600], ['small', 16, 800], ['towed', 16, 800],
    ]);                                                                                     // 이익이 같으면 더 빨리 내리는 화물 갑판 함선이 먼저
    // big: 손으로 32 SCU 상자 2개 싣기 60 + 60 = 120, 자동으로 내리기 120 + 36 = 156 → 60+120+120+115+180+60+156 = 811
    assert.equal(compared.rows[1].seconds, 811); near(compared.rows[1].profitPerHour, 3200 / 811 * 3600);
    assert.equal(compared.rows[1].route.time.flight.fuelEnough, true); assert.equal(compared.rows[0].route.time.flight.fuelEnough, false); // 연료통은 함선마다 따로
    assert.equal(compared.rows[4].profitPerHour, null);                                    // 드라이브 없는 차량: 시간 모름, 맨 뒤
    assert.deepEqual(engine.compareShips(m, S(), { from: 1, to: 2, ships: ['small', 'nohold', 'ghost'] }).rows.map((row) => row.ship), ['small']);

    const next = engine.nextLegs(m, S(), { from: 3, toward: 1 }, { sort: 'profit' });
    assert.deepEqual(next.routes.map((row) => row.to), [5, 4]);
    // 3번에서 1번까지 215초. 5번에서 돌아가려면 점프(530초) → 더 멀어진다. 4번에서는 215초 그대로.
    assert.deepEqual(next.routes.map((row) => [row.homeSeconds, row.closer, row.arrivesHome]), [[530, false, false], [engine.travelBetween(m, S(), 4, 1).seconds, false, false]]);
    assert.equal(engine.nextLegs(m, S(), { from: 4, toward: 1 }).routes[0].arrivesHome, true);
});

test('chain search: fly-on and round trip, no terminal twice, money carried forward', () => {
    const m = model(NETWORK);
    const loop = engine.findChains(m, S({ budget: 1600 }), { stops: 4, mode: 'roundTrip', start: 1, legalOnly: true, stayInSystem: true, goal: 'profit' });
    assert.equal(loop.ok, true); assert.equal(loop.truncated, false); assert.equal(loop.shortened, false);
    const chain = loop.chains[0];
    assert.deepEqual(chain.stops, [1, 2, 3, 4]);
    assert.deepEqual(chain.legs.map((leg) => leg.profit), [800, 480, 400]);
    assert.equal(chain.closing.from, 4); assert.equal(chain.closing.to, 1); assert.equal(chain.closing.profit, 160);
    assert.equal(chain.profit, 1840);
    assert.equal(chain.seconds, chain.legs.reduce((sum, leg) => sum + leg.seconds, 0) + chain.closing.seconds);
    near(chain.profitPerHour, 1840 / chain.seconds * 3600);
    assert.equal(chain.investment, 1600);                                                   // 한 번에 가장 많이 묶이는 돈
    assert.equal(chain.legs[1].goods[0].caps.budget, Math.floor((1600 + 800) / 10));       // 번 돈이 다음 구간으로 넘어간다
    assert.ok(chain.assumptions.includes('time.quantum'));

    const flyOn = engine.findChains(m, S(), { stops: 3, legalOnly: true, goal: 'profit' });
    assert.equal(flyOn.mode, 'flyOn');
    for (const found of flyOn.chains) {
        assert.equal(found.stops.length, 3); assert.equal(found.closing, null);
        assert.equal(new Set(found.stops).size, 3);
    }
    assert.deepEqual(flyOn.chains[0].stops, [1, 2, 3]);                                     // 800 + 480
    // 한 항성계 안에서만 / 한 구간 최대 시간
    const anywhere = engine.findChains(m, S(), { stops: 2, start: 3, goal: 'profit' });
    assert.deepEqual(anywhere.chains.map((found) => found.stops), [[3, 5], [3, 4]]);
    assert.deepEqual(engine.findChains(m, S(), { stops: 2, start: 3, goal: 'profit', stayInSystem: true }).chains.map((found) => found.stops), [[3, 4]]);
    const jumpLeg = anywhere.chains[0].legs[0].seconds;
    assert.deepEqual(engine.findChains(m, S(), { stops: 2, start: 3, goal: 'profit', maxLegSeconds: jumpLeg - 1 }).chains.map((found) => found.stops), [[3, 4]]);
    // 돌아오는 길에 실을 것이 없으면 빈 배로 닫는다.
    const empty = engine.findChains(m, S(), { stops: 2, mode: 'roundTrip', start: 1, legalOnly: true });
    assert.equal(empty.chains[0].closing.empty, true); assert.equal(empty.chains[0].closing.seconds, 415); assert.equal(empty.chains[0].profit, 800);
    // 원하는 수만큼 못 이으면 찾은 데까지 주고 알린다.
    const short = engine.findChains(m, S(), { stops: 8, start: 1, legalOnly: true, stayInSystem: true });
    assert.equal(short.shortened, true); assert.deepEqual(short.chains[0].stops, [1, 2, 3, 4]);
    assert.equal(engine.findChains(m, S(), { stops: 99 }).stops, 8); assert.equal(engine.findChains(m, S(), { stops: 1 }).stops, 2);
    assert.equal(engine.findChains(m, S(), { start: 4242 }).problem, 'unknown-terminal');
    assert.equal(engine.findChains(m, S({ ship: 'mystery' }), {}).problem, 'cargo-unknown');
});

test('chain search is bounded: it stops at the work budget and says so', () => {
    const m = model(NETWORK);
    const cut = engine.findChains(m, S(), { stops: 4, maxWork: 2 });
    assert.equal(cut.truncated, true); assert.ok(cut.work <= 2); assert.equal(cut.maxWork, 2);
    const free = engine.findChains(m, S(), { stops: 4 });
    assert.equal(free.truncated, false); assert.ok(free.work > 2 && free.work <= free.maxWork);
    assert.equal(free.maxWork, 40000);
    assert.equal(engine.findChains(m, S(), { maxWork: 1e12 }).maxWork, 400000);            // 상한 자체에도 상한이 있다

    // 빽빽한 시장(터미널 60곳이 서로 전부 이어짐)에서도 구간 계산 횟수는 상한을 넘지 않는다.
    const terminals = []; const world = { ...WORLD, locations: [], joins: { terminals: { map: {} } } }; const market = [];
    for (let id = 1; id <= 60; id += 1) {
        terminals.push({ id, type: 'commodity', name: `T${id}`, live: true, system: 'S1' });
        world.locations.push({ id: `L${id}`, name: { en: `T${id}` }, system: 'S1', body: 'Star1', law: 'Free', p: [id * 1e6, (id % 7) * 1e6, 0] });
        world.joins.terminals.map[id] = `L${id}`;
        market.push({ t: id, c: 1, buy: 100 + id, stock: 500, box: ALL, at: HOUR_AGO }, { t: id, c: 3, sell: 400 + id, at: HOUR_AGO });
        market.push({ t: id, c: 3, buy: 100 + id, stock: 500, box: ALL, at: HOUR_AGO }, { t: id, c: 1, sell: 400 + id, at: HOUR_AGO });
    }
    const dense = engine.buildModel({ market, terminals, cargo: CARGO, world, commodities: COMMODITIES });
    const started = performance.now();
    const hard = engine.findChains(dense, S({ ship: 'big' }), { stops: 8, beam: 200, maxWork: 5000 });
    const elapsed = performance.now() - started;
    assert.equal(hard.truncated, true); assert.ok(hard.work <= 5000, `work ${hard.work}`);
    assert.ok(elapsed < 2000, `bounded search took ${elapsed.toFixed(0)} ms`);
    const full = engine.findChains(dense, S({ ship: 'big' }), { stops: 8 });
    assert.ok(full.work <= full.maxWork);
    for (const found of full.chains) assert.equal(new Set(found.stops).size, found.stops.length);
});

test('mixed cargo: fixed goods plus fill, and where to sell what is already on board', () => {
    const m = model([
        buyGold({ stock: 40 }), { t: 1, c: 3, buy: 10, stock: 1000, box: ALL, at: HOUR_AGO }, { t: 1, c: 4, buy: 20, stock: 1000, box: ALL, at: HOUR_AGO },
        sellGold(), { t: 2, c: 3, sell: 30, at: HOUR_AGO }, { t: 2, c: 4, sell: 18, at: HOUR_AGO },
        { t: 3, c: 1, sell: 140, at: HOUR_AGO }, { t: 3, c: 4, sell: 26, at: HOUR_AGO, inv: 9, ss: 7 },
        { t: 4, c: 3, sell: 99, at: NOW / 1000 - 9 * 86400 },                                // 오래된 보고
    ]);
    // 주석 10 SCU 는 꼭 싣고(2번에서는 손해 −2/SCU), 남는 칸은 가장 좋은 상품 한 가지로
    const plan = engine.planMixedLoad(m, S({ ship: 'big' }), { from: 1, fixed: [{ c: 4, scu: 10 }], to: 2 });
    assert.equal(plan.ok, true);
    const option = plan.options[0];
    assert.deepEqual(option.goods.map((good) => [good.c, good.quantity, good.fixed, good.limitedBy]), [[4, 10, true, 'requested'], [1, 40, false, 'stock']]);
    assert.equal(option.goods[0].requested, 10); assert.equal(option.goods[0].profit, -20); assert.equal(option.goods[0].caps.stock, 1000);
    assert.equal(option.profit, -20 + 2000); assert.deepEqual(option.unsold, []);
    // 채우는 상품 가짓수를 늘리면 남는 칸까지: 64 − 10 − 40 = 14 SCU 철
    const two = engine.planMixedLoad(m, S({ ship: 'big' }), { from: 1, fixed: [{ c: 4, scu: 10 }], to: 2 }, { maxGoods: 2 }).options[0];
    assert.deepEqual(two.goods.map((good) => [good.c, good.quantity]), [[4, 10], [1, 40], [3, 14]]);
    assert.equal(two.quantity, 64);
    // 판매처를 정하지 않으면 전체 이익이 가장 큰 곳: 3번은 주석 +6, 금 +40 → 60 + 1,600 = 1,660 < 2번 1,980
    const best = engine.planMixedLoad(m, S({ ship: 'big' }), { from: 1, fixed: [{ c: 4, scu: 10 }] });
    assert.deepEqual(best.options.map((row) => [row.to, row.profit]), [[2, 1980], [3, 1660]]);
    // 채우지 않기 / 그곳에서 안 받는 상품
    const noFill = engine.planMixedLoad(m, S({ ship: 'big' }), { from: 1, fixed: [{ c: 4, scu: 10 }, { c: 3, scu: 5 }], to: 3, fill: false }).options[0];
    assert.deepEqual(noFill.goods.map((good) => [good.c, good.quantity]), [[4, 10]]);
    assert.deepEqual(noFill.unsold, [{ c: 3, why: 'not-bought-there' }]);
    assert.equal(engine.planMixedLoad(m, S(), { from: 77 }).problem, 'unknown-terminal');

    // 이미 실은 화물: 금 20, 주석 10 (주석은 15에 샀다)
    const sale = engine.whereToSell(m, S({ ship: 'big' }), { cargo: [{ c: 1, scu: 20 }, { c: 4, scu: 10, paid: 15 }], at: 1 });
    assert.deepEqual(sale.single.map((row) => [row.t, row.revenue, row.unsold]), [[2, 20 * 150 + 10 * 18, []], [3, 20 * 140 + 10 * 26, []]]);
    assert.equal(sale.single[0].profit, null);                                             // 금을 얼마에 샀는지 모르면 이익을 만들지 않는다
    assert.equal(sale.single[0].goods[1].profit, 10 * (18 - 15));
    assert.equal(sale.single[0].seconds, 415 + 60);                                         // 출발 + 비행 + 착륙 + 터미널
    near(sale.single[0].revenuePerHour, 3180 / 475 * 3600);
    assert.deepEqual(sale.perGood.map((row) => [row.c, row.places.map((place) => [place.t, place.sellPrice])]), [[1, [[2, 150], [3, 140]]], [4, [[3, 26], [2, 18]]]]);
    const tin = sale.perGood[1].places[0];
    assert.equal(tin.destination.full, true); assert.equal(tin.destination.takes, null);   // 가득 찼다는 보고는 알리되 수량은 줄이지 않는다
    assert.ok(sale.assumptions.includes('demand.unknown'));
    assert.equal(sale.stats.tooOld, 0);
    const iron = engine.whereToSell(m, S(), { cargo: [{ c: 3, scu: 5 }] });
    assert.deepEqual(iron.single.map((row) => row.t), [2]); assert.equal(iron.stats.tooOld, 1); assert.equal(iron.single[0].seconds, null);
    assert.deepEqual(engine.whereToSell(m, S(), { cargo: [{ c: 4, scu: 1 }] }, { avoidFull: true }).single.map((row) => row.t), [2]);
});

test('commodity tables: cheapest buy, best sell and margin', () => {
    const m = model([
        buyGold(), buyGold({ t: 3, buy: 90, stock: 0 }), buyGold({ t: 4, buy: 95, stock: 12 }),
        sellGold(), sellGold({ t: 5, sell: 170 }), sellGold({ t: 3, sell: 999, at: NOW / 1000 - 30 * 86400 }),
        { t: 1, c: 2, buy: 50, at: HOUR_AGO }, { t: 2, c: 3, sell: 30, at: HOUR_AGO },
    ]);
    const { rows } = engine.commoditySummary(m, S());
    const gold = rows.find((row) => row.c === 1);
    assert.equal(gold.cheapestBuy.t, 4); assert.equal(gold.cheapestBuy.price, 95);          // 90 은 품절 보고
    assert.equal(gold.bestSell.t, 5); assert.equal(gold.bestSell.price, 170);               // 999 는 30일 전 보고
    assert.equal(gold.margin, 75); near(gold.marginPercent, 75 / 95 * 100);
    assert.deepEqual([gold.buyPlaces, gold.sellPlaces, gold.oldBuy, gold.oldSell], [2, 2, 0, 1]);
    assert.equal(gold.legalEverywhere, true);
    const widow = rows.find((row) => row.c === 2);
    assert.equal(widow.bestSell, null); assert.equal(widow.margin, null); assert.equal(widow.legalEverywhere, false);
    assert.deepEqual(rows.map((row) => row.c), [1, 2, 3]);                                   // 차익을 모르는 것은 뒤로
    assert.equal(engine.commoditySummary(m, S(), { system: 'S1' }).rows.find((row) => row.c === 1).bestSell.t, 2);
    assert.equal(engine.commoditySummary(m, S({ maxAgeDays: 60 })).rows.find((row) => row.c === 1).bestSell.price, 999);
    const detail = engine.commodityDetail(m, S(), 1);
    assert.deepEqual(detail.buys.map((row) => [row.t, row.price, row.soldOut]), [[3, 90, true], [4, 95, false], [1, 100, false]]);
    assert.deepEqual(detail.sells.map((row) => [row.t, row.ageLevel]), [[5, 'ok'], [2, 'ok'], [3, 'old']]);
    assert.deepEqual(detail.name, { en: 'Gold', ko: '금' }); assert.deepEqual(detail.illegal, {});
    assert.deepEqual(engine.commodityDetail(m, S(), 2).illegal, { Strict: 'p' });
    assert.equal(engine.commodityDetail(m, S(), 404).ok, false);
});

test('which cargo ship fits my money: price, money left, full load, runs to pay back', () => {
    const vehiclePrices = {
        terminals: { 50: { name: 'Ship Shop', place: 'Alpha', system: 'S1' } },
        vehicles: [
            { id: 1, uuid: 'AAAAAAAA-0000-4000-8000-000000000001', name: 'Maker Runabout', buy: [{ t: 50, price: 10000, at: HOUR_AGO }, { t: 51, price: 12000 }], rent: [{ t: 50, price: 1000 }] },
            { id: 2, name: 'Maker Big', buy: [{ t: 50, price: 50000 }] },
            { id: 3, name: 'Maker Mystery', buy: [{ t: 50, price: 1 }] },
            { id: 4, name: 'Somebody Else', buy: [{ t: 50, price: 1 }] },
        ],
    };
    const ships = { ships: [{ id: 'small', gameRef: 'aaaaaaaa-0000-4000-8000-000000000001' }] };
    const m = model([buyGold(), sellGold()], { vehiclePrices, ships });
    const result = engine.shipsForBudget(m, { now: NOW }, { money: 12000 });
    assert.equal(result.ok, true); assert.equal(result.tooExpensive, 1);
    assert.deepEqual(result.unknownCargo, ['mystery']);
    assert.deepEqual(result.noPrice, ['decker', 'min8', 'towed']);
    assert.deepEqual(result.rows.map((row) => [row.ship, row.kind, row.price, row.moneyLeft]), [['small', 'buy', 10000, 2000], ['small', 'rent', 1000, 11000]]);
    const bought = result.rows[0];
    assert.equal(bought.matchedBy, 'uuid'); assert.equal(bought.priceAt, HOUR_AGO); assert.deepEqual(bought.shop, { t: 50, name: 'Ship Shop', place: 'Alpha', system: 'S1' });
    assert.equal(bought.capacity, 16); assert.deepEqual(bought.noLimitRoute, { quantity: 16, investment: 1600, full: true }); assert.equal(bought.canAffordNoLimitRoute, true);
    assert.equal(bought.fullLoadCost, undefined); assert.equal(bought.canFill, undefined);   // 옛 이름은 뜻이 달라 없앴다
    assert.equal(bought.profitPerRun, 800); assert.equal(bought.runsToPayBack, 13);         // 10,000 ÷ 800 = 12.5 → 13번
    near(bought.hoursToPayBack, 13 * 757 / 3600);                                           // 13번 × 한 번 757초 (가는 길만)
    assert.ok(bought.hoursToPayBack * 3600 >= bought.bestRoute.seconds);                    // 한 번 도는 시간보다 짧을 수 없다
    assert.equal(result.rows[1].runsToPayBack, 2); assert.equal(result.rows[1].rentPeriod, null);
    for (const code of ['payback.repeat', 'payback.oneWay', 'rent.period']) assert.ok(result.assumptions.includes(code));
    // 함선 값을 내고 나면 가득 싣지 못하는 경우
    const tight = engine.shipsForBudget(m, { now: NOW }, { money: 10500, mode: 'buy' }).rows[0];
    assert.equal(tight.moneyLeft, 500); assert.equal(tight.canAffordNoLimitRoute, false); assert.equal(tight.bestRoute.quantity, 5); assert.equal(tight.runsToPayBack, 40);
    // 이름으로 맞춘 함선은 그렇게 표시된다.
    const rich = engine.shipsForBudget(m, { now: NOW }, { money: 100000, mode: 'buy' });
    assert.deepEqual(rich.rows.map((row) => [row.ship, row.matchedBy]), [['big', 'name'], ['small', 'uuid']]);
    assert.equal(engine.shipsForBudget(m, { now: NOW }, { money: 100000, mode: 'buy', maxShips: 1 }).skipped, 1);
    assert.equal(engine.shipsForBudget(m, { now: NOW }, {}).problem, 'no-money');
    assert.equal(engine.shipsForBudget(m, { now: NOW, budget: 12000 }, { mode: 'rent' }).rows.length, 1);
});

test('shared selections: one versioned localStorage key, documented defaults, change notices', () => {
    const store = new Map();
    const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    Object.defineProperty(globalThis, 'localStorage', {
        configurable: true,
        value: { getItem: (key) => (store.has(key) ? store.get(key) : null), setItem: (key, value) => store.set(key, String(value)), removeItem: (key) => store.delete(key) },
    });
    try {
        const { state } = engine;
        assert.equal(engine.STATE_KEY, 'volt-helper-state-v1');
        assert.deepEqual(state.defaults, { v: 1, ship: null, budget: null, system: null, maxAgeDays: 3, time: {}, boxes: null });
        state.reset();
        assert.deepEqual(state.get(), { v: 1, ship: null, budget: null, system: null, maxAgeDays: 3, time: {}, boxes: null });
        const seen = [];
        const stop = state.subscribe((next) => seen.push(next.ship));
        const saved = state.set({ ship: 'hull-c', budget: 500000, maxAgeDays: 7, time: { landingSeconds: 90, nonsense: 1 }, boxes: [32, 8, 5] });
        assert.deepEqual(saved, { v: 1, ship: 'hull-c', budget: 500000, system: null, maxAgeDays: 7, time: { landingSeconds: 90 }, boxes: [8, 32] });
        assert.deepEqual([...store.keys()], ['volt-helper-state-v1']);
        assert.deepEqual(JSON.parse(store.get('volt-helper-state-v1')), saved);
        state.set({ budget: -1, maxAgeDays: 0, system: 'Stanton', boxes: [1, 2, 4, 8, 16, 24, 32] });
        assert.deepEqual(state.get(), { v: 1, ship: 'hull-c', budget: null, system: 'Stanton', maxAgeDays: 3, time: { landingSeconds: 90 }, boxes: null });
        stop();
        state.set({ ship: 'raft' });
        assert.deepEqual(seen, ['hull-c', 'hull-c']);
        // 저장한 값은 그대로 계산 설정이 된다: 바꾼 시간 값 + 나머지는 기본값
        const settings = engine.settings({ ...state.get(), now: NOW });
        assert.equal(settings.ship, 'raft'); assert.equal(settings.time.landingSeconds, 90); assert.equal(settings.time.takeoffSeconds, 120);
        state.get().time.landingSeconds = 1;                                               // 돌려받은 사본을 고쳐도 저장값은 안 바뀐다
        assert.equal(state.get().time.landingSeconds, 90);
        state.reset();
        assert.equal(store.size, 0); assert.equal(state.get().ship, null);
    } finally {
        if (previous) Object.defineProperty(globalThis, 'localStorage', previous); else delete globalThis.localStorage;
    }
});

test('the module is pure: no DOM, no network, no timers', () => {
    const source = readFileSync(new URL('../../js/trade-engine.js', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
    for (const banned of [/\bdocument\b/, /\bfetch\s*\(/, /XMLHttpRequest/, /innerHTML/, /setTimeout|setInterval/, /\beval\s*\(/, /new Function/, /navigator\./]) {
        assert.equal(banned.test(source), false, String(banned));
    }
    assert.equal(typeof engine.buildModel, 'function'); assert.equal(engine.placeholder, undefined);
});

// ── 실제 크기의 스냅숏으로 속도 확인 ─────────────────────────────────────────
function mulberry(seed) {
    let state = seed >>> 0;
    return () => {
        state = (state + 0x6D2B79F5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function median(values) {
    const sorted = values.slice().sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
}

test('performance: all routes for one ship from a market-sized snapshot in under 300 ms', () => {
    const cargo = JSON.parse(readFileSync(new URL('../../data/trade/cargo.json', import.meta.url), 'utf8'));
    const world = JSON.parse(readFileSync(new URL('../../data/trade/world.json', import.meta.url), 'utf8'));
    // 2026-11-18 UEX 스냅숏과 같은 크기: 터미널 135곳, 상품 124가지, 구매 714줄 + 판매 1,885줄. 가격은 난수(씨앗 고정).
    const random = mulberry(20261119);
    const ids = Object.keys(world.joins.terminals.map).map(Number).slice(0, 135);
    const terminals = ids.map((id, index) => ({ id, type: 'commodity', name: `T${id}`, live: true, flags: index % 2 ? ['autoLoad'] : [], maxBox: [8, 16, 24, 32][index % 4] }));
    const market = [];
    const now = 1_795_000_000_000;
    const used = new Set();
    const add = (kind) => {
        for (;;) {
            const t = ids[Math.floor(random() * ids.length)]; const c = 1 + Math.floor(random() * 124);
            if (used.has(t * 1000 + c)) continue;
            used.add(t * 1000 + c);
            const base = 50 + c * 40; const at = now / 1000 - Math.floor(random() * 4 * 86400);
            market.push(kind === 'buy' ? { t, c, buy: Math.round(base * (0.7 + random() * 0.3)), stock: Math.floor(random() * 900), sb: 4, box: [1, 2, 4, 8, 16, 24, 32].slice(0, 3 + Math.floor(random() * 5)), at }
                : { t, c, sell: Math.round(base * (0.85 + random() * 0.4)), at });
            return;
        }
    };
    for (let n = 0; n < 714; n += 1) add('buy');
    for (let n = 0; n < 1885; n += 1) add('sell');
    const times = [];
    let result;
    for (let run = 0; run < 5; run += 1) {
        const started = performance.now();
        const m = engine.buildModel({ market, terminals, cargo, world });           // 모델 만들기부터 순위까지 전부 잰다
        result = engine.rankRoutes(m, { ship: 'c2-hercules', budget: 2_000_000, now }, { maxGoods: 3, returnTrip: true });
        times.push(performance.now() - started);
    }
    assert.ok(result.total > 500, `only ${result.total} routes`);
    assert.equal(result.stats.timeUnknown, 0);
    assert.ok(median(times) < 300, `median ${median(times).toFixed(1)} ms (runs: ${times.map((ms) => ms.toFixed(0)).join(', ')})`);
});

const SAVED = 'C:/VOLT/helper-research/probes/uex-api/data/';
test('performance and sanity on the saved UEX responses, trimmed the way the proxy trims them', { skip: existsSync(`${SAVED}commodities_prices_all.json`) ? false : 'saved UEX responses are not on this machine' }, () => {
    const raw = (name) => JSON.parse(readFileSync(`${SAVED}${name}.json`, 'utf8')).data;
    const market = buildMarket(raw('commodities_prices_all'));
    const terminals = buildTerminals(raw('terminals'));
    const commodities = raw('commodities');
    const cargo = JSON.parse(readFileSync(new URL('../../data/trade/cargo.json', import.meta.url), 'utf8'));
    const world = JSON.parse(readFileSync(new URL('../../data/trade/world.json', import.meta.url), 'utf8'));
    const now = Math.max(...market.map((row) => row.at || 0)) * 1000 + 3600_000;
    const times = [];
    let m; let result;
    for (let run = 0; run < 5; run += 1) {
        const started = performance.now();
        m = engine.buildModel({ market, terminals, cargo, world, commodities });
        result = engine.rankRoutes(m, { ship: 'c2-hercules', budget: 2_000_000, now }, { maxGoods: 3, returnTrip: true });
        times.push(performance.now() - started);
    }
    assert.ok(median(times) < 300, `median ${median(times).toFixed(1)} ms (runs: ${times.map((ms) => ms.toFixed(0)).join(', ')})`);
    assert.equal(m.counts.rows, market.length); assert.equal(m.counts.unknownTerminal, 0);
    assert.ok(result.total > 1000);
    // 이 스냅숏에서 쓰인 상품은 전부 게임 자료의 상품과 이름으로 이어진다 (한국어 이름·관할 규칙을 쓸 수 있다).
    for (const commodity of m.commodities.values()) assert.ok(commodity.gameId, `no game match for UEX commodity ${commodity.id}`);
    for (const route of result.routes) {
        assert.ok(route.quantity > 0 && route.quantity <= route.capacity);
        assert.ok(route.investment <= 2_000_000 + 1e-6);
        assert.equal(route.quantity, route.boxes.reduce((sum, box) => sum + box.scu * box.count, 0));
        for (const good of route.goods) {
            assert.equal(good.destination.takes, null);                             // 프록시 자료에는 받아 주는 양이 없다
            assert.ok(engine.ageLevel(good.buyAt, 3, now) === 'ok' && engine.ageLevel(good.sellAt, 3, now) === 'ok');
            if (good.stockKnown) assert.ok(good.quantity <= good.caps.stock);
        }
        assert.ok(route.seconds > 0 && Number.isFinite(route.profitPerHour));
    }
    const chains = engine.findChains(m, { ship: 'c2-hercules', budget: 2_000_000, now }, { stops: 8, beam: 200, maxWork: 400000 });
    assert.ok(chains.work <= 400000); assert.ok(chains.chains.length > 0);
});

test('module configurations use their own grids and do not leak into another ship', () => {
    const cargo = JSON.parse(readFileSync(new URL('../../data/trade/cargo.json', import.meta.url), 'utf8'));
    const m = model([], { cargo });
    for (const [ship, cargoConfig, expected] of [
        ['aurora-mk2', '', 2], ['aurora-mk2', 'aurora-mk2-cargo', 8], ['galaxy', '', 64], ['galaxy', 'galaxy-cargo', 720], ['retaliator', 'retaliator-front', 38],
        ['retaliator', 'retaliator-rear', 36], ['retaliator', 'retaliator-both', 74], ['retaliator', 'galaxy-cargo', 0],
    ]) {
        const profile = engine.shipProfile(m, { ship, cargoConfig });
        assert.equal(profile.scu, expected);
        assert.equal(profile.capacity, expected);
    }
    assert.equal(engine.shipProfile(m, {ship:'retaliator', cargoConfig:'retaliator-both', boxes:[32]}).capacity, 0);
});
