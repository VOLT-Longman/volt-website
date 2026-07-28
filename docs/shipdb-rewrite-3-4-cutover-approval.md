# ShipDB Erkul 재작성 v2 — 3.4 전환·삭제 승인 패키지 (PM 결정용)

> **시점 기록 (2026-07-25 확인).** 이 문서는 작성 당시 상태를 남긴 기록이며 현행 운영 문서가 아니다.
> 본문이 현재형으로 서술하는 `data/volt-data.js`의 ships 배열, `data/ship-en.js`,
> `data/ship-prices-usd.json`, 레거시 재생성 스크립트는 **3.5-B에서 물리 삭제**됐다.
> 현재 데이터 구조는 [ship-data-pipeline.md](ship-data-pipeline.md), 운영 절차는
> [OPERATIONS_RUNBOOK.md](OPERATIONS_RUNBOOK.md)를 사실원으로 본다.

> **요청**: 3.5 **실전 플래그 ON + 레거시 삭제** 착수 승인. 이 문서는 0~2단계·3.1~3.3·role 이관 결과와 CI를 종합해, 전환이 안전하고 되돌릴 수 있음을 입증하고 3.5 실행 계획·삭제 인벤토리를 제시한다. **이 문서 자체는 코드·데이터를 바꾸지 않는다**(삭제·플래그 ON 없음).

## 1. 결론

- 3.5 전 모든 준비 작업(병렬 데이터셋 → 소비처 이관 → 비교 검증 → 동기화 리허설 → role 이관)이 완료됐고, **OFF=기준선 완전 불변 / ON=허용된 차이만**이 테스트로 고정됐다.
- 남은 것은 **PM 승인 → 3.5(플래그 ON + 레거시 삭제)**뿐. 3.5는 단일 revert 가능 커밋 + 이중 게이트로 실행한다.

## 2. 완료 요약 (커밋)

| 단계 | 내용 | 커밋 |
|---|---|---|
| 0 | 착수 게이트 — 기준선 스냅샷·CI 차단 계약·소비처 맵·ID 매핑 | af8fe24 · 832e2ff |
| 1 | 병렬 Erkul 데이터셋(canonical 219 · localization 219 · operational) | 6269d78 · d0fc160 |
| RSI 카탈로그 | 컨셉 30척 RSI 공식 격리 + 29척 KO + catalogStatus | c7d1fdc · 74fd971 · 92d62d3 |
| 2 로더 | canonical 내부 로더 + 비공개 플래그(기본 OFF) | 8d78106 |
| 2 카탈로그 탭 | ON 전용 RSI 카탈로그 탭·실전 제외 가드 | e5dd5f1 · cddbef0 |
| 2 필드 이관 | priceUsd(제거) · crew · cargo · focus·tags(제거) · **role** | 4ea416a · 2d7a0cb · d7991e7 · 8bb1355 · **52d3c32** |
| 3.1 | 전후(OFF/ON) 응답 비교 — 허용 차이만 | 6d3a5db |
| 3.2 | KO 완전성 감사(live 219 + RSI 29) | 3a763e8 |
| 3.3 | 동기화 연결 리허설(재생성 결정론성·레거시 격리·preview 무결) | bc9c450 |

## 3. 안전성 근거 (테스트로 고정된 불변식)

