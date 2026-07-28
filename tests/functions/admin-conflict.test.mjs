import test from 'node:test';
import assert from 'node:assert/strict';

import { onRequest as noticeItem } from '../../functions/api/admin/notices/[id].js';
import { onRequest as shipItem } from '../../functions/api/admin/ships/[id].js';
import { hasUpdateConflict } from '../../functions/_shared/cms.js';
import { TEST_ENV, adminCookie, createMockDb, jsonRequest } from './helpers.mjs';

// 동시 편집 안전장치(낙관적 잠금): 수정 시작 시점의 updatedAt(expectedUpdatedAt)이
// 현재 행과 다르면 409 — 다른 관리자의 저장을 조용히 덮어쓰지 않는다.

const NOTICE_ROW = {
    id: 'n1', title: '기존 제목', content: '기존 내용', tag: '공지',
    pinned: 0, published: 1, date: '2026-06-10',
    created_at: '2026-06-10T00:00:00.000Z', updated_at: '2026-06-20T10:00:00.000Z'
};

function noticeEnv() {
    const db = createMockDb((sql) => {
        if (sql.startsWith('SELECT')) return NOTICE_ROW;
        return [];
    });
    return { db, env: { ...TEST_ENV, DB: db } };
}

test('공지 PUT: expectedUpdatedAt 불일치 → 409 + UPDATE 미실행', async () => {
    const { db, env } = noticeEnv();
    const request = jsonRequest('https://volt.ceo/api/admin/notices/n1', {
        method: 'PUT',
        cookie: await adminCookie(),
        body: { title: '수정 제목', content: '수정 내용', expectedUpdatedAt: '2026-06-19T09:00:00.000Z' }
    });
    const response = await noticeItem({ request, env, params: { id: 'n1' } });
    assert.equal(response.status, 409);
    const body = await response.json();
    assert.match(body.error, /다른 관리자가 먼저 저장/);
    assert.equal(db.calls.some((call) => call.sql.startsWith('UPDATE')), false);
});

test('공지 PUT: expectedUpdatedAt 일치 → 200 + UPDATE 실행', async () => {
    const { db, env } = noticeEnv();
    const request = jsonRequest('https://volt.ceo/api/admin/notices/n1', {
        method: 'PUT',
        cookie: await adminCookie(),
        body: { title: '수정 제목', content: '수정 내용', expectedUpdatedAt: NOTICE_ROW.updated_at }
    });
    const response = await noticeItem({ request, env, params: { id: 'n1' } });
    assert.equal(response.status, 200);
    assert.equal(db.calls.some((call) => call.sql.startsWith('UPDATE')), true);
});

test('공지 PUT: expectedUpdatedAt 미제공(구버전 호환) → 기존처럼 저장', async () => {
    const { db, env } = noticeEnv();
    const request = jsonRequest('https://volt.ceo/api/admin/notices/n1', {
        method: 'PUT',
        cookie: await adminCookie(),
        body: { title: '수정 제목', content: '수정 내용' }
    });
    const response = await noticeItem({ request, env, params: { id: 'n1' } });
    assert.equal(response.status, 200);
    assert.equal(db.calls.some((call) => call.sql.startsWith('UPDATE')), true);
});

test('함선 PUT: 기존 override와 expectedUpdatedAt 불일치 → 409', async () => {
    const db = createMockDb((sql) => {
        if (sql.includes('SELECT updated_at FROM ship_overrides')) {
            return { updated_at: '2026-06-20T10:00:00.000Z' };
        }
        return [];
    });
    const env = { ...TEST_ENV, DB: db };
    const request = jsonRequest('https://volt.ceo/api/admin/ships/aurora-es', {
        method: 'PUT',
        cookie: await adminCookie(),
        body: { role: '새 역할', expectedUpdatedAt: '2026-06-19T09:00:00.000Z' }
    });
    const response = await shipItem({ request, env, params: { id: 'aurora-es' } });
    assert.equal(response.status, 409);
    assert.equal(db.calls.some((call) => call.sql.startsWith('INSERT INTO ship_overrides')), false);
});

test('함선 PUT: 신규 override(기존 없음) + 빈 expectedUpdatedAt → 저장 성공', async () => {
    const db = createMockDb((sql) => {
        if (sql.includes('SELECT updated_at FROM ship_overrides')) return null;
        return [];
    });
    const env = { ...TEST_ENV, DB: db };
    const request = jsonRequest('https://volt.ceo/api/admin/ships/aurora-es', {
        method: 'PUT',
        cookie: await adminCookie(),
        body: { nameKo: '오로라 ES', expectedUpdatedAt: '' }
    });
    const response = await shipItem({ request, env, params: { id: 'aurora-es' } });
    assert.equal(response.status, 200);
    assert.equal(db.calls.some((call) => call.sql.startsWith('INSERT INTO ship_overrides')), true);
});

test('함선 PUT: source override를 거부하고 이름·숨김만 저장한다', async () => {
    const db = createMockDb((sql) => {
        if (sql.includes('SELECT updated_at FROM ship_overrides')) return null;
        return [];
    });
    const env = { ...TEST_ENV, DB: db };
    const rejected = await shipItem({
        request: jsonRequest('https://volt.ceo/api/admin/ships/aurora-es', {
            method: 'PUT',
            cookie: await adminCookie(),
            body: { role: 'Combat' }
        }),
        env,
        params: { id: 'aurora-es' }
    });
    assert.equal(rejected.status, 422);

    const accepted = await shipItem({
        request: jsonRequest('https://volt.ceo/api/admin/ships/aurora-es', {
            method: 'PUT',
            cookie: await adminCookie(),
            body: { nameKo: '오로라 ES', hidden: false }
        }),
        env,
        params: { id: 'aurora-es' }
    });
    assert.equal(accepted.status, 200);
    const write = db.calls.find((call) => call.sql.startsWith('INSERT INTO ship_overrides'));
    assert.match(write.sql, /name, name_ko, hidden, updated_at/);
    assert.doesNotMatch(write.sql, /manufacturer, role/);
});

test('hasUpdateConflict: 미제공/일치/불일치 판정', () => {
    assert.equal(hasUpdateConflict({}, { updated_at: 'x' }), false);
    assert.equal(hasUpdateConflict({ expectedUpdatedAt: 'x' }, { updated_at: 'x' }), false);
    assert.equal(hasUpdateConflict({ expectedUpdatedAt: 'y' }, { updated_at: 'x' }), true);
    assert.equal(hasUpdateConflict({ expectedUpdatedAt: '' }, {}), false);
    assert.equal(hasUpdateConflict({ expectedUpdatedAt: '' }, { updated_at: 'x' }), true);
});
