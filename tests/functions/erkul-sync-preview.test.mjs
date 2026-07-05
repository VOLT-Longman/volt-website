import test from 'node:test';
import assert from 'node:assert/strict';

import { onRequest as previewHandler } from '../../functions/api/admin/ships/erkul-sync/preview.js';
import { parseDataLayerJs, buildSyncPreview, normalizeErkulShip } from '../../functions/_shared/erkul-sync.js';
import { TEST_ENV, adminCookie } from './helpers.mjs';

// Erkul sync preview는 읽기 전용이다: ASSETS에서 현재 레이어를 읽고,
// Erkul live를 fetch해 diff만 계산한다. 어떤 쓰기 API도 호출하지 않는다.

const ERKUL_SHIP_FIXTURE = {
    calculatorType: 'ship',
    localName: 'anvl_asgard',
    data: {
        name: 'Asgard',
        ref: 'ref-asgard',
        size: 4,
        cargo: 180,
        fuelCapacity: 97.5,
        qtFuelCapacity: 1.85,
        description: 'Manufacturer: Anvil Aerospace\\nFocus: Drop Ship\\n \\nAsgard body text.',
        manufacturerData: { data: { name: 'Anvil Aerospace', nameSmall: 'ANVL' } },
        vehicle: { crewSize: 1, career: 'Combat', role: 'Dropship', size: { x: 38, y: 48, z: 12 }, fusePenetrationDamageMultiplier: 0.7, componentPenetrationDamageMultiplier: 0.5 },
        ifcs: { scmSpeed: 203, maxSpeed: 1075, boostSpeedForward: 425, boostSpeedBackward: 240, angularVelocity: { x: 32.5, y: 95, z: 27.5 } },
        hull: { mass: 610246.06, totalHp: 77000 },
        insurance: { baseExpeditingFee: 9430, baseWaitTimeMinutes: 17, mandatoryWaitTimeMinutes: 4.25 },
        armor: { data: { armor: { damageMultiplier: { damagePhysical: 0.7, damageEnergy: 0.5, damageDistortion: 1 } } } },
        items: { countermeasures: [] }
    }
};

const ERKUL_NEW_SHIP_FIXTURE = {
    calculatorType: 'ship',
    localName: 'anvl_newship',
    data: { ...ERKUL_SHIP_FIXTURE.data, name: 'New Ship', ref: 'ref-new' }
};

const ERKUL_SHOP_FIXTURE = {
    calculatorType: 'shop',
    data: {
        name: 'Astro Armada',
        location: 'Area18',
        rental: false,
        inventory: [{ localName: 'anvl_asgard', price: 17860500, ref: 'ref-asgard', available: 3 }]
    }
};

function currentLayersFromFixture() {
    const incoming = normalizeErkulShip(ERKUL_SHIP_FIXTURE);
    const stats = {
        asgard: {
            source: 'erkul-live',
            syncedAt: '2026-07-05T12:00:00.000Z',
            erkulLocalName: 'anvl_asgard',
            erkulRef: 'ref-asgard',
            ...incoming,
            descriptions: { source: 'erkul-live', en: incoming.descriptionEn, enRaw: null, ko: null }
        }
    };
    const market = {
        asgard: {
            source: 'erkul-live',
            erkulLocalName: 'anvl_asgard',
            purchase: [{ shop: 'Astro Armada', location: 'Area18', price: 17860500, available: 3, unavailable: null }],
            rentals: [],
            anomalies: []
        }
    };
    return { stats, market };
}

function mockAssets({ stats, market }) {
    const requests = [];
    return {
        requests,
        fetch(request) {
            const url = new URL(request.url);
            requests.push({ path: url.pathname, method: request.method || 'GET' });
            if (url.pathname === '/data/ship-live-stats.js') {
                return new Response(`window.VOLT_SHIP_LIVE_STATS = ${JSON.stringify(stats)};\n`);
            }
            if (url.pathname === '/data/ship-market.js') {
                return new Response(`window.VOLT_SHIP_MARKET = ${JSON.stringify(market)};\n`);
            }
            if (url.pathname === '/data/external/erkul/ship-match-report.json') {
                return new Response(JSON.stringify({ unmatchedVolt: [{ voltId: 'javelin' }] }));
            }
            return new Response('not found', { status: 404 });
        }
    };
}

function mockErkulFetch({ ships, shops, failShips = false } = {}) {
    const original = globalThis.fetch;
    globalThis.fetch = async (url) => {
        const target = String(url);
        if (target.includes('/live/ships')) {
            if (failShips) return new Response('blocked', { status: 403 });
            return new Response(JSON.stringify(ships));
        }
        if (target.includes('/shop')) return new Response(JSON.stringify(shops));
        throw new Error(`예상 밖 fetch: ${target}`);
    };
    return () => { globalThis.fetch = original; };
}

// 219/112 하한 검증을 통과할 크기의 픽스처 생성
function fixtureFleet() {
    const ships = [ERKUL_SHIP_FIXTURE, ERKUL_NEW_SHIP_FIXTURE];
    for (let i = 0; i < 120; i += 1) {
        ships.push({ calculatorType: 'ship', localName: `filler_ship_${i}`, data: { ...ERKUL_SHIP_FIXTURE.data, name: `Filler ${i}`, ref: `ref-filler-${i}` } });
    }
    const shops = [ERKUL_SHOP_FIXTURE];
    for (let i = 0; i < 30; i += 1) {
        shops.push({ calculatorType: 'shop', data: { name: `Filler Shop ${i}`, location: 'Nowhere', rental: false, inventory: [] } });
    }
    return { ships, shops };
}

