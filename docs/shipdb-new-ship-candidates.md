# ShipDB 신규 함선 후보 분류표

신규 함선 추가 트랙 1단계 — **분류만 하고 DB에는 반영하지 않는다.**
재현: `npm run shipdb:erkul:classify-candidates` (입력: A-4 match report + A-2/A-3 normalized)

- 데이터 기준: Erkul live 2026-07-17T15:11:08.433Z
- 요약: **제외 1** · **수동매핑 승격 완료 6** · 유지(VOLT-only unreleased) 30

## 분류 정책

- 추가 후보: 정식 독립 선체(기본형) + Erkul stats 존재만 추가 후보
- 보류: Pirate/Executive/스킨류 에디션은 기본형과 별도 가치가 있을 때만 (운영자 판단)
- 제외: 함선이 아닌 항목
- 수동매핑 후보: market-only(stats 없음)는 자동 추가 금지 — 수동 매핑 후보로만
- 유지: VOLT-only unreleased 30척은 유지/폴백 (조치 없음)

## 제외 (1)

| localName | 이름 | stats | 인게임 구매처 | 근거 |
|---|---|---|---|---|
| `drak_command_module` | Command Module | ✅ (hp 6,700) | 없음 | 함선이 아님 — Caterpillar 커맨드 모듈(선체 부속). VOLT 함선DB 등재 대상 아님. |

## 수동매핑 승격 완료 (6)

| localName | 이름 | stats | 인게임 구매처 | 근거 |
|---|---|---|---|---|
| `rsi_aurora_mr` | → VOLT `aurora-mr` 후보 | ❌ 없음 | shop 4행 | 검증 후 marketOnlyMappings로 승격됨 → VOLT "aurora-mr". rsi_aurora_gs_mr(Aurora Mk I MR)와 동일 선체 — 변형 코드(mr) 1:1, _gs 리워크 패턴 일관. |
| `rsi_aurora_ln` | → VOLT `aurora-ln` 후보 | ❌ 없음 | shop 4행 | 검증 후 marketOnlyMappings로 승격됨 → VOLT "aurora-ln". rsi_aurora_gs_ln(Aurora Mk I LN)와 동일 선체 — 변형 코드(ln) 1:1, _gs 리워크 패턴 일관. |
| `rsi_aurora_es` | → VOLT `aurora-es` 후보 | ❌ 없음 | shop 4행 | 검증 후 marketOnlyMappings로 승격됨 → VOLT "aurora-es". VOLT aurora-es는 rsi_aurora_gs_es(Aurora Mk I ES, stats 보유)에 매칭됨. shop localName은 리워크 전 구형 엔티티(rsi_aurora_es)로 변형 코드(es)가 1:1 일치. _gs 리워크 네이밍 패턴이 Aurora 5종+Hammerhead 6/6에서 일관됨. ref 불일치는 Erkul shop이 구 엔티티 UUID를 참조하기 때문. |
| `rsi_aurora_cl` | → VOLT `aurora-cl` 후보 | ❌ 없음 | shop 4행 | 검증 후 marketOnlyMappings로 승격됨 → VOLT "aurora-cl". rsi_aurora_gs_cl(Aurora Mk I CL)와 동일 선체 — 변형 코드(cl) 1:1, _gs 리워크 패턴 일관. |
| `aegs_hammerhead` | → VOLT `hammerhead` 후보 | ❌ 없음 | shop 1행 | 검증 후 marketOnlyMappings로 승격됨 → VOLT "hammerhead". VOLT hammerhead는 aegs_hammerhead_gs(Hammerhead, stats 보유)에 매칭됨. Hammerhead 선체는 단일 종이며 shop localName은 _gs 리워크 전 구형 엔티티. Aurora와 동일한 네이밍 패턴. |
| `rsi_aurora_lx` | → VOLT `aurora-lx` 후보 | ❌ 없음 | shop 1행 | 검증 후 marketOnlyMappings로 승격됨 → VOLT "aurora-lx". rsi_aurora_gs_lx(Aurora Mk I LX)와 동일 선체 — 변형 코드(lx) 1:1, _gs 리워크 패턴 일관. |

## 유지 — VOLT-only unreleased (30척)

컨셉/미출시 함선. live 레이어 없이 기존 volt-data 표시로 폴백되는 현행 동작을 유지한다.

`merchantman`, `hull-d`, `hull-e`, `orion`, `javelin`, `genesis`, `endeavor`, `crucible`, `pioneer`, `vulcan`, `kraken`, `kraken-privateer`, `ranger-rc`, `ranger-tr`, `ranger-cv`, `nautilus`, `nautilus-solstice-edition`, `g12`, `g12r`, `g12a`, `liberator`, `odyssey`, `expanse`, `legionnaire`, `e1-spirit`, `galaxy`, `zeus-mk2-mr`, `arrastra`, `atls`, `atls-geo`

## 다음 단계 (승인 후)

1. **추가 후보** 승인분 → volt-data.js 등재 파이프라인 설계 (한국어 역할명/태그/번역 포함, 별도 작업지시서)
2. **수동매핑 후보** 승인분 → `manual-ship-map.json`의 `mappings`로 승격 → A-4 재실행으로 매칭 반영
3. **보류** 항목은 이 문서에 결정 기록을 남기고 재분류
4. 새 Erkul 동기화에서 미분류 신규 함선이 나오면 스크립트가 경고하며, 분류표를 갱신한 뒤 재실행한다
