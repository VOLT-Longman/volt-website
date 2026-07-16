# 작업 상태 — 2026-07-14

## 협업 기준 (세션 공통 — M0에서 확정)

- **랜딩 소유**: 현행 중앙 히어로("MOVE THE VERSE." + hero-proof)가 확정안이다.
  랜딩 구조 변경은 이 문서에 선언한 뒤 진행한다 — 두 세션이 같은 화면을 다른 방향으로 밀지 않는다.
- **시각 회귀 기준(단일 환경)**: 권위 있는 기준 이미지는 **GitHub Actions(ubuntu, `-linux.png`)**다.
  갱신은 `visual-baseline` 워크플로(수동 dispatch)로만 한다 — "승인된 변경일 때만 갱신" 원칙.
  로컬 win32 기준은 개발 편의용 참고본이며, 세션 간 서브픽셀 차이로 어긋나도 회귀로 취급하지 않는다.
- **반응형 기준점**: 새 반응형 작업은 **480 / 768 / 1200**을 우선 사용한다.
  기존 원오프 breakpoint(600/640/680/860/900/1040/1100)는 해당 컴포넌트를 수정할 때만 정리한다.

## 작업 영역 소유권 (I-1.1부터 강제)

같은 경로를 병행 세션이 반대 방향으로 수정하는 충돌을 막기 위해, 작업 시작 전에
이 문서에 **기준 SHA·수정 경로·담당 영역·해제 조건**을 선언한다. 선언된 경로는
다른 세션이 직접 수정하거나 main에 푸시하지 않고, 원 담당자의 명시적 인계 또는
PM의 대체 결정을 기다린다.

| 담당 영역 | 기본 소유 경로 | 공용/예외 |
|---|---|---|
| 디자인 | `css/`, `assets/fonts/`, `scripts/font/`, 히어로 조각, `tests/smoke/font.spec.js`, 랜딩 시각 기준 | `index.html`의 히어로 밖 영역은 공용 |
| 데이터·백엔드 | `functions/`, `migrations/`, `data/`, `scripts/erkul/`, 데이터 계약 테스트 | UI 표면을 바꾸면 디자인 담당에 인계 |
| 공용 통합 | `WORK_STATUS.md`, `sw.js`, CI 워크플로, `package.json`, 공통 진입점·스냅샷 | 두 담당자가 범위와 검증을 함께 기록 |

- **시작 선언**: `진행 중` 항목에 기준 SHA, 대상 파일·경로, 담당 영역, 예상 검증을 쓴다.
- **충돌 금지**: 선언 경로와 겹치는 작업은 새 브랜치·직접 main 푸시를 포함해 중단하고 인계를 요청한다.
- **대체 결정**: PM이 기존 결정을 대체하면, 이전 커밋·대체 커밋·회귀 검증을 한 항목에 함께 남긴다.
- **푸시 전 확인**: `origin/main`과의 변경 경로가 다른 진행 선언과 겹치지 않는지 확인한 뒤에만 main에 푸시한다.

### 현재 경로 잠금

| 담당 영역 | 기준 SHA | 수정 경로 | 해제 조건 |
|---|---|---|---|
| 없음 | — | — | 새 작업 시작 시 이 행을 실제 작업 선언으로 교체 |

## 이번 반영으로 완료 (I-1 디자인, 2026-07-15)

- **폰트 격리 결정 대체**: 이전 반영의 "미완성 폰트 격리"는 v3(신규 Node 생성기)로 대체됐다 — PM 직접 지시(I-1). 클리핑 우려는 landing.spec h1 overflow 계약으로 흡수.
- **Orbit Display v3**: Python beam 생성기 → Node 전용 생성기(외부 의존성 0, TTF+WOFF2 직접 인코딩)로
  교체. 라운드 캡 스트로크·진원 보울(오버슈트) 기반 애플 계열 지오메트리, 글리프 36→48
  (숫자·기호 확장). 적용 범위를 "지표 전용" → 브랜드 표면 전반(h1·로고·태그라인·eyebrow·배지)으로
  확대 — font.spec 계약 갱신. 한글은 여전히 시스템 폴백.
- **Liquid Glass UI (I-1)**: 표면 오버라이드 레이어로 재해석 — 구조(HTML) 무변경.
  블러는 고정 크롬/오버레이(nav·검색·모달·모바일 메뉴·토스트·lang·AI 패널)에만, 카드류는
  무블러 글래스 톤(레이어드 배경+스펙큘러 인셋). 콘센트릭 라운딩(radius 14/22/30),
  모바일 블러 축소(≤860px 14px), `prefers-reduced-transparency` 솔리드 폴백.
  랜딩 구조는 소유 기준 그대로 유지 — 표면 재질만 변경했음을 선언한다.

## 이번 반영으로 완료 (I-1.1 범위·운영 보수, 2026-07-16)

- **Orbit v3 범위 축소**: 전용 서체는 영문 히어로 제목·태그라인에만 적용한다. 내비 로고,
  작은 배지, 카드 eyebrow, hero-proof 지표는 제품 기본/모노 서체로 되돌려 작은 크기의 가독성을 보존한다.
