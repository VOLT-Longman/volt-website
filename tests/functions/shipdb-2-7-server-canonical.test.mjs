// ShipDB 재작성 2.7 — 서버측 canonical 이관 고정 (PM B). 실전 ON·삭제 전 안전장치:
//  · 서버 canonical 플래그 기본 OFF(이용자/URL로 못 켬).
//  · AI 서버 reader가 canonical 3계층을 읽고 레거시 live 레이어를 읽지 않는다.
//  · CMS 공개 reader(mapShipOverride)가 canonical ON에서 사실원/제거 필드를 생략한다(기본 OFF=불변).
//  · 레거시 재생성 4스크립트 봉인은 canonical-contract가 별도 강제.

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import test from 'node:test';

import { canonicalServerOn } from '../../functions/_shared/shipdb-canonical-flag.js';
import { mapShipOverride } from '../../functions/_shared/cms.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => readFile(join(ROOT, p), 'utf8');

test('서버 canonical 플래그: 기본 OFF, env 테스트 훅으로만 ON', () => {
  assert.equal(canonicalServerOn(undefined), false, '플래그 인자 없음 → OFF');
  assert.equal(canonicalServerOn({}), false, '기본 OFF');
  assert.equal(canonicalServerOn({ SHIPDB_CANONICAL_TEST: 'true' }), true, '테스트 훅 → ON');
  assert.equal(canonicalServerOn({ SHIPDB_CANONICAL_TEST: '1' }), false, "정확히 'true'만 ON");
});

test('AI 서버 reader: canonical 3계층을 읽고 레거시 live 레이어를 읽지 않는다', async () => {
  const src = await read('functions/_shared/ai-tools.js');
  assert.ok(src.includes('/data/canonical/ships-canonical.json'), 'canonical 데이터셋 읽어야');
  assert.ok(src.includes('/data/canonical/operational-ships.json'), 'operational 레이어 읽어야');
  assert.ok(!src.includes("fetchAssetText(env, '/data/ship-live-stats.js')"), '레거시 live 레이어 fetch 잔존 금지');
  assert.ok(!src.includes("fetchAssetText(env, '/data/ship-market.js')"), '레거시 market 레이어 fetch 잔존 금지');
});

test('CMS mapShipOverride: OFF=레거시 필드 전부, ON=사실원/제거 필드(role·focus·crew·cargo·priceUsd·tags) 생략', () => {
  const row = {
    ship_id: 'x', name: 'X', name_ko: '엑스', manufacturer: 'MISC', role: '중형 화물선', focus: '화물',
    size: 'M', crew: '2명', cargo: '66 SCU', price_usd: 125, implemented: 1, planner_eligible: 1,
    tags: '["화물"]', description: 'd', hidden: 0, updated_at: 't'
  };
  const omitted = ['role', 'focus', 'crew', 'cargo', 'priceUsd', 'tags'];
  const off = mapShipOverride(row);
  for (const f of omitted) assert.ok(f in off, `OFF에 ${f} 있어야(기준선 불변)`);
  assert.equal(off.priceUsd, 125);
  const on = mapShipOverride(row, { canonical: true });
  for (const f of omitted) assert.ok(!(f in on), `ON에서 ${f} 생략돼야`);
  // 비-사실(표시·운영) override는 유지
  for (const f of ['name', 'nameKo', 'manufacturer', 'size', 'implemented', 'plannerEligible', 'description', 'hidden']) {
    assert.ok(f in on, `ON에 ${f} 유지돼야`);
  }
});
