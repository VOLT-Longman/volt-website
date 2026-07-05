import test from 'node:test';
import assert from 'node:assert/strict';

import { checkRateLimit, enforceRateLimit } from '../../functions/_shared/rate-limit.js';
import { onRequestPost as shareBriefing } from '../../functions/api/briefing/share.js';
import { onRequest as rsvpHandler } from '../../functions/api/events/[id]/rsvp.js';
import { onRequest as preferencesHandler } from '../../functions/api/me/preferences.js';
import { TEST_ENV, createMockDb, createMockKV, jsonRequest, memberCookie } from './helpers.mjs';

const MEMBER = { sub: 'discord-42', username: 'tester', display_name: '테스터', roles: ['멤버'] };

// put 옵션(expirationTtl)까지 기록하는 KV 래퍼 — TTL 하한 검증용.
function createRecordingKV() {
    const kv = createMockKV();
    const puts = [];
    const originalPut = kv.put.bind(kv);
    kv.put = async (key, value, options) => {
        puts.push({ key, options });
        return originalPut(key, value, options);
    };
    kv.puts = puts;
    return kv;
}

test('rate-limit: 윈도우 내 limit 초과 시 limited', async () => {
    const env = { RATE_LIMIT_KV: createMockKV() };
    for (let i = 0; i < 3; i += 1) {
        const gate = await checkRateLimit(env, 'k', { limit: 3, windowSeconds: 60 });
        assert.equal(gate.limited, false, `${i + 1}번째 시도는 허용`);
        await gate.commit();
    }
    const fourth = await checkRateLimit(env, 'k', { limit: 3, windowSeconds: 60 });
    assert.equal(fourth.limited, true, '4번째 시도는 차단');
});

test('rate-limit: commit하지 않은 시도는 소비되지 않음', async () => {
    const env = { RATE_LIMIT_KV: createMockKV() };
    for (let i = 0; i < 5; i += 1) {
        const gate = await checkRateLimit(env, 'k', { limit: 1, windowSeconds: 30 });
        assert.equal(gate.limited, false, 'commit 전에는 계속 허용');
    }
});

test('rate-limit: 윈도우 경과 후 다시 허용 (resetAt 기준)', async () => {
    const kv = createMockKV();
    const env = { RATE_LIMIT_KV: kv };
    await enforceRateLimit(env, 'k', { limit: 1, windowSeconds: 30 });
    assert.equal((await checkRateLimit(env, 'k', { limit: 1, windowSeconds: 30 })).limited, true);

    // 저장된 resetAt을 과거로 되감아 윈도우 만료를 시뮬레이션한다.
    const stored = JSON.parse(kv.store.get('k'));
    stored.resetAt = Date.now() - 1000;
    kv.store.set('k', JSON.stringify(stored));

    assert.equal((await checkRateLimit(env, 'k', { limit: 1, windowSeconds: 30 })).limited, false);
});

test('rate-limit: KV expirationTtl은 항상 60초 이상 (Cloudflare KV 하한)', async () => {
    const kv = createRecordingKV();
    const env = { RATE_LIMIT_KV: kv };
    await enforceRateLimit(env, 'k', { limit: 1, windowSeconds: 30 });
    assert.ok(kv.puts.length > 0);
    for (const { options } of kv.puts) {
        assert.ok(options.expirationTtl >= 60, `TTL ${options.expirationTtl}은 60 이상이어야 함`);
    }
});

test('briefing: 웹훅 실패(502) 시 쿨다운을 소비하지 않아 재시도 가능', async (t) => {
    const originalFetch = globalThis.fetch;
    t.after(() => { globalThis.fetch = originalFetch; });

    const env = {
        ...TEST_ENV,
        RATE_LIMIT_KV: createMockKV(),
        DISCORD_OPERATION_WEBHOOK_URL: 'https://discord.example/webhook'
    };
    const cookie = await memberCookie(MEMBER);
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
    const cookie = await memberCookie(MEMBER);
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
    const cookie = await memberCookie(MEMBER);
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
