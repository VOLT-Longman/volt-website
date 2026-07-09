# 마일스톤 D — 회복탄력성 & 권한 정합 (계획)

기준 커밋: **`5e8dc58`** (2026-07-08, 캐시 `20260708-06`). 현재 게이트: `npm run check` ✅ · Functions **85/85** · Playwright **187/195**(8건은 마일스톤 C 시각회귀 baseline 이슈, 별도 트랙).

## 배경

`landing.js` 로드 실패가 전체 사이트를 백지로 만든 사고(`67a3858`/`9f591e2`)를 계기로, 같은 실패 클래스와 인접 영역(백엔드 권한·데이터 정합·테스트 커버리지)을 코드 전수 검사(2026-07-09, 병렬 3트랙: 프런트/백엔드/데이터)했다. **결론: 같은 백지화 버그가 구조적으로 10개 이상 모듈에 반복 존재.** 이것이 D-1로 최우선.

원칙(마일스톤 C와 동일): 대규모 리팩터 지양, 독립 커밋 단위, 게이트 통과 후 반영.

---

## D-1. 전역 모듈 미로드 방어 — 전체 사이트 백지화 재발 방지 (P0, 최우선)

**문제**: `js/main.js`의 `init()`이 `VOLT_LANDING`에만 옵셔널 체이닝(`?.`)을 적용했고, 나머지는 전부 무방비 호출이다.
아래 스크립트 중 **하나라도** 네트워크/캐시 skew/보안 규칙으로 로드 실패하면 `init()`이 그 지점에서 throw →
`setupSplash()`(스플래시 제거)가 호출 전이라 화면이 백지로 남는다. `landing.js` 사고와 동일한 증상이 10곳에서 재발 가능:

`navigation.js` · `uex.js` · `uex-panel.js` · `trade-planner.js` · `notices.js` · `schedule.js` · `ships.js` · `search-modal.js` · `auth-ui.js` · `mypage.js`

가장 취약한 지점은 `js/main.js:121` — `const { showSection, ... } = nav;`가 **모듈 로드 시점**(함수 밖)에서
`window.VOLT_NAV`를 구조분해하므로, `navigation.js`가 실패하면 `init()` 호출부에 가드를 걸어도 이 한 줄에서
먼저 죽는다.

**작업**:
1. `js/main.js` 상단 모듈 참조부(구조분해 포함)를 `VOLT_LANDING` 폴백과 동일 패턴으로 방어.
2. 모든 `VOLT_X.init(...)`/`.render()`/`.setup()` 호출부를 `window.VOLT_X?.method?.()`로 전환(약 15개 호출부, `renderNoticeFilters`/`renderAnnouncements`/`renderSchedule`/`renderShips`/`setupSearch`/`setupAuthStatus` 등 상시 호출 shim 포함).
3. **`setupSplash()`를 모듈 초기화 블록보다 먼저 실행**(또는 초기화 블록 전체를 try/catch로 감싸) — 어떤 모듈이 실패해도 스플래시 제거는 항상 보장.
4. 회귀 가드: 기존 `landing-resilience.spec.js` 패턴을 각 모듈에 대해 반복(최소 3~4개 대표 모듈: `navigation.js`, `ships.js`, `auth-ui.js` 차단 시 백지 없음 확인).

**완료 기준**: 위 10개 스크립트 중 임의 1개를 차단해도 스플래시 제거 + 홈 콘텐츠 렌더 + 콘솔 치명 에러 0. 전량 스모크 통과.
권장 커밋명: `fix: guard all optional module calls against script-load failure`

---

## D-2. 관리자 권한 모델 정합 (P1)

**문제**: `functions/_shared/rbac.js`에 컬렉션별 Discord 역할 제한(`requireAdminCollectionAccess`, 공지/갤러리→홍보부,
일정→HR전략실 등)이 구현돼 있으나, **실제 admin CRUD 라우트(공지·일정·갤러리·협력함대·임원진·연혁·함선DB) 전부가
평범한 `requireAdmin`만 쓴다** — rbac.js의 세분화 로직은 어디서도 호출되지 않는 dead code. 현재는 공유 관리자
비밀번호 하나만 있으면 모든 컬렉션에 쓰기 가능 — 의도된 최소권한 모델이 실질적으로 미적용.

