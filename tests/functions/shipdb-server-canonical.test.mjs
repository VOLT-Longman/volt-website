// ShipDB 서버측 canonical 단일 경로 계약 (R2 — 이중 분기 제거 후).
// 2.7에서 도입한 서버 플래그(canonicalServerOn / SHIPDB_CANONICAL_TEST)는 3.5-A 실전 ON 이후
// 되돌림 경로가 필요 없어져 제거했다. 여기서는 "canonical만 있는 상태"를 고정한다:
//  · override 공개 모델은 표시 이름·숨김만 담고 사양·분류·설명은 절대 싣지 않는다.
//  · override 입력은 canonical 소유 필드를 받으면 거부한다.
//  · AI 서버 reader는 canonical 계층만 읽는다.
//  · 플래그 잔재(파일·식별자)가 되살아나지 않는다.

import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import test from 'node:test';

import { mapShipOverride, shipOverrideInput } from '../../functions/_shared/cms.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => readFile(join(ROOT, p), 'utf8');
const exists = (p) => access(join(ROOT, p)).then(() => true, () => false);

const SOURCE_FIELDS = ['manufacturer', 'role', 'focus', 'size', 'crew', 'cargo', 'priceUsd',
  'implemented', 'plannerEligible', 'tags', 'description'];

test('mapShipOverride: 표시 이름·숨김만 방출하고 canonical 소유 필드는 싣지 않는다', () => {
  // D1에 레거시 컬럼 값이 남아 있어도(정지 데이터) 공개 모델에는 나오면 안 된다.
  const row = {
    ship_id: 'x', name: 'X', name_ko: '엑스', manufacturer: 'MISC', role: 'Medium Freight', focus: '화물',
    size: 'M', crew: '2명', cargo: '66 SCU', price_usd: 125, implemented: 1, planner_eligible: 1,
    tags: '["화물"]', description: 'd', hidden: 0, updated_at: 't'
  };
  const out = mapShipOverride(row);
  for (const f of SOURCE_FIELDS) assert.ok(!(f in out), `${f}는 생략돼야(칼럼에 값이 남아 있어도)`);
  assert.deepEqual(Object.keys(out).sort(), ['hidden', 'id', 'name', 'nameKo', 'shipId', 'updatedAt']);
  assert.equal(out.name, 'X');
  assert.equal(out.nameKo, '엑스');
  assert.equal(out.hidden, false);
});

test('shipOverrideInput: canonical 소유 필드를 보내면 거부한다', () => {
  const ok = shipOverrideInput('x', { name: 'X', nameKo: '엑스', hidden: true });
  assert.deepEqual(Object.keys(ok).sort(), ['hidden', 'name', 'name_ko', 'ship_id', 'updated_at']);
  assert.equal(ok.hidden, 1);
  for (const field of SOURCE_FIELDS) {
    assert.throws(() => shipOverrideInput('x', { name: 'X', [field]: 'v' }), /does not accept source overrides/,
      `${field}는 거부돼야`);
  }
});

test('AI 서버 reader: canonical 계층만 읽는다', async () => {
  const src = await read('functions/_shared/ai-tools.js');
  assert.ok(src.includes('/data/canonical/ships-canonical.json'), 'canonical 데이터셋 읽어야');
  assert.ok(src.includes('/data/canonical/operational-ships.json'), 'operational 레이어 읽어야');
  assert.ok(!src.includes("fetchAssetText(env, '/data/ship-live-stats.js')"), '레거시 live 레이어 fetch 잔존 금지');
  assert.ok(!src.includes("fetchAssetText(env, '/data/ship-market.js')"), '레거시 market 레이어 fetch 잔존 금지');
});

test('플래그 잔재 0: 파일·식별자가 되살아나지 않는다', async () => {
  assert.equal(await exists('functions/_shared/shipdb-canonical-flag.js'), false, '서버 플래그 파일은 삭제됨');
  const files = [
    'functions/_shared/cms.js', 'functions/api/ship-overrides.js',
    'functions/api/admin/ships/index.js', 'functions/api/admin/ships/[id].js',
    'js/shipdb-canonical.js', 'admin/admin.js',
  ];
  for (const f of files) {
    const src = await read(f);
    for (const token of ['canonicalServerOn', 'SHIPDB_CANONICAL_TEST', '__VOLT_SHIPDB_CANONICAL_TEST__', 'CANONICAL_ENABLED']) {
      assert.ok(!src.includes(token), `${f}에 ${token} 잔존 금지`);
    }
  }
});
