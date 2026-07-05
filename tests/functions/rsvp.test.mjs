import test from 'node:test';
import assert from 'node:assert/strict';

import { onRequest } from '../../functions/api/events/[id]/rsvp.js';
import { TEST_ENV, createMockDb, createMockKV, jsonRequest, memberCookie } from './helpers.mjs';

const MEMBER = { sub: 'discord-42', username: 'tester', display_name: '테스터', roles: ['멤버'] };

// 이벤트 존재 + RSVP 목록을 흉내내는 기본 DB 핸들러.
function eventDbHandler({ eventExists = true, rsvps = [] } = {}) {
    return (sql) => {
        if (sql.includes('FROM events')) return eventExists ? { id: 'evt-1' } : null;
        if (sql.includes('FROM event_rsvps')) return rsvps;
        return null;
    };
}

function rsvpRequest({ cookie = '', method = 'POST', body = { status: '참가' } } = {}) {
    return jsonRequest('https://volt.ceo/api/events/evt-1/rsvp', { method, cookie, body });
}

test('RSVP: 비로그인 → 401', async () => {
    const env = { ...TEST_ENV, RATE_LIMIT_KV: createMockKV(), DB: createMockDb(eventDbHandler()) };
    const response = await onRequest({ request: rsvpRequest(), env, params: { id: 'evt-1' } });
    assert.equal(response.status, 401);
});

test('RSVP: 역할 없는 사용자(비멤버) → 403', async () => {
    const env = { ...TEST_ENV, RATE_LIMIT_KV: createMockKV(), DB: createMockDb(eventDbHandler()) };
    const cookie = await memberCookie({ ...MEMBER, roles: [] });
    const response = await onRequest({ request: rsvpRequest({ cookie }), env, params: { id: 'evt-1' } });
    assert.equal(response.status, 403);
});

test('RSVP: 존재하지 않는 이벤트 → 404', async () => {
    const env = { ...TEST_ENV, RATE_LIMIT_KV: createMockKV(), DB: createMockDb(eventDbHandler({ eventExists: false })) };
    const cookie = await memberCookie(MEMBER);
    const response = await onRequest({ request: rsvpRequest({ cookie }), env, params: { id: 'evt-1' } });
    assert.equal(response.status, 404);
});

test('RSVP: 허용되지 않는 상태값 → 422', async () => {
    const env = { ...TEST_ENV, RATE_LIMIT_KV: createMockKV(), DB: createMockDb(eventDbHandler()) };
    const cookie = await memberCookie(MEMBER);
    const response = await onRequest({
        request: rsvpRequest({ cookie, body: { status: '<script>' } }),
        env,
        params: { id: 'evt-1' }
    });
    assert.equal(response.status, 422);
});

test('RSVP: 정상 등록 — user_sub는 세션에서만 결정(IDOR 방지) + 집계 반환', async () => {
    const storedRow = {
        id: 'rsvp-1', event_id: 'evt-1', user_sub: MEMBER.sub,
        display_name: '테스터', status: '참가', updated_at: '2026-06-10T00:00:00Z'
    };
    const db = createMockDb(eventDbHandler({ rsvps: [storedRow] }));
    const env = { ...TEST_ENV, RATE_LIMIT_KV: createMockKV(), DB: db };
    const cookie = await memberCookie(MEMBER);

    // 본문으로 다른 사용자의 user_sub를 주입 시도해도 무시되어야 한다.
    const response = await onRequest({
        request: rsvpRequest({ cookie, body: { status: '참가', user_sub: 'victim-1', userSub: 'victim-1' } }),
        env,
        params: { id: 'evt-1' }
    });
    assert.equal(response.status, 200);

    const insert = db.calls.find((call) => call.sql.includes('INSERT INTO event_rsvps'));
    assert.ok(insert, 'INSERT 쿼리가 실행되어야 함');
    assert.equal(insert.args[1], 'evt-1');
    assert.equal(insert.args[2], MEMBER.sub, 'user_sub는 세션 값이어야 함');
    assert.equal(insert.args[4], '참가');

    const body = await response.json();
    assert.equal(body.counts['참가'], 1);
    assert.equal(body.items[0].displayName, '테스터');
    assert.equal(Object.prototype.hasOwnProperty.call(body.items[0], 'user_sub'), false, '응답에 user_sub 미노출');
});

test('RSVP: 허용되지 않은 메서드 → 405', async () => {
    const env = { ...TEST_ENV, RATE_LIMIT_KV: createMockKV(), DB: createMockDb(eventDbHandler()) };
    const response = await onRequest({ request: rsvpRequest({ method: 'DELETE' }), env, params: { id: 'evt-1' } });
    assert.equal(response.status, 405);
});
