# ShipDB Erkul 재작성 v2 — 소비처 전수 맵 (0단계 0.1 산출)

> **시점 기록 (2026-07-25 확인).** 이 문서는 작성 당시 상태를 남긴 기록이며 현행 운영 문서가 아니다.
> 본문이 현재형으로 서술하는 `data/volt-data.js`의 ships 배열, `data/ship-en.js`,
> `data/ship-prices-usd.json`, 레거시 재생성 스크립트는 **3.5-B에서 물리 삭제**됐다.
> 현재 데이터 구조는 [ship-data-pipeline.md](ship-data-pipeline.md), 운영 절차는
> [OPERATIONS_RUNBOOK.md](OPERATIONS_RUNBOOK.md)를 사실원으로 본다.

- **목적**: 제거/격리 대상 필드의 실제 소비처를 `js/ + functions/ + admin/ + tests/ + scripts/` 전 디렉터리에서 전수 확인. 감사 방법론 결함(정정 5: js/만 grep) 폐쇄.
- **방법**: 5-에이전트 병렬 전수 grep(필드군별). 코드·데이터 무변경. **소비처 288건 확인**(js 79 / functions 62 / admin 24 / tests 43 / scripts 78 / migrations 2).
- **결론**: 3.5 제거는 아래 소비처 재배선 + 재생성 파이프라인 봉인이 선행돼야 안전. 이 맵은 2단계 이관의 작업 목록이다.

## ⚠ 최우선 발견 — 재주입 위험 (재생성 파이프라인)

3.5에서 필드를 지워도, **재생성 스크립트를 재실행하면 부활한다.** 0.4 CI 차단 테스트(`shipdb-canonical-contract.test.mjs`)는 공개 canonical에 대해 이를 잡지만, **레거시 volt-data 재생성 경로 자체를 봉인**해야 완전하다.

| 필드 | 재생성 경로 | 현재 실행 가능? |
|---|---|---|
| `priceUsd` | `sync-ship-prices.mjs`(SC Wiki API) → `normalize-ship-database.mjs:111` `getPriceUsd` 주입 | 부분(prices.json 존재) |
| `focus`·`tags` | `normalize-ship-database.mjs:72/82/105`·`build-ship-database.mjs:46/85`(`getCategories`/`getTags`) | **불가 — `rsi-ship-matrix-index.json` 부재** |
| `role` 분류 | 위 동일 `getCategory` | 위 동일 |

- **핵심**: `normalize-ship-database`·`build-ship-database`·`build-ship-en` 셋 다 `data/rsi-ship-matrix-index.json`을 필수 입력으로 읽는다 — **현재 저장소에 파일 부재라 즉시 실행 불가.** 그러나 `sync-rsi-ship-matrix.mjs`(상위 입력 생성기)로 재생성하면 다시 돌아간다.
- **레거시 재생성 4스크립트(PM 보강 1)**: `normalize-ship-database` · `build-ship-database` · `build-ship-en` · `sync-ship-prices`. 계약(`canonical-contract.mjs` `LEGACY_REGEN_SCRIPTS`)에 4종 전부 등록됨. `sync-rsi-ship-matrix`는 상위 입력 생성기로 문서화, canonical 생성 경로 참조 금지.
- **권고**: 3.5(소비처 이관 완료 후 2.7)에서 이 4스크립트를 **폐기 또는 봉인**하는 것이 rsi-matrix 재생성만 막는 것보다 확실. **1단계에서는 실제 퇴역 대신 canonical 경로와의 차단 계약만 강화**(라이브 구 경로가 아직 사용 중, PM 지시). 4스크립트 모두 npm 미배선 = CI엔 안 걸리나 운영자 수동 실행 위험 잔존.

## 필드별 소비처 · 제거 위험 · 선행

