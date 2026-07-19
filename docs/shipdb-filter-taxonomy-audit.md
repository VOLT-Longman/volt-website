# ShipDB 필터 분류(2축) 감사표 (PM 확정 지시서 커밋 B)

- **목적**: canonical 219척을 **규모·플랫폼** + **역할** 2축 태그로 탐색. 수기 `focus/tags` 복원 금지. 입력 = canonical `size`·`role` + Erkul 직접 필드 `calculatorType`(지상)만.
- **산출**: `data/canonical/ship-filter-taxonomy.json`(생성기 `build-ship-filter-taxonomy.mjs`). CI 계약 `tests/functions/shipdb-filter-taxonomy.test.mjs`(6). **RSI 카탈로그 30척은 대상 아님.**

## 축 1 — 규모·플랫폼

| Erkul size | 태그 | 함선 수(원값) |
|---|---|---|
| S1, S2 | 소형 | 129 |
| S3 | 중형 | 38 |
| S4, S5 | 대형 | 47 |
| S6 | 캐피탈 | 5 |

- **지상(platform)**: 크기가 아니라 플랫폼. **Erkul 원본 `calculatorType`**(`ship`/`vehicle`) 직접 필드로만 판정 — 추론 아님. `vehicle` **27척**(Cyclone 전변형·Nova·Storm·Ballista·Ursa·Greycat 계열·Lynx 등).
- **카드/필터 규칙(1개 태그)**: 지상 차량 = **지상** 태그(크기 태그 대신). 우주선 = 크기 태그. 즉 `지상 ? 지상 : sizeMap[size]`.
- **미조인 1척**: `basher`(Erkul raw에 localName 없음) → 지상 근거 없음 → space(크기 태그). 추론하지 않음.
- **⚠ 배치 결정 필요(PM)**: 지시서는 "canonical 생성기에 `platform` 추가"였으나, `calculatorType`이 **정규화된 live 레이어엔 없고 원본 fetch(ships.raw.json)에만** 있습니다. 실전 ON 중 deployed canonical/live 재생성 위험을 피하려 **taxonomy 계층에 `platformGroundIds`로 배치**(같은 Erkul 직접 필드 사용)했습니다. canonical에 넣으려면 live+canonical 파이프라인 재생성이 필요 — PM 확인 요청.

## 축 2 — 역할 태그 (14, §4 표 그대로)

| 태그 | role 수 | 함선 수 | 원문 역할 |
|---|---|---|---|
| 전투 | 20 | 93 | Anti-Air·Anti-Vehicle·Bomber·Corvette·Frigate·Gunship·Heavy Bomber·Heavy Fighter·Heavy Fighter/Bomber·Heavy Gunship·Heavy Tank·Interceptor·Interdiction·Light Fighter·Light Tank·Medium Fighter·Snub Fighter·Starter/Light Fighter·Stealth Bomber·Stealth Fighter |
| 화물 | 4 | 34 | Light/Medium/Heavy Freight·Starter/Light Freight |
| 수송 | 6 | 24 | Dropship·Heavy Dropship·Passenger·Touring·Luxury Touring·Snub Carrier |
| 인양 | 5 | 6 | Light/Medium/Heavy Salvage·Recovery·Starter/Light Salvage |
| 채광 | 3 | 5 | Light/Medium Mining·Starter/Light Mining |
| 정제 | 0 | 0 | (Refining 원문 역할 없음 — 계약 유지, UI 숨김) |
| 급유 | 2 | 3 | Light/Heavy Refueling |
| 의료 | 1 | 6 | Medical |
| 탐사 | 3 | 27 | Pathfinder·Expedition·Starter/Pathfinder |
| 과학 | 3 | 3 | Light Science·Medium Data·Reporting |
| 레이싱 | 1 | 18 | Racing |
| 다목적 | 1 | 1 | Generalist |
| 모듈 | 1 | 1 | Modular |
| 지원 | 4 | 10 | Medical·Light/Heavy Refueling·Recovery(겸) |

- **다중 태그**(한 역할이 여러 태그): Medical=의료+지원, Light/Heavy Refueling=급유+지원, Recovery=인양+지원, Light Freight / Medium Fighter=화물+전투, Medium Freight / Gun Ship=화물+전투.
- **미분류 0**: §4 표가 canonical 52 역할을 전수 커버. 향후 표에 없는 새 역할이 생기면 태그 없이 `unmapped`(미분류 사유)로 기록 + 세부 역할 검색·원문 라벨로 노출.

## CI 계약 (6)

원문 역할 전수 매핑∪미분류 · 자동태그 금지(잉여 키 0) · 다중태그 정확 · size S1~S6 전수 · 지상=calculatorType 직접필드 정확 일치 · focus/tags/career 미참조 · RSI 미유입.

## 다음 (커밋 C)

역할·규모 2축 태그 필터 UI(OR/AND) + 세부 역할 검색 콤보박스 + 카드 태그(규모 1·역할 최대 2·원문 KO 라벨) + i18n·a11y·반응형(390/768/1440) + 시각 기준선(결과 검토 후 수동 갱신). **매핑·플랫폼 배치 확정 후 진행.**
