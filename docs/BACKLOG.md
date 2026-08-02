# VOLT 유지보수 백로그 (마일스톤 마감 후 이관)

핵심 기능/i18n/성능/보안/운영 + ShipDB 2.0은 마감됐다. 아래는 **의도적으로 후속으로 넘긴** 품질 부채다.
각 항목은 회귀 위험 대비 가치와 착수 조건을 함께 적었다. 근거 스모크는 이미 회귀망에 존재한다.

## 접근성 부채 — 전량 상환 완료

- critical/serious allowlist 전부 비움 (2026-07-06, `ebdf271`). 새 위반은 즉시 테스트 실패.
- **heading-order/page-has-heading-one(moderate)도 상환 완료** (C-5): sr-only 사이트 h1 상시화,
  푸터 그룹 h4→h2, 가입 단계 렌더러 h4→h3. a11y.spec.js에 문서 구조 래칫 5화면 추가로 고정.

## CSS 구조 부채

- **cascade 중복 selector**: 155→129(`4290c7e`, 완전 피복 dead 블록 38건 제거)→**100**(2026-07-09,
  진화형 재정의 레이어 29건 속성 단위 병합). 진단: `node scripts/check-css-duplicates.mjs`.
  - **29건 병합 완료**: 같은 selector가 다른 selector와 본문을 공유하지 않는 "solo rule" 중복만
    자동 병합 대상으로 삼았다(콤마 그룹에 걸친 것은 제외 — 아래 참고). 병합은 전 발생 선언을
    파일 순서 그대로 한 블록에 합쳐(cascade의 "동일 속성은 나중 선언이 이김" 규칙을 그대로 보존)
    검증했다: 렌더된 실제 요소의 **computed style 전 속성 비교(29개 selector 그룹, hover 포함)
    0건 불일치**. 병합 위치(마지막 vs 첫 발생)에 따라 다른 selector(`.reveal` 등)와의 상대 순서가
    바뀌어 cascade 결과가 달라지는 사례를 실측으로 2건(`.leader-card`, `.gallery-item`) 발견해
    첫 발생 위치로 조정 — **기계적 "마지막 위치로 병합"은 안전하지 않을 수 있음**을 확인. 부수 발견이던
    `.notice-card-pinned`·`.planner-field-hint` 죽은 selector는 G0(2026-07-10)에서 제거 완료
    (`.notice-card:not(.notice-card-pinned)` 그룹은 살아있는 규칙이라 유지 — 특이성 변화 방지).
  - **남은 100건은 성격이 다르다**: 대부분 콤마로 여러 selector가 본문을 공유하는 패턴
    (`.about-intro, .culture-section, .about-info, .join-cta, .hub-content { 공통 스타일 }` 후
    `.culture-section, .about-info { 추가 스타일 }` 식). 이건 정상적인 CSS 공용 베이스+오버라이드
    관행에 가까워 억지로 분리 병합하면 오히려 가독성이 떨어질 수 있다. **자동 병합 대상 아님** —
    개별 검토가 필요하면 케이스별로 판단.
  - 파일 분리(`css/sections/*`)는 원한다면 다음 단계.
  - **146건 분류 (M0, 2026-07-14)** — 랜딩 재설계·폰트·admin 작업으로 100→146 재상승분 포함 전수 재분류.
    자동 일괄 병합 금지 원칙 유지, 성격별 판정:
    - **반응형 오버라이드(유지)** — base+`@media` 동일 selector 재정의. 다수(발생 단위 188). 정상 관행.
    - **콤마 그룹 공유(의도적, 유지)** — 공용 베이스+오버라이드 패턴(발생 단위 77). 기존 판정 유지.
    - **동일 컨텍스트 solo 중복(안전 병합 후보) 15건** — 전부 랜딩 재설계가 남긴 landing 계열 이중 정의:
      `.hero::before/::after`, `.hero-layout::before`, `.landing-header h2/p`, `.landing-card:hover`,
      `.landing-card-eyebrow/h3/p`, `.landing-card-metric(+strong)`, `.landing-notices-head h2`,
      `.landing-notice-row:hover`, `.landing-cta h2/p`. 병합 시 G0 규약(전 선언 파일 순서 보존 +
      computed style 전 속성 비교) 필수 — 랜딩 소유 세션이 처리 권장(WORK_STATUS 소유 기준 참조).
  - **결말 (P2, 2026-07-28, `210ddb5`)** — 위 "15건"은 랜딩 재설계 이전 기준이라 재측정했다.
    실제 hero/landing 계열 solo 중복은 **28건**이었고, 대상 선정을 이름이 아니라 **속성 충돌 기준**으로
    다시 했다: 두 발생 사이에 "같은 클래스를 매치하면서 같은 속성을 선언하는" 규칙이 0개인 것만 병합.
    → **7건 병합**(`.hero-layout::before`, `.landing-header h2`, `.landing-card-eyebrow`,
    `.landing-card-metric`, `.landing-notices-head`, `.landing-notice-row`, `.landing-cta h2`).
    중복 **140 → 133**, top-level 규칙 1095 → 1088, 선언 총수 5018 불변.
    검증: computed style 전 속성 **0건 불일치**(51,084속성 / 118요소 / 6상태) + CI linux 시각 회귀 변화 0.
    측정 시 애니메이션을 결정론적으로 고정(유한=finish·무한=currentTime 0)하고 좌표를 문서 기준으로
    정규화해야 한다 — 안 그러면 트랜지션 진행 중 값과 hover 자동 스크롤이 허위 차이를 만든다.
  - **잔여 21건은 중단** — `.hero` 계열이 대부분이고 두 발생 사이에 속성 충돌 규칙이 있어
    병합 위치에 따라 cascade 승자가 바뀐다. 실제 버그·기능 개발 필요가 생길 때만 재개한다.

