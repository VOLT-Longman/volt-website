import test from 'node:test';
import assert from 'node:assert/strict';
import { buildShipPrices, onRequestGet } from '../../functions/api/uex/ship-prices.js';

test('ship sellers keep variants separate, prefer the latest report and reject unavailable or invalid offers', () => {
  const vehicles = [{ id: 1, uuid: 'ABC', name_full: 'Aegis Avenger Titan' }, { id: 2, name_full: 'Aegis Avenger Titan Renegade' }, { id: 3, name_full: 'Future', is_concept: 1 }, null];
  const terminals = [{ id: 10, name: 'New Deal', city_name: 'Lorville', star_system_name: 'Stanton', is_available_live: 1 }, { id: 11, is_available_live: 0 }, null];
  const prices = [
    { id_vehicle: 1, id_terminal: 10, price_buy: 100, date_modified: 1 },
    { id_vehicle: 1, id_terminal: 10, price_buy: 120, date_modified: 2 },
    { id_vehicle: 1, id_terminal: 11, price_buy: 90 },
    { id_vehicle: 1, id_terminal: 99, price_buy: 80 },
    ...[0, -1, 'NaN', Infinity].map(price_buy => ({ id_vehicle: 2, id_terminal: 10, price_buy })), null,
  ];
  const catalog = buildShipPrices(vehicles, prices, terminals);
  assert.equal(catalog.length, 2);
  assert.equal(catalog[0].uuid, 'abc');
  assert.deepEqual(catalog[0].shops, [{ terminalId: 10, shop: 'New Deal', place: 'Lorville', system: 'Stanton', price: 120, updatedAt: 2 }]);
  assert.deepEqual(catalog[1].shops, []);
});

test('one shared ship catalog cache ignores arbitrary query parameters', async () => {
  const original = { fetch: globalThis.fetch, caches: globalThis.caches };
  const store = new Map(); const calls = [];
  globalThis.caches = { default: { match: async key => store.get(key.url)?.clone(), put: async (key, response) => { store.set(key.url, response); } } };
  globalThis.fetch = async url => { calls.push(url); return new Response(JSON.stringify({ status: 'ok', data: [] })); };
  try {
    for (const query of ['', '?ship=anything', '?refresh=1&x=2']) {
      const pending = [];
      const response = await onRequestGet({ request: new Request('https://volt.test/api/uex/ship-prices' + query), env: {}, waitUntil: p => pending.push(p) });
      assert.equal(response.status, 200);
      assert.equal((await response.json()).meta.source, 'uex');
      await Promise.all(pending);
    }
    assert.equal(calls.length, 3);
    assert.equal(store.size, 1);
    assert.ok(calls.every(url => !url.includes('?')));
  } finally { globalThis.fetch = original.fetch; globalThis.caches = original.caches; }
});

test('failed or malformed upstream data is not cached as an empty seller catalog', async () => {
  const original = { fetch: globalThis.fetch, caches: globalThis.caches };
  let stored = false;
  globalThis.caches = { default: { match: async () => null, put: async () => { stored = true; } } };
  try {
    for (const malformed of [false, true]) {
      globalThis.fetch = async () => new Response(JSON.stringify(malformed ? { status: 'ok', data: {} } : { error: 'unavailable' }), { status: malformed ? 200 : 503 });
      const response = await onRequestGet({ request: new Request('https://volt.test/api/uex/ship-prices'), env: {}, waitUntil: () => {} });
      assert.equal(response.status, 503);
      assert.equal(stored, false);
    }
  } finally { globalThis.fetch = original.fetch; globalThis.caches = original.caches; }
});
