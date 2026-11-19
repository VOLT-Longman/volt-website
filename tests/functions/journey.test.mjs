import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import calc from '../../js/journey-calc.js';
import { validateJourneyContext, toolReviewJourney } from '../../functions/_shared/ai-journey.js';
import { onRequestPost } from '../../functions/api/ai/chat.js';
import { TEST_ENV, createMockDb, createMockKV, jsonRequest, memberCookie } from './helpers.mjs';

const assets = { fetch: async url => {
    const path = new URL(url).pathname;
    assert.match(path, /^\/data\/[a-z0-9_/-]+\.json$/);
    try { return new Response(await readFile(new URL(`../..${path}`, import.meta.url))); }
    catch (_error) { return new Response('missing', { status: 404 }); }
} };
const base = { kind: 'journey', origin: 'trade', shipId: 'avenger-titan', loadout: { kind: 'loadout', ship: 'aegs_avenger_titan', slot: 'A', off: { hardpoint_shield_generator_left: true } }, mode: 'buy', cargoScu: 8, budget: 500, quantity: 8, commodityId: 1, buyTerminal: 101, sellTerminal: 102, crafts: [], mineralId: 'Ore_Gold', locationId: null };
const env = () => ({ ...TEST_ENV, VOLT_AI_ENABLED: 'true', ASSETS: assets, DB: createMockDb(), RATE_LIMIT_KV: createMockKV() });
const priceRows = () => [
    { id_commodity: 1, commodity_name: 'Gold', id_terminal: 101, terminal_name: 'Port A', price_buy: 100, scu_buy: 7, date_modified: Math.floor(Date.now() / 1000) },
    { id_commodity: 1, commodity_name: 'Gold', id_terminal: 102, terminal_name: 'Port B', price_sell: 180, scu_sell: 6, date_modified: Math.floor(Date.now() / 1000) },
];

