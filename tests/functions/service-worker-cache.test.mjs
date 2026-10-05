import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../../sw.js', import.meta.url), 'utf8');
function worker() {
    const handlers = {}, stores = new Map();
    let failWrites = false;
    let network = async () => new Response('network');
    const keyOf = (request) => typeof request === 'string' ? new URL(request, 'https://www.volt.ceo').href : request.url;
    const caches = {
        async keys() { return [...stores.keys()]; },
        async delete(name) { return stores.delete(name); },
        async open(name) {
            if (!stores.has(name)) stores.set(name, new Map());
            const rows = stores.get(name);
            return {
                async put(request, response) { if (failWrites) throw new Error('Quota exceeded'); rows.set(keyOf(request), response.clone()); },
                async match(request) { return rows.get(keyOf(request))?.clone(); },
                async keys() { return [...rows.keys()].map((url) => new Request(url)); },
                async delete(request) { return rows.delete(keyOf(request)); }
            };
        }
    };
    const self = { location: { origin: 'https://www.volt.ceo' }, clients: { claim: async () => {} },
        addEventListener: (name, callback) => { handlers[name] = callback; }, skipWaiting() {} };
    vm.runInNewContext(source, { self, caches, URL, Request, Response, Set, Promise, fetch: (...args) => network(...args) });
    return { stores, caches,
        setNetwork: (callback) => { network = callback; },
        failWrites: () => { failWrites = true; },
        async activate() { const pending = []; handlers.activate({ waitUntil: (p) => pending.push(p) }); await Promise.all(pending); },
        async request(path, options = {}) {
            const pending = [];
            let result;
            const request = new Request(new URL(path, self.location.origin), options);
            handlers.fetch({ request, respondWith: (p) => { result = p; }, waitUntil: (p) => pending.push(p) });
            const response = await result;
            await Promise.all(pending);
            return response;
        }
    };
}
const html = { headers: { accept: 'text/html' } };

test('Notice link queries share a single offline HTML shell', async () => {
    const sw = worker();
    for (let i = 0; i < 25; i++) assert.equal(await (await sw.request('/?notice=n' + i, html)).text(), 'network');
    const cache = [...sw.stores.entries()].find(([name]) => name.startsWith('volt-cache-'))[1];
    assert.equal(cache.size, 1);
    sw.setNetwork(async () => { throw new Error('offline'); });
    assert.equal(await (await sw.request('/?notice=unvisited', html)).text(), 'network');
    assert.equal((await sw.request('/guide/', html)).status, 503);
});

test('Error pages and redirects cannot replace a valid offline shell', async () => {
    const sw = worker();
    await sw.request('/', html);
    sw.setNetwork(async () => new Response('error', { status: 500 }));
    assert.equal((await sw.request('/', html)).status, 500);
    sw.setNetwork(async () => { const r = new Response('redirected'); Object.defineProperty(r, 'redirected', { value: true }); return r; });
    await sw.request('/', html);
    sw.setNetwork(async () => { throw new Error('offline'); });
    assert.equal(await (await sw.request('/', html)).text(), 'network');
});

test('Concurrent runtime writes stay bounded and preserve installed assets', async () => {
    const sw = worker();
    await sw.request('/', html);
    await Promise.all(Array.from({ length: 110 }, (_, i) => sw.request('/assets/image-' + i + '.webp')));
    const runtime = [...sw.stores.entries()].find(([name]) => name.startsWith('volt-runtime-'))[1];
    assert.equal(runtime.size, 80);
    assert.equal([...sw.stores.entries()].find(([name]) => name.startsWith('volt-cache-'))[1].size, 1);
    sw.setNetwork(async () => { throw new Error('offline'); });
    assert.equal(await (await sw.request('/assets/image-109.webp')).text(), 'network');
});

test('Cache quota failures preserve successful network responses', async () => {
    const sw = worker(); sw.failWrites();
    assert.equal(await (await sw.request('/', html)).text(), 'network');
    assert.equal(await (await sw.request('/js/main.js')).text(), 'network');
});

test('Private responses, API, admin, canonical, cross-origin and Range requests bypass storage', async () => {
    const sw = worker();
    for (const path of ['/api/ai/chat', '/auth/me', '/admin/', '/admin/index.html', '/data/canonical/manifest.json', 'https://example.com/a.js']) {
        assert.equal(await sw.request(path, html), undefined);
    }
    assert.equal(await sw.request('/data/ship-live-stats.js', { headers: { range: 'bytes=0-100' } }), undefined);
    sw.setNetwork(async () => new Response('private', { headers: { 'cache-control': 'private, no-store' } }));
    await sw.request('/data/example.json');
    assert.equal([...sw.stores.values()].reduce((sum, rows) => sum + rows.size, 0), 0);
});

test('Activation deletes only old VOLT caches', async () => {
    const sw = worker();
    await sw.caches.open('other-app-cache'); await sw.caches.open('volt-cache-old'); await sw.caches.open('volt-runtime-old');
    await sw.request('/', html); await sw.request('/js/main.js');
    await sw.activate();
    assert.ok(sw.stores.has('other-app-cache'));
    assert.ok(!sw.stores.has('volt-cache-old'));
    assert.ok(!sw.stores.has('volt-runtime-old'));
    assert.equal(sw.stores.size, 3);
});
