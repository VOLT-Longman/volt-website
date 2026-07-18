# ShipDB Erkul 재작성 v2 — 제외 함선 ID 매핑 (0단계 산출)

- **근거**: PM 결정 D8 — Erkul live 없는 37척은 공개 ShipDB·검색·비교·AI 추천에서 제외. **ID·제외 사유만 이 문서에 보관**(별도 카탈로그 파일 없음).
- **선정 기준(PM 보강 2)**: 공개 canonical = **Erkul live 레코드 존재(`hasLive`)** — `erkulStatus='matched'` 아님. `railen`은 `erkulStatus='unreleased'`·`implemented=false`지만 **live 데이터가 존재하므로 canonical 219에 포함**된다. CI(`shipdb-canonical-contract.test.mjs`)가 219/30/7·railen을 고정.
- **기준 데이터**: `volt-data.ships` 256척 중 `ship-live-stats` 부재 37척. 공개 canonical 목록 = Erkul live **219척**.
- **별칭 대상 219 존재 검증**: 통과 (7/7 정식 함선이 live 목록에 존재).
- **재생성 방법**: `node scripts/shipdb-rewrite/capture-baseline.mjs`의 `idList`가 동일 분류의 기계 판독본. 이 문서는 그 사람 판독 요약이다.

## 중복 에디션 → 정식 Erkul 함선 별칭/리다이렉트 (7)

기존 `canonicalId` 수기 매핑을 시드로 사용. 에디션 변형은 공개 목록에 비노출하고 정식 함선으로 리다이렉트한다.

| 제외 ID | 별칭 대상(canonical) | 대상 live 존재 |
|---|---|---|
| `argo-mole-carbon-edition` | `mole` | ✓ |
| `argo-mole-talus-edition` | `mole` | ✓ |
| `carrack-expedition-w-c8x` | `carrack-expedition` | ✓ |
| `carrack-w-c8x` | `carrack` | ✓ |
| `f8c-lightning-executive-edition` | `f8c-lightning` | ✓ |
| `mustang-alpha-vindicator` | `mustang-alpha` | ✓ |
| `valkyrie-liberator-edition` | `valkyrie` | ✓ |

## 컨셉 30척 — RSI 공식 컨셉 카탈로그로 격리 (2026-07-18 변경)

Erkul live 미등록. **[변경]** 기존 "완전 제외" → RSI 공식 컨셉 카탈로그(`data/canonical/ships-concept-rsi.json`, 사실원=RSI Ship Matrix). `status:"concept"`, 별도 탭/필터, 무역플래너·실전 비교·AI 추천 제외. 출처 감사·빈값·이상은 [`shipdb-concept-rsi-audit.md`](shipdb-concept-rsi-audit.md). 전부 `erkulStatus=unreleased`, `implemented=false`(단 RSI상 `atls`·`atls-geo`는 flight-ready).

| # | 제외 ID | # | 제외 ID | # | 제외 ID |
|---|---|---|---|---|---|
| 1 | `arrastra` | 11 | `galaxy` | 21 | `nautilus` |
| 2 | `atls` | 12 | `genesis` | 22 | `nautilus-solstice-edition` |
| 3 | `atls-geo` | 13 | `hull-d` | 23 | `odyssey` |
| 4 | `crucible` | 14 | `hull-e` | 24 | `orion` |
| 5 | `e1-spirit` | 15 | `javelin` | 25 | `pioneer` |
| 6 | `endeavor` | 16 | `kraken` | 26 | `ranger-cv` |
| 7 | `expanse` | 17 | `kraken-privateer` | 27 | `ranger-rc` |
| 8 | `g12` | 18 | `legionnaire` | 28 | `ranger-tr` |
| 9 | `g12a` | 19 | `liberator` | 29 | `vulcan` |
| 10 | `g12r` | 20 | `merchantman` | 30 | `zeus-mk2-mr` |

> 권위 목록은 `capture-baseline.mjs` 산출(`idList`에서 `hasLive=false` 30건)을 기준으로 한다.

## 요약

| 구분 | 수 |
|---|---|
| 공개 canonical (Erkul live) | 219 |
| 중복 에디션 별칭 | 7 |
| 미출시 보관 | 30 |
| **제외 합계** | **37** |
| **volt-data.ships 총계** | **256** |
