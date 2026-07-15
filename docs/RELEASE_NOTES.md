# VOLT 웹사이트 릴리스 노트

## I-1.3 원래 제품 서체 복원 (2026-07-16)

- 사용자 확인 결과 Orbit 디스플레이 서체가 원하는 인상이 아니어서, 히어로 제목·태그라인을 I-1 이전의
  제품 기본 서체·모노 태그라인으로 되돌렸다. 제목 굵기도 기존 900으로 복원했다.
- 전용 WOFF2/TTF와 프리로드, 서비스워커 프리캐시, 생성기·검증기·전용 테스트를 함께 제거했다.
  이후 배포는 시스템 한글 폴백만 사용한다.

## I-1.2 폰트 전수 정규화 (2026-07-16)

기준 커밋 `12eb5a9` · 폰트 `VOLT Orbit Display v3.001` · 캐시는 이 반영의 배포 커밋 기준으로 갱신

- **정적 SemiBold 일치**: 생성 파일의 OpenType 메타데이터, CSS `@font-face`, 히어로 제목·태그라인의
  굵기를 모두 600으로 통일하고 합성 굵기(`900`)를 제거했다. `font-synthesis: none`으로 브라우저가
  윤곽을 임의로 두껍게 만들지 않는다.
- **정확한 글리프 범위**: 실제 포함된 대문자·숫자·기호만 `unicode-range`에 선언해, 미포함 소문자나
  기호가 Orbit으로 잘못 선택되는 일을 막았다. 영문 히어로 제목·태그라인 외 UI는 제품 기본 서체를 유지한다.
- **재현 가능한 생성·검증**: 구형 Python 생성기를 제거하고 Node 생성기 하나로 통일했다. `font:build`,
  `font:check`와 기본 `check` 게이트가 TTF/WOFF2 헤더, 메타데이터, 라이브 문구 글리프를 검증한다.
- **전 경로 폴백 통일**: 메인·CMS·404의 한글 시스템 서체/모노 폴백을 같은 스택으로 맞춰, 제공되지 않는
  Pretendard 파일에 의존하지 않는다.

배포는 main 브랜치 → Cloudflare Pages 자동 반영이며, 버전 경계는 커밋 단위다.

## I-1 — 브랜드 디자인 리프레시: Orbit v3 + Liquid Glass (2026-07-15)

기준 커밋 `cb26912`(+linux 기준 `7a55955`) · 캐시 `20260715-02` · 게이트: check 0 · Playwright 243/243

- **VOLT Orbit Display v3** — 의존성 없는 Node 생성기(`scripts/font/generate-volt-orbit-v3.mjs`)로
  TTF+WOFF2(3.4KB)를 직접 인코딩. 라운드 캡 스트로크·진원 보울 기반 애플 계열 지오메트리,
  글리프 48종. 적용 범위를 브랜드 표면 전반(h1·nav 로고·태그라인·eyebrow·배지·지표)으로 확대 —
  한글은 시스템 스택 폴백. 이전의 "미완성 폰트 격리" 결정은 v3로 대체(클리핑 우려는
  h1 overflow 스모크 계약으로 흡수).
- **Liquid Glass UI** — 구조 무변경 표면 재해석: 글래스 토큰(`--glass-*`) + 콘센트릭 라운딩
  (14/22/30), 블러는 고정 크롬/오버레이 7종에만, 카드류는 무블러 글래스 톤. 모바일 블러 축소,
  `prefers-reduced-transparency` 솔리드 폴백.
- 부산물: WOFF2 널 변환 인코딩 지식(transformLength는 버전 3에서 기록 금지 — OTS 거부),
  M1/M1.1(VOLT AI 도구 기반 어시스턴트 + 정확성 보수)은 WORK_STATUS 참조.

## v1.0-quality — 품질 기준선 (2026-07-09)

**태그 `v1.0-quality`** · 기준 커밋 `e501866` (E-1 Admin 동기화 상태 패널 포함) · 캐시 `20260709-07`
게이트: `npm run check` 통과 · **Functions 95/95** · **Playwright 213/213** (smoke·a11y·CSP·스크린샷 회귀·모듈 회복탄력성 포함)

이 태그는 "기능 완성 이후 품질·운영성 정비까지 끝난 상태"를 고정하는 기준점이다.
이후 회귀 의심 시 이 태그와 비교한다.

