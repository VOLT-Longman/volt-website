# Trade engine (`js/trade-engine.js`)

Written 2026-11-19. The shared calculation module behind the trade routes, market and multi-stop tour screens.
The mount contract for the screens is in `docs/helper-tools.md`; the data shapes are in `docs/uex-endpoints.md` and the
headers of `data/trade/cargo.json` / `data/trade/world.json`.

- Classic script, one global: `window.VOLT_TRADE_ENGINE`. In Node, `require('./js/trade-engine.js')` or
  `import engine from '../../js/trade-engine.js'` returns the same object (same pattern as `js/journey-calc.js`).
- **Pure**: no DOM, no `fetch`, no timers. The only side effect is the shared-selections store (section 8), which touches
  `localStorage` when a screen calls it.
- Tests: `node --test tests/functions/trade-engine.test.mjs` (24 tests, small hand-checkable fixtures plus a speed test).

## 1. Rules the engine keeps

1. **Unknown stays unknown.** A value the data does not have is `null` in the output, never `0`, never an estimate.
   Screens print it with `VOLT_HELPER.unknown()`.
2. **No invented demand.** `/api/uex/market` has no figure for how many SCU a shop will still take. The engine never
   caps a sale by `inv` or `ss`; it reports `destination.takes: null`, the fill level `destination.level` (1..7, when
   reported) and `destination.full` (`level === 7`, "reported full"). A route carries the `demand.unknown` label.
   Only if a sell row ever carries a `room` field (SCU still accepted; the proxy does not send one today) is it used as a cap.
3. **Every time is an estimate** and says what it assumes (`assumptions` list, section 7).
4. **Price age**: only reports up to `maxAgeDays` old are used (default 3, owner decision 2026-11-19). A report with no
   time, or a time more than 5 minutes in the future, counts as "age unknown" and is not used either. Every price in the
   output comes with its report time (`buyAt`, `sellAt`, `at`, `oldestAt`).
5. Rows of terminals UEX marks as not on the live servers are left out unless `includeNotLive` is set.
6. A reported stock of 0 is "sold out" (row not used for buying); a missing stock is "not reported" (not a cap, flagged).

## 2. Inputs

```js
const E = window.VOLT_TRADE_ENGINE;
const model = E.buildModel({
    market,         // data of /api/uex/market           (required)
    terminals,      // data of /api/uex/terminals        (required)
    cargo,          // data/trade/cargo.json             (required)
    world,          // data/trade/world.json             (required)
    commodities,    // data of /api/uex/commodities      (optional: names, Korean names, legality)
    vehiclePrices,  // data of /api/uex/vehicle-prices   (optional: only for shipsForBudget)
    ships,          // data/canonical/ships-canonical.json (optional: joins vehicle prices by game record id)
});
```

`buildModel` does not depend on the player's settings; build it once per data load (about 5 ms) and reuse it.

Why `commodities` is needed: market rows carry only the UEX commodity id. The engine joins UEX commodity names to
`world.commodities` by English name (lower case, letters and digits only). On the 2026-11-18 snapshot all 124 traded
commodities match. Without `commodities`, names are `null` and legality is unknown.

### Settings object

Every calculation takes a settings object. `E.state.get()` can be passed as it is; extra fields may be added.
`E.settings(partial)` returns the cleaned form (also returned as `result.settings`).

| Field | Meaning | Default |
|---|---|---|
| `ship` | ship id from `cargo.json` | `null` → result `problem: 'no-ship'` |
| `budget` | aUEC the player can spend | `null` = not chosen, **not a cap**; `0` = cannot buy |
| `system` | system the player is in (stored for the screens; the engine filters by `filters.system`) | `null` |
| `maxAgeDays` | price age cut-off | `3` |
| `boxes` | box sizes the player wants to handle, e.g. `[8,16,24,32]` | `null` = all seven |
| `capacityScu` | hold size typed in by the player; replaces the game grids (shape and largest box are then ignored, labelled `cargo.capacityOverride`) | `null` |
| `time` | changed time values (section 6) | `{}` = all defaults |
| `now` | reference time in ms | `Date.now()` |

Ship problems are reported, not guessed: `no-ship`, `unknown-ship`, `cargo-unknown` (the 4 ships whose cargo total is not
in the game files — show "게임 자료에 없음"), `no-cargo` (no cargo grid in the default loadout, or none of the enabled boxes fits).

## 3. The model

