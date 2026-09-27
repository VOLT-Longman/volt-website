import { createSqliteDb } from './sqlite-d1.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';

import { checkRateLimit, enforceRateLimit } from '../../functions/_shared/rate-limit.js';
import { onRequestPost as shareBriefing } from '../../functions/api/briefing/share.js';
import { onRequest as rsvpHandler } from '../../functions/api/events/[id]/rsvp.js';
import { onRequest as preferencesHandler } from '../../functions/api/me/preferences.js';
import { TEST_ENV, createMockDb, createMockKV, jsonRequest, memberCookie } from './helpers.mjs';

const MEMBER = { sub: 'discord-42', username: 'tester', display_name: '테스터', roles: ['멤버'] };

test('rate-limit: 20 parallel requests reserve exactly one slot before commit', async () => {
    const env = { DB: createSqliteDb() };
    const gates = await Promise.all(Array.from({ length: 20 }, () => checkRateLimit(env, 'k', { limit: 1, windowSeconds: 30 })));
    assert.equal(gates.filter((gate) => !gate.limited).length, 1);
});

test('rate-limit: release is idempotent and cannot decrement a newer window', async () => {
    const env = { DB: createSqliteDb() };
    const first = await checkRateLimit(env, 'k', { limit: 1, windowSeconds: 30 });
    await first.release();
    await first.release();
    assert.equal((await env.DB.prepare('SELECT count FROM security_limits WHERE key = ?').bind('k').first()).count, 0);
    const second = await checkRateLimit(env, 'k', { limit: 1, windowSeconds: 30 });
    await env.DB.prepare('UPDATE security_limits SET reset_at = 0').run();
    assert.equal((await checkRateLimit(env, 'k', { limit: 1, windowSeconds: 60 })).limited, false);
    await second.release();
    assert.equal((await checkRateLimit(env, 'k', { limit: 1, windowSeconds: 60 })).limited, true);
});

test('rate-limit: an expired window permits a new request without KV', async () => {
    const env = { DB: createSqliteDb() };
    assert.equal(await enforceRateLimit(env, 'k', { limit: 1, windowSeconds: 30 }), null);
    assert.equal((await enforceRateLimit(env, 'k', { limit: 1, windowSeconds: 30 })).status, 429);
    await env.DB.prepare('UPDATE security_limits SET reset_at = 0').run();
    assert.equal(await enforceRateLimit(env, 'k', { limit: 1, windowSeconds: 30 }), null);
});

test('briefing: 웹훅 실패(502) 시 쿨다운을 소비하지 않아 재시도 가능', async (t) => {
    const originalFetch = globalThis.fetch;
    t.after(() => { globalThis.fetch = originalFetch; });

    const env = {
        ...TEST_ENV,
        RATE_LIMIT_KV: createMockKV(),
        DISCORD_OPERATION_WEBHOOK_URL: 'https://discord.example/webhook'
    };
    const cookie = await memberCookie(MEMBER, env);
    const request = () => jsonRequest('https://volt.ceo/api/briefing/share', { cookie, body: { text: '브리핑' } });

    globalThis.fetch = async () => new Response('fail', { status: 500 });
    const failed = await shareBriefing({ request: request(), env });
    assert.equal(failed.status, 502);

    globalThis.fetch = async () => new Response(null, { status: 204 });
    const retried = await shareBriefing({ request: request(), env });
    assert.equal(retried.status, 200, '실패한 시도는 쿨다운을 태우지 않아야 함');

    const blocked = await shareBriefing({ request: request(), env });
    assert.equal(blocked.status, 429, '성공 후에는 쿨다운 적용');
});

test('RSVP: 분당 한도 초과 시 429', async () => {
    const env = {
        ...TEST_ENV,
        RATE_LIMIT_KV: createMockKV(),
        DB: createMockDb((sql) => {
            if (sql.includes('FROM events')) return { id: 'evt-1' };
            if (sql.includes('FROM event_rsvps')) return [];
            return null;
        })
    };
    const cookie = await memberCookie(MEMBER, env);
    const request = () => jsonRequest('https://volt.ceo/api/events/evt-1/rsvp', { cookie, body: { status: '참가' } });

    for (let i = 0; i < 10; i += 1) {
        const response = await rsvpHandler({ request: request(), env, params: { id: 'evt-1' } });
        assert.equal(response.status, 200, `${i + 1}번째 요청은 허용`);
    }
    const blocked = await rsvpHandler({ request: request(), env, params: { id: 'evt-1' } });
    assert.equal(blocked.status, 429);
});

test('preferences: 분당 한도 초과 시 429', async () => {
    const env = {
        ...TEST_ENV,
        RATE_LIMIT_KV: createMockKV(),
        DB: createMockDb(() => null)
    };
    const cookie = await memberCookie(MEMBER, env);
    const request = () => jsonRequest('https://volt.ceo/api/me/preferences', {
        method: 'PUT', cookie, body: { favorites: [], planner: {} }
    });

    for (let i = 0; i < 30; i += 1) {
        const response = await preferencesHandler({ request: request(), env });
        assert.equal(response.status, 200, `${i + 1}번째 저장은 허용`);
    }
    const blocked = await preferencesHandler({ request: request(), env });
    assert.equal(blocked.status, 429);
});
