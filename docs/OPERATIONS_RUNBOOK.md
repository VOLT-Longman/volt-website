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

## 7-1. ShipDB 2.0 — Erkul Live 동기화 런북

함선 상세 스펙/구매처 레이어(`data/ship-live-stats.js`, `data/ship-market.js`)를 Erkul live 데이터로
갱신하는 절차. 배경 문서: [shipdb-live-data-layer.md](./shipdb-live-data-layer.md)(레이어 구조·Safe Apply),
[shipdb-description-translation.md](./shipdb-description-translation.md)(KO 번역 정책).

### 동기화 절차 (순서 고정)

```bash
# 1. Admin CMS 함선DB 탭에서 [Erkul Live 동기화 미리보기] 실행
#    previewHash 확인 (읽기 전용 — 파일/DB를 쓰지 않는다)

# 2. 로컬 dry-run (파일 무변경, 변경 요약 + hash 출력)
npm run shipdb:erkul:apply
#    ⚠ 변경 요약이 전부 0이면(스펙/가격/구매처/렌탈/재고/설명 0) 여기서 종료한다.
#      apply해도 syncedAt 타임스탬프만 바뀌므로 커밋/배포할 가치가 없다.
#      (재고 항목 포함 — 2026-07-06 첫 정기 동기화에서 재고만 바뀐 케이스 확인됨)

# 3. previewHash 일치 시 적용 (기존 210개 matched key만 갱신)
npm run shipdb:erkul:apply -- --confirm-preview-hash <previewHash>

# 4. ★ KO 설명 번역 재적용 — 생략 금지 ★
npm run shipdb:erkul:translate-descriptions

# 5. 캐시 버전 갱신 (data/*.js가 실제로 바뀐 경우에만)
npm run cache-version -- YYYYMMDD-NN

# 6. 검증
npm run check
npm run test:functions
npm test
```

> **4번은 필수다.** Safe Apply(A-8)는 live stats entry를 재생성하므로 `descriptions.ko`가 빠진 상태가 된다.
> A-9 번역 테이블(`data/external/erkul/ship-descriptions-ko.json`)을 재적용하지 않으면
> KO 모드 설명이 legacy fallback 또는 null로 노출된다.
> 4+검증을 한 번에: `npm run shipdb:erkul:post-apply`
> (단, 3번 `--confirm-preview-hash`는 **의도적으로 수동 단계** — hash 확인을 자동화하지 않는다.)

### 동기화 원칙 (요약)

- Admin preview는 **읽기 전용**이다. 파일/DB를 절대 쓰지 않는다.
- Safe Apply는 **기존 210개 matched key만** 갱신한다. 재매칭하지 않는다.
- **자동 추가 금지 대상**: Erkul-only 신규 함선 9척, market-only 선체 6종(구형 Aurora 5 + Hammerhead),
  unreleased VOLT 30척. 신규 함선 추가는 별도 마일스톤이다.
- `sourceEnHash` 불일치(=번역 후 Erkul 원문 변경) 번역은 **stale로 분류되어 적용되지 않는다.**
  stale 함선은 KO 모드에서 기존 VOLT 설명으로 폴백되며, 해당 함선만
  `ship-descriptions-ko.json`의 번역과 `sourceEnHash`를 갱신한 뒤 재적용한다. stale 번역을 임의로 계속 쓰지 않는다.
- Erkul에 없는 설명을 임의 생성하지 않는다. Admin에 [바로 적용] 버튼을 추가하지 않는다.
- `volt-data.js`에 live stats/market/description을 직접 merge하지 않는다.

### 동기화 주기 정책 (2026-07-06 확정)

- **정기: 격주 1회 수동 실행** (자동화하지 않는다 — hash 확인·diff 검토가 수동 안전장치).
- **비정기: Star Citizen 게임 패치 직후 +1회** (가격/스펙/판매처 변동 가능성이 가장 큰 시점).
- 실행 기록은 동기화 커밋 자체가 겸한다 (`data: sync Erkul ship live data (YYYY-MM-DD)` 커밋명 권장).
- Asgard 대표값(A-6 스모크의 HP·최저가)이 바뀌면 기대값을 같은 커밋에서 갱신한다.

### 운영 참고 (2026-07-06 리허설에서 확인)

- 전체 루프(dry-run → hash apply → translate → 게이트 → 롤백)는 리허설로 검증됨.
- `node scripts/check-deploy-sync.mjs`와 preview API의 curl 확인은 **Cloudflare 봇 챌린지(403)로 CLI에서 막힌다.**
  라이브 확인은 운영자 브라우저에서 한다 (Admin preview 실행 자체가 배포 확인을 겸함).
  preview API의 비인증 차단은 Functions 테스트(401)로 보장된다.
