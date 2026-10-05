# VOLT 운영 런북 — 배포 · D1 마이그레이션 · 롤백 · 체크리스트

이 문서는 **배포 파이프라인, D1 스키마 마이그레이션 적용/롤백, 운영 체크리스트**를 다룬다.
관리자 CMS 사용법(로그인·콘텐츠 작성)은 [`ADMIN_CMS_RUNBOOK.md`](./ADMIN_CMS_RUNBOOK.md),
함선 데이터 파이프라인은 [`ship-data-pipeline.md`](./ship-data-pipeline.md)를 참조한다.

2026-10-04 최신 Cloudflare 설정과 운영 D1 적용 상태는 [운영 설정 기록](CLOUDFLARE_CONFIGURATION.md)을 따른다. 아래 과거 실행 기록은 당시 상태다. 현재는 0013·0015 및 변경 이력이 준비됐고, Under Attack은 해제돼 공개 배포 검사를 직접 실행할 수 있다. 0014는 정리 대상이 없어 실행하지 않았다.

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
0009 이후에는 `schema_migrations`에 적용 번호가 기록된다. 운영자는 이 대장과 실제 컬럼·인덱스를 함께 확인한다(4절 참조).

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
| `0010_ship_name_ko_hidden.sql` | ship_overrides에 name_ko · hidden 컬럼 | `ALTER TABLE ADD COLUMN` | ❌ |
| `0011_rsvp_user_index.sql` | event_rsvps(user_sub) 인덱스 | `CREATE INDEX IF NOT EXISTS` | ✅ |
| `0012_notice_date_format.sql` | 공지 날짜를 YYYY-MM-DD로 정규화 | 조건부 `UPDATE`(GLOB) | ✅ |
| `0013_atomic_security.sql` | 보안 제한·사용량·세션 테이블 | `CREATE TABLE IF NOT EXISTS` | ✅ |
| `0014_cleanup_orphan_event_rsvps.sql` | 삭제된 일정의 과거 참가 기록 백업 후 정리 | 조건부 `INSERT` + `DELETE` | ✅ |
| `0015_cms_history.sql` | 콘텐츠 시작 시점 스냅샷과 변경 이력 트리거 | `CREATE IF NOT EXISTS` + 조건부 `INSERT` | ✅ |
| `0016_cms_localization_actor.sql` | CMS 영어·작성자 이력·명확한 일정 날짜 보정 | `ALTER` + 트리거 교체 | ❌ |
| `0017_published_content_english.sql` | 원문 일치·영문 미입력 공개 콘텐츠 번역 | 조건부 `UPDATE` | ✅ |

> **핵심:** `ALTER TABLE ADD COLUMN`(0007·0008·0010)은 **재실행하면 `duplicate column name` 오류로 실패**한다.
> 이미 적용한 마이그레이션은 다시 실행하지 않는다. `CREATE IF NOT EXISTS`/`INSERT OR IGNORE`류는 재실행해도 무해하다.

**운영 D1 적용 현황 (2026-10-04 확인, 과거 실행 설명 포함)**

- `0012` **적용 완료.** 공지 15행 전부 `YYYY-MM-DD`이며 점 표기 0건임을 조회로 확인했다.
- 같은 작업에서 **중복 공지 3쌍을 삭제**했다 — 시드(`ann-003`·`ann-004`·`ann-005`)와 관리자가
  다시 작성한 동일 사건 공지가 함께 있었다. 관리자 생성본(`notice-*`)을 남겼다.
  ⚠ `0002_seed_content.sql`은 `INSERT OR IGNORE`라 **파일을 수동으로 재실행하면 이 3건이 되살아난다.**
  정상 운영에서는 `schema_migrations`에 `0002`가 기록돼 재실행되지 않는다.
- `ann-006`('공식 홈페이지 리뉴얼 오픈')의 비어 있던 날짜를 시드 원본값 `2026-05-15`로 복구했다.
  빈 날짜가 저장되던 원인(코드)은 `80e0ba3`·`762fe73`에서 제거했다.
