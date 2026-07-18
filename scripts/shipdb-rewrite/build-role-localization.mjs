// ShipDB Erkul 재작성 v2 — role KO 지역화 생성기 (PM role 이관)
// 원칙(PM 계약):
//  · 사실원 = canonical role(Erkul EN)뿐. KO는 "역할 사실을 바꾸지 않는 UI 번역 계층"이다.
//  · VOLT 수기 role·career 조합·추론 기반 대체 금지. 여기서는 Erkul EN role 문자열 자체를 번역만 한다.
//  · canonical에 존재하는 모든 distinct role은 반드시 KO를 가져야 한다(누락 시 실패 = cutover 차단).
// 크기 접두: Light=경 / Medium=중형 / Heavy=대형. Starter=입문. Snub=스넙. Tank=전차(경전차/중전차, 군용 맥락 nova·storm).
//
//   node scripts/shipdb-rewrite/build-role-localization.mjs
//     → data/canonical/localization-roles.json

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

// Erkul EN role → KO UI 번역(통제어휘). 사실을 바꾸지 않는 표기 전환만.
const ROLE_KO = {
  'Anti-Air': '대공',
  'Anti-Vehicle': '대차량',
  Bomber: '폭격기',
  Corvette: '코르벳',
  Dropship: '드롭십',
  Expedition: '원정',
  Frigate: '프리깃',
  Generalist: '다목적',
  Gunship: '건십',
  'Heavy Bomber': '대형 폭격기',
  'Heavy Dropship': '대형 드롭십',
  'Heavy Fighter': '대형 전투기',
  'Heavy Fighter / Bomber': '대형 전투기 / 폭격기',
  'Heavy Freight': '대형 화물선',
  'Heavy Gunship': '대형 건십',
  'Heavy Refueling': '대형 급유선',
  'Heavy Salvage': '대형 인양선',
  'Heavy Tank': '중전차',
  Interceptor: '요격기',
  Interdiction: '인터딕션',
  'Light Fighter': '경 전투기',
  'Light Freight': '경 화물선',
  'Light Freight / Medium Fighter': '경 화물선 / 중형 전투기',
  'Light Mining': '경 채굴선',
  'Light Refueling': '경 급유선',
  'Light Salvage': '경 인양선',
  'Light Science': '경 과학선',
  'Light Tank': '경전차',
  'Luxury Touring': '럭셔리 관광선',
  Medical: '의료선',
  'Medium Data': '중형 정보선',
  'Medium Fighter': '중형 전투기',
  'Medium Freight': '중형 화물선',
  'Medium Freight / Gun Ship': '중형 화물선 / 건십',
  'Medium Mining': '중형 채굴선',
  'Medium Salvage': '중형 인양선',
  Modular: '모듈형',
  Passenger: '여객선',
  Pathfinder: '개척선',
  Racing: '레이싱',
  Recovery: '회수',
  Reporting: '보도',
  'Snub Carrier': '스넙 모함',
  'Snub Fighter': '스넙 전투기',
  'Starter / Light Fighter': '입문 / 경 전투기',
  'Starter / Light Freight': '입문 / 경 화물선',
  'Starter / Light Mining': '입문 / 경 채굴선',
  'Starter / Light Salvage': '입문 / 경 인양선',
  'Starter / Pathfinder': '입문 / 개척선',
  'Stealth Bomber': '스텔스 폭격기',
  'Stealth Fighter': '스텔스 전투기',
  Touring: '관광선',
};

const canon = JSON.parse(read('data/canonical/ships-canonical.json'));
const distinct = [...new Set(canon.ships.map((s) => s.role).filter((r) => r && String(r).trim()))].sort();

const missing = distinct.filter((r) => !ROLE_KO[r]);
if (missing.length) {
  console.error('canonical role에 KO 번역 누락 — 이관 차단:', missing.join(', '));
  process.exit(1);
}
// 표에만 있고 canonical에 없는 잉여 키(데이터 드리프트 감지용, 실패 아님·경고)
const extra = Object.keys(ROLE_KO).filter((r) => !distinct.includes(r));

let commit = 'unknown';
try { commit = execSync('git rev-parse HEAD', { cwd: ROOT }).toString().trim(); } catch { /* noop */ }

// canonical에 실제 존재하는 role만 방출(잉여 키 제외) — 사실 집합과 1:1.
const roles = {};
for (const r of distinct) roles[r] = ROLE_KO[r];

const out = {
  layer: 'localization-roles',
  note: 'canonical role(Erkul EN) → KO UI 번역. 사실원은 canonical role. 여기는 표기 계층일 뿐.',
  generatedFromCommit: commit,
  source: 'ships-canonical.json[].role (distinct)',
  summary: { total: distinct.length, ok: distinct.length, missing: 0, extraUnusedKeys: extra.length },
  roles,
};

mkdirSync(join(ROOT, 'data/canonical'), { recursive: true });
writeFileSync(join(ROOT, 'data/canonical/localization-roles.json'), `${JSON.stringify(out, null, 2)}\n`);
console.log(`localization-roles.json 생성: distinct role ${distinct.length}, KO 누락 0, 잉여 미사용 키 ${extra.length}`);
