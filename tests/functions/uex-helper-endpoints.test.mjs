import assert from 'node:assert/strict';
import test from 'node:test';
import { isCommunityResource } from '../../functions/_shared/community-access.js';
import * as market from '../../functions/api/uex/market.js';
import * as priceHistory from '../../functions/api/uex/price-history.js';
import * as refineries from '../../functions/api/uex/refineries.js';
import * as terminals from '../../functions/api/uex/terminals.js';
import * as vehiclePrices from '../../functions/api/uex/vehicle-prices.js';

// 업스트림 경로(쿼리 포함)별 응답을 정해 두는 가짜 UEX + 메모리 캐시.
function createHarness(upstream = {}) {
    const original = { fetch: globalThis.fetch, caches: globalThis.caches };
    const store = new Map();
    const calls = [];
    const pending = [];
    globalThis.caches = {
        default: {
            match: async (key) => store.get(key.url)?.clone(),
            put: async (key, response) => { store.set(key.url, response); }
        }
    };
    globalThis.fetch = async (requestUrl, init) => {
        const url = String(requestUrl);
        calls.push({ url, init });
        const reply = upstream[url.replace('https://uex.test/2.0/', '')];
        if (reply instanceof Error) throw reply;
        if (reply instanceof Response) return reply.clone();
        if (reply === undefined) return new Response('not found', { status: 404 });
        return new Response(JSON.stringify({ status: 'ok', http_code: 200, data: reply, message: '' }), { status: 200 });
    };
    return {
        store, calls, upstream,
        // 데이터 사본만 센다 (derived-state 아래의 "받는 중/실패" 표시는 제외).
        dataKeys() { return [...store.keys()].filter((key) => key.includes('/__uex-cache/derived/')); },
        async get(handler, path) {
            const response = await handler.onRequestGet({
                request: new Request('https://volt.test' + path),
                env: { UEX_API_BASE_URL: 'https://uex.test/2.0' },
                waitUntil(promise) { pending.push(promise); }
            });
            await Promise.all(pending.splice(0));
            return response;
        },
        restore() { globalThis.fetch = original.fetch; globalThis.caches = original.caches; }
    };
}

const PRICE_ROWS = [
    // 구매 가능 줄: 재고와 재고 상태만 남는다. 판매 쪽 잔재(scu_sell_stock 6)는 버린다.
    { id: 1, id_commodity: 29, id_terminal: 507, price_buy: 16295, price_buy_avg: 16295, price_sell: 0, scu_buy: 17, scu_sell_stock: 6, scu_sell: 0, status_buy: 3, status_sell: 0, container_sizes: '1,2,4,8', date_modified: 1795019400, commodity_name: "E'tam", terminal_name: 'Ashland' },
    // 판매 줄, 수량 보고 있음: 상점 재고 811과 단계 4만 싣는다. scu_sell 1419(= 811 × 7 ÷ 4)와 거기서 뺀 "수요"는 싣지 않는다.
    { id: 2, id_commodity: 47, id_terminal: 12, price_buy: 0, price_sell: 8500, scu_buy: 0, scu_sell_stock: 811, scu_sell: 1419, status_buy: 0, status_sell: 4, container_sizes: '1,2,4,8,16,24,32', date_modified: 1794976257 },
    // 판매 줄, 최신 보고에 수량 없음: scu_sell_stock 90은 옛 보고의 잔재, status_sell 1은 빈칸 기본값일 수 있어 둘 다 모름.
    { id: 3, id_commodity: 25, id_terminal: 12, price_buy: 0, price_sell: 7400, scu_buy: 0, scu_sell_stock: 90, scu_sell: 0, status_buy: 0, status_sell: 1, container_sizes: '', date_modified: 1794976257 },
    // 가득 참(단계 7)은 그대로 싣는다. 살 수 있는 재고 0(품절 보고)도 실제 보고 값으로 남긴다.
    { id: 4, id_commodity: 33, id_terminal: 12, price_buy: 0, price_sell: 6000, scu_sell_stock: 840, scu_sell: 840, status_sell: 7, container_sizes: null, date_modified: 0 },
    { id: 5, id_commodity: 60, id_terminal: 6, price_buy: 3705, price_sell: 0, scu_buy: 0, status_buy: 1, status_sell: 0, container_sizes: '8,16', date_modified: 1794963739 },
    // 가격이 없거나 id가 잘못된 줄은 버린다.
    { id: 6, id_commodity: 61, id_terminal: 6, price_buy: 0, price_sell: 0, date_modified: 1794963739 },
    { id: 7, id_commodity: 0, id_terminal: 6, price_buy: 10, date_modified: 1794963739 },
    null
];

