# ShipDB Erkul 재작성 v2 — 실행 계획 (0~3단계)

> **시점 기록 (2026-07-25 확인).** 이 문서는 작성 당시 상태를 남긴 기록이며 현행 운영 문서가 아니다.
> 본문이 현재형으로 서술하는 `data/volt-data.js`의 ships 배열, `data/ship-en.js`,
> `data/ship-prices-usd.json`, 레거시 재생성 스크립트는 **3.5-B에서 물리 삭제**됐다.
> 현재 데이터 구조는 [ship-data-pipeline.md](ship-data-pipeline.md), 운영 절차는
> [OPERATIONS_RUNBOOK.md](OPERATIONS_RUNBOOK.md)를 사실원으로 본다.

- **상태**: 계획 작성 · **실행 미착수(초기화·삭제 금지)** · PM 승인 대기(3단계 교체 게이트)
- **승인 기준 문서**: [`shipdb-erkul-rewrite-audit.md`](shipdb-erkul-rewrite-audit.md) (감사표 + PM 9개 결정)
- **핵심 원칙(PM)**: "기존 DB 비우기"가 아니라 **Erkul 정규 데이터셋 병렬 생성 → 소비처 이관 → 비교 검증 → 승인 후 교체**. 기존 혼재 데이터의 실제 삭제는 3단계 교체(3.5)에서만 일어난다.
- **개정 이력**: 초안을 3-렌즈 적대 검증(결정충실·불변식안전·전제조건완전) 후 개정. blocker 3건(재생성 파이프라인 처분·기준선 스냅샷·1.4 복제) + gap 다수를 명시 게이트로 반영.

## 불변식 (전 단계에서 유지)

1. **1·2단계는 라이브·기존 데이터를 삭제하지 않는다.** 실제 제거는 3.5(PM 승인 후)에서만.
2. **비-라이브 = `main` 안의 병렬 데이터·듀얼리드·미사용 경로**(PM 정련 2026-07-18). 별도 장기 브랜치가 아니라, 새 계층은 main에 커밋하되 소비처가 3.4 전까지 새 경로를 활성화하지 않는다. **3.4까지 라이브 출력은 한 픽셀도 바뀌지 않는다.**
3. **제거 대상 필드를 재생성하는 빌드 파이프라인**을 먼저 무력화하지 않으면 제거가 다음 실행에 재주입된다 — **재주입을 CI 테스트로 차단**(문서 경고 아님)하고, 3.5 제거는 파이프라인 처분 완료를 게이트로 한다.
4. **응답 수준 전후 비교**를 위해 old 경로(기준선 스냅샷 또는 듀얼리드)를 3.1까지 살려둔다. 데이터 수준 diff로 대체하지 않는다.

## 확정 처분표 (PM 9개 결정 적용 후)

