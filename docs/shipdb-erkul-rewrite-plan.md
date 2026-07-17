# ShipDB Erkul 재작성 v2 — 실행 계획 (0~3단계)

- **상태**: 계획 작성 · **실행 미착수(초기화·삭제 금지)** · PM 승인 대기(3단계 교체 게이트)
- **승인 기준 문서**: [`shipdb-erkul-rewrite-audit.md`](shipdb-erkul-rewrite-audit.md) (감사표 + PM 9개 결정)
- **핵심 원칙(PM)**: "기존 DB 비우기"가 아니라 **Erkul 정규 데이터셋 병렬 생성 → 소비처 이관 → 비교 검증 → 승인 후 교체**. 기존 혼재 데이터의 실제 삭제는 3단계 교체(3.5)에서만 일어난다.
- **개정 이력**: 초안을 3-렌즈 적대 검증(결정충실·불변식안전·전제조건완전) 후 개정. blocker 3건(재생성 파이프라인 처분·기준선 스냅샷·1.4 복제) + gap 다수를 명시 게이트로 반영.

## 불변식 (전 단계에서 유지)

1. **1·2단계는 라이브·기존 데이터를 삭제하지 않는다.** 실제 제거는 3.5(PM 승인 후)에서만.
2. **1·2단계는 비-라이브 브랜치**에서 수행하고, main 반영은 3.4 승인 이후에만. 3.1 비교는 스테이징 배포로 수행.
3. **제거 대상 필드를 재생성하는 빌드 파이프라인**을 먼저 무력화/갱신하지 않으면 제거가 다음 실행에 재주입된다 — 3.5 제거는 파이프라인 처분 완료를 게이트로 한다.
4. **응답 수준 전후 비교**를 위해 old 경로(기준선 스냅샷 또는 듀얼리드)를 3.1까지 살려둔다. 데이터 수준 diff로 대체하지 않는다.

## 확정 처분표 (PM 9개 결정 적용 후)

| 필드 | 확정 처분 |
|---|---|
| `ship.id` | canonical primary key 유지 (D1) |
| 코어 스펙·`manufacturer·role·career·size` (live) | canonical 사실원 승격 (D1) |
| `crew` | Erkul `live.crewSize`로 공개 기준 통일. 기존 수기값=오버라이드 아님, 차이 리포트로만 (D3) |
| `descriptions.en` / `descriptions.ko` | en=canonical, ko=Erkul EN+sourceEnHash 기준 재작성 localization (D1·D2) |
| KO 표시(`name·nameKo·role/size 라벨·별칭`) | id-키 localization, 기존 한글 그대로 이관 금지 (D2) |
| `priceUsd` | ShipDB 모델·소비처에서 **분리**. `ship-prices-usd.json`·`sync-ship-prices.mjs`는 **보존**(향후 별도 공급자용), Erkul aUEC와 혼합 금지 (D4) |
| `erkulName` · `erkulStatus` | 삭제 안 함 — operational 메타로 격리(공개 필드 제외) (D5) |
| `market.anomalies` · `mappedFrom` | 관리자 동기화 리포트에만 유지 (D6) |
| `focus` · VOLT 편집 `role`/`tags` 분류 | 초기 전환본에서 제거, 추후 별도 분류 체계로만 재도입 (D7) |
| `tags` '미구현' 게이트 | 표시태그와 분리 — **`implemented`(false 31=unreleased 31 정합)/`erkulStatus`로 재매핑**해 게이트 기능 보존 (D7 부수) |
| Erkul live 없는 37척 | 공개 기준 제외. 중복 에디션→별칭/리다이렉트(기존 `canonicalId` 7척을 시드로), 미출시→보관 카탈로그. live 등록 전 스펙·비교·AI 제외 (D8) |
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
| 0.2 | **응답 기준선 스냅샷** — 219척 공개 API·CMS·AI·검색 응답 + ID 매핑을 캡처(3.1 비교의 old 축) | blocker B2 |
| 0.3 | **브랜치 확보** — 1·2단계 작업 브랜치 분리, 스테이징 배포 경로 확인 | 불변식 2 |
| 0.4 | **파이프라인 인벤토리** — `normalize-ship-database`·`sync-ship-prices`·`build-ship-en`이 재생성하는 필드 목록 확정 | blocker B1 |

## 1단계 — Erkul 정규 데이터셋 **병렬 생성** (기존 무변경)

새 3계층 데이터셋을 별도 파일/네임스페이스로 생성. 기존 `volt-data.js`·`ship-en.js`·소비처는 **한 줄도 건드리지 않는다**.

| # | 작업 |
|---|---|
| 1.1 | **Canonical 생성** — 최신 Erkul snapshot에서 `ship.id` 키 사실 레코드. crew=`live.crewSize`(D3), role/career/size/manufacturer=Erkul. priceUsd·VOLT focus/tags 분류 **미포함**(D4·D7) |
| 1.2 | **공개 목록 확정** — Erkul live 219척만. 37척 분리: 중복 에디션→별칭/리다이렉트 맵(**기존 `canonicalId` 7척 매핑을 시드로 대조**), 미출시→보관 카탈로그(AI/CMS/검색이 읽지 않는 경로)(D8) |
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
| 2.7 | **재생성 파이프라인 처분**(blocker B1) — `normalize-ship-database`·`sync-ship-prices`가 제거 필드(priceUsd·focus·tags·crew)를 더 이상 산출하지 않도록 갱신/중단. **Safe Apply 이관**(D9): `computePreviewHash` 새 스키마 + cutover 재기준선 + `erkul-sync` carry-forward(`koSource·translatedAt`) 새 스키마 매핑 |
| 2.8 | 37척 기존 공개 URL 처리 — 중복 에디션 리다이렉트, 미출시 보관 카탈로그 경로/404 (D8) |

- **검증**: 각 소비처가 새 스키마로 정상 동작. 스모크 갱신·통과(`ships-search-live-desc`·`admin-erkul-sync`·`ai-chat`·`erkul-sync-preview` + **플래너 자격 스모크 신규**).

## 3단계 — 비교 검증 → 승인 → 교체

| # | 작업 |
|---|---|
| 3.1 | **전후 비교 리포트**(D9) — 0.2 기준선 vs 신규: 219척 각 필드 + 공개 API·CMS·AI·검색 **응답** diff, ID 매핑, **플래너 자격**, **37척이 스펙·비교·AI·검색 인덱스에서 배제됨** 확인 |
| 3.2 | **KO 폴백 검증** — 번역 없어도 EN fallback 정상(D2). 번역 누락=정상 |
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

## 실행 중 세부 결정 (남은 것)

- **focus 대체 방식**(D7) — Erkul `career` 매핑 vs 필터/배지 UI 재설계.
- **37척 보관 카탈로그 위치**(D8) — 별도 데이터 파일 vs gitignore 아카이브(AI/CMS 미참조 경로 필수).
- **가격 공급자 분리 시점**(D4) — priceUsd 모델 제거는 이번, 별도 공급자 기능은 "추후 필요 시"(자산 보존).
- **KO 번역 재생성 물량**(D2) — stale hash 범위 갱신 vs 확장 필드 신규 번역 방식.