test('UEX market: 화면에 필요한 필드만 남기고 모르는 값은 0 대신 뺀다', () => {
    assert.deepEqual(market.buildMarket(PRICE_ROWS), [
        { t: 507, c: 29, buy: 16295, stock: 17, sb: 3, box: [1, 2, 4, 8], at: 1795019400 },
        { t: 12, c: 47, sell: 8500, inv: 811, ss: 4, box: [1, 2, 4, 8, 16, 24, 32], at: 1794976257 },
        { t: 12, c: 25, sell: 7400, at: 1794976257 },
        { t: 12, c: 33, sell: 6000, inv: 840, ss: 7 },
        { t: 6, c: 60, buy: 3705, stock: 0, sb: 1, box: [8, 16], at: 1794963739 }
    ]);
    // 어떤 줄에도 demand는 없고, 수량 없는 판매 줄에는 ss도 없다.
    assert.equal(market.buildMarket(PRICE_ROWS).some((row) => 'demand' in row || ('ss' in row && !('inv' in row))), false);
    // UEX가 숫자를 문자열로 보내도 결과가 같다.
    const asText = PRICE_ROWS.map((row) => row && Object.fromEntries(Object.entries(row).map(([key, value]) => [key, typeof value === 'number' ? String(value) : value])));
    assert.deepEqual(market.buildMarket(asText), market.buildMarket(PRICE_ROWS));
    assert.equal(market.parseBoxSizes(''), null);
    assert.deepEqual(market.parseBoxSizes('1,x,4'), [1, 4]);
    assert.equal(market.parseBoxSizes(undefined), null);
});

test('UEX market: 고정된 업스트림 한 곳만 부르고, 개인정보·사이트 식별 정보 없이 Accept 헤더만 보낸다', async () => {
    const harness = createHarness({ commodities_prices_all: PRICE_ROWS });
    try {
        const first = await harness.get(market, '/api/uex/market?x=1&id_terminal=5');
        const body = await first.json();
        assert.equal(first.status, 200);
        assert.equal(body.status, 'ok');
        assert.equal(body.data.length, 5);
        assert.deepEqual(Object.keys(body.meta).sort(), ['cached', 'fetchedAt', 'source', 'ttlSeconds']);
        assert.equal(body.meta.source, 'uex');
        assert.equal(body.meta.cached, false);
        assert.equal(body.meta.ttlSeconds, 1800);
        assert.equal(first.headers.get('Cache-Control'), 'public, max-age=1800');

        // 임의 쿼리로는 캐시 키도 업스트림 호출도 늘지 않는다.
        const second = await harness.get(market, '/api/uex/market?y=2');
        assert.equal((await second.json()).meta.cached, true);
        assert.equal(harness.calls.length, 1);
        assert.deepEqual(harness.dataKeys(), ['https://volt.test/__uex-cache/derived/market/v2']);
        assert.equal(harness.calls[0].url, 'https://uex.test/2.0/commodities_prices_all');
        assert.deepEqual(harness.calls[0].init.headers, { Accept: 'application/json' });
        assert.deepEqual(Object.keys(harness.calls[0].init).sort(), ['headers', 'signal']);
    } finally { harness.restore(); }
});

