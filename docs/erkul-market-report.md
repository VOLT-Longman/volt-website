# Erkul 함선 시장(구매처/렌탈) report (A-3)

`ship-market-normalized.json` 산출 결과 요약. 재현: `npm run shipdb:erkul:market`

- 원천: Erkul live shop (fetch: 2026-07-12T02:50:30.125Z)
- 상점 112개 / inventory 3471행 / 함선 매칭 346행
- 구매처 확인 함선: **173척** / 렌탈처 확인 함선: **41척**
- 판매처 없는 함선: 46척 (인게임 비판매 — 픽업 전용/이벤트/컨셉 판매 함선 포함)

## 분류 규칙 적용 결과

- price=0 → purchase 반영 **0건** (전체 zero-price 95건은 anomaly로 기록)
- zero-price 행은 전부 렌탈 상점 소속: 예 (렌탈 가격 미표기 관행)
- rental 판정: 원본 `data.rental` boolean 사용 (상점명 Rental 패턴과 112개 전수 일치)
- 중복 행(shop+location+ship+price): 0건 dedupe
- 빈 inventory 상점: 3개

## unmatched inventory

- 미매칭 distinct localName: 557종 — 대부분 무기/터렛/모듈 (함선 아님)
- 이 중 **함선 선체로 보이는 미매칭 6종** (추정 매칭 금지 원칙에 따라 조인하지 않고 기록만):

  - `rsi_aurora_mr` (4행, 예: New Deal@Lorville) — Erkul live/ships 목록에 없음. A-4 별칭 테이블 후보
  - `rsi_aurora_ln` (4행, 예: New Deal@Lorville) — Erkul live/ships 목록에 없음. A-4 별칭 테이블 후보
  - `rsi_aurora_es` (4행, 예: New Deal@Lorville) — Erkul live/ships 목록에 없음. A-4 별칭 테이블 후보
  - `rsi_aurora_cl` (4행, 예: New Deal@Lorville) — Erkul live/ships 목록에 없음. A-4 별칭 테이블 후보
  - `aegs_hammerhead` (1행, 예: New Deal@Lorville) — Erkul live/ships 목록에 없음. A-4 별칭 테이블 후보
  - `rsi_aurora_lx` (1행, 예: New Deal@Lorville) — Erkul live/ships 목록에 없음. A-4 별칭 테이블 후보

## 판매처 없는 함선 목록

`aegs_gladius_pir`, `aegs_idris_m`, `aegs_idris_p`, `aegs_sabre_raven`, `aegs_tiburon`, `anvl_ballista_dunestalker`, `anvl_ballista_snowblind`, `anvl_carrack_expedition`, `anvl_hornet_f7a_mk1`, `anvl_hornet_f7a_mk2`, `anvl_hornet_f7cm_heartseeker`, `anvl_hornet_f7cm_mk2`, `anvl_hornet_f7cm_mk2_heartseeker`, `anvl_lightning_f8`, `anvl_lightning_f8c`, `argo_moth`, `cnou_mustang_omega`, `drak_caterpillar_pirate`, `drak_command_module`, `drak_dragonfly_pink`, `drak_dragonfly_yellow`, `drak_golem_ox`, `drak_ironclad`, `drak_ironclad_assault`, `drak_pitbull`, `gama_railen`, `gama_tyilui`, `grin_utv`, `krig_l22_alphawolf`, `krig_p72_archimedes_emerald`, `misc_hull_b`, `misc_starlite`, `mrai_guardian_qi`, `orig_600i_executive_edition`, `orig_m80`, `rsi_aurora_gs_ln`, `rsi_aurora_gs_lx`, `rsi_aurora_gs_mr`, `rsi_aurora_gs_se`, `rsi_aurora_mk2`, `rsi_constellation_phoenix_emerald`, `rsi_polaris`, `rsi_ursa_rover_emerald`, `vncl_glaive`, `vncl_scythe`, `xian_nox_kue`

## top 구매 location

- Lorville: 113행
- Area18: 66행
- Levski: 19행
- Ruin Station: 11행
- Orison: 9행
- Checkmate: 9행
- Orbituary: 9행

## top 렌탈 location

- Lorville: 19행
- Orison: 18행
- Area18: 17행
- New Babbage: 12행
- Baijini Point: 8행
- Seraphim: 8행
- Everus Harbor: 8행
- CRU L1: 4행
- HUR L1: 4행
- ARC L1: 1행

## 대표 샘플

### Asgard (`anvl_asgard`)

- 구매처:
  - Astro Armada @ Area18 — 17,860,500 aUEC
- 렌탈처:
  - 없음

### 100i (`orig_100i`)

- 구매처:
  - Astro Armada @ Area18 — 1,146,600 aUEC
  - New Deal @ Lorville — 1,146,600 aUEC
- 렌탈처:
  - Regal Luxury Rentals @ New Babbage — price null
- anomaly: 1건

### 890 Jump (`orig_890jump`)

- 구매처:
  - Astro Armada @ Area18 — 65,356,200 aUEC
  - New Deal @ Lorville — 62,088,392 aUEC
- 렌탈처:
  - 없음

### Ballista (`anvl_ballista`)

- 구매처:
  - Astro Armada @ Area18 — 1,481,760 aUEC
  - New Deal @ Lorville — 1,481,760 aUEC
- 렌탈처:
  - 없음

### Centurion (`anvl_centurion`)

- 구매처:
  - Astro Armada @ Area18 — 1,164,240 aUEC
  - New Deal @ Lorville — 1,164,240 aUEC
- 렌탈처:
  - 없음

### Spartan (`anvl_spartan`)

- 구매처:
  - Astro Armada @ Area18 — 846,720 aUEC
  - New Deal @ Lorville — 846,720 aUEC
- 렌탈처:
  - 없음

### PTV (`grin_ptv`)

- 구매처:
  - Astro Armada @ Area18 — 28,350 aUEC
- 렌탈처:
  - 없음

### STV (`grin_stv`)

- 구매처:
  - Astro Armada @ Area18 — 75,600 aUEC
  - Buy-&-Fly @ Checkmate — 75,600 aUEC
  - Buy-&-Fly @ Orbituary — 75,600 aUEC
  - Buy-&-Fly @ Ruin Station — 75,600 aUEC
- 렌탈처:
  - Traveler Rentals @ Area18 — price null
  - Traveler Rentals @ Orison — price null
  - Vantage Rentals @ Lorville — price null
- anomaly: 3건

### M50 Interceptor (`orig_m50`)

- 구매처:
  - Astro Armada @ Area18 — 1,499,400 aUEC
  - New Deal @ Lorville — 1,499,400 aUEC
- 렌탈처:
  - Regal Luxury Rentals @ New Babbage — 1,499,400

### Blade (`vncl_blade`)

- 구매처:
  - Astro Armada @ Area18 — 7,796,250 aUEC
- 렌탈처:
  - 없음
