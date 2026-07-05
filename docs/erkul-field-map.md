# Erkul 필드 맵 (Asgard 기준 추적 결과)

Erkul `live/ships` 응답에서 ShipDB 2.0 상세 스펙 필드의 실제 JSON path를 Anvil Asgard(`anvl_asgard`) 샘플로 추적한 결과다.
재현: `npm run shipdb:erkul:fetch` → `npm run shipdb:erkul:inspect`

- 추적 일시: 2026-07-05 (Erkul live)
- 대상 레코드: `localName: anvl_asgard`, `data.name: Asgard`, `ref: 8ffde65b-ee9b-4a50-b386-3111175736b2`
- path 표기는 함선 레코드의 `data.` 기준 상대 경로
- Erkul live가 사용자 샘플보다 최신일 수 있으므로 불일치는 실패가 아니라 차이 보고 대상

## 레코드 최상위 구조

```
{ calculatorType: "ship", localName: "anvl_asgard", data: { ... } }
```

`data` 주요 키: `name, description, size, cargo, fuelCapacity, qtFuelCapacity, insurance,
vehicle, ifcs, hull, armor, items, loadout, manufacturerData, crossSection, health, ...`

## 필드 매핑 표

| Field | Erkul path | Found | Sample value | User sample value | Match status | Notes |
|---|---|---|---|---|---|---|
| manufacturer | `manufacturerData.data.name` | ✅ | `Anvil Aerospace` | `Anvil Aerospace` | 일치 | |
| role | `vehicle.role` | ✅ | `Dropship` | `Dropship` | 일치 | |
| career | `vehicle.career` | ✅ | `Combat` | `Combat` | 일치 | |
| size | `size` | ✅ | `4` | `S4` | 일치(표기 변환) | 숫자 원본, "S4"는 표시층 변환 |
| crewSize | `vehicle.crewSize` | ✅ | `1` | `1` | 일치 | |
| scmSpeed | `ifcs.scmSpeed` | ✅ | `203` | `203` | 일치 | |
| scmBoostForward | `ifcs.boostSpeedForward` | ✅ | `425` | `425` | 일치 | |
| scmBoostBackward | `ifcs.boostSpeedBackward` | ✅ | `240` | `240` | 일치 | |
| navMaxSpeed | `ifcs.maxSpeed` | ✅ | `1075` | `1075` | 일치 | `maxAfterburnSpeed`도 동일값 |
| pitch | `ifcs.angularVelocity.x` | ✅ | `32.5` | `33` | 일치(반올림) | Erkul UI가 반올림 표시 |
| yaw | `ifcs.angularVelocity.z` | ✅ | `27.5` | `28` | 일치(반올림) | Erkul UI가 반올림 표시 |
| roll | `ifcs.angularVelocity.y` | ✅ | `95` | `95` | 일치 | 축 주의: y=roll, z=yaw |
| boostedPitch | — | ❌ not found | not found | — | not found | raw에 없음. Erkul 클라이언트 계산값(afterburner 배율) |
| boostedYaw | — | ❌ not found | not found | — | not found | 〃 |
| boostedRoll | — | ❌ not found | not found | — | not found | 〃 |
| currentPitch | — | ❌ not found | not found | — | not found | 로드아웃 반영 계산값. raw에 없음 |
| currentYaw | — | ❌ not found | not found | — | not found | 〃 |
| currentRoll | — | ❌ not found | not found | — | not found | 〃 |
| decoy | `sum(items.countermeasures[shortName='Decoy'].data.ammoContainer.maxAmmoCount)` | ✅ | `192` | — | user sample 없음 | 런처 4기 × 48발 |
| noise | `sum(items.countermeasures[shortName='Noise'].data.ammoContainer.maxAmmoCount)` | ✅ | `20` | — | user sample 없음 | 런처 4기 × 5발 |
| hp | `hull.totalHp` | ✅ | `77000` | `77000` | 일치 | `health.hp`(=1)와 혼동 금지 |
| cargoScu | `cargo` | ✅ | `180` | `180` | 일치 | |
| dimensions.length | `vehicle.size.y` | ✅ | `48` | `48` | 일치 | 축 해석(y=전방)은 A-2에서 다함선 교차검증 |
| dimensions.beam | `vehicle.size.x` | ✅ | `38` | `38` | 일치 | 〃 (x=측면) |
| dimensions.height | `vehicle.size.z` | ✅ | `12` | `12` | 일치 | 〃 (z=상하) |
| massKg | `hull.mass` | ✅ | `610246.06` | `610246` | 일치(반올림) | |
| hydrogenCapacityScu | `fuelCapacity` | ✅ | `97.5` | `97.5` | 일치 | |
| quantumFuelCapacityScu | `qtFuelCapacity` | ✅ | `1.85` | `1.85` | 일치 | |
| expeditionFee | `insurance.baseExpeditingFee` | ✅ | `9430` | `9430` | 일치 | |
| claimTime | `insurance.baseWaitTimeMinutes` | ✅ | `17` → `00:17:00` | `00:17:00` | 일치 | 분 단위 원본 |
| expediteTime | `insurance.mandatoryWaitTimeMinutes` | ✅ | `4.25` → `00:04:15` | `00:04:15` | 일치 | 분 단위 원본 |
| damageReduction.physical | `armor.data.armor.damageMultiplier.damagePhysical` | ✅ | `0.7` | — | user sample 없음 | 배율 0.7 = 30% 감소 |
| damageReduction.energy | `armor.data.armor.damageMultiplier.damageEnergy` | ✅ | `0.5` | — | user sample 없음 | 배율 0.5 = 50% 감소 |
| damageReduction.distortion | `armor.data.armor.damageMultiplier.damageDistortion` | ✅ | `1` | — | user sample 없음 | 감소 없음 |
| damageReduction.fuse | `vehicle.fusePenetrationDamageMultiplier` | ✅ | `0.7` | — | user sample 없음 | |
| damageReduction.component | `vehicle.componentPenetrationDamageMultiplier` | ✅ | `0.5` | — | user sample 없음 | |
| descriptionEn | `description` | ✅ | `Manufacturer: Anvil Aerospace\nFocus: Drop Ship\n...` | — | user sample 없음 | 헤더 라인 분리 파싱 필요 |
| descriptionKo | — | ❌ not found | not found | — | not found | 페이로드 전체에 한국어 없음. global.ini 등 별도 원천 필요 |

## 요약

- **일치**: 22개 필드 (사용자 샘플과 비교 가능한 필드 전부. 반올림/표기 변환 4건 포함)
- **불일치**: 0개
- **not found**: 7개 — boosted/current 회전값 6개(Erkul 클라이언트 계산값) + descriptionKo
- 사용자 샘플이 없어 비교 생략: decoy, noise, damageReduction 5종, descriptionEn (path·값 확보는 완료)

## 주의사항

- `angularVelocity` 축: **x=pitch, y=roll, z=yaw** (yaw/roll이 직관과 반대이므로 normalize 시 주의)
- `vehicle.size` 축: x=beam, y=length, z=height 는 CryEngine 축 관례에 따른 해석이다.
  Asgard 1척 기준으로는 사용자 샘플과 일치했으나, A-2에서 길이≠폭인 함선 다수로 교차검증한다.
- `health.hp`(=1)는 함선 HP가 아니다. HP는 `hull.totalHp`.
- `damageReduction`은 배율 원본(1=감소 없음)을 저장하고, %표시는 표시층에서 `1-값`으로 변환한다.
- shop 구매처는 `shop` 엔드포인트의 `data.inventory[]`(localName, price, ref)에서 매칭한다 (A-3).
