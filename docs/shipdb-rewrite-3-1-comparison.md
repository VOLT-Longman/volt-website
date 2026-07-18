# ShipDB Erkul 재작성 v2 — 3.1 전후 응답 비교 리포트

- **목적(PM)**: 플래그 OFF(기준선)와 ON을 비교해 **허용된 차이만** 존재함을 입증한다. 그 외 카드·대상·동작·응답 차이는 **실패**로 처리한다.
- **집행**: `tests/smoke/shipdb-3-1-comparison.spec.js`(4건, 실행형 하네스) — OFF/ON을 각각 로드해 메인 카드·컨트롤·비교·카탈로그를 포착·대조. `shipdb-compare-harness.spec.js`가 상시 회귀 가드.
- **결과**: 4/4 통과 — 허용 차이만 확인.

## 허용된 차이 (ON에서만)

| 표면 | 허용 차이 | 검증 |
|---|---|---|
| 메인 ShipDB | 256 → **219**(컨셉 30·별칭 7 제외) | 제외 37=컨셉+별칭 정확 일치, ON 신규 추가 0, ON=canonical 219 |
| RSI 공식 카탈로그 | **30척 별도 탭**(concept 28·flight-ready 2) | ON에서만 노출, 상태 배지·출처·확인일 |
| `priceUsd` | 카드·모달·비교·정렬·검색에서 **제거**(D4) | ON 카드/비교/정렬 옵션 0 |
| `focus`·`tags` | 배지·태그칩·태그필터·비교 분류행·검색에서 **제거**(D7) | ON 0, 태그 필터 숨김 |
| `crew` | Erkul `crewSize`로 표시(비교·리더보드·정렬) | freelancer OFF "1명" → ON "4" |
| `cargo` | Erkul `cargoScu`로(출처 전환, 값 불변) | 219척 값 동일(콤마 포맷 유지) |

## 실패 처리(= 회귀)로 잡는 그 외 차이

- 공유 219척의 `name`·`manufacturer`·`cargo` **값** 변경 → 실패.
- `role`·`size` 행 소실 → 실패(비교표 `역할` 행 유지 검증).
- ON에 OFF에 없던 함선 추가 → 실패(added=0).
- ON focus 배지·태그·priceUsd **잔존** → 실패.
- 컨셉/별칭 외 함선이 메인에서 사라짐 → 실패(removed=정확히 37).

## 표면별 커버리지

- **ShipDB 카드**: 메인 219 id 집합 + 카드별 name·mfr·cargo·focus배지·태그수·가격스탯 대조.
- **컨트롤**: 정렬 price 옵션 제거, 태그 필터 숨김.
- **비교**: focus(분류)·USD 행 제거, `역할` 행 유지, crew Erkul 값.
- **RSI 카탈로그**: 30척·배지 28/2.
- **플래너**: 대상은 canonical 219 부분집합(컨셉/별칭은 canonical 미포함이라 구조적으로 플래너 진입 불가 — `shipdb-canonical-contract`의 canonical∩catalog=∅ + `shipdb-rsi-catalog`의 카탈로그 카드 무-컨트롤로 이중 보장). '미구현' 게이트는 `implemented`로 대체(unreleased railen 부적격 유지).

## 서버측 표면 (클라이언트 플래그 무관 — 별도)

- **AI(`functions/_shared/ai-tools.js`)·관리자 CMS·Safe Apply preview**는 **서버측**이라 클라이언트 내부 플래그(`window.VOLT_SHIPDB_CANONICAL`)의 영향을 받지 않는다. 즉 OFF/ON에서 서버 응답은 동일하다(클라이언트 플래그가 서버 요청을 바꾸지 않음 = "그 외 차이 0"의 일부).
- 이들의 canonical 전환은 클라이언트 필드 이관과 별개이며, **3.5 실전 전환 시점에 서버측도 canonical을 읽도록 함께 이관**한다(3.3 리허설로 파이프라인 정합 확인).

## 미결

- `role`은 아직 미이관(PM 순서 제외). **3.5 전 별도 원자 이관**: Erkul canonical `role`로, VOLT 수기 role 유지·추론 금지. Erkul 값 없으면 역할 배지 미표시, KO는 동일 Erkul 역할 문자열의 UI 번역만.
