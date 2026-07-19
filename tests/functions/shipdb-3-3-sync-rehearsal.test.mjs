// ShipDB 재작성 3.3 — 동기화 연결 리허설 (PM). 전환 전 검증:
//  · canonical이 Erkul live 레이어(ship-live-stats·ship-market)에서 파생됨을 재확인(드리프트/수기 편집 차단).
//    → Erkul 동기화 → canonical 재생성 체인이 결정론적임을 CI로 고정.
//  · 레거시 재생성 스크립트가 canonical을 재주입하지 못함(계약: canonical-contract.test.mjs가 별도 강제).
//  · Safe Apply previewHash 로직 존재 재확인(erkul-sync-preview.test.mjs가 별도 강제).
// 실제 라이브 Erkul fetch·Safe Apply apply는 Cloudflare/운영 환경 필요 — 리허설은 파생 정합까지.

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import test from 'node:test';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => readFile(join(ROOT, p), 'utf8');
async function loadGlobals(file) {
  const ctx = vm.createContext({ window: {} });
  vm.runInContext(await read(file), ctx);
  return { ...ctx, ...ctx.window };
}

test('canonical은 Erkul live 레이어에서 파생된다(드리프트/수기 편집 0)', async () => {
  const LIVE = (await loadGlobals('data/ship-live-stats.js')).VOLT_SHIP_LIVE_STATS;
  const MARKET = (await loadGlobals('data/ship-market.js')).VOLT_SHIP_MARKET;
  const canon = JSON.parse(await read('data/canonical/ships-canonical.json'));
  const drift = [];
  for (const rec of canon.ships) {
    const live = LIVE[rec.id];
    if (!live) { drift.push(`${rec.id}: live 없음(canonical에 있으면 안 됨)`); continue; }
    // 사실 필드가 live와 정확히 일치해야 한다(canonical은 live 파생, 수기 아님).
    for (const f of ['manufacturer', 'role', 'career', 'size', 'platform', 'crewSize', 'cargoScu', 'hp', 'massKg']) {
      if (JSON.stringify(rec[f]) !== JSON.stringify(live[f])) drift.push(`${rec.id}.${f}: canonical≠live`);
    }
    const liveEn = live.descriptions ? (live.descriptions.en ?? null) : null;
    if ((rec.descriptions && rec.descriptions.en) !== liveEn) drift.push(`${rec.id}.descriptions.en: ≠live`);
    const m = MARKET[rec.id];
    const mp = m && Array.isArray(m.purchase) ? m.purchase : [];
    if (JSON.stringify(rec.market.purchase) !== JSON.stringify(mp)) drift.push(`${rec.id}.market.purchase: ≠market`);
  }
  assert.equal(drift.length, 0, `canonical 드리프트: ${drift.slice(0, 15).join(', ')}`);
});

test('canonical에 Erkul 비파생(금지) 필드가 섞이지 않았다', async () => {
  const canon = JSON.parse(await read('data/canonical/ships-canonical.json'));
  const forbidden = ['priceUsd', 'focus', 'tags', 'crew', 'plannerEligible', 'erkulName', 'erkulStatus'];
  const bad = [];
  for (const rec of canon.ships) {
    for (const f of forbidden) if (Object.hasOwn(rec, f)) bad.push(`${rec.id}.${f}`);
  }
  assert.equal(bad.length, 0, `canonical에 금지 필드: ${bad.slice(0, 10).join(', ')}`);
});

test('Safe Apply previewHash·buildSyncPreview 로직 존재(전환 시 이관 대상)', async () => {
  const src = await read('functions/_shared/erkul-sync.js');
  assert.ok(src.includes('export async function computePreviewHash'), 'computePreviewHash 부재');
  assert.ok(src.includes('export function buildSyncPreview'), 'buildSyncPreview 부재');
  assert.ok(existsSync(join(ROOT, 'tests/functions/erkul-sync-preview.test.mjs')), 'preview 계약 테스트 부재');
});
