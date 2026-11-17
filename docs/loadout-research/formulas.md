# 계산 규칙

각 항목은 **원본 필드 → 단위 → 식 → 적용 조건 → 상태** 순서로 적습니다.
식의 기준 구현은 `scripts/loadout-research/calc.mjs`, 검산은 `data/loadout-research/validation-cases.json` 입니다.
"자료에 없다"는 말은 게임 파일에 수치는 있지만 그것을 쓰는 식이 실행 코드 안에 있어 파일만으로는 알 수 없다는 뜻입니다.

## 3. 부품 식별

- 연결 열쇠는 게임 레코드 GUID(`uuid`)입니다. UEX 품목의 `uuid` 가 `data/loadout/items.json` 의 키와 같을 때만 `verified`.
- 사이트가 숨긴 중복 항목(`hidden: true`, `alias` = 대표)에 UEX 기록이 붙어 있으면 **대표 부품으로 옮겨 보여야** 합니다: `대표의 판매처 = 대표 UUID 기록 ∪ (alias 가 대표인 숨긴 항목들의 기록)`.
- UUID 가 없는 UEX 품목은 이름이 정확히 같고(대소문자·공백만 정규화) 종류·규격이 맞는 후보가 **하나뿐일 때만 후보**로 적습니다. 자동 확정하지 않습니다.
- UEX `size` 는 연결 판단에 쓰지 않습니다(89건 불일치).

## 4. 전력·냉각·운용 모드

### 4.1 발전량·요구량 (verified)

| 값 | 원본 필드 | 단위 |
| --- | --- | --- |
| 발전량 | 발전기 `states[Online].deltas[].generation.{resource: Power, resourceAmountPerSecond.units}` | 전력 칸 |
| 요구량(최대) | 부품 `…deltas[].consumption.{resource: Power, resourceAmountPerSecond.units \| standardResourceUnits}` | 전력 칸 (무기는 SRU) |
| 최소 요구 | 같은 delta 의 `minimumConsumptionFraction` × 요구량 | 전력 칸 |
| 우선순위 | `defaultPriority` (대부분 50, 냉각기 30) | — |
| 냉각 생산 | 냉각기 `deltas[]`(Conversion): Power 소비 → `generation.{resource: Coolant, …standardResourceUnits}` | SRU/초 |
| 전역 | `maxPowerToCoolantRatio = 2.5`, `powerBaseConversionRate = 1`, `thrusterCoolantMultiplier = 1` | — |

- 함선 합계: `발전량 합 = Σ 발전기`, `최대 요구 합 = Σ 요구량`, `최소 요구 합 = Σ 요구량 × minimumConsumptionFraction`.
  기본 장착 기준 값은 `power-profiles.json` → `ships.<cls>.defaultLoadoutTotals`.
- 222척 가운데 161척은 최대 요구 합이 발전량보다 큽니다(전부 최대로는 못 돌림). 5척은 최소 요구 합도 발전량을 넘습니다.
- 최소 요구 비율이 1 인 부품(퀀텀 드라이브, EMP, 퀀텀 차단기, 채광 헤드, 트랙터, 샐비지 헤드, 일부 실드·냉각기·레이더)은 **켜거나 끄는 것만** 됩니다.

### 4.2 전력 배분에 따른 성능 — 계단식 (conflicting)

`states[].powerRanges.{low, medium, high}.{start, modifier, registerRange}`

- `start` 는 비율이 아니라 **배정한 전력 칸 수의 문턱**입니다. 예: 어떤 S2 실드는 low 0.7 @1칸, medium 0.85 @3칸, high 1 @4칸.
- 읽는 법: 배정 칸 수가 `start` 이상인 구간 가운데 `start` 가 가장 큰 구간의 `modifier`.
  `1칸 → 0.7, 2칸 → 0.7, 3칸 → 0.85, 4칸 → 1`. **절반을 배정해도 0.5 가 아니라 0.7** 입니다.
