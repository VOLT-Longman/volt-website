// ShipDB Erkul 재작성 v2 — RSI 공식 카탈로그 생성기 (PM 2026-07-18)
// Erkul live 없는 30척의 사실 기준 = RSI 공식 Ship Matrix만. VOLT 수기 데이터 재사용 금지.
// catalogStatus: "concept"(28) | "flight-ready"(atls·atls-geo 2) — RSI production_status 반영(정확성 우선).
// RSI가 명시한 역할·제조사·크기·승무원·화물·설명만. RSI 비제공 값(HP·속도·DPS·구매처·시세)은 추정 금지.
// 공식 근거 없는 값은 빈값(null). expanse는 RSI 설명 미제공 → descriptionEn=null.
//
//   node scripts/shipdb-rewrite/build-rsi-official.mjs
//     → data/canonical/ships-rsi-official.json (30, 비활성 병렬)

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const sha256 = (s) => createHash('sha256').update(s, 'utf8').digest('hex').slice(0, 16);

const SNAP_PATH = 'data/external/rsi/official-ship-matrix.json';
const snap = JSON.parse(read(SNAP_PATH));
const ids = Object.keys(snap.entries).sort((a, b) => a.localeCompare(b));

const records = ids.map((id) => {
  const e = snap.entries[id];
  const descEn = e.description && e.description.trim() ? e.description.trim() : null;
  const prod = e.production_status ?? null;
  return {
    id,
    // 정확성 우선: RSI production_status로 카탈로그 상태 구분.
    catalogStatus: prod === 'flight-ready' ? 'flight-ready' : 'concept',
    rsiProductionStatus: prod,
    source: 'rsi-official',
    sourceType: 'ship-matrix',
    sourceUrl: `https://robertsspaceindustries.com${e.url || ''}`,
    retrievedAt: snap.retrievedAt,
    // RSI 명시 필드만. 없으면 null(빈값) — 기존 VOLT 데이터로 보완 금지.
    rsi: {
      manufacturer: (e.manufacturer && e.manufacturer.name) || null,
      role: e.focus || null,
      size: e.size || null,
      crewMin: e.min_crew ?? null,
      crewMax: e.max_crew ?? null,
      cargo: e.cargocapacity ?? null,
      descriptionEn: descEn,
    },
    descriptionEnHash: descEn ? sha256(descEn) : null,
  };
});

let commit = 'unknown';
try { commit = execSync('git rev-parse HEAD', { cwd: ROOT }).toString().trim(); } catch { /* noop */ }

const out = {
  schema: 'shipdb-rsi-official/v1',
  note: 'RSI 공식 카탈로그. 사실원=RSI Ship Matrix만. catalogStatus로 concept/flight-ready 구분. RSI 비제공 게임플레이 값 없음. KO는 별도 localization 계층.',
  source: snap.source,
  retrievedAt: snap.retrievedAt,
  generatedFromCommit: commit,
  count: records.length,
  byStatus: records.reduce((a, r) => { a[r.catalogStatus] = (a[r.catalogStatus] || 0) + 1; return a; }, {}),
  records,
};

mkdirSync(join(ROOT, 'data/canonical'), { recursive: true });
writeFileSync(join(ROOT, 'data/canonical/ships-rsi-official.json'), JSON.stringify(out, null, 2) + '\n');

const noDesc = records.filter((r) => !r.rsi.descriptionEn).map((r) => r.id);
const flightReady = records.filter((r) => r.catalogStatus === 'flight-ready').map((r) => r.id);
console.log(`rsi-official 생성: ${records.length}척 → data/canonical/ships-rsi-official.json`);
console.log(`  catalogStatus: ${JSON.stringify(out.byStatus)}`);
console.log(`  flight-ready(출시): ${flightReady.join(', ')}`);
console.log(`  설명 없음(RSI 미제공): ${noDesc.join(', ')}`);