- `model.terminals` (Map by UEX terminal id): `name` (`{en, ko?}` from the joined game location, otherwise the UEX name),
  `uexName`, `code`, `live`, `system`, `place`, `faction`, `flags` (only the facilities UEX reports as yes; a missing key is
  "not reported", not "no"), `maxBox`, and from `world.joins.terminals.map`: `locationId`, `amenities`, `pad`, `hangar`,
  `law`, `surface`, `isStation`, `bodyId`, `position`. `buys[]` = goods the player can buy (`price`, `stock`, `level`,
  `box`, `at`), `sells[]` = goods the player can sell (`price`, `inv`, `level`, `room`, `box`, `at`).
- `model.commodities` (Map by UEX commodity id): `name`, `code`, `group`, `gameId`, `buys[]`, `sells[]`.
- `model.header`: `gameVersion`, `builtAt` for `VOLT_HELPER.sourceLine`.
- `model.counts`: rows read, rows of unknown terminals, rows of not-live terminals.

Screens should use the view functions rather than reach into the model: `listTerminals(model, filters)`,
`listShips(model)`, `terminalSheet`, `commoditySummary`, `commodityDetail` (section 5).

## 4. Quantity, boxes, profit

For one good on one terminal pair:

```
quantity = smallest of
    ship      SCU the hold can take in the box sizes this trade allows
    stock     reported stock                     (skipped when not reported → stockKnown:false, label stock.unknown)
    budget    floor(money left / buy price)      (skipped when no budget is set)
    destination  SCU the destination takes       (skipped: not in the data → takes:null, label demand.unknown)
then rounded down to what the boxes can actually make up
```

The result lists all four caps (`caps`), which one decided (`limitedBy`: `ship`, `stock`, `budget`, `destination`, or
`boxes` when the box sizes could not make up the full amount) and the box list (`boxes: [{scu, count}]`).
`investment = quantity × buy price`, `revenue = quantity × sell price`, `profit = revenue − investment`,
`roi = profit ÷ investment`. Prices are taken as fixed while trading (label `price.static`).

**Box sizes allowed for a trade** = sizes the origin row offers (`box`) ∩ sizes the player enabled ∩ sizes up to the
destination limit (the destination row's `box` if reported, otherwise the terminal's `maxBox`). When the origin row has no
`box`, all sizes up to the origin terminal's `maxBox` are assumed and the good is flagged `boxesAssumed`.

**The hold** (`shipProfile`): each grid in `cargo.json` is filled by really stacking boxes in its cell grid, largest
first, using only sizes between the grid's `minBox` and `box`. That gives a list of free places ("slots"). With all sizes
enabled every one of the 100 ships with grids stacks to exactly its game `scu` (tested). A trade then takes slots, splitting
a slot into smaller boxes when the good is not sold in the slot's size and returning what is left of a part-used slot.
Assumptions (label `cargo.packing`): boxes may be turned freely (same assumption as the data file) and a slot can be
subdivided into any smaller standard boxes of the same volume. Cargo from optional modules, ore pods and salvage holds
is not in the data and not counted.

**Several goods per origin** (`maxGoods`, 1–8, default 1): goods are taken in order of margin per SCU; each takes hold
space and money, the next one gets what is left. When the pair has more goods than `maxGoods`, a second order is also tried —
goods ranked by the profit each would make alone in the empty hold (hold, stock, budget and destination caps, before box
fitting) — and the load with the higher profit is kept, so a few SCU of a high-margin good no longer hide a good that fills
the hold. Only these two orders are compared; it is not a search over every mix. A request that names `commodities` is
loaded exactly as named.

Auto-loading fees from the game files are returned as `autoLoadFee` but **not** subtracted from profit (their unit is
read from field names only).

## 5. Functions

All return plain objects. `filters` are optional everywhere.