- 실드·냉각기·레이더·퀀텀 드라이브에만 0.7 / 0.85 / 1 구간이 있고, 무기·발전기·터렛·랙은 세 구간 모두 1(전력에 따른 성능 변화 없음)입니다.
- 미확인: 이 계수가 곱해지는 대상(실드 재생량인지 최대 실드량인지, 냉각 생산량인지), 구간 사이를 잇는지 여부. → 게임 안에서 칸 수별 재생량을 재면 확정됩니다.

### 4.3 무기 전력과 축전 (conflicting)

- 함선마다 무기 전용 묶음이 있습니다: `resourceNetworkPowerPools.itemPools[]` 의 `FixedPowerPool {itemType: WeaponGun, poolSize}`. 크기는 2·4·6·8·10·20칸(스토커 4칸).
- 실드·비행 제어기·트랙터·채광·샐비지는 `DynamicPowerPool` (`maxItemCount`).
- 무기 쪽 값: `weaponRegenConsumerParams.{maxAmmoLoad, maxRegenPerSec, regenerationCooldown}` 와 `{requestedAmmoLoad, requestedRegenPerSec, regenerationCostPerBullet}`.
  앞의 셋은 탄창(발)·충전 속도(발/초)·충전 지연(초)으로 읽으면 사이트의 지속 DPS 가 맞습니다. 뒤의 셋은 묶음에 요청하는 양(요청 탄창 ÷ 발당 비용 = 발 수)입니다.
- 전력 계수: `connectionParams.{underpowerStats, overpowerStats, overclockStats}.regenModifier.{powerRatioMultiplier, maxAmmoLoadMultiplier, maxRegenPerSecMultiplier}` — 193종 모두 기본값(1)입니다. 즉 **무기별 자료에는 "전력을 덜 주면 탄창이 얼마나 줄어든다"는 값이 없습니다.** `noPowerStats` 만 연사·피해 0 입니다(184종).
- 묶음 크기(칸)와 탄창·충전 속도의 환산식은 자료에 없습니다. → 묶음에 전력을 1칸씩 바꿔 가며 탄창 수를 재야 합니다.

### 4.4 추진기·비행과 전력 (verified: 곡선 값)

`IFCSParams.accelerationData.linearThrustPowerAssignmentModifier` / `angularThrustPowerAssignmentModifier`, `speedProfile.powerAssignmentRotationModifier.mapping` — 점 6개의 곡선.
스토커: 직선 가속 계수는 배분 0 에서 0.8, 1 에서 1(곡선), 회전 가속은 0.92 → 1, 회전 속도는 0.87 → 1. **0 을 배정해도 0 이 되지 않습니다.**
곡선의 가로축(0–1)이 "엔진 삼각형 배분 비율"이라는 것은 이름으로 미룬 해석입니다.

부스트 축전: `afterburnerNew.{capacitorMax, capacitorAfterburnerIdleCost, capacitorRegenPerSec, capacitorRegenDelayAfterUse}` 와 `capacitorAssignmentInputOutputRegen`(예: `Linear_50_100` = 배분 0 에서 50%, 1 에서 100%).

### 4.5 SCM/NAV (verified)

`MasterModeExclusionGlobalParams.exclusions[]`: `Shield` 는 `Navigation` 에서, `QuantumDrive` 는 `SCM` 에서 꺼집니다. 부품별 예외는 `ItemControlComponentParams.masterModeExclusionsOverride`.
무기·미사일이 NAV 에서 잠기는 규칙은 이 목록에 없습니다(미확인).
속도: `IFCSParams.scmSpeed`(SCM), `boostSpeedForward/Backward`(부스트), `maxSpeed`(NAV).

### 4.6 장비 끄기와 하위 장비 (unavailable)

- 자료에서 확인되는 것: 끄면 그 부품의 요구량이 합에서 빠집니다. `noPowerStats` 가 있는 무기는 연사·피해 0.
- 릴레이(`isRelay`)·퓨즈 구조는 있지만 "상위 장비를 끄면 하위 포트 장비도 꺼지는가"는 자료에 식이 없습니다.

