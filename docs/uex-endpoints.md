# UEX proxy endpoints for the helper tools

Written 2026-11-19, revised the same day after an independent check. Covers the five endpoints added for the route / price / refinery / ship-money screens,
what the UEX fields really mean (with the response evidence), and how old the reports are.
Existing endpoints (`commodities`, `commodities/:id/prices`, `location-prices`, `loadout-prices`, `ship-prices`) are unchanged.
Where `docs/uex-proxy-design.md` (an earlier sketch, not maintained here) disagrees with this file, this file and the code are right.

## Shared behaviour

- GET only. Every upstream path is fixed in code or built from validated numeric ids; arbitrary query strings never reach UEX and never create cache keys.
- Outbound request to UEX: `Accept: application/json` only. No key, no cookie, no user or site identifier (asserted in tests).
- Response: `{ status:'ok', data, meta:{ source:'uex', cached, ttlSeconds, fetchedAt } }`, plus `meta.stale: true` when an expired copy is served (see below).
- Errors: 400 bad parameter, 404 unknown pair (history only), 503 UEX unreachable / timed out / non-200, 502 unexpected payload. Body `{ error }`.
- Unknown values are **left out**, never sent as 0. Numbers sent by UEX as text are read the same way as numbers.
- Community gate: all paths are under `/api/uex/`, so the existing gate and the forced `private, no-store` apply without change.
- Code: `functions/_shared/uex-proxy.js` (`loadUexDerived`, `proxyUexDerived`), tests `tests/functions/uex-helper-endpoints.test.mjs`.

Cache and protection of UEX (Cloudflare `caches.default`, which is separate for each Cloudflare data centre):

- Data copy at `/__uex-cache/derived/<name>`, fresh for the TTL below, kept for a further 24 hours as a fallback.
- **Failures are remembered for 60 seconds** (`/__uex-cache/derived-state/<name>`). During that time no request calls UEX again:
  visitors get the expired copy (`meta.stale: true`, browser cache 60 s) if there is one, otherwise the same 503 / 502.
- **One download at a time.** While one request is downloading a table, other requests get the existing copy, or, if there is none, wait up to 6 seconds for it to arrive.
  This uses a marker in the cache plus a per-process flag, not a lock: requests that reach different Cloudflare machines in the same instant can still each download once.
- A copy that cannot be read (corrupt entry, wrong shape) is ignored and replaced.
- A UEX answer that parses but yields an empty table (for example after a field type change) is treated as 502 and never cached. `price-history` is the exception: an empty list is a normal answer there.
- All of the limits above apply per data centre, not globally.

| Endpoint | UEX source | TTL | `?refresh=1` |
|---|---|---|---|
| `/api/uex/market` | `commodities_prices_all` | 30 min | yes, 60 s floor |
| `/api/uex/terminals` | `terminals` | 12 h | ignored |
| `/api/uex/refineries` | `refineries_yields`, `refineries_methods` | 24 h | ignored |
| `/api/uex/vehicle-prices` | `vehicles`, `vehicles_purchases_prices_all`, `vehicles_rentals_prices_all`, `terminals` | 12 h | ignored |
| `/api/uex/price-history?terminal=<id>&commodity=<id>` | `commodities_prices_history?id_terminal=&id_commodity=` | 12 h | ignored |

Sizes of our JSON on the 2026-11-18 responses (raw / gzip): market 194 KB / 21.9 KB (UEX original 1,076 KB),
terminals 62 KB / 7.0 KB (original 1,074 KB), refineries 9.9 KB / 1.7 KB, vehicle-prices 45 KB / 10.1 KB (originals 587 KB + 1,074 KB + two price tables), history under 1 KB per pair.

## Shapes

### `/api/uex/market` — `data` is a list, one row per terminal + commodity (2,599 rows, 135 terminals, 124 commodities)

A row is either a buy row (714) or a sell row (1,885); no row in the snapshot had both prices.

