import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { isFleetResource } from '../../functions/_shared/fleet-access.js';
import { onRequest } from '../../functions/_middleware.js';
import { starmapTextureVersion } from '../../functions/_shared/starmap-texture-version.js';
import { STARMAP_TEXTURE_FILE } from '../../functions/_shared/starmap-textures.js';
import { colourMapOf, textureKey } from '../../scripts/starmap/export-textures.mjs';
import { TEST_ENV, memberCookie } from './helpers.mjs';
import { createSqliteDb } from './sqlite-d1.mjs';

const FLEET = '1120508650520330310';
const COMMUNITY = '1150059971887771718';
const index = JSON.parse(readFileSync(new URL('../../data/starmap/textures.json', import.meta.url)));
const small = '/assets/models/starmap/tex/ui_sm_stanton_2_crusader_512.webp';
const large = '/assets/models/starmap/tex/ui_sm_stanton_2_crusader_1k.webp';
const metadata = '/data/starmap/textures.json';
const environment = () => ({ ...TEST_ENV, DB: createSqliteDb(), COMMUNITY_TOOLS_REQUIRE_MEMBERSHIP: 'false', DISCORD_ROLE_MAP: JSON.stringify({ [FLEET]: 'VOLT 함대원', [COMMUNITY]: '커뮤니티 멤버', admin: '대표이사' }) });
async function invoke(env, path, cookie = '', method = 'GET', origin = 'https://www.volt.ceo') {
  let calls = 0;
  const response = await onRequest({ env, request: new Request(origin + path, { method, headers: { Cookie: cookie } }), next: async () => {
    calls++; return new Response(method === 'HEAD' ? null : 'static', { headers: { 'Cache-Control': 'public, max-age=31536000, immutable', Vary: 'Accept-Encoding' } });
  } });
  return { response, calls };
}
const cacheHeaders = (response) => {
  assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
  assert.equal(response.headers.get('CDN-Cache-Control'), 'no-store');
  assert.equal(response.headers.get('Cloudflare-CDN-Cache-Control'), 'no-store');
  assert.match(response.headers.get('Vary'), /\bCookie\b/);
};
const bucket = (keys, version = starmapTextureVersion) => {
  const object = { size: 4, body: 'WEBP', httpEtag: '"starmap"', customMetadata: { assetversion: version } };
  return { get: async (key) => { keys.push(['get', key]); return object; }, head: async (key) => { keys.push(['head', key]); return object; } };
};

test('Star-map textures and data are fleet resources; neighbours are not', () => {
  for (const path of [small, large, metadata, '/data/starmap', '/data/starmap/anything.json', '/assets/models/starmap', '/assets/models/starmap/tex/x.webp']) assert.equal(isFleetResource(path), true, path);
  for (const path of ['/assets/models/starmapx/tex/a.webp', '/data/starmapx.json', '/assets/models', '/js/starmap.js', '/css/starmap.css']) assert.equal(isFleetResource(path), false, path);
});

test('Logged-out is 401 and non-fleet is 403 for GET/HEAD, before the bucket or a static file is touched', async () => {
  const env = environment();
  env.FLEET_GEAR_MODELS = { get: () => assert.fail('Unauthorized R2 read'), head: () => assert.fail('Unauthorized R2 HEAD') };
  const community = await memberCookie({ sub: 'community-only', roles: [COMMUNITY] }, env);
  const admin = await memberCookie({ sub: 'admin-only', roles: ['admin'] }, env);
  for (const path of [small, large, metadata, '/assets/models/starmap/tex/', '/assets/models/starmap/_release.json']) for (const method of ['GET', 'HEAD']) for (const [cookie, status] of [['', 401], [community, 403], [admin, 403]]) {
    const result = await invoke(env, path, cookie, method);
    assert.equal(result.response.status, status, `${method} ${path}`); assert.equal(result.calls, 0); cacheHeaders(result.response);
  }
  assert.equal((await invoke(env, small, '', 'HEAD', 'https://hash.volt-ceo.pages.dev')).response.status, 401);
});

