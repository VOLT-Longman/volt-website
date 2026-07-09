import test from 'node:test';
import assert from 'node:assert/strict';

import { onRequestGet as shipOverridesPublic } from '../../functions/api/ship-overrides.js';
import { onRequest as shipsAdmin } from '../../functions/api/admin/ships/index.js';
import { TEST_ENV, adminCookie, createMockDb, jsonRequest } from './helpers.mjs';

// D-5: 커버리지 공백 메우기 — 공개 ship-overrides GET(leadership/timeline과 동일한
// try/catch DB-실패 폴백 패턴이 있는데 유일하게 무테스트였음)과 admin/ships 목록(GET)을 검증한다.

test('공개 ship-overrides GET: 정상 조회 → items 매핑 + public 캐시 헤더', async () => {
    const rows = [{
        ship_id: 'ares-inferno', name: 'Ares Inferno', name_ko: '앤빌 아레스 인페르노',
        manufacturer: null, role: null, focus: null, size: null, crew: null, cargo: null,
        price_usd: null, implemented: null, planner_eligible: null, tags: null, description: null,
        hidden: 0, updated_at: '2026-07-09T00:00:00.000Z'
    }];
    const db = createMockDb((sql) => (sql.startsWith('SELECT') ? rows : []));
    const env = { ...TEST_ENV, DB: db };
    const response = await shipOverridesPublic({ env });
    assert.equal(response.status, 200);
    assert.match(response.headers.get('Cache-Control') || '', /public/);
    const body = await response.json();
    assert.equal(body.items.length, 1);
    assert.equal(body.items[0].shipId, 'ares-inferno');
    assert.equal(body.items[0].nameKo, '앤빌 아레스 인페르노');
    assert.equal(body.items[0].hidden, false);
});

test('공개 ship-overrides GET: DB 예외 시 500이 아닌 200 + 빈 items + no-store', async () => {
    const db = createMockDb(() => { throw new Error('D1 unavailable'); });
    const env = { ...TEST_ENV, DB: db };
    const response = await shipOverridesPublic({ env });
    assert.equal(response.status, 200);
    assert.match(response.headers.get('Cache-Control') || '', /no-store/);
    const body = await response.json();
    assert.deepEqual(body.items, []);
    assert.equal(body.warning, 'ship_overrides unavailable');
});

test('공개 ship-overrides GET: hidden=true 함선도 그대로 노출(숨김 필터링은 프런트 책임)', async () => {
    const rows = [{ ship_id: 'x', name: null, name_ko: null, hidden: 1, updated_at: 't' }];
    const db = createMockDb((sql) => (sql.startsWith('SELECT') ? rows : []));
    const env = { ...TEST_ENV, DB: db };
    const response = await shipOverridesPublic({ env });
    const body = await response.json();
    assert.equal(body.items[0].hidden, true);
});

test('admin/ships GET: 비인증 → 401, DB 접근 없음', async () => {
    const db = createMockDb(() => []);
    const env = { ...TEST_ENV, DB: db };
    const response = await shipsAdmin({ request: jsonRequest('https://volt.ceo/api/admin/ships', { method: 'GET' }), env });
    assert.equal(response.status, 401);
    assert.equal(db.calls.length, 0);
});

test('admin/ships GET: 인증 시 ship_id 오름차순 목록 반환', async () => {
    const rows = [
        { ship_id: 'b-ship', name: 'B', name_ko: null, hidden: 0, updated_at: 't' },
        { ship_id: 'a-ship', name: 'A', name_ko: null, hidden: 0, updated_at: 't' }
    ];
    const db = createMockDb((sql) => (sql.startsWith('SELECT') ? rows : []));
    const env = { ...TEST_ENV, DB: db };
    const request = jsonRequest('https://volt.ceo/api/admin/ships', { method: 'GET', cookie: await adminCookie() });
    const response = await shipsAdmin({ request, env });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.items.length, 2);
    const select = db.calls.find((call) => call.sql.startsWith('SELECT'));
    assert.match(select.sql, /ORDER BY ship_id ASC/);
});

test('admin/ships: 지원하지 않는 메서드(POST) → 405', async () => {
    const env = { ...TEST_ENV, DB: createMockDb(() => []) };
    const request = jsonRequest('https://volt.ceo/api/admin/ships', { method: 'POST', cookie: await adminCookie(), body: {} });
    const response = await shipsAdmin({ request, env });
    assert.equal(response.status, 405);
});
