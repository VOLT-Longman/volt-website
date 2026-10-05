import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { proxyUexJson } from '../../functions/_shared/uex-proxy.js';

function client(fetchImpl = async () => ({ ok: true, json: async () => ({ data: [] }) })) {
  const context = { window: {}, Date, AbortController, setTimeout, clearTimeout, fetch: fetchImpl };
  vm.runInNewContext(readFileSync(new URL('../../js/uex.js', import.meta.url), 'utf8'), context);
  context.window.VOLT_UEX.init({ getCargoTarget: () => 696 });
  return context.window.VOLT_UEX;
}

test('selected stale route cannot inherit a fresh unrelated report; unknown and future reports stay unknown', () => {
  const uex = client();
  const now = Math.floor(Date.now() / 1000);
  const rows = [
    { id_terminal: 1, price_buy: 10, date_modified: now - 86400 },
    { id_terminal: 2, price_sell: 20, date_modified: now - 43200 },
    { id_terminal: 3, price_buy: 30, price_sell: 5, date_modified: now }
  ];
  const model = uex.buildUexCandidateModel(rows);
  assert.equal(model.lastUpdated, now - 86400);
  assert.equal(uex.getStaleLevel(model.lastUpdated), 'danger');
  rows[0].date_modified = null;
  assert.equal(uex.buildUexCandidateModel(rows).lastUpdated, 0);
  assert.equal(uex.getStaleLevel(now + 100), 'unknown');
  assert.equal(uex.getStaleLevel('bad'), 'unknown');
});

test('reported stock and demand limit estimated profit; zero differs from unknown', () => {
  const uex = client();
  const rows = [{ price_buy: 24360, scu_buy: 21 }, { price_sell: 31000, scu_sell: 840 }];
  assert.equal(uex.buildUexCandidateModel(rows).estimatedProfit, 139440);
  rows[0].scu_buy = 0;
  assert.equal(uex.buildUexCandidateModel(rows).usableScu, 0);
  rows[0].scu_buy = null;
  rows[1].scu_sell = 10;
  assert.equal(uex.buildUexCandidateModel(rows).usableScu, 10);
  delete rows[1].scu_sell;
  assert.equal(uex.buildUexCandidateModel(rows).usableScu, 696);
});

test('explicit refresh bypasses client cache and requests canonical refresh path', async () => {
  const calls = [];
  const uex = client(async (url, init) => { calls.push({ url, init }); return { ok: true, json: async () => ({ data: [] }) }; });
  await uex.fetchUexData('commodities/33/prices', 1800000);
  await uex.fetchUexData('commodities/33/prices', 1800000);
  assert.equal(calls.length, 1);
  await uex.fetchUexData('commodities/33/prices', 1800000, { forceRefresh: true });
  assert.equal(calls[1].url, '/api/uex/commodities/33/prices?refresh=1');
  assert.equal(calls[1].init.cache, 'no-store');
});

test('server refresh shares cache key, accurately reports hits and honors one-minute upstream floor', async () => {
  const original = { fetch: globalThis.fetch, caches: globalThis.caches };
  let cached = new Response(JSON.stringify({ status: 'ok', data: [], meta: { fetchedAt: new Date().toISOString() } }));
  let calls = 0;
  globalThis.caches = { default: { match: async key => { assert.equal(new URL(key.url).search, ''); return cached; }, put: async (_key, response) => { cached = response; } } };
  globalThis.fetch = async () => { calls++; return new Response(JSON.stringify({ status: 'ok', data: [] })); };
  const pending = [];
  const context = { request: new Request('https://volt.test/api/uex/commodities/33/prices?refresh=1'), env: {}, waitUntil: promise => pending.push(promise) };
  try {
    const hit = await proxyUexJson(context, 'commodities_prices?id_commodity=33', 1800);
    assert.equal((await hit.json()).meta.cached, true);
    assert.equal(hit.headers.get('Cache-Control'), 'no-store');
    assert.equal(calls, 0);
    cached = new Response(JSON.stringify({ status: 'ok', data: [], meta: { fetchedAt: new Date(Date.now() - 120000).toISOString() } }));
    const fresh = await proxyUexJson(context, 'commodities_prices?id_commodity=33', 1800);
    assert.equal((await fresh.json()).meta.cached, false);
    assert.equal(calls, 1);
    await Promise.all(pending);
  } finally { globalThis.fetch = original.fetch; globalThis.caches = original.caches; }
});