### 4.7 냉각·열·과열 (부품) (verified: 값 / unavailable: 진행식)

`PhysType.temperature.itemResourceParams.{overheatTemperature, overheatWarningTemperature, overheatRecoveryTemperature, minCoolingTemperature, stateHeatGenerationValues[].baselineTemperatureChange}`, `coolingEqualizationParams.{coolingEqualizationRate, temperatureDifference}`.
예(Expedition): 과열 383 K, 경고 373 K, 회복 378 K, 기본 온도 변화 0.8.
온도가 시간에 따라 어떻게 오르내리는지의 식은 자료에 없습니다.

### 4.8 EM/IR/CS (conflicting)

- EM: 부품 `signatureParams.EMSignature.nominalSignature` 합 × 장갑 `signalElectromagnetic`. 전력 구간 계수가 EM 에도 곱해지는지는 미확인.
- IR: 부품 `IRSignature.nominalSignature` 는 대부분 0 이고, 실제 IR 은 온도에서 나옵니다: `temperature.signatureParams.{minimumTemperatureForIR, temperatureToIR}` (온도가 문턱을 넘은 만큼 × 계수로 추정). × 장갑 `signalInfrared`.
- CS: 함선 `crossSection.{x, y, z}` × 전역 `globalCSFactor`(10,10,10) × 장갑 `signalCrossSection`. 어느 축이 정면/측면/상면인지는 자료에 적혀 있지 않습니다(214척 값 확보).

## 5. 무기

### 5.1 발사 방식 (verified)

`fireActions[0]` 의 종류:

| 종류 | 필드 | 초당 발사 수 |
| --- | --- | --- |
| `FireSingle`, `FireRapid` | `fireRate`(발/분) | `fireRate ÷ 60` |
| `Sequence` | `sequenceEntries[0].{delay, unit}` + 안쪽 동작 | 단위가 RPM 이면 `delay ÷ 60` (**안쪽 `fireRate` 와 다른 무기 25종**) |
| `FireBurst` | `fireRate`, `shotCount`, `cooldownTime` | 주기를 어떻게 세느냐에 따라 3가지 (`fireCycle.variants`) |
| `FireCharged` | `chargeTime`, `cooldownTime`, 안쪽 동작 | `1 ÷ (충전 + 대기 + 발사 간격)` 또는 `1 ÷ 충전` |
| `FireBeam` | `damagePerSecond`, `fullDamageRange`, `zeroDamageRange` | 초당 피해가 직접 주어짐 |

이 빌드에는 발사 방식이 둘 이상인 함선 무기가 없습니다(193종 모두 1개).

### 5.2 1발 피해 (verified)

`피해 = (AmmoParams.projectileParams.damage 합 + detonationParams.explosionParams.damage 합) × pelletCount × damageMultiplier`

- 산탄(`pelletCount > 1`, 14종): 탄 하나하나가 `damage` 를 가집니다. 전부 맞았을 때의 값입니다.
- 폭발(`detonationParams`, 22종): 직격 피해에 더합니다. 폭발 반경 `minRadius–maxRadius` 안의 감쇠식은 자료에 없습니다.

### 5.3 순간 DPS (verified)

`순간 DPS = 1발 피해 × 초당 발사 수`. 과열·탄약·축전을 따지지 않은 값입니다.

### 5.4 실탄 과열 (verified: 발사 수 / conflicting: 주기 경계)

`connectionParams.simplifiedHeatParams.{overheatTemperature, coolingPerSecond, timeTillCoolingStarts, overheatFixTime, temperatureAfterOverheatFix}`, 발당 열 `heatPerShot`.

