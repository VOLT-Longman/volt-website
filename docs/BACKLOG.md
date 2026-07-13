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

## 데이터 레벨 i18n — 완료 확인 (2026-07-13)

- **함선 속성 값 EN화**: `data/ship-en.js`와 `mergeShipEn()`이 role/focus/size/crew/description/tags를
  `_en` 필드로 주입하며, 함선 UI와 검색은 이를 사용한다. cargo는 언어 비의존적인 `SCU` 값이다.
- **공지 RSVP status**: API 계약값(참가/대기/불참)은 유지하되, `schedule.js`·`mypage.js`가 i18n 키로 표시한다.
  원천 스키마를 영어로 바꾸는 것은 호환성 이득이 없어 작업 대상으로 남기지 않는다.

## 성능 (Stage B — 보류)

- **모듈 `setup()` 지연** — UEX/무역플래너/함선 컨트롤/검색의 이벤트 바인딩까지 섹션 진입 시로 지연.
  이벤트 바인딩 순서를 건드려 **회귀 위험이 커서 보류**. Stage A(함선DB/갤러리 렌더 지연 + live 레이어 lazy-load)로
  최대 비용은 이미 처리됨.

## ShipDB 2.0 후속

- **신규 함선 후보 분류 완료** — Command Module 1건은 비함선으로 제외했고, Aurora/Hammerhead 6건은
  `marketOnlyMappings`에 승격됐다. 미출시 VOLT 전용 30척은 live 레이어 없이 기존 데이터로 폴백한다.
  새 Erkul preview에 미분류 항목이 나올 때만 `docs/shipdb-new-ship-candidates.md` 기준으로 재분류한다.
- **Hammerhead 가격 모순 anomaly** — Erkul shop이 구(45.56M)/신(34.47M) 엔티티를 이중 등재.
  현 선체 값 우선 표시 중(`ship-market.js`의 hammerhead anomalies 참조). 인게임 실가격 확인 후 정리.
- **A-6 스모크 Asgard 대표값** — HP·최저가 exact assertion은 의도된 회귀 기준. 동기화로 값이 바뀌면
  기대값도 함께 갱신한다(런북 7-1절 체크리스트).

## main.js 잔여 모듈화 — 완료 (2026-07-13)

임원진은 `js/leadership.js`, 연혁·FAQ·정책·무역가이드·가입 단계·무역허브 피처는
`js/site-content.js`로 분리했다. main.js는 호출부 호환 shim과 앱 상태 조립만 담당하며 1,629줄이다.
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
