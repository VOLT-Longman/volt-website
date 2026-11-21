// Pages waits for this exact commit's complete GitHub checks before publishing.
// Public repository API only: no Cloudflare/GitHub credentials are needed.
import path from 'node:path';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const REPOSITORY = 'VOLT-Longman/volt-website';
const WORKFLOW_PATH = '.github/workflows/smoke.yml';
const DEFAULT_TIMEOUT_MS = 20 * 60 * 1000;
// GitHub 공개 API는 로그인 없이 시간당 60번까지만 답한다(같은 주소를 쓰는 빌드끼리 한도를 나눠 쓴다).
// 빌드가 몰려도 조회 한도를 아끼고 GitHub가 알려 준 재시도 시각을 존중한다.
const DEFAULT_POLL_MS = 120000;

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
  sha, branch, githubToken, fetchImpl = fetch, now = Date.now,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  timeoutMs = DEFAULT_TIMEOUT_MS, pollMs = DEFAULT_POLL_MS, log = console.log
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
  const headers = { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'VOLT-release-gate' };
  if (githubToken) headers.Authorization = `Bearer ${githubToken}`;
  while (now() < deadline) {
    let response;
    try {
      response = await fetchImpl(url, {
        headers, redirect: 'error', signal: AbortSignal.timeout(10000)
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
    const retryMs = (Number(response?.headers?.get('retry-after')) || 0) * 1000;
    const resetMs = response?.headers?.get('x-ratelimit-remaining') === '0'
      ? (Number(response.headers.get('x-ratelimit-reset')) || 0) * 1000 - now() + 1000 : 0;
    const delay = Math.max(pollMs, retryMs, resetMs);
    if (delay > pollMs) log(`GitHub rate limit: next check allowed at ${new Date(now() + delay).toISOString()}`);
    await sleep(Math.min(delay, Math.max(0, deadline - now())));
  }
  throw new Error('Deployment blocked: timed out waiting for exact commit checks');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.env.CF_PAGES !== '1') throw new Error('Release gate must run in Cloudflare Pages');
    const release = await waitForProductionChecks({ sha: process.env.CF_PAGES_COMMIT_SHA, branch: process.env.CF_PAGES_BRANCH, githubToken: process.env.VOLT_GITHUB_ACTIONS_READ_TOKEN });
    if (release.state === 'passed') {
      const file = new URL('../functions/_shared/pages-release.js', import.meta.url);
      await writeFile(file, "export const productionCommit = '" + process.env.CF_PAGES_COMMIT_SHA + "';\n");
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
