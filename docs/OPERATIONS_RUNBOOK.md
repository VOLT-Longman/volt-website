# VOLT 운영 런북 — 배포 · D1 마이그레이션 · 롤백 · 체크리스트

이 문서는 **배포 파이프라인, D1 스키마 마이그레이션 적용/롤백, 운영 체크리스트**를 다룬다.
관리자 CMS 사용법(로그인·콘텐츠 작성)은 [`ADMIN_CMS_RUNBOOK.md`](./ADMIN_CMS_RUNBOOK.md),
함선 데이터 파이프라인은 [`ship-data-pipeline.md`](./ship-data-pipeline.md)를 참조한다.

---

## 1. 배포 파이프라인

```text
1. 로컬에서 수정
2. 푸시 전 게이트 통과 (아래 2절)
3. GitHub main 브랜치에 반영
4. Cloudflare Pages 자동 배포 (별도 빌드 명령 없음, functions/ 규칙 배포)
5. https://www.volt.ceo 확인 + node scripts/check-deploy-sync.mjs 로 캐시 동기화 점검
```

- `wrangler.toml`은 없다. 바인딩·시크릿은 Cloudflare Pages 대시보드에서 설정한다.
- CSS/JS/HTML을 바꾸면 `node scripts/update-cache-version.js YYYYMMDD-NN`으로 캐시 버전을 올린다.
  문서/테스트만 바꾼 커밋은 서빙 에셋이 없으므로 캐시 버전을 올리지 않는다.

### 2. 푸시 전 게이트 (필수)

```bash
npm run check           # 문법 + 로컬 링크 + Biome 린트
npm run test:functions  # Pages Functions 단위 테스트 (node --test)
npm test                # Playwright 스모크 + a11y + CSP
```

세 개 모두 통과해야 push한다. 참고 도구:

```bash
node scripts/check-css-duplicates.mjs   # CSS 중복 selector 진단(빌드 게이트 아님)
node scripts/check-deploy-sync.mjs      # 라이브 캐시 버전 == 저장소 sw.js CACHE_VERSION 점검
```

---

## 3. D1 마이그레이션 대장

마이그레이션은 `migrations/NNNN_*.sql`에 순서대로 있으며, **운영 D1에 수동 적용**한다.
Cloudflare D1 `migrations` 프레임워크(자동 추적 테이블)를 쓰지 않으므로,
**어떤 파일까지 적용했는지는 운영자가 직접 추적**해야 한다(4절 추적 방법 참조).

| 파일 | 목적 | 방식 | 재실행 안전(멱등)? |
|---|---|---|:--:|
| `0001_admin_cms.sql` | notices/events/gallery 테이블 | `CREATE TABLE IF NOT EXISTS` | ✅ |
| `0002_seed_content.sql` | 공지 시드 | `INSERT OR IGNORE` | ✅ |
| `0003_ship_overrides.sql` | 함선 보정값 테이블 | `CREATE TABLE IF NOT EXISTS` | ✅ |
| `0004_partner_fleets.sql` | 협력함대 테이블 | `CREATE TABLE IF NOT EXISTS` | ✅ |
| `0005_member_features.sql` | RSVP · 사용자 선호도 | `CREATE TABLE IF NOT EXISTS` | ✅ |
| `0006_leadership_timeline.sql` | 임원진·연혁 테이블 + 시드 | `CREATE IF NOT EXISTS` + `INSERT OR IGNORE` | ✅ |
| `0007_people_partner_images.sql` | avatar_url · photo_url 컬럼 | `ALTER TABLE ADD COLUMN` | ❌ |
| `0008_notice_i18n.sql` | 공지 EN 컬럼(title/content/tag_en) | `ALTER TABLE ADD COLUMN` | ❌ |
| `0009_schema_migrations.sql` | 마이그레이션 적용 추적 테이블 + 0001~0009 백필 | `CREATE IF NOT EXISTS` + `INSERT OR IGNORE` | ✅ |

> **핵심:** `ALTER TABLE ADD COLUMN`(0007·0008)은 **재실행하면 `duplicate column name` 오류로 실패**한다.
> 이미 적용한 마이그레이션은 다시 실행하지 않는다. `CREATE IF NOT EXISTS`/`INSERT OR IGNORE`류는 재실행해도 무해하다.

