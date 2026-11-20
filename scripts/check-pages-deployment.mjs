// Only accept the Cloudflare GitHub App's record for this production project.
const repository = 'https://api.github.com/repos/VOLT-Longman/volt-website';
const pagesApp = 85455;

function isProjectRun(run) {
  if (run.name !== 'Cloudflare Pages' || run.app?.id !== pagesApp) return false;
  let url;
  try { url = new URL(run.details_url); } catch { return false; }
  const path = url.searchParams.get('to') || url.pathname;
  return url.origin === 'https://dash.cloudflare.com'
    && /^\/[a-f0-9]{32}\/pages\/view\/volt-website\/[a-f0-9-]+\/?$/u.test(path);
}

export async function checkPagesDeployment(sha, fetchImpl = fetch) {
  if (!/^[a-f0-9]{40}$/u.test(sha)) throw new Error('확인할 커밋 번호가 올바르지 않습니다.');
  async function read(endpoint) {
    const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'VOLT-deploy-verify' };
    if (process.env.GH_TOKEN) headers.Authorization = `Bearer ${process.env.GH_TOKEN}`;
    const res = await fetchImpl(repository + endpoint, { headers, redirect: 'error', signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error(`GitHub 배포 기록 조회 실패 (HTTP ${res.status})`);
    return res.json();
  }
  // main can advance between the smoke tests and this job. Never use a preview
  // suite or an older success to certify a newer deployment.
  const { check_suites: suites } = await read(`/commits/main/check-suites?app_id=${pagesApp}&per_page=100`);
  const suite = suites.filter(s => s.app?.id === pagesApp && s.head_branch === 'main' && s.head_sha === sha)
    .sort((a, b) => b.id - a.id)[0];
  if (!suite || suite.status !== 'completed') return false;
  if (suite.conclusion !== 'success') throw new Error(`Cloudflare 운영 배포 실패 (${suite.conclusion})`);
  const { check_runs: runs } = await read(`/check-suites/${suite.id}/check-runs?filter=all&per_page=100`);
  const run = runs.filter(r => r.head_sha === sha && r.check_suite?.id === suite.id && isProjectRun(r))
    .sort((a, b) => b.id - a.id)[0];
  if (!run || run.status !== 'completed') return false;
  if (run.conclusion !== 'success') throw new Error(`Cloudflare Pages 배포 실패 (${run.conclusion})`);
  return run.output?.title === 'Deployed successfully';
}
