// ShipDB Erkul 재작성 v2 — RSI 공식 카탈로그 KO localization 계층 (별도, PM step3)
// 각 레코드: ko(검증 통과 번역) + sourceEnHash(현재 EN 해시 일치) + status.
// expanse는 RSI 설명 미제공 → ko:null, status:"no-en"(화면에 "RSI 공식 설명 미제공").
// 사실원 아님(표시 계층). KO 원천은 검증된 번역 파일(concept-ko-candidate.json, 적대검증 통과분).
//
//   KO_CANDIDATE=<path> node scripts/shipdb-rewrite/build-rsi-official-localization.mjs
//     → data/canonical/localization-rsi-official.json

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

const catalog = JSON.parse(read('data/canonical/ships-rsi-official.json'));
const koPath = process.env.KO_CANDIDATE;
if (!koPath) { console.error('KO_CANDIDATE 환경변수(검증 번역 JSON 경로) 필요'); process.exit(1); }
const KO = JSON.parse(readFileSync(koPath, 'utf8'));

const records = [];
const summary = { ok: 0, noEn: 0, missing: 0 };
for (const rec of catalog.records) {
  const id = rec.id;
  const en = rec.rsi.descriptionEn;
  if (!en) {
    // RSI 설명 미제공 — 번역 만들지 않음(PM), 상태만.
    records.push({ id, ko: null, sourceEnHash: null, status: 'no-en', display: 'RSI 공식 설명 미제공' });
    summary.noEn += 1;
    continue;
  }
  const ko = KO[id];
  if (ko == null || !String(ko).trim()) {
    records.push({ id, ko: null, sourceEnHash: rec.descriptionEnHash, status: 'missing' });
    summary.missing += 1;
    continue;
  }
  records.push({
    id,
    ko,
    koSource: 'translated-from-rsi-en',
    sourceEnHash: rec.descriptionEnHash, // 현재 EN 해시 = 카탈로그 descriptionEnHash
    status: 'ok',
  });
  summary.ok += 1;
}

let commit = 'unknown';
try { commit = execSync('git rev-parse HEAD', { cwd: ROOT }).toString().trim(); } catch { /* noop */ }

// 전환 준비: 설명 있는 함선(no-en 제외)은 전부 ko 필요. missing=0 이어야 함.
const cutoverReady = summary.missing === 0;
const out = {
  schema: 'shipdb-rsi-official-localization/v1',
  note: 'RSI 공식 카탈로그 KO. 번역 원천=RSI EN(적대검증 통과). no-en(expanse)은 "RSI 공식 설명 미제공" 상태. sourceEnHash=카탈로그 EN 해시.',
  generatedFromCommit: commit,
  count: records.length,
  summary,
  cutoverReady,
  records,
};

mkdirSync(join(ROOT, 'data/canonical'), { recursive: true });
writeFileSync(join(ROOT, 'data/canonical/localization-rsi-official.json'), JSON.stringify(out, null, 2) + '\n');
console.log('rsi-official localization 생성 → data/canonical/localization-rsi-official.json');
console.log(`  ${records.length}척: ok=${summary.ok} · no-en=${summary.noEn} · missing=${summary.missing} · cutoverReady=${cutoverReady}`);
if (summary.missing > 0) {
  console.log('  누락(번역 필요): ' + records.filter((r) => r.status === 'missing').map((r) => r.id).join(', '));
}
