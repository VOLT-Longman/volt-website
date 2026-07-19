// Erkul calculatorType → platform 변환 규칙 검증 (PM B-2). 35MB raw가 아닌 작은 fixture로 규칙만 검증.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import test from 'node:test';

import { toPlatform } from '../../functions/_shared/erkul-platform.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => readFile(join(ROOT, p), 'utf8');

test('toPlatform: fixture — vehicle→ground · ship→space · 값 없음→unknown', () => {
  const fixture = [
    { localName: 'tmbl_cyclone_tr', calculatorType: 'vehicle' },
    { localName: 'misc_freelancer', calculatorType: 'ship' },
    { localName: 'glsn_basher' }, // calculatorType 없음
    { localName: 'x', calculatorType: null },
    { localName: 'y', calculatorType: 'unexpected' },
  ];
  const got = fixture.map((r) => toPlatform(r.calculatorType));
  assert.deepEqual(got, ['ground', 'space', 'unknown', 'unknown', 'unknown']);
});

test('canonical platform: 219 전수 유효값 + 분포 ground27/space192', async () => {
  const canon = JSON.parse(await read('data/canonical/ships-canonical.json'));
  const dist = { ground: 0, space: 0, unknown: 0 };
  const bad = [];
  for (const s of canon.ships) {
    if (!['ground', 'space', 'unknown'].includes(s.platform)) bad.push(`${s.id}=${s.platform}`);
    else dist[s.platform]++;
  }
  assert.equal(bad.length, 0, `유효하지 않은 platform: ${bad.slice(0, 10).join(', ')}`);
  assert.deepEqual(dist, { ground: 27, space: 192, unknown: 0 });
  // Basher는 최신 Erkul raw의 calculatorType=ship을 따라 space다.
  const basher = canon.ships.find((s) => s.id === 'basher');
  assert.equal(basher?.platform, 'space');
});

test('canonical platform = live platform (파생 정합)', async () => {
  const canon = JSON.parse(await read('data/canonical/ships-canonical.json'));
  const vm = await import('node:vm');
  const ctx = vm.createContext({ window: {} });
  vm.runInContext(await read('data/ship-live-stats.js'), ctx);
  const live = ctx.window.VOLT_SHIP_LIVE_STATS;
  const drift = [];
  for (const s of canon.ships) {
    if (live[s.id] && live[s.id].platform !== s.platform) drift.push(s.id);
  }
  assert.equal(drift.length, 0, `platform 파생 불일치: ${drift.slice(0, 10).join(', ')}`);
});
