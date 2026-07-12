import test from 'node:test';
import assert from 'node:assert/strict';

import { ensureNoticesEnColumns } from '../../functions/_shared/notices.js';
import { onRequest as noticesIndex } from '../../functions/api/admin/notices/index.js';
import { onRequest as noticesItem } from '../../functions/api/admin/notices/[id].js';
import { TEST_ENV, adminCookie, createMockDb, jsonRequest } from './helpers.mjs';

// D-3: notices.title_en/content_en/tag_en(0008)이 미적용된 D1에서도 admin 공지 작성/수정이
// "no such column" 500으로 죽지 않아야 한다(leadership/partner-fleets와 동일한 런타임 방어 필요).
// ensureNoticesEnColumns는 ships.js의 ensureShipOverridesTable과 동일하게 ALTER를 시도하고
// 이미 컬럼이 있으면(= "duplicate column" 에러)만 조용히 무시한다.
//
// 주의: isolate당 1회만 실행되도록 모듈 스코프 플래그로 캐시하므로(운영 목적 — 매 요청 ALTER는
// D1 쓰기 락 경합의 원인), 이 파일 안의 테스트는 실행 순서에 의도적으로 의존한다(node:test 기본
// 순차 실행). 뒤 테스트일수록 "이미 ensure된 isolate" 상태를 검증한다.

test('ensureNoticesEnColumns: 중복 컬럼 외 DDL 실패는 전파', async () => {
    const db = createMockDb((sql) => {
        if (sql.startsWith('ALTER TABLE notices ADD COLUMN')) throw new Error('D1 unavailable');
        return [];
    });
    await assert.rejects(ensureNoticesEnColumns(db), /D1 unavailable/);
});

test('ensureNoticesEnColumns: ALTER 3회 시도, 중복 컬럼 에러만 무시', async () => {
    const db = createMockDb((sql) => {
        if (sql.startsWith('ALTER TABLE notices ADD COLUMN')) {
            throw new Error('duplicate column name: title_en'); // 0008 이미 적용된 상태 시뮬레이션
        }
        return [];
    });
    await assert.doesNotReject(ensureNoticesEnColumns(db));
    const alters = db.calls.filter((call) => call.sql.startsWith('ALTER TABLE notices'));
    assert.equal(alters.length, 3);
    assert.ok(alters.some((call) => call.sql.includes('title_en')));
    assert.ok(alters.some((call) => call.sql.includes('content_en')));
    assert.ok(alters.some((call) => call.sql.includes('tag_en')));
});

test('공지 POST: 0008 미적용(ALTER가 매번 필요) D1에서도 201로 정상 생성', async () => {
    const db = createMockDb((sql) => {
        if (sql.startsWith('ALTER TABLE notices ADD COLUMN')) return []; // 컬럼 없음 → 이번엔 성공(실제 추가됨)
        if (sql.startsWith('INSERT INTO notices')) return [];
        return [];
    });
    const env = { ...TEST_ENV, DB: db };
    const request = jsonRequest('https://volt.ceo/api/admin/notices', {
        method: 'POST',
        cookie: await adminCookie(),
        body: { title: '제목', content: '내용', tag: '공지', date: '2026-07-09' }
    });
    const response = await noticesIndex({ request, env });
    assert.equal(response.status, 201);
    const insert = db.calls.find((call) => call.sql.startsWith('INSERT INTO notices'));
    assert.ok(insert, 'INSERT가 ALTER 이후 실행됨');
});

test('공지 PUT: isolate 재사용(이미 ensure됨) 시 ALTER 재시도 없이 200으로 정상 수정', async () => {
    // 위 테스트에서 이미 ensureNoticesEnColumns가 1회 실행됐다(모듈 스코프 캐시 플래그) —
    // 실제 Cloudflare isolate 재사용과 동일한 조건. 여기서는 ALTER가 재호출되지 않아야 한다.
    const existingRow = {
        id: 'n1', title: '기존', content: '기존 내용', tag: '공지',
        pinned: 0, published: 1, date: '2026-07-09',
        created_at: '2026-07-09T00:00:00.000Z', updated_at: '2026-07-09T00:00:00.000Z'
    };
    const db = createMockDb((sql) => {
        if (sql.startsWith('SELECT * FROM notices')) return existingRow;
        return [];
    });
    const env = { ...TEST_ENV, DB: db };
    const request = jsonRequest('https://volt.ceo/api/admin/notices/n1', {
        method: 'PUT',
        cookie: await adminCookie(),
        body: { title: '수정 제목', content: '수정 내용', expectedUpdatedAt: existingRow.updated_at }
    });
    const response = await noticesItem({ request, env, params: { id: 'n1' } });
    assert.equal(response.status, 200);
    assert.equal(db.calls.some((call) => call.sql.startsWith('ALTER TABLE notices')), false, 'isolate 재사용 시 ALTER 재시도 없음');
    assert.equal(db.calls.some((call) => call.sql.startsWith('UPDATE notices')), true);
});
