import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { communityAccess, communityToolsRequireMembership } from '../../functions/_shared/community-access.js';
import { onRequest } from '../../functions/_middleware.js';
import { onRequestGet as me } from '../../functions/auth/me.js';
import { createOAuthReturnCookie, readOAuthReturnPath } from '../../functions/_shared/discord-auth.js';
import { onRequest as adminSource } from '../../functions/api/admin/ship-source/[[file]].js';
import { TEST_ENV, memberCookie, adminCookie } from './helpers.mjs';
import { createSqliteDb } from './sqlite-d1.mjs';

const paths = ['/data/loadout/items.json', '/data/loadout/ships/anvl_asgard.json', '/data/loadout/meta.json', '/data/canonical/manifest.json', '/data/canonical/ships.canonical.json', '/data/ship-market.js', '/data/ship-live-stats.js', '/api/uex/commodities', '/api/uex/loadout-prices?categories=radars', '/api/uex/commodities/1/prices', '/api/uex/location-prices'];
const environment = () => ({ ...TEST_ENV, DB: createSqliteDb(), COMMUNITY_TOOLS_REQUIRE_MEMBERSHIP: 'true', DISCORD_COMMUNITY_ROLE_ID: 'community', DISCORD_ROLE_MAP: JSON.stringify({ community: '커뮤니티 멤버', visitor: '손님', admin: '대표이사' }) });
const request = (path, cookie = '', method = 'GET') => new Request(`https://volt.ceo${path}`, { method, headers: { Cookie: cookie } });
async function invoke(env, path, cookie = '', method = 'GET') {
  let calls = 0;
  const response = await onRequest({ env, request: request(path, cookie, method), next: async () => {
    calls++;
    return new Response('data', { headers: { 'Cache-Control': 'public, max-age=3600', Vary: 'Accept-Encoding' } });
  } });
  return { response, calls };
}

test('Community policy: exact configured role ID only; labels and administrators do not bypass it', () => {
  const env = environment();
  for (const roles of [[], ['visitor'], ['admin'], ['Community Member']]) assert.deepEqual(communityAccess(roles, env), { configured: true, allowed: false });
  assert.equal(communityAccess(['community'], env).allowed, true);
  assert.equal(communityAccess(['community'], { ...env, DISCORD_COMMUNITY_ROLE_ID: 'replacement' }).allowed, false);
  assert.equal(communityAccess(['replacement'], { ...env, DISCORD_COMMUNITY_ROLE_ID: 'replacement' }).allowed, true);
  assert.deepEqual(communityAccess(['community'], { DISCORD_ROLE_MAP: '{"community":"커뮤니티 멤버"}' }), { configured: true, allowed: false });
  assert.deepEqual(communityAccess(['community'], { DISCORD_COMMUNITY_ROLE_ID: '' }), { configured: false, allowed: false });
});

test('Temporary public mode opens tool data and APIs without a Discord session and retains no-store', async () => {
  const env = environment(); delete env.COMMUNITY_TOOLS_REQUIRE_MEMBERSHIP;
  assert.equal(communityToolsRequireMembership(env), false);
  assert.equal(communityToolsRequireMembership({ COMMUNITY_TOOLS_REQUIRE_MEMBERSHIP: 'false' }), false);
  for (const value of ['true', '', 'typo']) assert.equal(communityToolsRequireMembership({ COMMUNITY_TOOLS_REQUIRE_MEMBERSHIP: value }), true);
  for (const path of [...paths, '/data//loadout/items.json', '/d%61ta/ship-market.js']) {
    const { response, calls } = await invoke(env, path);
    assert.equal(response.status, 200, path); assert.equal(calls, 1);
    assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
  }
  const guest = await (await me({ env, request: request('/auth/me') })).json();
  assert.equal(guest.logged_in, false);
  assert.equal(guest.features.communityTools, true);
  assert.equal(guest.user, undefined);
  const visitor = await memberCookie({ sub: 'public-mode-visitor', roles: [] }, env);
  const signedIn = await (await me({ env, request: request('/auth/me', visitor) })).json();
  assert.equal(signedIn.features.communityTools, true);
  assert.deepEqual(signedIn.user.roles, []);
  env.COMMUNITY_TOOLS_REQUIRE_MEMBERSHIP = 'true';
  assert.equal((await invoke(env, paths[0])).response.status, 401);
  assert.equal((await invoke(env, paths[0], visitor)).response.status, 403);
  assert.equal((await (await me({ env, request: request('/auth/me') })).json()).features.communityTools, false);
});

