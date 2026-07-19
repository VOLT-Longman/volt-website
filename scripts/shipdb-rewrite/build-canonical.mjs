// ShipDB Erkul 재작성 v2 — 1단계 canonical 생성기 (병렬, 라이브 무변경)
// PM 예외: 기본 사실원은 Erkul live 레이어이며, 승인된 RSI 공식 필드 보정만 별도 파일에서 적용한다.
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
const OFFICIAL_OVERRIDES_FILE = 'data/canonical/official-spec-overrides.json';
const OFFICIAL_OVERRIDE_FIELDS = new Set(['cargoScu']);
const LIVE = loadGlobals(LIVE_STATS_FILE).VOLT_SHIP_LIVE_STATS;
const MARKET = loadGlobals(MARKET_FILE).VOLT_SHIP_MARKET;

function validateOverride(record) {
  if (!record || typeof record.id !== 'string' || !LIVE[record.id]) throw new Error('공식 보정 대상 함선이 Erkul live에 없습니다.');
  if (record.source !== 'rsi-official' || !Array.isArray(record.sourceUrls) || record.sourceUrls.length === 0) throw new Error(`${record.id}: RSI 공식 출처가 필요합니다.`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(record.verifiedAt || '')) throw new Error(`${record.id}: verifiedAt 형식이 올바르지 않습니다.`);
  for (const url of record.sourceUrls) {
    if (!/^https:\/\/(?:www\.)?robertsspaceindustries\.com\/|^https:\/\/media\.robertsspaceindustries\.com\//.test(url)) throw new Error(`${record.id}: RSI 공식 URL만 허용됩니다.`);
  }
  for (const [field, value] of Object.entries(record.fields || {})) {
    if (!OFFICIAL_OVERRIDE_FIELDS.has(field) || !Number.isFinite(value) || value < 0) throw new Error(`${record.id}.${field}: 허용되지 않은 공식 보정입니다.`);
  }
  if (Object.keys(record.fields || {}).length === 0) throw new Error(`${record.id}: 보정 필드가 없습니다.`);
}

function loadOfficialOverrides() {
  const source = JSON.parse(read(OFFICIAL_OVERRIDES_FILE));
  if (source.schema !== 'shipdb-official-spec-overrides/v1' || !Array.isArray(source.records)) throw new Error('공식 보정 데이터 형식이 올바르지 않습니다.');
  const entries = source.records.slice().sort((a, b) => a.id.localeCompare(b.id));
  const ids = new Set();
  for (const entry of entries) {
    validateOverride(entry);
    if (ids.has(entry.id)) throw new Error(`${entry.id}: 공식 보정이 중복되었습니다.`);
    ids.add(entry.id);
  }
  return entries;
}

const officialOverrides = loadOfficialOverrides();
const overridesById = new Map(officialOverrides.map((entry) => [entry.id, entry.fields]));

// canonical 사실 필드 화이트리스트(live 엔트리에서 취함). 금지 필드·operational·번역은 미포함.
// 제외: source/sourceVersion(삭제), syncedAt/erkulLocalName/erkulRef(operational),
//       descriptions(en만 canonical로 분리, ko는 localization), 금지 필드는 애초에 live에 없음.
const CANONICAL_LIVE_FIELDS = [
  'manufacturer', 'role', 'career', 'size', 'platform',
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
  Object.assign(rec, overridesById.get(id));
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
  note: 'Erkul live 기본값과 승인된 RSI 공식 필드 보정으로 생성한 canonical 데이터셋.',
  generatedFromCommit: commit,
  sourceHashes: {
    [LIVE_STATS_FILE]: sha256(read(LIVE_STATS_FILE)).slice(0, 16),
    [MARKET_FILE]: sha256(read(MARKET_FILE)).slice(0, 16),
    [OFFICIAL_OVERRIDES_FILE]: sha256(read(OFFICIAL_OVERRIDES_FILE)).slice(0, 16),
  },
  officialOverrides,
  count: ships.length,
  ships,
};

mkdirSync(join(ROOT, 'data/canonical'), { recursive: true });
writeFileSync(join(ROOT, 'data/canonical/ships-canonical.json'), JSON.stringify(out, null, 2) + '\n');
console.log(`canonical 생성 완료 → data/canonical/ships-canonical.json`);
console.log(`  ${ships.length}척 (Erkul live) · commit=${commit.slice(0, 7)}`);
console.log(`  railen 포함: ${ids.includes('railen')}`);