| Field | Meaning | UEX field |
|---|---|---|
| `t`, `c` | terminal id, commodity id | `id_terminal`, `id_commodity` |
| `buy` | price the player pays, aUEC per SCU (buy rows only) | `price_buy` > 0 |
| `stock` | SCU the player can buy; 0 = reported sold out (7 rows) | `scu_buy` |
| `sb` | stock level 1 (0–14 % of full) .. 7 (86–100 %) | `status_buy` |
| `sell` | price the player receives per SCU (sell rows only) | `price_sell` > 0 |
| `inv` | SCU the shop itself was reported to hold | `scu_sell_stock`, only when the newest report carried a quantity (`scu_sell` > 0) |
| `ss` | how full the shop is, 1 (0–14 %) .. 7 (86–100 %, "no demand") | `status_sell`, only together with `inv` |
| `box` | box sizes offered, e.g. `[1,2,4,8,16]` | `container_sizes` |
| `at` | time of the newest report, unix seconds | `date_modified` |

**How much a shop will still take is not in the data.** Only 309 of 1,885 sell rows carry `inv` and `ss`; the other 1,576 have a price and nothing else.
For those, show "quantity unknown" — not "empty", not "high demand", not 0.
There is no `demand` field. From `inv` and `ss` a screen can at most say: `ss` 7 = shop reported full; `ss` 5–6 = little room; lower = more room.
A number of SCU cannot be derived honestly (see point 3).

Rows of terminals that are no longer in the game are still listed; filter with `live` from `/api/uex/terminals` and with `at`.

### `/api/uex/terminals` — `data` is a list (181: 161 commodity, 20 refinery)

`id`, `type` (`commodity` | `refinery`), `name`, `nick`, `code`, `live` (false = not on the live servers now: 47 commodity terminals),
`systemId`/`system`, `planetId`/`planet`, `orbitId`/`orbit`, `moonId`/`moon`, `stationId`/`station`, `cityId`/`city`, `outpostId`/`outpost`, `faction`,
`flags` (only those reported as yes: `autoLoad`, `freightElevator`, `loadingDock`, `dockingPort`, `cargoCenter`, `refinery`, `refuel`, `repair`, `nqa`, `playerOwned`),
`maxBox` (largest box in SCU; on 128 terminals; missing = unknown). A missing flag is "not reported", not a confirmed "no".

### `/api/uex/refineries` — `data` is `{ methods, commodities, yields }`

- `methods` (9): `id`, `name`, `code`, `yield`, `cost`, `speed` — UEX ratings 1..3, not real multipliers.
- `commodities`: `{ id: English name }` for the 24 ores that have yield rows.
- `yields` (215): `t` refinery terminal id, `c` commodity id, `v` yield bonus in percent (−9 .. +13 seen, negatives are real), `at` report time.
  A missing terminal + ore pair is unknown, not 0. `value_week` / `value_month` equalled `value` in all 215 rows, so they are not sent.

### `/api/uex/vehicle-prices` — `data` is `{ terminals, vehicles }`

- `vehicles` (182 with a price; all 182 can be bought, 44 can also be rented): `id` (UEX vehicle id), `uuid`, `name`,
  `buy` and `rent`: lists of `{ t, price, at }` sorted by price. Duplicate reports per terminal keep the newest; offers at closed or unknown terminals are dropped (same rule as `ship-prices`).
- `uuid` is the game record id of the ship, lower case — the key to join with our game-file ship data. Checked on the real UEX `vehicles` list (2026-11-18 17:41 UTC, 285 vehicles):
  171 have a uuid; **134 of the 182 priced vehicles carry one, 48 do not** (45 because UEX has none, 3 because UEX gives the same uuid to two vehicles —
  Prowler / Prowler Utility and Guardian QI / Guardian MX — so it is left out as unknown). For those 48, match by `name` or show the price without a link. 152 of the 171 UEX uuids occur in `data/canonical/ships-canonical.json`.
- `name` is UEX `name_full` (maker + model, e.g. `Origin 100i`). All 182 priced vehicles are in the UEX list, so every name has this form.
- `terminals`: `{ id: { name, place, system } }` for the 39 shops used.

### `/api/uex/price-history` — `data` is a list sorted oldest first (may be empty)

`at` (report time), then the same `buy`/`stock`/`sb` or `sell`/`inv`/`ss` fields as the market row, and `v` (game version).
A sell report whose quantity was entered as 0 comes out as `{ at, sell, v }` only (8 of 11 reports in the Aluminum example; 9 of 9 for Diamond) — see point 4.
Both ids must be 1–7 digits and the pair must exist in the market snapshot, otherwise 400 / 404 without calling the history endpoint.