| 필드 | 확정 처분 |
|---|---|
| `ship.id` | canonical primary key 유지 (D1) |
| 코어 스펙·`manufacturer·role·career·size` (live) | canonical 사실원 승격 (D1) |
| `crew` | Erkul `live.crewSize`로 공개 기준 통일. 기존 수기값=오버라이드 아님, 차이 리포트로만 (D3) |
| `descriptions.en` / `descriptions.ko` | en=canonical, ko=Erkul EN+sourceEnHash 기준 재작성 localization (D1·D2) |
| KO 표시(`name·nameKo·role/size 라벨·별칭`) | id-키 localization, 기존 한글 그대로 이관 금지 (D2) |
| `priceUsd` | **이번 전환에서 공개 모델·동기화 파이프라인에서 제거**(PM 확정). `ship-prices-usd.json`·`sync-ship-prices.mjs`는 자산 보존하되 파이프라인에서 분리. 신규 가격 공급자 도입은 **별도 마일스톤**, Erkul aUEC와 혼합 금지 (D4) |
| `erkulName` · `erkulStatus` | 삭제 안 함 — operational 메타로 격리(공개 필드 제외) (D5) |
| `market.anomalies` · `mappedFrom` | 관리자 동기화 리포트에만 유지 (D6) |
| `focus` · VOLT 편집 `role`/`tags` 분류 | **전환 1차본에서 제거, 대체 분류를 만들지 않음**(PM 확정). 추후 재도입은 별도 결정 (D7) |
| `tags` '미구현' 게이트 | 표시태그와 분리 — **`implemented`(false 31=unreleased 31 정합)/`erkulStatus`로 재매핑**해 게이트 기능 보존 (D7 부수) |
| Erkul live 없는 컨셉 30척 | **RSI 공식 컨셉 카탈로그로 격리**(PM 2026-07-18 변경, 기존 "완전 제외" 대체). 사실 기준=RSI 공식 Ship Matrix·페이지·PDF만, VOLT 수기 재사용 금지. `status:"concept"`, 별도 탭/필터에서만 노출, 무역플래너·실전 비교·AI 추천 제외. HP·속도·DPS·구매처·시세 등 RSI 비제공 값 추정 금지 (D8) |
| 중복 에디션 7척 | 정식 live 함선의 별칭/리다이렉트만 유지(`canonicalId` 시드). canonical 미포함 (D8) |
| Railen | Erkul live 데이터 존재 → 컨셉 아님, **live canonical 219에 유지** (D8) |
| `computePreviewHash`·Safe Apply | 새 스키마로 이관 + cutover 시 재기준선 + 전후 비교 (D9) |
| `implemented` · `hidden` | operational 큐레이션 유지 |
| `rsiUrl` | 유지-operational (참조 링크) |
| `plannerEligible` | 삭제(정렬 tiebreak 전용) 또는 tiebreak 로직으로 흡수 — 3.5 범위 명시 |
| `cargo`(플래너 하드게이트) | 게이트를 `live.cargoScu` 기반으로 재배선 |
| top-level `{source,sourceVersion}` | 삭제 (미소비) |

## 0단계 — 착수 게이트 (제거·격리 전 필수)

이 게이트를 통과하기 전에는 어떤 격리·제거·소비처 변경도 금지한다.

| # | 게이트 | 근거 |
|---|---|---|
| 0.1 | **전체 스코프 재grep** — 모든 "미사용/삭제/격리" 판정을 `js/ + functions/ + admin/ + tests/ + scripts/`에서 재확인 | 검증 정정 5(js/만 grep한 방법론 결함) |
| 0.2 | **기준선 스냅샷(확장, PM 조건)** — 원본 데이터 **파일 해시 + 레코드 수 + ID 목록 + 공개 화면 주요 필드** + (가능 범위) API·CMS·AI·검색 응답을 고정. 재현 가능한 캡처 스크립트로 커밋(3.1 비교의 old 축) | blocker B2 + PM 조건 |
| 0.3 | **병렬 경로 전략 확정** — 별도 브랜치가 아니라 main 내 병렬 데이터·듀얼리드·미사용 경로. 3.4까지 소비처 미활성 | 불변식 2(PM 정련) |
| 0.4 | **파이프라인 인벤토리 + CI 차단 테스트(PM 조건)** — `normalize-ship-database`·`sync-ship-prices`·`build-ship-en`의 필드 주입 지점 확정 + **Erkul 정규 외 필드가 공개 canonical에 재주입되면 CI가 실패**하는 테스트 작성 | blocker B1 + PM 조건 |

## 1단계 — Erkul 정규 데이터셋 **병렬 생성** (기존 무변경)

새 3계층 데이터셋을 별도 파일/네임스페이스로 생성. 기존 `volt-data.js`·`ship-en.js`·소비처는 **한 줄도 건드리지 않는다**.

