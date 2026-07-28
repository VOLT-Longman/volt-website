# VOLT 관리자 CMS 운영 문서

## 로그인

1. `/admin/` 접속
2. Cloudflare 환경변수 `ADMIN_PASSWORD` 값 입력
3. 공지, 일정, 갤러리, 협력함대, 임원진, 연혁, 함선DB 관리

## 콘텐츠 관리

- 공지: 제목, 내용, 태그, 날짜, 고정, 게시 상태
- 일정: 제목, 설명, 유형, 상태, 표시 날짜, 실제 날짜, 게시 상태
- 갤러리: 이미지 업로드, 제목, 설명, 카테고리, 날짜, 정렬 순서, 게시 상태
- 협력함대: 이름, 지역, 게임, 협력 분야, 설명, 링크, 정렬 순서, 게시 상태
- 임원진: 이름, 역할, Discord, 설명, 주요 업무, 아바타 이니셜/그라데이션, 정렬 순서, 게시 상태
  - CEO 카드의 상세 항목(리더십 철학·핵심 역량)은 DB의 `extras` JSON 컬럼에 저장되며
    관리자 UI에는 노출되지 않습니다(수정 시 자동 보존). 변경이 필요하면 개발자가 직접 수정합니다.
- 연혁: 표시 날짜(예: `2955.08`), 제목, 설명, 정렬 순서, 게시 상태
- 임원진/연혁은 D1에 데이터가 없으면 사이트가 `data/volt-data.js`의 정적 데이터로 자동 폴백합니다.

## DB 마이그레이션

새 컬렉션 테이블은 `migrations/` SQL을 운영 D1에 적용해야 활성화됩니다.

```bash
npx wrangler d1 execute <DB이름> --remote --file=migrations/0006_leadership_timeline.sql
```

`0006_leadership_timeline.sql`에는 현재 임원진 5명(아마그란데 인사·재무 이사 반영)과
연혁 10건이 시드로 포함되어 있어 적용 즉시 관리자에서 편집할 수 있습니다.

> 전체 마이그레이션 대장(0001–0008)·멱등성·적용 순서·**백업/롤백 절차**는
> [`OPERATIONS_RUNBOOK.md`](./OPERATIONS_RUNBOOK.md)를 참조하세요.
> 특히 `ALTER TABLE ADD COLUMN`(0007·0008)은 **재실행 시 실패**하므로 이미 적용한 파일은 다시 실행하지 않습니다.

## 배포 환경변수

- `DB`: D1 binding
- `GALLERY_BUCKET`: R2 binding
- `ADMIN_PASSWORD`: 관리자 로그인 비밀번호
- `ADMIN_SESSION_SECRET`: 세션 서명 전용 시크릿. `ADMIN_PASSWORD`와 다른 긴 난수 값을 사용해야 하며, 미설정 시 관리자 로그인과 세션 검증이 안전하게 실패합니다.
- `R2_PUBLIC_BASE_URL`


## Discord 소셜 로그인 환경변수

Discord OAuth 로그인은 Cloudflare Pages Functions의 `/auth/discord/*` 엔드포인트로 처리합니다. 아래 값이 없으면 로그인은 안전하게 실패합니다.

- `DISCORD_CLIENT_ID`: Discord Application Client ID
- `DISCORD_CLIENT_SECRET`: Discord Application Client Secret. Secret 환경변수로 등록합니다.
- `DISCORD_REDIRECT_URI`: 운영 기준 `https://www.volt.ceo/auth/discord/callback`
- `DISCORD_GUILD_ID`: VOLT Discord 서버 ID
- `DISCORD_ROLE_MAP`: Discord role ID를 한글 역할명으로 매핑한 JSON. 예: `{"123":"대표이사","456":"VOLT 함대원"}`
- `DISCORD_SESSION_SECRET`: 사용자 세션 쿠키 서명용 긴 난수. ADMIN_SESSION_SECRET과 공유하지 않습니다.

Discord Developer Portal의 OAuth2 Redirects에는 `DISCORD_REDIRECT_URI`와 동일한 URL을 등록해야 합니다.

## 보안 운영 기준

- ADMIN_SESSION_SECRET은 코드에 하드코딩하지 않습니다.
- ADMIN_SESSION_SECRET은 ADMIN_PASSWORD 또는 과거 ADMIN_TOKEN과 공유하지 않습니다.
- ADMIN_TOKEN은 세션 서명키로 사용하지 않습니다.

## 장애 확인

공개 API 장애 시 공개 사이트는 정적 데이터를 fallback으로 사용해야 한다.

## 원본 반영 전 검수

관리자 로그인, CRUD, 이미지 업로드, 공개 API, fallback, 모바일 기본 사용성, 원본 프로젝트 무변경 여부를 확인한다.


