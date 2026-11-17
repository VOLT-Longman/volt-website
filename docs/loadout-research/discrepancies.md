# 어긋난 것 목록

수치는 `manifest.json` 의 조사 시각 기준입니다. UEX 자료가 바뀌면 달라지므로 `scripts/loadout-research/uex-audit.mjs --fetch` 로 다시 셉니다.
세부 목록은 모두 `data/loadout-research/component-identities.json` 과 `validation-cases.json` 에 있습니다.

## A. UEX 판매처 대조 (15개 분류, 품목 704개, 판매 기록 3,384건)

| 항목 | 이번 결과 | 직전 감사 | 자료 위치 |
| --- | --- | --- | --- |
| UUID 없는 UEX 품목 | 100개 (판매 기록 있는 것 **77개**) | 77개 | `uexItemsWithoutUuid` |
| 숨긴 중복 항목에 판매 기록이 남은 건 | **11건** (대표 부품이 자기 기록을 가진 경우 0건) | 11건 | `hiddenDuplicatesWithShops` |
| 조회 분류 밖: 채광 모듈(30) | 27종, 판매 기록 있는 것 **26종** (318건) | 26종 | `categoriesOutsideSiteQuery` |
| 조회 분류 밖: 트랙터 빔(67) | 9종, 판매 기록 있는 것 **8종** (149건) | 8종 | 〃 |
| 조회 분류 밖: 샐비지 빔(110) | **4종** (65건) | 4종 | 〃 |
| UEX UUID 가 사이트 부품 표에 없음 | 12건 | — | `uexUuidNotInLoadoutItems` |
| UUID 는 같은데 이름이 다른 물건 | 29건 (판매 기록 있는 것 5건) | — | `uuidLinkedButNameOrSizeDiffers` (`name-conflict`) |
| 한 UUID 를 여러 UEX 품목이 함께 씀 | 17개 UUID | — | `uuidsSharedBySeveralUexItems` |
| UEX 규격이 게임 자료와 다름 | 89건 | — | 〃 (`uex-size-differs`) |
| 연결되지 않는 판매 기록 | 260건 / 3,384건 | — | `totals.shopRowsUnlinked` |

### A-1. UUID 없는 판매 품목 77개

| 분류 | 판매 기록 있는 수 | 상태 |
| --- | --- | --- |
| 레이더(83) | 50 | 46개는 이름·규격이 맞는 후보 1개, 3개는 규격 미기재, 1개는 규격 불일치(Observer-Go) |
| 미사일(34) | 22 | 모두 이름이 맞는 후보 1개(11개는 UEX 규격 미기재) |
| 터렛(35) | 4 | 후보 1개 3건, 후보 2개 1건(M2C "Swarm": `Turret_PDC_VNCL`, `Turret_PDC_BEHR_A`) |
| 기총(32) | 1 | 규격 미기재 후보 1개 |

- 사이트는 지금 이름·규격이 같고 후보가 하나일 때 이 기록을 연결합니다(`js/loadout.js` `priceInfo`). 이 방식은 유지할 수 있지만 UUID 로 확정된 것이 아니므로 화면에서 구분해 보여야 합니다.
- **Observer-Go:** UEX 는 S1, 게임 자료(`RADR_CHCO_S00_ObserverGo`)는 S0. 규격이 달라 연결을 보류합니다. UEX 의 `size` 칸이 다른 부품 89건에서도 어긋나므로 UEX 쪽 오기일 가능성이 높지만 확정하지 않았습니다.

### A-2. 숨긴 중복 항목 11건 — 대표 부품에 판매처가 안 보임

UEX 의 UUID 가 사이트가 숨긴 내부 변형을 가리키고, 대표 부품은 자기 UUID 로 된 UEX 기록이 없습니다.

