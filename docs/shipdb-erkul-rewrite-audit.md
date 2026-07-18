# ShipDB Erkul 재작성 v2 — 현행 필드 전수 감사 (승인 기록)

- **상태**: 감사 완료 · **PM 승인(2026-07-18)** · 코드·데이터 미변경
- **목적**: Erkul을 단일 사실 기준으로 하는 3계층 재구성 착수 전, 현행 필드의 출처·사용처·처분을 전수 분류한다. 이 문서가 초기화의 승인 기준이며, 실행 계획은 [`shipdb-erkul-rewrite-plan.md`](shipdb-erkul-rewrite-plan.md)에 있다.
- **방법**: 12-에이전트 병렬 매핑(8 계층/소비처) → 통합표 합성 → 3-렌즈 적대 검증(삭제안전·출처정확·누락). 검증 정정 5건은 모두 재확인함.
- **관련**: [`shipdb-live-data-layer.md`](shipdb-live-data-layer.md), [`shipdb-description-translation.md`](shipdb-description-translation.md), [`ship-data-pipeline.md`](ship-data-pipeline.md)

## 요약

| 항목 | 값 |
|---|---|
| 함선 수 (volt-data.ships) | 256 |
| 감사 필드행 / 계층 | 40 / 7 |
| Erkul live 정합 / live 없음 | 219 / 37 |
| 검증 정정 (blocker) | 5 (2) |
| PM 결정 항목 | 9 (전부 판정 완료) |

## 목표 3계층 스키마

모든 계층의 primary key = `ship.id`. 사실은 canonical만, 표시는 localization, 운영은 metadata — 세 계층이 한 레코드에 섞이지 않게 분리한다.

| 계층 | 역할 | 포함 |
|---|---|---|
| **① Canonical** | Erkul 단일 사실원 | 스펙(`speeds·hp·cargoScu·crewSize·dimensions·sizeRaw·fuel·insurance`), 분류(`manufacturer·role·career·size`), 시세(`purchase·rentals`), 원문(`descriptions.en`) |
| **② Localization** | Erkul-id 키 표시 번역 | KO 설명(`translations[id].ko`), KO/EN 라벨 표시부, 표시명·별칭(`name·nameKo·ships[]`), 각 항목에 `sourceEnHash` stale 감지 동반 |
| **③ Operational** | 동기화·매칭·큐레이션 | `syncedAt·erkulLocalName·erkulRef`, `implemented`·매칭 상태(`erkulName·erkulStatus`), `hidden` 소프트삭제, CMS `ship_overrides` |

## 필드별 감사표

처분: `유지-canonical` / `유지-operational` / `번역이관` / `삭제` / `재검토(분해·PM결정)`. **[정정]** = 초기 합성을 적대 검증이 뒤집은 행.

### A · `volt-data.ships[]` — 256척 편집형 혼재 (초기화 핵심 대상)

