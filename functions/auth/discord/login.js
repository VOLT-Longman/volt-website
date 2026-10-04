import { createOAuthStateCookie, createOAuthReturnCookie, getSecretOrThrow } from '../../_shared/discord-auth.js';

const DISCORD_AUTHORIZE_URL = 'https://discord.com/api/oauth2/authorize';
const DISCORD_SCOPE = 'identify guilds.members.read';

function createAuthorizeUrl(env, state) {
  const params = new URLSearchParams({
    client_id: getSecretOrThrow(env, 'DISCORD_CLIENT_ID'),
    redirect_uri: getSecretOrThrow(env, 'DISCORD_REDIRECT_URI'),
    response_type: 'code',
    scope: DISCORD_SCOPE,
    state,
    prompt: 'consent'
  });
  return `${DISCORD_AUTHORIZE_URL}?${params.toString()}`;
}

export function onRequestGet({ request, env }) {
  const state = crypto.randomUUID();
  const returnTo = request ? new URL(request.url).searchParams.get('returnTo') : null;
  const headers = new Headers({ Location: createAuthorizeUrl(env, state), 'Cache-Control': 'no-store' });
  headers.append('Set-Cookie', createOAuthStateCookie(state));
  headers.append('Set-Cookie', createOAuthReturnCookie(returnTo));
  return new Response(null, {
    status: 302,
    headers
  });
}
