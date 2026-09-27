import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createSqliteDb } from './sqlite-d1.mjs';
import { TEST_ENV, memberCookie, adminCookie, jsonRequest } from './helpers.mjs';
import { reserveAiUsage } from '../../functions/_shared/security-store.js';
import { readUserSession, revokeUserSession } from '../../functions/_shared/discord-auth.js';
import { requireMember } from '../../functions/_shared/rbac.js';
import { onRequest as rsvp } from '../../functions/api/events/[id]/rsvp.js';
import { onRequestGet as myRsvps } from '../../functions/api/me/rsvps.js';
import { onRequest as preferences } from '../../functions/api/me/preferences.js';
import { loadShipLayers, matchShipIds, resetShipCacheForTests } from '../../functions/_shared/ai-tools.js';

function database() {
  const db = createSqliteDb();
  for (const file of readdirSync(new URL('../../migrations/', import.meta.url)).filter((name) => name.endsWith('.sql')).sort()) {
    db.sqlite.exec(readFileSync(new URL(`../../migrations/${file}`, import.meta.url), 'utf8'));
  }
  return db;
}
const member = { sub: 'audit-member', username: 'tester', roles: ['member'] };
const requestFor = (cookie) => new Request('https://volt.ceo/auth/me', { headers: { Cookie: cookie } });

test('A2: daily/monthly AI reservations are atomic across parallel callers and date rollover', async () => {
  const env = { DB: createSqliteDb() };
  const config = { dailyLimit: 2, estCostPerReq: 3, costCapDay: 6, costCapMonth: 9 };
  const reserve = (day, month) => reserveAiUsage(env, { day, month }, config);
  const first = await Promise.all(Array.from({ length: 20 }, () => reserve('20260927', '202609')));
  assert.equal(first.filter(Boolean).length, 2);
  const nextDay = await Promise.all(Array.from({ length: 20 }, () => reserve('20260928', '202609')));
  assert.equal(nextDay.filter(Boolean).length, 1);
  assert.equal((await reserve('20261001', '202610')).day_count, 1);
  assert.equal(await reserve('20260927', '202609'), null, 'a delayed old-period reservation cannot reset newer counters');
  assert.equal(await reserveAiUsage({ DB: createSqliteDb() }, { day: 'd', month: 'm' }, { ...config, costCapDay: 1 }), null);
});

test('A7: revoked Discord role is rejected after five minutes; tokens stay encrypted; logout revokes', async (t) => {
  const env = { ...TEST_ENV, DB: createSqliteDb() };
  const cookie = await memberCookie(member, env);
  assert.equal((await readUserSession(requestFor(cookie), env)).sub, member.sub);
  const stored = await env.DB.prepare('SELECT * FROM security_sessions').first();
  assert.ok(!stored.token.includes('test-oauth-token'));
  assert.ok(!cookie.includes('test-oauth-token'));
  await env.DB.prepare('UPDATE security_sessions SET checked_at = ?').bind(Date.now() - 301000).run();
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  globalThis.fetch = async (_url, options) => {
    assert.equal(options.headers.Authorization, 'Bearer test-oauth-token');
    return Response.json({ roles: [] });
  };
  assert.equal((await requireMember(requestFor(cookie), env)).status, 403);
  await revokeUserSession(requestFor(cookie), env);
  assert.equal(await readUserSession(requestFor(cookie), env), null);
});

test('A7: membership verification outage fails closed and mapping revocations apply immediately', async (t) => {
  const env = { ...TEST_ENV, DB: createSqliteDb() };
  const cookie = await memberCookie(member, env);
  assert.equal((await requireMember(requestFor(cookie), { ...env, DISCORD_ROLE_MAP: '{}' })).status, 403);
  await env.DB.prepare('UPDATE security_sessions SET checked_at = 0').run();
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  globalThis.fetch = async () => new Response('unavailable', { status: 503 });
  assert.equal((await requireMember(requestFor(cookie), env)).status, 503);
  globalThis.fetch = async () => new Response('not a member', { status: 404 });
  assert.equal((await requireMember(requestFor(cookie), env)).status, 403);
});

