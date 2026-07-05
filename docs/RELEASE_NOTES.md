# VOLT 웹사이트 릴리스 노트

배포는 main 브랜치 → Cloudflare Pages 자동 반영이며, 버전 경계는 커밋 단위다.
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