function previewRequest(cookie) {
    return new Request('https://volt.ceo/api/admin/ships/erkul-sync/preview', {
        method: 'GET',
        headers: cookie ? { cookie } : {}
    });
}

test('비관리자 접근 → 401 차단 + Erkul fetch 미발생', async () => {
    let fetched = false;
    const restore = mockErkulFetch({ ships: [], shops: [] });
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (...args) => { fetched = true; return originalFetch(...args); };
    try {
        const assets = mockAssets(currentLayersFromFixture());
        const response = await previewHandler({ request: previewRequest(null), env: { ...TEST_ENV, ASSETS: assets } });
        assert.equal(response.status, 401);
        assert.equal(fetched, false);
        assert.equal(assets.requests.length, 0);
    } finally {
        restore();
    }
});

test('관리자 preview: 변경 없음 → summary 0 + diff 스키마 + GET 전용', async () => {
    const { ships, shops } = fixtureFleet();
    const restore = mockErkulFetch({ ships, shops });
    try {
        const layers = currentLayersFromFixture();
        const assets = mockAssets(layers);
        const response = await previewHandler({ request: previewRequest(await adminCookie()), env: { ...TEST_ENV, ASSETS: assets } });
        assert.equal(response.status, 200);
        const body = await response.json();

        assert.equal(body.source, 'erkul-live');
        for (const key of ['erkulShips', 'erkulShops', 'matched', 'statsChanged', 'marketChanged', 'newErkulCandidates', 'unmatchedVolt', 'marketOnlyUnmatched', 'priceChanges', 'purchaseLocationChanges', 'rentalChanges']) {
            assert.ok(key in body.summary, `summary.${key} 누락`);
        }
        for (const key of ['stats', 'market', 'descriptions', 'newCandidates', 'unmatched', 'marketOnly']) {
            assert.ok(Array.isArray(body.changes[key]), `changes.${key}는 배열이어야 함`);
        }
        // 현재 레이어와 동일한 데이터 → 변경 0
        assert.equal(body.summary.statsChanged, 0);
        assert.equal(body.summary.priceChanges, 0);
        // 레이어에 없는 함선은 신규 후보로만 잡히고 자동 추가되지 않음
        assert.ok(body.summary.newErkulCandidates >= 1);
        assert.ok(body.changes.newCandidates.some((c) => c.localName === 'anvl_newship'));
        // 읽기 전용: ASSETS는 GET 조회만 발생
        assert.ok(assets.requests.every((r) => r.method === 'GET'));

        const postResponse = await previewHandler({
            request: new Request('https://volt.ceo/api/admin/ships/erkul-sync/preview', { method: 'POST', headers: { cookie: await adminCookie() } }),
            env: { ...TEST_ENV, ASSETS: mockAssets(layers) }
        });
        assert.equal(postResponse.status, 405);
    } finally {
        restore();
    }
});

test('관리자 preview: 가격/스펙 변경 감지', async () => {
    const { ships, shops } = fixtureFleet();
    // 가격 +1000, cargo 180→200으로 바꾼 최신 데이터
    const changedShips = ships.map((s) => (s.localName === 'anvl_asgard'
        ? { ...s, data: { ...s.data, cargo: 200 } }
        : s));
    const changedShops = shops.map((s) => (s.data.name === 'Astro Armada'
        ? { ...s, data: { ...s.data, inventory: [{ localName: 'anvl_asgard', price: 18000000, ref: 'ref-asgard', available: 3 }] } }
        : s));
    const restore = mockErkulFetch({ ships: changedShips, shops: changedShops });
    try {
        const response = await previewHandler({ request: previewRequest(await adminCookie()), env: { ...TEST_ENV, ASSETS: mockAssets(currentLayersFromFixture()) } });
        const body = await response.json();
        assert.equal(body.summary.statsChanged, 1);
        assert.equal(body.summary.priceChanges, 1);
        const statRow = body.changes.stats.find((r) => r.field === 'cargoScu');
        assert.deepEqual({ current: statRow.current, incoming: statRow.incoming, voltId: statRow.voltId }, { current: 180, incoming: 200, voltId: 'asgard' });
        const priceRow = body.changes.market.find((r) => r.type === 'price');
        assert.equal(priceRow.current, 17860500);
        assert.equal(priceRow.incoming, 18000000);
    } finally {
        restore();
    }
});

test('Erkul fetch 실패(403) → 502 + 명확한 에러', async () => {
    const { ships, shops } = fixtureFleet();
    const restore = mockErkulFetch({ ships, shops, failShips: true });
    try {
        const response = await previewHandler({ request: previewRequest(await adminCookie()), env: { ...TEST_ENV, ASSETS: mockAssets(currentLayersFromFixture()) } });
        assert.equal(response.status, 502);
        const body = await response.json();
        assert.match(body.error, /Erkul/);
    } finally {
        restore();
    }
});

test('parseDataLayerJs: window 할당 형식 파싱 + 비정상 입력 거부', () => {
    assert.deepEqual(parseDataLayerJs('window.X = {"a":1};', 'X'), { a: 1 });
    assert.throws(() => parseDataLayerJs('const Y = {};', 'X'), /파싱 실패/);
});

test('buildSyncPreview: 사라진 함선 → warning, 파일 쓰기 없는 순수 함수', () => {
    const { stats, market } = currentLayersFromFixture();
    const result = buildSyncPreview({
        currentStats: stats,
        currentMarket: market,
        erkulShipsRaw: [],
        erkulShopsRaw: [],
        matchBaseline: { unmatchedVolt: [] }
    });
    assert.ok(result.warnings.some((w) => w.includes('anvl_asgard')));
    assert.equal(result.summary.matched, 1);
});