| # | 작업 |
|---|---|
| 1.1 | **Canonical 생성** — Erkul live 레이어(`ship-live-stats.js`·`ship-market.js`)만 사실원으로 읽어 `ship.id` 키 레코드 생성. crew=`live.crewSize`(D3), role/career/size/manufacturer=Erkul. priceUsd·VOLT focus/tags 분류 **미포함**(D4·D7). **생성기는 `volt-data.js`·`ship-prices-usd.json`·`rsi-ship-matrix-index.json`을 사실원으로 읽지 않음**(PM 보강 2, CI 강제) |
| 1.2 | **공개 목록 확정(PM 보강 2)** — 선정 기준 = **Erkul live 레코드 존재(`hasLive`)**, `erkulStatus='matched'` 아님. 정확히 219척(railen 포함 — unreleased·implemented:false지만 live 존재). 제외 37=별칭 7(중복 에디션, `canonicalId` 시드)+미출시 30(no-live). CI로 219/30/7·railen 고정 |
| 1.3 | **Localization 재작성** — `descriptions-ko.json` 모델을 전 KO 필드로 확장. Erkul EN 원문+`sourceEnHash` 기준으로 KO 재생성(기존 한글 그대로 이관 금지, D2). en 없으면 ko=null. *참고: 기존 `translations[id].ko`는 이미 D2 요건(Erkul-id 키+sourceEnHash) 충족 모델이므로 stale hash 범위만 갱신, 전량 재번역 아님* |
| 1.4 | **Operational 복제(격리)** — `erkulName`/`erkulStatus`를 신규 operational 네임스페이스로 **복제**(old volt-data 잔존, 실제 제거는 2.6 재배선 후 3.5에서만). `anomalies`는 admin 리포트 전용 구조로. implemented/hidden 큐레이션 (D5·D6) |
| 1.5 | **crew 차이 리포트**(D3) — 기존 수기 crew vs `live.crewSize` diff를 마이그레이션 기록으로(38~77척) |

- **검증**: 새 데이터셋 자체 정합성 — 219 id 매칭, KO null 규칙, 스키마 형태(`computePreviewHash` 호환).
- **불변식**: 기존 소비처 무변경 → 라이브·CI 무영향. 병렬 파일 추가만.

## 2단계 — 소비처 이관 (병존, 기준선 대비 비교 가능)

소비처가 새 스키마를 읽도록 재배선하되, 0.2 기준선 스냅샷과 대비 가능하게 스테이징에서 진행. 기존 데이터는 삭제하지 않는다.

| # | 작업 |
|---|---|
| 2.1 | 프런트 렌더/검색 이관(canonical+localization), `mergeShipEn` 대체 — `js/ships.js`·`main.js`·`search-modal.js` |
| 2.2 | AI 도구 이관 + **공개목록(219)만 참조 강제**(37척 스펙·비교·AI 제외, D8) — `ai-tools.js`·`chat.js` |
| 2.3 | **CMS 편집 경계 재정의**(Erkul 사실 오버라이드 차단, 편집을 localization/operational로 국한) + **`admin.js` anomalies 동기화 배지 리더 재배선**(D6) — `cms.js`·`admin.js`·마이그레이션 |
| 2.4 | **priceUsd 소비처 제거**(D4) — 카드·모달·비교·정렬에서 제거. *데이터 파일·생성기는 보존* |
| 2.5 | **VOLT 편집 분류 제거**(D7) — focus 필터·배지 대체(Erkul career 매핑 또는 UI 재설계) + **tags '미구현' 게이트를 `implemented`/`erkulStatus`로 재배선**(플래너 자격 회귀 방지) + **cargo 하드게이트를 `live.cargoScu`로 재배선** |
| 2.6 | **격리 전제조건 실행** — `build-ship-en.mjs` 매칭키를 id↔erkulLocalName로 재배선, `shipdb-candidates.test.mjs` 어서션을 implemented 기반으로 교체(`anomalies·mappedFrom` 포함) |
| 2.7 | **레거시 재생성 4스크립트 퇴역**(blocker B1, PM 위치확정) — `normalize-ship-database`·`build-ship-database`·`build-ship-en`·`sync-ship-prices`가 제거 필드(priceUsd·focus·tags·crew)를 더 이상 산출하지 않도록 폐기/봉인(상위 입력 `sync-rsi-ship-matrix` 포함). **소비처 이관 완료 후 여기서 수행**(1단계는 차단 계약만). **Safe Apply 이관**(D9): `computePreviewHash` 새 스키마 + cutover 재기준선 + `erkul-sync` carry-forward(`koSource·translatedAt`) 새 스키마 매핑 |
| 2.8 | 37척 기존 공개 URL 처리 — 중복 에디션 리다이렉트, 미출시 보관 카탈로그 경로/404 (D8) |

