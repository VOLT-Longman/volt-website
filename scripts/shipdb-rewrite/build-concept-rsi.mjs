// ShipDB Erkul 재작성 v2 — RSI 공식 컨셉 카탈로그 생성기 (PM 2026-07-18)
// 정책: Erkul live 없는 컨셉 30척의 사실 기준 = RSI 공식 Ship Matrix만. VOLT 수기 데이터 재사용 금지.
// RSI가 명시한 역할·제조사·크기·승무원·화물·설명만 취한다. RSI 비제공 값(HP·속도·DPS·구매처·시세)은 추정 금지.
// 공식 근거 없는 값은 빈값(null)으로 남기고 기존 데이터로 보완하지 않는다.
//
//   node scripts/shipdb-rewrite/build-concept-rsi.mjs
//     → data/canonical/ships-concept-rsi.json (30, 비활성 병렬)

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const sha256 = (s) => createHash('sha256').update(s, 'utf8').digest('hex').slice(0, 16);

const SNAP_PATH = 'data/external/rsi/concept-ship-matrix.json';
const snap = JSON.parse(read(SNAP_PATH));
const ids = Object.keys(snap.entries).sort((a, b) => a.localeCompare(b));

const records = ids.map((id) => {
  const e = snap.entries[id];
  const descEn = e.description && e.description.trim() ? e.description.trim() : null;
  return {
    id,
    status: 'concept',
    source: 'rsi-official',
    sourceType: 'ship-matrix',
    sourceUrl: `https://robertsspaceindustries.com${e.url || ''}`,
    retrievedAt: snap.retrievedAt,
    rsiProductionStatus: e.production_status ?? null, // 실제 RSI 상태(대부분 in-concept, 일부 flight-ready)
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
  schema: 'shipdb-concept-rsi/v1',
  note: 'RSI 공식 컨셉 카탈로그. 사실원=RSI Ship Matrix만. RSI 비제공 게임플레이 값 없음. KO는 별도 concept-localization 계층.',
  source: snap.source,
  retrievedAt: snap.retrievedAt,
  generatedFromCommit: commit,
  count: records.length,
  records,
};

mkdirSync(join(ROOT, 'data/canonical'), { recursive: true });
writeFileSync(join(ROOT, 'data/canonical/ships-concept-rsi.json'), JSON.stringify(out, null, 2) + '\n');

// 빈값·이상 리포트
const noDesc = records.filter((r) => !r.rsi.descriptionEn).map((r) => r.id);
const noCargo = records.filter((r) => r.rsi.cargo === null).map((r) => r.id);
const noCrew = records.filter((r) => r.rsi.crewMin === null || r.rsi.crewMax === null).map((r) => r.id);
const notConcept = records.filter((r) => r.rsiProductionStatus !== 'in-concept').map((r) => `${r.id}(${r.rsiProductionStatus})`);
console.log(`concept-rsi 생성: ${records.length}척 → data/canonical/ships-concept-rsi.json`);
console.log(`  설명 없음: ${noDesc.join(', ') || '없음'}`);
console.log(`  화물 null: ${noCargo.join(', ') || '없음'}`);
console.log(`  승무원 null 포함: ${noCrew.join(', ') || '없음'}`);
console.log(`  RSI 상태 != in-concept: ${notConcept.join(', ') || '없음'}`);