| Call | What it gives |
|---|---|
| `rankRoutes(model, settings, filters)` | `{ ok, problem, routes[], total, stats, ship, settings }` — A→B routes, best first |
| `evaluateRoute(model, settings, {from, to, commodities?}, filters)` | `{ route }` for one pair; listed even when nothing can be carried (quantity 0, time still given) |
| `compareShips(model, settings, {from, to, commodities?, ships?}, filters)` | `{ rows[{ship, capacity, quantity, investment, profit, seconds, profitPerHour, route}], unknownCargo[] }` for every ship with a hold |
| `nextLegs(model, settings, {from, toward?}, filters)` | `rankRoutes` from one terminal; with `toward`, each route gets `homeSeconds`, `closer`, `arrivesHome` |
| `findChains(model, settings, options)` | multi-stop runs (below) |
| `planMixedLoad(model, settings, {from, fixed:[{c, scu}], fill?, to?, limit?}, filters)` | fixed goods + fill the rest; without `to` the best single destination and the runners-up |
| `whereToSell(model, settings, {cargo:[{c, scu, paid?}], at?, limit?}, filters)` | cargo already on board: `single[]` (sell everything at one place) and `perGood[]` (best places per good) |
| `commoditySummary(model, settings, filters)` | per commodity: `cheapestBuy`, `bestSell`, `margin`, `marginPercent`, place counts, `oldBuy` / `oldSell` |
| `commodityDetail(model, settings, commodityId, filters)` | all buy places (cheapest first) and sell places (dearest first); old reports included with `ageLevel: 'old'` |
| `terminalSheet(model, settings, terminalId)` | one terminal: facilities, game location, buy and sell tables with ages |
| `shipsForBudget(model, settings, options)` | which cargo ship fits my money (below) |
| `shipProfile(model, settings)` / `splitBoxes(model, settings, scu, sizes?)` | hold summary / box split for an amount |
| `travelBetween(model, settings, fromId, toId)` | flight estimate between two terminals |
| `legality(model, commodityId, fromId, toId)` | `{ legal, from, to, source }` |
| `settings`, `timeSettings`, `ageSeconds`, `ageLevel`, `travel.*`, `TIME_DEFAULTS`, `ASSUMPTIONS`, `STANDARD_BOXES` | helpers and constants |

### Filters (`rankRoutes`, and where noted the others)

| Filter | Meaning |
|---|---|
| `commodity`, `from`, `to` | UEX id or list of ids |
| `system` | both ends in this system (name, any case); `fromSystem`, `toSystem` for one end; `sameSystem: true` = no jumps |
| `stationsOnly` | both ends are space stations (game location not on a surface) |
| `fullLoadOnly` | only routes that fill the hold |
| `legalOnly` | only goods legal at both ends; goods whose legality is unknown are left out too |
| `avoidFull` | leave out destinations reported full (`ss` 7) |
| `includeNotLive` | also use terminals UEX marks as not live |
| `maxGoods` | goods per origin, 1–8, default 1 |
| `returnTrip` | add `ret` (load for the way back, or an empty flight) and `roundTrip {profit, seconds, profitPerHour}`; `perHour` / `profit` sorting then uses the round trip |
| `sort` | `perHour` (default), `profit`, `margin`, `roi`; routes whose time is unknown sort last under `perHour` |
| `limit` | default 50, max 500; `total` is the full count |
| `minProfit` | default 0 |

`stats` explains what was left out: `tooOld`, `ageUnknown`, `soldOut`, `notLive`, `illegal`, `legalUnknown`,
`fullDestination`, `timeUnknown`, plus `pairs`, `pairGoods`, `routes`.

### A route

`from`, `to`, `goods[]`, `boxes[]`, `quantity`, `capacity`, `full`, `investment`, `revenue`, `profit`, `roi`,
`marginPerScu`, `time`, `seconds`, `profitPerHour` (`null` when the time cannot be estimated), `autoLoadFee`, `oldestAt`,
`legal`, `assumptions[]`.
A good: `c`, `quantity`, `boxes`, `boxesAssumed`, `buyPrice`, `sellPrice`, `margin`, `cost`, `revenue`, `profit`, `caps`,
`limitedBy`, `stockKnown`, `destination {takes, level, inv, full}`, `buyAt`, `sellAt`, `legal`, `illegal {from, to}`, `legalSource`.

### Legality

Game files decide: `world.commodities[].illegal` per jurisdiction (`'p'` prohibited, `'c<n>'` controlled class n), looked up
with the terminal's `law`, following `parent` where a jurisdiction `inherits`. `legal` is `true` only when neither end has
an entry. Only when the game data cannot answer (commodity not matched, or a terminal without a joined location) the UEX
`is_illegal` flag is used (`legalSource: 'uex'`). Otherwise `legal: null`.

### Multi-stop chains (`findChains`)

Options: `stops` (places visited, 2–8, default 3), `mode` (`'flyOn'` | `'roundTrip'`), `start` (terminal id),
`maxLegSeconds`, `stayInSystem`, `goal` (`'perHour'` | `'profit'`), `limit` (10), `beam` (24, max 200),
`maxWork` (40,000, max 400,000), plus the route filters.

- Beam search: at each step every kept chain is extended by every profitable loaded leg, and the best `beam` are kept.
- A terminal is never visited twice (so the same stock is never counted twice). Money grows with each leg's profit.
- Legs whose time is unknown are not used. In `roundTrip` the closing leg back to the start is loaded when something pays,
  otherwise an empty flight (`closing.empty`).
