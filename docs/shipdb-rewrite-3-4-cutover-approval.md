# ShipDB Erkul 재작성 v2 — 3.4 전환·삭제 승인 패키지 (PM 결정용)

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

## 6. 잔여 리스크 / 선결

- **서버측 전환 동시성**: AI·CMS·Safe Apply는 서버측이라 클라이언트 내부 플래그 무관 — 3.5에서 canonical 리더로 함께 이관해야 OFF/ON 정합이 끝까지 유지된다. 3.3 리허설로 파이프라인 정합만 사전 확인됨.
- **role 필터 52칩 UX**: 계약(canonical role 집합·career 버킷팅 금지)상 세분 52종 칩. 상위 묶음이 필요하면 Erkul 미제공이라 별도 결정(계약 2항 때문에 career 묶음 불가).
- **2.7 파이프라인 퇴역 미완**: 3.5 삭제의 게이트. 재주입 차단은 CI로 고정됐으나 실제 스크립트 퇴역·Safe Apply 이관은 3.5 착수 시 수행.

## 7. PM 승인 포인트

- **A. 3.5 착수 승인** — 위 순서로 2.7 파이프라인 퇴역 → 플래그 ON + 서버측 이관 → 이중 게이트 → 레거시 삭제(단일 revert 커밋).
- **B. 부분 승인** — 먼저 2.7(파이프라인 퇴역·Safe Apply 이관)만 원자 수행하고, 실제 플래그 ON·삭제는 그 결과를 재검토 후 별도 승인.
- **C. 보류** — 특정 잔여 리스크(예: role 필터 UX, 서버측 전환 범위)를 먼저 결정한 뒤 3.5.