test('UEX market: 새로고침은 60초 하한을 지키고, 하한이 지나면 다시 받는다', async () => {
    const harness = createHarness({ commodities_prices_all: PRICE_ROWS });
    try {
        await harness.get(market, '/api/uex/market');
        const floor = await harness.get(market, '/api/uex/market?refresh=1');
        assert.equal((await floor.json()).meta.cached, true);
        assert.equal(floor.headers.get('Cache-Control'), 'no-store');
        assert.equal(harness.calls.length, 1);

        const [key] = harness.dataKeys();
        const old = await harness.store.get(key).json();
        old.meta.fetchedAt = new Date(Date.now() - 120000).toISOString();
        harness.store.set(key, new Response(JSON.stringify(old)));
        const plain = await harness.get(market, '/api/uex/market');
        assert.equal((await plain.json()).meta.cached, true);
        assert.match(plain.headers.get('Cache-Control'), /^public, max-age=16\d\d$/);
        const fresh = await harness.get(market, '/api/uex/market?refresh=1');
        assert.equal((await fresh.json()).meta.cached, false);
        assert.equal(harness.calls.length, 2);
    } finally { harness.restore(); }
});

test('UEX 새 엔드포인트: 업스트림 실패는 503, 잘못된 응답은 502, 데이터로 캐시하지 않고 60초 동안 다시 부르지 않는다', async () => {
    const harness = createHarness({
        commodities_prices_all: new Error('network unavailable'),
        terminals: new Response(JSON.stringify({ status: 'requests_limit_reached', http_code: 429, data: null }), { status: 429 }),
        refineries_yields: [],
        refineries_methods: new Response(JSON.stringify({ status: 'ok', data: { not: 'a list' } }), { status: 200 })
    });
    try {
        const down = await harness.get(market, '/api/uex/market');
        assert.equal(down.status, 503);
        assert.deepEqual(await down.json(), { error: 'UEX API request failed' });
        assert.equal(down.headers.get('Cache-Control'), 'no-store');
        const limited = await harness.get(terminals, '/api/uex/terminals');
        assert.equal(limited.status, 503);
        const invalid = await harness.get(refineries, '/api/uex/refineries');
        assert.equal(invalid.status, 502);
        assert.deepEqual(await invalid.json(), { error: 'Invalid UEX API payload' });
        assert.deepEqual(harness.dataKeys(), []);

        // 실패 직후의 요청은 UEX를 다시 부르지 않고 같은 오류를 돌려준다.
        const before = harness.calls.length;
        assert.equal(before, 4);
        for (let i = 0; i < 5; i++) assert.equal((await harness.get(market, '/api/uex/market?refresh=1')).status, 503);
        assert.equal((await harness.get(priceHistory, '/api/uex/price-history?terminal=12&commodity=47')).status, 503);
        const again = await harness.get(refineries, '/api/uex/refineries');
        assert.equal(again.status, 502);
        assert.equal(harness.calls.length, before);

        // 60초가 지나면 다시 시도한다.
        const stateKey = 'https://volt.test/__uex-cache/derived-state/market/v2';
        const state = await harness.store.get(stateKey).json();
        assert.equal(state.kind, 'failed');
        harness.store.set(stateKey, new Response(JSON.stringify({ ...state, at: Date.now() - 61000 })));
        harness.upstream.commodities_prices_all = PRICE_ROWS;
        assert.equal((await harness.get(market, '/api/uex/market')).status, 200);
        assert.equal(harness.calls.length, before + 1);
    } finally { harness.restore(); }
});

test('UEX market: 만료된 사본은 UEX가 안 될 때 stale로 내주고, 그동안 UEX를 반복해서 부르지 않는다', async () => {
    const harness = createHarness({ commodities_prices_all: PRICE_ROWS });
    try {
        await harness.get(market, '/api/uex/market');
        const [key] = harness.dataKeys();
        const age = async (ms) => {
            const old = await harness.store.get(key).json();
            old.meta.fetchedAt = new Date(Date.now() - ms).toISOString();
            harness.store.set(key, new Response(JSON.stringify(old)));
        };
        await age(31 * 60 * 1000);
        harness.upstream.commodities_prices_all = new Response('<html>busy</html>', { status: 200 });
        const stale = await harness.get(market, '/api/uex/market');
        const body = await stale.json();
        assert.equal(stale.status, 200);
        assert.equal(body.data.length, 5);
        assert.equal(body.meta.cached, true);
        assert.equal(body.meta.stale, true);
        assert.equal(stale.headers.get('Cache-Control'), 'public, max-age=60');
        assert.equal(harness.calls.length, 2);
        // 실패를 기억하는 60초 동안은 stale만 내주고 UEX를 부르지 않는다. 이력 조회의 쌍 확인도 같은 사본을 쓴다.
        for (let i = 0; i < 5; i++) assert.equal((await (await harness.get(market, '/api/uex/market')).json()).meta.stale, true);
        assert.equal(harness.calls.length, 2);
        assert.equal((await harness.get(priceHistory, '/api/uex/price-history?terminal=12&commodity=29')).status, 404);
        assert.equal(harness.calls.length, 2);

        // TTL + 24시간이 지난 사본은 쓰지 않는다.
        await age(25 * 60 * 60 * 1000);
        assert.equal((await harness.get(market, '/api/uex/market')).status, 502);
    } finally { harness.restore(); }
});

