# ShipDB Erkul 재작성 v2 — 2.7 서버측 canonical 이관 + 레거시 파이프라인 봉인 리포트

- **목적(PM B)**: 3.5 실전 ON·삭제 전에, ① 제거 필드 재생성 파이프라인 봉인 ② 서버측 reader(AI·CMS·Safe Apply) canonical 이관 ③ priceUsd 파이프라인 분리(자산 보존)를 선행한다. **기본 플래그 OFF · 데이터 삭제 없음 · 사용자 노출 변화 없음.**
- **결과**: 5개 범위 항목 전부 이행. OFF 기준선 완전 불변, ON 경로는 테스트로 고정. 전 게이트 통과.

## 2.7 범위(PM 고정) 이행

| # | 범위 | 처리 | 커밋 |
|---|---|---|---|
| 1 | 레거시 재생성 4스크립트 봉인 | normalize-ship-database·build-ship-database·build-ship-en·sync-ship-prices → RETIRED 스텁(즉시 exit 1). 제거 필드(priceUsd·focus·tags·role·crew) 재생성 불가 | 4e98966 |
| 2 | Safe Apply·CMS·AI 서버 reader canonical 이관 | AI=canonical 3계층 읽기 · CMS=canonical 듀얼리드(기본 OFF) · Safe Apply=live 기반 유지(정합 검증) | 160e92a · (이 커밋) |
| 3 | ship-prices-usd.json 파이프라인 분리(자산 보존) | 생성기(sync-ship-prices)·소비처(normalize) 봉인으로 분리. 파일 자체는 삭제 안 함 | 4e98966 |
| 4 | 전체 재grep 검증 | 레거시 공개 reader 0 · canonical reader 동작 · Safe Apply previewHash 정합 (아래) | (이 커밋) |
| 5 | 기본 OFF · 삭제 없음 · 노출 변화 없음 | 서버 플래그 기본 OFF, D1 컬럼·데이터 무삭제, OFF 출력 byte-불변 | 전체 |

## 서버측 reader별 처리

- **AI** (`functions/_shared/ai-tools.js`): `loadShipLayers`가 Erkul live 레이어(ship-live-stats·ship-market) 대신 **canonical(사실·시장) + operational(erkulLocalName·syncedAt)** 을 읽는다. canonical/operational은 live 파생(219=live 동일 집합·값)이라 추천·비교·근거 응답 불변. 출처 라벨만 "Erkul canonical 데이터셋"으로.
- **CMS** (`functions/_shared/cms.js` · `functions/api/ship-overrides.js`): 공개 `/api/ship-overrides`가 **서버 canonical 듀얼리드**. 기본 OFF=레거시 override 필드 전부(기준선 불변), ON=canonical 사실원/제거 필드(role·focus·crew·cargo·priceUsd·tags) 생략. 서버 플래그 `functions/_shared/shipdb-canonical-flag.js`(기본 OFF, 이용자/URL 불가, 3.5에서만 true). **근거**: 3.5에서 D1 레거시 컬럼이 삭제돼도 reader가 안전(삭제된 컬럼을 읽어 노출하지 않음). 클라이언트 canonical ON이 이미 이 값들을 무시하므로 공개 노출은 동일.
- **Safe Apply** (`functions/api/admin/ships/erkul-sync/*` · `functions/_shared/erkul-sync.js`): Erkul live 레이어를 diff하는 **사실원 생산자**(admin·read-only, apply는 로컬 스크립트). canonical의 입력이므로 그대로 유지하고, previewHash 정합만 검증(불변).

## 재grep 검증 (item 4)

- **레거시 volt-data 서버 reader**: `grep -rn volt-data functions/` → **0건**.
- **공개(non-admin) 레거시 사실 레이어 reader**: `ship-live-stats`/`ship-market` 참조는 `functions/_shared/erkul-sync.js`(공유 JS-레이어 파서 유틸 + admin Safe Apply)뿐 — 공개 함선 사실 reader 아님. AI는 canonical로 이관됨.
- **canonical reader 동작**: `ai-tools.js`가 `/data/canonical/ships-canonical.json`·`/data/canonical/operational-ships.json`을 읽음(레거시 live fetch 부재). `ship-overrides` 듀얼리드 OFF/ON 검증.
- **Safe Apply previewHash 정합**: `erkul-sync-preview.test.mjs` 11건 통과(같은 데이터→같은 hash, 다르면 다름).

## 검증 (사실)

- **봉인 CI 가드**(`shipdb-canonical-contract`): 4스크립트 RETIRED+process.exit + 레거시 데이터 write 부재 강제.
- **2.7 고정**(`shipdb-2-7-server-canonical`, 3건): 서버 플래그 기본 OFF · AI canonical 3계층·레거시 live 미read · mapShipOverride OFF전부/ON생략.
- **AI 이관**(`ai-chat` 16건): canonical/operational mock만으로 동작(레거시 live 미제공에도) = 이관 입증, 응답 불변.
- **CMS 듀얼리드**(`ship-overrides-coverage` 2건): OFF=필드 전부, ON=6필드 생략·비-사실 유지.
- **게이트**: `npm run check` OK · `test:functions` 통과 · `npx playwright test` 275(OFF 기준선 불변).

## 미결 (3.5, 별도 판정)

- 실제 서버·클라이언트 플래그 ON 전환 + D1 레거시 컬럼/volt-data 사실 필드/priceUsd DDL 삭제는 **3.5 승인 시점에만**.
- role 필터 UX(52칩 → 단일 검색형 역할 선택)는 [3.4 패키지](shipdb-rewrite-3-4-cutover-approval.md)의 제안대로 실전 ON 전 확정.
