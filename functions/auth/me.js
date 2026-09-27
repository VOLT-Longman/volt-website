import { readUserSession } from '../_shared/discord-auth.js';
import { json, error } from '../_shared/http.js';

function createUserPayload(session) {
  return {
    sub: session.sub,
    username: session.username,
    display_name: session.display_name,
    avatar_url: session.avatar_url,
    roles: Array.isArray(session.roles) ? session.roles : []
  };
}

export async function onRequestGet({ request, env }) {
  let session;
  try { session = await readUserSession(request, env); }
  catch (_error) { return error('인증 상태를 확인할 수 없습니다. 잠시 후 다시 시도하세요.', 503); }
  if (!session) return json({ logged_in: false }, { cacheControl: 'no-store' });
  return json({ logged_in: true, user: createUserPayload(session) }, { cacheControl: 'no-store' });
}
