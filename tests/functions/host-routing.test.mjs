import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequest } from '../../functions/_middleware.js';

async function invoke(host, path = '/', method = 'GET', env = {}) {
  let calls = 0;
  const response = await onRequest({ request: new Request(`https://${host}${path}`, { method }), env,
    next: async () => { calls++; return new Response('page', { headers: { 'Cache-Control': 'public, max-age=60' } }); } });
  return { response, calls };
}

test('Production Pages origin redirects static, API and auth paths before serving them', async () => {
  for (const path of ['/', '/css/styles.css?v=1', '/api/health?next=%2Floadout&a=1&a=2', '/auth/discord/callback?code=sample', '/data/%6coadout/items.json']) {
    for (const method of ['GET', 'HEAD', 'POST']) {
      const { response, calls } = await invoke('volt-ceo.pages.dev', path, method);
      assert.equal(response.status, 308);
      assert.equal(response.headers.get('Location'), `https://www.volt.ceo${path}`);
      assert.equal(calls, 0);
    }
  }
});

test('Preview deployments retain responses and add noindex, including protected and invalid paths', async () => {
  for (const host of ['a1b2c3d4.volt-ceo.pages.dev', 'feat-gear.volt-ceo.pages.dev']) {
    const { response, calls } = await invoke(host, '/?a=1');
    assert.equal(response.status, 200); assert.equal(calls, 1);
    assert.equal(response.headers.get('X-Robots-Tag'), 'noindex');
    assert.equal(response.headers.get('Cache-Control'), 'public, max-age=60');
    assert.equal(await response.text(), 'page');
    const invalid = await invoke(host, '/%ZZ');
    assert.equal(invalid.response.status, 400);
    assert.equal(invalid.response.headers.get('X-Robots-Tag'), 'noindex');
    const denied = await invoke(host, '/data/loadout/items.json', 'GET', { COMMUNITY_TOOLS_REQUIRE_MEMBERSHIP: 'true' });
    assert.equal(denied.response.status, 401);
    assert.equal(denied.response.headers.get('X-Robots-Tag'), 'noindex');
    assert.equal(denied.response.headers.get('Cache-Control'), 'private, no-store');
  }
});

test('Public domain, local testing and unrelated hosts keep their existing routing', async () => {
  for (const host of ['www.volt.ceo', 'volt.ceo', 'localhost:8793', 'volt-ceo.pages.dev.example.com', 'unrelated.pages.dev']) {
    const { response, calls } = await invoke(host);
    assert.equal(response.status, 200); assert.equal(calls, 1);
    assert.equal(response.headers.get('Location'), null);
    assert.equal(response.headers.get('X-Robots-Tag'), null);
  }
});