## 갤러리 작성 방법

1. `/admin/`에 접속해 로그인합니다.
2. `갤러리` 탭을 선택합니다.
3. `새로 작성`을 누릅니다.
4. 제목을 입력합니다.
5. 이미지를 선택하고 `업로드`를 눌러 미리보기를 확인합니다.
6. 필요하면 설명, 카테고리, 날짜를 수정합니다.
7. 게시 여부를 확인한 뒤 저장합니다.

갤러리 작성 시 이미지 URL, 썸네일 URL, 정렬 순서는 기본 화면에 노출하지 않습니다. 이미지 URL과 썸네일 URL은 업로드 결과로 자동 저장되며, 날짜는 비워두면 오늘 날짜가 사용됩니다.

## 함선DB 수정 방법

1. `/admin/`에 접속해 로그인합니다.
2. `함선DB` 탭을 선택합니다.
3. 함선명, 제조사, 역할, 태그로 검색합니다.
4. 수정할 함선을 선택합니다.
5. **표시 이름(EN/KO)과 공개 여부(숨김)만** 입력하고 저장합니다. 빈 필드는 canonical 값을 그대로 씁니다.
6. `원본으로 되돌리기`를 누르면 해당 함선의 관리자 수정값이 삭제됩니다.

함선의 사양·역할·태그·설명은 **Erkul canonical이 유일 사실원**이며 관리자 화면에서 바꿀 수 없습니다
(편집 화면에도 그렇게 표시됩니다). 이 값들은 Erkul 동기화로만 갱신됩니다 — `OPERATIONS_RUNBOOK.md` 7-1절 참조.
관리자 수정값은 D1 `ship_overrides`의 `name`·`name_ko`·`hidden` 3개 컬럼에만 저장되고,
그 외 필드를 API로 보내면 거부됩니다. 원본 `data/volt-data.js`에는 함선 데이터가 더 이상 없습니다.


## 정형화된 공지/일정 입력 기준

공지 태그와 일정 유형은 사이트 전체의 일관성을 위해 자유 입력이 아니라 정해진 항목 중 선택합니다.

### 공지 태그
- 공지: 일반 안내
- 중요: 반드시 확인해야 하는 핵심 공지
- 업데이트: 사이트/시스템/데이터 변경
- 이벤트: 이벤트성 안내
- 작전: 작전 관련 공지
- 시스템: 장애, 점검, 운영 시스템 안내
- 모집: 인원 모집 및 참여 안내

### 일정 유형과 상태
- 유형: 정기작전, 합동작전, 이벤트, 회의, 훈련, 점검, 기타
- 상태: 예정, 진행중, 완료, 취소, 연기

## 갤러리 이미지 운영 기준

### 권장 이미지 규격
- 권장 비율: 16:9
- 권장 해상도: 1920x1080 또는 2560x1440
- 지원 형식: JPG, PNG, WEBP
- 권장 크기: 파일당 10MB 이하

### 단일 이미지 업로드
1. `/admin/` 접속 후 갤러리 탭을 엽니다.
2. 새로 작성을 누릅니다.
3. 제목을 입력하고 이미지를 선택합니다.
4. 필요하면 설명, 카테고리, 날짜를 조정합니다.
5. 저장을 누르면 업로드 후 갤러리 항목이 생성됩니다.

### 다중 이미지 업로드
1. 갤러리 작성 화면에서 여러 이미지를 한 번에 선택합니다.
2. 제목, 설명, 카테고리, 날짜, 게시 여부는 모든 이미지에 공통 적용됩니다.
3. 여러 장 저장 시 제목 뒤에 번호가 붙습니다. 예: `VOLT 연합 작전 1`, `VOLT 연합 작전 2`.
4. 일부 파일 업로드가 실패해도 성공한 이미지는 갤러리 항목으로 저장됩니다.

### 공개 화면 이미지가 너무 크게 보일 때
- 카드 이미지는 `16:9` 비율과 `object-fit: cover`를 기준으로 조정합니다.
- 상세 모달 이미지는 `max-height: 60vh`와 `object-fit: contain`을 기준으로 조정합니다.


## 함선DB 태그 — 관리자 편집 대상이 아님 (2026-07-25 갱신)

함선 태그는 더 이상 관리자가 입력하지 않습니다. 공개 필터의 역할 태그는 Erkul canonical role에서
`data/canonical/ship-filter-taxonomy.json`으로 파생되며, 수기 태그 편집 경로는 제거됐습니다.
분류 기준을 바꾸려면 taxonomy 생성기(`scripts/shipdb-rewrite/build-ship-filter-taxonomy.mjs`)를
수정해 재생성해야 합니다 — 관리자 화면에서 저장할 수 없습니다.