## What the UEX fields mean (11 keyless GET calls, 2026-11-18 17:23–17:41 UTC, plus the saved survey responses)

**1. `scu_buy` is the stock a player can buy.** It is above 0 in 707 of 714 buy rows and in 0 of 1,885 sell rows.
UEX docs: `scu_buy // last`, listed under "inventory state for purchase". The 7 rows with 0 are all at `status_buy` 1 ("Out of Stock").

**2. `scu_sell_stock` is what the shop itself holds at a sell location** (docs: "reported inventory scu at location (sell) … last amount of SCU reported at location").
It is not something a player can buy. In the bulk snapshot it can be a leftover of an older report and older than `date_modified`:
TDD Area 18 / Diamond shows `scu_sell_stock 90` and `date_modified` 11-18 04:30, yet all 9 history reports since 11-13 say 0. 1,268 rows have such a leftover.

**3. `scu_sell` is not "demand left", and no demand figure can be made from it.** The docs call it "scu sell demand (forecasted)",
but where it is above 0 it is `scu_sell_stock × 7 ÷ status_sell` rounded to a whole number: 308 of 309 rows (194 without any rounding needed; the one miss is terminal 4 / commodity 106, 2,061 × 7 ÷ 6 = 2,404.5 stored as 2,404).
Laranite at TDD Area 18: 811 × 7 ÷ 4 = 1,419. At status 7 `scu_sell` equals `scu_sell_stock` (Gold: 840 and 840).
So `scu_sell` adds nothing to `inv` and `ss`. Subtracting the stock from it gives `inv × (7 − ss) ÷ ss`, which is exactly `6 × inv` on all 103 rows at status 1 —
a shop reported nearly empty would show a small figure (median 138 SCU, 42 rows under 50) and a fuller shop a larger one. That is backwards, so the earlier `demand` field was removed.
The status only says which seventh of its capacity the shop is in; the capacity itself (and so the room left) is between `inv × 7 ÷ ss` and `inv × 7 ÷ (ss − 1)`, without an upper limit at status 1.

**4. `scu_sell = 0` means the report has no usable quantity. Whether the shop was really empty is not known.** 1,576 of 1,885 sell rows (84 %) have it.
Every one of them has `status_sell` 1 and no other value ever occurs, which is what a default looks like; the status legend calls 1 "Out of Stock (Empty)".
In the history each such report has `scu_sell_stock` 0 as well (Diamond: 9 of 9; Aluminum: 162, 87, then seven zeros, 5, and 0 again 29 minutes later).
Buy reports almost always carry a quantity (707 of 714), sell reports rarely do, so "quantity not entered" is the likelier reading, but the responses cannot prove it.
Both endpoints therefore send neither `inv` nor `ss` for these reports. To be checked in game or with UEX.

**5. `max_container_size = 0` means "not reported".** All 665 non-commodity terminals have 0. Among commodity terminals, 0 appears on 33:
23 with no price rows at all and 10 that are off the live servers with a single 125+ day old row and an empty `container_sizes`.
128 terminals have a value (1 SCU: 8, 16: 15, 24: 31, 32: 74). Compared with the largest `box` in that terminal's price rows: 120 agree, 3 disagree
(terminal 11: 24 vs 16, terminal 24: 32 vs 24, terminal 477: 16 vs 1), 5 have no box rows to compare. Row-level `box` is the better source; `container_sizes` is empty in 17 rows.

**6. `*_avg` covers the last 15 days** (UEX "Default Average (Days) 15", `data_parameters.commodity.ttl = 15`).
Evidence: every row with a price average above 0 had its newest report at most 14.4 days old (1,879 + 691 rows); every row with average 0 (29 rows) was 15.8 days or older.
Stock averages skip zero reports: Aluminum `scu_sell_stock_avg 85` = mean of 162, 87, 5 while 8 other reports were 0. An average of 0 means "no data in the window".
On `commodities_prices?id_terminal=12`, `_avg`, `_avg_week` and `_avg_month` were identical in all 84 sell rows, so week/month add nothing today. We send no averages.

