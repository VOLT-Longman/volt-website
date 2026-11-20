import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { checkDeploySync } from '../../scripts/check-deploy-sync.mjs';

const sha = 'a'.repeat(40);
const suite = { id: 71, app: { id: 85455 }, head_branch: 'main', head_sha: sha, status: 'completed', conclusion: 'success' };
const run = { id: 72, app: suite.app, name: 'Cloudflare Pages', head_sha: sha, check_suite: { id: suite.id },
  details_url: `https://dash.cloudflare.com/?to=/${'b'.repeat(32)}/pages/view/volt-website/12a4-b6a0`, status: 'completed', conclusion: 'success',
  output: { title: 'Deployed successfully' } };

test('a challenged production probe requires the latest official deployment of this project and main commit', async () => {
  const check = (suites, runs) => checkDeploySync({ pagesSha: sha, fetchImpl: async url => {
    if (url === 'https://www.volt.ceo/') return new Response('Just a moment', { status: 403, headers: { 'cf-mitigated': 'challenge' } });
    if (url.includes('/commits/main/check-suites?')) return Response.json({ check_suites: suites });
    assert.match(url, /\/check-suites\/71\/check-runs\?/);
    return Response.json({ check_runs: runs });
  } });
  assert.equal(await check([suite], [run]), 0);
  for (const changed of [{ head_branch: 'preview' }, { head_sha: 'b'.repeat(40) }, { app: { id: 1 } }]) {
    assert.equal(await check([{ ...suite, ...changed }], [run]), 1);
  }
  assert.equal(await check([suite, { ...suite, id: 73, status: 'in_progress' }], [run]), 1);
  for (const changed of [{ details_url: run.details_url.replace('volt-website', 'other') }, { app: { id: 1 } },
    { head_sha: 'b'.repeat(40) }, { output: { title: 'Build skipped' } }]) {
    assert.equal(await check([suite], [{ ...run, ...changed }]), 1);
  }
  await assert.rejects(check([suite], [run, { ...run, id: 73, conclusion: 'failure' }]), /배포 실패/);
  await assert.rejects(check([{ ...suite, conclusion: 'cancelled' }], []), /배포 실패/);
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