test('UEX market: 캐시가 비었을 때 동시에 온 요청은 UEX를 한 번만 부른다', async () => {
    const harness = createHarness({ commodities_prices_all: PRICE_ROWS });
    const plainFetch = globalThis.fetch;
    globalThis.fetch = async (...args) => { await new Promise((resolve) => setTimeout(resolve, 30)); return plainFetch(...args); };
    try {
        const responses = await Promise.all(Array.from({ length: 20 }, (_, index) => harness.get(market, '/api/uex/market?n=' + index)));
        for (const response of responses) assert.equal((await response.json()).data.length, 5);
        assert.equal(harness.calls.length, 1);
    } finally { harness.restore(); }
});

test('UEX 새 엔드포인트: 깨진 캐시 항목은 버리고 새로 받으며, 형식이 바뀌어 빈 표가 나오면 캐시하지 않고 502', async () => {
    const harness = createHarness({ commodities_prices_all: PRICE_ROWS, terminals: [{ id: 'T-1', type: 'commodity', name: 'ids are no longer numbers' }], refineries_yields: [{ id_terminal: {}, id_commodity: [], value: 3 }], refineries_methods: [{ id: 1, name: 'Cormack' }], vehicles: [], vehicles_purchases_prices_all: [{ id_vehicle: 'x', id_terminal: 'y', price_buy: 5 }], vehicles_rentals_prices_all: [] });
    try {
        for (const body of ['not json', 'null', '{"status":"ok"}', '{"status":"ok","data":[],"meta":{"fetchedAt":"yesterday"}}']) {
            harness.store.clear();
            harness.store.set('https://volt.test/__uex-cache/derived/market/v2', new Response(body));
            harness.store.set('https://volt.test/__uex-cache/derived-state/market/v2', new Response('<broken>'));
            const response = await harness.get(market, '/api/uex/market');
            assert.equal(response.status, 200, body);
            assert.equal((await response.json()).meta.cached, false, body);
        }
        for (const [handler, path] of [[terminals, '/api/uex/terminals'], [refineries, '/api/uex/refineries'], [vehiclePrices, '/api/uex/vehicle-prices']]) {
            const response = await harness.get(handler, path);
            assert.equal(response.status, 502, path);
            assert.deepEqual(await response.json(), { error: 'Invalid UEX API payload' });
        }
        assert.deepEqual(harness.dataKeys(), ['https://volt.test/__uex-cache/derived/market/v2']);
    } finally { harness.restore(); }
});