### 기준선에 포함된 마일스톤
| 마일스톤 | 상태 | 핵심 |
|---|---|---|
| ShipDB 2.0 (A-1~A-10) | 완료 | Erkul live 파이프라인·매칭 210척·Safe Apply·KO 번역·런북 |
| Final Sweep | 완료 | a11y allowlist 전량 비움·CSS dead 제거·notices 분리·CSP 문서화 |
| 마일스톤 C (운영 정착) | 완료 | 검색 색인 정합성·schedule 분리·첫 정기 동기화·스크린샷 회귀·heading 래칫 |
| 마일스톤 D (회복탄력성·권한 정합) | 완료 | 모듈 로드 실패 방어·RBAC 정리(1인 운영)·D1 정합 |
| 랜딩 인터랙티브 (D-①~⑧) | 완료 | 스타필드·히어로 모션·리빌 스태거·스포트라이트·패럴랙스·스크롤 진입 등장 |
| E-1 Admin 동기화 상태 | 완료 | syncedAt·anomaly·주기 초과 배지 + preview 판단 배지 (읽기 전용) |

### 기준선 시점의 잔여 항목 (의도적 이관)
- 운영자 1회 작업: 운영 D1 마이그레이션 대장 확인, Admin Erkul preview 실행 확인 — 런북 참조.
- 코드 부채: main.js 잔여 모듈화(임원진/연혁부터), CSS 콤마 그룹 중복 100건(개별 검토 대상, 수치 목표 아님).
- 데이터 대기: 신규 함선 보류 8척(판매처 발생 트리거), Hammerhead anomaly. 상세는 `BACKLOG.md`.

---

## 마일스톤: ShipDB 2.0 + 품질 마감 (2026-07)

기준 회귀망: **Playwright 166 통과 · Functions 80 통과 · `npm run check` 통과** · 캐시 `20260705-10`.

### ShipDB 2.0 (A-1 ~ A-10)
- **Erkul live 데이터 파이프라인**: 필드 추적(`7a35b64`) → 219척 스펙 normalize(`fb2bbbc`) →
  구매처/렌탈 market normalize(`f623e6d`) → VOLT DB 매칭 210척/충돌 0(`4967fb9`) →
  런타임 데이터 레이어 `data/ship-live-stats.js`·`ship-market.js` 생성(`2a15d38`).
- **함선 모달 Live 표시**(`8f35ac3`): 요약(크기/승무원/화물/HP/속도/최저가) + 인게임 구매처/렌탈 + 접힘 상세 스펙.
  이 과정에서 `.modal-card` max-height/내부 스크롤 결함 수정.
- **Erkul sync workflow**: Admin 읽기 전용 preview(`fc7d6e0`) + previewHash 검증 로컬 Safe Apply(`da58a03`).
  apply는 재매칭 없이 기존 210 key만 갱신. 운영 절차는 `OPERATIONS_RUNBOOK.md` 7-1절, 리허설 검증 완료(`eee6fef`).
- **Korean translated descriptions**(`41063c9`): KO 모드 함선 설명을 Erkul EN의 한국어 번역본(210척)으로 교체.
  기존 VOLT 설명은 legacy fallback, `sourceEnHash`로 stale 감지. 자동 번역기 미사용.
- **lazy-loaded ship live data**(`fb330fe`): 레이어 2종(~500KB)을 함선DB 첫 진입 시 지연 로드(ship-en 패턴).
- **신규 함선 분류/수동매핑**(`e156c5d`, `18311ec`): Erkul-only 9척 보류·모듈 1건 제외,
  구형 Aurora 5종+Hammerhead는 근거 기록 후 `marketOnlyMappings` 승격(market만 보강, stats 불변).

### 품질 마감 (Final Sweep)
- **a11y allowlist cleared**(`ebdf271`): critical/serious 부채 전량 상환 — 소형 텍스트 대비(오렌지→다크 오렌지 5.39:1),
  함선 카드 nested-interactive 구조 개선(함선명이 실제 버튼). 래칫 allowlist 전부 빈 배열.
- **CSS cascade 정리**(`4290c7e`): 완전 피복(dead) 블록 38건 제거, 중복 selector 155→129.
  computed style 전량 비교(58키 동일)로 검증 + 회귀 가드 2종 추가.
- **notices 모듈 분리**(`8af04fb`): 공지 필터/카드/모달/링크복사를 `js/notices.js`(`VOLT_NOTICES`)로 분리,
  main.js 2192→2054줄.
