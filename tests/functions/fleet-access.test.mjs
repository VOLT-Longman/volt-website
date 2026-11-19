import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fleetAccess } from '../../functions/_shared/fleet-access.js';
import { onRequest } from '../../functions/_middleware.js';
import { onRequestGet as me } from '../../functions/auth/me.js';
import { createOAuthReturnCookie, readOAuthReturnPath } from '../../functions/_shared/discord-auth.js';
import { TEST_ENV, memberCookie } from './helpers.mjs';
import { createSqliteDb } from './sqlite-d1.mjs';

const FLEET = '1120508650520330310';
const COMMUNITY = '1150059971887771718';
const index = JSON.parse(readFileSync(new URL('../../data/gear/models.json', import.meta.url)));
const asset = '/assets/models/gear/weapons/behr_rifle_ballistic_01/body_lod1.glb';
const helpers = ['/data/mining/helper.json', '/data/contracts/hauling.json', '/data/contracts/missions.json', '/data/crafting/blueprints.json', '/data/trade/world.json', '/data/trade/cargo.json',
  ...['market', 'terminals', 'refineries', 'vehicle-prices', 'price-history'].map((name) => '/api/uex/' + name)];
const paths = ['/data/gear/models.json', '/data/gear/attachments.json', asset, '/assets/models/gear/tex/example.webp'];
const environment = () => ({ ...TEST_ENV, DB: createSqliteDb(), COMMUNITY_TOOLS_REQUIRE_MEMBERSHIP: 'false', DISCORD_ROLE_MAP: JSON.stringify({ [FLEET]: 'VOLT 함대원', [COMMUNITY]: '커뮤니티 멤버', admin: '대표이사' }) });
const request = (path, cookie = '', method = 'GET', origin = 'https://www.volt.ceo') => new Request(origin + path, { method, headers: { Cookie: cookie } });
async function invoke(env, path, cookie = '', method = 'GET', origin) {
  let calls = 0;
  const response = await onRequest({ env, request: request(path, cookie, method, origin), next: async () => {
    calls++; return new Response(method === 'HEAD' ? null : 'metadata', { headers: { 'Cache-Control': 'public, max-age=31536000, immutable', Vary: 'Accept-Encoding' } });
  } });
  return { response, calls };
}
const cacheHeaders = (response) => {
  assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
  assert.equal(response.headers.get('CDN-Cache-Control'), 'no-store');
  assert.equal(response.headers.get('Cloudflare-CDN-Cache-Control'), 'no-store');
  assert.match(response.headers.get('Vary'), /\bCookie\b/);
};

test('Fleet role is exact, separate, defaulted and overridable; labels/admin/public switch never grant it', () => {
  for (const roles of [[], [COMMUNITY], ['admin'], ['VOLT 함대원']]) assert.equal(fleetAccess(roles).allowed, false);
  assert.deepEqual(fleetAccess([FLEET]), { configured: true, allowed: true });
  assert.equal(fleetAccess([FLEET], { DISCORD_FLEET_ROLE_ID: 'replacement' }).allowed, false);
  assert.equal(fleetAccess(['replacement'], { DISCORD_FLEET_ROLE_ID: 'replacement' }).allowed, true);
  assert.deepEqual(fleetAccess([FLEET], { DISCORD_FLEET_ROLE_ID: ' ' }), { configured: false, allowed: false });
});

test('Fleet resources deny anonymous, community-only and administrators for GET/HEAD before assets or R2', async () => {
  const env = environment();
  env.FLEET_GEAR_MODELS = { get: () => assert.fail('Unauthorized R2 read'), head: () => assert.fail('Unauthorized R2 HEAD') };
  const community = await memberCookie({ sub: 'community-only', roles: [COMMUNITY] }, env);
  const admin = await memberCookie({ sub: 'admin-only', roles: ['admin'] }, env);
  for (const path of [...paths, ...helpers]) for (const method of ['GET', 'HEAD']) for (const [cookie, status] of [['', 401], [community, 403], [admin, 403]]) {
    const result = await invoke(env, path, cookie, method);
    assert.equal(result.response.status, status, `${method} ${path}`); assert.equal(result.calls, 0); cacheHeaders(result.response);
  }
});

