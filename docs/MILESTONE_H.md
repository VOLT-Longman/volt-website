# 마일스톤 H — 모바일 환경 최적화 & 코드 최적화 (계획)

기준 커밋: **`3e66dc7`** (2026-07-12). 게이트: `npm run check` ✅(경고 0 — G0 위생 스윕 이후 클린) ·
Functions/Playwright는 태그 `v1.0-quality`(`e501866`) 이후 각 커밋에서 갱신 유지.

## 배경

지난 마일스톤(C/D)이 회복탄력성·권한 정합에 집중했다면, 그 사이(랜딩 리디자인 D-①~⑧, G0-G4 위생 스윕)로
파일 규모가 늘었다(`css/styles.css` 7,899→**8,307줄**, `js/landing.js` 247→**381줄**). 이번엔 실사 기준으로
"모바일에서 실제로 비용이 되는 지점"과 "코드 규모/구조 부채"를 좁혀 정리한다. 마일스톤 G(SEO)는 별도 트랙 —
겹치지 않음.

원칙(기존과 동일): 대규모 리팩터 지양, 독립 커밋 단위, 게이트 통과 후 반영. **본 문서는 계획만 — 구현 착수 전 확인 필요.**

---

## H-1. 스타필드 캔버스: 터치 기기에서 낭비되는 상시 RAF 루프 (P1)

**문제**: `js/landing.js`의 히어로 배경 스타필드는 `requestAnimationFrame`로 홈 섹션이 보이는 동안 계속
다시 그린다(`draw(t)` 매 프레임 호출, `document.hidden`/`!canvas.offsetParent`일 때만 스킵). 마우스 시차
효과는 `pointermove` 이벤트로 갱신되는데, **터치 기기에는 `pointermove`가 사실상 발생하지 않아** 시차 효과가
전혀 체감되지 않는다. 그런데도 모바일에서 별 개수만 줄인 채(120→55) 60fps 캔버스 리드로우는 그대로 돌아간다
— 시각적 이득 없이 배터리·CPU만 소모.

**작업**: `window.matchMedia('(pointer: coarse)').matches`(또는 `!fineMotionOk()`와 동일 기준)일 때
① RAF 루프를 아예 돌리지 않고 `draw(0)` 1회만 정적 렌더 하거나, ② 프레임레이트를 낮춰(예: 10~15fps로
스로틀) 배터리 비용을 줄인다. `prefersReducedMotion()` 처리와 동일한 패턴(정적 1회 렌더 후 return)을
재사용하면 구현 난이도가 낮다.

**완료 기준**: 모바일 뷰포트(터치 시뮬레이션)에서 스타필드가 정적 렌더 또는 저프레임으로 확인,
데스크톱(마우스) 시차 효과는 기존 그대로 유지. 스모크: `page.emulateMedia` 또는 `hasTouch: true` 컨텍스트로
RAF 호출 빈도 또는 `canvas` 리드로우 여부 검증.
권장 커밋명: `perf: skip/throttle starfield RAF loop on coarse-pointer devices`

## H-2. 모바일 테스트 커버리지 공백 — 320px/가로모드 (P2)

**문제**: 현재 모바일 스모크는 **390px 고정 1종**(`mobile.spec.js`)과 CSS overflow 가드(`390/430/768px`,
`css-regression.spec.js`)뿐이다. 구형/보급형 기기(iPhone SE 1세대, 저가 안드로이드)의 **320px 폭**과
**가로모드(landscape)**는 전혀 검증되지 않는다. 실제 깨짐이 확인된 것은 아니나, 좁은 폭에서 자주 문제되는
지점(칩 가로 스크롤, 모달 2열 스펙, CTA 버튼 폭)이 이미 390px 기준으로 튜닝돼 있어 320px에서 여유가 없을
수 있다.

**작업**: 320px 뷰포트로 핵심 화면(홈/함선DB/무역플래너/공지) 최소 방문 + overflow 0 확인을 기존
`css-regression.spec.js`의 폭 배열에 추가. 가로모드는 `{ width: 844, height: 390 }` 같은 스왑 뷰포트로
홈 히어로만 우선 점검(스코프 최소화).

**완료 기준**: 320px 폭 4~5화면 overflow 가드 통과, 실제 깨짐 발견 시 별도 이슈로 분리(이 항목은 커버리지
확보가 목적, 발견된 버그 수정은 범위 밖).
권장 커밋명: `test: add 320px + landscape mobile coverage`

---

## H-3. main.js 잔여 모듈화 (P2, BACKLOG 기존 항목 — 재확인)

**문제**: `js/main.js`는 notices(`8af04fb`)·schedule(`680ff3d`)·leadership(G4, `c992f82`)가 이미 분리돼
2002→**1875줄**로 줄었지만, **연혁(timeline)·FAQ·정책(policy)·무역가이드·가입 체크리스트·무역허브 피처**
렌더 함수 6개(`renderTimeline`, `renderFaq`, `renderPolicy`, `renderTradeGuide`, `renderJoinSteps`,
`renderHubFeatures`)가 여전히 main.js에 남아 있다. BACKLOG.md의 줄 수 표기(1985)도 stale — 실측 1875로
정정 필요.

