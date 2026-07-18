// ShipDB Erkul 재작성 v2 — 1단계 localization 계층 (id-키 KO/EN 번역)
// PM D2: KO 지원 유지하되 기존 volt-data 한글을 이관하지 않음. Erkul EN 원문 + sourceEnHash 기준.
// descriptions-ko.json은 이미 Erkul-id 키 + sourceEnHash 모델(D2 충족본) — 이관 대상.
// 사실원이 아니라 표시 계층: ship-live-stats(en 원문·신선도 기준) + descriptions-ko(ko)만 읽는다.
//
//   node scripts/shipdb-rewrite/build-localization.mjs
//     → data/canonical/localization-ships.json (219 id-키) + 커버리지 요약 stdout

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { createContext, runInContext } from 'node:vm';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const enHash = (text) => createHash('sha256').update(text, 'utf8').digest('hex').slice(0, 16); // apply-ship-description-ko와 동일

function loadGlobals(file) {
  const ctx = createContext({ window: {} });
  runInContext(read(file), ctx);
  return { ...ctx, ...ctx.window };
}

const LIVE = loadGlobals('data/ship-live-stats.js').VOLT_SHIP_LIVE_STATS;
const koFile = JSON.parse(read('data/external/erkul/ship-descriptions-ko.json'));
const KO = koFile.translations || {};

// 선정: canonical과 동일 = Erkul live 존재 219.
const ids = Object.keys(LIVE).sort((a, b) => a.localeCompare(b));

const records = [];
const summary = { ok: 0, stale: 0, missing: 0, noEn: 0 };
for (const id of ids) {
  const en = LIVE[id].descriptions ? (LIVE[id].descriptions.en ?? null) : null;
  const tr = KO[id];
  const ko = tr && tr.ko != null ? tr.ko : null;
  const storedHash = tr ? tr.sourceEnHash ?? null : null;
  const currentHash = en ? enHash(en) : null;
  let status;
  if (!en) { status = 'no-en'; summary.noEn += 1; }
  else if (ko == null) { status = 'missing'; summary.missing += 1; }
  else if (storedHash && currentHash && storedHash !== currentHash) { status = 'stale'; summary.stale += 1; }
  else { status = 'ok'; summary.ok += 1; }
  records.push({
    id,
    ko,
    koSource: ko != null ? (koFile.koSource || 'translated-from-erkul-en') : null,
    sourceEnHash: storedHash,
    currentEnHash: currentHash,
    status,
    // en 원문은 canonical(descriptions.en)이 소유 — 여기서는 신선도 판정용 해시만 보관(중복 저장 회피).
  });
}

let commit = 'unknown';
try { commit = execSync('git rev-parse HEAD', { cwd: ROOT }).toString().trim(); } catch { /* noop */ }

// 전환 차단(3.2 cutover 게이트): missing + stale 가 0이어야 공개 전환 가능.
const cutoverReady = summary.missing === 0 && summary.stale === 0 && summary.noEn === 0;

const out = {
  schema: 'shipdb-localization/v1',
  note: '1단계 병렬 localization(KO). D2: Erkul EN+sourceEnHash 기준. 전환 시 missing+stale=0 필수(3.2 게이트).',
  generatedFromCommit: commit,
  count: records.length,
  summary,
  cutoverReady,
  records,
};

mkdirSync(join(ROOT, 'data/canonical'), { recursive: true });
writeFileSync(join(ROOT, 'data/canonical/localization-ships.json'), JSON.stringify(out, null, 2) + '\n');
console.log('localization 생성 완료 → data/canonical/localization-ships.json');
console.log(`  219 중 ok=${summary.ok} · stale=${summary.stale} · missing=${summary.missing} · no-en=${summary.noEn}`);
console.log(`  cutover 준비(missing+stale+no-en=0): ${cutoverReady}`);
if (summary.missing > 0) {
  const miss = records.filter((r) => r.status === 'missing').map((r) => r.id);
  console.log(`  KO 누락 ${miss.length}척(전환 차단): ${miss.join(', ')}`);
}
