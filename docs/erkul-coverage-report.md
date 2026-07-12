# Erkul 상세 스펙 coverage report (A-2)

`ships-normalized.json` 기준 필드별 채움률. 재현: `npm run shipdb:erkul:normalize`

- 원천: Erkul live (`https://server.erkul.games/live/ships`)
- fetch 시각: 2026-07-12T02:50:30.125Z
- 대상: 219척 (지상 차량 포함 전체 레코드)

분류 기준:
- **raw** — Erkul 원본 path에서 직접 추출
- **heuristic** — 원본을 보존하면서 명시된 규칙으로 파생 (dimensions는 `sizeRaw`에 원본 축 보존)
- **derived-only / unavailable in raw** — Erkul 클라이언트 계산값으로 raw에 없음. 계산식 역추적 전까지 `null` (값 생성 금지)
- **unavailable** — 원천 자체가 없음 (KO 설명 등)

| Field | Class | Filled | Coverage | Missing (최대 10) |
|---|---|---|---|---|
| `externalStats.manufacturer` | raw | 219/219 | 100.0% | — |
| `externalStats.role` | raw | 219/219 | 100.0% | — |
| `externalStats.career` | raw | 219/219 | 100.0% | — |
| `externalStats.size` | raw | 219/219 | 100.0% | — |
| `externalStats.crewSize` | raw | 219/219 | 100.0% | — |
| `externalStats.speeds.scm` | raw | 192/219 | 87.7% | anvl_ballista, anvl_ballista_dunestalker, anvl_ballista_snowblind, anvl_centurion, anvl_spartan, argo_csv_cargo, drak_mule, grin_mdc, grin_mtc, grin_ptv |
| `externalStats.speeds.scmBoostForward` | raw | 192/219 | 87.7% | anvl_ballista, anvl_ballista_dunestalker, anvl_ballista_snowblind, anvl_centurion, anvl_spartan, argo_csv_cargo, drak_mule, grin_mdc, grin_mtc, grin_ptv |
| `externalStats.speeds.scmBoostBackward` | raw | 192/219 | 87.7% | anvl_ballista, anvl_ballista_dunestalker, anvl_ballista_snowblind, anvl_centurion, anvl_spartan, argo_csv_cargo, drak_mule, grin_mdc, grin_mtc, grin_ptv |
| `externalStats.speeds.navMax` | raw | 192/219 | 87.7% | anvl_ballista, anvl_ballista_dunestalker, anvl_ballista_snowblind, anvl_centurion, anvl_spartan, argo_csv_cargo, drak_mule, grin_mdc, grin_mtc, grin_ptv |
| `externalStats.rotation.pitch` | raw | 192/219 | 87.7% | anvl_ballista, anvl_ballista_dunestalker, anvl_ballista_snowblind, anvl_centurion, anvl_spartan, argo_csv_cargo, drak_mule, grin_mdc, grin_mtc, grin_ptv |
| `externalStats.rotation.yaw` | raw | 192/219 | 87.7% | anvl_ballista, anvl_ballista_dunestalker, anvl_ballista_snowblind, anvl_centurion, anvl_spartan, argo_csv_cargo, drak_mule, grin_mdc, grin_mtc, grin_ptv |
| `externalStats.rotation.roll` | raw | 192/219 | 87.7% | anvl_ballista, anvl_ballista_dunestalker, anvl_ballista_snowblind, anvl_centurion, anvl_spartan, argo_csv_cargo, drak_mule, grin_mdc, grin_mtc, grin_ptv |
| `externalStats.rotation.boostedPitch` | derived-only / unavailable in raw | 0/219 | 0.0% | drak_command_module, aegs_avenger_stalker, aegs_avenger_titan, aegs_avenger_titan_renegade, aegs_avenger_warlock, aegs_eclipse, aegs_gladius, aegs_gladius_pir, aegs_gladius_valiant, aegs_hammerhead_gs |
| `externalStats.rotation.boostedYaw` | derived-only / unavailable in raw | 0/219 | 0.0% | drak_command_module, aegs_avenger_stalker, aegs_avenger_titan, aegs_avenger_titan_renegade, aegs_avenger_warlock, aegs_eclipse, aegs_gladius, aegs_gladius_pir, aegs_gladius_valiant, aegs_hammerhead_gs |
| `externalStats.rotation.boostedRoll` | derived-only / unavailable in raw | 0/219 | 0.0% | drak_command_module, aegs_avenger_stalker, aegs_avenger_titan, aegs_avenger_titan_renegade, aegs_avenger_warlock, aegs_eclipse, aegs_gladius, aegs_gladius_pir, aegs_gladius_valiant, aegs_hammerhead_gs |
| `externalStats.rotation.currentPitch` | derived-only / unavailable in raw | 0/219 | 0.0% | drak_command_module, aegs_avenger_stalker, aegs_avenger_titan, aegs_avenger_titan_renegade, aegs_avenger_warlock, aegs_eclipse, aegs_gladius, aegs_gladius_pir, aegs_gladius_valiant, aegs_hammerhead_gs |
| `externalStats.rotation.currentYaw` | derived-only / unavailable in raw | 0/219 | 0.0% | drak_command_module, aegs_avenger_stalker, aegs_avenger_titan, aegs_avenger_titan_renegade, aegs_avenger_warlock, aegs_eclipse, aegs_gladius, aegs_gladius_pir, aegs_gladius_valiant, aegs_hammerhead_gs |
| `externalStats.rotation.currentRoll` | derived-only / unavailable in raw | 0/219 | 0.0% | drak_command_module, aegs_avenger_stalker, aegs_avenger_titan, aegs_avenger_titan_renegade, aegs_avenger_warlock, aegs_eclipse, aegs_gladius, aegs_gladius_pir, aegs_gladius_valiant, aegs_hammerhead_gs |
| `externalStats.countermeasures.decoy` | raw | 193/219 | 88.1% | argo_mpuv, argo_mpuv_transport, mrai_pulse, mrai_pulse_lx, anvl_ballista, anvl_ballista_dunestalker, anvl_ballista_snowblind, anvl_centurion, anvl_spartan, argo_csv_cargo |
| `externalStats.countermeasures.noise` | raw | 193/219 | 88.1% | argo_mpuv, argo_mpuv_transport, mrai_pulse, mrai_pulse_lx, anvl_ballista, anvl_ballista_dunestalker, anvl_ballista_snowblind, anvl_centurion, anvl_spartan, argo_csv_cargo |
| `externalStats.hp` | raw | 219/219 | 100.0% | — |
| `externalStats.cargoScu` | raw | 219/219 | 100.0% | — |
| `externalStats.dimensions.length` | heuristic (max of size.x,y) | 219/219 | 100.0% | — |
| `externalStats.dimensions.beam` | heuristic (min of size.x,y) | 219/219 | 100.0% | — |
| `externalStats.dimensions.height` | raw (size.z) | 219/219 | 100.0% | — |
| `externalStats.massKg` | raw | 219/219 | 100.0% | — |
| `externalStats.fuel.hydrogenScu` | raw | 219/219 | 100.0% | — |
| `externalStats.fuel.quantumScu` | raw | 219/219 | 100.0% | — |
| `externalStats.insurance.expeditionFee` | raw | 219/219 | 100.0% | — |
| `externalStats.insurance.claimTime` | raw | 219/219 | 100.0% | — |
| `externalStats.insurance.expediteTime` | raw | 219/219 | 100.0% | — |
| `externalStats.damageReduction.physical` | raw | 218/219 | 99.5% | grin_ptv |
| `externalStats.damageReduction.energy` | raw | 218/219 | 99.5% | grin_ptv |
| `externalStats.damageReduction.distortion` | raw | 218/219 | 99.5% | grin_ptv |
| `externalStats.damageReduction.fuse` | raw | 219/219 | 100.0% | — |
| `externalStats.damageReduction.component` | raw | 219/219 | 100.0% | — |
| `descriptions.enRaw` | raw | 218/219 | 99.5% | drak_command_module |
| `descriptions.en` | heuristic (헤더 제거 정제) | 218/219 | 99.5% | drak_command_module |
| `descriptions.ko` | unavailable (Erkul에 원천 없음) | 0/219 | 0.0% | drak_command_module, aegs_avenger_stalker, aegs_avenger_titan, aegs_avenger_titan_renegade, aegs_avenger_warlock, aegs_eclipse, aegs_gladius, aegs_gladius_pir, aegs_gladius_valiant, aegs_hammerhead_gs |

## dimensions 축 검증 (A-2 사실)

- `vehicle.size`의 x/y 중 어느 쪽이 길이인지는 **함선 모델마다 다르다**.
  Asgard는 y=길이(48), Carrack은 x=길이(126)로 고정축 해석은 성립하지 않는다.
- 따라서 `length=max(x,y)`, `beam=min(x,y)` 휴리스틱을 적용하고, 원본 축은 `dimensions.sizeRaw`에 보존한다.
- RSI Ship Matrix와 교차검증(이름 매칭 195척): `length=max(x,y)`가 RSI length와 25% 오차 내 일치 152/195.
  잔여 차이는 Erkul(인게임 바운딩 박스)과 RSI(공식 스펙 시트) 측정 기준 차이로, 축 해석 오류가 아니다.

## descriptions 정제 규칙

- Erkul description의 줄바꿈은 리터럴 `\n` 2문자다 (실제 개행 아님).
- 선두 `Manufacturer:` / `Focus:` 헤더 라인(25척)만 제거하고 나머지는 원문 유지.
- `enRaw`(원문)와 `en`(정제본)을 분리 저장. `ko`는 원천이 없어 `null`.