test('A10: unpublished events cannot be read, RSVP-written, or disclosed in personal RSVPs', async () => {
  const env = { ...TEST_ENV, DB: database() };
  env.DB.sqlite.exec("INSERT INTO events (id,title,published) VALUES ('hidden','Secret event',0); INSERT INTO event_rsvps (id,event_id,user_sub,status) VALUES ('r','hidden','audit-member','참가')");
  const cookie = await memberCookie(member, env);
  for (const method of ['GET', 'POST']) {
    const request = jsonRequest('https://volt.ceo/api/events/hidden/rsvp', { method, cookie, body: method === 'POST' ? { status: '불참' } : undefined });
    assert.equal((await rsvp({ request, env, params: { id: 'hidden' } })).status, 404);
  }
  assert.deepEqual((await (await myRsvps({ request: requestFor(cookie), env })).json()).items, []);
  assert.equal((await env.DB.prepare("SELECT status FROM event_rsvps WHERE id = 'r'").first()).status, '참가');
});

test('A1: pending save from another account cannot overwrite the current session', async () => {
  const env = { ...TEST_ENV, DB: database() };
  const cookie = await memberCookie(member, env);
  const response = await preferences({ env, request: jsonRequest('https://volt.ceo/api/me/preferences', {
    method: 'PUT', cookie, body: { account: 'previous-account', favorites: ['asgard'] }
  }) });
  assert.equal(response.status, 409);
  assert.equal((await env.DB.prepare('SELECT count(*) AS n FROM user_preferences').first()).n, 0);
});

test('A11: official Korean aliases match and variant names do not imply their base ship', async () => {
  resetShipCacheForTests();
  const { ships } = await loadShipLayers({ ASSETS: { async fetch(url) {
    return new Response(readFileSync(new URL(`../..${new URL(url).pathname}`, import.meta.url), 'utf8'));
  } } });
  assert.deepEqual(matchShipIds(ships, '아스가르드 설명'), ['asgard']);
  assert.deepEqual(matchShipIds(ships, '커터 설명'), ['cutter']);
  assert.deepEqual(matchShipIds(ships, 'Freelancer MAX'), ['freelancer-max']);
  assert.deepEqual(matchShipIds(ships, '프리랜서 맥스'), ['freelancer-max']);
  assert.deepEqual(matchShipIds(ships, 'Freelancer MAX와 Freelancer 비교'), ['freelancer-max', 'freelancer']);
});

const cases = [
  ['notices', 'notices', { title: 'Changed', content: 'body' }, "INSERT INTO notices (id,title,content,updated_at) VALUES ('race','Old','body','v1')"],
  ['events', 'events', { title: 'Changed' }, "INSERT INTO events (id,title,updated_at) VALUES ('race','Old','v1')"],
  ['gallery', 'gallery_items', { title: 'Changed', imageUrl: 'https://example.com/image.png' }, "INSERT INTO gallery_items (id,title,image_url,updated_at) VALUES ('race','Old','https://example.com/image.png','v1')"],
  ['leadership', 'leadership_members', { name: 'Changed' }, "INSERT INTO leadership_members (id,name,updated_at) VALUES ('race','Old','v1')"],
  ['timeline', 'timeline_entries', { title: 'Changed', dateLabel: '2026' }, "INSERT INTO timeline_entries (id,title,date_label,updated_at) VALUES ('race','Old','2026','v1')"],
  ['partner-fleets', 'partner_fleets', { name: 'Changed' }, "INSERT INTO partner_fleets (id,name,updated_at) VALUES ('race','Old','v1')"],
  ['ships', 'ship_overrides', { name: 'Changed' }, "INSERT INTO ship_overrides (id,ship_id,updated_at) VALUES ('ship-race','race','v1')"]
];
for (const [collection, table, body, seed] of cases) {
  test(`A9: ${collection} concurrent stale saves yield one 200 and one 409 using real SQL`, async () => {
    const db = database();
    db.sqlite.exec(seed);
    const prepare = db.prepare.bind(db);
    let reads = 0;
    let release;
    const barrier = new Promise((resolve) => { release = resolve; });
    db.prepare = (sql) => {
      const statement = prepare(sql);
      if (sql.startsWith('SELECT ') && sql.includes(`FROM ${table} WHERE`)) {
        const first = statement.first;
        statement.first = async () => {
          const row = await first();
          reads += 1;
          if (reads === 2) release();
          await barrier;
          return row;
        };
      }
      return statement;
    };
    const env = { ...TEST_ENV, DB: db };
    const cookie = await adminCookie(env);
    const { onRequest } = await import(`../../functions/api/admin/${collection}/[id].js`);
    const responses = await Promise.all([1, 2].map(() => onRequest({ env, params: { id: 'race' },
      request: jsonRequest(`https://volt.ceo/api/admin/${collection}/race`, { method: 'PUT', cookie, body: { ...body, expectedUpdatedAt: 'v1' } })
    })));
    assert.deepEqual(responses.map((response) => response.status).sort(), [200, 409]);
  });
}
