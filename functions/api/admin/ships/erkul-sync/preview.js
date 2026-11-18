import { requireAdmin } from '../../../../_shared/auth.js';
import { error, methodNotAllowed } from '../../../../_shared/http.js';

// Owner decision (2026-11-18): no Erkul data/API. Archived sync is retired.
export async function onRequest({ request, env }) {
  const unauthorized = await requireAdmin(request, env);
  if (unauthorized) return unauthorized;
  if (request.method !== 'GET') return methodNotAllowed();
  return error('함선 DB는 게임 파일 사양과 UEX 가격으로 전환했습니다. 기존 Erkul 동기화는 종료되었습니다.', 410);
}