test('Owner-confirmed default role opens protected routes and reports configured access without environment setup', async () => {
  const env = environment(); delete env.DISCORD_COMMUNITY_ROLE_ID;
  const role = '1150059971887771718';
  const cookie = await memberCookie({ sub: 'configured-community-member', roles: [role] }, env);
  const guest = await (await me({ env, request: request('/auth/me') })).json();
  assert.deepEqual(guest.features, { communityTools: false, communityConfigured: true, helperTools: true, gunModding: true, fleetConfigured: true });
  for (const path of paths) assert.equal((await invoke(env, path, cookie)).response.status, 200, path);
  const body = await (await me({ env, request: request('/auth/me', cookie) })).json();
  assert.equal(body.features.communityTools, true);
  assert.deepEqual(communityAccess([role], { DISCORD_COMMUNITY_ROLE_ID: 'replacement' }), { configured: true, allowed: false });
  assert.deepEqual(communityAccess([role], { DISCORD_COMMUNITY_ROLE_ID: ' ' }), { configured: false, allowed: false });
});

test('Every protected API/data route rejects guests and unrelated roles before reaching assets or cache', async () => {
  const env = environment();
  const wrongRole = await memberCookie({ sub: 'visitor', roles: ['visitor', 'admin'] }, env);
  for (const path of paths) for (const method of ['GET', 'HEAD']) for (const [cookie, status] of [['', 401], [wrongRole, 403]]) {
    const { response, calls } = await invoke(env, path, cookie, method);
    assert.equal(response.status, status, `${method} ${path}`);
    assert.equal(calls, 0);
    assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
  }
  assert.equal((await invoke(env, '/data/%6coadout/items.json')).response.status, 401);
});

test('Community member receives data with private/no-store even when the internal cache is shared', async () => {
  const env = environment();
  const cookie = await memberCookie({ sub: 'member', roles: ['community'] }, env);
  for (const path of paths) {
    const { response, calls } = await invoke(env, path, cookie);
    assert.equal(response.status, 200, path); assert.equal(calls, 1);
    assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
    assert.equal(response.headers.get('CDN-Cache-Control'), 'no-store');
    assert.equal(response.headers.get('Vary'), 'Accept-Encoding, Cookie');
    assert.equal(await response.text(), 'data');
  }
  assert.equal((await invoke({ ...env, DISCORD_COMMUNITY_ROLE_ID: 'other' }, paths[0], cookie)).response.status, 403);
  assert.equal((await invoke({ ...env, DISCORD_COMMUNITY_ROLE_ID: '' }, paths[0], cookie)).response.status, 503);
});

test('Public landing, CMS, translations and login remain outside the community gate', async () => {
  for (const path of ['/', '/guide/', '/auth/discord/login', '/auth/me', '/api/notices', '/api/discord-stats', '/data/volt-data.js', '/data/volt-localization.js']) {
    const { response, calls } = await invoke({}, path);
    assert.equal(response.status, 200, path); assert.equal(calls, 1);
  }
  const routes = JSON.parse(readFileSync(new URL('../../_routes.json', import.meta.url)));
  // A leading // or encoded root must not skip middleware before Pages resolves
  // the static asset. Public paths still pass through without a session lookup.
  assert.deepEqual(routes.include, ['/*']);
  assert.deepEqual(routes.exclude, []);
});

test('Static asset aliases cannot bypass membership or use a shared cache', async () => {
  const env = environment();
  const wrong = await memberCookie({ sub: 'alias-visitor', roles: ['visitor'] }, env);
  const allowed = await memberCookie({ sub: 'alias-member', roles: ['community'] }, env);
  const aliases = [
    '/data//loadout/items.json', '/data///loadout/index.json', '//data/loadout/index.json',
    '///data////canonical/ships-canonical.json', '/data//ship-live-stats.js', '/data///ship-market.js',
    '/%64ata/loadout/items.json', '/d%61ta/loadout/items.json', '/data/%6coadout/items.json',
    '/data%2floadout%2fitems.json', '/data/%5cloadout/items.json',
    '/public%2f..%2fdata%2floadout%2fitems.json', '/api//uex/loadout-prices',
    '/data//loadout/items.json?version=alias'
  ];
  for (const path of aliases) for (const method of ['GET', 'HEAD']) {
    for (const [cookie, status] of [['', 401], [wrong, 403]]) {
      const { response, calls } = await invoke(env, path, cookie, method);
      assert.equal(response.status, status, `${method} ${path}`);
      assert.equal(calls, 0, path);
      assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
    }
    const member = await invoke(env, path, allowed, method);
    assert.equal(member.calls, 1, path);
    assert.equal(member.response.headers.get('Cache-Control'), 'private, no-store');
  }
});

