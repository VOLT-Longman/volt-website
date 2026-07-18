// RSI 공식 카탈로그 출처 감사표(Step 2) 생성 — docs/shipdb-rsi-official-audit.md
//   node scripts/shipdb-rewrite/build-rsi-official-audit.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const data = JSON.parse(readFileSync(join(ROOT, 'data/canonical/ships-rsi-official.json'), 'utf8'));
const rows = data.records;
const N = rows.length;

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

let md = '# ShipDB Erkul 재작성 v2 — RSI 공식 카탈로그 출처 감사 (Step 2)\n\n';
md += `- **정책(PM 2026-07-18)**: Erkul live 없는 30척의 사실 기준 = RSI 공식 자료(Ship Matrix·공식 페이지·브로슈어 PDF)만. VOLT 수기 데이터 재사용 금지. 공식 근거 없는 값은 빈값, 기존 데이터로 보완하지 않음.\n`;
md += `- **카탈로그 상태**: 정확성 우선(PM). \`catalogStatus\` = concept ${data.byStatus.concept || 0} · flight-ready ${data.byStatus['flight-ready'] || 0}. 배지: concept="컨셉 · RSI 공식 사양 · 변경 가능", flight-ready="출시 · RSI 공식 사양".\n`;
md += `- **출처**: ${data.source}\n`;
md += `- **확인일(retrievedAt)**: ${data.retrievedAt}\n`;
md += `- **원본 스냅샷**: \`data/external/rsi/official-ship-matrix.json\` (사실원). 생성물: \`data/canonical/ships-rsi-official.json\`.\n`;
md += `- **주의(HP·속도·DPS·구매처·대여·시세·무역수익)**: RSI 비제공 게임플레이 값은 카탈로그에 포함하지 않음(추정 금지).\n\n`;

md += `## 출처 감사표 (${N}척)\n\n`;
md += '| id | catalogStatus | 출처 URL | 출처 유형 | 확인일 | RSI 상태 | 제조사 | 역할 | 크기 | 승무원 | 화물 | 설명 | 확인 가능 필드 |\n';
md += '|---|---|---|---|---|---|---|---|---|---|---|---|---|\n';
for (const r of rows) {
  md += `| \`${r.id}\` | ${r.catalogStatus} | [link](${r.sourceUrl}) | ${r.sourceType} | ${r.retrievedAt} | ${blank(r.rsiProductionStatus)} | ${blank(r.rsi.manufacturer)} | ${blank(r.rsi.role)} | ${blank(r.rsi.size)} | ${crew(r)} | ${blank(r.rsi.cargo)} | ${r.rsi.descriptionEn ? 'Y' : '—'} | ${confirmable(r) || '—'} |\n`;
}

const noDesc = rows.filter((r) => !r.rsi.descriptionEn).map((r) => r.id);
const noCargo = rows.filter((r) => r.rsi.cargo === null).map((r) => r.id);
const noCrew = rows.filter((r) => r.rsi.crewMin === null || r.rsi.crewMax === null).map((r) => r.id);
const flightReady = rows.filter((r) => r.catalogStatus === 'flight-ready').map((r) => r.id);

md += '\n## 빈값·이상 (PM 보고 — 임의 보완하지 않음)\n\n';
md += `- **설명 없음(RSI 미제공)**: ${noDesc.map((s) => `\`${s}\``).join(', ') || '없음'} → \`descriptionEn=null\`. 화면에는 "RSI 공식 설명 미제공" 상태만 표시, KO 번역 대상 제외.\n`;
md += `- **화물 null**: ${noCargo.map((s) => `\`${s}\``).join(', ') || '없음'} → 빈값 유지.\n`;
md += `- **승무원 null 포함**: ${noCrew.map((s) => `\`${s}\``).join(', ') || '없음'} → RSI 미명시분 빈값.\n`;
md += `- **flight-ready(출시, 컨셉 아님)**: ${flightReady.map((s) => `\`${s}\``).join(', ') || '없음'} — RSI Ship Matrix상 출시 상태. PM A 결정으로 "출시 · RSI 공식 사양" 배지, \`catalogStatus:"flight-ready"\`.\n`;

md += '\n## 필드 커버리지\n\n';
md += '| 필드 | 확보 | 빈값 |\n|---|---|---|\n';
const cov = (pred) => rows.filter(pred).length;
md += `| 제조사 | ${cov((r) => r.rsi.manufacturer)} | ${N - cov((r) => r.rsi.manufacturer)} |\n`;
md += `| 역할 | ${cov((r) => r.rsi.role)} | ${N - cov((r) => r.rsi.role)} |\n`;
md += `| 크기 | ${cov((r) => r.rsi.size)} | ${N - cov((r) => r.rsi.size)} |\n`;
md += `| 승무원(일부라도) | ${cov((r) => r.rsi.crewMin !== null || r.rsi.crewMax !== null)} | ${cov((r) => r.rsi.crewMin === null && r.rsi.crewMax === null)} |\n`;
md += `| 화물 | ${cov((r) => r.rsi.cargo !== null)} | ${cov((r) => r.rsi.cargo === null)} |\n`;
md += `| 설명 | ${cov((r) => r.rsi.descriptionEn)} | ${cov((r) => !r.rsi.descriptionEn)} |\n`;

writeFileSync(join(ROOT, 'docs/shipdb-rsi-official-audit.md'), md);
console.log(`감사표 생성: docs/shipdb-rsi-official-audit.md (${N}척)`);
