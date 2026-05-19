# VOLT 함선DB Erkul 매칭 리포트

적용일: 2026-05-19  
기준 데이터: Erkul/DPS Calculator live ship list  
기준 버전: `4.8.0-LIVE.11825000`

## 요약

| 항목 | 수량 |
|---|---:|
| VOLT DB 전체 함선 | 247 |
| Erkul 매칭 완료 | 209 |
| 미구현 처리 | 31 |
| 중복 후보 | 7 |
| 수동 review | 0 |
| 무역플래너 노출 | 64 |
| 무역플래너 제외 | 183 |

## 적용 방식

- Erkul live list에 있는 항목은 `implemented: true`, `erkulStatus: "matched"`로 처리했습니다.
- Erkul live list에 없는 항목은 `implemented: false`, `plannerEligible: false`, `erkulStatus: "unreleased"`로 처리했습니다.
- 미구현 항목에는 `"미구현"` 태그를 유지 또는 추가했습니다.
- 중복·스킨형 항목은 `erkulStatus: "duplicate"`, `canonicalId`로 대표 함선에 연결했습니다.
- cargo 값은 Erkul 기준으로 보정했습니다.
- crew, role, focus, description, tags, priceUsd는 VOLT 사이트의 한국어 안내 맥락을 우선하여 보존했습니다.

## 미구현 처리 목록

- `merchantman` — Merchantman (Banu)
- `hull-d` — Hull D (MISC)
- `hull-e` — Hull E (MISC)
- `orion` — Orion (RSI)
- `javelin` — Javelin (Aegis)
- `genesis` — Genesis (Crusader)
- `endeavor` — Endeavor (MISC)
- `crucible` — Crucible (Anvil)
- `pioneer` — Pioneer (CNOU)
- `vulcan` — Vulcan (Aegis)
- `kraken` — Kraken (Drake)
- `kraken-privateer` — Kraken Privateer (Drake)
- `ranger-rc` — Ranger RC (Tumbril)
- `ranger-tr` — Ranger TR (Tumbril)
- `ranger-cv` — Ranger CV (Tumbril)
- `nautilus` — Nautilus (Aegis)
- `nautilus-solstice-edition` — Nautilus Solstice Edition (Aegis)
- `g12` — G12 (Origin)
- `g12r` — G12r (Origin)
- `g12a` — G12a (Origin)
- `railen` — Railen (Gatac)
- `liberator` — Liberator (Anvil)
- `odyssey` — Odyssey (MISC)
- `expanse` — Expanse (MISC)
- `legionnaire` — Legionnaire (Anvil)
- `e1-spirit` — E1 Spirit (Crusader)
- `galaxy` — Galaxy (RSI)
- `zeus-mk2-mr` — Zeus MK2 MR (RSI)
- `arrastra` — Arrastra (RSI)
- `atls` — ATLS (ARGO)
- `atls-geo` — ATLS GEO (ARGO)

## 중복 후보

- `mustang-alpha-vindicator` → `mustang-alpha`
- `carrack-w-c8x` → `carrack`
- `carrack-expedition-w-c8x` → `carrack-expedition`
- `valkyrie-liberator-edition` → `valkyrie`
- `argo-mole-carbon-edition` → `mole`
- `argo-mole-talus-edition` → `mole`
- `f8c-lightning-executive-edition` → `f8c-lightning`

## 주요 cargo 보정

- Reclaimer: `5,280 SCU` → `420 SCU`
- M2 Hercules: `468 SCU` → `522 SCU`
- A2 Hercules: `234 SCU` → `216 SCU`
- Freelancer MAX: `122 SCU` → `120 SCU`
- Constellation Phoenix: `80 SCU` → `96 SCU`
- 600i Explorer: `40 SCU` → `44 SCU`
- 600i Touring: `16 SCU` → `20 SCU`
- Ironclad: `2,204 SCU` → `2,200 SCU`
- Polaris, Hull C, Hull A, Hull B, C2 Hercules, Caterpillar 등은 기존 값과 Erkul 값이 일치했습니다.

## 무역플래너 노출 기준 결과

무역플래너에는 `implemented: true`, `plannerEligible: true`, cargo 0 초과, 미구현 태그 없음 조건을 만족하는 64개 함선만 노출됩니다.

대표 후보:

- Hull C, Hull B, Hull A
- C2 Hercules, M2 Hercules
- Caterpillar, Cutlass Black
- RAFT, C1 Spirit, Zeus MK2 CL
- Starfarer, Starfarer Gemini
- Reclaimer, Vulture, Fortune
- MOLE, Prospector, Golem, Golem OX
- Ironclad, Ironclad Assault
- Starlancer MAX, Hermes

## 수동 확인 필요

현재 자동 매칭 결과에서 `review` 항목은 없습니다. 다만 아래 항목은 운영 정책상 추후 수동 검토가 필요합니다.

- `f8c-lightning-executive-edition`: Erkul 별도 항목은 없으나 `f8c-lightning`의 스킨형/특수형으로 중복 후보 처리
- 대형 전투함 중 cargo가 있는 항목: 함선DB에는 유지하되 무역플래너 노출은 보수적으로 제외
- 지상 차량과 스누브 함선: 함선DB에는 유지하되 단일 화물 운송 플래너에서는 제외

## QA 체크포인트

- 함선DB 전체 로딩
- 미구현 제외 토글 동작
- 가격/화물량 정렬 동작
- 함선 상세 모달의 cargo 표시
- 함선 비교의 cargo 표시
- 무역플래너 함선 검색에서 미구현/중복/cargo 0 후보 제외
- 함선DB에서 무역플래너로 전달되는 함선이 `plannerEligible: true`일 때만 정상 전달
