import { readUserSession } from '../_shared/discord-auth.js';
import { json } from '../_shared/http.js';

function createUserPayload(session) {
  return {
    username: session.username,
    display_name: session.display_name,
    avatar_url: session.avatar_url,
    roles: Array.isArray(session.roles) ? session.roles : []
  };
}

export async function onRequestGet({ request, env }) {
  const session = await readUserSession(request, env);
  if (!session) return json({ logged_in: false }, { cacheControl: 'no-store' });
  return json({ logged_in: true, user: createUserPayload(session) }, { cacheControl: 'no-store' });
}