| UEX 품목 | 숨긴 항목(UEX 가 가리킴) | 대표 부품 | 판매 기록 |
| --- | --- | --- | --- |
| Arbor MH1 Mining Laser | `Mining_Laser_MPUV_Arm` | `Mining_Laser_GRIN_Arbor_S1` | 6 |
| PyroBurst Scattergun | `AMRS_AAgun_CC_S3` | `AMRS_ScatterGun_S3` | 16 |
| M8A Cannon | `BEHR_LaserCannon_S6_SecurityNetwork` | `BEHR_LaserCannon_S6` | 4 |
| GVSR Repeater | `BEHR_LaserRepeater_S10_SecurityNetwork` | `BEHR_LaserRepeater_S10` | 5 |
| CF-227 Badger Repeater | `KLWE_LaserRepeater_PDC_S2` | `KLWE_LaserRepeater_S2` | 15 |
| CF-557 Galdereen Repeater | `KLWE_LaserRepeater_S5_Idris_M` | `KLWE_LaserRepeater_S5` | 2 |
| CF-667 Mammoth Repeater | `KLWE_LaserRepeater_S6_LowPoly` | `KLWE_LaserRepeater_S6` | 2 |
| Attrition-4 Repeater | `HRST_LaserRepeater_S4_Turret` | `HRST_LaserRepeater_S4` | 13 |
| CF-447 Rhino Repeater | `KLWE_LaserRepeater_S4_LowPoly` | `KLWE_LaserRepeater_S4` | 15 |
| MSD-543 Missile Rack | `MRCK_S05_BEHR_Quad_S03_a` | `MRCK_S05_BEHR_Quad_S03` | 22 |
| Tempest II Missile | `MISL_S02_CS_FSKI_Tempest_CitCon` | `MISL_S02_CS_FSKI_Tempest` | 4 |

고칠 방법: 판매처를 찾을 때 `alias` 가 그 대표인 숨긴 항목들의 UUID 도 함께 찾습니다.

### A-3. 잘못된 부품에 판매 기록이 붙는 경우 (5건)

UEX 가 서로 다른 품목에 같은 UUID 를 써서, 그 판매 기록이 사이트에서는 다른 이름의 부품에 붙습니다.

| UEX 품목 | 같은 UUID 의 게임 부품 | 판매 기록 |
| --- | --- | --- |
| Axiom L-22 Repeater | ATVS Repeater (`BEHR_DistortionRepeater_VNG_S2`) | 2 |
| Scimitar V-G Missile | Scimitar V Missile | 5 |
| Hellion VII-G Missile | Hellion VII Missile | 5 |
| Calamity XII-IR Torpedo | Calamity XII-EM Torpedo | 2 |
| S00 Hofstede | `Mining_Laser_SHIN_Hofstede_S0` (게임 쪽 이름 없음) | 24 |

판매 기록이 없는 같은 종류 24건(Jericho·Liberator 7종이 모두 Lightstrike I 의 UUID 를 쓰는 등)은 지금은 해가 없지만 UEX 에 기록이 생기면 같은 문제가 납니다. 연결할 때 **UUID 가 같아도 이름이 서로 포함 관계가 아니면 보류**하는 검사가 필요합니다.

### A-4. UEX UUID 가 사이트 부품 표에 없는 12건

- `S0 Helix`(채광 헤드, `Mining_Laser_THCN_Helix_S0`, 판매 기록 24건): 게임에는 있지만 `data/loadout/items.json` 에 없습니다 — 어떤 함선의 기본 장착에도 쓰이지 않아 추출기에서 빠진 것으로 보입니다. **구매 가능한 부품이 선택 목록에 없는 경우**입니다.
- 나머지 11건은 판매 기록이 없습니다: 자리표시 부품(`_Dummy`, `_Placeholder`), 이 빌드에 없는 UUID 2건(Tigerstrike T-21, PX-T12 "Apex"), UEX 분류 오류 1건(냉각기 분류의 "Mercury" 는 화물).

### A-5. 같은 이름·다른 물건, 도색, 함선 전용

- 같은 이름인데 규격·종류가 다른 묶음 30개, 같은 규격인데 수치가 다른 묶음 34개, 완전히 같은 복사본 21개(`sameNameGroups`).
  예: "Main Powerplant"(리클레이머·이드리스·벵갈 전용 S4 3종), "Stellate", "Serac".