test('UEX terminals: 상품·정제소 터미널만, 시설 표시와 위치만 남기고 0은 모름으로 처리', async () => {
    const rows = [
        { id: 1, id_star_system: 68, id_planet: 4, id_orbit: 326, id_moon: 0, id_space_station: 1, id_outpost: 0, id_poi: 0, id_city: 0, name: 'Admin - ARC-L1', nickname: 'ARC-L1', code: 'ARCL1', type: 'commodity', screenshot: 'https://cdn.example/x.jpg', screenshot_author: 'someone', is_available: 1, is_available_live: 1, is_refinery: 0, is_cargo_center: 0, is_auto_load: 1, has_loading_dock: 0, has_docking_port: 0, has_freight_elevator: 1, star_system_name: 'Stanton', planet_name: 'ArcCorp', orbit_name: 'ArcCorp Lagrange Point 1', moon_name: null, space_station_name: 'ARC-L1 Wide Forest Station', outpost_name: null, city_name: null, faction_name: 'United Empire of Earth', max_container_size: 32 },
        { id: 263, id_star_system: 68, name: 'Platinum Bay - ARC-L1', type: 'commodity', is_available: 0, is_available_live: 0, star_system_name: 'Stanton', max_container_size: 0 },
        { id: 242, id_star_system: 68, id_orbit: 339, name: 'Refinement Processing - MIC-L1', type: 'refinery', is_available: 1, is_available_live: 1, is_refinery: 1, star_system_name: 'Stanton', orbit_name: 'microTech Lagrange Point 1', max_container_size: 0 },
        { id: 300, name: 'Astro Armada', type: 'vehicle_buy', is_available_live: 1 },
        { id: 301, name: 'Casaba', type: 'item' },
        { id: 0, name: 'broken', type: 'commodity' },
        null
    ];
    assert.deepEqual(terminals.buildTerminals(rows), [
        { id: 1, type: 'commodity', name: 'Admin - ARC-L1', nick: 'ARC-L1', code: 'ARCL1', live: true, systemId: 68, system: 'Stanton', planetId: 4, planet: 'ArcCorp', orbitId: 326, orbit: 'ArcCorp Lagrange Point 1', stationId: 1, station: 'ARC-L1 Wide Forest Station', faction: 'United Empire of Earth', flags: ['autoLoad', 'freightElevator'], maxBox: 32 },
        { id: 263, type: 'commodity', name: 'Platinum Bay - ARC-L1', live: false, systemId: 68, system: 'Stanton' },
        { id: 242, type: 'refinery', name: 'Refinement Processing - MIC-L1', live: true, systemId: 68, system: 'Stanton', orbitId: 339, orbit: 'microTech Lagrange Point 1', flags: ['refinery'] }
    ]);

    const harness = createHarness({ terminals: rows });
    try {
        const first = await harness.get(terminals, '/api/uex/terminals');
        assert.equal((await first.json()).data.length, 3);
        assert.equal(first.headers.get('Cache-Control'), 'public, max-age=43200');
        // 12시간 캐시되는 표는 refresh=1을 무시한다.
        const again = await harness.get(terminals, '/api/uex/terminals?refresh=1&type=item');
        assert.equal((await again.json()).meta.cached, true);
        assert.deepEqual(harness.calls.map((call) => call.url), ['https://uex.test/2.0/terminals']);
    } finally { harness.restore(); }
});

test('UEX refineries: 수율 보너스(음수 포함)와 방식 등급, 상품 이름은 id 표로 한 번만', async () => {
    const yields = [
        { id: 206, id_commodity: 45, id_terminal: 755, value: -5, value_week: -5, value_month: -5, date_added: 1771973115, date_modified: 1792430165, commodity_name: 'Iron (Ore)', terminal_name: 'Refinement Center - Nyx Gateway (Pyro)' },
        { id: 207, id_commodity: 45, id_terminal: 242, value: 13, date_added: 1771973115, date_modified: 0, commodity_name: 'Iron (Ore)' },
        { id: 208, id_commodity: 46, id_terminal: 242, value: null, commodity_name: 'Unknown (Ore)' },
        { id: 209, id_commodity: 0, id_terminal: 242, value: 3 },
        null
    ];
    const methods = [{ id: 1, name: 'Cormack', code: 'COR', rating_yield: 1, rating_cost: 2, rating_speed: 3, date_added: 1697062480 }, { id: 2, name: 'Dinyx Solventation', code: 'DIN', rating_yield: 3, rating_cost: 1, rating_speed: 0 }, { id: 3 }, null];
    const harness = createHarness({ refineries_yields: yields, refineries_methods: methods });
    try {
        const response = await harness.get(refineries, '/api/uex/refineries?refresh=1');
        const body = await response.json();
        assert.deepEqual(body.data, {
            methods: [{ id: 1, name: 'Cormack', code: 'COR', yield: 1, cost: 2, speed: 3 }, { id: 2, name: 'Dinyx Solventation', code: 'DIN', yield: 3, cost: 1 }],
            commodities: { 45: 'Iron (Ore)' },
            yields: [{ t: 755, c: 45, v: -5, at: 1792430165 }, { t: 242, c: 45, v: 13, at: 1771973115 }]
        });
        assert.equal(body.meta.ttlSeconds, 86400);
        assert.deepEqual(harness.calls.map((call) => call.url).sort(), ['https://uex.test/2.0/refineries_methods', 'https://uex.test/2.0/refineries_yields']);
    } finally { harness.restore(); }
});

