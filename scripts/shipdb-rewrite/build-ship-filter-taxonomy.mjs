// ShipDB 필터 분류(2축) 데이터 계약 생성기 (PM 확정 지시서 커밋 B).
// 2축: ① 규모·플랫폼(canonical size + 지상 platform) ② 역할(다중 태그 가능).
// 입력 = canonical의 size·role·platform만. Erkul raw를 읽지 않는다(platform은 B-2에서 canonical에 포함됨).
// 금지 입력: 레거시 focus·tags·career·설명·화물량·승무원·가격·함선ID 추측.
//  · 역할 태그 매핑은 원문 role의 정확한 값만(문자열 추론·부분일치 자동분류 금지) — 아래 ROLE_TAGS 표.
//  · 매핑에 없는 원문 role은 태그를 붙이지 않고 unmapped(미분류 사유)로 기록 + 세부 역할 검색/원문 라벨로 노출.
//  · 지상은 canonical.platform==='ground'(Erkul calculatorType 파생, canonical 소유). 크기 태그 대신 지상 태그.
//  · RSI 공식 데이터도 메인 함선DB에 포함한다. 해당 값은 RSI가 명시한 role·size만 사용한다.
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
  // RSI 공식 role — 원문 값마다 명시적으로만 분류한다.
  Boarding: ['combat', 'transport'], Combat: ['combat'], Destroyer: ['combat'],
  'Heavy Construction': ['support'], 'Heavy Mining': ['mining'], 'Heavy Repair': ['support'],
  'Heavy Science': ['science'], Industrial: ['support'], 'Light Carrier': ['combat', 'transport'],
  'Medium Repair / Medium Refuel': ['support', 'refuel'], Military: ['combat'], Minelayer: ['combat'],
  'Mining / Refining': ['mining', 'refining'], 'Multi-Role / Light Carrier': ['multipurpose', 'combat', 'transport'],
  Refinery: ['refining'],
};

const ROLE_TAG_KEYS = new Set(ROLE_TAGS.map((t) => t.key));

// platform(지상)은 canonical의 `platform` 또는 RSI 공식 size(vehicle)에서 온다.
// taxonomy는 레거시 raw를 읽지 않는다 — 규모 매핑·역할 태그만 정의한다.
const canon = JSON.parse(read('data/canonical/ships-canonical.json'));
const rsiOfficial = JSON.parse(read('data/canonical/ships-rsi-official.json'));
const rsiShips = rsiOfficial.records.map((record) => ({
  id: record.id,
  role: record.rsi?.role,
  size: record.rsi?.size,
  platform: record.rsi?.size === 'vehicle' ? 'ground' : 'space',
}));
const publicShips = [...canon.ships, ...rsiShips];

const distinctRoles = [...new Set(publicShips.map((ship) => ship.role).filter((role) => role && String(role).trim()))].sort();

// 검증: 매핑 태그 키 유효성 + 잉여 키
const problems = [];
for (const [role, tags] of Object.entries(ROLE_TAGS_MAP)) {
  if (!Array.isArray(tags) || tags.length === 0) problems.push(`${role}: 태그 없음`);
  for (const t of tags) if (!ROLE_TAG_KEYS.has(t)) problems.push(`${role}: 알 수 없는 태그키 ${t}`);
  if (!distinctRoles.includes(role)) problems.push(`잉여(공개 집합에 없는) role 키: ${role}`);
}
// 미분류: 매핑 표에 없는 공개 함선 role
const unmapped = distinctRoles.filter((r) => !ROLE_TAGS_MAP[r]).map((r) => ({ role: r, reason: '매핑 표 미포함 — 세부 역할 검색·원문 라벨로만 노출' }));
if (problems.length) { console.error('taxonomy 매핑 오류:\n  ' + problems.join('\n  ')); process.exit(1); }

// platform 분포(감사용) — Erkul canonical + RSI 공식 공개 집합에서 집계.
const platformCount = { ground: 0, space: 0, unknown: 0 };
for (const ship of publicShips) if (ship.platform in platformCount) platformCount[ship.platform]++;

let commit = 'unknown';
try { commit = execSync('git rev-parse HEAD', { cwd: ROOT }).toString().trim(); } catch { /* noop */ }

// 감사: 역할 태그별 role 목록 + 함선 수, 규모별 함선 수
const rolesByTag = {};
for (const t of ROLE_TAGS) rolesByTag[t.key] = [];
for (const r of distinctRoles) for (const t of (ROLE_TAGS_MAP[r] || [])) rolesByTag[t].push(r);
const shipCountByTag = {};
for (const t of ROLE_TAGS) shipCountByTag[t.key] = 0;
const sizeCount = { small: 0, medium: 0, large: 0, capital: 0 };
for (const ship of publicShips) {
  for (const t of (ROLE_TAGS_MAP[ship.role] || [])) shipCountByTag[t]++;
  if (ship.platform === 'ground') continue;
  const sz = SIZE_MAP[ship.size] || ship.size;
  if (sz) sizeCount[sz]++;
}

const roleTagMap = {};
for (const r of distinctRoles) roleTagMap[r] = ROLE_TAGS_MAP[r] || [];

const out = {
  layer: 'ship-filter-taxonomy',
  note: '2축(규모·플랫폼 / 역할) 필터 분류. 사실원=Erkul canonical과 RSI 공식의 명시 size·role·platform만. 레거시 편집분류 미참조.',
  generatedFromCommit: commit,
  source: 'ships-canonical.json[].size·role·platform + ships-rsi-official.json[].rsi.size·role',
  summary: {
    totalRoles: distinctRoles.length,
    mapped: distinctRoles.length - unmapped.length,
    unmapped: unmapped.length,
    platformCount,
  },
  axes: {
    // 지상은 canonical.platform==='ground'. 크기 태그는 canonical.size로. 축 표시 순서.
    size: { order: ['ground', ...SIZE_TAGS.map((t) => t.key)], tags: SIZE_TAGS, platform: PLATFORM_GROUND, map: SIZE_MAP },
    role: { order: ROLE_TAGS.map((t) => t.key), tags: ROLE_TAGS },
  },
  roleTagMap,                        // 원문 role → 역할 태그[]
  unmapped,
  audit: {
    sizeShipCount: sizeCount,
    roleTagShipCount: shipCountByTag,
    roleTagRoles: rolesByTag,
  },
};

mkdirSync(join(ROOT, 'data/canonical'), { recursive: true });
writeFileSync(join(ROOT, 'data/canonical/ship-filter-taxonomy.json'), `${JSON.stringify(out, null, 2)}\n`);
console.log(`ship-filter-taxonomy.json: role ${distinctRoles.length}(미분류 ${unmapped.length}) · platform ${JSON.stringify(platformCount)}`);
console.log('규모별 함선(원값):', JSON.stringify(sizeCount));
for (const t of ROLE_TAGS) console.log(`  ${t.ko}(${t.key}): 함선 ${shipCountByTag[t.key]} · role ${rolesByTag[t.key].length}`);
