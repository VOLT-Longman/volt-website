// ShipDB 재작성 3.2 — KO 완전성 감사 (PM). 전환 전 재검증:
//  · live canonical 217척 KO 번역(missing 0, stale 0, 각 sourceEnHash가 현재 EN과 일치)
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

test('게임 한국어 패치 설명 220 + 원문만 있는 1척 + sourceEnHash가 현재 EN과 일치(stale 0)', async () => {
  const LIVE = (await loadGlobals('data/ship-live-stats.js')).VOLT_SHIP_LIVE_STATS;
  const loc = JSON.parse(await read('data/canonical/localization-ships.json'));
  assert.equal(loc.records.length, 221);
  assert.equal(loc.records.filter(r => r.status === 'ok').length, 220);
  for (const row of loc.records) assert.equal(row.source, 'korean-patch');
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

test('RSI 27 localization: ok 26 + expanse no-en, missing 0, 해시 일치', async () => {
  const catalog = JSON.parse(await read('data/canonical/ships-rsi-official.json'));
  const loc = JSON.parse(await read('data/canonical/localization-rsi-official.json'));
  assert.equal(loc.summary.missing, 0, `missing 0 기대, 실제 ${loc.summary.missing}`);
  assert.equal(loc.summary.ok, 26, `ok 28 기대, 실제 ${loc.summary.ok}`);
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

test('게임 패치에 한국어 설명 없는 함선은 번역을 만들지 않고 누락 상태로 기록한다', async () => {
  const mainLoc = JSON.parse(await read('data/canonical/localization-ships.json'));
  const rsiLoc = JSON.parse(await read('data/canonical/localization-rsi-official.json'));
  const mainMissing = mainLoc.records.filter((r) => r.status === 'missing').map((r) => r.id);
  const rsiMissing = rsiLoc.records.filter((r) => r.status === 'missing').map((r) => r.id);
  assert.deepEqual(mainMissing, ['constellation-aquila']);
  assert.equal(mainLoc.records.find(r => r.id === 'constellation-aquila').ko, null);
  assert.equal(rsiMissing.length, 0, `RSI KO 누락: ${rsiMissing.join(', ')}`);
});