| 필드 | 출처 | 처분 | 위험 | 근거 |
|---|---|---|---|---|
| `id` | VOLT편집 | 유지-canonical | low | 전 계층(live·market·ship-en·localization·D1) 조인 유일 앵커 |
| `name` | VOLT편집 | 재검토 | med | EN 표시명(이관) + localization 조인키 겸함 → id 재키잉 후 표시부 이관 |
| `manufacturer` | VOLT편집 | 재검토 | med | 단축 표기(Anvil vs Anvil Aerospace). Erkul 풀네임 대체 + localization. 필터 UI가 단축값에 묶임 |
| `rsiUrl` | VOLT편집 | 유지-operational | low | RSI 공식 참조 링크(스펙·번역 아님). 빈 값 8건 매트릭스 폴백 |
| `role` | VOLT편집 | 재검토 | high | KO 택소노미(Erkul 불일치). 사실은 Erkul `role/career`, KO 라벨만 이관 |
| `focus` | VOLT편집 | 재검토 | high | Erkul 대응 **없는** VOLT 대분류(배지·필터·플래너 의존). **[정정]** RSI matrix 파생경로 존재(dormant) |
| `size` | VOLT편집 | 재검토 | high | KO('소형') vs Erkul S1~S6. 사실은 canonical, 라벨만 이관 |
| `crew` | **VOLT편집 [정정]** | 재검토 | high | **[정정]** 파생 아님 → 독립 수기값. `live.crewSize`와 38~77척 충돌(freelancer 1↔4, caterpillar 5↔4, 양방향) |
| `cargo` | 파생 | 재검토 | high | 219중 ~214척 `cargoScu` 정합(진짜 파생). 표시 포맷만 이관. **플래너 하드게이트**(cargo>0) 주의 |
| `description` | VOLT편집 | 재검토 | high | matched척은 `live.descriptions.ko` 중복(삭제후보). live 없는 37척은 유일 설명원 |
| `tags` | VOLT편집 | 재검토 | high | '미구현'=릴리스/플래너 게이트, 표시태그=이관, 임의태그=삭제. **[정정]** '미구현' 출처=RSI production_status |
| `priceUsd` | **외부 API [정정]** | 재검토 | med | **[정정]** VOLT 수기 아님 → SC Wiki API(`ship-prices-usd.json`, retrievedAt 2026-05-18, 184/195 정확일치). "검증불가라 삭제" 전제 거짓 |
| `implemented` | VOLT편집 | 유지-operational | low | 플래너 자격 게이트. false 31척 = erkulStatus unreleased 31 정합 |
| `plannerEligible` | VOLT편집 | 재검토 | low | 게이트 아님 — 정렬 tiebreak 전용(실 게이트=implemented+tags+cargo). 자체평가 삭제후보 |
| `erkulName` | 파생 | 삭제(전제조건) → **PM: 격리(D5)** | med | **[정정]** 런타임 미사용이나 `build-ship-en.mjs` 1순위 매칭키(:117/119). 삭제 시 라이브 ship-en.js 재생성 파손 → PM 결정으로 삭제 대신 operational 격리 |
| `erkulStatus` | 파생 | 삭제(전제조건) → **PM: 격리(D5)** | med | **[정정]** CI 어서션(`shipdb-candidates.test.mjs:46`). 삭제 시 CI 차단 → PM 결정으로 삭제 대신 operational 격리 |
| `canonicalId` | 파생 | 재검토 | med | 에디션/번들 → 원본 dedup 수기 매핑(7척). 재작성 dedup에 필요할 수 있음 |

### B · `ship-live-stats.js` · `ship-market.js` — Erkul canonical (219 엔트리)

| 필드 | 출처 | 처분 | 위험 | 근거 |
|---|---|---|---|---|
| 코어 스펙 `{size,crewSize,cargoScu,hp,massKg,speeds,rotation.pyr,dimensions,sizeRaw,fuel,insurance,damageReduction}` | Erkul | 유지-canonical | low | Erkul 원본 스펙 단일 사실원. dimensions는 sizeRaw 휴리스틱 파생. **형태 변경 시 previewHash 불일치로 apply 거부** — 형태 보존 |
| `manufacturer · role · career` | Erkul | 유지-canonical | med | Erkul 원본 분류. volt-data 단축 manufacturer·KO role을 이 값으로 대체 |
| market `{purchase,rentals}.{shop,location,price,available,unavailable}` | Erkul | 유지-canonical | low | Erkul 시세 사실값(구매가·대여가·구매/렌탈처·재고). 인게임 획득 판정·모달 원천 |
| `descriptions.en` | Erkul | 유지-canonical | low | 정제 EN 산문 + KO 번역 source-of-truth(sourceEnHash 기준) |
| `descriptions.ko` | 번역 | 번역이관 | med | 물리적으로 live에 있으나 정의는 `descriptions-ko.json` → localization 소유 |
| `syncedAt · erkulLocalName · erkulRef` | Erkul | 유지-operational | low | 동기화 시각 + 재sync 조인키. erkulLocalName 제거 시 재동기화 파손 |
| `descriptions.{enRaw,source,koSource,translatedAt}` | 파생 | 재검토 | low | **[정정]** source 라벨은 삭제 무해, koSource·translatedAt은 `erkul-sync.js` carry-forward 소비 |
| `rotation.{boosted*,current*}` · `countermeasures.{decoy,noise}` | 파생 | 재검토 | low | rotation 6필드 항상 null(A-2 결정). countermeasures 수집되나 미렌더 |
| market `anomalies[]` · `mappedFrom` | 파생 | 재검토 | low | **[정정]** 미사용 아님 → `admin.js` 동기화 배지(Hammerhead conflict) + CI 어서션 소비 |
| top-level `{source,sourceVersion}` | 파생 | 삭제 | low | 하드코딩 라벨 상수, 미소비. re-sync가 재기록 — 무영향 |