- **확인 완료:** `0008`~`0011`의 컬럼·인덱스와 적용 대장을 2026-10-04에 조회했다. `0013`·`0015`도 운영 적용 완료다. 새 배포에서도 아래 조회로 적용 대장을 확인한다.
  ```sql
  SELECT id, applied_at FROM schema_migrations ORDER BY id;
  ```

`0014`는 과거에 삭제된 일정의 참가 기록을 한 번 정리하는 작업이다. 코드 배포나 main 푸시만으로는
운영 D1에 적용되지 않는다. 백업 후 `schema_migrations`에서 미적용임을 확인하고 아래 명령으로 적용한다.
현재 존재하는 일정의 참가 기록은 삭제하지 않는다.

이번 버전의 0014는 정리 대상 원본을 `event_rsvps_orphan_backup`에 먼저 저장한다. 운영 D1 전체 백업도 먼저 수행한다. 0015 적용, 이력 복구와 이미지 유지관리 절차는 [CMS 유지관리 문서](CMS_MAINTENANCE.md)를 참조한다.

```bash
npx wrangler d1 execute <DB_NAME> --remote --file=migrations/0014_cleanup_orphan_event_rsvps.sql
```

적용 후 `schema_migrations`에 `0014`가 기록되고, 아래 조회 결과가 0인지 확인한다.

```sql
SELECT COUNT(*) AS orphan_count FROM event_rsvps
WHERE NOT EXISTS (SELECT 1 FROM events WHERE events.id = event_rsvps.event_id);
```

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

상세는 [`ship-data-pipeline.md`](./ship-data-pipeline.md). 공개 ShipDB의 사실원은 **Erkul canonical 219척 + RSI 공식 30척(249척)** 이며, 재생성은 Erkul 파이프라인만 사용한다:

```bash
npm run shipdb:erkul:apply            # 새 LIVE catalog + prices 수집, dry-run/hash 확인
npm run shipdb:erkul:apply -- --confirm-preview-hash <hash> # 기존 219개 식별자 보존하여 반영
npm run shipdb:erkul:verify           # 배포 데이터와 재생성 결과 대조(재현성)
npm run shipdb:canonical:build        # canonical·localization·taxonomy·manifest 재생성
```

2026-10-05부터 Erkul `cdn.erkul.games/LIVE/catalog.bin`(schema 8)과 `prices.bin`(schema 2)을 사용한다. 압축 해제와 SHA-256 검증 후 기존 정규화 형식으로 변환한다. 가격의 LIVE 게임 버전이 함선 catalog와 다르면 중단한다. `catalog-details.json`은 공개 원본의 최소 상세 자료와 파일 해시를 보관하며, CMS는 변하지 않은 파일을 다시 받지 않는다. 무료 Workers 요청 한도를 위해 한 번의 미리보기에서 변경 상세 35건까지 확인하며, 그보다 많으면 로컬 Safe Apply를 안내한다.

반영되지 않은 신규 후보는 자동 추가하지 않는다. 원본에서 빠진 변형은 기존 수치와 기존 날짜를 유지하며 과거 자료로 표시한다. 재매칭을 하지 않는 Safe Apply가 현재 운영 갱신 경로다. 공개 화물량은 일반 화물칸 기준이고 광석 저장량을 포함하지 않는다.

UEX 가격 재조회는 브라우저의 30분 캐시를 건너뛰며, 서버는 같은 가격 요청의 원본 조회를 최대 1분 간격으로 제한한다. 최신성은 선택 매수·매도 중 오래된 보고 시각으로 판정하며, 미확인·미래 시각도 경고한다. 예상 수익은 보고된 재고·수요 범위로 계산하고, 미보고 수량은 제한으로 추정하지 않는다. 수익표의 직접 입력 수량은 유지하되 보고량을 넘으면 이론 수익 안내를 표시한다.

- 3.5-B에서 레거시 재생성 경로(`sync-rsi-ship-matrix`·`sync-ship-prices`·`normalize-ship-database`·`build-ship-database`·`build-ship-en`)·`data/ship-en.js`와
  SC Wiki 가격 데이터(`data/ship-prices-usd.json`)를 **물리 삭제**했다. 다시 만들지 않는다(계약 테스트가 부재를 강제).
