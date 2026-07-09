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
    첫 발생 위치로 조정 — **기계적 "마지막 위치로 병합"은 안전하지 않을 수 있음**을 확인. 부수 발견:
    `.notice-card-pinned`·`.planner-field-hint`는 실제로 어디서도 매치되지 않는 죽은 selector(병합
    자체는 무해, 별도 정리 후보).
  - **남은 100건은 성격이 다르다**: 대부분 콤마로 여러 selector가 본문을 공유하는 패턴
    (`.about-intro, .culture-section, .about-info, .join-cta, .hub-content { 공통 스타일 }` 후
    `.culture-section, .about-info { 추가 스타일 }` 식). 이건 정상적인 CSS 공용 베이스+오버라이드
    관행에 가까워 억지로 분리 병합하면 오히려 가독성이 떨어질 수 있다. **자동 병합 대상 아님** —
    개별 검토가 필요하면 케이스별로 판단.
  - 파일 분리(`css/sections/*`)는 원한다면 다음 단계.

## 데이터 레벨 i18n (UI 아님)

- **함선 속성 값 EN화** — role/cargo/size 등 함선 데이터 값은 여전히 KO. `data/volt-data.js` + `data/ship-en.js`에
  대응 `_en` 필드/사전 보강 필요(빌드 `build-ship-en.mjs` 사전 확장). 검색 결과 본문도 동일.
- **공지 RSVP status 등 백엔드 값** — 프론트 매핑으로 표시 로컬라이즈는 끝났으나, 원천 데이터 스키마는 KO 유지.

## 성능 (Stage B — 보류)

- **모듈 `setup()` 지연** — UEX/무역플래너/함선 컨트롤/검색의 이벤트 바인딩까지 섹션 진입 시로 지연.
  이벤트 바인딩 순서를 건드려 **회귀 위험이 커서 보류**. Stage A(함선DB/갤러리 렌더 지연 + live 레이어 lazy-load)로
  최대 비용은 이미 처리됨.

## ShipDB 2.0 후속

- **신규 함선 보류 8척** — Tiburon/Tyilui/Starlite(정식 선체이나 인게임 구매처 없음) + F8A/에디션 4종.
  재검토 트리거: Erkul sync preview에서 해당 함선 구매처 발생 시. 분류표: `docs/shipdb-new-ship-candidates.md`.
- **Hammerhead 가격 모순 anomaly** — Erkul shop이 구(45.56M)/신(34.47M) 엔티티를 이중 등재.
  현 선체 값 우선 표시 중(`ship-market.js`의 hammerhead anomalies 참조). 인게임 실가격 확인 후 정리.
- **A-6 스모크 Asgard 대표값** — HP·최저가 exact assertion은 의도된 회귀 기준. 동기화로 값이 바뀌면
  기대값도 함께 갱신한다(런북 7-1절 체크리스트).

## main.js 잔여 모듈화 (1985줄 — notices `8af04fb` · schedule `680ff3d` 분리 완료)

남은 렌더 책임(독립성 순): 임원진/연혁 → FAQ/가이드/정책 → CMS fetch client 공통화.
notices와 동일한 패턴(`window.VOLT_*` + `init(deps)` + 호출부 무변경 shim)으로 하나씩 분리한다.
innerHTML 래칫 베이스라인은 이동분만큼 함께 옮긴다(총합 불변).

## 운영 후속

- **운영 D1에 0008·0009 적용 확인** — 코드/문서는 반영됐으나 실제 D1 적용은 운영자 1회 작업.
  `SELECT id, applied_at FROM schema_migrations ORDER BY id;`로 확인(런북 4절).
- **배포 후 실측** — Lighthouse/RUM로 lazy init 개선폭을 운영 환경에서 재확인(현재 계측은 로컬 chromium 기준).
- **Admin에서 Erkul preview 1회 실행** — 운영 리허설에서 유일하게 생략된 단계(관리자 로그인 필요).
  preview→hash 복사→로컬 apply 흐름을 운영자가 확인하면 리허설 100% 완결.

## 우선순위 제안 (마일스톤 C 마감 후, 2026-07-08)

1. (완료, 2026-07-09) CSS 중복 solo-rule 29건 병합 — 남은 100건은 콤마 그룹 공유 패턴이라 자동 병합 대상 아님.
2. (낮음) main.js 잔여 모듈화 — 임원진/연혁부터.
3. (대기) 신규 함선 보류 8척 — 트리거 미발동 확인(2026-07-08 라이브 점검, 판매처 0).
4. (선택) 함선 데이터 값 EN화.