### C · `ship-en.js` · `volt-localization.js` · `descriptions-ko.json` — 표시 번역 계층

| 필드 | 출처 | 처분 | 위험 | 근거 |
|---|---|---|---|---|
| ship-en `role_en · focus_en · tags_en` | 번역 | 번역이관 | low | 순수 EN 표시 라벨. 배지색은 KO focus 계산 → focus_en 이관 안전 |
| ship-en `size_en · crew_en` | 파생 | 재검토 | med | 사실값 포함(crew_en='2-4'). volt-data KO→EN 파생이라 Erkul과 이중 사실원 상충 |
| ship-en `description_en` | Erkul | 재검토 | med | RSI 공식 + Erkul live + 수동보정 혼합. 런타임은 이미 live.en 우선 |
| `VOLT_LOCALIZATION.ships[]` (KO 별칭 227키) | 번역 | 재검토 | med | 키가 name(영문) — 2키 매칭실패·31척 결측. id 재키잉 + 결측 보완이 이관 조건 |
| descriptions-ko `translations[id].ko` | 번역 | 번역이관 | low | **모범 구현.** Erkul-id 키(211/211), en 없으면 ko=null(임의생성 금지). 지시서 v2와 정합 |
| descriptions-ko `sourceEnHash` | 파생 | 유지-operational | low | stale 오역 방지 핵심(211/211). 이관 필드에도 이 모델 동반 |

### D · D1 `ship_overrides` — CMS 편집 오버라이드

| 필드 | 출처 | 처분 | 위험 | 근거 |
|---|---|---|---|---|
| override 사실필드 `{name,manufacturer,role,focus,size,crew,cargo,priceUsd,implemented,plannerEligible,tags,description}` | VOLT편집 | 재검토 | med | Erkul 사실 필드(cargo·size·crew)까지 덮어씀 → "CMS 사실값 수기 수정 불가"와 충돌. 오버라이드도 분해 동반 |
| override `nameKo` | 번역 | 재검토 | low | KO 표시명 = localization 자산. 계층은 localization, CMS 편집 경로(D1) 보존 |
| override `hidden` | VOLT편집 | 유지-operational | low | 소프트삭제 큐레이션. VOLT 운영 결정 |

### E · 누락 계층 — 검증이 추가 발견

| 필드 | 출처 | 처분 | 근거 |
|---|---|---|---|
| `data/ship-prices-usd.json` | 외부 API | 재검토 | priceUsd 실제 출처(SC Wiki API, source·retrievedAt). sync-ship-prices.mjs 생성 |
| `data/rsi-ship-matrix-index.json` | 외부 | 재검토 | RSI matrix — focus·tags·description_en 파생 원천. 현재 파일 부재로 dormant |
| `VOLT_LOCALIZATION.manufacturers` | 번역 | 재검토 | 제조사 KO 카테고리 — 존재하나 미소비. manufacturer 분리 시 재사용 |
| 빌드 프로비넌스: `normalize-ship-database` · `sync-ship-prices` · `build-ship-en` | 파생 | 재검토 | volt-data 필드가 어느 외부 소스에서 재생성되는지 결정. Erkul 3계층으로는 priceUsd·focus·tags 진짜 출처 미포착 |

