import test from 'node:test';
import assert from 'node:assert/strict';

import { onRequestPost } from '../../functions/api/admin/login.js';
import { TEST_ENV, createMockKV, jsonRequest } from './helpers.mjs';

function loginRequest(password, ip = '203.0.113.1') {
    const request = jsonRequest('https://volt.ceo/api/admin/login', { body: { password } });
    request.headers.set('CF-Connecting-IP', ip);
    return request;
}

test('로그인: 올바른 비밀번호 → 200 + 세션 쿠키 발급', async () => {
    const env = { ...TEST_ENV, RATE_LIMIT_KV: createMockKV() };
    const response = await onRequestPost({ request: loginRequest('correct-password'), env });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true });
    assert.match(response.headers.get('Set-Cookie') || '', /^volt_admin_session=admin\./);
});

test('로그인: 잘못된 비밀번호 → 401 + 실패 카운트 기록', async () => {
    const kv = createMockKV();
    const env = { ...TEST_ENV, RATE_LIMIT_KV: kv };
    const response = await onRequestPost({ request: loginRequest('nope'), env });
    assert.equal(response.status, 401);
    // D-4: 공유 rate-limit 모듈 저장 형태({count, resetAt}) — locked 여부는 count>=limit로 매 요청 계산.
    const stored = await kv.get('login_fail:203.0.113.1', { type: 'json' });
    assert.equal(stored.count, 1);
    assert.equal(typeof stored.resetAt, 'number');
});

test('로그인: 5회 실패 시 잠금 → 이후 올바른 비밀번호도 429', async () => {
    const kv = createMockKV();
    const env = { ...TEST_ENV, RATE_LIMIT_KV: kv };

    for (let attempt = 0; attempt < 5; attempt += 1) {
        const response = await onRequestPost({ request: loginRequest('nope'), env });
        assert.equal(response.status, 401);
    }
    const stored = await kv.get('login_fail:203.0.113.1', { type: 'json' });
    assert.equal(stored.count, 5);

    const locked = await onRequestPost({ request: loginRequest('correct-password'), env });
    assert.equal(locked.status, 429);
});

test('로그인: IP별로 잠금이 분리됨', async () => {
    const kv = createMockKV();
    const env = { ...TEST_ENV, RATE_LIMIT_KV: kv };
    for (let attempt = 0; attempt < 5; attempt += 1) {
        await onRequestPost({ request: loginRequest('nope', '198.51.100.7'), env });
    }
    const otherIp = await onRequestPost({ request: loginRequest('correct-password', '203.0.113.9'), env });
    assert.equal(otherIp.status, 200);
});

test('로그인: 성공 시 실패 카운트 초기화', async () => {
    const kv = createMockKV();
    const env = { ...TEST_ENV, RATE_LIMIT_KV: kv };
    await onRequestPost({ request: loginRequest('nope'), env });
    const success = await onRequestPost({ request: loginRequest('correct-password'), env });
    assert.equal(success.status, 200);
    assert.equal(await kv.get('login_fail:203.0.113.1'), null);
});

test('로그인: 본문이 JSON이 아니어도 500이 아닌 401', async () => {
    const env = { ...TEST_ENV, RATE_LIMIT_KV: createMockKV() };
    const request = new Request('https://volt.ceo/api/admin/login', { method: 'POST', body: 'not-json' });
    const response = await onRequestPost({ request, env });
    assert.equal(response.status, 401);
});
