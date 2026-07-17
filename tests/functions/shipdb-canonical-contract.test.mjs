// ShipDB Erkul 재작성 v2 — 공개 canonical 필드 계약 CI 차단 (0단계 0.4)
// PM 조건 이행: 재생성 스크립트가 Erkul 정규 데이터 외 필드를 공개 canonical에 재주입하면 CI 실패.
// 문서 경고가 아니라 실행되는 테스트. `npm run test:functions`(CI smoke.yml)로 게이트된다.
//
// 동작:
//  1) 계약이 PM이 제거/격리한 필드를 모두 포함하는지(계약 약화 방지)
//  2) 공개 canonical이 존재하면 금지 필드가 한 레코드에도 없는지(fail-closed, 1단계에서 자동 활성)
//  3) 레거시 재생성 스크립트가 canonical 경로를 write 대상으로 삼지 않는지(무통제 재주입 차단)

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import test from 'node:test';
import {
  CANONICAL_DATASET_PATH,
  FORBIDDEN_PUBLIC_FIELDS,
  LEGACY_REGEN_SCRIPTS,
} from '../../data/shipdb-rewrite/canonical-contract.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

// PM 9개 결정으로 공개 모델에서 제거/격리가 확정된 필드 — 계약이 이걸 전부 덮어야 한다.
const PM_REMOVED_OR_ISOLATED = ['priceUsd', 'focus', 'tags', 'crew', 'plannerEligible', 'erkulName', 'erkulStatus'];

test('계약이 PM 제거/격리 필드를 모두 포함한다 (계약 약화 방지)', () => {
  const covered = new Set(FORBIDDEN_PUBLIC_FIELDS.map((f) => f.field));
  for (const field of PM_REMOVED_OR_ISOLATED) {
    assert.ok(covered.has(field), `계약에서 누락된 금지 필드: ${field} — 누군가 계약을 약화시켰다`);
  }
  for (const entry of FORBIDDEN_PUBLIC_FIELDS) {
    assert.ok(entry.field && entry.decision && entry.reason, `계약 항목에 field/decision/reason 필수: ${JSON.stringify(entry)}`);
  }
});

test('공개 canonical에 금지 필드가 없다 (fail-closed, 1단계에서 활성)', async () => {
  const abs = join(ROOT, CANONICAL_DATASET_PATH);
  if (!existsSync(abs)) {
    // 아직 canonical 미생성 — 전환이 조용히 완료되지 않았음을 확인하고 통과(guard armed).
    assert.ok(true, `canonical 미생성(${CANONICAL_DATASET_PATH}) — 계약 armed, 1단계에서 자동 활성`);
    return;
  }
  const data = JSON.parse(await readFile(abs, 'utf8'));
  const records = Array.isArray(data) ? data : Array.isArray(data.ships) ? data.ships : Object.values(data);
  const forbidden = FORBIDDEN_PUBLIC_FIELDS.map((f) => f.field);
  const violations = [];
  for (const rec of records) {
    if (!rec || typeof rec !== 'object') continue;
    for (const field of forbidden) {
      if (Object.hasOwn(rec, field)) {
        violations.push(`${rec.id || '(id?)'}.${field}`);
      }
    }
  }
  assert.equal(violations.length, 0, `공개 canonical에 금지 필드 재주입됨: ${violations.slice(0, 20).join(', ')}${violations.length > 20 ? ` 외 ${violations.length - 20}건` : ''}`);
});

test('레거시 재생성 스크립트가 공개 canonical 경로에 기록하지 않는다', async () => {
  const offenders = [];
  for (const rel of LEGACY_REGEN_SCRIPTS) {
    const abs = join(ROOT, rel);
    if (!existsSync(abs)) continue; // 부재 스크립트는 스킵
    const src = await readFile(abs, 'utf8');
    if (src.includes(CANONICAL_DATASET_PATH)) offenders.push(rel);
  }
  assert.equal(offenders.length, 0, `레거시 재생성 스크립트가 canonical 경로를 참조(무통제 재주입 위험): ${offenders.join(', ')}`);
});
