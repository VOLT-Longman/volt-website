// ShipDB 필터 분류(2축) — 데이터 계약 (PM 확정 지시서 §5). canonical size·role + Erkul 직접 필드만.
//  · canonical 원문 역할 전부 매핑됨 or 미분류 사유 있음. 매핑 없는 역할은 자동 태그 생성 금지.
//  · 카드 역할 태그는 taxonomy에서만. focus/tags/career 참조 0. RSI 30척 미유입.
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
    tax: JSON.parse(await read('data/canonical/ship-filter-taxonomy.json')),
  };
}

test('taxonomy: canonical 원문 역할 전수 = 매핑됨 ∪ 미분류(둘 다인 역할 0)', async () => {
  const { canon, tax } = await load();
  const distinct = [...new Set(canon.ships.map((s) => s.role).filter((r) => r && String(r).trim()))].sort();
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

test('taxonomy: roleTagMap 키가 canonical 역할 집합과 정확히 일치(잉여 자동태그 0)', async () => {
  const { canon, tax } = await load();
  const distinct = new Set(canon.ships.map((s) => s.role).filter(Boolean));
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

test('taxonomy: 규모 매핑 S1~S6 전수 + 지상은 Erkul calculator 직접필드로만', async () => {
  const { canon, tax } = await load();
  for (const s of ['S1', 'S2', 'S3', 'S4', 'S5', 'S6']) assert.ok(tax.axes.size.map[s], `size ${s} 매핑 필요`);
  // 지상 = calculatorType==='vehicle' 정확 일치(추론 아님)
  const raw = JSON.parse(await read('data/external/erkul/ships.raw.json'));
  const ops = JSON.parse(await read('data/canonical/operational-ships.json'));
  const calc = {}; for (const r of raw) calc[r.localName] = r.calculatorType;
  const lname = {}; for (const r of ops.records) lname[r.id] = r.erkulLocalName;
  const expectGround = canon.ships.filter((s) => calc[lname[s.id]] === 'vehicle').map((s) => s.id).sort();
  assert.deepEqual([...tax.platformGroundIds].sort(), expectGround, '지상 id가 calculatorType=vehicle와 불일치');
});

test('taxonomy: 생성기가 레거시 focus/tags/career/설명/가격을 참조하지 않는다', async () => {
  const gen = await read('scripts/shipdb-rewrite/build-ship-filter-taxonomy.mjs');
  assert.ok(gen.includes('ships-canonical.json'));
  assert.ok(gen.includes('calculatorType'), '지상은 Erkul calculatorType 직접필드 사용');
  for (const forbidden of ['volt-data', 'ship-en', 'ship-prices-usd', 'rsi-ship-matrix-index', '.focus', '.tags', '.career', 'priceUsd']) {
    assert.ok(!gen.includes(forbidden), `금지 입력 참조: ${forbidden}`);
  }
});

test('taxonomy: RSI 공식 카탈로그 30척이 필터 분류에 유입되지 않는다', async () => {
  const { canon, tax } = await load();
  const rsi = JSON.parse(await read('data/canonical/ships-rsi-official.json'));
  const canonSet = new Set(canon.ships.map((s) => s.id));
  const leaked = rsi.records.filter((r) => canonSet.has(r.id)).map((r) => r.id);
  assert.equal(leaked.length, 0, `RSI가 canonical에 유입: ${leaked.join(', ')}`);
  const rsiInGround = rsi.records.filter((r) => tax.platformGroundIds.includes(r.id)).map((r) => r.id);
  assert.equal(rsiInGround.length, 0, `RSI가 지상 목록에 유입: ${rsiInGround.join(', ')}`);
});