test('UEX vehicle-prices: 구매가와 대여가를 함선별로 묶고 최신 보고·이용 가능한 터미널만 남긴다', async () => {
    // 77과 78은 같은 uuid를 나눠 쓴다(UEX 목록의 실제 사례) → 어느 쪽인지 모르므로 uuid를 싣지 않는다. 형식이 틀린 uuid도 뺀다.
    const vehicles = [{ id: 1, uuid: '6135A874-4CB1-4F49-9F29-5781E5991F2B', name_full: 'Origin 100i' }, { id: 118, uuid: 'not-a-uuid', name_full: 'Origin M50' }, { id: 77, uuid: '087b2253-2fc7-4fae-9f9d-97f64b7c43db' }, { id: 78, uuid: '087b2253-2fc7-4fae-9f9d-97f64b7c43db' }, null];
    const purchases = [
        { id_vehicle: 1, id_terminal: 149, price_buy: 1089270, date_modified: 5, vehicle_name: '100i' },
        { id_vehicle: 1, id_terminal: 149, price_buy: 1000000, date_modified: 4, vehicle_name: '100i' },
        { id_vehicle: 1, id_terminal: 148, price_buy: 1146600, date_modified: 6, vehicle_name: '100i' },
        { id_vehicle: 1, id_terminal: 150, price_buy: 900000, date_modified: 6 },
        { id_vehicle: 1, id_terminal: 999, price_buy: 800000, date_modified: 6 },
        { id_vehicle: 2, id_terminal: 149, price_buy: 0 }, null
    ];
    const rentals = [
        { id_vehicle: 1, id_terminal: 147, price_rent: 28665, date_modified: 7, vehicle_name: '100i' },
        { id_vehicle: 118, id_terminal: 147, price_rent: 37485, date_modified: 0, vehicle_name: 'M50' },
        { id_vehicle: 77, id_terminal: 147, price_rent: 500, date_modified: 8, vehicle_name: 'Unlisted' },
        { id_vehicle: 118, id_terminal: 147, price_rent: 'NaN' }
    ];
    const places = [
        { id: 147, name: 'Regal NBIS', city_name: 'New Babbage', star_system_name: 'Stanton', is_available: 1, is_available_live: 1 },
        { id: 148, name: 'Astro Armada', city_name: 'Area 18', star_system_name: 'Stanton', is_available_live: 1 },
        { id: 149, name: 'New Deal', city_name: 'Lorville', star_system_name: 'Stanton', is_available_live: 1 },
        { id: 150, name: 'Closed', is_available_live: 0 }, null
    ];
    const harness = createHarness({ vehicles, vehicles_purchases_prices_all: purchases, vehicles_rentals_prices_all: rentals, terminals: places });
    try {
        const body = await (await harness.get(vehiclePrices, '/api/uex/vehicle-prices?ship=anything')).json();
        assert.deepEqual(body.data.vehicles, [
            { id: 1, uuid: '6135a874-4cb1-4f49-9f29-5781e5991f2b', name: 'Origin 100i', buy: [{ t: 149, price: 1089270, at: 5 }, { t: 148, price: 1146600, at: 6 }], rent: [{ t: 147, price: 28665, at: 7 }] },
            { id: 77, name: 'Unlisted', rent: [{ t: 147, price: 500, at: 8 }] },
            { id: 118, name: 'Origin M50', rent: [{ t: 147, price: 37485 }] }
        ]);
        assert.deepEqual(body.data.terminals, {
            147: { name: 'Regal NBIS', place: 'New Babbage', system: 'Stanton' },
            148: { name: 'Astro Armada', place: 'Area 18', system: 'Stanton' },
            149: { name: 'New Deal', place: 'Lorville', system: 'Stanton' }
        });
        assert.equal(body.meta.ttlSeconds, 43200);
        assert.deepEqual(harness.calls.map((call) => call.url).sort(), ['terminals', 'vehicles', 'vehicles_purchases_prices_all', 'vehicles_rentals_prices_all'].map((path) => 'https://uex.test/2.0/' + path));
    } finally { harness.restore(); }
});