- 도색 변종 12종(`paintVariants`): 클래스명 접미사 `_mr01`, `_mr02`, `_CleanAir`, `_Shark`. 수치는 기본형과 같지 않은 것으로 나옵니다(이름·태그 차이 포함) — 성능 칸만 비교하는 추가 확인이 필요합니다.
- 함선 전용 변형 4종(`shipSpecificVariants`): 수치가 다르고 실제 함선에 달려 나오는 것.

### A-6. 게임에는 있는데 UEX 에 같은 UUID 기록이 없는 부품

648종(`gameProductsWithoutUexRecord`). 대부분은 함선 고정 구조물(터렛 224, 터렛 받침 129, 랙 86)이라 판매 대상이 아닙니다. 낱개 제품 쪽은 기총 62, 레이더 57(UEX 가 UUID 를 안 적음), 미사일 33, 발전기 8, 샐비지 모듈 6, 냉각기 5, 채광 모듈 4 입니다.

## B. 사이트 계산기와 기준 계산의 차이 (무기 192종 전수 비교)

순간 DPS 는 192종 모두 일치합니다. 지속 DPS 는 **12종**이 0.5% 넘게 다릅니다(`validation-cases.json` → `siteCalculatorComparison`).

| 원인 | 무기 수 | 예 | 사이트 값 → 기준 값 |
| --- | --- | --- | --- |
| 발 사이 충전을 반영하지 않음 (발사 간격이 충전 지연보다 긴 무기) | 10 | 산탄총 7종, 'WAR' 캐논, 싱(Singe) 캐논 2종 등 | 싱 S2: 167.6 → 195.5 |
| 과열 뒤 남는 온도(`temperatureAfterOverheatFix` 99)를 첫 주기의 시작 온도로 씀 | 2 | 벵갈 S6 개틀링, `GLSN_BallisticGatling_S2` | 57.7 → 1,340.8 / 9.2 → 252.9 |

그 밖에 값은 같지만 알아 둘 점:

- 사이트는 과열 주기에서는 마지막 발 뒤 간격을 빼고, 축전 주기에서는 넣습니다(서로 다른 경계).
- 점사 무기(1종)는 점사 사이 대기(`cooldownTime`)를 계산에 넣지 않습니다.
- 짐벌 수동·자동·조준 모드의 연사 0.85배를 반영하지 않습니다(고정 기준 값만 표시).
- 퀀텀 이동 시간은 2단계 가속만 쓰는 사다리꼴입니다.

## C. 다른 계산기와의 차이 원인

상대 계산기의 화면·자료는 열지 않았습니다(`sources.md` 4장). 아래는 원본 값에서 계산으로 좁힌 후보입니다.

### C-1. 스토커 + Expedition 항속: VOLT 61 Gm 대 120 Gm

| 확인한 것 | 값 | 근거 |
| --- | --- | --- |
| 스토커 퀀텀 탱크 | 0.6 SCU | `QTNK_AEGS_Avenger_Stalker` → `ResourceContainer.capacity.standardCargoUnits = 0.6000000238` |
| Expedition 요구량 | 0.0098 | `QDRV_TARS_S01_Expedition_SCItem` → `quantumFuelRequirement = 0.0098000001` |
| VOLT 식 | 0.6 ÷ 0.0098 = 61.22 Gm | `js/loadout-calc.js` |
| 120 Gm 이 나오는 조건 | 요구량 0.005, 또는 탱크 1.176 SCU | 0.6 ÷ 120 = 0.005 |

