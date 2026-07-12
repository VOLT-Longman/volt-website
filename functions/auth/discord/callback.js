import { constantTimeEqual } from '../../_shared/auth.js';
import {
  clearOAuthStateCookie,
  createUserSession,
  getSecretOrThrow,
  mapRoles,
  readOAuthState
} from '../../_shared/discord-auth.js';

const TOKEN_URL = 'https://discord.com/api/oauth2/token';
const API_BASE = 'https://discord.com/api/v10';

function redirectToHome(cookies = []) {
  const headers = new Headers({ Location: '/', 'Cache-Control': 'no-store' });
  cookies.forEach((cookie) => { headers.append('Set-Cookie', cookie); });
  return new Response(null, { status: 302, headers });
}

function redirectToAuthError() {
  const headers = new Headers({ Location: '/?auth=error', 'Cache-Control': 'no-store' });
  headers.append('Set-Cookie', clearOAuthStateCookie());
  return new Response(null, { status: 302, headers });
}

function assertValidState(request, url) {
  const expected = readOAuthState(request);
  const received = url.searchParams.get('state') || '';
  return Boolean(expected && received && constantTimeEqual(expected, received));
}

async function fetchJson(url, accessToken) {
  const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' } });
  if (!response.ok) throw new Error(`Discord API failed: ${response.status}`);
  return response.json();
}

async function exchangeCodeForToken(env, code) {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: getSecretOrThrow(env, 'DISCORD_REDIRECT_URI'),
    client_id: getSecretOrThrow(env, 'DISCORD_CLIENT_ID'),
    client_secret: getSecretOrThrow(env, 'DISCORD_CLIENT_SECRET')
  });
  const response = await fetch(TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
  if (!response.ok) throw new Error(`Discord token exchange failed: ${response.status}`);
  return response.json();
}

async function fetchGuildMember(env, accessToken) {
  const guildId = getSecretOrThrow(env, 'DISCORD_GUILD_ID');
  const response = await fetch(`${API_BASE}/users/@me/guilds/${encodeURIComponent(guildId)}/member`, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' }
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Discord guild member API failed: ${response.status}`);
  return response.json();
}

function createAvatarUrl(user) {
  if (user.avatar) return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`;
  return 'https://cdn.discordapp.com/embed/avatars/0.png';
}

function createSessionUser(user, member, env) {
  return {
    sub: user.id,
    username: user.username,
    display_name: member?.nick || user.global_name || user.username,
    avatar_url: createAvatarUrl(user),
    roles: mapRoles(member?.roles || [], env)
  };
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code') || '';
  if (!code || !assertValidState(request, url)) return redirectToAuthError();

  try {
    const token = await exchangeCodeForToken(env, code);
    const user = await fetchJson(`${API_BASE}/users/@me`, token.access_token);
    const member = await fetchGuildMember(env, token.access_token);
    const sessionCookie = await createUserSession(env, createSessionUser(user, member, env));
    return redirectToHome([sessionCookie, clearOAuthStateCookie()]);
  } catch (_error) {
    return redirectToAuthError();
  }
}
