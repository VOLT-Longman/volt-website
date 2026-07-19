// [일회성] 현재 deployed live·canonical에 platform 필드만 additive 추가 (PM B-2).
// 배경: 로컬 파이프라인 재생성이 deployed 데이터와 diverge(수기 함선·키순서)하므로 full regen 대신
//   platform만 추가하고, platform 외 모든 값이 불변임을 git 원본과 대조해 증명한다(검증 실패 시 중단).
// platform 규칙: Erkul 원본 calculatorType 'vehicle'→'ground' · 'ship'→'space' · 값없음→'unknown'.
//   basher처럼 raw에 없는 함선은 임의 space 처리하지 않고 unknown 유지.
// 이후 build-ship-live-data/build-canonical가 동일 규칙으로 platform을 산출(향후 sync 자동 유지).
//
//   node scripts/shipdb-rewrite/patch-platform-additive.mjs

import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';
import { createContext, runInContext } from 'node:vm';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { toPlatform } from '../../functions/_shared/erkul-platform.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const sha16 = (t) => createHash('sha256').update(t).digest('hex').slice(0, 16);
// size 뒤에 platform을 넣어 레코드 재구성(생성기 필드 순서와 일치).
function withPlatformAfterSize(rec, platform) {
  const out = {};
  for (const [k, v] of Object.entries(rec)) {
    out[k] = v;
    if (k === 'size') out.platform = platform;
  }
  if (!('platform' in out)) out.platform = platform; // size 없으면 끝에
  return out;
}

// 입력: Erkul raw calculatorType(localName) + operational(id→localName)
const raw = JSON.parse(read('data/external/erkul/ships.raw.json'));
const calcByLn = {};
for (const r of raw) calcByLn[r.localName] = r.calculatorType;
const ops = JSON.parse(read('data/canonical/operational-ships.json'));
const lnById = {};
for (const r of ops.records) lnById[r.id] = r.erkulLocalName;
const platformById = (id) => toPlatform(calcByLn[lnById[id]]);

// ── ship-live-stats.js (minified: window.VOLT_SHIP_LIVE_STATS = {...};) ──
const liveSrc = read('data/ship-live-stats.js');
const liveCtx = createContext({ window: {} });
runInContext(liveSrc, liveCtx);
const liveObj = liveCtx.window.VOLT_SHIP_LIVE_STATS;
const liveHeader = liveSrc.slice(0, liveSrc.indexOf('window.VOLT_SHIP_LIVE_STATS'));
const patchedLive = {};
for (const [id, rec] of Object.entries(liveObj)) patchedLive[id] = withPlatformAfterSize(rec, platformById(id));
const newLiveSrc = `${liveHeader}window.VOLT_SHIP_LIVE_STATS = ${JSON.stringify(patchedLive)};\n`;

// ── ships-canonical.json ──
const canon = JSON.parse(read('data/canonical/ships-canonical.json'));
canon.ships = canon.ships.map((s) => withPlatformAfterSize(s, platformById(s.id)));

// 검증 1: platform 외 모든 값이 git 원본과 동일한가
const oldLive = JSON.parse(execSync('git show HEAD:data/ship-live-stats.js', { cwd: ROOT }).toString().replace(/^[\s\S]*?window\.VOLT_SHIP_LIVE_STATS = /, '').replace(/;\s*$/, ''));
const oldCanon = JSON.parse(execSync('git show HEAD:data/canonical/ships-canonical.json', { cwd: ROOT }).toString());
const stripP = (o) => { const { platform, ...rest } = o; return rest; };
let drift = 0; const sample = [];
for (const id of Object.keys(oldLive)) {
  if (JSON.stringify(stripP(patchedLive[id])) !== JSON.stringify(oldLive[id])) { drift++; if (sample.length < 6) sample.push(`live ${id}`); }
}
const oldCanonById = {}; for (const s of oldCanon.ships) oldCanonById[s.id] = s;
for (const s of canon.ships) {
  if (JSON.stringify(stripP(s)) !== JSON.stringify(oldCanonById[s.id])) { drift++; if (sample.length < 6) sample.push(`canon ${s.id}`); }
}
if (drift > 0) { console.error(`검증 실패 — platform 외 값 변경 ${drift}건: ${sample.join(', ')}`); process.exit(1); }

// 검증 2: 분포 ground 27 / space 191 / unknown 1
const dist = { ground: 0, space: 0, unknown: 0 };
for (const s of canon.ships) dist[s.platform]++;
if (dist.ground !== 27 || dist.space !== 191 || dist.unknown !== 1) {
  console.error(`검증 실패 — 분포 불일치: ${JSON.stringify(dist)} (기대 ground27/space191/unknown1)`); process.exit(1);
}

// canonical sourceHashes[live] 갱신(live 내용 변경 반영). 테스트 미검증이나 정합 유지.
if (canon.sourceHashes && canon.sourceHashes['data/ship-live-stats.js']) {
  canon.sourceHashes['data/ship-live-stats.js'] = sha16(newLiveSrc);
}

writeFileSync(join(ROOT, 'data/ship-live-stats.js'), newLiveSrc);
writeFileSync(join(ROOT, 'data/canonical/ships-canonical.json'), `${JSON.stringify(canon, null, 2)}\n`);
console.log(`platform additive 패치 완료 — 분포 ${JSON.stringify(dist)}, platform 외 값 변경 0`);