- **OFF = 기준선 완전 불변**: 모든 이관 소비처가 `canonicalOn()` 게이팅. 시각 회귀(기본 OFF) + 비교 하네스 OFF 케이스가 카드·비교·필터·모달·검색을 기준선으로 고정. (`shipdb-compare-harness`·`shipdb-3-1-comparison`·`visual-regression`)
- **ON = 허용된 차이만, 그 외 실패**: 메인 256→219(컨셉30·별칭7 제외, 신규 0) · RSI 카탈로그 30 별도 · priceUsd 제거 · crew·cargo·role=Erkul · 필터=canonical role 칩 · purpose 숨김. 공유 219척의 name·mfr·cargo 값 불변. (`shipdb-3-1-comparison` 4건)
- **KO 완전성**: live 219 KO(missing 0·stale 0, sourceEnHash 재계산 일치) + RSI 29(expanse no-en) + role 52종(missing 0, canonical과 1:1). (`shipdb-3-2-ko-completeness`·`shipdb-role-localization`)
- **동기화 재현성·격리**: canonical은 live 레이어 파생(드리프트 0, CI 고정) · 레거시 재생성 4스크립트가 canonical 재주입 불가 · Safe Apply previewHash 무결. (`shipdb-3-3-sync-rehearsal`·`shipdb-canonical-contract`·`erkul-sync-preview`)
- **계약 CI(fail-closed)**: canonical 생성기 금지입력 차단, 공개 금지 필드 차단, canonical∩catalog=∅, RSI 게임플레이 값 차단. (`shipdb-canonical-contract` 10건)
- **게이트**: `npm run check` OK · `test:functions` 138 · **`npx playwright test` 275** 그린. **CI Smoke(52d3c32) = completed/success**.

## 4. 3.5 실행 계획 (승인 후)

**전제(2.7 선결)**: 레거시 재생성 4스크립트(`normalize-ship-database`·`build-ship-database`·`build-ship-en`·`sync-ship-prices`, 상위 `sync-rsi-ship-matrix`)를 **제거 필드 미산출**로 폐기/봉인 + Safe Apply(`computePreviewHash`·`erkul-sync`)를 canonical 스키마로 이관. 이는 3.5 삭제의 게이트다(재주입 차단은 이미 CI로 고정, 2.7은 실제 퇴역).

**실행 순서(각 제거는 이중 게이트 통과 후에만)**:
1. 내부 플래그 `CANONICAL_ENABLED=true`(실전 ON) + 서버측(AI·CMS·Safe Apply) canonical 리더 전환.
2. **이중 게이트**: ① 재생성 파이프라인이 해당 필드 미산출(2.7 완료) ② 전체 재grep으로 잔존 라이브 리더 0.
3. 레거시 혼재 데이터 제거(§5) — **단일 revert 가능 커밋**.
4. 게이트(check+functions+playwright) 그린 후 main 반영. cutover 재기준선 스냅샷 갱신.

**Rollback**: 삭제 전까지는 플래그 OFF로 즉시 원복(레거시 무손상). 삭제 커밋은 revert 단위로 되돌림 가능(되돌리면 병렬 canonical은 유지, 레거시 복구). 삭제 후 재-cutover는 재승인.

## 5. 3.5 삭제/재배선 인벤토리 (정확)

| 대상 | 처분 | 근거 |
|---|---|---|
| `priceUsd` 공개 모델·동기화 | 제거. `ship-prices-usd.json`·`sync-ship-prices.mjs`는 자산 보존·파이프라인 분리 | D4 |
| `focus`·VOLT 편집 `role`/`tags` 분류 | 제거(대체 분류 없음). role은 canonical role로 이미 이관 | D7 |
| `crew` 수기값 | 공개는 `live.crewSize`. 수기값은 차이 리포트로만(오버라이드 아님) | D3 |
| `plannerEligible` | 삭제 또는 정렬 tiebreak 로직으로 흡수 | plan |
| top-level `{source,sourceVersion}` | 삭제(미소비) | plan |
| `erkulName`·`erkulStatus` | **삭제 안 함** — operational 격리(공개 필드 제외) | D5 |
| `market.anomalies`·`mappedFrom` | **삭제 안 함** — 관리자 리포트 전용 | D6 |
| 컨셉 30·별칭 7 | canonical 미포함(카탈로그/리다이렉트로 유지). Railen은 live라 219 유지 | D8 |

- **재배선(삭제 아님)**: '미구현' 게이트→`implemented`/`erkulStatus`(이미 ON에서 적용), cargo 하드게이트→`live.cargoScu`(적용됨), Safe Apply→canonical 스키마.

## 6. 2.7 선행 완료 (PM B, 2026-07-19)

