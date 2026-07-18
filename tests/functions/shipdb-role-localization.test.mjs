// ShipDB 재작성 role 이관 — role KO 지역화 완전성 (PM 계약).
//  · canonical의 모든 distinct role이 KO 번역을 가진다(missing 0). cutover 차단 조건.
//  · localization-roles.roles가 canonical distinct role 집합과 정확히 1:1(잉여·누락 0).
//  · KO는 사실 불변 표기 계층 — 각 role에 비어있지 않은 KO. 사실원은 canonical role(Erkul EN).

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import test from 'node:test';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => readFile(join(ROOT, p), 'utf8');

test('role KO: canonical distinct role 전체 커버(missing 0, 1:1)', async () => {
  const canon = JSON.parse(await read('data/canonical/ships-canonical.json'));
  const loc = JSON.parse(await read('data/canonical/localization-roles.json'));
  const distinct = [...new Set(canon.ships.map((s) => s.role).filter((r) => r && String(r).trim()))].sort();

  // 요약 일관성
  assert.equal(loc.summary.total, distinct.length, `summary.total=${loc.summary.total}, 실제 distinct=${distinct.length}`);
  assert.equal(loc.summary.missing, 0, `missing 0 기대, 실제 ${loc.summary.missing}`);
  assert.equal(loc.summary.extraUnusedKeys, 0, `잉여 미사용 키 0 기대, 실제 ${loc.summary.extraUnusedKeys}`);

  // 누락: canonical role인데 KO 없음
  const missing = distinct.filter((r) => !loc.roles[r] || !String(loc.roles[r]).trim());
  assert.equal(missing.length, 0, `KO 누락 role: ${missing.slice(0, 15).join(', ')}`);

  // 잉여: 표에만 있고 canonical에 없는 role(사실 집합과 1:1이어야)
  const canonSet = new Set(distinct);
  const extra = Object.keys(loc.roles).filter((r) => !canonSet.has(r));
  assert.equal(extra.length, 0, `canonical에 없는 잉여 role 키: ${extra.slice(0, 15).join(', ')}`);
});

test('role KO: 사실원 격리 — localization-roles는 canonical role만 참조(VOLT 수기/career 조합 아님)', async () => {
  const loc = JSON.parse(await read('data/canonical/localization-roles.json'));
  // 소스 표기가 canonical role임을 명시(운영 문서화 계약).
  assert.equal(loc.layer, 'localization-roles');
  assert.ok(String(loc.source).includes('ships-canonical'), 'source가 canonical role 파생임을 명시해야');
  // 모든 KO 값이 문자열 비어있지 않음
  const bad = Object.entries(loc.roles).filter(([, v]) => typeof v !== 'string' || !v.trim()).map(([k]) => k);
  assert.equal(bad.length, 0, `빈 KO: ${bad.join(', ')}`);
});
