# 출처

## 1. 게임 파일 (1순위)

| 자료 | 위치 | 쓰임 |
| --- | --- | --- |
| `Game2.dcb` | `Data.p4k` 안 `Data/Game2.dcb` | 부품·함선의 모든 수치. `scripts/gamedata/dataforge.mjs` 로 읽음 |
| 함선 구조 XML | `Data/Scripts/Entities/Vehicles/Implementations/Xml/*.xml` (CryXmlB) | 선체 부위(`Part`)의 내구도·질량 |
| `build_manifest.id` | 게임 설치 폴더 | 빌드 번호 |

- 빌드: `sc-alpha-4.10.0`, 버전 `4.10.200.58746`, 변경 번호 `13165946`, 빌드 날짜 2026-11-11.
- 원본은 저장소에 넣지 않고 캐시 폴더에서 읽습니다. 스크립트는 `--cache-dir` 로 그 폴더를 받습니다(`Game2.dcb`, `build.json`, `vehicles/`).

### 주요 레코드와 구성 요소

| 대상 | 레코드 / 구성 요소 |
| --- | --- |
| 전력·냉각·신호 | `EntityClassDefinition.*` → `ItemResourceComponentParams.states[].{deltas[], powerRanges, signatureParams}` |
| 온도·과열(부품) | `SEntityPhysicsControllerParams.PhysType.temperature` |
| 디스토션 | `SDistortionParams` |
| 함선 전력 묶음 | 함선 `SItemPortContainerComponentParams.resourceNetworkPowerPools.itemPools[]` |
| 전력망 전역 값 | `ItemResourceNetworkGlobal.ItemResourceNetworkGlobal` |
| SCM/NAV 제외 | `MasterModeExclusionGlobalParams.MasterModeExclusionGlobalParams` |
| 배분 곡선 | `CapacitorAssignmentInputOutputDef.*` (16개) |
| 무기 | `SCItemWeaponComponentParams.{fireActions[], connectionParams, weaponRegenConsumerParams}` |
| 탄약 | `SAmmoContainerComponentParams.ammoParamsRecord` → `AmmoParams.*` |
| 짐벌 계수 | `WeaponGimbalModeModifierDef.*` (배열 칸 = `EGimbalMode`) |
| 미사일·폭탄·EMP | `SCItemMissileParams`, `SCItemBombParams`, `SCItemEMPParams`, `SCItemQuantumInterdictionGeneratorParams` |
| 실드 | `SCItemShieldGeneratorParams`, 함선의 `SCItemShieldEmitterParams` |
| 장갑 | 기본 장착 Armor 부품의 `SCItemVehicleArmorParams`, `SHealthComponentParams` |
| 선체·관통 배수 | 함선 `VehicleComponentParams` + 구조 XML `Part@damageMax` |
| 퀀텀 | `SCItemQuantumDriveParams`, 탱크 `ResourceContainer.capacity` |
| 레이더 | `SCItemRadarComponentParams`, `RadarSystemGlobalParams`, `RadarSystemSharedParams.*` |
| 방향별 CS | 함선 `SSCSignatureSystemParams.radarProperties.crossSectionParams.crossSection` |
| 비행 | 기본 장착 FlightController 의 `IFCSParams`, 추진기 `SCItemThrusterParams` |
| 비행 블레이드 | `SIFCSModifiersLegacy.FlightBlade_{HND,SPD}`, `Controller_Flight_<함선>_Flight_Blade_{HND,SPD}` |
| 열거형 | DCB 의 enum 표 (`ESignatureType`, `EMasterMode`, `EGimbalMode`, `EAimableUser`, `DamageTypes`, `EThrusterType`, `EIFCSModifiableNumbersLegacy`, `EIFCSModifiableVectorsLegacy`) |

배열 칸의 의미는 추측하지 않고 열거형 표에서 읽었습니다. 예: 레이더 `signatureDetection[0..7]` = Infrared, Electromagnetic, CrossSection, Decibel, Resource, Identity, CommsSignal, Interactable.

## 2. UEX (판매처·가격)

- API: `https://api.uexcorp.uk/2.0/items?id_category=N`, `…/items_prices?id_category=N` (공개, 인증 없음)
- 분류: 19 냉각기, 21 발전기, 22 퀀텀 드라이브, 23 실드, 29 채광 헤드, 30 채광 모듈, 32 기총, 33 미사일 랙, 34 미사일, 35 터렛, 67 트랙터 빔, 70 폭탄, 83 레이더, 86 점프 모듈, 110 샐비지 빔
- 조회 시각: `component-identities.json` 의 `meta.uexFetchedAt` (분류별)
- 보존한 칸: UEX 품목 ID, UUID, 이름, 규격, 터미널 ID·이름·코드, 위치(도시/정거장/전초기지/위성/행성), 성계, 구매가, 가격 갱신 시각, 가격의 게임 버전
- UEX 의 `size` 칸은 UUID 와 이름이 모두 맞는 부품에서도 89건이 게임 자료와 달랐습니다. **규격은 게임 파일을 기준으로 하고 UEX 규격은 참고로만 씁니다.**

## 3. 한국어 표기

- `LIVE/data/Localization/korean_(south_korea)/global.ini` — 화면 용어는 이 파일의 표기를 따릅니다(이번 조사에서는 새 용어를 만들지 않았습니다).

## 4. 쓰지 않은 자료

| 자료 | 이유 |
| --- | --- |
| Erkul DPS Calculator 의 자료 파일·API·코드 | 저장소 원칙상 가져오지 않습니다. **화면에 표시된 수치만** 소유자 승인을 받아 읽었습니다(2026-11-17, 어벤저 스토커 한 척: 항속·연료 소비 표기, C-788 연사·DPS, AD4B·Omnisky IX 지속 DPS, 선체 부위 묶음). 읽은 값은 검증 사례의 `observed` 칸에만 있고 다른 자료 파일에는 쓰지 않았습니다. |
| RSI 공식 설명 페이지 | 이번 범위의 수치(전력 구간, 과열, 관통)는 공식 문서에 수치로 공개된 것이 없어 인용하지 않았습니다. |
| 게임 안 실측 | 하지 않았습니다. 실측이 있어야 확정되는 항목은 `formulas.md` 와 `implementation-map.md` 에 표시했습니다. |

## 5. 사이트의 기존 자료 (비교 대상)

- `data/loadout/items.json` — 사이트가 쓰는 부품 표(1,575종). 대조의 기준.
- `js/loadout-calc.js` — 사이트 계산기. `validate.mjs` 가 무기 192종을 전수 비교합니다.
- `functions/api/uex/loadout-prices.js`, `js/loadout.js`(`UEX_CATEGORY`), `js/loadout-planner.js` — 판매처 조회·연결 방식.
