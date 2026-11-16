import { clearSessionCookie, revokeSessionCookie } from '../../_shared/auth.js';
import { error, json } from '../../_shared/http.js';

export async function onRequestPost({ request, env }) {
  // 쿠키만 지우면 복사해 둔 세션 값이 만료 전까지 계속 통한다. 서버에서도 폐기한다.
  try {
    await revokeSessionCookie(request, env);
  } catch {
    return error('로그아웃을 완료하지 못했습니다. 잠시 후 다시 시도하세요.', 503);
  }
  return json({ ok: true }, { headers: { 'Set-Cookie': clearSessionCookie() } });
}