- 두 값의 비는 1.96 입니다. 단위 환산(10의 거듭제곱)이나 반올림으로는 나올 수 없는 비이므로 **단위·공식 차이가 아니라 원본 값 차이**입니다.
- 이 빌드의 S1 드라이브 가운데 요구량이 0.005 에 가까운 것은 LightFire(0.0049 → 122.4 Gm)뿐이고, Expedition 은 0.0098 입니다.
- 따라서 후보는 (1) 상대 쪽 자료가 다른 판(요구량이 약 절반이던 시점)이거나, (2) 상대 쪽 탱크 값이 다르거나(예: 수소 탱크 2개 합 1.2 SCU 를 쓴 경우 1.2 ÷ 0.0098 = 122.4 Gm), (3) 화면에서 다른 드라이브가 선택된 경우입니다. (2)의 122.4 와 LightFire 의 122.4 가 모두 "약 120"으로 보일 수 있습니다.
- **VOLT 값(61 Gm)은 현재 빌드의 원본 값을 그대로 나눈 것이고 계산 오류는 찾지 못했습니다.** 어느 후보인지는 상대 쪽 입력값(탱크·요구량)을 봐야 확정됩니다.

### C-2. C788 순간 DPS

- `BEHR_BallisticCannon_S4` 의 `fireActions[0]` 은 순차 사격이고 **항목 간격은 40 RPM, 안쪽 동작의 `fireRate` 는 50** 입니다.
- 40 RPM: 975 × 40 ÷ 60 = **650** (VOLT). 50 RPM: 975 × 50 ÷ 60 = **812.5**.
- 차이가 162.5(25%)라면 원인은 이것입니다. 이런 무기가 25종 있습니다(`manifest.json` → `stats.weapons.sequenceRateDiffersFromInnerFireRate`).
- 어느 쪽이 실제 연사인지는 게임 안에서 10발 쏘는 시간을 재면 확정됩니다(40 RPM 이면 13.5초, 50 RPM 이면 10.8초).

### C-3. 스토커 AD4B + Omnisky IX 2정 지속 DPS

| 해석 | AD4B | Omnisky IX ×2 | 합 |
| --- | --- | --- | --- |
| 사이트 방식 (과열 제외·축전 포함) | 1,086.95 | 580.62 | **1,667.57** |
| 둘 다 마지막 간격 포함 | 1,082.24 | 580.62 | 1,662.86 |
| 둘 다 제외 | 1,086.95 | 593.22 | 1,680.17 |
| AD4B 회전 시작 시간(0.198초) 포함 | 1,073.06 | 580.62 | 1,653.68 |
| 사격 중 충전 허용 | 1,086.95 | 1,093.50 | 2,180.45 |
| 짐벌 수동·자동(연사 0.85배) | 순간 DPS 가 2,359.5 → 2,005.6 으로 내려가고 과열·탄창 주기도 함께 길어짐 | | |

- 경계 조건(간격 한 번)만으로는 최대 17 정도(1%)만 벌어집니다.
- 그보다 큰 차이는 사격 중 충전 여부, 짐벌 모드, 무기 묶음 전력(4칸)에 따른 탄창 크기 중 하나에서 옵니다. 앞의 둘은 값으로 실었고, 마지막은 환산식이 자료에 없습니다.

## D. 자료 안의 이상한 값 (그대로 실음)

- 스토커 역추진기(`AEGS_Avenger_Thruster_Retro` ×2)의 `thrustCapacity` 합이 41,982 N 으로 주 추진기(5,047,832 N)의 0.8% 입니다. 원본 값 그대로이며, 실제 감속은 기동 추진기가 맡는 것으로 보입니다.
- 추진기 `thrustCapacityNew` 가 0 이 아닌 함선이 17척 있습니다. 어느 칸이 쓰이는지 미확인.
- 도탄 기준의 `healthCurve` 는 222척 모두 비어 있습니다.
- 탄약의 거리별 피해 감소(`damageDropParams`)는 193종 모두 비어 있습니다.
- 에너지 무기의 `maxAmmoLoad / maxRegenPerSec` 는 종류별로 25/3(캐논), 75/15(리피터) 등 몇 가지 값만 씁니다. `requestedAmmoLoad ÷ regenerationCostPerBullet` 는 무기마다 다릅니다(Omnisky IX 100발, 싱 S2 3.25발). 둘 중 어느 쪽이 실제 탄창인지에 따라 지속 DPS 가 달라집니다 — 사이트는 앞의 값을 씁니다.