test('Malformed and recursively encoded paths fail closed before assets', async () => {
  for (const path of ['/data/%ZZ/loadout', '/data/%256coadout/items.json', '/%2564ata/loadout/items.json', '/data/%00/loadout/items.json', '/data/%3f/loadout/items.json']) {
    const { response, calls } = await invoke({}, path);
    assert.equal(response.status, 400, path); assert.equal(calls, 0, path);
    assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
  }
});

test('Auth response carries server-derived access, and refresh detects assignment, revocation, departure and outage', async (t) => {
  const env = environment();
  const cookie = await memberCookie({ sub: 'user', roles: ['visitor'] }, env);
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  const expireCheck = () => env.DB.prepare('UPDATE security_sessions SET checked_at = ?').bind(Date.now() - 6000).run();
  const getMe = () => me({ env, request: request('/auth/me?refresh=1', cookie) });
  let discordCalls = 0;
  globalThis.fetch = async (url) => {
    discordCalls++;
    assert.match(url, /users\/@me\/guilds\/test-guild\/member$/);
    return Response.json({ roles: ['community'] });
  };
  await expireCheck();
  const response = await getMe(); let body = await response.json();
  assert.equal(body.features.communityTools, true);
  assert.equal(body.features.communityConfigured, true);
  assert.equal(body.user.communityAccess, undefined);
  await getMe(); assert.equal(discordCalls, 1, 'Repeated clicks use the short refresh floor');
  await expireCheck(); globalThis.fetch = async () => Response.json({ roles: [] });
  body = await (await getMe()).json(); assert.equal(body.features.communityTools, false);
  await expireCheck(); globalThis.fetch = async () => new Response('', { status: 404 });
  body = await (await getMe()).json(); assert.equal(body.features.communityTools, false);
  await expireCheck(); globalThis.fetch = async () => new Response('', { status: 503 });
  assert.equal((await getMe()).status, 503);
  // The normal protected resource recheck also fails closed after its TTL.
  await env.DB.prepare('UPDATE security_sessions SET checked_at = ?').bind(Date.now() - 301000).run();
  assert.equal((await invoke(env, paths[0], cookie)).response.status, 503);
  globalThis.fetch = async () => new Response('', { status: 401 });
  body = await (await getMe()).json(); assert.equal(body.logged_in, false);
  assert.equal((await invoke(env, paths[0], cookie)).response.status, 401);
});

test('OAuth returns to the requested tool only through an explicit local allowlist', () => {
  for (const path of ['/#ships', '/#loadout', '/#trade-planner', '/admin/']) {
    const cookie = createOAuthReturnCookie(path).split(';')[0];
    assert.equal(readOAuthReturnPath(request('/auth/discord/callback', cookie)), path === '/admin/' ? '/admin/?discord=1' : path);
  }
  for (const path of ['https://evil.example', '//evil.example', '/#unknown', '/admin/?next=evil', '/%2f/evil.example']) {
    const cookie = createOAuthReturnCookie(path).split(';')[0];
    assert.equal(readOAuthReturnPath(request('/auth/discord/callback', cookie)), '/');
  }
});


test('CMS source keeps existing admin access without making admins exempt from the community gate', async () => {
  const env = environment();
  let calls = 0;
  env.ASSETS = { fetch: async (req) => { calls++; assert.match(req.url, /\/data\/(?:canonical\/shipdb-manifest.json|ship-market.js)$/); return new Response('source'); } };
  const admin = await adminCookie(env);
  const member = await memberCookie({ sub: 'community-user', roles: ['community'] }, env);
  const invokeSource = (cookie, file, method = 'GET') => adminSource({ env, request: request('/api/admin/ship-source/' + file, cookie, method), params: { file: file.split('/') } });
  assert.equal((await invokeSource('', 'ship-market.js')).status, 401);
  assert.equal((await invokeSource(member, 'ship-market.js')).status, 401);
  assert.equal(calls, 0);
  for (const file of ['ship-market.js', 'canonical/shipdb-manifest.json']) {
    const response = await invokeSource(admin, file);
    assert.equal(response.status, 200); assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
  }
  for (const file of ['loadout/items.json', '../../functions/_shared/auth.js', 'https://evil.example', 'canonical/unknown.json']) assert.equal((await invokeSource(admin, file)).status, 404);
  assert.equal(calls, 2);
  assert.equal((await invokeSource(admin, 'ship-market.js', 'POST')).status, 405);
  assert.equal((await invoke(env, '/data/ship-market.js', admin)).response.status, 401);
});