test('Fleet members get textures only from the versioned private bucket key, with private headers', async () => {
  const env = environment(); const cookie = await memberCookie({ sub: 'fleet', roles: [FLEET] }, env);
  const keys = []; env.FLEET_GEAR_MODELS = bucket(keys);
  for (const [path, name] of [[small, 'ui_sm_stanton_2_crusader_512.webp'], [large, 'ui_sm_stanton_2_crusader_1k.webp']]) for (const method of ['GET', 'HEAD']) for (const query of ['', `?v=${starmapTextureVersion}`]) {
    const result = await invoke(env, path + query, cookie, method);
    assert.equal(result.response.status, 200, `${method} ${path}${query}`); assert.equal(result.calls, 0); cacheHeaders(result.response);
    assert.equal(result.response.headers.get('Content-Type'), 'image/webp');
    assert.equal(result.response.headers.get('Content-Length'), '4');
    assert.equal(result.response.headers.get('ETag'), '"starmap"');
    assert.equal(result.response.headers.get('X-Content-Type-Options'), 'nosniff');
    assert.equal(await result.response.text(), method === 'HEAD' ? '' : 'WEBP');
    assert.deepEqual(keys.pop(), [method === 'HEAD' ? 'head' : 'get', `starmap/${starmapTextureVersion}/tex/${name}`]);
  }
  // metadata is an ordinary protected static file: served by Pages, but with private headers
  const meta = await invoke(env, metadata, cookie);
  assert.equal(meta.response.status, 200); assert.equal(meta.calls, 1); cacheHeaders(meta.response);
  assert.equal((await invoke(env, small, cookie, 'GET', 'https://branch.volt-ceo.pages.dev')).response.headers.get('X-Robots-Tag'), 'noindex');
});

test('Bad paths, other versions and other methods are refused without reading the bucket', async () => {
  const env = environment(); const cookie = await memberCookie({ sub: 'fleet', roles: [FLEET] }, env);
  const keys = []; env.FLEET_GEAR_MODELS = bucket(keys);
  const bad = ['/assets/models/starmap', '/assets/models/starmap/', '/assets/models/starmap/tex/', '/assets/models/starmap/_release.json',
    '/assets/models/starmap/tex/ui_sm_stanton_2_crusader_2k.webp', '/assets/models/starmap/tex/ui_sm_stanton_2_crusader_4k.webp', '/assets/models/starmap/tex/ui_sm_stanton_2_crusader.webp',
    '/assets/models/starmap/tex/ui_sm_stanton_2_crusader_512.png', '/assets/models/starmap/tex/UI_SM_NYX_1_512.webp', '/assets/models/starmap/tex/a/b_512.webp',
    '/assets/models/starmap/weapons/x/manifest.json', '/assets/models/starmap/tex/_512.webp', `/assets/models/starmap/${starmapTextureVersion}/tex/ui_sm_nyx_1_512.webp`,
    small + '?v=other', small + '?v='];
  for (const path of bad.slice(0, -1)) for (const method of ['GET', 'HEAD']) {
    const result = await invoke(env, path, cookie, method);
    assert.equal(result.response.status, 404, `${method} ${path}`); assert.equal(result.calls, 0); cacheHeaders(result.response);
  }
  assert.equal(keys.length, 0);
  // an empty ?v= is treated as "no version given" and serves the current version only
  assert.equal((await invoke(env, bad.at(-1), cookie)).response.status, 200);
  assert.deepEqual(keys.pop(), ['get', `starmap/${starmapTextureVersion}/tex/ui_sm_stanton_2_crusader_512.webp`]);
  for (const method of ['POST', 'PUT', 'DELETE']) {
    const result = await invoke(env, small, cookie, method);
    assert.equal(result.response.status, 405, method); assert.equal(result.calls, 0); cacheHeaders(result.response);
  }
  assert.equal(keys.length, 0);
  // traversal and encoded aliases are normalised by the middleware first: they end up at the gate or outside it, never at a raw key
  for (const path of ['/assets/models/starmap/tex/..%2f..%2fgear/x_512.webp', '/assets/models/starmap/tex/%2e%2e/secret_512.webp']) {
    const result = await invoke(env, path, cookie); assert.ok([400, 404].includes(result.response.status), path); assert.equal(result.calls, 0);
  }
  for (const path of ['//assets/models/starmap/tex/a_512.webp', '/assets/%6dodels/starmap/tex/a_512.webp', '/assets%5cmodels%5cstarmap%5ctex%5ca_512.webp', '/data/%73tarmap/textures.json', '/public%2f..%2fdata%2fstarmap%2ftextures.json']) {
    const result = await invoke(env, path); assert.equal(result.response.status, 401, path); assert.equal(result.calls, 0);
  }
  for (const path of ['/assets/models/starmap/%00.webp', '/assets/models/starmap/%ZZ', '/data/%2573tarmap/textures.json']) {
    const result = await invoke(env, path); assert.equal(result.response.status, 400, path); assert.equal(result.calls, 0);
  }
});