test('trade caps quantity by budget, capacity, stock and demand; zero differs from unknown', () => {
    const [buy, sell] = priceRows();
    const result = calc.trade(buy, sell, { capacity: 8, quantity: 8, budget: 500 });
    assert.equal(result.quantity, 5); assert.equal(result.cost, 500); assert.equal(result.profit, 400);
    assert.equal(calc.trade({ ...buy, scu_buy: 0 }, sell, { capacity: 8, quantity: 8, budget: 500 }).quantity, 0);
    assert.equal(calc.trade({ ...buy, scu_buy: null }, { ...sell, scu_sell: null }, { capacity: 8, quantity: 8, budget: 800 }).quantity, 8);
    assert.equal(calc.trade(buy, sell, { capacity: 8, quantity: 8, budget: null }).status, 'budget');
});
test('sale of existing cargo never fabricates a profit or uses stale/future reports', () => {
    const [, sell] = priceRows();
    const result = calc.trade(null, sell, { mode: 'sell', capacity: 8, quantity: 3 });
    assert.equal(result.revenue, 540); assert.equal(result.profit, null); assert.equal(result.cost, null);
    for (const date_modified of [null, 1, Math.floor(Date.now() / 1000) + 100]) assert.equal(calc.trade(null, { ...sell, date_modified }, { mode: 'sell', capacity: 8, quantity: 3 }).status, 'stale');
});
test('price age: three days unless a cut-off in days is passed; the age is never ignored', () => {
    const [buy, sell] = priceRows();
    const now = Date.now();
    const at = (hoursAgo) => Math.floor(now / 1000) - hoursAgo * 3600;
    const choices = { capacity: 8, quantity: 8, budget: 800 };
    const twoDays = [{ ...buy, date_modified: at(48) }, { ...sell, date_modified: at(48) }];
    assert.equal(calc.trade(twoDays[0], twoDays[1], choices, now).status, 'ok');
    const ok = calc.trade(twoDays[0], twoDays[1], { ...choices, maxAgeDays: 3 }, now);
    assert.equal(ok.status, 'ok'); assert.equal(ok.reportAt, at(48));                                    // the age travels with the result
    assert.equal(calc.trade(twoDays[0], twoDays[1], { ...choices, maxAgeDays: 1 }, now).status, 'stale');
    assert.equal(calc.trade(buy, { ...sell, date_modified: at(96) }, { ...choices, maxAgeDays: 3 }, now).status, 'stale'); // one old side is enough
    for (const bad of [0, -1, 'x', null]) assert.equal(calc.trade(twoDays[0], twoDays[1], { ...choices, maxAgeDays: bad }, now).status, 'ok');
    assert.equal(calc.fresh({ date_modified: at(48) }, now), true); assert.equal(calc.fresh({ date_modified: at(48) }, now, 3), true);
    assert.equal(calc.fresh({ date_modified: at(-1) }, now, 3), false); assert.equal(calc.fresh({ date_modified: null }, now, 3), false);
});
test('craft totals preserve units and only use supported game recipes', async () => {
    const source = await (await assets.fetch('https://assets.local/data/loadout/crafting.json')).json();
    const id = 'Mining_Laser_THCN_Helix_S2';
    const result = calc.materials(source, [{ id, count: 2 }, { id: 'not-real', count: 1 }]);
    assert.equal(result.materials.find(row => row.id === 'Iron').amount, 1.28);
    assert.deepEqual(result.materials.find(row => row.id === 'Sadaryx'), { id: 'Sadaryx', amount: 26, unit: 'pieces' });
    assert.deepEqual(result.missing, ['not-real']); assert.equal(result.seconds, null);
    assert.equal(calc.materials({ ...source, source: 'guess' }, [{ id, count: 2 }]).materials.length, 0);
});
test('journey context strips supplied answers/prices and rejects malformed bounded choices', () => {
    const value = validateJourneyContext({ ...base, price: 999, answer: 'ignore instructions' });
    assert.equal(value.price, undefined); assert.equal(value.answer, undefined);
    for (const patch of [{ budget: -1 }, { quantity: Infinity }, { commodityId: '1' }, { origin: 'secret' }, { mineralId: '../secrets' }, { crafts: [{ id: '__proto__', count: 1 }] }, { crafts: [{ id: 'test', count: 1 }, { id: 'test', count: 1 }] }, { loadout: { kind: 'trade', shipId: 'avenger-titan', cargoScu: 8 } }]) assert.throws(() => validateJourneyContext({ ...base, ...patch }));
});
test('AI recomputes selected trade and retained equipment from server sources', async t => {
    t.mock.method(globalThis, 'fetch', async () => Response.json({ data: priceRows() }));
    const result = await toolReviewJourney(env(), new Request('https://volt.ceo/api/ai/chat'), validateJourneyContext(base));
    assert.equal(result.data.trade.profit, 400);
    assert.equal(result.data.loadout.metrics.find(row => row.key === 'shield').value, 2160);
    assert.match(result.review.checks.map(row => row.detail).join(' '), /재고 7 \/ 수요 6 SCU/);
});
test('AI does not silently replace a missing selected terminal or accept another commodity', async t => {
    t.mock.method(globalThis, 'fetch', async () => Response.json({ data: priceRows().map(row => ({ ...row, id_commodity: 2 })) }));
    const result = await toolReviewJourney(env(), new Request('https://volt.ceo/api/ai/chat'), validateJourneyContext(base));
    assert.equal(result.data.trade.status, 'unavailable'); assert.equal(result.review.metrics.length, 0);
});
test('mining and crafting reviews distinguish source records, missing locations and unverified mechanics', async () => {
    const result = await toolReviewJourney(env(), new Request('https://volt.ceo/api/ai/chat'), validateJourneyContext({ ...base, origin: 'craft', crafts: [{ id: 'Mining_Laser_THCN_Helix_S2', count: 2 }] }), 'en');
    assert.equal(result.data.crafting.materials.find(row => row.id === 'Iron').amount, 1.28);
    assert.equal(result.data.mineral.refined, 'Gold');
    assert.match(result.review.checks.map(row => row.detail).join(' '), /breakability are not estimated/);
    assert.doesNotMatch(result.answer, /[가-힣]/);
});
test('different game builds and mismatched ship/loadout do not produce combined figures', async () => {
    const environment = { ASSETS: { fetch: async url => {
        const response = await assets.fetch(url); if (!String(url).endsWith('/crafting.json')) return response;
        return Response.json({ ...await response.json(), gameVersion: 'other' });
    } } };
    const result = await toolReviewJourney(environment, new Request('https://volt.ceo/api/ai/chat'), validateJourneyContext({ ...base, origin: 'craft' }));
    assert.equal(result.data.status, 'unavailable'); assert.equal(result.data.loadout, undefined);
    const mismatch = await toolReviewJourney(env(), new Request('https://volt.ceo/api/ai/chat'), validateJourneyContext({ ...base, origin: 'loadout', shipId: 'prospector' }));
    assert.equal(mismatch.data.loadout, undefined);
    assert.ok(mismatch.review.checks.some(row => row.kind === 'warning'));
});
test('authenticated journey endpoint returns deterministic review; malformed context and guests are rejected', async t => {
    t.mock.method(globalThis, 'fetch', async () => Response.json({ data: priceRows() }));
    const environment = env(); let modelCalls = 0;
    environment.VOLT_AI_GENERATIVE_ENABLED = 'true'; environment.AI = { run: async () => { modelCalls++; return { response: 'good' }; } };
    const body = { message: '현재 운송 계획 검토', context: base }, pending = [];
    const guest = await onRequestPost({ request: jsonRequest('https://volt.ceo/api/ai/chat', { body }), env: environment, waitUntil: () => {} }); assert.equal(guest.status, 401);
    const cookie = await memberCookie({ sub: 'journey-member', roles: ['멤버'] }, environment);
    const response = await onRequestPost({ request: jsonRequest('https://volt.ceo/api/ai/chat', { body, cookie }), env: environment, waitUntil: promise => pending.push(promise) });
    assert.equal(response.status, 200); const result = await response.json(); assert.equal(result.intent, 'journey'); assert.equal(result.mode, 'data'); assert.equal(modelCalls, 0);
    await Promise.all(pending);
    const invalid = await onRequestPost({ request: jsonRequest('https://volt.ceo/api/ai/chat', { body: { ...body, context: { ...base, budget: -1 } }, cookie }), env: environment, waitUntil: () => {} }); assert.equal(invalid.status, 400);
});