- 변경 0 동기화를 apply한 경우에도 diff는 syncedAt 계열 타임스탬프뿐이며,
  커밋 전이라면 롤백 절차의 `git restore`로 깨끗하게 원복된다.

### 동기화 후 검증 체크리스트

- [ ] `git diff`에서 변경이 `data/ship-live-stats.js`, `data/ship-market.js`,
      `data/external/erkul/live-data-build-report.json`, `description-translation-report.json`에 한정되는가
- [ ] **`data/volt-data.js` diff 0인가 — 변경됐다면 실패로 간주하고 원인 확인**
- [ ] `description-translation-report.json`의 `staleTranslation`/`missingKoTranslation`이 비어 있는가 (있으면 번역 갱신)
- [ ] `npm run check` / `npm run test:functions` / `npm test` 전부 통과하는가
- [ ] A-6 스모크의 Asgard 대표값(HP·최저가 exact assertion)이 가격/스펙 변경으로 깨졌다면 기대값을 함께 갱신했는가
- [ ] 사이트에서 함선 모달 표본 확인 (Asgard KO/EN 설명, 구매처 가격)

### 롤백 절차

```bash
# 아직 커밋 전이면 — 동기화 산출물만 원복
git restore data/ship-live-stats.js data/ship-market.js data/external/erkul/live-data-build-report.json data/external/erkul/description-translation-report.json

# 이미 커밋 후면 — 동기화 커밋을 통째로 되돌림
git revert <sync-commit-sha>
```

운영 배포 후 문제 발생 시 이전 정상 커밋으로 revert하고 재배포한다(코드 롤백은 5-3절과 동일한 원리 —
데이터 레이어는 정적 파일이므로 revert+재배포로 완전히 복원된다).

---

## 7-2. VOLT AI 운영 (M1 — 도구 기반 어시스턴트)

구조: `#ai 화면 → /api/ai/chat`(단일 관문) → 인증(Discord 멤버)·분당/일일/비용 한도 →
결정론 도구(함선 추천·비교 / UEX 시세 / 일정·공지) → 모델 어댑터(문장화 전용) → 답변+출처+기준 시각.
수치는 도구만 생성하고, 대화 원문은 저장하지 않는다(사용량·오류·도구 종류만 KV 익명 집계).

### 활성화 절차 (운영자 1회)

1. Cloudflare Pages 대시보드 → 프로젝트 → Settings → Functions → **AI 바인딩 추가** (변수명 `AI`).
2. 환경변수 설정 후 재배포:

| 변수 | 기본값 | 의미 |
|---|---|---|
| `VOLT_AI_ENABLED` | (없음=비활성) | `true`일 때만 동작 — **최종 킬 스위치** |
| `VOLT_AI_MODEL` | `@cf/meta/llama-3.1-8b-instruct` | Workers AI 모델 id (어댑터 교체 가능) |
| `VOLT_AI_DAILY_REQUEST_LIMIT` | 200 | 전 멤버 합산 일일 요청 상한 |
| `VOLT_AI_MAX_INPUT_CHARS` | 500 | 입력 길이 상한 |
| `VOLT_AI_MAX_OUTPUT_TOKENS` | 400 | 문장화 출력 토큰 상한 |
| `VOLT_AI_COST_CAP` | 3000 | 일 비용 하드캡(₩) — 초과 시 자동 429 |
| `VOLT_AI_COST_CAP_MONTHLY` | 30000 | 월 비용 하드캡(₩) |
| `VOLT_AI_EST_COST_PER_REQ_KRW` | 3 | 요청당 보수적 비용 추정치(근사) |

3. 바인딩 없이 `VOLT_AI_ENABLED=true`만 켜도 동작한다 — 모델 문장화 대신
   **도구 결과 템플릿 응답**으로 폴백(수치·출처 동일). 모델 품질 문제 시 이 상태로 강등 운영 가능.

### 운영 규칙

- 비용 집계는 KV 근사치다(최종 일관성) — 실제 하드캡의 최종 방어는 `VOLT_AI_ENABLED` 제거.
- 사용량 확인: KV `ai_usage:d:YYYYMMDD` / `ai_usage:m:YYYYMM` (count·cost), `ai_stats:tool:*`(도구별), `ai_stats:err:*`(오류).
- UEX가 불가하면 AI는 시세 추천을 만들지 않고 "데이터 불가"를 명시한다 — 정상 동작이다.
- 프롬프트 주입 방어: 함선/의도는 서버 화이트리스트 재대조로만 확정, 모델 출력은 표시 전용(도구 실행 권한 없음).

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