test('Letter case does not get a request past the gate or through to a static file', async () => {
  const env = environment(); const cookie = await memberCookie({ sub: 'fleet', roles: [FLEET] }, env);
  const keys = []; env.FLEET_GEAR_MODELS = bucket(keys);
  const shouted = ['/DATA/STARMAP/index.json', '/data/Starmap/index.json', '/Data/starmap/links.json', '/ASSETS/models/starmap/tex/ui_sm_nyx_1_512.webp', '/assets/Models/Starmap/tex/ui_sm_nyx_1_512.webp', '/DATA/TRADE/world.json', '/Data/Mining/helper.json'];
  for (const path of shouted) {
    assert.equal(isFleetResource(path), true, path);
    const anonymous = await invoke(env, path); assert.equal(anonymous.response.status, 401, path); assert.equal(anonymous.calls, 0, path); cacheHeaders(anonymous.response);
  }
  // a member asking for art in the wrong case gets a 404 from the handler: never a static file, never a bucket read
  for (const path of shouted.filter((item) => /assets/i.test(item))) {
    const member = await invoke(env, path, cookie); assert.equal(member.response.status, 404, path); assert.equal(member.calls, 0, path); cacheHeaders(member.response);
  }
  assert.equal(keys.length, 0);
  for (const path of ['/js/STARMAP.js', '/DATA/starmapx.json', '/Assets/models']) assert.equal(isFleetResource(path), false, path);
});

test('Missing, wrong-version or failing storage never falls through to a public static file', async () => {
  const env = environment(); const cookie = await memberCookie({ sub: 'fleet', roles: [FLEET] }, env);
  const cases = [[undefined, 503], [{ get: async () => null, head: async () => null }, 404], [bucket([], 'wrong'), 404],
    [{ get: async () => ({ size: 1, body: 'x' }), head: async () => ({ size: 1 }) }, 404], [{ get: async () => { throw new Error('storage down'); }, head: async () => { throw new Error('storage down'); } }, 503]];
  for (const [store, status] of cases) for (const method of ['GET', 'HEAD']) {
    env.FLEET_GEAR_MODELS = store; const result = await invoke(env, small, cookie, method);
    assert.equal(result.response.status, status); assert.equal(result.calls, 0); cacheHeaders(result.response);
    if (method === 'HEAD') assert.equal(await result.response.text(), '');
  }
  assert.equal((await invoke({ ...env, DISCORD_FLEET_ROLE_ID: '' }, small, cookie)).response.status, 503);
  assert.equal((await invoke({ ...env, DISCORD_FLEET_ROLE_ID: 'new' }, small, cookie)).response.status, 403);
});

test('textures.json matches the server version, the key rule and the file grammar; nothing above 1k is listed', () => {
  assert.equal(index.assetVersion, starmapTextureVersion);
  assert.match(index.assetVersion, /^[\w.-]{1,40}$/);
  assert.deepEqual(index.sizes, ['512', '1k']);
  assert.equal(index.totals.textures, Object.keys(index.textures).length);
  assert.equal(index.totals.textures + index.failed.length, 30);
  for (const [key, entry] of Object.entries(index.textures)) {
    assert.equal(textureKey(entry.source), key);
    assert.deepEqual(Object.keys(entry.files), ['512', '1k']);
    for (const [label, file] of Object.entries(entry.files)) {
      assert.equal(file.file, `assets/models/starmap/tex/${key}_${label}.webp`);
      assert.match(file.file.slice('assets/models/starmap/'.length), STARMAP_TEXTURE_FILE);
      assert.equal(Math.max(file.width, file.height), label === '1k' ? 1024 : 512);
      assert.ok(file.bytes > 0 && /^[a-f0-9]{64}$/.test(file.sha256));
    }
  }
  for (const [material, key] of Object.entries(index.materials)) { assert.equal(material, material.toLowerCase()); assert.ok(index.textures[key], material); }
});

test('Key rule: TexSlot4 file -> basename without extension, lower-case', () => {
  assert.equal(textureKey('ui/starmap/textures/Nyx/ui_sm_nyx_2.tif'), 'ui_sm_nyx_2');
  assert.equal(textureKey('UI\\Starmap\\Textures\\Stanton\\UI_SM_Stanton_3_ArcCorp.DDS'), 'ui_sm_stanton_3_arccorp');
  assert.equal(textureKey(''), '');
  const material = { tag: 'Material', attrs: {}, children: [{ tag: 'Textures', attrs: {}, children: [
    { tag: 'Texture', attrs: { Map: 'TexSlot1', File: 'Objects/ui/dots.tif' }, children: [] },
    { tag: 'Texture', attrs: { Map: 'TexSlot4', File: 'ui/starmap/textures/pyro/ui_sm_pyro_5a.tif' }, children: [] }] }] };
  assert.equal(textureKey(colourMapOf(material)), 'ui_sm_pyro_5a');
  assert.equal(colourMapOf({ tag: 'Material', attrs: {}, children: [] }), null);
});

test('Exported game art is ignored by Git and absent from the public service-worker precache', () => {
  assert.match(readFileSync(new URL('../../.gitignore', import.meta.url), 'utf8'), /^\/assets\/models\/starmap\/$/m);
  assert.doesNotMatch(readFileSync(new URL('../../sw.js', import.meta.url), 'utf8'), /assets\/models\/starmap/);
  assert.equal(existsSync(new URL('../../data/starmap/textures.json', import.meta.url)), true);
});
