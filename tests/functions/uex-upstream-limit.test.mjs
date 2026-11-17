import assert from 'node:assert/strict';
import test from 'node:test';
import { onRequestGet as locationPrices } from '../../functions/api/uex/location-prices.js';
import { onRequestGet as loadoutPrices } from '../../functions/api/uex/loadout-prices.js';
import { UEX_UPSTREAM_PER_MINUTE } from '../../functions/_shared/uex-proxy.js';
import { TEST_ENV } from './helpers.mjs';
import { createSqliteDb } from './sqlite-d1.mjs';

function harness(env) {
    const original = { fetch: globalThis.fetch, caches: globalThis.caches };
    const store = new Map();
    const pending = [];
    let upstreamCalls = 0;
    globalThis.fetch = async () => {
        upstreamCalls += 1;
        return new Response(JSON.stringify({ status: 'ok', data: [{ id: 1, uuid: 'a', id_item: 1, price_buy: 10 }] }), { headers: { 'Content-Type': 'application/json' } });
    };
    globalThis.caches = { default: {
        async match(request) { return store.get(request.url)?.clone() || null; },
        async put(request, response) { store.set(request.url, response); },
    } };
    return {
        calls: () => upstreamCalls,
        context: (url) => ({ request: new Request(url), env, waitUntil(promise) { pending.push(promise); } }),
        async settle() { await Promise.all(pending.splice(0)); },
        async restore() { await Promise.all(pending); globalThis.fetch = original.fetch; globalThis.caches = original.caches; },
    };
}

test('UEX 원본 호출은 분당 한도까지만 하고, 넘으면 429와 재시도 안내를 준다', async () => {
    const h = harness({ ...TEST_ENV, DB: createSqliteDb(), UEX_API_BASE_URL: 'https://uex.test/2.0' });
    try {
        for (let id = 1; id <= UEX_UPSTREAM_PER_MINUTE; id += 1) {
            const response = await locationPrices(h.context(`https://volt.test/api/uex/location-prices?field=id_terminal&id=${id}`));
            assert.equal(response.status, 200, `id ${id}`);
        }
        await h.settle();
        assert.equal(h.calls(), UEX_UPSTREAM_PER_MINUTE);

        const blocked = await locationPrices(h.context('https://volt.test/api/uex/location-prices?field=id_terminal&id=99999'));
        assert.equal(blocked.status, 429);
        assert.equal(blocked.headers.get('Retry-After'), '60');
        assert.equal(blocked.headers.get('Cache-Control'), 'no-store');
        assert.equal(h.calls(), UEX_UPSTREAM_PER_MINUTE, '한도를 넘으면 원본을 부르지 않는다');

        // 이미 받아 둔 응답은 한도와 무관하게 계속 준다.
        const cached = await locationPrices(h.context('https://volt.test/api/uex/location-prices?field=id_terminal&id=1'));
        assert.equal(cached.status, 200);
        assert.equal((await cached.json()).meta.cached, true);

        // 새로 고침을 눌러도 한도 중에는 가지고 있던 응답을 준다.
        const stale = await locationPrices(h.context('https://volt.test/api/uex/location-prices?field=id_terminal&id=1&refresh=1'));
        assert.equal(stale.status, 200);

        const loadout = await loadoutPrices(h.context('https://volt.test/api/uex/loadout-prices?category=19'));
        assert.equal(loadout.status, 429);
        assert.equal(h.calls(), UEX_UPSTREAM_PER_MINUTE);
    } finally { await h.restore(); }
});

test('한도 기록 저장소가 없어도 시세 조회는 막히지 않는다', async () => {
    const h = harness({ UEX_API_BASE_URL: 'https://uex.test/2.0' });
    try {
        const response = await loadoutPrices(h.context('https://volt.test/api/uex/loadout-prices?category=19'));
        assert.equal(response.status, 200);
        assert.equal(h.calls(), 2);
    } finally { await h.restore(); }
});
