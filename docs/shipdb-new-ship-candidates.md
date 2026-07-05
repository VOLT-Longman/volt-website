# ShipDB 신규 함선 후보 분류표

신규 함선 추가 트랙 1단계 — **분류만 하고 DB에는 반영하지 않는다.**
재현: `npm run shipdb:erkul:classify-candidates` (입력: A-4 match report + A-2/A-3 normalized)

- 데이터 기준: Erkul live 2026-07-05T12:02:20.586Z
- 요약: **제외 1** · **추가 후보 3** · **보류 5** · **수동매핑 후보 6** · 유지(VOLT-only unreleased) 30

## 분류 정책

- 추가 후보: 정식 독립 선체(기본형) + Erkul stats 존재만 추가 후보
- 보류: Pirate/Executive/스킨류 에디션은 기본형과 별도 가치가 있을 때만 (운영자 판단)
- 제외: 함선이 아닌 항목
- 수동매핑 후보: market-only(stats 없음)는 자동 추가 금지 — 수동 매핑 후보로만
- 유지: VOLT-only unreleased 30척은 유지/폴백 (조치 없음)

## 추가 후보 (3)

| localName | 이름 | stats | 인게임 구매처 | 근거 |
|---|---|---|---|---|
| `aegs_tiburon` | Tiburon | ✅ (hp 187,200) | 없음 | 신규 정식 독립 선체(Aegis 헤비 건쉽, 기본형). Erkul stats 완비. 인게임 판매는 아직 없음(pledge 획득). |
| `gama_tyilui` | Tyilui | ✅ (hp 70,460) | 없음 | 신규 정식 독립 선체(Gatac 캐리어, 기본형). Erkul stats 완비. 인게임 판매는 아직 없음. |
| `misc_starlite` | Starlite | ✅ (hp 68,250) | 없음 | 신규 정식 독립 선체(MISC 경급유선, 기본형). Erkul stats 완비. 인게임 판매는 아직 없음. |

## 보류 (5)

| localName | 이름 | stats | 인게임 구매처 | 근거 |
|---|---|---|---|---|
| `anvl_hornet_f7cm_mk2_heartseeker` | F7C-M Hornet Heartseeker Mk II | ✅ (hp 15,250) | 없음 | F7C-M Mk II의 Heartseeker 에디션 — 기본형 계열이 이미 DB에 존재. 에디션류는 별도 가치가 있을 때만 추가. |
| `anvl_lightning_f8` | F8A Lightning | ✅ (hp 40,200) | 없음 | F8A(군용 사양)는 일반 획득 경로가 없고, 민수형 F8C Lightning은 이미 VOLT DB에 존재(f8c-lightning). 별도 등재 가치 판단 필요. |
| `drak_caterpillar_pirate` | Caterpillar Pirate | ✅ (hp 91,500) | 없음 | Caterpillar의 Pirate 에디션 — 기본형(caterpillar)이 이미 DB에 존재. 에디션류는 별도 가치가 있을 때만 추가. |
| `drak_dragonfly_pink` | Dragonfly Star Kitten | ✅ (hp 1,570) | 없음 | Dragonfly의 Star Kitten 스킨 변형 — 기본형이 이미 DB에 존재. 스킨류는 별도 가치가 있을 때만 추가. |
| `orig_600i_executive_edition` | 600i Executive Edition | ✅ (hp 197,250) | 없음 | 600i의 Executive 에디션 — 기본형(600i)이 이미 DB에 존재. 에디션류는 별도 가치가 있을 때만 추가. |

## 제외 (1)

| localName | 이름 | stats | 인게임 구매처 | 근거 |
|---|---|---|---|---|
| `drak_command_module` | Command Module | ✅ (hp 6,700) | 없음 | 함선이 아님 — Caterpillar 커맨드 모듈(선체 부속). VOLT 함선DB 등재 대상 아님. |

## 수동매핑 후보 (6)

| localName | 이름 | stats | 인게임 구매처 | 근거 |
|---|---|---|---|---|
| `rsi_aurora_mr` | → VOLT `aurora-mr` 후보 | ❌ 없음 | shop 4행 | Erkul ships 목록에 없어 stats 없음 — 자동 추가 금지. 기존 VOLT id "aurora-mr"와의 수동 매핑만 검토 (확정은 운영자). |
| `rsi_aurora_ln` | → VOLT `aurora-ln` 후보 | ❌ 없음 | shop 4행 | Erkul ships 목록에 없어 stats 없음 — 자동 추가 금지. 기존 VOLT id "aurora-ln"와의 수동 매핑만 검토 (확정은 운영자). |
| `rsi_aurora_es` | → VOLT `aurora-es` 후보 | ❌ 없음 | shop 4행 | Erkul ships 목록에 없어 stats 없음 — 자동 추가 금지. 기존 VOLT id "aurora-es"와의 수동 매핑만 검토 (확정은 운영자). |
| `rsi_aurora_cl` | → VOLT `aurora-cl` 후보 | ❌ 없음 | shop 4행 | Erkul ships 목록에 없어 stats 없음 — 자동 추가 금지. 기존 VOLT id "aurora-cl"와의 수동 매핑만 검토 (확정은 운영자). |
| `aegs_hammerhead` | → VOLT `hammerhead` 후보 | ❌ 없음 | shop 1행 | Erkul ships 목록에 없어 stats 없음 — 자동 추가 금지. 기존 VOLT id "hammerhead"와의 수동 매핑만 검토 (확정은 운영자). |
| `rsi_aurora_lx` | → VOLT `aurora-lx` 후보 | ❌ 없음 | shop 1행 | Erkul ships 목록에 없어 stats 없음 — 자동 추가 금지. 기존 VOLT id "aurora-lx"와의 수동 매핑만 검토 (확정은 운영자). |

## 유지 — VOLT-only unreleased (30척)

컨셉/미출시 함선. live 레이어 없이 기존 volt-data 표시로 폴백되는 현행 동작을 유지한다.

`merchantman`, `hull-d`, `hull-e`, `orion`, `javelin`, `genesis`, `endeavor`, `crucible`, `pioneer`, `vulcan`, `kraken`, `kraken-privateer`, `ranger-rc`, `ranger-tr`, `ranger-cv`, `nautilus`, `nautilus-solstice-edition`, `g12`, `g12r`, `g12a`, `liberator`, `odyssey`, `expanse`, `legionnaire`, `e1-spirit`, `galaxy`, `zeus-mk2-mr`, `arrastra`, `atls`, `atls-geo`

## 다음 단계 (승인 후)

1. **추가 후보** 승인분 → volt-data.js 등재 파이프라인 설계 (한국어 역할명/태그/번역 포함, 별도 작업지시서)
2. **수동매핑 후보** 승인분 → `manual-ship-map.json`의 `mappings`로 승격 → A-4 재실행으로 매칭 반영
3. **보류** 항목은 이 문서에 결정 기록을 남기고 재분류
4. 새 Erkul 동기화에서 미분류 신규 함선이 나오면 스크립트가 경고하며, 분류표를 갱신한 뒤 재실행한다
