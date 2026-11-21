// Read the immutable build identity served by the production alias itself.
// Branch previews cannot answer for this hostname, even if they share its SHA.
export async function checkPagesDeployment(sha, fetchImpl = fetch) {
  if (!/^[0-9a-f]{40}$/u.test(sha)) throw new Error('Invalid production commit');
  const response = await fetchImpl('https://volt-ceo.pages.dev/.well-known/volt-release', {
    method: 'HEAD', redirect: 'manual', cache: 'no-store', signal: AbortSignal.timeout(15000)
  });
  return response.status === 308 && response.headers.get('location') === 'https://www.volt.ceo/.well-known/volt-release'
    && response.headers.get('x-volt-production-commit') === sha;
}
