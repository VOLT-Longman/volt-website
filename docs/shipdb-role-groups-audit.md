# ShipDB 역할군 태그 — 52 canonical role 매핑 감사표 (PM 검토용)

- **목적(PM)**: Erkul canonical 역할만 사실원으로 쓰면서, 52개 세부 역할을 8개 UX 역할군으로 재분류한다. VOLT 수기 `focus/tags`는 복원하지 않는다. 입력은 canonical **원문 `role`** 값만.
- **규칙**: 각 role은 정확히 한 역할군. 교차그룹 복합역할·불명확한 역할은 임의 추론하지 않고 `레이싱·기타(other)`에 두고 **ambiguous**로 기록.
- **산출**: `data/canonical/role-groups.json`(생성기 `scripts/shipdb-rewrite/build-role-groups.mjs`). CI 계약 `tests/functions/shipdb-role-groups.test.mjs`(누락 0·중복 0·focus/tags 미참조·RSI 미유입·219 전수).
- **RSI 공식 카탈로그 30척은 대상 아님**(별도 카탈로그, 역할군 필터·플래너·비교 미유입).

## 그룹별 분포 (role 52 · 함선 219)

| 역할군 | role 수 | 함선 수 |
|---|---|---|
| 물류·운송 (logistics) | 6 | 38 |
| 전투·보안 (combat) | 19 | 89 |
| 산업·자원 (industry) | 7 | 10 |
| 탐사·과학 (exploration) | 5 | 29 |
| 지원·구조 (support) | 4 | 10 |
| 여객·관광 (passenger) | 3 | 17 |
| 지상·특수 (ground) | 3 | 4 |
| 레이싱·기타 (other) | 5 | 22 |
| **합계** | **52** | **219** |

## 전수 매핑 (role → 역할군)

- **물류·운송**: Heavy Freight, Light Freight, Medium Freight, Starter / Light Freight, Dropship, Heavy Dropship
- **전투·보안**: Anti-Air, Anti-Vehicle, Bomber, Corvette, Frigate, Gunship, Heavy Bomber, Heavy Fighter, Heavy Fighter / Bomber, Heavy Gunship, Interceptor, Interdiction, Light Fighter, Medium Fighter, Snub Carrier, Snub Fighter, Starter / Light Fighter, Stealth Bomber, Stealth Fighter
- **산업·자원**: Heavy Salvage, Light Mining, Light Salvage, Medium Mining, Medium Salvage, Starter / Light Mining, Starter / Light Salvage
- **탐사·과학**: Expedition, Light Science, Medium Data, Pathfinder, Starter / Pathfinder
- **지원·구조**: Heavy Refueling, Light Refueling, Medical, Recovery
- **여객·관광**: Luxury Touring, Passenger, Touring
- **지상·특수**: Heavy Tank, Light Tank, Modular
- **레이싱·기타**: Racing, Generalist, Reporting, Light Freight / Medium Fighter, Medium Freight / Gun Ship

## ambiguous (4) — 임의 추론 대신 other로 둠, PM 판단 필요

| role | 사유 | 대안(참고) |
|---|---|---|
| Light Freight / Medium Fighter | 물류+전투 **교차 복합**(Cutlass Black) | 첫 성분 기준 물류로 지정 가능 |
| Medium Freight / Gun Ship | 물류+전투 **교차 복합**(Constellation Andromeda) | 첫 성분 기준 물류로 지정 가능 |
| Generalist | 특정 그룹 없음(만능, Clipper) | other 유지 권장 |
| Reporting | 보도/미디어 — 8개 그룹에 명확히 없음(Reliant Mako) | other 유지 또는 탐사·과학(정보) |

## 판단 근거가 갈릴 수 있는 매핑(문자열 기준으로 결정, PM 확인 요청)

- **Dropship·Heavy Dropship → 물류·운송**: "Dropship"=병력/차량 운송으로 해석. 전투·보안으로 볼 여지도 있음.
- **Snub Carrier → 전투·보안**: 스넙 전투기 운용 플랫폼으로 해석. 물류(운반)로 볼 여지도 있음.
- **Medium Data → 탐사·과학**: "Data"=정보 수집으로 해석.
- **Modular → 지상·특수**: "특수 플랫폼"으로 해석(Retaliator 모듈형). 지상 아님에 주의.
- **Recovery → 지원·구조**: "회수/견인"으로 해석(SRV).
- **Tank(경·중) → 지상·특수**: 지상 장비(Nova·Storm)로 해석.

## PM 결정 지점

1. **교차 복합 2종**(Cutlass Black·Constellation Andromeda)을 other 유지할지, 첫 성분(물류)으로 지정할지.
2. 위 "근거가 갈릴 수 있는 매핑" 중 조정할 항목.

이 매핑 확정 후 필터 UI(역할군 태그 + 세부 역할 검색), 카드 배지, 회귀 테스트를 별도 커밋으로 진행한다.