```
간격            = 60 ÷ 연사
발 사이 식는 양  = max(0, 간격 − timeTillCoolingStarts) × coolingPerSecond
순 발열          = heatPerShot − 발 사이 식는 양            (0 이하면 과열하지 않음)
과열까지 발사 수 = ceil((overheatTemperature − heatPerShot) ÷ 순 발열) + 1
주기 A(마지막 간격 제외) = (발사 수 − 1) × 간격 + max(overheatFixTime, 간격)
주기 B(마지막 간격 포함) = 발사 수 × 간격 + overheatFixTime
지속 DPS         = 1발 피해 × 발사 수 ÷ 주기
```

- 개틀링 22종은 `spinUpTime` 이 있습니다. 주기마다 그만큼 늦게 쏘기 시작한다고 보면 더 낮아집니다(변형 값으로 실음).
- `temperatureAfterOverheatFix > 0` 인 무기 15종(예: 99)은 과열이 풀려도 거의 식지 않은 상태입니다. **첫 주기는 0도에서 시작**하고, 그 뒤는 "다 식을 때까지 기다림"과 "방아쇠를 계속 당김" 두 경우로 나눠 실었습니다.

### 5.5 에너지 무기 축전 (conflicting)

```
쏘는 중 충전     = max(0, 간격 − regenerationCooldown) × maxRegenPerSec   (발당 1 이상이면 탄창이 줄지 않음)
탄창 비우는 시간 = maxAmmoLoad × 간격 (포함) 또는 (maxAmmoLoad − 1) × 간격 (제외)
재충전           = regenerationCooldown + maxAmmoLoad ÷ maxRegenPerSec
지속 DPS         = 1발 피해 × maxAmmoLoad ÷ (비우는 시간 + 재충전)
```

- 다른 해석: 충전 지연이 매 발 다시 시작하지 않는다면 탄창이 빈 뒤 연사 한도가 `maxRegenPerSec` 가 됩니다(`regenNotInterruptedByFiring`).

### 5.6 경계 조건: 발사 간격 한 번

N발을 쏘는 데 걸리는 시간은 첫 발이 0초에 나가므로 `(N − 1) × 간격` 입니다. 다만 마지막 발 뒤에도 다음 발까지의 간격이 지나야 한다고 보면 `N × 간격` 입니다.
사이트는 지금 **과열은 제외, 축전은 포함**으로 서로 다르게 셉니다. 이 차이로 벌어지는 폭은 무기 1정에서 0.4–2% 입니다.

### 5.7 사거리·탄속 (verified)

`사거리 = AmmoParams.speed × lifetime`. 거리별 피해 감소(`damageDropParams`)는 193종 모두 비어 있습니다 → **탄환은 사거리 끝까지 같은 피해**이고, 광선만 `fullDamageRange → zeroDamageRange` 로 줄어듭니다.

### 5.8 탄퍼짐 (verified: 값)

`launchParams.spreadParams.{min, max, firstAttack, attack, decay}` (도). 짐벌 조준 모드에서는 `spreadModifier.minMultiplier/maxMultiplier = 0.5`.
반동은 `WeaponProceduralRecoilConfigDef` 참조만 있고 함선 무기 계산에는 쓰지 않았습니다.

### 5.9 짐벌·자동 조준 (verified: 값 / conflicting: 적용)

`WeaponGimbalModeModifierDef.<이름>.weaponGimbalModeModifiers[EGimbalMode]`. 기본(`Default`, 164종):

| 모드 | 연사 배수 | 탄퍼짐 배수 |
| --- | --- | --- |
| 고정(Fixed), 고정 보조(FixedAssisted), 수동 보조(ManualAssisted) | 1 | 1 |
| 수동(SeatManual), 자동(Auto) | 0.85 | 1 |
| 조준(…Ads) | 0.85 | 0.5 |

유인·원격 터렛의 수동(`MannedTurretManual`, `RemoteTurretManual`)은 1 입니다. 산탄총 기록(`Scatterguns`, 14종)은 탄퍼짐 배수가 없습니다. `Null`(15종)은 변화 없음.
**고정으로 쏠 때와 짐벌 수동·자동으로 쏠 때 DPS 가 15% 다릅니다.** 사이트는 지금 고정 기준 값만 보여 줍니다.