### priceUsd (D4 제거)
- **소비**: js `main.js:449/516/555`(정렬키·검색·표시)·`ships.js:141/402/648`(카드·비교·모달) · admin `admin.js:20/851/867`(편집·검증 게이트) · functions `cms.js:240/261`·`ships.js:19`(DDL)·`[id].js:33-36`(UPSERT) · i18n `284/782` · tests `ship-overrides-coverage:24`·`visual-regression:68/77`(스냅샷 3종) · scripts `sync-ship-prices`·`normalize:111`(생산자).
- **제거 시**: 정렬 옵션 NaN화, 카드·모달·비교 공백, 검색 누락, admin 검증 실패, 시각 회귀 3종 픽셀 변경.
- **선행**: 정렬 select에서 price 제거 → 표시부 3곳·검색 제거 → admin/cms/DDL/migrations 컬럼 정리 → 픽스처·시각 스냅샷 재생성 → **생산자(sync-prices→normalize) 봉인**. (자산 `ship-prices-usd.json`은 보존 — 별도 공급자용.)

### focus (D7 제거, 대체 분류 없음)
- **소비**: js `ships.js:37-55/136`(**FOCUS_COLORS 배지색 하드의존**)·`ships.js:398`(비교) · `main.js:455/473`(**필터칩·필터 매칭 게이트**)·`35/516/632/672`(조인·검색·플래너) · admin `20/73/460/525` · functions `cms.js:236/257`·`ships.js:14`·`[id].js` · scripts `build-ship-en:126`(**FOCUS_EN mapOrThrow 빌드 게이트**)·`build-ship-database`·`normalize` · tests `ships.spec:117-118`(필터칩 EN 라벨)·`ship-overrides-coverage:23`.
- **제거 시**: 배지색 기본 회색 폴백, 필터칩에서 focus항 소실, `ship.focus===tag` 필터 무효, build-ship-en 빌드 실패.
- **선행**: 배지 색 소스를 tags/신규 category로 재배선 → 필터를 tags 단일화 → build-ship-en focus 요구 제거 → admin/cms/DDL 정리 → ships.spec·기준선 재기준.

### role (D7 — VOLT 편집 분류 제거; Erkul role/career로 사실 대체)
- **소비**: js `ships.js:397/642`(비교·모달 상시 렌더)·`main.js:34/516/593/632`·`search-modal.js:95` · admin `20/72/460/525` · functions `cms.js:235/256`·`ships.js:12`·`[id].js` · scripts `build-ship-en:125`(ROLE_EN mapOrThrow).
- **주의**: `ship.role`만 대상 — leadership/partner-fleets/AI 메시지의 `role`은 **별개 엔티티, 오삭제 금지**.
- **선행**: 모달/비교/카드 role 표시를 Erkul career로 대체 또는 제거 → 검색 제거 → build-ship-en ROLE_EN 제거 → admin/cms/DDL 정리.

### tags — 특히 '미구현' 게이트 (D7 + 게이트 보존)
- **소비**: js `main.js:616-618`(**플래너 릴리스 게이트 `!tags.includes('미구현')`**)·`470-473`(hideUnreleased 필터)·`189`(SHIP_FILTER_ORDER) · `ships.js:461-465`(비교 노트)·필터칩/카드칩 다수 · admin `20/80/459/759-799/845`(태그 셀렉터) · scripts `build-ship-en`(TAG_EN)·생산자 · tests `ships.spec:117-118`.
- **제거 시**: **미구현 함선이 플래너 후보로 노출**(in-concept 함선 부적격 노출), hideUnreleased 무효, build-ship-en 실패.
- **선행**: tags 제거 **전** '미구현' 릴리스 신호를 `implemented`/`erkulStatus`로 이전(확정 처분표 반영). 이후 필터칩·SHIP_FILTER_ORDER·admin 셀렉터·cms/DDL·TAG_EN·생산자·기준선 순차 정리.

### crew (D3 — live.crewSize로 통일)
- **소비**: js `ships.js:400/437-439/645`(비교·리더보드·모달)·`main.js:447/708`(정렬·플래너 분기)·`37`(crew_en 병합) · scripts `build-ship-en`(normalizeCrew) · functions `cms.js:238/259`·`ships.js:16`(DDL) · admin `20`.
- **제거 시**: live 없는 함선 승무원 표시·정렬·리더보드 소실.
- **선행**: 비교/리더보드/정렬/추천을 `live.crewSize`로 재배선 + live 없는 함선 폴백 규칙 확정. ship-en crew·crew_en 병합 제거. DDL/CMS/admin 정리. (사용자 입력 `planner.crew`는 별개 — 유지.)

