// ShipDB 재작성 3.2 — KO 완전성 감사 (PM). 전환 전 재검증:
//  · live canonical 219척 KO 번역(missing 0, stale 0, 각 sourceEnHash가 현재 EN과 일치)
//  · RSI 카탈로그 29척 번역 + expanse "RSI 공식 설명 미제공"(no-en 1, missing 0)
// sourceEnHash 신선도를 현재 데이터로 재계산해 대조한다(구식 번역 차단).

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import test from 'node:test';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => readFile(join(ROOT, p), 'utf8');
const enHash = (t) => createHash('sha256').update(t, 'utf8').digest('hex').slice(0, 16);

async function loadGlobals(file) {
  const ctx = vm.createContext({ window: {} });
  vm.runInContext(await read(file), ctx);
  return { ...ctx, ...ctx.window };
}

test('live 219 localization: 전부 KO(ok 219) + sourceEnHash가 현재 EN과 일치(stale 0)', async () => {
  const LIVE = (await loadGlobals('data/ship-live-stats.js')).VOLT_SHIP_LIVE_STATS;
  const loc = JSON.parse(await read('data/canonical/localization-ships.json'));
  assert.equal(loc.summary.ok, 219, `ok 219 기대, 실제 ${loc.summary.ok}`);
  assert.equal(loc.summary.missing, 0, `missing 0 기대, 실제 ${loc.summary.missing}`);
  assert.equal(loc.summary.stale, 0, `stale 0 기대, 실제 ${loc.summary.stale}`);
  assert.equal(loc.cutoverReady, true, 'cutoverReady=true 기대');
  // 신선도 재계산: 각 ko 레코드의 sourceEnHash == 현재 live EN 해시
  const stale = [];
  for (const r of loc.records) {
    if (r.status !== 'ok') continue;
    const en = LIVE[r.id] && LIVE[r.id].descriptions ? LIVE[r.id].descriptions.en : null;
    if (!en) { stale.push(`${r.id}: 현재 EN 없음`); continue; }
    if (r.sourceEnHash !== enHash(en)) stale.push(`${r.id}: 해시 불일치`);
  }
  assert.equal(stale.length, 0, `stale KO(재계산): ${stale.slice(0, 10).join(', ')}`);
});

test('RSI 29 localization: ok 29 + expanse no-en, missing 0, 해시 일치', async () => {
  const catalog = JSON.parse(await read('data/canonical/ships-rsi-official.json'));
  const loc = JSON.parse(await read('data/canonical/localization-rsi-official.json'));
  assert.equal(loc.summary.missing, 0, `missing 0 기대, 실제 ${loc.summary.missing}`);
  assert.equal(loc.summary.ok, 29, `ok 29 기대, 실제 ${loc.summary.ok}`);
  assert.equal(loc.summary.noEn, 1, `no-en 1(expanse) 기대, 실제 ${loc.summary.noEn}`);
  const catById = new Map(catalog.records.map((r) => [r.id, r]));
  const problems = [];
  for (const r of loc.records) {
    const cat = catById.get(r.id);
    if (r.id === 'expanse') {
      if (r.status !== 'no-en' || r.ko) problems.push('expanse가 no-en 아님');
      continue;
    }
    if (r.status !== 'ok' || !r.ko) { problems.push(`${r.id}: KO 없음`); continue; }
    // sourceEnHash == 카탈로그 descriptionEnHash(= 현재 RSI EN 해시)
    if (r.sourceEnHash !== cat.descriptionEnHash) problems.push(`${r.id}: 해시 불일치`);
  }
  assert.equal(problems.length, 0, `RSI KO 문제: ${problems.slice(0, 10).join(', ')}`);
});

test('무음 폴백 0: 활성 함선(219 + RSI 29)에 KO 누락이 없다', async () => {
  const mainLoc = JSON.parse(await read('data/canonical/localization-ships.json'));
  const rsiLoc = JSON.parse(await read('data/canonical/localization-rsi-official.json'));
  const mainMissing = mainLoc.records.filter((r) => r.status === 'missing').map((r) => r.id);
  const rsiMissing = rsiLoc.records.filter((r) => r.status === 'missing').map((r) => r.id);
  assert.equal(mainMissing.length, 0, `live KO 누락: ${mainMissing.join(', ')}`);
  assert.equal(rsiMissing.length, 0, `RSI KO 누락: ${rsiMissing.join(', ')}`);
});