### 4. 적용 절차

D1 데이터베이스 이름은 대시보드의 D1 인스턴스 이름(바인딩은 `DB`)이다. 아래 `<DB_NAME>`에 넣는다.

```bash
# (1) 반드시 먼저 백업 — 롤백 대비 (5절)
npx wrangler d1 export <DB_NAME> --remote --output=backup-$(date +%Y%m%d-%H%M).sql

# (2) 아직 적용하지 않은 마이그레이션만, 순서대로 적용
npx wrangler d1 execute <DB_NAME> --remote --file=migrations/0008_notice_i18n.sql

# (3) 반영 확인 (예: 새 컬럼 존재 여부)
npx wrangler d1 execute <DB_NAME> --remote --command "PRAGMA table_info(notices);"
```

**적용 상태 추적 (`schema_migrations` 테이블 — 0009 이후 도입):**

`0009_schema_migrations.sql`을 적용하면 D1 안에 적용 상태가 기록된다. 최초 1회 0009를 적용하면
0001~0009가 백필된다. **0009 이후의 모든 마이그레이션은 SQL 끝에서 자신의 id를 기록**한다.

```bash
# 지금까지 적용된 마이그레이션 조회
npx wrangler d1 execute <DB_NAME> --remote --command \
  "SELECT id, applied_at FROM schema_migrations ORDER BY id;"
```

```sql
-- 새 마이그레이션(예: 0010) SQL 맨 끝에 반드시 자기등록 한 줄을 넣는다.
INSERT OR IGNORE INTO schema_migrations (id, applied_at) VALUES ('0010', datetime('now'));
```

이 자기등록 규약은 `scripts/check-migrations.mjs`가 `npm run check`에서 강제한다
(0009 이후 파일이 자기 id를 기록하지 않으면 빌드 실패). `schema_migrations`에 이미 있는 id는
"적용됨"이므로, `ALTER ADD COLUMN`류(0007·0008)를 다시 실행하는 사고를 조회 한 번으로 예방한다.

---

## 5. 롤백 절차

### 5-1. 데이터 백업/복원 (모든 마이그레이션 공통, 가장 안전)

```bash
# 백업(적용 전 필수)
npx wrangler d1 export <DB_NAME> --remote --output=backup-YYYYMMDD-HHMM.sql

# 복원(문제 발생 시): 백업 SQL을 다시 실행
npx wrangler d1 execute <DB_NAME> --remote --file=backup-YYYYMMDD-HHMM.sql
```

### 5-2. 컬럼 추가 마이그레이션 되돌리기 (0007 · 0008)

D1(SQLite 3.35+)은 `DROP COLUMN`을 지원한다. 데이터 손실 없이 되돌리려면 **적용 전 백업 복원**이 원칙이고,
스키마만 되돌릴 때는 다음을 사용한다.

```sql
-- 0008 롤백 (공지 EN 컬럼 제거) — 해당 EN 입력값도 함께 삭제됨
ALTER TABLE notices DROP COLUMN title_en;
ALTER TABLE notices DROP COLUMN content_en;
ALTER TABLE notices DROP COLUMN tag_en;

-- 0007 롤백
ALTER TABLE leadership_members DROP COLUMN avatar_url;
ALTER TABLE partner_fleets DROP COLUMN photo_url;
```

- 0008을 되돌려도 **KO 공지(title/content/tag)와 기존 데이터는 그대로**다(EN은 nullable 추가였음).
- `CREATE TABLE`류(0001·0003~0006)는 되돌릴 일이 거의 없다. 굳이 제거하려면 `DROP TABLE <name>;`(데이터 삭제 주의).

### 5-3. 프런트/코드 롤백

- 배포 롤백은 Git: 문제 커밋 이전으로 되돌려 push하면 Cloudflare Pages가 재배포한다.
- 스키마와 코드는 **하위호환**으로 설계돼 있다(EN 컬럼 없어도 `mapNotice`가 빈 문자열 폴백). 즉 코드가 먼저 배포돼도
  마이그레이션 전까지 EN은 빈 값으로 안전하게 동작한다. **코드 배포 → 마이그레이션 적용** 순서가 안전하다.

