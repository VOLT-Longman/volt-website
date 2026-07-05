# VOLT 유지보수 백로그 (마일스톤 마감 후 이관)

핵심 기능/i18n/성능/보안/운영은 마감됐다. 아래는 **의도적으로 후속으로 넘긴** 품질 부채다.
각 항목은 회귀 위험 대비 가치와 착수 조건을 함께 적었다. 근거 스모크는 이미 회귀망에 존재한다.

## 접근성 부채 (a11y 래칫 allowlist 상환)
`tests/smoke/a11y.spec.js`의 allowlist에 남은 항목을 줄이는 작업.

- **nested-interactive / aria-allowed-role** — 함선 카드가 버튼 안에 버튼을 중첩하는 구조.
  카드 레이아웃을 링크/버튼 비중첩 구조로 바꿔야 함. **중간 규모(구조 변경)**, 시각 회귀 확인 필요.
- **color-contrast** — 라이트/다크 테마 일부 텍스트 대비 미달. 토큰(`--color-text-*`) 대비값 보정.
  **디자인 판단 필요**, 브랜드 색과 충돌 없게.
- **heading-order** — 섹션 제목 단계(h2→h3) 정돈. moderate(참고용), 낮은 우선순위.

## CSS 구조 부채
- **cascade 중복 selector 약 155건** — `scripts/check-css-duplicates.mjs`로 상시 조회 가능.
  완전 동일 블록은 0건이고 전부 서로 다른 본문의 cascade 레이어라, **스크린샷 회귀 도입 전에는 위험**.
  착수 조건: 시각 회귀(스크린샷 비교) 스모크 도입 → 고중복 영역(`.notice-card`×5, `.notices-grid`×5,
  `.leadership-grid`×4 등)부터 계산값 대조하며 단계 통합. 파일 분리(`css/sections/*`)는 그 다음.

## 데이터 레벨 i18n (UI 아님)
- **함선 속성 값 EN화** — role/cargo/size 등 함선 데이터 값은 여전히 KO. `data/volt-data.js` + `data/ship-en.js`에
  대응 `_en` 필드/사전 보강 필요(빌드 `build-ship-en.mjs` 사전 확장). 검색 결과 본문도 동일.
- **공지 RSVP status 등 백엔드 값** — 프론트 매핑으로 표시 로컬라이즈는 끝났으나, 원천 데이터 스키마는 KO 유지.

## 성능 (Stage B — 보류)
- **모듈 `setup()` 지연** — UEX/무역플래너/함선 컨트롤/검색의 이벤트 바인딩까지 섹션 진입 시로 지연.
  이벤트 바인딩 순서를 건드려 **회귀 위험이 커서 보류**. Stage A(함선DB/갤러리 렌더 지연)로 최대 비용은 이미 처리됨.

## 운영 후속
- **운영 D1에 0008·0009 적용 확인** — 코드/문서는 반영됐으나 실제 D1 적용은 운영자 1회 작업.
  `SELECT id, applied_at FROM schema_migrations ORDER BY id;`로 확인(런북 4절).
- **배포 후 실측** — Lighthouse/RUM로 lazy init 개선폭을 운영 환경에서 재확인(현재 계측은 로컬 chromium 기준).

## 우선순위 제안
1. (낮음·상시) CSS 중복은 진단 도구로 관리, 시각 회귀 도입 후 정리.
2. (중간) a11y `nested-interactive` 구조 개선 → allowlist 축소.
3. (중간) color-contrast 토큰 보정.
4. (선택) 함선 데이터 값 EN화 — EN 완성도 추가 향상 원할 때.
