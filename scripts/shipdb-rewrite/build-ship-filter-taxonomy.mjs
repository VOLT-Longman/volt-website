// ShipDB 필터 분류(2축) 데이터 계약 생성기 (PM 확정 지시서 커밋 B).
// 2축: ① 규모·플랫폼(size + 지상 platform) ② 역할(다중 태그 가능).
// 입력 = canonical의 size·role + Erkul 직접 필드 calculatorType(ship/vehicle)뿐.
// 금지 입력: 레거시 focus·tags·career·설명·화물량·승무원·가격·함선ID 추측.
//  · 역할 태그 매핑은 원문 role의 정확한 값만(문자열 추론·부분일치 자동분류 금지) — 아래 ROLE_TAGS 표.
//  · 매핑에 없는 원문 role은 태그를 붙이지 않고 unmapped(미분류 사유)로 기록 + 세부 역할 검색/원문 라벨로 노출.
//  · 지상 태그는 Erkul calculatorType==='vehicle'(직접 필드)로만. 근거 없으면(raw 미조인) 지상 아님(size 태그).
//  · RSI 공식 카탈로그는 대상 아님(별도).
//
//   node scripts/shipdb-rewrite/build-ship-filter-taxonomy.mjs
//     → data/canonical/ship-filter-taxonomy.json

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

// 규모·플랫폼 축. 지상은 크기가 아니라 플랫폼(Erkul calculatorType).
const SIZE_TAGS = [
  { key: 'small', ko: '소형', en: 'Small' },
  { key: 'medium', ko: '중형', en: 'Medium' },
  { key: 'large', ko: '대형', en: 'Large' },
  { key: 'capital', ko: '캐피탈', en: 'Capital' },
];
const SIZE_MAP = { S1: 'small', S2: 'small', S3: 'medium', S4: 'large', S5: 'large', S6: 'capital' };
const PLATFORM_GROUND = { key: 'ground', ko: '지상', en: 'Ground' };

// 역할 축(14). 정제(refining)는 현재 원문 역할 없음 — 계약에 유지(0이면 UI 숨김).
const ROLE_TAGS = [
  { key: 'combat', ko: '전투', en: 'Combat' },
  { key: 'cargo', ko: '화물', en: 'Cargo' },
  { key: 'transport', ko: '수송', en: 'Transport' },
  { key: 'salvage', ko: '인양', en: 'Salvage' },
  { key: 'mining', ko: '채광', en: 'Mining' },
  { key: 'refining', ko: '정제', en: 'Refining' },
  { key: 'refuel', ko: '급유', en: 'Refueling' },
  { key: 'medical', ko: '의료', en: 'Medical' },
  { key: 'exploration', ko: '탐사', en: 'Exploration' },
  { key: 'science', ko: '과학', en: 'Science' },
  { key: 'racing', ko: '레이싱', en: 'Racing' },
  { key: 'multipurpose', ko: '다목적', en: 'Multipurpose' },
  { key: 'modular', ko: '모듈', en: 'Modular' },
  { key: 'support', ko: '지원', en: 'Support' },
];

// 원문 role → 역할 태그(들). PM 확정 지시서 §4 표를 그대로 인코딩(추론·부분일치 없음).
const ROLE_TAGS_MAP = {
  // 전투
  'Anti-Air': ['combat'], 'Anti-Vehicle': ['combat'], Bomber: ['combat'], Corvette: ['combat'],
  Frigate: ['combat'], Gunship: ['combat'], 'Heavy Bomber': ['combat'], 'Heavy Fighter': ['combat'],
  'Heavy Fighter / Bomber': ['combat'], 'Heavy Gunship': ['combat'], 'Heavy Tank': ['combat'],
  Interceptor: ['combat'], Interdiction: ['combat'], 'Light Fighter': ['combat'], 'Light Tank': ['combat'],
  'Medium Fighter': ['combat'], 'Snub Fighter': ['combat'], 'Starter / Light Fighter': ['combat'],
  'Stealth Bomber': ['combat'], 'Stealth Fighter': ['combat'],
  // 화물
  'Light Freight': ['cargo'], 'Medium Freight': ['cargo'], 'Heavy Freight': ['cargo'], 'Starter / Light Freight': ['cargo'],
  // 수송
  Dropship: ['transport'], 'Heavy Dropship': ['transport'], Passenger: ['transport'], Touring: ['transport'],
  'Luxury Touring': ['transport'], 'Snub Carrier': ['transport'],
  // 인양 (+ Recovery는 인양·지원 겸)
  'Light Salvage': ['salvage'], 'Medium Salvage': ['salvage'], 'Heavy Salvage': ['salvage'],
  Recovery: ['salvage', 'support'], 'Starter / Light Salvage': ['salvage'],
  // 채광
  'Light Mining': ['mining'], 'Medium Mining': ['mining'], 'Starter / Light Mining': ['mining'],
  // 급유 (+ 지원 겸)
  'Light Refueling': ['refuel', 'support'], 'Heavy Refueling': ['refuel', 'support'],
  // 의료 (+ 지원 겸)
  Medical: ['medical', 'support'],
  // 탐사
  Pathfinder: ['exploration'], Expedition: ['exploration'], 'Starter / Pathfinder': ['exploration'],
  // 과학
  'Light Science': ['science'], 'Medium Data': ['science'], Reporting: ['science'],
  // 레이싱 · 다목적 · 모듈
  Racing: ['racing'], Generalist: ['multipurpose'], Modular: ['modular'],
  // 복합(화물+전투)
  'Light Freight / Medium Fighter': ['cargo', 'combat'], 'Medium Freight / Gun Ship': ['cargo', 'combat'],
};

