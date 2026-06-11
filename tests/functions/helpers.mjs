// Cloudflare Pages Functions 테스트용 공용 모의 바인딩.
// 실제 핸들러(onRequest*)를 그대로 import해서 Request/Response 수준으로 검증한다.

import { createSessionCookie } from '../../functions/_shared/auth.js';
import { createUserSession } from '../../functions/_shared/discord-auth.js';

export const TEST_ENV = {
    ADMIN_SESSION_SECRET: 'test-admin-secret',
    ADMIN_PASSWORD: 'correct-password',
    DISCORD_SESSION_SECRET: 'test-discord-secret'
};

// D1 모의: handler(sql, args, op)가 op별 결과를 돌려준다.
// op = 'first' → 행 객체 또는 null, 'all' → 행 배열, 'run' → 무시.
export function createMockDb(handler) {
    const calls = [];
    return {
        calls,
        prepare(sql) {
            let bound = [];
            const statement = {
                bind(...args) { bound = args; return statement; },
                async first() {
                    calls.push({ sql, args: bound, op: 'first' });
                    return (await handler(sql, bound, 'first')) ?? null;
                },
                async all() {
                    calls.push({ sql, args: bound, op: 'all' });
                    return { results: (await handler(sql, bound, 'all')) || [] };
                },
                async run() {
                    calls.push({ sql, args: bound, op: 'run' });
                    await handler(sql, bound, 'run');
                    return { success: true };
                }
            };
            return statement;
        }
    };
}

export function createMockKV() {
    const store = new Map();
    return {
        store,
        async get(key, options) {
            const value = store.get(key);
            if (value === undefined) return null;
            return options?.type === 'json' ? JSON.parse(value) : value;
        },
        async put(key, value) { store.set(key, String(value)); },
        async delete(key) { store.delete(key); }
    };
}

export function createMockR2() {
    return {
        puts: [],
        async put(key, bytes, options) {
            this.puts.push({ key, size: bytes.byteLength ?? bytes.length, options });
        }
    };
}

// Set-Cookie 문자열에서 요청 Cookie 헤더로 쓸 name=value 부분만 추출한다.
function cookiePair(setCookie) {
    return setCookie.split(';')[0];
}

export async function adminCookie(env = TEST_ENV) {
    return cookiePair(await createSessionCookie(env));
}

export async function memberCookie(user, env = TEST_ENV) {
    return cookiePair(await createUserSession(env, user));
}

export function jsonRequest(url, { method = 'POST', cookie = '', body } = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (cookie) headers.Cookie = cookie;
    return new Request(url, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body)
    });
}

export const PNG_BYTES = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
export const JPEG_BYTES = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);