## 적대 검증이 정정한 5건 (전부 재확인)

1. **⛔ `crew`** — `파생(Erkul 재포맷)` → **독립 수기값**. parseLargestNumber(crew) ≠ live.crewSize가 38척(런타임 표시 기준, 단순 파싱 77척). freelancer 1↔4·caterpillar 5↔4 양방향.
2. **⛔ `priceUsd`** — `VOLT 수기·freshness 미검증` → **외부 API 동기화값**. `ship-prices-usd.json`(SC Wiki API, retrievedAt 2026-05-18) 실존, 184/195 정확일치.
3. **⚠ `erkulName·erkulStatus`** — "미사용, 삭제 안전" → **삭제 전제조건 필수**. build-ship-en 매칭키 / CI 어서션. 재배선·테스트 교체 없이 삭제 시 빌드·CI 파손.
4. **⚠ `market.anomalies·mappedFrom`** — "미사용, CMS 미노출" → **admin.js 동기화 배지 + CI 어서션 소비**. Hammerhead conflict 카운트 노출 중.
5. **⚠ 방법론** — 초기 매핑이 `js/`만 grep → `admin/·tests/·scripts/build-*.mjs` 소비처 체계적 누락. 삭제 승인 전 전체 재grep 강제.

## PM 판정 (2026-07-18, 9개 결정 — 승인 기록)

1. **Erkul = 공개 ShipDB 유일 사실 기준.** `ship.id` 유지, Erkul 원문과 KO 표시 레이어 분리.
2. **KO 지원 유지하되 기존 한글 필드를 그대로 이관하지 않음.** Erkul EN 원문 + `sourceEnHash` 기준으로 KO 번역 레이어 **재작성**.
3. **`crew` = Erkul live 값을 공개 화면 기준값으로 통일.** 기존 수기값은 런타임 오버라이드로 남기지 말고 **차이 리포트/마이그레이션 기록으로만** 보관.
4. **`priceUsd` = SC Wiki 외부 데이터이므로 ShipDB 정식 모델에서 제거.** 추후 필요 시 별도 가격 공급자 기능으로 분리, Erkul 스펙·인게임 aUEC와 **혼합 금지**.
5. **`erkulName`·`erkulStatus` 삭제하지 않음.** 공개 필드 아닌 **수집·매칭·CI용 운영 메타데이터로 격리**.
6. **`market.anomalies`도 ShipDB 데이터 아님(동기화 실행 결과)** → 관리자 동기화 리포트에만 유지.
7. **role·focus·tags 등 Erkul 사실값 아닌 VOLT 편집 분류는 초기 전환본에서 제거.** 추후 별도 분류 체계·근거 정의 후 "VOLT 편집 정보"로만 재도입.
8. **Erkul live 없는 37척은 현행 ShipDB 기준 목록에서 제외.** 중복 에디션 7 → 정식 Erkul 함선의 별칭/리다이렉트로 정리. ~~미출시 함선 → 보관 카탈로그로 격리~~ → **[2026-07-18 변경] 30척 → RSI 공식 카탈로그로 격리**(RSI Ship Matrix 사실원, `catalogStatus: concept 28 · flight-ready 2`, 별도 탭/필터, 플래너·비교·AI 제외, RSI 비제공 값 추정 금지). 상세는 [`shipdb-rsi-official-audit.md`](shipdb-rsi-official-audit.md). Railen은 live 존재 → canonical 유지.
9. **`computePreviewHash`·Safe Apply를 새 스키마에 맞춰 함께 이관**, 전환 전후 ID 매핑·공개 API·CMS·AI·검색·스모크 테스트를 모두 비교 검증.

**실행 순서 원칙(PM):** "기존 DB 비우기"가 아니라 **Erkul 정규 데이터셋 병렬 생성 → 소비처 이관 → 비교 검증 → 승인 후 교체.** 초기화·삭제는 승인된 실행 계획 이전까지 금지.