### 5.10 파일럿·유인 터렛·원격 터렛·PDS

구분 근거: `AttachDef.Type` / `SubType` 과 태그.

| 구분 | 근거 |
| --- | --- |
| 파일럿 무기 | `Turret/GunTurret`(짐벌 마운트), `NoseMounted`, `CanardTurret` 또는 포트에 직접 달린 `WeaponGun` |
| 유인 터렛 | `TurretBase/MannedTurret` (134종), `UtilityTurret/MannedTurret` |
| 원격·무인 | `Turret/BallTurret·TopTurret·BottomTurret` 중 좌석이 없는 것, `TurretBase/Unmanned` |
| PDS | `Turret/PDCTurret` (16종), 태그 `PDC` |

조작 주체의 열거형은 `EAimableUser`(Pilot, MannedTurret, RemoteTurret, Seat…)입니다. 다만 터렛 레코드에 "누가 조작하는가"가 한 칸으로 적혀 있지는 않아, 원격 여부는 좌석 포트 유무로 판단해야 합니다(conflicting).

### 5.11 미사일·폭탄·EMP (verified)

- 미사일: `SCItemMissileParams.explosionParams.damage`, `minRadius/maxRadius`, `GCSParams.linearSpeed`, `targetingParams.{trackingSignalType, lockTime, lockRangeMin, lockRangeMax, lockingAngle}`, `armTime`, `maxLifetime`.
- 폭탄: `SCItemBombParams.explosionParams`.
- EMP: `SCItemEMPParams.{distortionDamage, empRadius, minEmpRadius, chargeTime, unleashTime, cooldownTime}`. 반경 안 감쇠식은 자료에 없습니다.

### 5.12 관통·도탄·피해 감소·실드 흡수 — 서로 다른 개념

| 개념 | 원본 필드 | 뜻 |
| --- | --- | --- |
| 관통 거리 | 탄약 `projectileParams.penetrationParams.{basePenetrationDistance, nearRadius, farRadius}` | 탄이 선체 안으로 파고드는 깊이(m)와 그 원뿔의 반지름 |
| 관통 저항 | 장갑 `armorPenetrationResistance.{basePenetrationReduction, penetrationAbsorptionForType}` | 관통 거리를 줄이는 양 |
| 도탄 기준 | 장갑 `armorDeflection.{deflectionValue[피해 종류], healthCurve}` | 이 값보다 약한 탄은 튕김 |
| 피해 감소 | 장갑 `damageMultiplier[피해 종류]` | 선체가 받는 피해에 곱하는 배수 |
| 부품 관통 배수 | 함선 `VehicleComponentParams.{componentPenetrationDamageMultiplier, fusePenetrationDamageMultiplier, vehicleArmourModifiers}` | 관통탄이 내부 부품에 주는 피해 배수 |
| 실드 흡수율 | 실드 `ShieldAbsorption[피해 종류].{Min, Max}` | 실드가 막는 비율(나머지는 선체로) |
| 실드 저항 | 실드 `ShieldResistance[피해 종류].{Min, Max}` | 실드가 받는 피해를 줄이는 비율 |

**판정식(unavailable):** `deflectionValue`(스토커: 실탄 11, 에너지 9)와 비교되는 탄 쪽 값이 무엇인지 자료에 없습니다. `healthCurve` 는 222척 모두 비어 있습니다. 관통 거리와 장갑·부위 두께의 비교식도 없습니다.

## 6. 실드·선체·장갑