**작업**: 둘 중 하나를 결정해 진행.
- **A**: 각 admin 라우트에서 `requireAdmin` → `requireAdminCollectionAccess(request, env, '<collection>')`로 교체(약 14개 파일, 기계적 치환).
- **B**: 1인 운영 체제에서 컬렉션별 역할 분리가 불필요하다면 `rbac.js`의 미사용 함수(`requireAdminCollectionAccess`, `requireAdminOrRole`, `requireRole`) 제거.

**완료 기준**: A라면 컬렉션별 권한 스모크/함수 테스트 추가. B라면 미사용 코드 삭제 + 게이트 통과.
권장 커밋명: `security: enforce per-collection admin RBAC` (A) / `chore: remove unused RBAC scaffolding` (B)

## D-3. notices 테이블 런타임 DDL 비대칭 (P1)

**문제**: `ship_overrides`(0010)·`leadership_members`/`partner_fleets`(0007)는 마이그레이션 미적용 D1에서도
`tableHasColumn`/ALTER 보강으로 우아하게 폴백하지만, **`notices`(0008의 `title_en/content_en/tag_en`)는
아무 방어 없이 무조건 해당 컬럼을 INSERT/UPDATE**한다(`functions/api/admin/notices/index.js:21`,
`[id].js:21`). 0008 미적용 D1에서 공지 작성/수정 시 `no such column` 500 에러 발생 — BACKLOG의 "D1 마이그레이션
정합 확인"이 아직 운영자 미확인 상태라 실제 위험.

**작업**: leadership/partner-fleets와 동일하게 `tableHasColumn(db, 'notices', 'title_en')` 가드 후 컬럼 유무에 따라
INSERT/UPDATE 분기, 또는 `ships.js`의 ALTER-and-ignore-duplicate 패턴을 notices에도 적용.

**완료 기준**: 0008 미적용을 모의한 함수 테스트(컬럼 없는 mock DB)에서 notices 작성이 500 대신 정상/명확한 폴백.
권장 커밋명: `fix: add runtime DDL resilience for notices EN columns`

## D-4. 로그인 락아웃 경합 + 코드 중복 정리 (P2)

**문제**: `functions/api/admin/login.js`가 `RATE_LIMIT_KV`를 직접 다루는 인라인 read-then-write 카운터를 쓰는데,
KV는 최종 일관성이라 병렬 로그인 시도가 잠금 임계값(5회)을 우회할 수 있다. 이미 있는 공용 `_shared/rate-limit.js`도
동일한 read-then-write 구조라 완전한 원자성은 KV로는 근본 해결이 안 됨(Durable Objects급 자원 필요) — **의견**:
관리자 비밀번호는 보조 인증 계층이라 지금 수준에서 실무적 리스크는 낮음. 다만 로직 중복은 정리 가치 있음.

**작업**: `login.js`의 인라인 카운터를 공용 `enforceRateLimit`/`checkRateLimit`으로 교체(중복 제거, 동작 동일).
완전 원자적 락아웃이 필요하면 별도 결정 사항으로 분리(Durable Object 도입은 대규모 변경).

**완료 기준**: login.js가 `_shared/rate-limit.js`를 재사용, 기존 로그인/락아웃 테스트 전부 통과.
권장 커밋명: `refactor: consolidate login lockout onto shared rate-limit module`

## D-5. 테스트 커버리지 공백 메우기 (P2)

함수 레벨(`tests/functions/*.test.mjs`) 테스트가 없는 항목 — 스모크(Playwright)만으로 커버되거나 완전 무커버:

- `admin/events`, `admin/gallery` index+[id] — CRUD 전체 무커버
- `admin/ships/index.js`(목록/생성) — `[id].js` PUT만 테스트됨
- `admin/timeline/[id].js`, `admin/logout.js`, `admin/session.js`
- 공개 GET: `events.js`, `gallery.js`, `partner-fleets.js`, **`ship-overrides.js`**(leadership/timeline과 동일한
  try/catch 폴백 패턴이 있는데 유일하게 무테스트 — 우선순위 최고), `me/rsvps.js`, `uex/commodities*`

