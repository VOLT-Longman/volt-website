// innerHTML 사용 래칫: XSS 표면이 늘어나는 것을 막는다.
//
// 배경: 이 저장소의 XSS 방어는 escapeHtml() 수동 호출 규율에 의존한다.
// 구조적 보장이 없으므로, 최소한 위험 싱크(innerHTML/outerHTML/insertAdjacentHTML/
// document.write) 사용 횟수가 "지금보다 늘어나면" 실패시키는 래칫을 둔다.
// a11y allowlist(tests/smoke/a11y.spec.js)와 같은 철학이다:
// 기존 부채는 기록하고, 새 부채만 차단하며, 갚을수록 베이스라인을 내린다.
//
// 사용법: node scripts/check-inner-html.mjs
// 종료 코드: 베이스라인 이하 0 / 초과 1.
//
// 새 렌더링 코드는 다음을 우선한다.
// - textContent / createElement / append 조합
// - 불가피하게 HTML 문자열을 조립하면 모든 동적 값에 escapeHtml() 적용
// 정말로 싱크를 추가해야 하면 리뷰 후 이 파일의 BASELINE을 함께 올린다.
// 사용을 줄였다면 BASELINE도 함께 내려 래칫을 조인다.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// 파일별 허용 상한. 새 파일은 기본 0 — HTML 싱크 없이 작성한다.
const BASELINE = {
  // 공지 2곳 → notices.js, 일정 1곳 → schedule.js, 임원진 1곳 → leadership.js로 이동 (총합 불변, 신규 싱크 아님)
  'js/main.js': 28,
  'js/notices.js': 2,
  'js/schedule.js': 1,
  'js/leadership.js': 1,
  'js/uex-panel.js': 17,
  'admin/admin.js': 9,
  'js/ships.js': 6,
  'js/mypage.js': 5,
  'js/auth-ui.js': 4,
  'js/search-modal.js': 2,
  'js/trade-planner.js': 2,
  'js/i18n.js': 1,
};

const SINK_PATTERN = /\.(?:innerHTML|outerHTML)\s*[+]?=|\.insertAdjacentHTML\s*\(|document\.write(?:ln)?\s*\(/g;

function collectJsFiles(dir) {
  const results = [];
  for (const entry of readdirSync(dir)) {
    const fullPath = path.join(dir, entry);
    if (statSync(fullPath).isDirectory()) {
      results.push(...collectJsFiles(fullPath));
    } else if (entry.endsWith('.js')) {
      results.push(fullPath);
    }
  }
  return results;
}

const targets = [
  ...collectJsFiles(path.join(root, 'js')),
  ...collectJsFiles(path.join(root, 'admin')),
];

const problems = [];
const improvements = [];
let totalCount = 0;

for (const file of targets) {
  const relative = path.relative(root, file).replaceAll('\\', '/');
  const source = readFileSync(file, 'utf8');
  const count = (source.match(SINK_PATTERN) || []).length;
  const allowed = BASELINE[relative] ?? 0;
  totalCount += count;

  if (count > allowed) {
    problems.push(`${relative}: HTML 싱크 ${count}곳 (허용 ${allowed}곳) — 새 코드는 textContent/createElement를 사용하세요.`);
  } else if (count < allowed) {
    improvements.push(`${relative}: ${count}곳 (베이스라인 ${allowed}곳) — BASELINE을 ${count}으로 내려 래칫을 조이세요.`);
  }
}

if (problems.length > 0) {
  console.error(`innerHTML 래칫 위반 ${problems.length}건:`);
  for (const problem of problems) console.error(` - ${problem}`);
  process.exit(1);
}

if (improvements.length > 0) {
  console.log('개선 감지 (실패 아님):');
  for (const message of improvements) console.log(` - ${message}`);
}

console.log(`OK: ${targets.length}개 파일, HTML 싱크 ${totalCount}곳 — 베이스라인 이내`);