- 실드(verified): `MaxShieldHealth`, `MaxShieldRegen`, `DamagedRegenDelay`(피격 뒤), `DownedRegenDelay`(파괴 뒤), `DecayRatio`, `ReservePool*`, `stunParams`.
- 면 구성: 함선의 `SCItemShieldEmitterParams.FaceType` — `Bubble` 181척, `Quadrant` 41척. `MaxReallocation`, `ReconfigurationCooldown`. 면별 실드량 분배식은 없습니다(전체량 ÷ 면 수로 추정, conflicting).
- 선체: 구조 XML `Part@damageMax` 의 부위별 내구도(이름·부모·`detachRatio`). 사이트의 "선체" 값은 그 합입니다.
  **핵심 부위·분리 부위·장식 부위를 가르는 칸은 없습니다.** 부모–자식 관계와 `detachRatio` 만 있습니다. 어느 부위가 0 이 되면 함선이 파괴되는지는 자료에 없습니다(`vehicleHullDamageNormalizationValue` 의 쓰임 미확인).
- 장갑: 장갑 부품 `Health`, `damageMultiplier`, `DamageResistances`, 위 5.12 의 관통·도탄 값. 장갑이 깎일 때 방어가 어떻게 변하는지의 곡선(`healthCurve`)은 비어 있습니다.

### 세 질문에 대한 답

1. **이 무기가 상대 장갑을 관통하는가?** — 입력값(탄의 관통 거리, 장갑의 관통 저항·도탄 기준)은 모두 확보했지만 판정식이 없어 **계산할 수 없습니다.** 보일 수 있는 것은 두 값의 나란한 표시까지입니다.
2. **실드·장갑 상태가 바뀌면?** — 계산 가능한 범위:
   `선체로 가는 피해 = 피해 × (1 − 흡수율) × 장갑 damageMultiplier`, `실드가 받는 피해 = 피해 × 흡수율 × (1 − 저항)`.
   흡수율·저항이 Min–Max 사이 어디인지 모르므로 **범위**로만 보일 수 있습니다. 실드가 꺼지면 흡수율 0.
3. **어떤 무기가 내 함선에 유효한가?** — 피해 종류별로 위 식의 범위를 비교할 수 있습니다(예: 에너지 흡수율 1 인 실드에는 실드가 있는 동안 에너지 무기의 선체 피해 0). 도탄 여부는 1번과 같은 이유로 보류.

명중 위치·서버 판정이 필요한 것: 어느 부위에 맞는지, 관통 뒤 어느 내부 부품이 맞는지, 실드 면 선택. **선체 합 ÷ DPS 를 격파 시간으로 보여서는 안 됩니다.**

## 7. 퀀텀

| 값 | 원본 필드 | 단위 |
| --- | --- | --- |
| 탱크 용량 | `ResourceContainer.capacity.standardCargoUnits` | SCU (175척 모두 같은 단위) |
| 연료 요구량 | `SCItemQuantumDriveParams.quantumFuelRequirement` | 거리당 SCU — 거리 단위는 자료에 없음 |
| 이동 중 소비 | `params.travellingState.deltas[QuantumFuel].microResourceUnits` + `ItemResourceDynamicAmountQuantumTravelFuel` | 실제 값은 실행 중 계산 |
| 속도·가속 | `params.{driveSpeed, stageOneAccelRate, stageTwoAccelRate}` | m/s, m/s² |
| 스풀링·쿨다운 | `params.{spoolUpTime, cooldownTime}` | 초 |
| 정렬(보정) | `params.{calibrationRate, minCalibrationRequirement, maxCalibrationRequirement, calibrationDelayInSeconds, calibrationProcessAngleLimit}` | — |
| 경로 이동 | `splineJumpParams.*` (같은 꼴) | — |

- **항속 = 탱크(SCU) ÷ 요구량.** 요구량을 SCU/Gm 로 읽으면 스토커+Expedition 이 61.2 Gm 입니다. SCU/Mm 로 읽으면 61 Mm 이 되어 성계 안 이동(수십 Gm)이 불가능하므로 Gm 해석이 맞습니다(conflicting — 단위가 자료에 적혀 있지는 않음).
- 이동 시간: 가속 단계의 전환 조건이 자료에 없어 세 모형을 냅니다.
  `constantA2`(사이트 방식, 2단계 가속으로 사다리꼴): 거리가 `속도² ÷ 가속` 보다 짧으면 최고 속도에 못 미치고 `2 × √(거리 ÷ 가속)`, 길면 `거리 ÷ 속도 + 속도 ÷ 가속`.
  `constantA1`(느린 쪽 한계), `cruiseOnly`(빠른 쪽 한계).
