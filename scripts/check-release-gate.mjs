// Pages waits for this exact commit's complete GitHub checks before publishing.
// Public repository API only: no Cloudflare/GitHub credentials are needed.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPOSITORY = 'VOLT-Longman/volt-website';
const WORKFLOW_PATH = '.github/workflows/smoke.yml';
const DEFAULT_TIMEOUT_MS = 15 * 60 * 1000;

export function assessSmokeRuns(payload, sha) {
  if (!Array.isArray(payload?.workflow_runs)) throw new Error('Invalid GitHub workflow response');
  const runs = payload.workflow_runs.filter((run) =>
    run.head_sha === sha && run.head_branch === 'main' && run.event === 'push' && run.path === WORKFLOW_PATH
  ).sort((a, b) => Number(b.id) - Number(a.id));
  if (!runs.length) return { state: 'waiting', reason: 'Exact commit checks have not started' };
  const latest = runs[0];
  if (!Number.isSafeInteger(latest.id) || latest.id <= 0) throw new Error('Invalid GitHub run ID');
  if (latest.status !== 'completed') {
    if (!['queued', 'in_progress', 'waiting', 'pending', 'requested'].includes(latest.status)) throw new Error('Unknown GitHub check state');
    return { state: 'waiting', reason: `Run ${latest.id}: ${latest.status}` };
  }
  return latest.conclusion === 'success'
    ? { state: 'passed', reason: `Run ${latest.id} passed`, runId: latest.id }
    : { state: 'failed', reason: `Run ${latest.id}: ${latest.conclusion || 'missing conclusion'}` };
}

export async function waitForProductionChecks({
  sha, branch, fetchImpl = fetch, now = Date.now,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  timeoutMs = DEFAULT_TIMEOUT_MS, pollMs = 30000, log = console.log
}) {
  if (!branch) throw new Error('Missing CF_PAGES_BRANCH');
  if (branch !== 'main') {
    log('Preview branch: production release gate does not apply');
    return { state: 'preview' };
  }
  if (!/^[0-9a-f]{40}$/u.test(sha || '')) throw new Error('Missing or invalid CF_PAGES_COMMIT_SHA');
  log(`Waiting for Smoke Tests on main commit ${sha}`);
  const deadline = now() + timeoutMs;
  const url = `https://api.github.com/repos/${REPOSITORY}/actions/runs?head_sha=${sha}&branch=main&event=push&per_page=100`;
  while (now() < deadline) {
    let response;
    try {
      response = await fetchImpl(url, {
        headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'VOLT-release-gate' },
        signal: AbortSignal.timeout(10000)
      });
    } catch (_error) {
      log('GitHub checks unavailable; deployment remains blocked');
    }
    if (response?.ok) {
      const result = assessSmokeRuns(await response.json(), sha);
      log(result.reason);
      if (result.state === 'passed') return result;
      if (result.state === 'failed') throw new Error(`Deployment blocked: ${result.reason}`);
    } else if (response) {
      log(`GitHub HTTP ${response.status}; deployment remains blocked`);
    }
    await sleep(Math.min(pollMs, Math.max(0, deadline - now())));
  }
  throw new Error('Deployment blocked: timed out waiting for exact commit checks');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.env.CF_PAGES !== '1') throw new Error('Release gate must run in Cloudflare Pages');
    await waitForProductionChecks({ sha: process.env.CF_PAGES_COMMIT_SHA, branch: process.env.CF_PAGES_BRANCH });
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