test('Authorized metadata overrides public static headers; models come only from versioned private R2', async () => {
  const env = environment(); const cookie = await memberCookie({ sub: 'fleet', roles: [FLEET] }, env);
  for (const path of helpers) {
    const result = await invoke(env, path, cookie);
    assert.equal(result.response.status, 200); assert.equal(result.calls, 1); cacheHeaders(result.response);
  }
  const keys = [];
  const object = { size: 4, body: 'GLTF', httpEtag: '"test"', customMetadata: { assetversion: index.assetVersion } };
  env.FLEET_GEAR_MODELS = { get: async (key) => { keys.push(key); return object; }, head: async (key) => { keys.push(key); return object; } };
  for (const path of paths.slice(0, 3)) for (const method of ['GET', 'HEAD']) {
    const result = await invoke(env, path, cookie, method);
    assert.equal(result.response.status, 200); cacheHeaders(result.response);
    assert.equal(result.calls, path.startsWith('/data/') ? 1 : 0);
    if (path === asset) { assert.equal(result.response.headers.get('Content-Type'), 'model/gltf-binary'); assert.equal(await result.response.text(), method === 'HEAD' ? '' : 'GLTF'); }
  }
  assert.ok(keys.every((key) => key === `${index.assetVersion}/weapons/behr_rifle_ballistic_01/body_lod1.glb`));
  assert.equal((await invoke(env, asset + '?v=other', cookie)).response.status, 404);
  assert.equal((await invoke(env, '/assets/models/gear/_release.json', cookie)).response.status, 404);
  assert.equal((await invoke(env, paths[0], cookie, 'GET', 'https://branch.volt-ceo.pages.dev')).response.headers.get('X-Robots-Tag'), 'noindex');
  assert.equal((await invoke(env, asset, '', 'HEAD', 'https://hash.volt-ceo.pages.dev')).response.status, 401);
});

test('Unavailable, wrong-version or failing storage never falls through to public static models', async () => {
  const env = environment(); const cookie = await memberCookie({ sub: 'fleet', roles: [FLEET] }, env);
  for (const [bucket, status] of [[undefined, 503], [{ get: async () => null }, 404], [{ get: async () => ({ customMetadata: { assetversion: 'wrong' } }) }, 404], [{ get: async () => { throw new Error('storage down'); } }, 503]]) {
    env.FLEET_GEAR_MODELS = bucket; const result = await invoke(env, asset, cookie);
    assert.equal(result.response.status, status); assert.equal(result.calls, 0); cacheHeaders(result.response);
  }
  assert.equal((await invoke({ ...env, DISCORD_FLEET_ROLE_ID: '' }, paths[0], cookie)).response.status, 503);
  assert.equal((await invoke({ ...env, DISCORD_FLEET_ROLE_ID: 'new' }, paths[0], cookie)).response.status, 403);
});

test('Encoded and normalized aliases go through the same fleet gate; nested encoding fails closed', async () => {
  const env = environment();
  const aliases = ['/data//gear/models.json', '/data/%67ear/attachments.json', '/data%2fgear%2fmodels.json', '//assets/models/gear/tex/example.webp', '/assets/%6dodels/gear/tex/example.webp', '/public%2f..%2fdata%2fgear%2fmodels.json', '/assets%5cmodels%5cgear%5ctex%5cexample.webp'];
  for (const path of aliases) for (const method of ['GET', 'HEAD']) { const result = await invoke(env, path, '', method); assert.equal(result.response.status, 401, path); assert.equal(result.calls, 0); }
  for (const path of ['/data/%2567ear/models.json', '/assets/models/gear/%00.glb', '/assets/models/gear/%ZZ']) {
    const result = await invoke(env, path); assert.equal(result.response.status, 400); assert.equal(result.calls, 0);
  }
});

test('/auth/me exposes only verified fleet feature; role removal and Discord outage fail closed', async (t) => {
  const env = environment(); const cookie = await memberCookie({ sub: 'fleet-user', roles: [FLEET] }, env);
  const getMe = () => me({ env, request: request('/auth/me?refresh=1', cookie) });
  const body = await (await getMe()).json(); assert.equal(body.features.gunModding, true); assert.equal(body.user.fleetAccess, undefined);
  assert.equal((await (await me({ env, request: request('/auth/me') })).json()).features.gunModding, false);
  const original = globalThis.fetch; t.after(() => { globalThis.fetch = original; });
  const expire = () => env.DB.prepare('UPDATE security_sessions SET checked_at = ?').bind(Date.now() - 6000).run();
  await expire(); globalThis.fetch = async () => Response.json({ roles: [COMMUNITY] });
  assert.equal((await (await getMe()).json()).features.gunModding, false);
  assert.equal((await invoke(env, paths[0], cookie)).response.status, 403);
  await expire(); globalThis.fetch = async () => new Response('', { status: 503 });
  assert.equal((await getMe()).status, 503); assert.equal((await invoke(env, asset, cookie)).response.status, 503);
  globalThis.fetch = async () => new Response('', { status: 401 });
  assert.equal((await invoke(env, asset, cookie)).response.status, 401);
});

test('Only bounded local gear combinations survive the login return cookie', () => {
  for (const path of ['/#gear', '/#gear?view=mod', '/#gear?mod=behr_rifle_ballistic_01&optics=-&barrel=arma_barrel_supp_s2&underbarrel=-']) {
    const cookie = createOAuthReturnCookie(path).split(';')[0]; assert.equal(readOAuthReturnPath(request('/auth/discord/callback', cookie)), path);
  }
  for (const path of ['https://evil.test/#gear', '/#gear?mod=a&redirect=https://evil.test', '/#gear?mod=../a', '/#gear?mod=a&mod=b', '/#gear?mod=%252f', '/#gear?mod=' + 'x'.repeat(501)]) {
    const cookie = createOAuthReturnCookie(path).split(';')[0]; assert.equal(readOAuthReturnPath(request('/auth/discord/callback', cookie)), '/');
  }
});
