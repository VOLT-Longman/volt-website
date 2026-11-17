# 로드아웃 조사 스크립트

게임 파일과 UEX 자료에서 `data/loadout-research/*.json` 을 다시 만드는 도구입니다. 사이트 코드와 `data/loadout/` 은 읽기만 합니다.

## 준비

- Node 20 이상. 추가 패키지 없음.
- **게임 캐시 폴더**: `Game2.dcb`, `build.json`, `vehicles/*.xml` 이 든 폴더. `scripts/loadout/build-loadout-data.mjs --cache-dir <폴더>` 를 한 번 돌리면 만들어집니다. 저장소에 넣지 않습니다.
- **UEX 폴더**: UEX 응답을 저장해 둘 빈 폴더. 저장소 밖에 둡니다.

## 순서

```bash
node scripts/loadout-research/uex-audit.mjs --cache-dir <게임 캐시> --uex-dir <UEX 폴더> --fetch
node scripts/loadout-research/extract-profiles.mjs --cache-dir <게임 캐시>
node scripts/loadout-research/validate.mjs
node scripts/loadout-research/build-manifest.mjs
```

| 스크립트 | 하는 일 | 결과 |
| --- | --- | --- |
| `uex-audit.mjs` | UEX 15개 분류의 품목·판매 기록을 `data/loadout/items.json` 과 전수 대조. `--fetch` 가 없으면 UEX 폴더에 저장된 응답을 씀 | `component-identities.json`, `shop-coverage.json` |
| `extract-profiles.mjs` | 게임 파일에서 전력·무기·방어·퀀텀·레이더·비행·보조 장비 원본 값 추출 | `power-`, `weapon-`, `defense-`, `quantum-`, `radar-`, `flight-`, `utility-profiles.json` |
| `validate.mjs` | 검증 사례 13건을 검산하고 사이트 계산기(`js/loadout-calc.js`)와 무기 전수 비교. 하나라도 어긋나면 종료 코드 1 | `validation-cases.json` |
| `build-manifest.mjs` | 파일 목록·해시·통계 정리 | `manifest.json` |
| `calc.mjs` | 기준 계산식(과열·축전·발사 주기·퀀텀·전력 구간). 다른 스크립트가 불러 씀 | — |
| `lib.mjs` | 공용 도구(게임 자료 읽기, 열거형 표, 쓰기) | — |

## 조사 보조

```bash
# 레코드 찾기
node scripts/loadout-research/probe.mjs --cache-dir <게임 캐시> --find "qtnk_aegs_avenger"
# 한 부품의 구성 요소를 경로=값으로 (연출·음향 가지 제외)
node scripts/loadout-research/shape.mjs --cache-dir <게임 캐시> --cls AMRS_LaserCannon_S3 --comp SCItemWeaponComponentParams --skip "noPowerStats|underpowerStats|overpowerStats"
# 필드 이름만
node scripts/loadout-research/keys.mjs --cache-dir <게임 캐시> --cls Controller_Flight_AEGS_Avenger_Stalker --comp IFCSParams --levels 3
# 원본 레코드 전체 (정규식으로 거르기)
node scripts/loadout-research/probe.mjs --cache-dir <게임 캐시> --cls QDRV_TARS_S01_Expedition_SCItem --grep "quantumFuel|driveSpeed"
```

## 규칙

- 원본 필드 이름을 그대로 둡니다. 계산값은 `derived` 아래에만 둡니다.
- 확인하지 못한 값은 `null`. 원본에 없는 칸은 싣지 않습니다. 0 으로 채우지 않습니다.
- 해석이 갈리는 값은 하나로 못박지 않고 `variants` 로 나란히 냅니다.
- 게임 원본과 UEX 원본 응답은 커밋하지 않습니다.
- 다른 계산기 사이트의 자료·코드는 가져오지 않습니다.
