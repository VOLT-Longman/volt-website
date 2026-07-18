// 컨셉 RSI 출처 감사표(Step 2) 생성 — docs/shipdb-concept-rsi-audit.md
//   node scripts/shipdb-rewrite/build-concept-audit.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const data = JSON.parse(readFileSync(join(ROOT, 'data/canonical/ships-concept-rsi.json'), 'utf8'));
const rows = data.records;

const blank = (v) => (v === null || v === undefined || v === '' ? '—' : v);
const crew = (r) => (r.rsi.crewMin === null && r.rsi.crewMax === null ? '—' : `${blank(r.rsi.crewMin)}~${blank(r.rsi.crewMax)}`);
const confirmable = (r) => {
  const f = [];
  if (r.rsi.manufacturer) f.push('제조사');
  if (r.rsi.role) f.push('역할');
  if (r.rsi.size) f.push('크기');
  if (r.rsi.crewMin !== null || r.rsi.crewMax !== null) f.push('승무원');
  if (r.rsi.cargo !== null) f.push('화물');
  if (r.rsi.descriptionEn) f.push('설명');
  return f.join('·');
};

let md = '# ShipDB Erkul 재작성 v2 — RSI 컨셉 카탈로그 출처 감사 (0단계 후속, Step 2)\n\n';
md += `- **정책(PM 2026-07-18)**: Erkul live 없는 컨셉 30척의 사실 기준 = RSI 공식 자료(Ship Matrix·공식 페이지·브로슈어 PDF)만. VOLT 수기 데이터 재사용 금지. 공식 근거 없는 값은 빈값, 기존 데이터로 보완하지 않음.\n`;
md += `- **출처**: ${data.source}\n`;
md += `- **확인일(retrievedAt)**: ${data.retrievedAt}\n`;
md += `- **원본 스냅샷**: \`data/external/rsi/concept-ship-matrix.json\` (사실원). 생성물: \`data/canonical/ships-concept-rsi.json\`.\n`;
md += `- **주의(HP·속도·DPS·구매처·대여·시세·무역수익)**: RSI 비제공 게임플레이 값은 카탈로그에 포함하지 않음(추정 금지).\n\n`;

md += '## 출처 감사표 (30척)\n\n';
md += '| id | 출처 URL | 출처 유형 | 확인일 | RSI 상태 | 제조사 | 역할 | 크기 | 승무원 | 화물 | 설명 | 확인 가능 필드 |\n';
md += '|---|---|---|---|---|---|---|---|---|---|---|---|\n';
for (const r of rows) {
  md += `| \`${r.id}\` | [link](${r.sourceUrl}) | ${r.sourceType} | ${r.retrievedAt} | ${blank(r.rsiProductionStatus)} | ${blank(r.rsi.manufacturer)} | ${blank(r.rsi.role)} | ${blank(r.rsi.size)} | ${crew(r)} | ${blank(r.rsi.cargo)} | ${r.rsi.descriptionEn ? 'Y' : '—'} | ${confirmable(r) || '—'} |\n`;
}

// 빈값·이상 요약
const noDesc = rows.filter((r) => !r.rsi.descriptionEn).map((r) => r.id);
const noCargo = rows.filter((r) => r.rsi.cargo === null).map((r) => r.id);
const noCrew = rows.filter((r) => r.rsi.crewMin === null || r.rsi.crewMax === null).map((r) => r.id);
const notConcept = rows.filter((r) => r.rsiProductionStatus !== 'in-concept').map((r) => `${r.id}(${r.rsiProductionStatus})`);

md += '\n## 빈값·이상 (PM 보고 — 임의 보완하지 않음)\n\n';
md += `- **설명 없음(RSI 미제공)**: ${noDesc.map((s) => `\`${s}\``).join(', ') || '없음'} → \`descriptionEn=null\`, KO 번역 대상에서 제외.\n`;
md += `- **화물 null**: ${noCargo.map((s) => `\`${s}\``).join(', ') || '없음'} → 빈값 유지.\n`;
md += `- **승무원 null 포함**: ${noCrew.map((s) => `\`${s}\``).join(', ') || '없음'} → RSI 미명시분 빈값.\n`;
md += `- **RSI 상태 ≠ in-concept**: ${notConcept.map((s) => `\`${s}\``).join(', ') || '없음'} — RSI Ship Matrix상 flight-ready. "컨셉 카탈로그" 소속(Erkul live 없음)이나 실제 RSI 상태는 flight-ready이므로 배지 표기 방침 PM 확인 필요.\n`;

md += '\n## 필드 커버리지\n\n';
md += '| 필드 | 확보 | 빈값 |\n|---|---|---|\n';
const cov = (pred) => rows.filter(pred).length;
md += `| 제조사 | ${cov((r) => r.rsi.manufacturer)} | ${30 - cov((r) => r.rsi.manufacturer)} |\n`;
md += `| 역할 | ${cov((r) => r.rsi.role)} | ${30 - cov((r) => r.rsi.role)} |\n`;
md += `| 크기 | ${cov((r) => r.rsi.size)} | ${30 - cov((r) => r.rsi.size)} |\n`;
md += `| 승무원(일부라도) | ${cov((r) => r.rsi.crewMin !== null || r.rsi.crewMax !== null)} | ${cov((r) => r.rsi.crewMin === null && r.rsi.crewMax === null)} |\n`;
md += `| 화물 | ${cov((r) => r.rsi.cargo !== null)} | ${cov((r) => r.rsi.cargo === null)} |\n`;
md += `| 설명 | ${cov((r) => r.rsi.descriptionEn)} | ${cov((r) => !r.rsi.descriptionEn)} |\n`;

writeFileSync(join(ROOT, 'docs/shipdb-concept-rsi-audit.md'), md);
console.log('감사표 생성: docs/shipdb-concept-rsi-audit.md (30척)');
