import test from 'node:test';
import assert from 'node:assert/strict';

import { onRequest as shipItem } from '../../functions/api/admin/ships/[id].js';
import { mapShipOverride, shipOverrideInput } from '../../functions/_shared/cms.js';
import { TEST_ENV, adminCookie, createMockDb, jsonRequest } from './helpers.mjs';

// 함선 CMS 확장(0010): 한글/영문 함선명(name_ko/name) + 사이트 숨김(hidden) 왕복 계약.

test('shipOverrideInput: nameKo/name/hidden 정규화', () => {
    const input = shipOverrideInput('ares-inferno', { name: 'Ares Inferno', nameKo: '앤빌 아레스 인페르노', hidden: true });
    assert.equal(input.name, 'Ares Inferno');
    assert.equal(input.name_ko, '앤빌 아레스 인페르노');
    assert.equal(input.hidden, 1);
});

test('shipOverrideInput: hidden 미지정 → null(설정 안 함), 빈 이름 → null', () => {
    const input = shipOverrideInput('100i', { name: '', nameKo: '' });
    assert.equal(input.name, null);
    assert.equal(input.name_ko, null);
    assert.equal(input.hidden, null);
});

test('mapShipOverride: name_ko/hidden 컬럼을 nameKo/hidden으로 노출', () => {
    const mapped = mapShipOverride({ ship_id: 'x', name: 'X', name_ko: '엑스', hidden: 1, updated_at: 't' });
    assert.equal(mapped.nameKo, '엑스');
    assert.equal(mapped.hidden, true);
    const unset = mapShipOverride({ ship_id: 'y', name: null, name_ko: null, hidden: null });
    assert.equal(unset.nameKo, null);
    assert.equal(unset.hidden, null);
});

test('함선 PUT: nameKo/name/hidden 저장 → INSERT에 컬럼 포함 + 응답 반영', async () => {
    const db = createMockDb((sql) => {
        if (sql.includes('SELECT updated_at FROM ship_overrides')) return null; // 신규
        return [];
    });
    const env = { ...TEST_ENV, DB: db };
    const request = jsonRequest('https://volt.ceo/api/admin/ships/ares-inferno', {
        method: 'PUT',
        cookie: await adminCookie(),
        body: { name: 'Ares Inferno', nameKo: '앤빌 아레스 인페르노', hidden: true }
    });
    const response = await shipItem({ request, env, params: { id: 'ares-inferno' } });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.item.nameKo, '앤빌 아레스 인페르노');
    assert.equal(body.item.name, 'Ares Inferno');
    assert.equal(body.item.hidden, true);
    const insert = db.calls.find((call) => call.sql.startsWith('INSERT INTO ship_overrides'));
    assert.ok(insert, 'INSERT 실행됨');
    assert.match(insert.sql, /name_ko/);
    assert.match(insert.sql, /hidden/);
});

test('함선 PUT: 숨김 해제(hidden=false) → 0으로 저장', async () => {
    const db = createMockDb((sql) => (sql.includes('SELECT updated_at') ? null : []));
    const env = { ...TEST_ENV, DB: db };
    const request = jsonRequest('https://volt.ceo/api/admin/ships/100i', {
        method: 'PUT',
        cookie: await adminCookie(),
        body: { hidden: false }
    });
    const response = await shipItem({ request, env, params: { id: '100i' } });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.item.hidden, false);
});
