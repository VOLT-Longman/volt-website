# 마일스톤 D — 회복탄력성 & 권한 정합 (완료)

> **2026-07-09 마감.** D-1 `ddb4154` · D-2 `0d4a711`(1인 운영 확인, B안: 미사용 RBAC 코드 삭제) ·
> D-3 `5ea36c0` · D-4 `4242d5f` · D-5 `2d5c574` · D-6 `c4502b4`.

기준 커밋: **`0d4a711`** (2026-07-09, 캐시 `20260709-02`). 게이트: `npm run check` ✅ · Functions **95/95** · Playwright **197/205**(8건은 마일스톤 C 시각회귀 baseline 이슈, 별도 트랙).

## 배경

`landing.js` 로드 실패가 전체 사이트를 백지로 만든 사고(`67a3858`/`9f591e2`)를 계기로, 같은 실패 클래스와 인접 영역(백엔드 권한·데이터 정합·테스트 커버리지)을 코드 전수 검사(2026-07-09, 병렬 3트랙: 프런트/백엔드/데이터)했다. **결론: 같은 백지화 버그가 구조적으로 10개 이상 모듈에 반복 존재.** 이것이 D-1로 최우선.

원칙(마일스톤 C와 동일): 대규모 리팩터 지양, 독립 커밋 단위, 게이트 통과 후 반영.

---

## D-1. 전역 모듈 미로드 방어 — 전체 사이트 백지화 재발 방지 (P0, 완료 `ddb4154`)

**문제**: `js/main.js`의 `init()`이 `VOLT_LANDING`에만 옵셔널 체이닝(`?.`)을 적용했고, 나머지는 전부 무방비 호출이었다.
`navigation.js` · `uex.js` · `uex-panel.js` · `trade-planner.js` · `notices.js` · `schedule.js` · `ships.js` ·
`search-modal.js` · `auth-ui.js` · `mypage.js` 중 하나라도 로드 실패하면 `init()`이 그 지점에서 throw →
스플래시가 화면을 덮어 백지로 남았다.

**반영 내용**:
1. `nav`/`uex` 모듈 참조부(구조분해 포함, 가장 취약한 단일 실패점이었던 `js/main.js:120`)를 no-op 폴백 stub으로 방어.
2. 모든 `VOLT_X.init(...)`/`.render()`/`.setup()` 호출부(shim 함수 13개 + 산재 호출 20여 곳)를 `window.VOLT_X?.method?.()`로 전환.
3. **추가 발견**: `js/uex-panel.js`도 자체적으로 `const uex = window.VOLT_UEX;` 하드 의존이 있어 동일 버그(빈 객체 폴백으로 수정, 기존 try/catch·null-모델 가드가 흡수).
4. `js/main.js` `VOLT_DATA` 자체 미로드 시에도 스플래시 강제 제거.
5. `init()` 전체를 try/catch로 감싼 2차 방어선(`initInner`/`init` 분리) — 예상 밖 예외 대비.

**검증**: 10개 스크립트 각각 개별 차단한 실제 브라우저 테스트 전부 splash=none·home/nav 렌더·콘솔 에러 0 확인.
회귀 스모크 `tests/smoke/module-load-resilience.spec.js`(10케이스) + 기존 `landing-resilience.spec.js` 전부 통과.

---

## D-2. 관리자 권한 모델 정합 (P1, 완료 `0d4a711` — B안)

**문제**: `functions/_shared/rbac.js`에 컬렉션별 Discord 역할 제한(`requireAdminCollectionAccess`, 공지/갤러리→홍보부,
일정→HR전략실 등)이 구현돼 있으나, **실제 admin CRUD 라우트 전부가 평범한 `requireAdmin`만 쓴다** — rbac.js의
세분화 로직은 어디서도 호출되지 않는 dead code. 현재는 공유 관리자 비밀번호 하나만 있으면 모든 컬렉션에 쓰기 가능.

**경과**: 이 세션에서 B안으로 진행하려 했으나 자동 실행 안전장치가 "보안 관련 A/B 결정을 에이전트가 단독으로
내렸다"는 이유로 1차 차단 — 되돌리고 사용자 결정으로 남김. **1인 운영 확인**(사용자, 2026-07-09) 후 B안으로 재진행·반영.

**반영 내용**: `rbac.js`에서 미사용 함수(`requireAdminCollectionAccess`, `requireAdminOrRole`, `requireRole`,
`getAdminRoles`, `isAdminRole`, `hasAnyRole`) 및 관련 상수(`DEFAULT_ADMIN_ROLES`, `COLLECTION_ROLE_RULES`) 삭제.
실사용 중인 `requireUser`/`isMember`/`requireMember`(me/preferences.js, me/rsvps.js, briefing/share.js,
events/[id]/rsvp.js)는 유지. 동작 변화 없음(admin 라우트는 원래도 `requireAdmin`만 사용).

## D-3. notices 테이블 런타임 DDL 비대칭 (P1, 완료 `5ea36c0`)

