import { requireAdmin } from '../../../_shared/auth.js';
import { error, methodNotAllowed } from '../../../_shared/http.js';
import { privateResponse } from '../../../_shared/community-access.js';

// CMS retains its existing, separate authorization. This route cannot serve
// loadout/UEX data, arbitrary files or URLs and does not unlock public tools.
const FILES = new Set([
  'ship-live-stats.js', 'ship-market.js',
  ...['shipdb-manifest', 'ships-canonical', 'localization-ships', 'operational-ships', 'edition-aliases',
    'localization-roles', 'ship-filter-taxonomy', 'ships-rsi-official', 'localization-rsi-official', 'presentation-ships']
    .map((name) => `canonical/${name}.json`)
]);

export async function onRequest({ request, env, params }) {
  const unauthorized = await requireAdmin(request, env);
  if (unauthorized) return unauthorized;
  if (!['GET', 'HEAD'].includes(request.method)) return methodNotAllowed();
  const file = Array.isArray(params.file) ? params.file.join('/') : String(params.file || '');
  if (!FILES.has(file)) return error('Not found', 404);
  if (!env.ASSETS?.fetch) return error('함선 원본 자료를 읽을 수 없습니다.', 503);
  const url = new URL(`/data/${file}`, request.url);
  return privateResponse(await env.ASSETS.fetch(new Request(url, { method: request.method })));
}