- 스풀링은 출발 전에 더합니다. 정렬 시간은 함선 회전에 달려 있어 계산하지 않습니다. 쿨다운은 도착 뒤 대기라 이동 시간에 넣지 않습니다.
- 퀀텀 드라이브(`QuantumDrive`)는 성계 안 이동, 점프 드라이브(`JumpDrive`, 6종)는 점프 포인트 통과용이고 퀀텀 드라이브의 하위 포트에 달립니다. 점프 드라이브는 항속·속도에 관여하지 않습니다.

## 8. 레이더·비행·추가 장비

### 레이더

- `signatureDetection[ESignatureType].{sensitivity, piercing, permitPassiveDetection, permitActiveDetection}` — IR·EM·CS·dB·RS(Resource) 등 종류별 민감도와 투과.
- `sensitivityModifiers[]`: 접촉 종류별 가감(예: −0.55).
- 조준 보조 범위는 탐지와 별개입니다: `aimAssist.{distanceMinAssignment, distanceMaxAssignment, outsideRangeBufferDistance}` (에쿠테: 845–1105 m, 버퍼 60 m).
- 핑: `pingProperties.cooldownTime`. 전역: `RadarSystemGlobalParams`(CS 계수 10, 시야 각 45°, CS 최대 거리 10,000 m).
- 탐지 거리 식(상대 신호 × 민감도 − 주변 신호 …)과 추적 유지 조건은 자료에 없습니다(unavailable). 전력: 최소 요구 비율과 0.7/0.85/1 구간만 확인.

### 비행

- 속도·회전: `scmSpeed`, `boostSpeedForward/Backward`, `maxSpeed`, `maxAngularVelocity.{x 피치, y 롤, z 요}`.
- 부스트: 배수 `afterburnerNew.afterburn*Multiplier*`, 지속 = `capacitorMax ÷ capacitorAfterburnerIdleCost`, 재충전 = `capacitorRegenDelayAfterUse + capacitorMax ÷ capacitorRegenPerSec`(배분 곡선 적용 전).
- 가속도: `Σ 추진기 thrustCapacity ÷ 질량`. 이것은 **윗값**입니다 — IFCS 의 축별 배율(`positiveLinearScale` 등)과 추진기 방향을 반영하지 않습니다. 17척은 `thrustCapacityNew` 도 0 이 아니어서 어느 쪽이 쓰이는지 미확인.
- 연료: 추진기 `fuelBurnRatePer10KNewton`(구식)·`fuelBurnRatePer10KNewtonRN`(SRU), 탱크 `capacity`.
- **STD/HND/SPD 블레이드: 이 빌드의 게임 파일에 교체형 비행 블레이드 부품이 없습니다.** 계수를 넣지 않았습니다.

### 추가 장비

- 채광 헤드: `SEntityComponentMiningLaserParams.miningLaserModifiers.{laserInstability, resistanceModifier, optimalChargeWindowSizeModifier, optimalChargeWindowRateModifier}` + `filterParams`.
- 채광 모듈: `EntityComponentAttachableModifierParams.modifiers[]`. 헤드와 모듈 값이 더해지는지 곱해지는지는 자료에 없습니다.
- 샐비지·트랙터: 무기 구성 요소의 `salvageModifier`, `tractorModifier` 와 전용 구성 요소.
- 생명 유지 장치: 전력 1칸 → `LifeSupport` 생산(SRU). 필터 부품은 이번에 따로 뽑지 않았습니다.
- 함선 도색: 무기 도색 변종은 클래스명 접미사(`_mr01`, `_CleanAir`, `_Shark` 등)로 기본형과 연결됩니다(12종). 함선 도색 자체는 이번 범위에서 뽑지 않았습니다.