### cargo (표시 포맷 이관; 플래너 하드게이트 재배선)
- **소비**: js `main.js:619`(**플래너 하드게이트 `getCargoValue>0`**)·`478`(cargoMin 필터)·`448`(정렬)·`691`(플래너 시드) · `ships.js:401/436-439`(비교·리더보드).
- **제거 시**: **전 함선 cargo=0으로 간주 → 플래너 적격 0개 → 추천/피커/그룹 전부 빔.**
- **선행**: `getCargoValue` 소비처를 `live.cargoScu`로 교체, 게이트/필터/정렬/시드 재배선, live 없는 함선 폴백 확정. DDL/CMS/admin 정리. (`planner.cargo` 입력은 별개 — 유지.)

### manufacturer (단축표기 → Erkul 풀네임 + localization)
- **소비**: js `main.js:459-461/471`(**필터 옵션 파생 + 문자열 동등비교 매칭**)·`ships.js:94-101` · scripts `match-erkul-to-volt:16/171`(**MANUFACTURER_CODES 매칭 키**)·`build-ship-database:22/73`.
- **제거 시**: 필터 옵션·선택 상태·저장값 깨짐, Erkul 매칭 실패.
- **선행**: 필터 옵션·Erkul 매칭을 안정적 코드로 분리(표시명↔필터키 디커플). MANUFACTURER_CODES 갱신. DDL/CMS 정리.

### name (표시명 = localization 조인 키)
- **소비**: js `main.js:531`(`getLocalizationValue(ship.name,'ships')`)·`538-551`(표시명)·`492`(검색 랭킹)·`628`(정렬) · scripts `build-ship-en:117-120`(설명 매칭 키) · tests `shipdb-candidates:51`.
- **제거/변경 시**: 한글명·검색 별칭 조용히 소실. CMS `override.name`이 런타임에 덮어써 키가 바뀔 수 있음.
- **선행**: localization 별칭을 name 문자열 → **`ship.id` 키로 재배선**(data/localization·getLocalizationValue·기준선 koName). build-ship-en 매칭 id 기반 이관 검토. CMS name override를 nameKo로 제한 검토.

### erkulName · erkulStatus (D5 — 격리, 삭제 아님)
- **erkulName**: scripts `build-ship-en:117-119`(EN 설명 매칭 1순위 키, 실패 시 throw)·`match-erkul-to-volt:160/174`. **런타임(js/functions) 소비 0.**
  - 선행: 매칭키를 name/localName 단독으로 축소하되 손실 매칭을 `DESCRIPTION_OVERRIDES`·`manual-ship-map.json`으로 보강 → 재실행 missingDesc 0 확인 후 격리.
- **erkulStatus**: tests `shipdb-candidates:46`(**CI 어서션 → 삭제 시 배포 차단**)·scripts `match-erkul-to-volt:60-61/193`(변형 배제). **런타임 소비 0.**
  - 선행: CI 어서션을 대체 신호(live 존재 등)로 교체 → 변형 배제를 canonicalId/신규 플래그로 재배선.

### plannerEligible · canonicalId
- **plannerEligible**: js `main.js:623`(정렬 tiebreak 전용, 게이트 아님) · functions `cms.js:242/263`·DDL · admin `20`. 제거 시 **정렬 순서만 변동**(표시 항목 불변). 저위험.
- **canonicalId**: scripts `match-erkul-to-volt:60-61/154/229`(변형→원본 리다이렉트). **런타임 소비 0.** `erkulStatus='duplicate'`와 쌍 — 함께 처리. (제외 37척 중 7 에디션 별칭 시드로 활용, D8.)

### market.anomalies · mappedFrom (D6 — admin 리포트만)
- **anomalies**: admin `admin.js:235-247/276`(conflictShips 배지) · tests `admin-erkul-sync:144-146`·`erkul-sync-preview:66` · 생산자 `normalize-erkul-market:57/91/107`·`build-ship-live-data:86`·`erkul-sync.js:176-309`.
  - 선행: 생산자 anomalies 로직을 별도 리포트로 격리 **+ 동시에** admin 배지 재배선(한쪽만 제거하면 apply 부활 또는 admin 예외).
