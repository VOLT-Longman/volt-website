import { createSessionCookie, getAdminDiscordRoles, parseCookies } from '../../_shared/auth.js';
import { json, error } from '../../_shared/http.js';
import { readUserSession } from '../../_shared/discord-auth.js';

export async function onRequestPost({ request, env }) {
  const origin = request.headers.get('Origin');
  if (origin && origin !== new URL(request.url).origin) return error('Forbidden', 403);
  if (!getAdminDiscordRoles(env).length) return error('Discord 관리자 로그인이 설정되지 않았습니다.', 503);
  if (!parseCookies(request).volt_user_session) return error('Discord 로그인이 필요합니다.', 401);
  try {
    const session = await readUserSession(request, env, { membershipTtlMs: 60000 });
    if (!session) return error('Discord 로그인이 필요합니다.', 401);
    if (!session.roles.some((role) => getAdminDiscordRoles(env).includes(role))) return error('대표이사 또는 임원진 역할의 관리자만 접근할 수 있습니다.', 403);
    return json({ ok: true }, { headers: { 'Set-Cookie': await createSessionCookie(env, session) } });
  } catch { return error('Discord 관리자 인증을 확인할 수 없습니다. 잠시 후 다시 시도하세요.', 503); }
}