- **검증**: 각 소비처가 새 스키마로 정상 동작. 스모크 갱신·통과(`ships-search-live-desc`·`admin-erkul-sync`·`ai-chat`·`erkul-sync-preview` + **플래너 자격 스모크 신규**).

## 3단계 — 비교 검증 → 승인 → 교체

| # | 작업 |
|---|---|
| 3.1 | **전후 비교 리포트**(D9) — 0.2 기준선 vs 신규: 219척 각 필드 + 공개 API·CMS·AI·검색 **응답** diff, ID 매핑, **플래너 자격**, **37척이 스펙·비교·AI·검색 인덱스에서 배제됨** 확인 |
| 3.2 | **KO 번역 완전성 게이트(PM 확정)** — 전환 시점 **모든 활성 Erkul 함선에 KO 번역 필수**. 번역 누락을 기존 한글 재사용이나 무음 영어 폴백으로 넘기지 않고 **공개 전환을 막는 조건**으로 설정(누락 1건이라도 있으면 cutover 차단) |
| 3.3 | **동기화 drift 방지** — 이관 기간 sync 동결 또는 교체 직전 canonical 재스냅샷·재비교 |
| 3.4 | **게이트 + PM 승인** — `npm run check`·Functions·Playwright·CI 통과 → 비교 리포트 검토 후 PM 승인. **여기까지 초기화·삭제 금지** |
| 3.5 | **교체(삭제 실행)** — 승인 후 기존 혼재 데이터 제거. 각 제거는 **① 재생성 파이프라인이 해당 필드를 더 이상 산출 안 함(2.7 완료) ② 잔존 라이브 리더 0(전체 재grep) 두 게이트 통과 후에만**. 단일 커밋으로 revert 가능하게. main 반영 |

## 착수 전제조건 (감사에서 확정 — 위 단계 게이트로 배치)

1. **전체 스코프 재grep** → 0.1(착수 전) + 3.5(제거 전) 이중 게이트.
2. **`erkulName` 격리 전 재배선** → 2.6(build-ship-en 매칭키). 1.4는 복제만.
3. **`erkulStatus` 격리 전 재배선** → 2.6(test 어서션 교체).
4. **번역이관 원자성** → 리더 재배선(2.1)이 물리 제거(3.5)보다 선행 + 3.5는 "잔존 리더 0 재grep" 게이트로 보장(같은 커밋 대신 순서+게이트로 등가 달성).
5. **스키마 형태 보존** → live 코어 스펙 형태 변경 시 previewHash 불일치로 apply 거부(1.1 호환 유지, 2.7 재기준선).
6. **게이트 통과 후 main** → 3.4 이후에만.

## 세부 결정 (PM 2026-07-18 확정)

| 항목 | 확정 |
|---|---|
| `focus` 등 편집 분류 | 전환 1차본에서 제거. **대체 분류를 만들지 않음** |
| Erkul live 없는 컨셉 30척 | **RSI 공식 컨셉 카탈로그로 격리**(2026-07-18 변경). RSI Ship Matrix 사실원, 별도 탭/필터, 플래너·비교·AI 제외, RSI 비제공 값 추정 금지. 중복 에디션 7·Railen은 별개(별칭/live 유지) |
| `priceUsd` | 이번 전환에서 공개 모델·동기화 파이프라인에서 제거. **신규 가격 공급자 도입은 별도 마일스톤** |
| 한국어 재번역 | 전환 시점 **모든 활성 Erkul 함선에 적용**. 번역 누락은 기존 한글 재사용·무음 영어 폴백으로 넘기지 않고 **공개 전환을 막는 조건**으로 설정 |

## 보고 게이트 (PM 지시)

0단계 종료 후 **기준선·파이프라인 차단·ID 매핑 결과만 먼저 보고**하고, PM 검토 후에야 1단계(병렬 Erkul 데이터셋 생성)를 진행한다.
