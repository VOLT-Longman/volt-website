// ShipDB 표시 계층 생성기 (3.5-B 후속 커밋 A).
// canonical 219척의 "표시·자산 연결" 값만 담는다: 영문 표시명(name), 공식 RSI URL(rsiUrl).
//  · 게임플레이 수기 값(priceUsd·focus·tags·role·crew·cargo·plannerEligible)은 절대 이관하지 않는다.
//  · 한국어 표시명/별칭은 data/volt-localization.js(영문명 키)와 D1 name_ko가 계속 소유한다.
//  · RSI 공식 30척은 ships-rsi-official.json이 name·sourceUrl을 이미 갖고 있어 대상이 아니다.
//
// 최초 이관은 레거시 data/volt-data.js에서 1회 추출한다. 이후에는 이 JSON이 사실원이며,
// 레거시 배열이 삭제된 뒤에도 재실행할 수 있도록 기존 파일을 병합 기준으로 사용한다.
//
//   node scripts/shipdb-rewrite/build-presentation-ships.mjs
//     → data/canonical/presentation-ships.json

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { createContext, runInContext } from 'node:vm';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const OUT_PATH = 'data/canonical/presentation-ships.json';
const LEGACY_PATH = 'data/volt-data.js';

const canonical = JSON.parse(read('data/canonical/ships-canonical.json'));
const canonicalIds = canonical.ships.map((ship) => ship.id);

// 기존 표시 계층(있으면) + 레거시 배열(남아 있으면)에서 표시값을 모은다.
const existing = existsSync(join(ROOT, OUT_PATH))
  ? Object.fromEntries(JSON.parse(read(OUT_PATH)).records.map((r) => [r.id, r]))
  : {};

let legacyById = {};
if (existsSync(join(ROOT, LEGACY_PATH))) {
  const ctx = createContext({ window: {} });
  runInContext(read(LEGACY_PATH), ctx);
  const ships = (ctx.window.VOLT_DATA || {}).ships || [];
  legacyById = Object.fromEntries(ships.map((ship) => [ship.id, ship]));
}

const records = [];
const missing = [];
for (const id of canonicalIds) {
  const prior = existing[id];
  const legacy = legacyById[id];
  const name = prior?.name ?? legacy?.name ?? null;
  const rsiUrl = prior?.rsiUrl ?? legacy?.rsiUrl ?? null;
  if (!name) { missing.push(id); continue; }
  records.push(rsiUrl ? { id, name, rsiUrl } : { id, name });
}
if (missing.length > 0) {
  console.error(`표시명 없는 canonical 함선 — 이관 불가: ${missing.join(', ')}`);
  process.exit(1);
}

let commit = 'unknown';
try { commit = execSync('git rev-parse HEAD', { cwd: ROOT }).toString().trim(); } catch { /* noop */ }

const out = {
  schema: 'shipdb-presentation/v1',
  note: '표시 계층: canonical 함선의 영문 표시명·공식 RSI URL만. 게임플레이 사실값은 canonical이 소유한다.',
  generatedFromCommit: commit,
  count: records.length,
  records
};

mkdirSync(join(ROOT, 'data/canonical'), { recursive: true });
writeFileSync(join(ROOT, OUT_PATH), `${JSON.stringify(out, null, 2)}\n`);
console.log(`presentation-ships.json: ${records.length}척 (rsiUrl ${records.filter((r) => r.rsiUrl).length}건)`);