PM은 **B(2.7만 선행 승인, 실제 ON·삭제 미승인)** 를 판정. 2.7 이행 결과([2.7 리포트](shipdb-rewrite-2-7-server-canonical.md)):

- **레거시 파이프라인 봉인**(4e98966): 재생성 4스크립트 RETIRED 스텁 → 제거 필드(priceUsd·focus·tags·role·crew) 재생성 불가. CI 봉인 가드.
- **서버 reader canonical 이관**: AI=canonical 3계층(160e92a) · CMS=canonical 듀얼리드(기본 OFF) · Safe Apply=정합 검증. 서버 플래그 기본 OFF(3.5에서만 ON).
- **priceUsd 파이프라인 분리**: 자산(ship-prices-usd.json) 보존, 생성기·소비처 봉인으로 분리.
- **재grep 검증**: 레거시 volt-data 서버 reader 0 · 공개 레거시 사실 reader 0 · AI canonical 동작 · Safe Apply previewHash 정합.
- 전 게이트 그린(check·functions·playwright 275). **삭제·플래그 ON·노출 변화 없음.**

**남은 3.5 리스크**: (a) 실제 서버·클라이언트 플래그 동시 ON 시점 정합(듀얼리드로 준비됨) (b) D1 레거시 컬럼/volt-data 사실 필드/priceUsd DDL 삭제(단일 revert 커밋) (c) 아래 role 필터 UX 확정.

## 7. role 필터 UX — 단일 검색형 콤보박스 (구현 완료, PM A)

PM이 A(role UX 먼저)를 승인 → **52칩 → 단일 검색형 역할 선택 콤보박스**로 교체(ON 전용). 7개 요건 충족:

- **단일 검색형**: `#ship-tag-filters` 안의 combobox 입력(`role="combobox"`) + 리스트박스(`role="listbox"`). 52칩 가로 스크롤 제거.
- **canonical role 원문만**: 옵션 키=Erkul EN role(`data-role-option`), 라벨=KO(`localization-roles.json` 재사용). **career 버킷·VOLT 분류·그룹화 없음**(flat 옵션, 전체+52종).
- **검색·선택·초기화·키보드**: 타이핑→옵션 필터(KO 라벨·EN 원문 부분일치) · 클릭/Enter 선택 · ✕/전체 초기화 · ArrowUp/Down·Enter·Escape.
- **role 없는 함선 제외**: 옵션 집합=canonical role(roleList)만, 매처는 canonical role 없는 함선 제외.
- **OFF 완전 동일**: OFF 경로는 focus/tags 칩 그대로(콤보박스는 ON 분기에서만). 시각 회귀 유지.
- **모바일 접근성**: 표준 폼 컨트롤(ARIA combobox/listbox/option) · 390px에서 동작·가로 overflow 없음.
- **포커스 유지**: 콤보박스 1회 빌드 후 선택 상태만 sync, 타이핑은 옵션만 필터(renderShips 미호출) → admin 커서 풀림 회귀 방지.

- **검증**: `shipdb-role-filter-ux.spec.js`(6건: 구조·검색+포커스·키보드·초기화·모바일·OFF 불변) + 관련 스펙 갱신(role-migration·3.1·focus-tags). 게이트: check·functions 144·playwright.

## 8. PM 승인 포인트 (다음 결정)

2.7 선행 + role 이관 + **role 필터 UX(§7) 모두 완료·CI 그린**. 남은 것은 **실전 전환·삭제**의 최종 판정뿐이다.

- **A. 3.5 착수 승인** — 플래그 동시 ON(서버+클라) + 이중 게이트(파이프라인 미산출[완료]+잔존 리더 0[검증됨]) → 레거시 삭제(단일 revert 커밋).
- **C. 보류** — 특정 잔여 리스크를 먼저 확정한 뒤 3.5.

*(§6-7은 PM B→A 판정으로 갱신됨. 2.7·role UX가 끝났으므로 위가 현행 결정 지점.)*
