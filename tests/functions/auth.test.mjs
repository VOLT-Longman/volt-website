import test from 'node:test';
import assert from 'node:assert/strict';

import {
    constantTimeEqual,
    createSessionCookie,
    hmac,
    isAuthenticated,
    requireAdmin,
    validateLoginToken
} from '../../functions/_shared/auth.js';
import { readUserSession } from '../../functions/_shared/discord-auth.js';
import { TEST_ENV, adminCookie, memberCookie } from './helpers.mjs';

function requestWithCookie(cookie) {
    return new Request('https://volt.ceo/api/admin/session', { headers: cookie ? { Cookie: cookie } : {} });
}

test('validateLoginToken: 올바른 비밀번호만 통과', async () => {
    assert.equal(await validateLoginToken('correct-password', TEST_ENV), true);
    assert.equal(await validateLoginToken('wrong-password', TEST_ENV), false);
    assert.equal(await validateLoginToken('', TEST_ENV), false);
    assert.equal(await validateLoginToken(null, TEST_ENV), false);
});

test('validateLoginToken: ADMIN_PASSWORD 미설정 시 항상 거부', async () => {
    const env = { ...TEST_ENV, ADMIN_PASSWORD: '' };
    assert.equal(await validateLoginToken('anything', env), false);
});

test('세션 쿠키: 발급된 쿠키로 인증 성공 + 보안 플래그 포함', async () => {
    const setCookie = await createSessionCookie(TEST_ENV);
    assert.match(setCookie, /HttpOnly/);
    assert.match(setCookie, /Secure/);
    assert.match(setCookie, /SameSite=Lax/);
    assert.equal(await isAuthenticated(requestWithCookie(setCookie.split(';')[0]), TEST_ENV), true);
});

test('세션 쿠키: 서명 변조 시 인증 실패', async () => {
    const cookie = await adminCookie();
    const tampered = cookie.slice(0, -4) + 'beef';
    assert.equal(await isAuthenticated(requestWithCookie(tampered), TEST_ENV), false);
});

test('세션 쿠키: 만료된 토큰은 거부', async () => {
    const expired = Math.floor(Date.now() / 1000) - 10;
    const payload = `admin.${expired}`;
    const signature = await hmac(payload, TEST_ENV.ADMIN_SESSION_SECRET);
    const cookie = `volt_admin_session=${payload}.${signature}`;
    assert.equal(await isAuthenticated(requestWithCookie(cookie), TEST_ENV), false);
});

test('세션 쿠키: 다른 시크릿으로 서명된 토큰은 거부', async () => {
    const cookie = await adminCookie({ ...TEST_ENV, ADMIN_SESSION_SECRET: 'other-secret' });
    assert.equal(await isAuthenticated(requestWithCookie(cookie), TEST_ENV), false);
});

test('requireAdmin: 쿠키 없으면 401 Response, 유효하면 null', async () => {
    const denied = await requireAdmin(requestWithCookie(''), TEST_ENV);
    assert.ok(denied instanceof Response);
    assert.equal(denied.status, 401);

    const allowed = await requireAdmin(requestWithCookie(await adminCookie()), TEST_ENV);
    assert.equal(allowed, null);
});

test('Discord 사용자 세션: 발급/검증 왕복 + 변조 거부', async () => {
    const user = { sub: 'u-100', username: 'tester', display_name: '테스터', roles: ['멤버'] };
    const cookie = await memberCookie(user);

    const session = await readUserSession(requestWithCookie(cookie), TEST_ENV);
    assert.equal(session.sub, 'u-100');
    assert.deepEqual(session.roles, ['멤버']);

    const tampered = cookie.slice(0, -4) + 'beef';
    assert.equal(await readUserSession(requestWithCookie(tampered), TEST_ENV), null);
});

test('constantTimeEqual: 기본 동작', () => {
    assert.equal(constantTimeEqual('abc', 'abc'), true);
    assert.equal(constantTimeEqual('abc', 'abd'), false);
    assert.equal(constantTimeEqual('abc', 'abcd'), false);
    assert.equal(constantTimeEqual(undefined, 'abc'), false);
});
