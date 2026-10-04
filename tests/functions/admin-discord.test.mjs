import test from 'node:test';
import assert from 'node:assert/strict';
import { TEST_ENV, memberCookie, adminCookie, jsonRequest } from './helpers.mjs';
import { createSqliteDb } from './sqlite-d1.mjs';
import { getAdminIdentity, isAuthenticated, requireAdmin, hmac } from '../../functions/_shared/auth.js';
import { revokeUserSession, readOAuthReturnPath } from '../../functions/_shared/discord-auth.js';
import { onRequestPost as login } from '../../functions/api/admin/discord-login.js';
import { onRequestGet as session } from '../../functions/api/admin/session.js';
import { onRequestPost as logout } from '../../functions/api/admin/logout.js';
import { onRequestGet as oauthStart } from '../../functions/auth/discord/login.js';
import { onRequestGet as oauthCallback } from '../../functions/auth/discord/callback.js';

function environment() {
  return { ...TEST_ENV, DB: createSqliteDb(), ADMIN_DISCORD_ROLES: '["대표이사","임원진"]', DISCORD_ROLE_MAP: '{"ceo":"대표이사","executive":"임원진","auditor":"감찰","member":"VOLT 함대원"}' };
}
const requestFor = (cookie, env = {}) => jsonRequest('https://www.volt.ceo/api/admin/session', { method: 'GET', cookie, ...env });
async function signedIn(role = 'ceo', env = environment()) {
  const userCookie = await memberCookie({ sub: 'user-1', display_name: '관리자 A', roles: [role] }, env);
  const response = await login({ request: jsonRequest('https://www.volt.ceo/api/admin/discord-login', { cookie: userCookie }), env });
  return { env, userCookie, response, cookie: `${userCookie}; ${response.headers.get('Set-Cookie')?.split(';')[0] || ''}` };
}

test('Discord CMS allows only approved roles and requires a separate CMS sign-in', async () => {
  for (const role of ['ceo', 'executive', 'auditor', 'member']) {
    const flow = await signedIn(role);
    assert.equal(flow.response.status, ['ceo', 'executive'].includes(role) ? 200 : 403);
    assert.equal(await isAuthenticated(requestFor(flow.userCookie), flow.env), false);
    assert.equal(await isAuthenticated(requestFor(flow.cookie), flow.env), ['ceo', 'executive'].includes(role));
    if (flow.response.status === 200) {
      const body = await (await session({ request: requestFor(flow.cookie), env: flow.env })).json();
      assert.equal(body.identity.id, 'user-1');
      assert.equal(body.identity.displayName, '관리자 A');
      assert.equal(body.identity.method, 'discord');
      assert.equal('sid' in body.identity, false);
      assert.equal('token' in body.identity, false);
    }
  }
});

test('CMS identity cannot be reused by another Discord account and revocation takes effect', async () => {
  const flow = await signedIn();
  const other = await memberCookie({ sub: 'user-2', roles: ['ceo'] }, flow.env);
  const marker = flow.cookie.split('; ')[1];
  assert.equal(await isAuthenticated(requestFor(`${other}; ${marker}`), flow.env), false);
  assert.equal(await isAuthenticated(requestFor(flow.cookie), { ...flow.env, ADMIN_DISCORD_ROLES: '[]' }), false);
  await revokeUserSession(requestFor(flow.userCookie), flow.env);
  assert.equal(await isAuthenticated(requestFor(flow.cookie), flow.env), false);
});

test('CMS rechecks Discord membership within a minute and fails closed if verification is unavailable', async (t) => {
  const flow = await signedIn();
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  await flow.env.DB.prepare('UPDATE security_sessions SET checked_at = ?').bind(Date.now() - 61000).run();
  globalThis.fetch = async () => new Response('unavailable', { status: 503 });
  assert.equal((await requireAdmin(requestFor(flow.cookie), flow.env)).status, 503);
  globalThis.fetch = async () => Response.json({ roles: ['member'] });
  assert.equal(await isAuthenticated(requestFor(flow.cookie), flow.env), false);
});