test('UEX price-history: 숫자 id만, 시장 스냅샷에 있는 쌍만 업스트림으로 보낸다', async () => {
    const history = [
        { id: 9, id_commodity: 47, id_terminal: 12, price_buy: 0, price_sell: 8500, scu_buy: 0, scu_sell_stock: 0, scu_sell: 0, status_buy: 0, status_sell: 1, game_version: '4.10.3', date_added: 1794617237, terminal_name: 'TDD' },
        { id: 8, id_commodity: 47, id_terminal: 12, price_buy: 0, price_sell: 8400, scu_buy: 0, scu_sell_stock: 162, scu_sell: 1134, status_buy: 0, status_sell: 1, game_version: '4.10.3', date_added: 1794533881 },
        { id: 7, price_sell: 8400, date_added: 0 }, null
    ];
    const harness = createHarness({ commodities_prices_all: PRICE_ROWS, 'commodities_prices_history?id_terminal=12&id_commodity=47': history });
    try {
        for (const query of ['', '?terminal=12', '?terminal=abc&commodity=47', '?terminal=12&commodity=47,48', '?terminal=0&commodity=47', '?terminal=12345678&commodity=47', '?terminal=12&commodity=-1', '?terminal=12%26x%3D1&commodity=47']) {
            assert.equal((await harness.get(priceHistory, '/api/uex/price-history' + query)).status, 400, query);
        }
        assert.equal(harness.calls.length, 0);

        const unknown = await harness.get(priceHistory, '/api/uex/price-history?terminal=12&commodity=29');
        assert.equal(unknown.status, 404);
        assert.deepEqual(harness.calls.map((call) => call.url), ['https://uex.test/2.0/commodities_prices_all']);

        const response = await harness.get(priceHistory, '/api/uex/price-history?terminal=12&commodity=47&game_version=1&refresh=1');
        const body = await response.json();
        assert.equal(response.status, 200);
        assert.deepEqual(body.data, [
            { at: 1794533881, sell: 8400, inv: 162, ss: 1, v: '4.10.3' },
            // 수량이 0으로 적힌 보고: 가격만 싣는다 (정말 비었는지, 안 적은 것인지 알 수 없음).
            { at: 1794617237, sell: 8500, v: '4.10.3' }
        ]);
        assert.equal(body.meta.ttlSeconds, 43200);
        assert.equal(harness.calls[1].url, 'https://uex.test/2.0/commodities_prices_history?id_terminal=12&id_commodity=47');
        assert.deepEqual(harness.calls[1].init.headers, { Accept: 'application/json' });

        // 같은 쌍을 다시 물어도 업스트림을 더 부르지 않는다.
        assert.equal((await (await harness.get(priceHistory, '/api/uex/price-history?terminal=12&commodity=47')).json()).meta.cached, true);
        assert.equal(harness.calls.length, 2);
    } finally { harness.restore(); }
});

test('UEX price-history: 시장 스냅샷을 못 받으면 이력도 부르지 않고 503', async () => {
    const harness = createHarness({ commodities_prices_all: new Error('down'), 'commodities_prices_history?id_terminal=12&id_commodity=47': [] });
    try {
        const response = await harness.get(priceHistory, '/api/uex/price-history?terminal=12&commodity=47');
        assert.equal(response.status, 503);
        assert.equal(harness.calls.length, 1);
    } finally { harness.restore(); }
});

test('UEX 새 엔드포인트: GET만 내보내고 커뮤니티 게이트 경로 안에 있다', () => {
    for (const [name, module] of Object.entries({ market, terminals, refineries, 'vehicle-prices': vehiclePrices, 'price-history': priceHistory })) {
        assert.deepEqual(Object.keys(module).filter((key) => key.startsWith('onRequest')), ['onRequestGet'], name);
        assert.equal(isCommunityResource('/api/uex/' + name), true, name);
    }
});
