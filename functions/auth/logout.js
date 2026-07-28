import { clearUserSessionCookie } from '../_shared/discord-auth.js';

export function onRequestGet() {
  return new Response(null, {
    status: 302,
    headers: {
      Location: '/',
      'Set-Cookie': clearUserSessionCookie(),
      'Cache-Control': 'no-store'
    }
  });
}
