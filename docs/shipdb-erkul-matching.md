# ShipDB 2.0 — Erkul ↔ VOLT 함선 매칭 리포트 (A-4)

재현: `npm run shipdb:erkul:match` (입력: ships-normalized / ship-market-normalized / manual-ship-map / volt-data.js)

## 요약

- VOLT ships: **256** (매칭 풀 249, 에디션/번들 변형 7는 canonicalId로 원본에 귀결)
- Erkul ships: **220** / market 보유 함선: 173
- matched: **219** — 매칭률 **88.0% (matched/voltMatchPool)**
- unmatched VOLT: 30 / unmatched Erkul: 1 / conflicts: 0

## method별 매칭

- name: 219

매칭 우선순위: manual → localName(exact) → name(exact, VOLT 보관 erkulName 우선) → manufacturer+normalized name.
fuzzy/Levenshtein/한글명/variant 추정 매칭은 사용하지 않는다.

## market 연결

- 구매처 있는 매칭 함선: **173**
- 렌탈처 있는 매칭 함선: 41
- 시장 정보 없는 매칭 함선: 46 (인게임 비판매)
- 스펙 보유 매칭 함선: 219

## VOLT-only (Erkul live에 없음)

총 30척. 이 중 이전 파이프라인에서 matched였던 **manual 확인 필요 0척**:


나머지 30척은 erkulStatus=unreleased(컨셉/미출시) 계열:

`merchantman`, `hull-d`, `hull-e`, `orion`, `javelin`, `genesis`, `endeavor`, `crucible`, `pioneer`, `vulcan`, `kraken`, `kraken-privateer`, `ranger-rc`, `ranger-tr`, `ranger-cv`, `nautilus`, `nautilus-solstice-edition`, `g12`, `g12r`, `g12a`, `liberator`, `odyssey`, `expanse`, `legionnaire`, `e1-spirit`, `galaxy`, `zeus-mk2-mr`, `arrastra`, `atls`, `atls-geo`

## Erkul-only (VOLT DB에 없음)

총 1척:

`drak_command_module`

## market-only unmatched (A-3 이월 — 상점에는 있으나 Erkul ships 목록에 없는 선체)

- `rsi_aurora_mr` (4행, 예: New Deal@Lorville) — manual-ship-map candidates 기록: ✅
- `rsi_aurora_ln` (4행, 예: New Deal@Lorville) — manual-ship-map candidates 기록: ✅
- `rsi_aurora_es` (4행, 예: New Deal@Lorville) — manual-ship-map candidates 기록: ✅
- `rsi_aurora_cl` (4행, 예: New Deal@Lorville) — manual-ship-map candidates 기록: ✅
- `aegs_hammerhead` (1행, 예: New Deal@Lorville) — manual-ship-map candidates 기록: ✅
- `rsi_aurora_lx` (1행, 예: New Deal@Lorville) — manual-ship-map candidates 기록: ✅

## conflicts / 애매함

- 없음

## manual map 운영 원칙

- `manual-ship-map.json`의 `mappings`는 운영자가 확정한 항목만 넣는다 (추정 매핑 금지).
- `candidates`는 자동 매핑하지 않으며, 확정 시 `mappings`로 승격한다.
- 구형 Aurora 5종 + `aegs_hammerhead`는 A-4에서 자동 매칭하지 않았다 (Erkul ships 목록 부재 — 매핑 확정은 운영자 결정).