**작업**: notices/schedule/leadership과 동일 패턴(`window.VOLT_X = { init(deps), ... }` + main.js는 위임
shim만 유지)으로 timeline부터 분리. 한 커밋에 하나씩, 각각 게이트 통과 확인 후 다음으로.

**완료 기준**: main.js 1700줄 이하(1차 목표: timeline만), 해당 섹션 스모크 전부 통과.
권장 커밋명: `refactor: extract timeline renderer from main` (이후 faq/policy 등 후속 커밋)

## H-4. 죽은 에셋 정리 (P2, 저위험)

**문제**: `assets/images/VOLT_logo.png`(233KB)가 코드베이스 어디에서도 참조되지 않는다(실제 사용은
`VOLT_logo.webp`, 26.5KB). 클라이언트가 다운로드하는 자산은 아니라 런타임 성능에는 영향 없지만, 저장소
용량과 향후 오인 사용(신규 기여자가 "PNG가 있으니 이게 최신"으로 착각) 리스크가 있다.

**작업**: 참조 0건 재확인 후 `git rm assets/images/VOLT_logo.png`.

**완료 기준**: 삭제 후 `npm run check:links` 통과(참조 없었음을 재확인), 시각적 변화 없음(스크린샷 회귀 그대로).
권장 커밋명: `chore: remove unused VOLT_logo.png`

## H-5. 폰트 스택의 유령 항목 정리 (P3, 선택)

**문제**: `--font-family`가 `"Pretendard Variable", "Pretendard", ...`로 시작하지만 `@font-face`나 CDN
로드가 전혀 없다 — 즉 이 두 폰트는 **어떤 사용자 기기에서도 매치되지 않고** 항상 다음 순위(`Noto Sans KR`
→ 시스템 폰트)로 폴백된다. 성능 문제는 아니지만(네트워크 요청 자체가 없음), 코드가 실제 동작과 다른
의도를 표현하고 있어 다음 사람이 "Pretendard가 로드되는 중" 이라고 오해할 수 있다.

**작업**: 둘 중 결정.
- **A**: Pretendard를 실제로 로드(웹폰트 CDN 또는 자체 호스팅) — 한글 가독성 개선 목적이면 의미 있으나
  네트워크 비용(가변폰트 통상 100KB+) 추가, 모바일 저속 회선에서 부담. LCP/CLS 영향 검토 필요.
  **모바일 최적화 취지와 상충 가능** — 신중 검토.
  **B**: 로드 안 할 거면 `"Pretendard Variable", "Pretendard"`를 폰트 스택에서 제거해 실제 동작과 코드를
  일치시킴.

**완료 기준**: A라면 폰트 로드 후 LCP 회귀 없음 확인(스크린샷+수동 확인). B라면 폰트 스택 정리 + 시각적
차이 없음 확인(현재도 폴백 폰트로 렌더되고 있었으므로).
권장 커밋명: `perf: load Pretendard webfont` (A) / `chore: drop unused Pretendard font-family entries` (B)

---

## 이번 실사에서 "이미 잘 돼 있음"으로 확인된 것 (재작업 불필요)

- 스크립트 로딩: `theme-init.js`(FOUC 방지 목적, 의도적 blocking) 제외 전부 `defer` — 렌더 블로킹 없음.
- 무거운 섹션(함선DB·갤러리) 지연 렌더, ship-en.js·ship-live-stats/market 지연 로드 — 이미 완료(마일스톤 이전).
- 터치 타깃 ≥36px, 모바일 필터 칩 가로 스크롤, 함선 모달 2열 스펙 — 이미 반영.
- `prefers-reduced-motion` 전역 존중, 커서 추적형 인터랙션(틸트·마그네틱)은 `pointer: fine`에서만 활성화.
- PWA manifest 아이콘 세트(webp+png, maskable 포함) 정상.
- gzip 기준 핵심 페이로드: CSS 33KB, main.js 24KB, i18n 17KB, volt-data 30KB — 크지 않음. 무거운 건
  `ship-live-stats.js`(gzip 93KB)뿐인데 이미 지연 로드 대상.
- `npm run check` lint 경고 0(G0 위생 스윕에서 상환 완료).
- CSS cascade 중복(마일스톤 이전 정리: 155→129→100) — 남은 100건은 콤마 그룹 공유 패턴이라 이번 범위에서도 재작업 대상 아님(근거는 BACKLOG.md에 이미 기록).

## 우선순위 제안

1. **H-1** (P1) — 실사용자 배터리 비용에 실제로 영향, 구현 간단(기존 `fineMotionOk` 패턴 재사용).
2. **H-3** (P2) — BACKLOG에 이미 있던 항목, 안전한 패턴 반복이라 저위험.
3. **H-4** (P2) — 5분짜리 정리, 순서 상관없이 아무 때나.
4. **H-2** (P2) — 커버리지 확대, 버그 발견 시 후속 필요할 수 있음.
5. **H-5** (P3) — 방향(A/B) 결정 필요, PM 판단 대기.
