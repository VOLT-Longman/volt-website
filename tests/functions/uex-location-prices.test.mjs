import assert from 'node:assert/strict';
import test from 'node:test';
import { onRequestGet } from '../../functions/api/uex/location-prices.js';

function createProxyContext(url, payload, fetchImpl) {
    const originalFetch = globalThis.fetch;
    const originalCaches = globalThis.caches;
    const waitUntilPromises = [];
    let fetchedUrl = '';

    globalThis.fetch = async (requestUrl, init) => {
        fetchedUrl = String(requestUrl);
        if (fetchImpl) return fetchImpl(requestUrl, init);
        return new Response(JSON.stringify(payload), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });
    };
    globalThis.caches = {
        default: {
            async match() { return null; },
            async put() { return undefined; }
        }
    };

    return {
        context: {
            request: new Request(url),
            env: { UEX_API_BASE_URL: 'https://uex.test/2.0' },
            waitUntil(promise) { waitUntilPromises.push(promise); }
        },
        fetchedUrl: () => fetchedUrl,
        async restore() {
            await Promise.all(waitUntilPromises);
            globalThis.fetch = originalFetch;
            globalThis.caches = originalCaches;
        }
    };
}

test('UEX location-prices: 허용된 거점 필드만 프록시', async () => {
    const harness = createProxyContext('https://volt.test/api/uex/location-prices?field=id_terminal&id=101', {
        status: 'ok',
        data: [{ commodity_name: 'Gold', price_buy: 100 }]
    });

    try {
        const response = await onRequestGet(harness.context);
        const body = await response.json();

        assert.equal(response.status, 200);
        assert.equal(harness.fetchedUrl(), 'https://uex.test/2.0/commodities_prices?id_terminal=101');
        assert.equal(body.data[0].commodity_name, 'Gold');
        assert.equal(body.meta.source, 'uex');
    } finally {
        await harness.restore();
    }
});

test('UEX location-prices: 잘못된 필드와 id는 거부', async () => {
    const badField = await onRequestGet({ request: new Request('https://volt.test/api/uex/location-prices?field=bad&id=101') });
    const badId = await onRequestGet({ request: new Request('https://volt.test/api/uex/location-prices?field=id_terminal&id=abc') });

    assert.equal(badField.status, 400);
    assert.equal(badId.status, 400);
});

test('UEX location-prices: 업스트림 네트워크 실패는 503으로 변환', async () => {
    const harness = createProxyContext('https://volt.test/api/uex/location-prices?field=id_terminal&id=101', null, async () => {
        throw new Error('network unavailable');
    });

    try {
        const response = await onRequestGet(harness.context);
        const body = await response.json();

        assert.equal(response.status, 503);
        assert.equal(body.error, 'UEX API request failed');
    } finally {
        await harness.restore();
    }
});
