// ShipDB 필터 분류(2축) — 데이터 계약 (PM 확정 지시서 §5). canonical size·role + Erkul 직접 필드만.
//  · canonical 원문 역할 전부 매핑됨 or 미분류 사유 있음. 매핑 없는 역할은 자동 태그 생성 금지.
//  · 카드 역할 태그는 taxonomy에서만. focus/tags/career 참조 0. RSI 공식 30척도 같은 계약에 포함.
//  · 지상은 Erkul calculatorType==='vehicle'(직접 필드)로만 — 추론 아님.

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import test from 'node:test';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => readFile(join(ROOT, p), 'utf8');

async function load() {
  return {
    canon: JSON.parse(await read('data/canonical/ships-canonical.json')),
    rsi: JSON.parse(await read('data/canonical/ships-rsi-official.json')),
    tax: JSON.parse(await read('data/canonical/ship-filter-taxonomy.json')),
  };
}

test('taxonomy: 공개 함선 원문 역할 전수 = 매핑됨 ∪ 미분류(둘 다인 역할 0)', async () => {
  const { canon, rsi, tax } = await load();
  const distinct = [...new Set([
    ...canon.ships.map((ship) => ship.role),
    ...rsi.records.map((record) => record.rsi?.role),
  ].filter((role) => role && String(role).trim()))].sort();
  const unmappedSet = new Set(tax.unmapped.map((u) => u.role));
  const roleTagKeys = new Set(tax.axes.role.tags.map((t) => t.key));
  const problems = [];
  for (const r of distinct) {
    const tags = tax.roleTagMap[r] || [];
    const mapped = tags.length > 0;
    const unmapped = unmappedSet.has(r);
    if (mapped && unmapped) problems.push(`${r}: 매핑·미분류 동시`);
    if (!mapped && !unmapped) problems.push(`${r}: 매핑·미분류 둘 다 아님(자동 태그 금지 위반 소지)`);
    for (const t of tags) if (!roleTagKeys.has(t)) problems.push(`${r}: 알 수 없는 태그 ${t}`);
  }
  // 미분류는 반드시 사유가 있어야
  for (const u of tax.unmapped) if (!u.reason) problems.push(`${u.role}: 미분류 사유 없음`);
  assert.equal(problems.length, 0, problems.slice(0, 15).join(', '));
});

test('taxonomy: roleTagMap 키가 공개 함선 역할 집합과 정확히 일치(잉여 자동태그 0)', async () => {
  const { canon, rsi, tax } = await load();
  const distinct = new Set([
    ...canon.ships.map((ship) => ship.role),
    ...rsi.records.map((record) => record.rsi?.role),
  ].filter(Boolean));
  const extra = Object.keys(tax.roleTagMap).filter((r) => !distinct.has(r));
  assert.equal(extra.length, 0, `canonical에 없는 역할 태그 키: ${extra.slice(0, 10).join(', ')}`);
});

test('taxonomy: 다중 태그 정확(§4) — 의료·급유·회수·복합', async () => {
  const { tax } = await load();
  const m = tax.roleTagMap;
  assert.deepEqual([...m.Medical].sort(), ['medical', 'support']);
  assert.deepEqual([...m['Light Refueling']].sort(), ['refuel', 'support']);
  assert.deepEqual([...m['Heavy Refueling']].sort(), ['refuel', 'support']);
  assert.deepEqual([...m.Recovery].sort(), ['salvage', 'support']);
  assert.deepEqual([...m['Light Freight / Medium Fighter']].sort(), ['cargo', 'combat']);
  assert.deepEqual([...m['Medium Freight / Gun Ship']].sort(), ['cargo', 'combat']);
});

test('taxonomy: 규모 매핑 S1~S6 전수 + 지상은 canonical.platform으로(taxonomy는 raw 미참조)', async () => {
  const { tax } = await load();
  for (const s of ['S1', 'S2', 'S3', 'S4', 'S5', 'S6']) assert.ok(tax.axes.size.map[s], `size ${s} 매핑 필요`);
  // 지상 판정은 canonical.platform 소유(B-2). taxonomy는 platformGroundIds를 보관하지 않는다.
  assert.ok(!('platformGroundIds' in tax), 'platformGroundIds는 canonical.platform으로 이동돼 제거돼야');
  assert.ok(tax.axes.size.platform && tax.axes.size.platform.key === 'ground', '지상 태그 정의는 유지');
  // (지상 함선 정확성·분포는 erkul-platform.test.mjs가 canonical.platform으로 검증)
});

test('taxonomy: 생성기가 레거시 focus/tags/career/설명/가격을 참조하지 않는다', async () => {
  const gen = await read('scripts/shipdb-rewrite/build-ship-filter-taxonomy.mjs');
  assert.ok(gen.includes('ships-canonical.json'), '생성기는 canonical(size·role·platform)만 읽는다');
  // taxonomy 생성기는 raw/ships.raw를 읽지 않는다(platform은 canonical 소유). 레거시·raw 입력 금지.
  for (const forbidden of ['volt-data', 'ship-en', 'ship-prices-usd', 'rsi-ship-matrix-index', 'ships.raw', '.focus', '.tags', '.career', 'priceUsd']) {
    assert.ok(!gen.includes(forbidden), `금지 입력 참조: ${forbidden}`);
  }
});

test('taxonomy: RSI 공식 30척도 같은 역할·규모 계약으로 필터링된다', async () => {
  const { canon, rsi, tax } = await load();
  const canonSet = new Set(canon.ships.map((s) => s.id));
  const overlap = rsi.records.filter((record) => canonSet.has(record.id)).map((record) => record.id);
  assert.equal(overlap.length, 0, `RSI가 Erkul canonical에 중복: ${overlap.join(', ')}`);
  for (const record of rsi.records) {
    const role = record.rsi.role;
    assert.ok(tax.roleTagMap[role]?.length, `RSI 역할 태그 누락: ${record.id} (${role})`);
  }
  assert.equal(tax.summary.platformCount.ground, 35, 'RSI vehicle 2척이 지상 축에 반영돼야');
});