- **mappedFrom**: tests `shipdb-candidates:57-58`·`erkul-sync-preview:320/334`(CI 어서션). **프런트 미읽음(출처 표기 전용).** CI 어서션 2종 수정으로 필드 제거 가능. **단 `mergeMappedMarketRows` 병합 로직까지 없애면 수동매핑 구매처/렌탈 소실 — '필드 드롭'과 '병합 로직 드롭' 구분 필수.**

### live-stats top-level (혼재 — 분해)
- **삭제 안전(즉시)**: `sourceVersion`(전 디렉터리 읽기 0, write-only), `source`(모달 라벨은 정적 i18n), `erkulRef`(carry-forward만). → writer + 픽스처만 정리.
- **유지 필수**: `syncedAt`(모달·admin E-1 패널·AI freshness + CI 4종), `erkulLocalName`(**Safe Apply 조인 pivot** + AI 매칭 + admin 배지 — 제거 시 apply 전체 정지).
- **주의**: `erkul-sync` 응답 envelope의 `source`(erkul-sync-preview:153 단언)는 top-level source와 **별개 — 혼동 금지**.

### descriptions 프로비넌스
- **유지 필수**: `en`(EN 모달·검색·build-ship-en 원천), `ko`(KO 모달·검색 — 사용자 노출).
- **재검토**: `koSource`·`translatedAt`(erkul-sync carry-forward:326-327 + apply-ship-description-ko 스킵 판정:71 — EN-불변 재적용 최적화). `enRaw`·`source`(writer 3곳 + `erkul-sync-preview:281-288` deepEqual만 정리하면 저위험). **deepEqual(281-288)은 4필드 중 하나만 빠져도 실패 — 함께 갱신.**

### D1 ship_overrides (CMS 경계 재정의)
- **hidden**(0010): `main.js:783` 소프트삭제 필터 — 제거 시 큐레이션 제외 함선 재등장. **canonical에 hidden 반드시 이관 후** main 필터·admin UI 선재배선.
- **nameKo**(0010): `main.js:538` KO명 우선 — canonical name 해석기가 KO override를 정적 별칭보다 우선하도록 재배선.
- **cargo·size·crew·manufacturer 오버라이드**: `main.js:787`·`admin.js:445` 무조건 병합 — Erkul 사실 오버라이드. CMS 경계 재정의(사실 오버라이드 차단) 시 각 소비처가 기대하는 표현(문자열 vs 숫자)별 formatter 재배선.
- **계약 원자성**: `cms.js:228/250` 매퍼 + `[id].js:33-36` UPSERT 16컬럼 + `0003/0010/ships.js` DDL + CI(`ship-cms-name-hidden`·`ship-overrides-coverage`)를 **하나의 원자적 변경**으로. `ensureShipOverridesTable`의 addColumnIfMissing도 갱신.

### AI 라이브 레이어 (간접)
- `ai-tools.js:87-115`·`chat.js:167-173`은 ship_overrides 미읽음 → override 제거로는 안 깨짐. 그러나 canonical 통합이 `cargoScu·crewSize·size·role·career·hp·purchase·rentals·erkulLocalName` 필드명을 바꾸면 AI 추천/비교 + `ai-chat.test.mjs`(cargoScu 220 등 단언)가 깨짐 → 필드명 보존 또는 동시 재배선.

## 2단계 반영 (계획 갱신 포인트)

- 2.7에 **레거시 재생성 3스크립트(normalize-ship-database·build-ship-database·build-ship-en) 봉인/폐기**를 명시(단순 rsi-matrix 부재 의존 금지).
- 2단계 재배선은 **필드별 원자 커밋** + CI 어서션(40건) 동반 교체.
- `market.anomalies`·`nameKo`·`hidden`은 생산자/필터/admin을 **동시** 처리(한쪽만 제거 시 부활·예외).
