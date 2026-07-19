# ShipDB Erkul 재작성 v2 — 3.1 전후 응답 비교 리포트

- **목적(PM)**: 플래그 OFF(기준선)와 ON을 비교해 **허용된 차이만** 존재함을 입증한다. 그 외 카드·대상·동작·응답 차이는 **실패**로 처리한다.
- **집행**: `tests/smoke/shipdb-3-1-comparison.spec.js`(3건, 실행형 하네스) — OFF/ON을 각각 로드해 메인 카드·컨트롤·비교를 포착·대조. `shipdb-compare-harness.spec.js`가 상시 회귀 가드.
- **결과**: 4/4 통과 — 허용 차이만 확인.

## 허용된 차이 (ON에서만)

| 표면 | 허용 차이 | 검증 |
|---|---|---|
| 메인 ShipDB | 256 → **249**(중복 에디션 별칭 7 제외) | ON=Erkul 219 + RSI 공식 30, 제외 7=별칭 정확 일치 |
| RSI 공식 30척 | **메인 목록에 통합**(concept 28·flight-ready 2) | 별도 탭 없음, 카드 상태 배지·공식 설명·공식 URL |
| `priceUsd` | 카드·모달·비교·정렬·검색에서 **제거**(D4) | ON 카드/비교/정렬 옵션 0 |
| `focus`·`tags` | 배지·태그칩·태그필터·비교 분류행·검색에서 **제거**(D7) | ON 0, 태그 필터 숨김 |
| `crew` | Erkul `crewSize`로 표시(비교·리더보드·정렬) | freelancer OFF "1명" → ON "4" |
| `cargo` | Erkul `cargoScu`로(출처 전환, 값 불변) | 219척 값 동일(콤마 포맷 유지) |

## 실패 처리(= 회귀)로 잡는 그 외 차이

- 공유 219척의 `name`·`manufacturer`·`cargo` **값** 변경 → 실패.
- `role`·`size` 행 소실 → 실패(비교표 `역할` 행 유지 검증).
- ON에서 별칭 외 함선이 사라짐 → 실패.
- ON focus 배지·태그·priceUsd **잔존** → 실패.
- 별칭 외 함선이 메인에서 사라짐 → 실패(removed=정확히 7).

## 표면별 커버리지

- **ShipDB 카드**: 메인 249 id 집합 + Erkul live 219의 name·mfr·cargo 대조, RSI 30의 공식 상태 대조.
- **컨트롤**: 정렬 price 옵션 제거, 태그 필터 숨김.
- **비교**: focus(분류)·USD 행 제거, `역할` 행 유지, crew Erkul 값.
- **RSI 공식 데이터**: 30척은 메인 목록에 포함, concept 28/flight-ready 2 배지를 검증.
- **플래너**: RSI 공식 30척은 Erkul live market/게임플레이 값이 없으므로 전부 제외한다. '미구현' 게이트는 `implemented`로 대체(unreleased railen 부적격 유지).

## 서버측 표면 (클라이언트 플래그 무관 — 별도)

- **AI(`functions/_shared/ai-tools.js`)·관리자 CMS·Safe Apply preview**는 **서버측**이라 클라이언트 내부 플래그(`window.VOLT_SHIPDB_CANONICAL`)의 영향을 받지 않는다. 즉 OFF/ON에서 서버 응답은 동일하다(클라이언트 플래그가 서버 요청을 바꾸지 않음 = "그 외 차이 0"의 일부).
- 이들의 canonical 전환은 클라이언트 필드 이관과 별개이며, **3.5 실전 전환 시점에 서버측도 canonical을 읽도록 함께 이관**한다(3.3 리허설로 파이프라인 정합 확인).

## 미결

- `role` **이관 완료**([shipdb-rewrite-role-migration.md](shipdb-rewrite-role-migration.md) 참조). Erkul canonical `role`로 원자 이관 — 카드 focus 배지→canonical role 배지, 필터=canonical role 칩, purpose 숨김, 비교·모달·검색=canonical. VOLT 수기 role·career 조합·추론 금지 준수. 219/219 role 보유. 이로써 3.5 전 데이터 필드 이관은 모두 종료.