test('CMS logout ends CMS access without revoking the public Discord session; password access stays compatible', async () => {
  const flow = await signedIn();
  const response = logout();
  assert.match(response.headers.get('Set-Cookie'), /Max-Age=0/);
  assert.equal(await isAuthenticated(requestFor(flow.userCookie), flow.env), false);
  assert.equal((await getAdminIdentity(requestFor(await adminCookie(flow.env)), flow.env)).method, 'password');
});

test('Discord CMS rejects unknown configuration, cross-origin sign-in, expired user and non-numeric expiry', async () => {
  const flow = await signedIn();
  const crossOrigin = jsonRequest('https://www.volt.ceo/api/admin/discord-login', { cookie: flow.userCookie });
  crossOrigin.headers.set('Origin', 'https://untrusted.example');
  assert.equal((await login({ request: crossOrigin, env: flow.env })).status, 403);
  for (const roles of ['', 'oops', '{}', '["대표이사",null]']) {
    assert.equal(await isAuthenticated(requestFor(flow.cookie), { ...flow.env, ADMIN_DISCORD_ROLES: roles }), false);
  }
  assert.equal((await login({ request: jsonRequest('https://www.volt.ceo/api/admin/discord-login'), env: flow.env })).status, 401);
  await flow.env.DB.prepare('UPDATE security_sessions SET expires_at = 0').run();
  assert.equal((await login({ request: jsonRequest('https://www.volt.ceo/api/admin/discord-login', { cookie: flow.userCookie }), env: flow.env })).status, 401);
  const payload = 'admin.NaN';
  assert.equal(await isAuthenticated(requestFor(`volt_admin_session=${payload}.${await hmac(payload, flow.env.ADMIN_SESSION_SECRET)}`), flow.env), false);
});

test('OAuth return destination is restricted to CMS and cannot redirect to arbitrary URLs', () => {
  const env = { DISCORD_CLIENT_ID: 'test', DISCORD_REDIRECT_URI: 'https://www.volt.ceo/auth/discord/callback' };
  for (const returnTo of ['/admin/', 'https://evil.example', '//evil.example', '/other']) {
    const response = oauthStart({ request: new Request(`https://www.volt.ceo/auth/discord/login?returnTo=${encodeURIComponent(returnTo)}`), env });
    const cookie = response.headers.getSetCookie().map((value) => value.split(';')[0]).join('; ');
    assert.equal(readOAuthReturnPath(requestFor(cookie)), returnTo === '/admin/' ? '/admin/?discord=1' : '/');
    assert.match(new URL(response.headers.get('Location')).searchParams.get('scope'), /identify guilds.members.read/);
  }
});

test('a valid OAuth callback returns to CMS, clears transient cookies and creates only a public session', async (t) => {
  const env = environment();
  Object.assign(env, { DISCORD_CLIENT_ID: 'client', DISCORD_CLIENT_SECRET: 'secret', DISCORD_REDIRECT_URI: 'https://www.volt.ceo/auth/discord/callback' });
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  globalThis.fetch = async url => {
    if (String(url).endsWith('/oauth2/token')) return Response.json({ access_token: 'private-token', expires_in: 3600 });
    if (String(url).endsWith('/member')) return Response.json({ roles: ['ceo'], nick: 'CEO' });
    return Response.json({ id: 'user-oauth', username: 'CEO' });
  };
  const request = new Request('https://www.volt.ceo/auth/discord/callback?code=test-code&state=test-state', { headers: { Cookie: 'volt_oauth_state=test-state; volt_oauth_return=admin' } });
  const response = await oauthCallback({ request, env });
  assert.equal(response.headers.get('Location'), '/admin/?discord=1');
  const cookies = response.headers.getSetCookie().join('\n');
  assert.match(cookies, /volt_user_session=/);
  assert.match(cookies, /volt_oauth_return=;.*Max-Age=0/);
  assert.match(cookies, /volt_oauth_state=;.*Max-Age=0/);
  assert.doesNotMatch(cookies, /private-token|volt_admin_session/);
  const failed = await oauthCallback({ request: new Request('https://www.volt.ceo/auth/discord/callback?code=test-code&state=wrong', { headers: { Cookie: 'volt_oauth_state=test-state; volt_oauth_return=admin' } }), env });
  assert.equal(failed.headers.get('Location'), '/?auth=error');
  assert.match(failed.headers.getSetCookie().join('\n'), /volt_oauth_return=;.*Max-Age=0/);
});