const ROLE_TAG_KEYS = new Set(ROLE_TAGS.map((t) => t.key));

const canon = JSON.parse(read('data/canonical/ships-canonical.json'));
const ops = JSON.parse(read('data/canonical/operational-ships.json'));
const raw = JSON.parse(read('data/external/erkul/ships.raw.json')); // Erkul 원본 — calculatorType(직접 필드)

// 플랫폼: canonical id → operational.erkulLocalName → raw.calculatorType(ship/vehicle)
const calcByLocalName = {};
for (const r of raw) calcByLocalName[r.localName] = r.calculatorType;
const localNameById = {};
for (const r of ops.records) localNameById[r.id] = r.erkulLocalName;

const distinctRoles = [...new Set(canon.ships.map((s) => s.role).filter((r) => r && String(r).trim()))].sort();

// 검증: 매핑 태그 키 유효성 + 잉여 키
const problems = [];
for (const [role, tags] of Object.entries(ROLE_TAGS_MAP)) {
  if (!Array.isArray(tags) || tags.length === 0) problems.push(`${role}: 태그 없음`);
  for (const t of tags) if (!ROLE_TAG_KEYS.has(t)) problems.push(`${role}: 알 수 없는 태그키 ${t}`);
  if (!distinctRoles.includes(role)) problems.push(`잉여(캐논에 없는) role 키: ${role}`);
}
// 미분류: 매핑 표에 없는 canonical role
const unmapped = distinctRoles.filter((r) => !ROLE_TAGS_MAP[r]).map((r) => ({ role: r, reason: '매핑 표 미포함 — 세부 역할 검색·원문 라벨로만 노출' }));
if (problems.length) { console.error('taxonomy 매핑 오류:\n  ' + problems.join('\n  ')); process.exit(1); }

// 플랫폼(지상) id 목록 + 미조인
const groundIds = [];
const unjoined = [];
for (const s of canon.ships) {
  const ln = localNameById[s.id];
  const ct = ln != null ? calcByLocalName[ln] : undefined;
  if (ct === undefined) { unjoined.push(s.id); continue; }
  if (ct === 'vehicle') groundIds.push(s.id);
}
groundIds.sort();

let commit = 'unknown';
try { commit = execSync('git rev-parse HEAD', { cwd: ROOT }).toString().trim(); } catch { /* noop */ }

// 감사: 역할 태그별 role 목록 + 함선 수, 규모별 함선 수
const rolesByTag = {};
for (const t of ROLE_TAGS) rolesByTag[t.key] = [];
for (const r of distinctRoles) for (const t of (ROLE_TAGS_MAP[r] || [])) rolesByTag[t].push(r);
const shipCountByTag = {};
for (const t of ROLE_TAGS) shipCountByTag[t.key] = 0;
const sizeCount = { small: 0, medium: 0, large: 0, capital: 0 };
for (const s of canon.ships) {
  for (const t of (ROLE_TAGS_MAP[s.role] || [])) shipCountByTag[t]++;
  const sz = SIZE_MAP[s.size];
  if (sz) sizeCount[sz]++;
}

const roleTagMap = {};
for (const r of distinctRoles) roleTagMap[r] = ROLE_TAGS_MAP[r] || [];

const out = {
  layer: 'ship-filter-taxonomy',
  note: '2축(규모·플랫폼 / 역할) 필터 분류. 사실원=canonical size·role + Erkul calculatorType(지상). focus/tags/career 미참조. RSI 제외.',
  generatedFromCommit: commit,
  source: 'ships-canonical.json[].size·role + operational erkulLocalName + erkul/ships.raw.json calculatorType',
  summary: {
    totalRoles: distinctRoles.length,
    mapped: distinctRoles.length - unmapped.length,
    unmapped: unmapped.length,
    groundShips: groundIds.length,
    unjoinedPlatform: unjoined.length,
  },
  axes: {
    size: { order: ['ground', ...SIZE_TAGS.map((t) => t.key)], tags: SIZE_TAGS, platform: PLATFORM_GROUND, map: SIZE_MAP },
    role: { order: ROLE_TAGS.map((t) => t.key), tags: ROLE_TAGS },
  },
  platformGroundIds: groundIds,     // Erkul calculatorType==='vehicle'
  roleTagMap,                        // 원문 role → 역할 태그[]
  unmapped,
  audit: {
    sizeShipCount: sizeCount,
    roleTagShipCount: shipCountByTag,
    roleTagRoles: rolesByTag,
    unjoinedPlatform: unjoined,
  },
};

mkdirSync(join(ROOT, 'data/canonical'), { recursive: true });
writeFileSync(join(ROOT, 'data/canonical/ship-filter-taxonomy.json'), `${JSON.stringify(out, null, 2)}\n`);
console.log(`ship-filter-taxonomy.json: role ${distinctRoles.length}(미분류 ${unmapped.length}) · 지상 ${groundIds.length}(미조인 ${unjoined.length})`);
console.log('규모별 함선:', JSON.stringify(sizeCount), '| 지상', groundIds.length);
for (const t of ROLE_TAGS) console.log(`  ${t.ko}(${t.key}): 함선 ${shipCountByTag[t.key]} · role ${rolesByTag[t.key].length}`);
