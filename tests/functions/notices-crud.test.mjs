import test from 'node:test';
import assert from 'node:assert/strict';

import { onRequest } from '../../functions/api/admin/notices/index.js';
import { onRequest as onRequestId } from '../../functions/api/admin/notices/[id].js';
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
        id: 'n1', title: '제목', content: '내용', tag: '공지', titleEn: '', contentEn: '', tagEn: '', pinned: true, published: true, date: '2026-06-10', updatedAt: ''
    });
});

test('공지 API: GET → EN 필드 매핑 + KO 유지', async () => {
    const rows = [
        { id: 'n2', title: '제목', content: '내용', tag: '작전', title_en: 'Title', content_en: 'Body', tag_en: 'Operation', pinned: 0, published: 1, date: '2026-07-01', created_at: 'x' }
    ];
    const env = { ...TEST_ENV, DB: createMockDb(() => rows) };
    const request = jsonRequest('https://volt.ceo/api/admin/notices', { method: 'GET', cookie: await adminCookie() });
    const response = await onRequest({ request, env });
    const { items } = await response.json();
    assert.equal(items[0].title, '제목');
    assert.equal(items[0].titleEn, 'Title');
    assert.equal(items[0].contentEn, 'Body');
    assert.equal(items[0].tagEn, 'Operation');
});

test('공지 API: POST → EN 필드 INSERT 바인딩', async () => {
    const db = createMockDb(() => []);
    const env = { ...TEST_ENV, DB: db };
    const request = jsonRequest('https://volt.ceo/api/admin/notices', {
        cookie: await adminCookie(),
        body: { title: '한글', content: '본문', tag: '공지', titleEn: 'English', contentEn: 'EN body', tagEn: 'Notice' }
    });
    const response = await onRequest({ request, env });
    assert.equal(response.status, 201);
    const insert = db.calls.find((call) => call.sql.startsWith('INSERT INTO notices'));
    assert.ok(insert.sql.includes('title_en'), 'INSERT에 title_en 포함');
    // 컬럼 순서: id,title,content,tag,title_en,content_en,tag_en,...
    assert.equal(insert.args[4], 'English');
    assert.equal(insert.args[5], 'EN body');
    assert.equal(insert.args[6], 'Notice');
    const { item } = await response.json();
    assert.equal(item.titleEn, 'English');
});

test('공지 API: POST → EN 미제공 시 null 저장(KO만)', async () => {
    const db = createMockDb(() => []);
    const env = { ...TEST_ENV, DB: db };
    const request = jsonRequest('https://volt.ceo/api/admin/notices', {
        cookie: await adminCookie(),
        body: { title: '한글만', content: '본문' }
    });
    const response = await onRequest({ request, env });
    assert.equal(response.status, 201);
    const insert = db.calls.find((call) => call.sql.startsWith('INSERT INTO notices'));
    assert.equal(insert.args[4], null);
    assert.equal(insert.args[5], null);
    assert.equal(insert.args[6], null);
});

test('공지 API: POST → 빈 EN 문자열은 null로 통일', async () => {
    const db = createMockDb(() => []);
    const env = { ...TEST_ENV, DB: db };
    const request = jsonRequest('https://volt.ceo/api/admin/notices', {
        cookie: await adminCookie(),
        body: { title: '한글', content: '본문', titleEn: '   ', contentEn: '' }
    });
    const response = await onRequest({ request, env });
    assert.equal(response.status, 201);
    const insert = db.calls.find((call) => call.sql.startsWith('INSERT INTO notices'));
    assert.equal(insert.args[4], null);
    assert.equal(insert.args[5], null);
});

test('공지 API: POST → 잘못된 EN 타입 → 422, INSERT 미실행', async () => {
    const db = createMockDb(() => []);
    const env = { ...TEST_ENV, DB: db };
    const request = jsonRequest('https://volt.ceo/api/admin/notices', {
        cookie: await adminCookie(),
        body: { title: '한글', content: '본문', titleEn: { bad: 'object' } }
    });
    const response = await onRequest({ request, env });
    assert.equal(response.status, 422);
    assert.equal(db.calls.some((call) => call.op === 'run'), false);
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
    // 컬럼 순서: id,title,content,tag,title_en,content_en,tag_en,pinned,published,date,...
    const [id, title, content, tag, titleEn, contentEn, tagEn, pinned, published] = insert.args;
    assert.match(id, /^notice-/);
    assert.equal(title, '새 공지');
    assert.equal(content, '본문');
    assert.equal(tag, '작전');
    assert.equal(titleEn, null);
    assert.equal(contentEn, null);
    assert.equal(tagEn, null);
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

test('공지 API: PUT → EN 필드 UPDATE 바인딩 + KO 유지', async () => {
    const existing = { id: 'n9', title: 'old', content: 'old', tag: '공지', created_at: 'c', updated_at: 'u1' };
    const db = createMockDb((_sql, _args, op) => (op === 'first' ? existing : []));
    const env = { ...TEST_ENV, DB: db };
    const request = jsonRequest('https://volt.ceo/api/admin/notices/n9', {
        method: 'PUT',
        cookie: await adminCookie(),
        body: { title: 'new', content: 'body', titleEn: 'New EN', contentEn: 'EN body', tagEn: 'Notice' }
    });
    const response = await onRequestId({ request, env, params: { id: 'n9' } });
    assert.equal(response.status, 200);
    const update = db.calls.find((call) => call.sql.startsWith('UPDATE notices'));
    assert.ok(update.sql.includes('title_en'), 'UPDATE에 title_en 포함');
    // UPDATE 컬럼 순서: title,content,tag,title_en,content_en,tag_en,...
    assert.equal(update.args[0], 'new');
    assert.equal(update.args[3], 'New EN');
    assert.equal(update.args[4], 'EN body');
    assert.equal(update.args[5], 'Notice');
});

test('noticeInput: 기본값 채움(tag 공지, published 1, 날짜 자동)', () => {
    const item = noticeInput({ title: 't', content: 'c' });
    assert.equal(item.tag, '공지');
    assert.equal(item.published, 1);
    assert.equal(item.pinned, 0);
    assert.match(item.date, /^\d{4}-\d{2}-\d{2}$/);
});