---

## 6. 배포 후 Admin/운영 스모크 체크리스트

마이그레이션·배포 후 라이브에서 확인한다(관리자 상세 사용법은 `ADMIN_CMS_RUNBOOK.md`).

```text
□ /admin/ 로그인 성공 (ADMIN_PASSWORD)
□ 탭 이동(공지/일정/갤러리/협력함대/임원진/연혁/함선DB) 정상
□ 공지: KO 작성·저장·수정, EN 필드 입력·저장·재조회(값 유지)
□ 공지 미리보기(KO/EN) + EN 비었을 때 "한국어 fallback" 표시
□ 저장 성공/실패 메시지, 미저장 이탈 경고(dirty) 동작
□ 이미지 업로드(갤러리) 성공 + 미리보기
□ 동시 저장 충돌(409) 시 작성 내용 유지
□ 공개 사이트: 공지 카드/모달(EN 모드에서 EN 표시, 미입력은 KO fallback)
□ 공개 API 장애 시 정적 데이터 폴백(임원진/연혁/공지 등)
□ 라이브 ?v= 캐시 버전 == sw.js CACHE_VERSION (check-deploy-sync)
```

---

## 7. 데이터 파이프라인 (함선 DB / 가격 / EN)

상세는 [`ship-data-pipeline.md`](./ship-data-pipeline.md). 요약 명령:

```bash
node scripts/sync-rsi-ship-matrix.mjs   # RSI 공식 Ship Matrix → data/rsi-ship-matrix-index.json
node scripts/sync-ship-prices.mjs       # star-citizen.wiki 가격 → data/ship-prices-usd.json
node scripts/normalize-ship-database.mjs
node scripts/build-ship-database.mjs    # 원본 → data/volt-data.js ships 병합
node scripts/build-ship-en.mjs          # volt-data 변경 시 data/ship-en.js(EN) 재생성
```

- 함선DB 편집은 `data/volt-data.js`(시드/백업) + D1 `ship_overrides`(운영 수정값) **병합** 구조다.
  운영 중 함선 필드 수정은 관리자 함선DB 탭에서 하며 `data/volt-data.js`를 직접 고치지 않는다.
- `build-ship-en.mjs`는 KO→EN 도메인 사전으로 매핑하며, 사전에 없는 값이 있으면 **빌드가 실패**한다
  (누락 시 사전 보강 필요). EN 함선 설명은 RSI 공식 영어 설명을 `erkulName`/`name`으로 매칭한다.
- `data/ship-en.js`는 초기 로드 최적화를 위해 EN 모드에서 **지연 로드**된다.

---

## 8. 장애 대응 요약

- **공개 API(D1) 장애:** 공개 사이트는 `data/volt-data.js`의 동일 키를 폴백/시드로 사용해 계속 동작한다.
  임원진·연혁·공지 등은 D1이 비어도 정적 데이터로 렌더된다.
- **UEX API 장애/지연:** 무역플래너는 타임아웃(10s)·error/stale 상태로 안전 처리(페이지 전체 중단 없음).
- **관리자 시크릿 미설정:** `ADMIN_SESSION_SECRET`/`DISCORD_*` 미설정 시 로그인은 **안전하게 실패**한다(무단 접근 아님).
- **배포 미반영 의심:** `node scripts/check-deploy-sync.mjs`로 라이브 캐시 버전과 저장소 `sw.js`를 대조한다.

---

## 부록 A. 운영 환경변수 (Cloudflare Pages)

바인딩·시크릿 전체 목록과 Discord OAuth 설정은 `ADMIN_CMS_RUNBOOK.md`의 "배포 환경변수" 절 참조.
핵심: `DB`(D1), `GALLERY_BUCKET`(R2), `ADMIN_PASSWORD`, `ADMIN_SESSION_SECRET`,
`DISCORD_CLIENT_ID/SECRET/REDIRECT_URI/GUILD_ID/ROLE_MAP/SESSION_SECRET`, `R2_PUBLIC_BASE_URL`.
