# Erkul 함선 시장(구매처/렌탈) report (A-3)

`ship-market-normalized.json` 산출 결과 요약. 재현: `npm run shipdb:erkul:market`

- 원천: Erkul live shop (fetch: 2026-10-05T01:53:08.801Z)
- 상점 39개 / inventory 625행 / 함선 매칭 625행
- 구매처 확인 함선: **172척** / 렌탈처 확인 함선: **47척**
- 판매처 없는 함선: 48척 (인게임 비판매 — 픽업 전용/이벤트/컨셉 판매 함선 포함)

## 분류 규칙 적용 결과

- price=0 → purchase 반영 **0건** (전체 zero-price 0건은 anomaly로 기록)
- zero-price 행은 전부 렌탈 상점 소속: 예 (렌탈 가격 미표기 관행)
- rental 판정: 원본 `data.rental` boolean 사용 (상점명 Rental 패턴과 112개 전수 일치)
- 중복 행(shop+location+ship+price): 0건 dedupe
- 빈 inventory 상점: 0개

## unmatched inventory

- 미매칭 distinct localName: 0종 — 대부분 무기/터렛/모듈 (함선 아님)
- 이 중 **함선 선체로 보이는 미매칭 0종** (추정 매칭 금지 원칙에 따라 조인하지 않고 기록만):


## 판매처 없는 함선 목록

`aegs_gladius_dunlevy`, `aegs_gladius_pir`, `aegs_idris_m`, `aegs_idris_p`, `aegs_sabre_raven`, `aegs_sabre_raven_ex`, `aegs_tiburon`, `anvl_carrack_expedition`, `anvl_hornet_f7a_mk1`, `anvl_hornet_f7a_mk2`, `anvl_hornet_f7c`, `anvl_hornet_f7c_wildfire`, `anvl_hornet_f7cm`, `anvl_hornet_f7cm_heartseeker`, `anvl_hornet_f7cm_mk2`, `anvl_hornet_f7cm_mk2_heartseeker`, `anvl_hornet_f7cr`, `anvl_hornet_f7cs`, `anvl_lightning_f8`, `anvl_lightning_f8c`, `cnou_mustang_omega`, `drak_caterpillar_pirate`, `drak_command_module`, `drak_dragonfly_pink`, `drak_dragonfly_yellow`, `drak_ironclad`, `drak_ironclad_assault`, `drak_pitbull`, `gama_railen`, `gama_tyilui`, `glsn_basher`, `krig_p72_archimedes_emerald`, `krig_s65_stingray`, `misc_starlite`, `mrai_guardian_qi`, `orig_600i_executive_edition`, `orig_m80`, `rsi_aurora_gs_cl`, `rsi_aurora_gs_es`, `rsi_aurora_gs_ln`, `rsi_aurora_gs_lx`, `rsi_aurora_gs_mr`, `rsi_aurora_gs_se`, `rsi_constellation_phoenix_emerald`, `rsi_polaris`, `rsi_ursa_rover_emerald`, `vncl_glaive`, `vncl_scythe`

## top 구매 location

- Lorville: 117행
- Area 18: 64행
- Levski: 35행
- Ruin Station: 19행
- Checkmate Station: 19행
- Orbituary: 19행
- Orison: 10행

## top 렌탈 location

- Lorville: 29행
- Area 18: 21행
- Orison: 21행
- Stanton Gateway (Pyro): 18행
- Pyro Gateway (Stanton): 18행
- Terra Gateway (Stanton): 18행
- Nyx Gateway (Stanton): 18행
- Pyro Gateway (Nyx): 18행
- Stanton Gateway (Nyx): 18행
- Nyx Gateway (Pyro): 18행

## 대표 샘플

### Anvil Asgard (`anvl_asgard`)

- 구매처:
  - Astro Armada - Area 18 @ Area 18 — 17,860,500 aUEC
- 렌탈처:
  - 없음

### Origin 100i (`orig_100i`)

- 구매처:
  - Astro Armada - Area 18 @ Area 18 — 1,146,600 aUEC
  - New Deal - Teasa Spaceport - Lorville @ Lorville — 1,089,270 aUEC
- 렌탈처:
  - Regal Luxury Rentals - New Babbage Interstellar Spaceport - New Babbage @ New Babbage — 28,665

### Origin 890 Jump (`orig_890jump`)

- 구매처:
  - Astro Armada - Area 18 @ Area 18 — 65,356,200 aUEC
  - New Deal - Teasa Spaceport - Lorville @ Lorville — 62,088,400 aUEC
- 렌탈처:
  - 없음

### Anvil Hawk (`anvl_hawk`)

- 구매처:
  - Astro Armada - Area 18 @ Area 18 — 2,646,000 aUEC
- 렌탈처:
  - 없음

### Anvil Arrow (`anvl_arrow`)

- 구매처:
  - Astro Armada - Area 18 @ Area 18 — 1,984,500 aUEC
  - Teach's Ship Shop - Levski @ Levski — 1,984,500 aUEC
- 렌탈처:
  - 없음

### Anvil Gladiator (`anvl_gladiator`)

- 구매처:
  - Astro Armada - Area 18 @ Area 18 — 4,365,900 aUEC
- 렌탈처:
  - 없음

### Anvil Hurricane (`anvl_hurricane`)

- 구매처:
  - Astro Armada - Area 18 @ Area 18 — 5,556,600 aUEC
- 렌탈처:
  - 없음

### Anvil Terrapin (`anvl_terrapin`)

- 구매처:
  - Astro Armada - Area 18 @ Area 18 — 5,433,120 aUEC
  - Teach's Ship Shop - Levski @ Levski — 5,433,120 aUEC
- 렌탈처:
  - 없음

### Anvil Valkyrie (`anvl_valkyrie`)

- 구매처:
  - Astro Armada - Area 18 @ Area 18 — 19,845,000 aUEC
- 렌탈처:
  - 없음

### Anvil Ballista (`anvl_ballista`)

- 구매처:
  - Astro Armada - Area 18 @ Area 18 — 1,481,760 aUEC
  - New Deal - Teasa Spaceport - Lorville @ Lorville — 1,407,670 aUEC
- 렌탈처:
  - 없음