**문제**: `ship_overrides`(0010)·`leadership_members`/`partner_fleets`(0007)는 마이그레이션 미적용 D1에서도
런타임 방어로 폴백하지만, **`notices`(0008의 `title_en/content_en/tag_en`)는 무조건 해당 컬럼을 INSERT/UPDATE**해
0008 미적용 D1에서 공지 작성/수정이 500으로 실패할 위험이 있었다.

**반영 내용**: `functions/_shared/notices.js`에 `ensureNoticesEnColumns` 추가 — `ships.js`의
ALTER-and-ignore-duplicate 패턴 재사용(isolate당 1회). admin notices POST/PUT에서 INSERT/UPDATE 전에 호출.
함수 테스트 3건(ALTER 시도+중복 무시, 0008 미적용 시 201, isolate 재사용 시 재시도 없이 200).

## D-4. 로그인 락아웃 경합 + 코드 중복 정리 (P2, 완료 `4242d5f`)

**반영 내용**: `login.js`의 인라인 read-then-write 카운터를 공유 `_shared/rate-limit.js`의 `checkRateLimit`
(검사 후 성공 시에만 소비 패턴)으로 교체. 외부 동작(5회 시도 후 429, 15분 잠금, IP별 분리, 성공 시 초기화) 불변 —
기존 함수 테스트 6개 전부 통과(내부 KV 저장 형태만 갱신). 완전한 원자적 잠금은 KV 구조상 근본 해결 안 됨을
코드 주석으로 기록(Durable Objects급 필요, 관리자 비밀번호는 보조 인증 계층이라 현재는 낮은 우선순위로 판단).

## D-5. 테스트 커버리지 공백 메우기 (P2, 완료 `2d5c574`)

**반영 내용**: 우선순위 최고였던 공개 `/api/ship-overrides` GET(leadership/timeline과 동일한 try/catch
DB-실패 폴백 패턴이 있는데 유일하게 무테스트)과 `admin/ships` 목록(GET, `[id].js` PUT만 테스트됨)에 함수 테스트
6건 추가(정상 매핑·DB 예외 폴백·hidden 노출·401·정렬·405).

**남은 공백**(우선순위 낮음, 향후 후보): `admin/events`·`admin/gallery` CRUD, `admin/timeline/[id].js`,
`admin/logout.js`·`admin/session.js`, 공개 `events.js`·`gallery.js`·`partner-fleets.js`, `me/rsvps.js`,
`uex/commodities*`.

## D-6. 부수 발견 묶음 (P2, 완료 `c4502b4`)

- `useShipInPlanner()` 토스트 2건 + `handleHangarToggle()` 라벨 재적용의 `i18nT` 미사용 하드코딩 한국어 → 수정(EN 모드 번역 정상화).
- `getCommodityDescription()` 죽은 코드 삭제.
- `sort_order`가 bare `Number()`라 비수치 입력이 NaN으로 조용히 D1에 바인딩될 수 있던 문제 → `finiteNumberOr` 헬퍼로 통일(gallery/partner-fleets/leadership/timeline 4곳), 비수치 입력 시 명확히 422.
- `migrations/0011`: `event_rsvps.user_sub` 단독 조회용 인덱스 추가(기존 `idx_rsvp_event`는 event_id가 선두라 미적용).

**보류**(낮은 가치 대비 회귀 위험, 손대지 않음): `js/schedule.js`의 언어 토글마다 RSVP 재조회(버그 아님, 낭비性 최적화).
**기록만**(문서화, 구현 안 함): `scripts/check-migrations.mjs`가 마이그레이션 vs 런타임 ensure-table DDL 정합은 검사하지 않음(D-3류 버그를 CI가 못 잡는 근본 이유) — 향후 체크 항목 후보.

---

## 이번 감사에서 "문제 아님"으로 확인된 것 (참고, 재검토 불필요)

- XSS: 전체 `innerHTML` 사용처 escapeHtml 적용 확인, CMS/Discord 제어 문자열 포함 전부 이스케이프됨.
- localStorage/JSON.parse 전 지점 try/catch + 정리 로직 있음.
- 레이스컨디션(라이브 함선 레이어 지연 로드, 모달 재렌더) 상태머신으로 안전 처리됨.
- 메모리 누수 없음(리스너는 초기화 1회 바인딩 또는 위임 패턴).
- SQL 인젝션 없음(전부 parameterized bind). 낙관적 잠금(`expectedUpdatedAt`/409)은 공지·일정·갤러리·임원진·협력함대·연혁·함선 전부 일관 적용.
- 업로드 엔드포인트: 매직바이트 검증·크기 제한·경로 순회 불가·충돌 안전 키.
- Erkul sync: read-only, 타임아웃·응답 검증·cap 있음. 동기화 주기(격주 수동)는 런북에 문서화, 현재 최신.
- 데이터 필드명(camelCase↔snake_case) 매핑: ship_overrides 전 구간(API↔DB↔프런트) 정합 확인, 드롭되는 필드 없음.
- npm 런타임 의존성 0개, `npm audit` 0 vulnerabilities.
- CSP: Stage A-3(script-src unsafe-inline 제거)·Stage B(style-src 'self') 이미 완료 상태(CLAUDE.md 표기 정정 완료).

## 남은 일

D-1~D-6 전부 반영 완료. 잔여 항목은 `docs/BACKLOG.md`로 이관.