- **비로그인 RSVP 조용한 처리**: 로그인 전에는 보호된 RSVP 집계 API를 요청하지 않는다. 세션이
  만료돼 401이 반환돼도 콘솔 경고를 만들지 않고 기존 로그인 안내를 유지한다.
- **작업 소유권 규약**: 위의 경로 단위 잠금·인계·PM 대체 기록 규칙을 협업 기준으로 추가했다.

## 이번 반영으로 완료 (I-1.2 폰트 전수 정규화, 2026-07-16)

- **Orbit 정합성**: 단일 정적 SemiBold(600) 메타데이터·CSS·히어로 렌더 굵기를 일치시키고 합성 굵기를
  차단했다. 실제 포함 글리프와 `unicode-range`도 같은 범위로 고정했다.
- **생성 경로 단일화**: Node 생성기만 남기고 `font:build`/`font:check`를 추가했다. 기본 `check`가
  TTF/WOFF2 구조, 이름·굵기 메타데이터, 히어로 문구 글리프를 매회 검사한다.
- **전역 폴백 정리**: 메인, CMS, 404가 공통 한글 시스템 스택과 공통 모노 폴백을 사용한다.

## 이번 반영으로 완료 (I-1.3 원래 제품 서체 복원, 2026-07-16)

- **Orbit 전면 제거**: 사용자 확인에 따라 전용 VOLT Orbit 웹폰트의 적용·파일·프리로드·서비스워커 캐시·
  생성/검증 도구를 모두 제거했다. 히어로는 I-1 이전의 제품 기본 서체(제목 900)와 모노 태그라인을 사용한다.
- **회귀 계약 전환**: 스모크 테스트는 Orbit 로드가 아니라 전용 폰트가 히어로에 남지 않고, 기본 서체에서
  클리핑 없이 렌더되는지를 검증한다.

## 이번 반영으로 완료 (I-1.5 리퀴드 스펙큘러 하이라이트, 2026-07-16)

- **포인터 추종 반사광**: I-1.4가 커버한 필터 칩 3종·입력 7종에 `js/landing.js`
  `setupGlassSheen()`(신규)으로 포인터 위치 기반 `radial-gradient` 스펙큘러 하이라이트 추가.
  `--sheen-x`/`--sheen-y` CSS 커스텀 프로퍼티를 `pointermove`로 갱신하고 `.is-sheening` 클래스로
  토글 — `background-image` 2번째 레이어로 `--glass-bg` 위에 얹는다.
  기존 `setupTilt`/`setupMagnetic`과 동일한 `fineMotionOk()` 게이트(coarse pointer·
  reduced-motion 완전 비활성) 재사용.
- **위임(delegation) 방식**: notices.js/ships.js/uex-panel.js가 언어 전환·데이터 갱신 때마다 다시
  렌더하는 요소이므로, 개별 리스너 대신 `document`에 단일 `pointermove` 리스너를 걸고
  `closest()`로 매칭 — 재렌더된 요소도 별도 재바인딩 없이 자동 커버.
  칩/active 상태는 `background` shorthand가 우선해 하이라이트가 자동으로 가려짐(추가 처리 불필요).
- **검증**: `tests/smoke/landing.spec.js`에 2건 추가(fine pointer hover 시 `--sheen-x` 갱신·이탈 시
  해제, coarse pointer에서 `.is-sheening` 전무 확인). check ✅ · functions 120/120 ✅ ·
  Playwright 246/246. 스크린샷 크롭으로 육안 확인(칩·입력 모두 커서 위치 따라 하이라이트 이동).

## 이번 반영으로 완료 (I-1.4 Liquid Glass 표면 커버리지 확장, 2026-07-16)

- **카드/패널 25종 추가**: I-1이 커버한 11개 카드류(landing/notice/schedule/guide/hub/join-checklist/
  leader/gallery/ship/volt-ai-source/faq)에 `.card`·`.culture-item`·`.streamer-card`·
  `.ship-compare-bar`·`.ship-advanced-panel`·`.uex-live-panel`·`.uex-candidate-card`·
  `.uex-recommend-card`·`.guide-tool-card`·`.partner-fleet-card`·`.mypage-card`·`.comms-card`·
  `.ledger-mobile-card`·`.static-guide-card`를 무블러 글래스 톤(기존 `--glass-bg`/`--glass-inset`
  토큰 재사용)으로 확장 — 새 토큰 추가 없이 기존 레이어링 기법(개별 selector의 `background`
  위에 후속 규칙으로 `background-image` 얹기) 그대로 적용해 회귀 위험을 최소화했다.
- **필터 칩·입력 필드**: `.notice-filter-btn`·`.ship-filter-btn`·`.uex-loc-btn`(비활성 상태만 —
  active/hover는 기존 실색 강조 유지, specificity로 자동 보존)과 `.ship-search`·
  `.global-search-input`·`.trade-planner-form input/select`·`.planner-picker input`·
  `.volt-ai-input`·`.ledger-qty-field input`에 동일 글래스 톤 적용 — 카드와 입력 표면이
  시각적으로 통일됨.