- **Hard work budget**: `work` counts leg evaluations; at `maxWork` the search stops and returns what it has with
  `truncated: true`. The limit itself is capped, so the browser cannot be frozen by a setting.
- `shortened: true` when no chain of the requested length exists and shorter ones are returned.
- Result chain: `stops[]`, `legs[]` (routes), `closing`, `profit`, `seconds`, `profitPerHour`, `investment` (largest
  amount tied up in one leg), `assumptions[]`.

### Which cargo ship fits my money (`shipsForBudget`)

Options: `money` (default `settings.budget`), `mode` (`'buy'` | `'rent'` | `'both'`), `ships` (subset), `limit` (20),
`maxShips` (offers evaluated per call, default 40; the rest is counted in `skipped` — call again with `ships` to continue),
plus the route filters.

For each ship with a hold and a price not above `money`: cheapest offer (`price`, `priceAt`, `shop`), `moneyLeft`,
`bestRoute` (best profit per hour with `moneyLeft` as budget, at current prices), `noLimitRoute` (`{ quantity, investment, full }`
of the best route with no money limit — **not** the cost of a full hold: stock or box sizes can leave it below the hold size,
`full` says which) and `canAffordNoLimitRoute`, `profitPerRun`, `profitPerHour`, `runsToPayBack = ceil(price ÷ profit per run)`,
`hoursToPayBack = runsToPayBack × seconds of one outbound trip ÷ 3600` (never shorter than one trip; flying back is not
counted, assumption `payback.oneWay`). Also `noPrice[]`, `unknownCargo[]`, `tooExpensive`.
(Until 2026-11-19 these were `fullLoadCost`, `canFill` and `hoursToPayBack = price ÷ profit per hour`; the names described
something else than they held, so they were replaced. No screen used them.)

Assumptions to show with it (`payback.repeat`, `payback.oneWay`, `rent.period`): the same route is repeated at the same prices and stock;
fuel, repair and insurance are not included; the rental period behind a rent price is not in the data (`rentPeriod: null`).
Ships are joined to UEX prices by game record id (`uuid` = `gameRef`); where UEX has no usable id, by name when exactly one
ship id fits (`matchedBy: 'name'` — show the UEX name next to it).

## 6. Time model

`time.seconds = buy + load + depart + flight + arrive + sell + unload` (each in `time.parts`).

| Part | Source |
|---|---|
| `flight` | see below — **unvalidated estimate** |
| `load`, `unload` (automatic) | game files: `world.loading.baseLoad` / `baseUnload` (120 s) + per-box seconds from `world.boxes` (2, 3, 5, 8, 12, 15, 18 for 1..32 SCU). Cargo-deck ships (`deck: 1`, Hull C): base + `deckPerScu` × SCU instead of the per-box values. Units are read from field names (label `time.autoLoad`). Used only at terminals where UEX reports `autoLoad` and `time.loading` is `'auto'`. |
| everything else | **our own default guesses**, player-editable (table below) |

Flight between two terminals (`time.flight.mode`):

- `quantum`: straight line between the game positions, default quantum drive of the ship, same formulas as
  `scripts/trade/travel-model.mjs` (`E.travel.*` mirrors it; a test compares the two on every drive). Seconds = spool + the
  middle of the range the two acceleration rates give; `minSeconds` / `maxSeconds` carry the range. `fuelScu`, `tankScu`,
  `fuelEnough` are given with the label `fuel.unit` (unit assumed SCU per Gm).
- `same-body`: both places belong to the same planet or moon in the game data — two surface places, or a surface place and a
  station in orbit around that body (`flight.orbit === true` when at least one end is not on the surface). The quantum formula
  is not used for either case; the flat `sameBodySeconds` is used and no atmosphere time is added. It is our own default, not a
  value computed from the distance; the player can change it.
- `jump`: other system — quantum to the gateway station whose `gate` names the target system, `jumpSeconds`, quantum from
  the opposite gateway. Jump tunnel time is not in the game files.
- `same-place`: two terminals at one location, 0 s and no take-off or landing.
- Unknown (`time.known: false`, `reason`): `no-position` (terminal not joined to a game location with a position),
  `no-drive` (no quantum drive in the default loadout, e.g. ground vehicles), `no-gateway`, `no-ship`.
  The route is still listed; `seconds` and `profitPerHour` are `null`.

