# VOLT 유지보수 백로그 (마일스톤 마감 후 이관)

핵심 기능/i18n/성능/보안/운영 + ShipDB 2.0은 마감됐다. 아래는 **의도적으로 후속으로 넘긴** 품질 부채다.
각 항목은 회귀 위험 대비 가치와 착수 조건을 함께 적었다. 근거 스모크는 이미 회귀망에 존재한다.

## 접근성 부채 — 전량 상환 완료

- critical/serious allowlist 전부 비움 (2026-07-06, `ebdf271`). 새 위반은 즉시 테스트 실패.
- **heading-order/page-has-heading-one(moderate)도 상환 완료** (C-5): sr-only 사이트 h1 상시화,
  푸터 그룹 h4→h2, 가입 단계 렌더러 h4→h3. a11y.spec.js에 문서 구조 래칫 5화면 추가로 고정.

## CSS 구조 부채

- **cascade 중복 selector 129건** (155→129, `4290c7e`) — 완전 피복(dead) 블록 38건은 computed style
  전량 비교(58키 동일)로 검증 후 제거 완료. **남은 129건은 서로 다른 본문의 진화형 재정의 레이어**라
  속성 단위 병합이 필요. **착수 조건 충족됨**: 스크린샷 회귀 도입 완료(C-4, `visual-regression.spec.js`
  8화면 기준 이미지). 이제 고중복 영역부터 소단위 병합을 재개할 수 있다.
  진단: `node scripts/check-css-duplicates.mjs`. 파일 분리(`css/sections/*`)는 그 다음 단계.

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

1. (낮음·상시) CSS 중복 129건 — 착수 조건(스크린샷 회귀) 충족, 고중복 영역부터 소단위 병합.
2. (낮음) main.js 잔여 모듈화 — 임원진/연혁부터.
3. (대기) 신규 함선 보류 8척 — 트리거 미발동 확인(2026-07-08 라이브 점검, 판매처 0).
4. (선택) 함선 데이터 값 EN화.