**완료 기준**: 위 중 최소 `ship-overrides.js`(공개 GET, DB 실패 폴백 경로 포함) + `admin/ships/index.js` 우선 추가.
권장 커밋명: `test: cover ship-overrides public GET + admin ships list`

## D-6. 부수 발견 (묶어서 처리 권장, P2)

- `js/main.js:1129,1131` — `useShipInPlanner()` 토스트 2건이 `i18nT` 미사용 하드코딩 한국어(EN 모드 미번역).
- `js/main.js:121` 구조분해 외에도, `js/ships.js` `handleHangarToggle`의 토글 후 라벨 재적용이 `i18nT` 미사용.
- `js/schedule.js:51` — 언어 토글마다 모든 이벤트 카드 RSVP를 재조회(불필요한 네트워크, 오류는 아님).
- `js/main.js:1185` `getCommodityDescription()` 죽은 코드(미사용) — 삭제 또는 연결.
- `functions/_shared/cms.js` `sort_order`가 `nullableNumber()`(finite 체크) 대신 무검증 `Number()` — `NaN` 바인딩 가능.
- `functions/api/me/rsvps.js` — `event_rsvps.user_sub` 단독 조회에 쓸 인덱스 없음(현재는 `UNIQUE(event_id,user_sub)` 뿐). `CREATE INDEX idx_rsvp_user ON event_rsvps (user_sub)` 추가.
- `scripts/check-migrations.mjs`가 마이그레이션 vs 런타임 ensure-table DDL 정합은 검사하지 않음(D-3류 버그를 CI가 못 잡는 이유) — 향후 체크 항목 후보로 기록.

**완료 기준**: 항목별 최소 스모크/함수 테스트 1개, 게이트 통과. 한 커밋으로 묶어도 무방(각 변경 독립적·저위험).

---

## 이번 감사에서 "문제 아님"으로 확인된 것 (참고, 재검토 불필요)

- XSS: 전체 `innerHTML` 사용처 escapeHtml 적용 확인, CMS/Discord 제어 문자열 포함 전부 이스케이프됨.
- localStorage/JSON.parse 전 지점 try/catch + 정리 로직 있음.
- 레이스컨디션(라이브 함선 레이어 지연 로드, 모달 재렌더) 상태머신으로 안전 처리됨.
- 메모리 누수 없음(리스너는 초기화 1회 바인딩 또는 위임 패턴).
- SQL 인젝션 없음(전부 parameterized bind). 낙관적 잠금(`expectedUpdatedAt`/409)은 공지·일정·갤러리·임원진·협력함대·연혁·함선 전부 일관 적용.
- 업로드 엔드포인트: 매직바이트 검증·크기 제한·경로 순회 불가·충돌 안전 키.
- Erkul sync: read-only, 타임아웃·응답 검증·cap 있음. 동기화 주기(격주 수동)는 런북에 문서화, 현재 최신(1일 이내).
- 데이터 필드명(camelCase↔snake_case) 매핑: ship_overrides 전 구간(API↔DB↔프런트) 정합 확인, 드롭되는 필드 없음.
- npm 런타임 의존성 0개, `npm audit` 0 vulnerabilities.
- CSP: Stage A-3(script-src unsafe-inline 제거)·Stage B(style-src 'self') **이미 완료 상태** — `CLAUDE.md`의 "진행 중" 표기가 stale(별도로 갱신 권장, D 범위 밖).

## 우선순위 제안

1. **D-1** (P0) — 사고 재발 방지, 즉시.
2. **D-3** (P1) — notices는 이미 프로덕션에서 매일 쓰는 기능이라 D1 정합 미확인 상태면 지금도 잠재 위험.
3. **D-2** (P1) — 권한 모델 결정(A/B) 필요, 코드 자체는 작음.
4. D-4, D-5, D-6 (P2) — 여유 있을 때 묶어서.
