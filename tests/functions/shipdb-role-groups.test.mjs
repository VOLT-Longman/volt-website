// ShipDB 역할군 태그 — 데이터 계약 (PM). 재도입된 역할군은 canonical role만 사실원으로 쓴다.
//  · canonical distinct role 전수가 정확히 한 역할군에 매핑(누락 0, 중복 0).
//  · 219 canonical 함선 각각이 정확히 한 역할군에 속함.
//  · 생성기가 레거시 focus/tags/career를 입력으로 참조하지 않음(수기 분류 복원 금지).
//  · RSI 공식 카탈로그(별도)가 역할군 매핑에 유입되지 않음.

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import test from 'node:test';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => readFile(join(ROOT, p), 'utf8');

test('역할군: canonical distinct role 전수 매핑(누락 0, 중복 0, 8그룹만)', async () => {
  const canon = JSON.parse(await read('data/canonical/ships-canonical.json'));
  const rg = JSON.parse(await read('data/canonical/role-groups.json'));
  const distinct = [...new Set(canon.ships.map((s) => s.role).filter((r) => r && String(r).trim()))].sort();
  const groupKeys = new Set(rg.groups.map((g) => g.key));

  assert.equal(rg.summary.missing, 0);
  assert.equal(rg.summary.duplicate, 0);
  assert.equal(rg.groups.length, 8, `8개 역할군 기대, 실제 ${rg.groups.length}`);

  const missing = distinct.filter((r) => !rg.roles[r]);
  assert.equal(missing.length, 0, `역할군 매핑 누락: ${missing.slice(0, 15).join(', ')}`);
  // 각 role은 정확히 하나의 유효 그룹키(중복·잘못된 키 없음)
  const badKey = distinct.filter((r) => !groupKeys.has(rg.roles[r]));
  assert.equal(badKey.length, 0, `유효하지 않은 그룹키: ${badKey.slice(0, 10).join(', ')}`);
  // 잉여(캐논에 없는) 매핑 키 0
  const canonSet = new Set(distinct);
  const extra = Object.keys(rg.roles).filter((r) => !canonSet.has(r));
  assert.equal(extra.length, 0, `canonical에 없는 role 키: ${extra.slice(0, 10).join(', ')}`);
});

test('역할군: 219 canonical 함선 각각이 정확히 한 역할군', async () => {
  const canon = JSON.parse(await read('data/canonical/ships-canonical.json'));
  const rg = JSON.parse(await read('data/canonical/role-groups.json'));
  const noGroup = [];
  for (const s of canon.ships) {
    const g = s.role ? rg.roles[s.role] : null;
    if (!g) noGroup.push(s.id);
  }
  assert.equal(noGroup.length, 0, `역할군 없는 함선: ${noGroup.slice(0, 15).join(', ')}`);
});

test('역할군: 레거시 focus/tags/career를 입력으로 참조하지 않는다(수기 분류 복원 금지)', async () => {
  const gen = await read('scripts/shipdb-rewrite/build-role-groups.mjs');
  // 생성기가 사실원으로 읽는 것은 ships-canonical.json[].role뿐.
  assert.ok(gen.includes('ships-canonical.json'), '생성기가 canonical role을 읽어야');
  for (const forbidden of ['volt-data', 'ship-en', 'rsi-ship-matrix-index', 'ship-prices-usd', '.focus', '.tags', '.career']) {
    assert.ok(!gen.includes(forbidden), `생성기가 레거시/비role 입력(${forbidden})을 참조하면 안 됨`);
  }
});

test('역할군: RSI 공식 카탈로그가 역할군 매핑에 유입되지 않는다(별도 카탈로그)', async () => {
  const rsi = JSON.parse(await read('data/canonical/ships-rsi-official.json'));
  const rg = JSON.parse(await read('data/canonical/role-groups.json'));
  const canon = JSON.parse(await read('data/canonical/ships-canonical.json'));
  const canonSet = new Set(canon.ships.map((s) => s.id));
  // RSI 카탈로그 함선 id는 canonical에 없다(역할군 대상 아님)
  const leaked = rsi.records.filter((r) => canonSet.has(r.id)).map((r) => r.id);
  assert.equal(leaked.length, 0, `RSI 카탈로그가 canonical에 유입: ${leaked.join(', ')}`);
  // role-groups는 canonical role만 키로 가진다(RSI role 문자열이 섞이지 않음은 위 잉여키 0으로 보장)
  assert.ok(Object.keys(rg.roles).length > 0);
});