## 데이터 레벨 i18n — 완료 확인 (2026-07-13)

- **함선 속성 값 EN화**: (2026-07-25 갱신) `data/ship-en.js`와 `mergeShipEn()`은 삭제됐다. EN/KO 표시는
  canonical(EN 사실값)·presentation(영문 표시명)·localization(KO 설명·역할)이 직접 제공하므로 `_en` 주입 자체가
  불필요해졌다. cargo는 언어 비의존적인 `SCU` 값이다.
- **공지 RSVP status**: API 계약값(참가/대기/불참)은 유지하되, `schedule.js`·`mypage.js`가 i18n 키로 표시한다.
  원천 스키마를 영어로 바꾸는 것은 호환성 이득이 없어 작업 대상으로 남기지 않는다.

## 날짜 계약 — 일정 `event_date` (잠재 개선, 2026-08-03)

공지·갤러리는 정리 완료(`b7507ab`·`80e0ba3`·`762fe73`). 일정만 같은 유형이 남아 있다.

- **현재**: `event_date`는 관리자 UI의 `<input type="date">`에서만 오고 시드에 날짜 리터럴이 없어
  **혼재 이력이 없다**(실측 확인). `api/events.js`는 `ORDER BY NULLIF(event_date,'') DESC`로 문자열 정렬한다.
- **위험**: 지금은 활성 결함이 아니다. 다만 어떤 경로로든 점 표기(`2026.05.15`)가 한 건이라도 들어오면
  공지에서 겪은 것과 같은 정렬 역전이 재발한다(`'.'(0x2E) > '-'(0x2D)`).
- **착수 조건**: 일정 관련 기능을 손댈 때 함께 처리한다. 단독으로 할 만큼 급하지 않다.
- **권장 규칙(공지에서 확립)**: 정렬용 날짜는 `YYYY-MM-DD` 고정 / 화면용 자유 문구는 `dateLabel`로 분리 /
  날짜로 해석 안 되는 값은 변형하지 않고 보존 / 저장·API 정렬·프런트 정렬이 같은 계약을 쓴다.
  구현 참고: `functions/_shared/cms.js`의 `blankAsUnset`·`normalizeNoticeDate`,
  계약 `tests/functions/notice-date-format.test.mjs`.

## 성능 (Stage B — 보류)

- **모듈 `setup()` 지연** — UEX/무역플래너/함선 컨트롤/검색의 이벤트 바인딩까지 섹션 진입 시로 지연.
  이벤트 바인딩 순서를 건드려 **회귀 위험이 커서 보류**. Stage A(함선DB/갤러리 렌더 지연 + live 레이어 lazy-load)로
  최대 비용은 이미 처리됨.

## ShipDB 2.0 후속

- **신규 함선 후보 분류 완료** — Command Module 1건은 비함선으로 제외했고, Aurora/Hammerhead 6건은
  `marketOnlyMappings`에 승격됐다. (2026-07-25 갱신) 과거 "미출시 VOLT 전용 30척 폴백"은 없어졌다 —
  레거시 배열 삭제 후 Erkul에 없는 함선은 **RSI 공식 카탈로그 30척**으로만 제공하며, RSI가 주지 않는
  게임플레이 값은 추정하지 않는다. 새 Erkul preview에 미분류 항목이 나올 때만
  `docs/shipdb-new-ship-candidates.md` 기준으로 재분류한다.
- **Hammerhead 가격 모순 anomaly** — Erkul shop이 구(45.56M)/신(34.47M) 엔티티를 이중 등재.
  현 선체 값 우선 표시 중(`ship-market.js`의 hammerhead anomalies 참조). 인게임 실가격 확인 후 정리.
- **A-6 스모크 Asgard 대표값** — HP·최저가 exact assertion은 의도된 회귀 기준. 동기화로 값이 바뀌면
  기대값도 함께 갱신한다(런북 7-1절 체크리스트).

## main.js 잔여 모듈화 — 완료 (2026-07-13)

임원진은 `js/leadership.js`, 연혁·FAQ·정책·무역가이드·가입 단계·무역허브 피처는
`js/site-content.js`로 분리했다. main.js는 호출부 호환 shim과 앱 상태 조립만 담당한다.
(2026-07-25 실측: ShipDB 재작성으로 canonical 로딩·필터·override 병합이 들어와 **1,930줄**로 재상승 —
추가 분리는 위생 패치 P3 대상.)
innerHTML 래칫은 이동한 6개 렌더 지점만 `site-content.js` 베이스라인으로 기록해 총량을 유지한다.

## 운영 후속

- **운영 D1에 0008~0011 적용 확인** — 코드/문서는 반영됐으나 실제 D1 적용은 운영자 1회 작업.
  `SELECT id, applied_at FROM schema_migrations ORDER BY id;`로 확인(런북 4절). (0010 함선 hidden·0011 RSVP 인덱스 포함)
- **배포 후 실측** — Lighthouse/RUM로 lazy init 개선폭을 운영 환경에서 재확인(현재 계측은 로컬 chromium 기준).
- **Admin에서 Erkul preview 1회 실행** — 운영 리허설에서 유일하게 생략된 단계(관리자 로그인 필요).
  preview→hash 복사→로컬 apply 흐름을 운영자가 확인하면 리허설 100% 완결.

## 우선순위 제안 (마일스톤 C 마감 후, 2026-07-08)

1. (완료, 2026-07-09) CSS 중복 solo-rule 29건 병합 — 남은 100건은 콤마 그룹 공유 패턴이라 자동 병합 대상 아님.
2. (대기) 신규 함선 보류 8척 — 트리거 미발동 확인(2026-07-08 라이브 점검, 판매처 0).
3. (선택) 함선 데이터 값 EN화.
