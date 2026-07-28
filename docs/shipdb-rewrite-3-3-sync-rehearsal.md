# ShipDB Erkul 재작성 v2 — 3.3 동기화 연결 리허설 리포트

> **시점 기록 (2026-07-25 확인).** 이 문서는 작성 당시 상태를 남긴 기록이며 현행 운영 문서가 아니다.
> 본문이 현재형으로 서술하는 `data/volt-data.js`의 ships 배열, `data/ship-en.js`,
> `data/ship-prices-usd.json`, 레거시 재생성 스크립트는 **3.5-B에서 물리 삭제**됐다.
> 현재 데이터 구조는 [ship-data-pipeline.md](ship-data-pipeline.md), 운영 절차는
> [OPERATIONS_RUNBOOK.md](OPERATIONS_RUNBOOK.md)를 사실원으로 본다.

- **목적(PM)**: 3.5 실전 전환 전, **Erkul 동기화 → canonical 재생성 → Safe Apply 미실행 preview**까지의 파이프라인 정합을 확인하고, **레거시 재생성 스크립트가 canonical을 재주입하지 못함**을 재확인한다. 데이터 삭제·플래그 ON은 하지 않는다.
- **집행**: `tests/functions/shipdb-3-3-sync-rehearsal.test.mjs`(3건) + 기존 계약 `shipdb-canonical-contract.test.mjs`·`erkul-sync-preview.test.mjs`.
- **결과**: 전 게이트 통과 — 파이프라인 결정론적, 레거시 격리 유효, preview 로직 무결.

## 파이프라인 체인 (전환 시 실전 경로)

```
Erkul 라이브 fetch ──▶ ship-live-stats.js · ship-market.js   (Erkul 사실 레이어; 유일 사실원)
        │                        │
        │ (Safe Apply preview)   │ build-canonical.mjs (화이트리스트, 금지필드 원천 배제)
        ▼                        ▼
  computePreviewHash       data/canonical/ships-canonical.json (219)
  buildSyncPreview          + localization-ships.json / operational-ships.json
  (apply 미실행)            + ships-rsi-official.json / localization-rsi-official.json (RSI 공식 30/29)
```

- canonical의 **사실원은 Erkul live 레이어(ship-live-stats.js·ship-market.js)뿐**. `build-canonical.mjs`가 `volt-data.js`·`ship-prices-usd.json`·`rsi-ship-matrix-index.json`을 사실원으로 읽지 않음(계약 강제).

## 검증 1 — 재생성 결정론성(reproducibility)

- 4개 생성기(`build-canonical`·`build-localization`·`build-operational`·`build-rsi-official`)를 HEAD에서 재실행.
- **결과**: 변경은 5개 파일의 `generatedFromCommit`(HEAD 스탬프) **1줄뿐**, 실데이터 diff 0. → 동일 입력 → 동일 canonical(스탬프 제외). 리허설용 재생성은 `git checkout`으로 복원.
- CI 고정: `shipdb-3-3-sync-rehearsal` 1번 테스트 — canonical 각 레코드의 `manufacturer/role/career/size/crewSize/cargoScu/hp/massKg/descriptions.en/market.purchase`가 live 레이어와 **정확 일치**(드리프트·수기 편집 0). 즉 canonical은 항상 live에서 파생됨을 보장.

## 검증 2 — 레거시 재주입 차단(isolation)

- 레거시 재생성 스크립트 4종(`normalize-ship-database`·`build-ship-database`·`build-ship-en`·`sync-ship-prices`)과 상위 입력 생성기(`sync-rsi-ship-matrix`)는 **canonical 경로를 기록하지 않음**.
- CI 고정: `shipdb-canonical-contract.test.mjs` —
  - canonical 생성기가 `CANONICAL_FORBIDDEN_INPUTS`(volt-data·ship-prices-usd·rsi-ship-matrix-index)를 참조하지 않음.
  - 레거시 스크립트가 `data/canonical/*`를 write 하지 않음.
  - canonical에 금지 필드(priceUsd·focus·tags·crew·plannerEligible·erkulName·erkulStatus) 부재(`shipdb-3-3` 2번 테스트가 이중 확인).

## 검증 3 — Safe Apply preview 무결

- `functions/_shared/erkul-sync.js`의 `computePreviewHash`·`buildSyncPreview` 존재·서명 유지. `erkul-sync-preview.test.mjs`가 previewHash 안정성(필드/순서 일치, syncedAt 제외)을 상시 강제.
- **preview = apply가 만들 "다음 레이어"를 해시**할 뿐 apply를 실행하지 않음 → 리허설에서 라이브 변경 없음.
- **실전 fetch·apply 범위 밖**: 실제 Erkul HTTP fetch와 Safe Apply *apply*는 Cloudflare Pages Functions/운영 시크릿 환경이 필요해 CLI 리허설 대상이 아니다. 3.5 전환 시 서버측(AI·CMS·Safe Apply)도 canonical을 읽도록 함께 이관하며, 그 파이프라인 정합을 본 리허설이 사전 확인.

## 미결 / 다음

- **role 원자 이관(3.5 전)**: Erkul canonical `role`로 이관. VOLT 수기 role 유지·추론 금지. Erkul 값 없으면 역할 배지 미표시, KO는 동일 Erkul 역할 문자열의 UI 번역만.
- **3.4 PM 검토 → 3.5**: 실제 ON 전환·레거시 삭제는 3.1~3.3 + role 이관 결과 검토 후에만 승인.