**7. Rate limits and errors.** None of the keyless calls (about one every 3 s) or the survey's 20 returned a rate-limit or Retry-After header; only `Cache-Control: public, max-age=…, must-revalidate`
(1,800 s for prices, 43,200 s for history and vehicles, even on the 400 answer). Missing parameter: HTTP 400 `{"status":"missing_id_terminal","http_code":400,"data":null,"message":"Terminal not specified"}`.
Unknown id: HTTP 200 with `"data":[]`. Documented quota is 172,800 requests a day or 120 a minute; whether it applies without a key is not stated.
The bulk snapshot took 7.9 s to download once, close to our 10 s timeout; the vehicle list (587 KB) took 2.0 s.

**8. History depth.** `commodities_prices_history` returns the current game version only (4.10.3: 11 rows since 2026-11-13).
With `&game_version=4.10.2` the same pair returned 14 rows from 10-09 to 11-11. Our endpoint asks for the current version only.

## How old the reports are (owner decision: maximum price age)

Snapshot 2026-11-18 17:23 UTC, 2,599 rows. Median age 27 hours, 90 % within 87 hours, oldest 614 days.

| Cut-off | Rows kept | Share | Terminals with any report inside | Commodities with a buy and a sell row inside |
|---|---|---|---|---|
| 1 hour (today's rule) | 67 | 2.6 % | 5 of 135 | 5 |
| 6 hours | 383 | 14.7 % | 20 | 46 |
| 24 hours | 1,115 | 42.9 % | 51 | 62 |
| 3 days | 1,936 | 74.5 % | 87 | 65 |
| 4 days | 2,386 | 91.8 % | 103 | 71 |
| 7 days | 2,485 | 95.6 % | 108 | 75 |
| 15 days | 2,570 | 98.9 % | 113 | 78 |

Other tables: ship purchase prices 5–6 days old (all 311), rentals median 13 days (max 57), refinery yields median 25 days (max 33).
With the current 60-minute rule a whole-market route search has almost nothing to work with; 3 to 7 days keeps most of the market.

## Current code that reads these fields the wrong way (reported only, not changed)

1. `js/journey-calc.js:18` and `js/uex.js:162` use `scu_sell` as demand. It is a figure computed from the shop's own inventory (point 3), so it is not a sellable quantity; at "no demand" (status 7) it still allows the full figure (840 SCU for Gold at TDD Area 18).
2. The same two lines treat `scu_sell = 0` as zero demand. That is the case for 84 % of sell rows, so the sellable quantity is capped to 0 for most destinations although the quantity is simply unknown.
3. `js/uex-panel.js:708-717` labels `scu_sell` as "demand" (수요) on the sell card; same misreading as 1.
4. `js/journey-calc.js:10-13` and `js/uex.js:40-41` (plus `functions/_shared/ai-tools.js:205-209`) require reports under 60 minutes; only 2.6 % of rows qualify.
5. `scu_buy` as stock (`js/journey-calc.js:18`, `js/uex.js:161`) is read correctly.

## Not settled

- Whether a sell report with quantity 0 means "shop empty" or "not entered" (point 4). Until settled it is sent as unknown.
- Whether `scu_buy` in the bulk snapshot can also be a leftover of an older report (seen only for `scu_sell_stock`), and whether the 7 buy rows with stock 0 are real sell-outs.
- Rental period behind `price_rent` (the docs say only "last").
- Which direction the method ratings run; the values fit "3 = high yield / high cost / fast" but UEX does not say so.
- Keyless quota, and whether limits are per IP.
- Behaviour on Cloudflare itself was not run: the cache markers, the wait for a download in progress, and whether `/API/UEX/...` (upper case) can reach a Function.
  The gate code compares paths case-sensitively and `/__uex-cache/...` is outside the gate (`functions/_middleware.js`, `functions/_shared/community-access.js`; not changed here).
  `_routes.json` sends every request through Functions, so a visitor asking for `/__uex-cache/...` should get the static 404, not the cached copy — worth one check on a preview deployment with the gate switched on.
- `/api/uex/vehicle-prices` downloads the 1 MB `terminals` table that `/api/uex/terminals` also downloads (separate cache entries, each at most once per 12 h per data centre).
- UEX terms on storing or showing the data were not re-read here; see the survey notes.