- **CSP 최종 문서화**(`bfe2a4d`): 실행형 인라인 패턴 전수 검색 0건, `docs/SECURITY_CSP.md` 신설.

### known remaining issues
- 신규 함선 보류 8척(Tiburon/Tyilui/Starlite + 에디션류) — 인게임 판매 시작 시 재검토.
- Hammerhead 구/신 엔티티 가격 모순은 anomaly로 기록(현 선체 값 우선).
- 상세 잔여 부채는 `BACKLOG.md` 참조.

---

아래는 **다국어(EN)·안정화·모듈화·성능·보안·운영** 마일스톤의 요약이다.

## 마일스톤: EN 완성도 + 운영 안정화 (P1 ~ P3)

기준 회귀망: **Playwright 143 통과 · Functions 62 통과 · `npm run check` 통과**.

### i18n / 다국어
- **마이페이지 i18n + 모듈 분리**(`js/mypage.js`): 렌더 책임을 `main.js`에서 분리, KO/EN 처리. (`e429163`)
- **공지 CMS 영어화**: `title_en/content_en/tag_en` 컬럼·API·관리자 입력·프론트 표시(EN 없으면 KO fallback). (`ccef4f7`)
- **Auth UI i18n + 모듈 분리**(`js/auth-ui.js`): 로그인/로그아웃/에러 헤더 렌더 분리 + `auth.*` 키. (`5c9c4a9`)
- **최종 EN 혼합언어 스윕**: 토스트·aria·빈상태·검색 카테고리·PWA·테마 등 동적 문구 전수 i18n. (`23d43e6`)

### 무역플래너 / 안정성
- **UEX·수익표 안정화**: fetch 타임아웃(10s), 실패(timeout/network/invalid) 상태 분리, stale 표시,
  수익표 저장 스키마 버전화·마이그레이션·입력 방어. (`55da2fe`)

### 관리자 CMS
- **공지 폼 UX 개선**: KO/EN 그룹 분리, EN 선택 입력 안내, 라이브 KO/EN 미리보기(+fallback 배지),
  저장 전 validation·미저장 이탈 경고. (`44228de`)

### 보안 (CSP)
- **script-src `unsafe-inline` 제거 검증/고정**: 인라인 스크립트/핸들러 0건 확인, `_headers` 직접 검증 테스트,
  강화 CSP 인터랙션 스모크. style-src도 이미 `'self'`로 인라인 의존 없음. (`3c537aa`, 이후 `96b0879`에서 재확인)

### 성능
- **무거운 섹션 lazy init**: 함선DB(247카드)·갤러리를 첫 진입 시 렌더로 지연. (`aefb61f`)
- **개선폭 계측**: 초기 홈 DOM 노드 **6,642 → 1,526 (약 77% 절감)**, 함선 그리드(~5,113노드)를 초기 임계경로에서 제거. (`ffd3be6`)

### CSS / 유지보수
- **중복 CSS 1차 정리**: 흩어진 `.gallery-empty` 3정의를 계산값 보존해 1개로 통합, 중복 진단 도구 추가. (`96b0879`)

### 접근성 / 모바일
- **모달·모바일 polish**: 전역 모달 접근가능 이름(aria-labelledby) 부여로 `aria-dialog-name` 부채 해소,
  터치 타깃 ≥36px 보정, EN 다중 폭(390/430/768) overflow 가드. (`91d0aae`)

### 운영
- **운영 런북**(`docs/OPERATIONS_RUNBOOK.md`): 배포 파이프라인, D1 마이그레이션 대장(멱등성), 백업/롤백, 운영 체크리스트. (`014d92f`)
- **마이그레이션 추적 테이블**(`0009_schema_migrations`): 적용 상태 D1 기록 + 자기등록 규약을 `npm run check`가 강제. (`70ee012`)

## 운영 반영 시 주의
- 새 마이그레이션(`0008_notice_i18n`, `0009_schema_migrations`)은 운영 D1에 적용해야 활성화된다.
  절차·롤백은 [`OPERATIONS_RUNBOOK.md`](./OPERATIONS_RUNBOOK.md) 참조. `ALTER ADD COLUMN`(0007·0008)은 재실행 금지.

## 잔여 부채
마감 후 백로그로 이관한 항목은 [`BACKLOG.md`](./BACKLOG.md) 참조.
