// ShipDB 역할군 태그 생성기 (PM 지시). canonical role만 사실원으로 8개 UX 역할군에 매핑.
// 원칙:
//  · 입력 = canonical의 원문 role 값만. focus/tags/career/설명/화물량에서 새 분류를 추론하지 않는다.
//  · 52개 원문 역할을 8개 역할군 중 정확히 하나에 매핑. 누락·중복은 실패(CI 강제).
//  · 교차그룹 복합역할·불명확한 역할은 임의 추론하지 않고 other(레이싱·기타)로 두고 ambiguous로 감사표에 기록.
//  · RSI 공식 카탈로그 30척은 여기 대상 아님(별도 카탈로그).
//
//   node scripts/shipdb-rewrite/build-role-groups.mjs
//     → data/canonical/role-groups.json

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

// 8개 UX 역할군(순서 = 표시 순서). KO/EN 라벨은 UI 번역 계층.
const GROUPS = [
  { key: 'logistics', ko: '물류·운송', en: 'Logistics & Transport' },
  { key: 'combat', ko: '전투·보안', en: 'Combat & Security' },
  { key: 'industry', ko: '산업·자원', en: 'Industry & Resources' },
  { key: 'exploration', ko: '탐사·과학', en: 'Exploration & Science' },
  { key: 'support', ko: '지원·구조', en: 'Support & Rescue' },
  { key: 'passenger', ko: '여객·관광', en: 'Passenger & Touring' },
  { key: 'ground', ko: '지상·특수', en: 'Ground & Special' },
  { key: 'other', ko: '레이싱·기타', en: 'Racing & Other' },
];
const GROUP_KEYS = new Set(GROUPS.map((g) => g.key));

// canonical 원문 role → 역할군. 매핑 근거는 role 문자열 자체(키워드)뿐.
const ROLE_GROUP = {
  // 물류·운송 (Freight·Dropship 운송)
  'Heavy Freight': 'logistics',
  'Light Freight': 'logistics',
  'Medium Freight': 'logistics',
  'Starter / Light Freight': 'logistics',
  Dropship: 'logistics',
  'Heavy Dropship': 'logistics',
  // 전투·보안 (Fighter·Bomber·Gunship·Interceptor·Interdiction·Corvette·Frigate·Anti·Snub·Stealth)
  'Anti-Air': 'combat',
  'Anti-Vehicle': 'combat',
  Bomber: 'combat',
  Corvette: 'combat',
  Frigate: 'combat',
  Gunship: 'combat',
  'Heavy Bomber': 'combat',
  'Heavy Fighter': 'combat',
  'Heavy Fighter / Bomber': 'combat',
  'Heavy Gunship': 'combat',
  Interceptor: 'combat',
  Interdiction: 'combat',
  'Light Fighter': 'combat',
  'Medium Fighter': 'combat',
  'Snub Carrier': 'combat',
  'Snub Fighter': 'combat',
  'Starter / Light Fighter': 'combat',
  'Stealth Bomber': 'combat',
  'Stealth Fighter': 'combat',
  // 산업·자원 (Mining·Salvage)
  'Heavy Salvage': 'industry',
  'Light Mining': 'industry',
  'Light Salvage': 'industry',
  'Medium Mining': 'industry',
  'Medium Salvage': 'industry',
  'Starter / Light Mining': 'industry',
  'Starter / Light Salvage': 'industry',
  // 탐사·과학 (Expedition·Pathfinder·Science·Data)
  Expedition: 'exploration',
  'Light Science': 'exploration',
  'Medium Data': 'exploration',
  Pathfinder: 'exploration',
  'Starter / Pathfinder': 'exploration',
  // 지원·구조 (Medical·Refueling·Recovery)
  'Heavy Refueling': 'support',
  'Light Refueling': 'support',
  Medical: 'support',
  Recovery: 'support',
  // 여객·관광 (Passenger·Touring)
  'Luxury Touring': 'passenger',
  Passenger: 'passenger',
  Touring: 'passenger',
  // 지상·특수 (Tank=지상 장비, Modular=특수 플랫폼)
  'Heavy Tank': 'ground',
  'Light Tank': 'ground',
  Modular: 'ground',
  // 레이싱·기타 (Racing 명시 + 불명확/교차그룹 복합 = ambiguous)
  Racing: 'other',
  Generalist: 'other',
  Reporting: 'other',
  'Light Freight / Medium Fighter': 'other',
  'Medium Freight / Gun Ship': 'other',
};

// ambiguous(임의 추론 대신 other로 둔 역할) — 감사표에 별도 표기. Racing은 명시적 other라 ambiguous 아님.
const AMBIGUOUS = new Set([
  'Generalist',                       // 특정 그룹 없음(만능)
  'Reporting',                        // 보도/미디어 — 8개 그룹에 명확히 없음
  'Light Freight / Medium Fighter',   // 물류+전투 교차
  'Medium Freight / Gun Ship',        // 물류+전투 교차
]);

const canon = JSON.parse(read('data/canonical/ships-canonical.json'));
const distinct = [...new Set(canon.ships.map((s) => s.role).filter((r) => r && String(r).trim()))].sort();

const problems = [];
for (const r of distinct) {
  const g = ROLE_GROUP[r];
  if (!g) problems.push(`매핑 누락: "${r}"`);
  else if (!GROUP_KEYS.has(g)) problems.push(`잘못된 그룹키: "${r}" → ${g}`);
}
// 표에만 있고 canonical에 없는 잉여 키
const extra = Object.keys(ROLE_GROUP).filter((r) => !distinct.includes(r));
for (const r of extra) problems.push(`잉여(캐논에 없는) role 키: "${r}"`);
if (problems.length) { console.error('역할군 매핑 오류:\n  ' + problems.join('\n  ')); process.exit(1); }

let commit = 'unknown';
try { commit = execSync('git rev-parse HEAD', { cwd: ROOT }).toString().trim(); } catch { /* noop */ }

// 역할군별 role 목록(감사표)
const byGroup = {};
for (const g of GROUPS) byGroup[g.key] = [];
for (const r of distinct) byGroup[ROLE_GROUP[r]].push(r);

const roles = {};
for (const r of distinct) roles[r] = ROLE_GROUP[r];

const out = {
  layer: 'role-groups',
  note: 'canonical 원문 role → 8개 UX 역할군. 사실원=canonical role. focus/tags/career 미참조. RSI 카탈로그 제외.',
  generatedFromCommit: commit,
  source: 'ships-canonical.json[].role (distinct)',
  summary: {
    totalRoles: distinct.length,
    groups: GROUPS.length,
    missing: 0,
    duplicate: 0,
    ambiguousCount: distinct.filter((r) => AMBIGUOUS.has(r)).length,
  },
  groups: GROUPS,
  roles,                        // role → groupKey
  ambiguous: distinct.filter((r) => AMBIGUOUS.has(r)),
  audit: GROUPS.map((g) => ({ group: g.key, ko: g.ko, count: byGroup[g.key].length, roles: byGroup[g.key] })),
};

mkdirSync(join(ROOT, 'data/canonical'), { recursive: true });
writeFileSync(join(ROOT, 'data/canonical/role-groups.json'), `${JSON.stringify(out, null, 2)}\n`);
console.log(`role-groups.json 생성: role ${distinct.length} → 그룹 ${GROUPS.length}, 누락 0, ambiguous ${out.summary.ambiguousCount}`);
for (const g of out.audit) console.log(`  ${g.ko}(${g.group}): ${g.count} — ${g.roles.join(', ')}`);
