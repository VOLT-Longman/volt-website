import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { checkDeploySync } from '../../scripts/check-deploy-sync.mjs';

const sha = 'a'.repeat(40);

test('a challenged live check accepts only the exact production build on the canonical Pages redirect', async () => {
  const canonical = 'https://www.volt.ceo/.well-known/volt-release';
  async function check(status, location, commit) {
    return checkDeploySync({ pagesSha: sha, fetchImpl: async (url, options) => {
      if (url === 'https://www.volt.ceo/') return new Response('', { status: 403, headers: { 'cf-mitigated': 'challenge' } });
      assert.equal(url, 'https://volt-ceo.pages.dev/.well-known/volt-release');
      assert.equal(options.method, 'HEAD');
      assert.equal(options.redirect, 'manual');
      return new Response(null, { status, headers: { location, 'x-volt-production-commit': commit } });
    } });
  }
  assert.equal(await check(308, canonical, sha), 0);
  for (const args of [[308, canonical, ''], [308, canonical, 'b'.repeat(40)], [200, canonical, sha],
    [308, 'https://test.volt-ceo.pages.dev/.well-known/volt-release', sha]]) assert.equal(await check(...args), 1);
});

test('ordinary HTTP errors and stale live HTML cannot fall back to a Pages success', async () => {
  for (const [response, expected] of [[new Response('Forbidden', { status: 403 }), 2],
    [new Response('Just a moment', { status: 503 }), 2], [new Response('<link href="old.css?v=old">'), 1]]) {
    assert.equal(await checkDeploySync({ pagesSha: sha, fetchImpl: async url => {
      assert.equal(url, 'https://www.volt.ceo/');
      return response;
    } }), expected);
  }
});

test('deploy checker exits cleanly with distinct match, mismatch and unavailable codes', async (t) => {
  const version = readFileSync(new URL('../../sw.js', import.meta.url), 'utf8').match(/const CACHE_VERSION = '([^']+)'/)[1];
  const server = createServer((request, response) => {
    response.setHeader('Connection', 'close');
    if (request.url === '/match/') return response.end(`<script src="main.js?v=${version}"></script>`);
    if (request.url === '/mixed/') return response.end(`<script src="main.js?v=${version}"></script><link href="old.css?v=20000101-00">`);
    if (request.url === '/mismatch/') return response.end('<script src="old.js?v=20000101-00"></script>');
    if (request.url === '/blocked/') { response.statusCode = 403; return response.end('Just a moment'); }
    response.end('No versions here');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const script = fileURLToPath(new URL('../../scripts/check-deploy-sync.mjs', import.meta.url));
  for (const [path, expected] of [['match', 0], ['mixed', 1], ['mismatch', 1], ['blocked', 2], ['empty', 2]]) {
    const result = await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [script, `${base}/${path}`], { stdio: ['ignore', 'pipe', 'pipe'] });
      let output = '';
      child.stdout.on('data', (bytes) => { output += bytes.toString(); });
      child.stderr.on('data', (bytes) => { output += bytes.toString(); });
      child.on('error', reject);
      child.on('close', (code, signal) => resolve({ code, signal, output }));
    });
    assert.equal(result.code, expected, result.output);
    assert.equal(result.signal, null);
    assert.doesNotMatch(result.output, /Assertion failed|UV_HANDLE_CLOSING/);
  }
});
