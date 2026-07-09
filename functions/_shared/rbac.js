import { readUserSession } from './discord-auth.js';
import { error } from './http.js';

// D-2: 컬렉션별 관리자 역할 세분화(requireAdminCollectionAccess 등)는 구현만 되고
// 어떤 admin 라우트에서도 호출되지 않던 죽은 코드였다(전수 감사에서 발견, docs/MILESTONE_D.md D-2).
// 1인 운영 확인(사용자 결정, 2026-07-09)에 따라 삭제한다. 현재 운영은 단일 공유 관리자
// 비밀번호(requireAdmin) 모델. 필요해지면(다인 운영 전환 등) git history에서 복원 가능.

export async function requireUser(request, env) {
  const session = await readUserSession(request, env);
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
