import { readUserSession } from './discord-auth.js';
import { error } from './http.js';

// D-2: 컬렉션별 관리자 역할 세분화(requireAdminCollectionAccess 등)는 구현만 되고
// 어떤 admin 라우트에서도 호출되지 않던 죽은 코드였다(전수 감사에서 발견, docs/MILESTONE_D.md D-2).
// 컬렉션별 권한은 사용하지 않는다. 현재 CMS는 requireAdmin에서 공통 비밀번호와
// ADMIN_DISCORD_ROLES에 허용된 Discord 계정을 검증한다.

export async function requireUser(request, env) {
  let session;
  try { session = await readUserSession(request, env); }
  catch (_error) { return error('인증 상태를 확인할 수 없습니다. 잠시 후 다시 시도하세요.', 503); }
  return session || error('Unauthorized', 401);
}

export function isMember(session) {
  return Array.isArray(session?.roles) && session.roles.length > 0;
}

export async function requireMember(request, env) {
  const session = await requireUser(request, env);
  if (session instanceof Response) return session;
  return isMember(session) ? session : error('Forbidden', 403);
}
