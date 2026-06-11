import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// 관리자 폼 라벨 회귀 방지: CONFIG에 등록된 모든 필드는 LABELS에 라벨이 있어야 한다.
// 누락 시 폼에 "undefined" 라벨이 노출된다 (협력함대 region/game에서 실제 발생했던 버그).
test('admin.js: CONFIG의 모든 필드가 LABELS에 정의되어 있음', () => {
    const src = readFileSync(new URL('../../admin/admin.js', import.meta.url), 'utf8');

    const labelsBlock = src.match(/const LABELS = \{([\s\S]*?)\};/);
    assert.ok(labelsBlock, 'LABELS 블록을 찾을 수 없음');
    const labelKeys = new Set([...labelsBlock[1].matchAll(/^\s*(\w+):/gm)].map((m) => m[1]));

    const shipFieldsBlock = src.match(/const SHIP_EDIT_FIELDS = \[([^\]]*)\]/);
    assert.ok(shipFieldsBlock, 'SHIP_EDIT_FIELDS를 찾을 수 없음');

    const inlineFieldArrays = [...src.matchAll(/fields: \[([^\]]*)\]/g)].map((m) => m[1]);
    const allFields = new Set(
        [...inlineFieldArrays, shipFieldsBlock[1]]
            .flatMap((list) => [...list.matchAll(/'(\w+)'/g)].map((m) => m[1]))
    );

    const missing = [...allFields].filter((field) => !labelKeys.has(field));
    assert.deepEqual(missing, [], `LABELS에 누락된 필드: ${missing.join(', ')}`);
});