- 함선DB는 **canonical 계층이 유일 사실원**이다. `data/volt-data.js`의 ships 배열과 `data/ship-en.js`는 삭제됐고,
  표시명·공식 URL은 `data/canonical/presentation-ships.json`, KO 설명·역할명은 localization 계층이 소유한다.
  KO/EN 표시 모두 canonical·presentation·localization에서 직접 나온다(레거시 수기 값 없음).
- 운영 중 함선 수정은 관리자 함선DB 탭(D1 `ship_overrides`)에서만 한다. **현재 반영되는 필드는
  `name`·`name_ko`·`hidden` 3개뿐**이다 — 사양·분류·설명(`role`·`size`·`crew`·`cargo`·`price_usd`·`tags` 등)은
  canonical이 소유하므로 API가 거부한다(`CANONICAL_OVERRIDE_FIELDS`). D1에 남은 해당 컬럼은 읽지도 쓰지도 않는
  정지 데이터이며, 물리 삭제는 백업·복구 리허설 확인 후 별도 마이그레이션으로만 진행한다.

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

# 3. previewHash 일치 시 적용 (기존 219개 matched key만 갱신)
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
- Safe Apply는 **기존 219개 matched key만** 갱신한다. 재매칭하지 않는다.
- **자동 추가 금지 대상**: Erkul-only 신규 후보 4척(2026-10-05), 기존 market-only 수동 매핑,
  unreleased VOLT 30척. 신규 함선 추가는 별도 마일스톤이다.
- `sourceEnHash` 불일치(=번역 후 Erkul 원문 변경) 번역은 **stale로 분류되어 적용되지 않는다.**
  localization 계층은 `status === 'ok'`인 번역만 방출하므로 stale 함선은 KO가 비고 **영문 원문으로 표시된다**
  (레거시 VOLT 설명 폴백은 ships 배열 삭제와 함께 없어졌다). 해당 함선만
  `ship-descriptions-ko.json`의 번역과 `sourceEnHash`를 갱신한 뒤 재적용한다. stale 번역을 임의로 계속 쓰지 않는다.
- Erkul에 없는 설명을 임의 생성하지 않는다. Admin에 [바로 적용] 버튼을 추가하지 않는다.
- 동기화 산출물은 `data/ship-live-stats.js`·`ship-market.js`와 canonical 계층뿐이다.
  `volt-data.js`(임원진·연혁 등 비함선 섹션)에는 어떤 함선 데이터도 되돌려 넣지 않는다.

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
- [ ] **`data/volt-data.js` diff 0인가 — 함선 데이터가 여기로 되돌아오면 실패로 간주하고 원인 확인**
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

1. 데이터 기반 베타는 AI 바인딩 없이 운영한다. `VOLT_AI_ENABLED=true`를 설정하고 재배포한다.
2. 생성형 모델 연결은 별도 후속 단계다. 바인딩이 있더라도 `VOLT_AI_GENERATIVE_ENABLED=true`를 명시하지 않으면 모델은 호출하지 않는다.

| 변수 | 기본값 | 의미 |
|---|---|---|
| `VOLT_AI_ENABLED` | (없음=비활성) | `true`일 때만 동작 — **최종 킬 스위치** |
| `VOLT_AI_GENERATIVE_ENABLED` | (없음=비활성) | 생성형 의도 분류·해설의 별도 스위치. 데이터 베타에서는 설정하지 않는다. |
| `VOLT_AI_MODEL` | `@cf/meta/llama-3.1-8b-instruct` | Workers AI 모델 id (어댑터 교체 가능) |
| `VOLT_AI_DAILY_REQUEST_LIMIT` | 200 | 전 멤버 합산 일일 요청 상한 |
| `VOLT_AI_MAX_INPUT_CHARS` | 500 | 입력 길이 상한 |
| `VOLT_AI_MAX_OUTPUT_TOKENS` | 400 | 문장화 출력 토큰 상한 |
| `VOLT_AI_COST_CAP` | 3000 | 일 예산 보호 장치(₩, 근사 집계) — 초과 시 자동 429 |
| `VOLT_AI_COST_CAP_MONTHLY` | 30000 | 월 예산 보호 장치(₩, 근사 집계) |
| `VOLT_AI_EST_COST_PER_REQ_KRW` | 3 | 요청당 보수적 비용 추정치(근사) |

