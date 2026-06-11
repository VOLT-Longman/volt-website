import test from 'node:test';
import assert from 'node:assert/strict';

import { onRequest } from '../../functions/api/admin/notices/index.js';
import { noticeInput } from '../../functions/_shared/cms.js';
import { TEST_ENV, adminCookie, createMockDb, jsonRequest } from './helpers.mjs';

test('공지 API: 비인증 GET/POST → 401, DB 접근 없음', async () => {
    const db = createMockDb(() => []);
    const env = { ...TEST_ENV, DB: db };
    for (const method of ['GET', 'POST']) {
        const request = jsonRequest('https://volt.ceo/api/admin/notices', {
            method,
            body: method === 'GET' ? undefined : {}
        });
        const response = await onRequest({ request, env });
        assert.equal(response.status, 401);
    }
    assert.equal(db.calls.length, 0);
});

test('공지 API: GET → 행을 공개 형태로 매핑', async () => {
    const rows = [
        { id: 'n1', title: '제목', content: '내용', tag: null, pinned: 1, published: 1, date: '2026-06-10', created_at: 'x' }
    ];
    const env = { ...TEST_ENV, DB: createMockDb(() => rows) };
    const request = jsonRequest('https://volt.ceo/api/admin/notices', { method: 'GET', cookie: await adminCookie() });
    const response = await onRequest({ request, env });
    assert.equal(response.status, 200);
    const { items } = await response.json();
    assert.deepEqual(items[0], {
        id: 'n1', title: '제목', content: '내용', tag: '공지', pinned: true, published: true, date: '2026-06-10'
    });
});

test('공지 API: POST → INSERT 바인딩 값 검증 + 201', async () => {
    const db = createMockDb(() => []);
    const env = { ...TEST_ENV, DB: db };
    const request = jsonRequest('https://volt.ceo/api/admin/notices', {
        cookie: await adminCookie(),
        body: { title: '새 공지', content: '본문', tag: '작전', pinned: true }
    });
    const response = await onRequest({ request, env });
    assert.equal(response.status, 201);

    const insert = db.calls.find((call) => call.sql.startsWith('INSERT INTO notices'));
    assert.ok(insert, 'INSERT 쿼리가 실행되어야 함');
    const [id, title, content, tag, pinned, published] = insert.args;
    assert.match(id, /^notice-/);
    assert.equal(title, '새 공지');
    assert.equal(content, '본문');
    assert.equal(tag, '작전');
    assert.equal(pinned, 1);
    assert.equal(published, 1);
});

test('공지 API: 제목 누락 → 422, INSERT 미실행', async () => {
    const db = createMockDb(() => []);
    const env = { ...TEST_ENV, DB: db };
    const request = jsonRequest('https://volt.ceo/api/admin/notices', {
        cookie: await adminCookie(),
        body: { content: '제목 없는 공지' }
    });
    const response = await onRequest({ request, env });
    assert.equal(response.status, 422);
    assert.equal(db.calls.some((call) => call.op === 'run'), false);
});

test('공지 API: 제목 길이 제한(200자) 초과 → 422', async () => {
    const env = { ...TEST_ENV, DB: createMockDb(() => []) };
    const request = jsonRequest('https://volt.ceo/api/admin/notices', {
        cookie: await adminCookie(),
        body: { title: 'a'.repeat(201), content: 'x' }
    });
    const response = await onRequest({ request, env });
    assert.equal(response.status, 422);
});

test('공지 API: 허용되지 않은 메서드 → 405', async () => {
    const env = { ...TEST_ENV, DB: createMockDb(() => []) };
    const request = jsonRequest('https://volt.ceo/api/admin/notices', { method: 'DELETE', cookie: await adminCookie() });
    const response = await onRequest({ request, env });
    assert.equal(response.status, 405);
});

test('noticeInput: 기본값 채움(tag 공지, published 1, 날짜 자동)', () => {
    const item = noticeInput({ title: 't', content: 'c' });
    assert.equal(item.tag, '공지');
    assert.equal(item.published, 1);
    assert.equal(item.pinned, 0);
    assert.match(item.date, /^\d{4}-\d{2}-\d{2}$/);
});
