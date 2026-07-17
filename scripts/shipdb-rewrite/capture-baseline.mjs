// ShipDB Erkul 재작성 v2 — 0단계 0.2 기준선 캡처 (재현 가능)
// PM 조건: API 응답만이 아니라 원본 데이터 파일 해시·레코드 수·ID 목록·공개 화면 주요 필드까지 고정.
// 3.1 전후 비교의 old 축. 코드·데이터를 변경하지 않고 읽기만 한다.
//
//   node scripts/shipdb-rewrite/capture-baseline.mjs
//     → data/shipdb-rewrite-baseline.json 생성/갱신
//
// 라이브 공개 API(functions)는 Cloudflare 봇 챌린지로 CLI 캡처 불가라, 렌더 출력을 결정하는
// 정적 데이터 투영(공개 화면 주요 필드)을 기준선으로 삼는다. CMS/AI 응답 축은 스테이징에서 별도 캡처.

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
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

// ── 소스 파일 해시 ─────────────────────────────────────────────
const SOURCE_FILES = [
  'data/volt-data.js',
  'data/ship-en.js',
  'data/ship-live-stats.js',
  'data/ship-market.js',
  'data/volt-localization.js',
  'data/external/erkul/ship-descriptions-ko.json',
  'data/ship-prices-usd.json',
];
const fileHashes = {};
for (const f of SOURCE_FILES) fileHashes[f] = { sha256: sha256(read(f)), bytes: read(f).length };

// ── 데이터 로드 ────────────────────────────────────────────────
const VOLT_DATA = loadGlobals('data/volt-data.js').VOLT_DATA;
const ships = VOLT_DATA.ships;
const SHIP_EN = loadGlobals('data/ship-en.js').VOLT_SHIP_EN || {};
const LIVE = loadGlobals('data/ship-live-stats.js').VOLT_SHIP_LIVE_STATS || {};
const MARKET = loadGlobals('data/ship-market.js').VOLT_SHIP_MARKET || {};
const LOC = loadGlobals('data/volt-localization.js').VOLT_LOCALIZATION || {};
const koFile = JSON.parse(read('data/external/erkul/ship-descriptions-ko.json'));
const koTranslations = koFile.translations || {};
const priceFile = JSON.parse(read('data/ship-prices-usd.json'));

// ── 레코드 수 ──────────────────────────────────────────────────
const counts = {
  ships: ships.length,
  shipsWithLive: ships.filter((s) => LIVE[s.id]).length,
  shipsWithoutLive: ships.filter((s) => !LIVE[s.id]).length,
  liveStats: Object.keys(LIVE).length,
  market: Object.keys(MARKET).length,
  shipEn: Object.keys(SHIP_EN).length,
  koTranslations: Object.keys(koTranslations).length,
  koNonNull: Object.values(koTranslations).filter((t) => t && t.ko != null).length,
  priceEntries: Object.keys(priceFile.prices || {}).length,
  localizationShips: Object.keys(LOC.ships || {}).length,
  erkulStatus: ships.reduce((acc, s) => {
    acc[s.erkulStatus] = (acc[s.erkulStatus] || 0) + 1;
    return acc;
  }, {}),
};

// ── ID 목록 (정렬) ─────────────────────────────────────────────
const idList = ships
  .map((s) => ({
    id: s.id,
    hasLive: Boolean(LIVE[s.id]),
    erkulStatus: s.erkulStatus,
    implemented: s.implemented !== false,
    canonicalId: s.canonicalId || null,
  }))
  .sort((a, b) => a.id.localeCompare(b.id));

// ── 공개 화면 주요 필드 (렌더 출력 결정 투영) ──────────────────
// 카드/모달에 실제 표시되는 값 + KO 표시명 해석. 각 함선을 안정적 해시로도 고정.
function koName(ship) {
  if (LOC.ships && LOC.ships[ship.name]) {
    const v = LOC.ships[ship.name];
    return Array.isArray(v) ? v[0] : v;
  }
  return null;
}
const publicFields = ships
  .map((s) => {
    const live = LIVE[s.id];
    const row = {
      id: s.id,
      name: s.name,
      koName: koName(s),
      manufacturer: s.manufacturer,
      role: s.role,
      focus: s.focus,
      size: s.size,
      crew: s.crew,
      liveCrewSize: live ? live.crewSize ?? null : null,
      cargo: s.cargo,
      liveCargoScu: live ? live.cargoScu ?? null : null,
      priceUsd: s.priceUsd ?? null,
      tags: Array.isArray(s.tags) ? s.tags : [],
      implemented: s.implemented !== false,
      erkulStatus: s.erkulStatus,
      descHash: sha256(String(s.description || '')).slice(0, 16),
      koDescHash: live && live.descriptions && live.descriptions.ko ? sha256(live.descriptions.ko).slice(0, 16) : null,
    };
    row.rowHash = sha256(JSON.stringify(row)).slice(0, 16);
    return row;
  })
  .sort((a, b) => a.id.localeCompare(b.id));

let commit = 'unknown';
try { commit = execSync('git rev-parse HEAD', { cwd: ROOT }).toString().trim(); } catch { /* noop */ }

const baseline = {
  schema: 'shipdb-rewrite-baseline/v1',
  note: '0단계 0.2 기준선. 3.1 전후 비교의 old 축. capture-baseline.mjs로 재현.',
  capturedFromCommit: commit,
  fileHashes,
  counts,
  idList,
  publicFields,
};

const outPath = 'data/shipdb-rewrite-baseline.json';
writeFileSync(join(ROOT, outPath), JSON.stringify(baseline, null, 2) + '\n');
console.log(`기준선 캡처 완료 → ${outPath}`);
console.log(`  commit=${commit.slice(0, 7)} · ships=${counts.ships} · live=${counts.shipsWithLive}/${counts.ships} · ko=${counts.koNonNull}/${counts.koTranslations}`);
console.log(`  파일 해시 ${Object.keys(fileHashes).length}개, 공개 필드 행 ${publicFields.length}개`);
