import test from 'node:test';
import assert from 'node:assert/strict';
import { assessSmokeRuns, waitForProductionChecks } from '../../scripts/check-release-gate.mjs';

const sha = 'a'.repeat(40);
const run = (changes = {}) => ({ id: 10, head_sha: sha, head_branch: 'main', event: 'push', path: '.github/workflows/smoke.yml', status: 'completed', conclusion: 'success', ...changes });
const payload = (...runs) => ({ workflow_runs: runs });

test('release gate requires the exact production commit and full smoke workflow', () => {
  assert.equal(assessSmokeRuns(payload(run()), sha).state, 'passed');
  for (const changes of [{ head_sha: 'b'.repeat(40) }, { head_branch: 'preview' }, { event: 'pull_request' }, { path: '.github/workflows/deploy-verify.yml' }]) {
    assert.equal(assessSmokeRuns(payload(run(changes)), sha).state, 'waiting');
  }
  assert.throws(() => assessSmokeRuns({}, sha), /Invalid/);
});

test('a newer failed or pending run overrides an older successful run', () => {
  assert.equal(assessSmokeRuns(payload(run(), run({ id: 11, conclusion: 'failure' })), sha).state, 'failed');
  assert.equal(assessSmokeRuns(payload(run(), run({ id: 11, status: 'in_progress', conclusion: null })), sha).state, 'waiting');
  for (const conclusion of ['cancelled', 'skipped', 'neutral', 'timed_out', null]) {
    assert.equal(assessSmokeRuns(payload(run({ conclusion })), sha).state, 'failed');
  }
});

test('production gate waits through unavailable and pending checks, then passes', async () => {
  let clock = 0;
  const responses = [null, { ok: false, status: 429 }, { ok: true, json: async () => payload(run({ status: 'queued' })) }, { ok: true, json: async () => payload(run()) }];
  const result = await waitForProductionChecks({ sha, branch: 'main', now: () => clock, sleep: async (ms) => { clock += ms; }, timeoutMs: 100, pollMs: 10, log: () => {}, fetchImpl: async (url) => {
    assert.ok(url.includes(`head_sha=${sha}`));
    const response = responses.shift();
    if (!response) throw new Error('network unavailable');
    return response;
  } });
  assert.equal(result.state, 'passed');
  assert.equal(clock, 30);
});

test('failed, missing, invalid or indefinitely unavailable checks never publish', async () => {
  const options = { sha, branch: 'main', log: () => {}, fetchImpl: async () => ({ ok: true, json: async () => payload(run({ conclusion: 'failure' })) }) };
  await assert.rejects(waitForProductionChecks(options), /Deployment blocked/);
  await assert.rejects(waitForProductionChecks({ ...options, sha: '' }), /invalid/);
  await assert.rejects(waitForProductionChecks({ ...options, branch: '' }), /Missing/);
  let clock = 0;
  await assert.rejects(waitForProductionChecks({ ...options, timeoutMs: 20, pollMs: 10, now: () => clock, sleep: async (ms) => { clock += ms; }, fetchImpl: async () => ({ ok: true, json: async () => payload() }) }), /timed out/);
  assert.equal((await waitForProductionChecks({ ...options, branch: 'preview' })).state, 'preview');
});
