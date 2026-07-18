// ShipDB Erkul 재작성 v2 — 1단계 canonical 생성기 (병렬, 라이브 무변경)
// PM 보강 2: canonical의 사실원은 Erkul live 레이어(ship-live-stats.js·ship-market.js)뿐이다.
// volt-data.js·ship-prices-usd.json·rsi-ship-matrix-index.json을 사실원으로 읽지 않는다(CI 강제).
// 선정 기준 = Erkul live 레코드 존재(hasLive). erkulStatus='matched'가 아님(railen 포함).
// 금지 필드(priceUsd·focus·tags·crew·plannerEligible·erkulName·erkulStatus)는 화이트리스트로 원천 배제.
//
//   node scripts/shipdb-rewrite/build-canonical.mjs
//     → data/canonical/ships-canonical.json (219 레코드, 비활성 병렬 파일)

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { createContext, runInContext } from 'node:vm';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const sha256 = (s) => createHash('sha256').update(s).digest('hex');

function loadGlobals(file) {
  const ctx = createContext({ window: {} });
  runInContext(read(file), ctx);
  return { ...ctx, ...ctx.window };
}

// ── 사실원: Erkul live 레이어 2개만 ──────────────────────────────
const LIVE_STATS_FILE = 'data/ship-live-stats.js';
const MARKET_FILE = 'data/ship-market.js';
const LIVE = loadGlobals(LIVE_STATS_FILE).VOLT_SHIP_LIVE_STATS;
const MARKET = loadGlobals(MARKET_FILE).VOLT_SHIP_MARKET;

// canonical 사실 필드 화이트리스트(live 엔트리에서 취함). 금지 필드·operational·번역은 미포함.
// 제외: source/sourceVersion(삭제), syncedAt/erkulLocalName/erkulRef(operational),
//       descriptions(en만 canonical로 분리, ko는 localization), 금지 필드는 애초에 live에 없음.
const CANONICAL_LIVE_FIELDS = [
  'manufacturer', 'role', 'career', 'size',
  'crewSize', 'cargoScu', 'hp', 'massKg',
  'speeds', 'rotation', 'countermeasures', 'dimensions',
  'fuel', 'insurance', 'damageReduction',
];

function buildCanonicalRecord(id) {
  const live = LIVE[id];
  const market = MARKET[id];
  const rec = { id };
  for (const f of CANONICAL_LIVE_FIELDS) {
    if (live[f] !== undefined) rec[f] = live[f];
  }
  // 설명: en(canonical 원문)만. ko는 localization 계층 소유(별도 생성).
  rec.descriptions = { en: live.descriptions ? (live.descriptions.en ?? null) : null };
  // 시세: purchase·rentals만. anomalies는 operational/admin 리포트로 격리(D6).
  rec.market = {
    purchase: market && Array.isArray(market.purchase) ? market.purchase : [],
    rentals: market && Array.isArray(market.rentals) ? market.rentals : [],
  };
  return rec;
}

// 선정: Erkul live 존재 = Object.keys(LIVE). erkulStatus·implemented(volt-data)를 읽지 않는다.
const ids = Object.keys(LIVE).sort((a, b) => a.localeCompare(b));
const ships = ids.map(buildCanonicalRecord);

let commit = 'unknown';
try { commit = execSync('git rev-parse HEAD', { cwd: ROOT }).toString().trim(); } catch { /* noop */ }

const out = {
  schema: 'shipdb-canonical/v1',
  note: '1단계 병렬 canonical. 사실원=Erkul live 레이어(ship-live-stats·ship-market)만. 비활성 — 소비처 미참조.',
  generatedFromCommit: commit,
  sourceHashes: {
    [LIVE_STATS_FILE]: sha256(read(LIVE_STATS_FILE)).slice(0, 16),
    [MARKET_FILE]: sha256(read(MARKET_FILE)).slice(0, 16),
  },
  count: ships.length,
  ships,
};

mkdirSync(join(ROOT, 'data/canonical'), { recursive: true });
writeFileSync(join(ROOT, 'data/canonical/ships-canonical.json'), JSON.stringify(out, null, 2) + '\n');
console.log(`canonical 생성 완료 → data/canonical/ships-canonical.json`);
console.log(`  ${ships.length}척 (Erkul live) · commit=${commit.slice(0, 7)}`);
console.log(`  railen 포함: ${ids.includes('railen')}`);
