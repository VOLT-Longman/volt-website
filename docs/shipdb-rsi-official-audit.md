# ShipDB Erkul 재작성 v2 — RSI 공식 카탈로그 출처 감사 (Step 2)

- **정책(PM 2026-07-18)**: Erkul live 없는 30척의 사실 기준 = RSI 공식 자료(Ship Matrix·공식 페이지·브로슈어 PDF)만. VOLT 수기 데이터 재사용 금지. 공식 근거 없는 값은 빈값, 기존 데이터로 보완하지 않음.
- **카탈로그 상태**: 정확성 우선(PM). `catalogStatus` = concept 28 · flight-ready 2. 배지: concept="컨셉 · RSI 공식 사양 · 변경 가능", flight-ready="출시 · RSI 공식 사양".
- **출처**: RSI Ship Matrix (robertsspaceindustries.com/ship-matrix/index)
- **확인일(retrievedAt)**: 2026-07-18
- **원본 스냅샷**: `data/external/rsi/official-ship-matrix.json` (사실원). 생성물: `data/canonical/ships-rsi-official.json`.
- **주의(HP·속도·DPS·구매처·대여·시세·무역수익)**: RSI 비제공 게임플레이 값은 카탈로그에 포함하지 않음(추정 금지).

## 출처 감사표 (30척)