- **오버레이 2종 승격**: `.nav-more-menu`/`.nav-trade-menu`(드롭다운)·`.pwa-install-prompt`(플로팅
  설치 안내)를 무블러 톤에서 기존 블러 크롬 그룹(`.search-panel`/`.modal-card`류, `.toast`류)으로
  이동 — 모바일 블러 축소 미디어쿼리·`prefers-reduced-transparency` 폴백 목록에도 동반 추가.
- **검증**: check ✅ · functions 120/120 ✅ · Playwright 244/244(시각회귀 포함, linux 기준 스냅샷 대비
  `maxDiffPixels` 임계 이내 — 카드 표면 변화가 미묘해 골든 계약을 깨지 않음). 화면별 스크린샷
  수동 검토(홈/함선DB/공지/일정/무역플래너/임원진)로 과도함 없이 자연스러운 확장인지 확인.

## 이전 반영으로 완료 (M1 + M1.1, 2026-07-15)

- **M1.1 정확성 보수 (활성화 전 필수)**: ① 답변을 서버 확정(도구 템플릿)으로 고정하고 모델 문장은
  `aiNote` 보조 설명으로 분리 — 도구 데이터에 없는 수치가 들어오면 서버가 폐기. ② UEX 시세는
  date_modified 60분 이내 행만 안내(전부 오래되면 stale 명시, 가격 미생성). ③ "다가오는 일정"은
  오늘 이후를 가까운 순으로(날짜 없는 항목은 후순위). ④ 비용 상한 표현을 "예산 보호 장치(근사)"로
  정정, 일일 초기화 = UTC 자정(KST 09:00) 명시.
- **VOLT AI MVP (도구 기반)**: `/api/ai/chat` 단일 관문 — Discord 멤버 전용, 분당 8회·일일 200회·
  일 ₩3,000/월 ₩30,000 예산 보호 장치(근사 집계), 대화 원문 미저장(사용량·도구 종류만 익명 집계).
  결정론 도구 4종(함선 추천/비교 — ShipDB Erkul 레이어, UEX 시세 — 자체 프록시, 일정·공지 — D1),
  Workers AI 어댑터(`_shared/ai-model.js`, 교체 가능), 모델 무존재 시 템플릿 폴백.
  모든 수치 응답에 출처 카드+기준 시각. UEX 불가 시 추천 미생성·불가 명시.
  Functions 13건·스모크 5건 추가. **활성화는 운영자 작업**(런북 7-2절: AI 바인딩 + `VOLT_AI_ENABLED=true`).

## 이전 반영으로 완료 (M0, 2026-07-14)

- 홈 시각 스냅샷 실패 해소(폰트 계량 범위 변경분 기준 갱신 — PM #6 승인 대기 표기).
- 시각 회귀 CI 단일화: linux 기준 생성 워크플로 + CI skip 해제 + 실패 시 diff/trace 아티팩트.
- README 문서 색인 G/H 완료 정정, `waitForTimeout` 심사·교체, CSS 중복 146건 분류(아래 백로그).

## 이전 반영으로 완료 (2026-07-13)

- 마일스톤 H-1~H-5: 터치 스타필드 비용 절감, 320px·가로모드 회귀망, 정적 콘텐츠 모듈화,
  미사용 PNG 제거, 폰트 스택 정리.
- 마일스톤 G-1~G-5: 섹션별 제목, SearchAction 실제 동작, FAQ JSON-LD 검증, 공유 메타,
  `/guide/` 정적 가이드와 sitemap.
- 백로그 재검증: 함선 EN 데이터와 RSVP 표시 i18n은 이미 구현되어 있었고, ShipDB 후보 분류는 완료 상태로 정정.

## 운영자 또는 외부 원본 대기

| 항목 | 필요한 권한 또는 입력 | 실행 방법 |
|---|---|---|
| D1 migration 0008~0011 적용 확인 | 운영 D1 접근 권한 | `SELECT id, applied_at FROM schema_migrations ORDER BY id;` |
| Admin Erkul preview 리허설 | 관리자 로그인 | CMS에서 preview 실행 → hash 확인 → 로컬 apply |
| Hammerhead 가격 anomaly | 인게임/Erkul 원본 확인 | 구·신 엔티티 중 실제 판매가 확인 후 `ship-market.js` 정리 |
| 배포 Lighthouse/RUM | 배포 환경 접근 | 운영 URL에서 성능·SEO 실측 |
| Search Console·네이버 제출 | 검색 도구 소유자 권한 | sitemap 제출 및 색인 상태 확인 |

## 의도적으로 보류

- Stage B setup 지연: 이벤트 바인딩 순서 회귀 위험이 커서, 실제 성능 계측에서 필요성이 확인될 때만 진행한다.
- CSS 콤마 그룹 중복 100건: 공용 베이스+오버라이드 구조이므로 자동 병합하지 않는다.