Not modelled: orbital motion (positions are a snapshot), route bending around bodies, calibration, queueing for a hangar,
hangar elevators, walking.

### `TIME_DEFAULTS` — our assumptions

None of these is in the game files, none was measured in game, and none is taken from another site. They are round
placeholder numbers so that a first estimate exists; show them as "우리가 정한 기본값 / our default guess" and let the player
change them (`state.set({ time: { landingSeconds: 90 } })` stores only the changed keys). Values are limited to 0–14,400 s.

| Key | Default | Meaning |
|---|---|---|
| `loading` | `'auto'` | `'auto'`: automatic loading where the terminal reports it, by hand elsewhere. `'manual'`: always by hand |
| `takeoffSeconds` | 120 | boarding to quantum-ready, per departure |
| `landingSeconds` | 180 | end of quantum to landed / docked, per arrival |
| `atmosphereSeconds` | 180 | added per take-off or landing at a place on a surface (not for `same-body` hops) |
| `terminalSeconds` | 60 | one buy or one sell at the terminal |
| `manualBaseSeconds` | 60 | fixed part of loading or unloading by hand |
| `manualBoxSeconds` | 30 | per box by hand, any size |
| `sameBodySeconds` | 600 | flight between two places on the same planet or moon |
| `jumpSeconds` | 300 | passing a jump point |

## 7. Assumption labels

Every result that contains an estimate carries `assumptions: [code]`. `E.ASSUMPTIONS[code]` has the sentence to show in
`ko` and `en`, so every screen words it the same way.

`time.quantum`, `time.manual`, `time.autoLoad`, `time.sameBody`, `time.jump`, `cargo.packing`, `cargo.boxesAssumed`,
`cargo.capacityOverride`, `stock.unknown`, `demand.unknown`, `price.static`, `payback.repeat`, `payback.oneWay`, `rent.period`, `fuel.unit`.

## 8. Shared selections (`E.state`)

One `localStorage` key, `volt-helper-state-v1` (`E.STATE_KEY`), with a version field `v`. Nothing personal is stored and
nothing leaves the browser. API unchanged from the shell's placeholder: `get()`, `set(patch)`, `reset()`,
`subscribe(fn)`, `defaults`. Works without `localStorage` (memory only for that visit) and follows changes from other tabs.

| Field | Meaning | Default |
|---|---|---|
| `v` | shape version | `1` |
| `ship` | my ship (`cargo.json` id) | `null` |
| `budget` | aUEC I can spend | `null` (not 0) |
| `system` | system I am in | `null` |
| `maxAgeDays` | price age cut-off in days | `3` |
| `time` | only the time keys the player changed (section 6); unknown keys and bad values are dropped | `{}` |
| `boxes` | box sizes I handle; **new field** added by the engine | `null` = all |

`E.settings({ ...E.state.get(), now })` is the settings object for every calculation.

## 9. Speed

Measured 2026-11-19 on the saved UEX responses of 2026-11-18, trimmed with the proxy's own `buildMarket` /
`buildTerminals` (2,599 rows, 135 terminals), ship `c2-hercules`, budget 2,000,000, 3 goods per origin, return trip on:

- `buildModel` + `rankRoutes` (2,314 routes): about 20–25 ms in Node 26 and in Chrome.
- `findChains`, 8 stops, beam 200, work limit 400,000: about 105–120 ms (39,524 leg evaluations, not truncated).
- `shipsForBudget`, 40 offers: about 300 ms. This is the one call worth running after the first paint.

The test suite asserts the 300 ms limit for `buildModel` + `rankRoutes` on a generated snapshot of the same size
(always) and on the saved responses (when `C:/VOLT/helper-research/probes/uex-api/data` exists on the machine).

## 10. Known limits

- Demand, restock rate and price movement are not in any of our data; quantities at the destination are never capped.
- Loading by hand, landing and terminal times are guesses (section 6). Auto-load times and fees are game values whose
  units were not confirmed in game.
- The hold model assumes free box rotation and ignores where grids sit in the hull, doors and ramps.
- Travel time is not validated against a timed in-game jump; orbital positions are a snapshot.
- Vehicle prices: 3 UEX vehicles on the 2026-11-18 list match no ship id (Argo ATLS, Argo ATLS GEO, RSI Aurora Mk II);
  name matches are best effort and marked.
- `planMixedLoad` sells everything at one destination; per-good destinations are available only for cargo already on
  board (`whereToSell().perGood`), without a combined route time.
- `whereToSell` time is departure + flight + landing + one terminal visit; unloading is not included because the box
  mix on board is not known.