| id | catalogStatus | 출처 URL | 출처 유형 | 확인일 | RSI 상태 | 제조사 | 역할 | 크기 | 승무원 | 화물 | 설명 | 확인 가능 필드 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `arrastra` | concept | [link](https://robertsspaceindustries.com/pledge/ships/arrastra/Arrastra) | ship-matrix | 2026-07-18 | in-concept | Roberts Space Industries | Mining / Refining | large | 2~5 | 576 | Y | 제조사·역할·크기·승무원·화물·설명 |
| `atls` | flight-ready | [link](https://robertsspaceindustries.com/pledge/ships/atls/ATLS) | ship-matrix | 2026-07-18 | flight-ready | Argo Astronautics | Industrial | vehicle | 1~1 | — | Y | 제조사·역할·크기·승무원·설명 |
| `atls-geo` | flight-ready | [link](https://robertsspaceindustries.com/pledge/ships/atls/ATLS-GEO) | ship-matrix | 2026-07-18 | flight-ready | Argo Astronautics | Industrial | vehicle | 1~1 | 0.01 | Y | 제조사·역할·크기·승무원·화물·설명 |
| `crucible` | concept | [link](https://robertsspaceindustries.com/pledge/ships/crucible/Crucible) | ship-matrix | 2026-07-18 | in-concept | Anvil Aerospace | Heavy Repair | large | 3~8 | 240 | Y | 제조사·역할·크기·승무원·화물·설명 |
| `e1-spirit` | concept | [link](https://robertsspaceindustries.com/pledge/ships/spirit/E1-Spirit) | ship-matrix | 2026-07-18 | in-concept | Crusader Industries | Passenger | medium | 1~2 | 0 | Y | 제조사·역할·크기·승무원·화물·설명 |
| `endeavor` | concept | [link](https://robertsspaceindustries.com/pledge/ships/misc-endeavor/Endeavor) | ship-matrix | 2026-07-18 | in-concept | MISC | Heavy Science | capital | 3~5 | 500 | Y | 제조사·역할·크기·승무원·화물·설명 |
| `expanse` | concept | [link](https://robertsspaceindustries.com/pledge/ships/expanse/Expanse) | ship-matrix | 2026-07-18 | in-concept | MISC | Refinery | small | 1~1 | 64 | — | 제조사·역할·크기·승무원·화물 |
| `g12` | concept | [link](https://robertsspaceindustries.com/pledge/ships/origin-g12/G12) | ship-matrix | 2026-07-18 | in-concept | Origin Jumpworks | Touring | vehicle | — | 2 | Y | 제조사·역할·크기·화물·설명 |
| `g12a` | concept | [link](https://robertsspaceindustries.com/pledge/ships/origin-g12/G12a) | ship-matrix | 2026-07-18 | in-concept | Origin Jumpworks | Military | vehicle | — | — | Y | 제조사·역할·크기·설명 |
| `g12r` | concept | [link](https://robertsspaceindustries.com/pledge/ships/origin-g12/G12r) | ship-matrix | 2026-07-18 | in-concept | Origin Jumpworks | Racing | vehicle | — | — | Y | 제조사·역할·크기·설명 |
| `galaxy` | concept | [link](https://robertsspaceindustries.com/pledge/ships/galaxy/Galaxy) | ship-matrix | 2026-07-18 | in-concept | Roberts Space Industries | Modular | large | 1~6 | 64 | Y | 제조사·역할·크기·승무원·화물·설명 |
| `genesis` | concept | [link](https://robertsspaceindustries.com/pledge/ships/starliner/Genesis) | ship-matrix | 2026-07-18 | in-concept | Crusader Industries | Passenger | large | 2~8 | 0 | Y | 제조사·역할·크기·승무원·화물·설명 |
| `hull-d` | concept | [link](https://robertsspaceindustries.com/pledge/ships/hull/Hull-D) | ship-matrix | 2026-07-18 | in-concept | MISC | Heavy Freight | capital | 3~5 | 6912 | Y | 제조사·역할·크기·승무원·화물·설명 |
| `hull-e` | concept | [link](https://robertsspaceindustries.com/pledge/ships/hull/Hull-E) | ship-matrix | 2026-07-18 | in-concept | MISC | Heavy Freight | capital | 4~5 | 12288 | Y | 제조사·역할·크기·승무원·화물·설명 |
| `javelin` | concept | [link](https://robertsspaceindustries.com/pledge/ships/aegis-javelin/Javelin) | ship-matrix | 2026-07-18 | in-concept | Aegis Dynamics | Destroyer | capital | 12~65 | 5400 | Y | 제조사·역할·크기·승무원·화물·설명 |
| `kraken` | concept | [link](https://robertsspaceindustries.com/pledge/ships/drake-kraken/Kraken) | ship-matrix | 2026-07-18 | in-concept | Drake Interplanetary | Multi-Role / Light Carrier | capital | —~10 | 3792 | Y | 제조사·역할·크기·승무원·화물·설명 |
| `kraken-privateer` | concept | [link](https://robertsspaceindustries.com/pledge/ships/drake-kraken/Kraken-Privateer) | ship-matrix | 2026-07-18 | in-concept | Drake Interplanetary | Multi-Role / Light Carrier | capital | —~10 | 768 | Y | 제조사·역할·크기·승무원·화물·설명 |
| `legionnaire` | concept | [link](https://robertsspaceindustries.com/pledge/ships/legionnaire/Legionnaire) | ship-matrix | 2026-07-18 | in-concept | Anvil Aerospace | Boarding | small | 1~2 | 0 | Y | 제조사·역할·크기·승무원·화물·설명 |
| `liberator` | concept | [link](https://robertsspaceindustries.com/pledge/ships/liberator/Liberator) | ship-matrix | 2026-07-18 | in-concept | Anvil Aerospace | Light Carrier | large | 1~2 | 400 | Y | 제조사·역할·크기·승무원·화물·설명 |
| `merchantman` | concept | [link](https://robertsspaceindustries.com/pledge/ships/merchantman/Merchantman) | ship-matrix | 2026-07-18 | in-concept | Banu | Heavy Freight | large | 4~8 | 2880 | Y | 제조사·역할·크기·승무원·화물·설명 |
| `nautilus` | concept | [link](https://robertsspaceindustries.com/pledge/ships/aegis-nautilus/Nautilus) | ship-matrix | 2026-07-18 | in-concept | Aegis Dynamics | Minelayer | large | 4~8 | 64 | Y | 제조사·역할·크기·승무원·화물·설명 |
| `nautilus-solstice-edition` | concept | [link](https://robertsspaceindustries.com/pledge/ships/aegis-nautilus/Nautilus-Solstice-Edition) | ship-matrix | 2026-07-18 | in-concept | Aegis Dynamics | Minelayer | large | 4~8 | 64 | Y | 제조사·역할·크기·승무원·화물·설명 |
| `odyssey` | concept | [link](https://robertsspaceindustries.com/pledge/ships/odyssey/Odyssey) | ship-matrix | 2026-07-18 | in-concept | MISC | Expedition | large | 1~6 | 252 | Y | 제조사·역할·크기·승무원·화물·설명 |
| `orion` | concept | [link](https://robertsspaceindustries.com/pledge/ships/orion/Orion) | ship-matrix | 2026-07-18 | in-concept | Roberts Space Industries | Heavy Mining | capital | 4~7 | 384 | Y | 제조사·역할·크기·승무원·화물·설명 |
| `pioneer` | concept | [link](https://robertsspaceindustries.com/pledge/ships/pioneer/Pioneer) | ship-matrix | 2026-07-18 | in-concept | Consolidated Outland | Heavy Construction | capital | 4~8 | 1000 | Y | 제조사·역할·크기·승무원·화물·설명 |
| `ranger-cv` | concept | [link](https://robertsspaceindustries.com/pledge/ships/tumbril-ranger/Ranger-CV) | ship-matrix | 2026-07-18 | in-concept | Tumbril | Touring | vehicle | 1~1 | 0 | Y | 제조사·역할·크기·승무원·화물·설명 |
| `ranger-rc` | concept | [link](https://robertsspaceindustries.com/pledge/ships/tumbril-ranger/Ranger-RC) | ship-matrix | 2026-07-18 | in-concept | Tumbril | Racing | vehicle | 1~1 | 0 | Y | 제조사·역할·크기·승무원·화물·설명 |
| `ranger-tr` | concept | [link](https://robertsspaceindustries.com/pledge/ships/tumbril-ranger/Ranger-TR) | ship-matrix | 2026-07-18 | in-concept | Tumbril | Combat | vehicle | 1~1 | 0 | Y | 제조사·역할·크기·승무원·화물·설명 |
| `vulcan` | concept | [link](https://robertsspaceindustries.com/pledge/ships/vulcan/Vulcan) | ship-matrix | 2026-07-18 | in-concept | Aegis Dynamics | Medium Repair / Medium Refuel | medium | 1~3 | 12 | Y | 제조사·역할·크기·승무원·화물·설명 |
| `zeus-mk2-mr` | concept | [link](https://robertsspaceindustries.com/pledge/ships/zeus-mk-ii/Zeus-Mk-II-MR) | ship-matrix | 2026-07-18 | in-concept | Roberts Space Industries | Interdiction | medium | 1~3 | 16 | Y | 제조사·역할·크기·승무원·화물·설명 |

## 빈값·이상 (PM 보고 — 임의 보완하지 않음)

- **설명 없음(RSI 미제공)**: `expanse` → `descriptionEn=null`. 화면에는 "RSI 공식 설명 미제공" 상태만 표시, KO 번역 대상 제외.
- **화물 null**: `atls`, `g12a`, `g12r` → 빈값 유지.
- **승무원 null 포함**: `g12`, `g12a`, `g12r`, `kraken`, `kraken-privateer` → RSI 미명시분 빈값.
- **flight-ready(출시, 컨셉 아님)**: `atls`, `atls-geo` — RSI Ship Matrix상 출시 상태. PM A 결정으로 "출시 · RSI 공식 사양" 배지, `catalogStatus:"flight-ready"`.

## 필드 커버리지

| 필드 | 확보 | 빈값 |
|---|---|---|
| 제조사 | 30 | 0 |
| 역할 | 30 | 0 |
| 크기 | 30 | 0 |
| 승무원(일부라도) | 27 | 3 |
| 화물 | 27 | 3 |
| 설명 | 29 | 1 |