3. `/api/ai/chat` GET에서 `enabled:true`, `mode:"data"`를 확인한다. Discord 멤버 로그인 후 함선 추천·비교, 상품 시세, 일정·공지를 질문한다. 한국어·영어 응답은 화면 언어를 따른다.
4. “그럼 2인” / “Then 2 crew”처럼 추천 조건을 바꿀 수 있다. 최근 성공한 질문 최대 3개를 브라우저 메모리에서 함께 전송하며 서버에는 저장하지 않는다. 새 대화·새로고침으로 초기화한다. 자유 대화, 이미지·음성 입력은 지원하지 않는다.

### 운영 규칙

- 요청·추정 비용 한도는 D1 원자적 예약으로 적용하며 KV는 참고용 집계다. 데이터 베타의 모델 추정 비용은 0이고 일일 200회·사용자별 분당 8회 제한은 유지한다. 생성형 연결 시 추정 비용은 실제 청구액과 다를 수 있다. 비활성화도 변수 변경 후 재배포가 필요하다.
- 일일 카운터는 **UTC 자정(한국시간 오전 9시)**에 초기화된다.
- 모델 문장(aiNote)은 보조 설명 전용 — 도구 데이터에 없는 수치(2자리 이상 숫자열)가 포함되면
  서버가 폐기한다. 한글 단위 표기("구백만") 같은 우회는 완전 차단이 불가한 알려진 한계다.
- UEX 시세는 `date_modified` 기준 **60분 이내 갱신 행만** 안내한다(무역플래너 danger 임계와 동일).
  전부 오래됐으면 시세를 만들지 않고 stale 상태를 명시한다.
- 사용량 확인: KV `ai_usage:d:YYYYMMDD` / `ai_usage:m:YYYYMM` (count·cost), `ai_stats:tool:*`(도구별), `ai_stats:err:*`(오류).
- UEX가 불가하면 AI는 시세 추천을 만들지 않고 "데이터 불가"를 명시한다 — 정상 동작이다.
- 프롬프트 주입 방어: 함선/의도는 서버 화이트리스트 재대조로만 확정, 모델 출력은 표시 전용(도구 실행 권한 없음).

## 8. 장애 대응 요약

- **공개 API(D1) 장애:** 임원진·연혁·공지 등은 `data/volt-data.js`의 동일 키를 폴백/시드로 사용해
  D1이 비어도 정적 데이터로 렌더된다.
- **canonical 로드/검증 실패:** 함선DB에는 폴백이 **없다**(레거시 목록을 섞어 보여주지 않는다).
  manifest SHA-256 검증에 실패하면 함선 목록은 비고 오류·재시도만 표시된다 — 잘못된 사양을 보여주는 것보다
  안전하다. 초기화 자체는 계속되므로 공지·임원진 등 나머지 섹션은 정상 렌더된다.
- **UEX API 장애/지연:** 무역플래너는 타임아웃(10s)·error/stale 상태로 안전 처리(페이지 전체 중단 없음).
- **관리자 시크릿 미설정:** `ADMIN_SESSION_SECRET`/`DISCORD_*` 미설정 시 로그인은 **안전하게 실패**한다(무단 접근 아님).
- **배포 미반영 의심:** `node scripts/check-deploy-sync.mjs`로 라이브 캐시 버전과 저장소 `sw.js`를 대조한다.

---

## 부록 A. 운영 환경변수 (Cloudflare Pages)

바인딩·시크릿 전체 목록과 Discord OAuth 설정은 `ADMIN_CMS_RUNBOOK.md`의 "배포 환경변수" 절 참조.
핵심: `DB`(D1), `GALLERY_BUCKET`(R2), `ADMIN_PASSWORD`, `ADMIN_SESSION_SECRET`,
`DISCORD_CLIENT_ID/SECRET/REDIRECT_URI/GUILD_ID/ROLE_MAP/SESSION_SECRET`, `R2_PUBLIC_BASE_URL`.
