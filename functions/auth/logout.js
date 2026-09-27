import { clearUserSessionCookie, revokeUserSession } from '../_shared/discord-auth.js';

export async function onRequestGet({ request, env }) {
  await revokeUserSession(request, env);
  return new Response(null, {
    status: 302,
    headers: {
      Location: '/',
      'Set-Cookie': clearUserSessionCookie(),
      'Cache-Control': 'no-store'
    }
  });
}
