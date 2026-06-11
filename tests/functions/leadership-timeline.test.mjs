import test from 'node:test';
import assert from 'node:assert/strict';

import { onRequest as leadershipAdmin } from '../../functions/api/admin/leadership/index.js';
import { onRequest as timelineAdmin } from '../../functions/api/admin/timeline/index.js';
import { onRequestGet as leadershipPublic } from '../../functions/api/leadership.js';
import { onRequestGet as timelinePublic } from '../../functions/api/timeline.js';
import { leaderInput, timelineInput, mapLeader } from '../../functions/_shared/cms.js';
import { TEST_ENV, adminCookie, createMockDb, jsonRequest } from './helpers.mjs';

test('임원진/연혁 관리 API: 비인증 → 401, DB 접근 없음', async () => {
    const db = createMockDb(() => []);
    const env = { ...TEST_ENV, DB: db };
    for (const handler of [leadershipAdmin, timelineAdmin]) {
        const response = await handler({ request: jsonRequest('https://volt.ceo/api/admin/x', { method: 'GET' }), env });
        assert.equal(response.status, 401);
    }
    assert.equal(db.calls.length, 0);
});

test('임원진 API: POST → INSERT 바인딩 + 201', async () => {
    const db = createMockDb(() => []);
    const env = { ...TEST_ENV, DB: db };
    const request = jsonRequest('https://volt.ceo/api/admin/leadership', {
        cookie: await adminCookie(),
        body: { name: '아마그란데', role: '인사·재무 이사', discord: '@amagrande', sortOrder: 5 }
    });
    const response = await leadershipAdmin({ request, env });
    assert.equal(response.status, 201);
    const insert = db.calls.find((call) => call.sql.includes('INSERT INTO leadership_members'));
    assert.equal(insert.args[1], '아마그란데');
    assert.equal(insert.args[2], '인사·재무 이사');
    const { item } = await response.json();
    assert.equal(item.sortOrder, 5);
});

test('임원진 API: 이름 누락 → 422', async () => {
    const env = { ...TEST_ENV, DB: createMockDb(() => []) };
    const request = jsonRequest('https://volt.ceo/api/admin/leadership', {
        cookie: await adminCookie(),
        body: { role: '이사' }
    });
    const response = await leadershipAdmin({ request, env });
    assert.equal(response.status, 422);
});

test('연혁 API: 제목/날짜 필수, 정상 입력 시 201', async () => {
    const db = createMockDb(() => []);
    const env = { ...TEST_ENV, DB: db };
    const missing = await timelineAdmin({
        request: jsonRequest('https://volt.ceo/api/admin/timeline', { cookie: await adminCookie(), body: { title: '제목만' } }),
        env
    });
    assert.equal(missing.status, 422);

    const created = await timelineAdmin({
        request: jsonRequest('https://volt.ceo/api/admin/timeline', {
            cookie: await adminCookie(),
            body: { dateLabel: '2956.06', title: '새 이정표', description: '설명' }
        }),
        env
    });
    assert.equal(created.status, 201);
    const { item } = await created.json();
    assert.equal(item.date, '2956.06');
});

test('공개 API: 테이블 미존재(마이그레이션 전) → 빈 목록 + warning으로 폴백', async () => {
    const env = { ...TEST_ENV, DB: createMockDb(() => { throw new Error('no such table'); }) };
    for (const handler of [leadershipPublic, timelinePublic]) {
        const response = await handler({ env });
        assert.equal(response.status, 200);
        const body = await response.json();
        assert.deepEqual(body.items, []);
        assert.ok(body.warning);
    }
});

test('mapLeader: extras JSON의 details/competencies 파싱 + 깨진 JSON 무시', () => {
    const row = {
        id: 'ceo', name: '롱만', role: 'CEO', published: 1, sort_order: 1,
        extras: '{"details":[{"title":"리더십","content":"내용"}],"competencies":["전략"]}'
    };
    const mapped = mapLeader(row);
    assert.equal(mapped.details[0].title, '리더십');
    assert.deepEqual(mapped.competencies, ['전략']);

    const broken = mapLeader({ ...row, extras: '{invalid' });
    assert.equal(broken.details, undefined);
});

test('leaderInput: 수정 시 extras 보존', () => {
    const existing = { id: 'ceo', extras: '{"competencies":["전략"]}', created_at: '2026-01-01' };
    const item = leaderInput({ name: '롱만', role: 'CEO' }, existing);
    assert.equal(item.extras, '{"competencies":["전략"]}');
    assert.equal(item.id, 'ceo');
    assert.equal(item.created_at, '2026-01-01');
});

test('timelineInput: date/dateLabel 별칭 허용 + 길이 제한', () => {
    assert.equal(timelineInput({ title: 't', date: '2955.08' }).date_label, '2955.08');
    assert.equal(timelineInput({ title: 't', dateLabel: '2955.09' }).date_label, '2955.09');
    assert.throws(() => timelineInput({ title: 'x'.repeat(201), dateLabel: 'd' }));
});
