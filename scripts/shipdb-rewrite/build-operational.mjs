// ShipDB Erkul 재작성 v2 — 1단계 operational 메타 계층 (동기화·매칭·큐레이션·별칭)
// PM D5/D6/D8: erkulStatus·erkulLocalName은 공개 필드 아닌 operational로 격리, anomalies는 admin 리포트만,
// 중복 에디션 7은 별칭 매핑만 유지. 사실원 아님 — canonical/localization을 참조·큐레이션.
// 읽기: ship-live-stats(syncedAt·erkulLocalName·erkulRef) + ship-market(anomalies) + 기준선(erkulStatus·canonicalId).
//
//   node scripts/shipdb-rewrite/build-operational.mjs
//     → data/canonical/operational-ships.json (219) + data/canonical/edition-aliases.json (7)

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { createContext, runInContext } from 'node:vm';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

function loadGlobals(file) {
  const ctx = createContext({ window: {} });
  runInContext(read(file), ctx);
  return { ...ctx, ...ctx.window };
}

const LIVE = loadGlobals('data/ship-live-stats.js').VOLT_SHIP_LIVE_STATS;
const MARKET = loadGlobals('data/ship-market.js').VOLT_SHIP_MARKET;
const baseline = JSON.parse(read('data/shipdb-rewrite-baseline.json'));
const statusById = new Map(baseline.idList.map((x) => [x.id, x]));

const ids = Object.keys(LIVE).sort((a, b) => a.localeCompare(b));

// operational 레코드 219 — 동기화·매칭 메타 + anomalies(admin 리포트용).
const records = ids.map((id) => {
  const live = LIVE[id];
  const market = MARKET[id];
  const base = statusById.get(id) || {};
  return {
    id,
    syncedAt: live.syncedAt ?? null,
    erkulLocalName: live.erkulLocalName ?? null,
    erkulRef: live.erkulRef ?? null,
    erkulStatus: base.erkulStatus ?? null, // 격리 — 공개 canonical 미노출
    implemented: base.implemented ?? null,
    anomalies: market && Array.isArray(market.anomalies) ? market.anomalies : [], // D6: admin 동기화 리포트 전용
  };
});

// 별칭 맵 7 — 중복 에디션 → 정식 canonical(기준선 canonicalId 시드). canonical 미포함, 리다이렉트 대상.
const liveIds = new Set(ids);
const aliases = baseline.idList
  .filter((x) => !x.hasLive && x.canonicalId)
  .map((x) => ({ aliasId: x.id, canonical: x.canonicalId, targetInCanonical: liveIds.has(x.canonicalId) }))
  .sort((a, b) => a.aliasId.localeCompare(b.aliasId));

let commit = 'unknown';
try { commit = execSync('git rev-parse HEAD', { cwd: ROOT }).toString().trim(); } catch { /* noop */ }

mkdirSync(join(ROOT, 'data/canonical'), { recursive: true });
writeFileSync(
  join(ROOT, 'data/canonical/operational-ships.json'),
  JSON.stringify({ schema: 'shipdb-operational/v1', note: '동기화·매칭·anomalies 격리(공개 canonical 미노출).', generatedFromCommit: commit, count: records.length, records }, null, 2) + '\n',
);
writeFileSync(
  join(ROOT, 'data/canonical/edition-aliases.json'),
  JSON.stringify({ schema: 'shipdb-edition-aliases/v1', note: '중복 에디션 → 정식 canonical 별칭/리다이렉트(공개 목록 미포함).', generatedFromCommit: commit, count: aliases.length, aliases }, null, 2) + '\n',
);

const anomalyShips = records.filter((r) => r.anomalies.length > 0).length;
console.log('operational 생성 완료 → operational-ships.json (219) + edition-aliases.json (7)');
console.log(`  anomalies 보유 ${anomalyShips}척(admin 리포트) · 별칭 ${aliases.length} · 대상 canonical 존재 ${aliases.filter((a) => a.targetInCanonical).length}/${aliases.length}`);
