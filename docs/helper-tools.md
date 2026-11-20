# Helper tools: mount contract

Written 2026-11-19. This is the contract between the shared shell (navigation, section wrappers, shared helpers)
and the six screen builders. Read it before writing a screen. If something here does not fit your screen,
**do not edit a shared file — report the change you need** (see "Rules").

The tools give players help with trade routes, prices, multi-stop runs, missions, blueprints and mining, from our own data:
game files for facts, UEX only for prices, stock and shop availability.

## Temporary guest access (2026-11-19)

The tools and gear editor, including streamed models, open for guests by default.
Set `FLEET_TOOLS_REQUIRE_MEMBERSHIP=true` in Pages and redeploy to restore their fleet role checks. Ship DB, loadout and trade planner use `COMMUNITY_TOOLS_REQUIRE_MEMBERSHIP` separately. The read-only `/api/tool-access` endpoint reports these settings even when Discord is unavailable. VOLT AI chat and account-specific actions retain their own server-side authorization.

## 1. Sections, files, owners

| Section (hash) | Nav label ko / en | Desktop group | Mount element | Global the file must set | Builder's files (only these) |
|---|---|---|---|---|---|
| `#routes` | 무역 경로 / Trade Routes | 무역 (Trade) | `#routes-app` | `window.VOLT_ROUTES` | `js/routes.js`, `css/routes.css` |
| `#market` | 시세 / Prices | 무역 (Trade) | `#market-app` | `window.VOLT_MARKET` | `js/market.js`, `css/market.css` |
| `#tours` | 여러 곳 돌기 / Multi-stop route (Routes tab) | 무역 (Trade) | `#tours-app` | `window.VOLT_TOURS` | `js/tours.js`, `css/tours.css` |
| `#missions` | 임무 찾기 / Mission Finder | 임무 · 채광 · 제작 | `#missions-app` | `window.VOLT_MISSIONS` | `js/missions.js`, `css/missions.css` |
| `#fabricator` | 제작 / Crafting | 임무 · 채광 · 제작 | `#fabricator-app` | `window.VOLT_FABRICATOR` | `js/fabricator.js`, `css/fabricator.css` |
| `#mining` (existing) | 채광 / Mining | 임무 · 채광 · 제작 | `#mining-app` | `window.VOLT_MINING` (existing shape, see 2.2) | `js/mining.js`, `css/mining-extra.css` |
| `#starmap` (added 2026-11-19) | 성계지도 / Star Map | 임무 · 채광 · 제작 | `#starmap-app` | `window.VOLT_STARMAP` (2.1 shape plus `href`, `open`) | `js/starmap.js`, `js/starmap-viewer.js` (ES module, loaded with `import()` when the map opens), `css/starmap.css` — see `docs/starmap.md` |

The existing Trade Planner, Hub and Guide keep their original addresses. Hauling is now under Missions.

Each builder may also add **its own test files**: `tests/smoke/<section>*.spec.js` and `tests/functions/<section>*.test.mjs`.

Shared files — builders never edit these:

| File | Owner | What it holds |
|---|---|---|
| `index.html`, `js/navigation.js`, `js/i18n.js`, `sw.js`, `css/styles.css`, `_headers` | integrator | section wrappers, nav, headings, precache list, shared tokens |
| `js/helper-common.js` | integrator | `window.VOLT_HELPER` (section 4) |
| `js/trade-engine.js` | engine engineer | `window.VOLT_TRADE_ENGINE`: pure calculations for routes / market / tours, and the shared selections store (section 5) |
| `scripts/check-inner-html.mjs`, `scripts/check-syntax.mjs` | integrator | each of the five new screen files already has a baseline of 1 |
| `js/main.js`, `tests/smoke/helpers.js`, `tests/smoke/helper-shells.spec.js`, `docs/helper-tools.md` | not a builder file | |

The section wrapper (`<section id>`, heading, subtitle, mount `div`) is already in `index.html`.
The mount element carries the classes `helper-app <section>-app` and is empty until your `init` fills it.
Section heading and subtitle are static i18n text (`<section>.titleHtml`, `<section>.subtitle` in `js/i18n.js`); everything inside the mount is yours.

Script order in `index.html` (all `defer`, classic scripts, no modules): `i18n.js` → `helper-common.js` → … → `trade-engine.js` → … → `mining.js`, `hauling.js`,
`routes.js`, `market.js`, `tours.js`, `missions.js`, `fabricator.js` → … → `main.js`. So `VOLT_HELPER`, `VOLT_I18N` and `VOLT_TRADE_ENGINE` exist when your file runs.
Your CSS file is already linked in `<head>` and precached by the service worker; nothing to wire.

## 2. What each file must expose

### 2.1 New screens (`routes`, `market`, `tours`, `missions`, `fabricator`)

A classic IIFE with `'use strict'` that sets one global:

```js
window.VOLT_ROUTES = {
    init(mount, ctx) {},        // required
    onLanguageChange(lang) {},  // optional
    onRoute(params) {},         // optional
};
```

- `init(mount, ctx)` — called **once**, the first time the section is shown (not at page load).
  `mount` is the mount element. `ctx = { section: 'routes', lang: 'ko' | 'en', params: { … } }`, where `params` are the hash values at that moment (section 3).
  Draw a loading state synchronously, then load data. Return value is ignored. If `init` throws, the shell shows a "could not load" message in the mount.
- `onLanguageChange(lang)` — called on every language switch **after** `init` has run. Redraw everything in the new language. See 2.3.
- `onRoute(params)` — called each later time the section is shown or its hash values change (menu click, back / forward, a pasted link,
  `VOLT_HELPER.go(...)` from another screen). `params` is `{}` when the hash is the bare `#routes`. It is not called for values your own `writeHash` wrote,
  and not twice for the same values while the section stays open.

The shell does the rest: section switching, active nav state, document title, lazy first render.
Do not listen to `hashchange` / `popstate` yourself and do not call `VOLT_I18N.onChange` yourself.

### 2.2 Mining (`js/mining.js`)

Keeps its existing shape because `js/main.js` and `js/journey.js` call it: `window.VOLT_MINING = { render, open(resourceId, locationId) }`.
`render()` is called by `main.js` on first show and again on every language change; the file keeps its own `VOLT_I18N.onChange` redraw as today.
New parts go inside `#mining-app`, styled in `css/mining-extra.css` (existing `.mining-*` rules in `css/styles.css` stay as they are).
`#mining?key=value` now reaches the section (the router strips the values). The shell does **not** call `onRoute` for mining;
read `VOLT_HELPER.readHash('mining')` in `render()`, and write with `VOLT_HELPER.writeHash('mining', …)`.
`tests/smoke/mining.spec.js` and `tests/smoke/journey.spec.js` must keep passing.

### 2.3 How a language change is signalled

`window.VOLT_I18N.setLang()` → `js/helper-common.js` calls `onLanguageChange('ko' | 'en')` on every new screen whose `init` has already run.
Inside your code, `VOLT_HELPER.lang()` always returns the current language. Keep screen text in a `TEXT = { ko: {…}, en: {…} }` table in your own file
(`const t = VOLT_HELPER.translator(TEXT)`), not in `js/i18n.js`. Names from data files are `{ en, ko? }`: use `VOLT_HELPER.name(obj)`
(Korean patch name when there is one, otherwise the English name — never translate a game name yourself).

### 2.4 Drawing and security rules (checked by scripts and tests)

- One `innerHTML` sink per screen file, in a single `draw()`; every dynamic value goes through `VOLT_HELPER.esc()`. Or build with `VOLT_HELPER.el()` and use none.
  `node scripts/check-inner-html.mjs` fails if a file has more than one.
- CSP: no inline `<script>`, no `style="…"` attributes or `<style>` elements, no `eval`, no `blob:`; `fetch` only to the same origin.
  Set dynamic sizes / colours through `element.style.setProperty(...)` in JS or with classes and data attributes.
- All selectors in your CSS start with `.<section>-app` (mining: `.mining-app`). Use the tokens in `css/styles.css` (`--color-*`, `--radius-*`, `--volt-orange`, `--font-family`).
  Shared classes you may use inside the mount: `.helper-soon` (placeholder / empty box), `.visually-hidden`.
- Must work at 375 px and 1440 px without sideways page scroll, be usable by keyboard (real `button` / `a` / `input`, visible focus, 44 px touch targets), in Korean and English.
- No personal data leaves the browser. Nothing from Erkul. Do not copy data, wording, formulas-as-written, constants, code, layout or look from other fan sites.

## 3. Hash formats

Grammar, the same for every tool section: `#<section>` or `#<section>?<key>=<value>&<key>=<value>` — `URLSearchParams` encoding after the `?`, keys sorted, empty values left out.
Lists are comma-separated. Include / exclude chip sets use `VOLT_HELPER.chips().encode()`: included ids as they are, excluded ids with a leading `-`
(`sys=stanton,-pyro`). Ids therefore must not contain `,` and must not start with `-`.

Only state that makes a view shareable goes in the hash. "My" selections (ship, budget, where I am, price age cut-off, time settings) go in the shared store (section 5),
not in the hash — a shared link must not overwrite the other player's own ship or budget.

One exception, routes only (added 2026-11-19, **owner to confirm**): the link made by the routes screen's "copy this view" button also carries the sender's
conditions (`ship`, `b`, `sys`, `age`, `bx`, `tm`, `cap`, `g`, `il`, `rt`, `af`) so the recipient sees the same numbers. They are a **read-only overlay**:
shown with a banner and locked controls while that address is open, never written to the recipient's store, dropped by "Use my own setup".
No other screen puts ship or budget in the hash; market and tours say next to their copy button that ship, money and cut-off are not in the link.

Never build or parse the string by hand; use `readHash`, `writeHash`, `shareUrl`, `go` (section 4).

Reserved keys. Keys marked **link** are the cross-screen contract: other screens may send a player to you with them, so they must keep working.
All other keys in your section are yours to define; keep them short and lower-case and list them in the header comment of your file.

| Section | **link** keys | Private keys (as built; the header comment of each screen file is the full list) |
|---|---|---|
| `routes` | `c` UEX commodity id · `from`, `to` UEX terminal id (`from` + `to` without `d` opens that route's detail) | `d` open detail `"from.to"`, `d=0` = both places chosen but detail closed · `sort` = `perHour` \| `profit` \| `margin` \| `roi` · `st=1` stations only · `full=1` full loads only · `fresh=1` reports within 24 h · share-overlay keys (see above): `ship`, `b` budget, `sys`, `age` cut-off days, `bx` box sizes (dot-separated), `tm` changed time settings, `cap` typed hold size, `g` goods per stop, `il=1` illegal included, `rt=0` no trip back, `af=1` skip full shops |
| `market` | `tab` = `prices` \| `stations` \| `movers` \| `ships` (without `tab`: `stations` when only `t` is given, otherwise `prices`) · `c` UEX commodity id · `t` UEX terminal id | `q`, `sys` (chips), `sort` = `margin` \| `marginPercent` \| `name` · `fac` facility filter (comma list: `refinery,freightElevator,autoLoad,loadingDock`) · `box` largest box at least this size · `ht`, `hc` terminal and commodity whose price history is open · `ship` ship whose hold is shown · `mode` = `buy` \| `rent` \| `both` · `scan=1` price-changes scan was run |
| `tours` | `stops` UEX terminal ids in order, comma-separated (opens that tour's plan) | `tab=mix` · `start`, `end` · `n` places 2–8 (**written after a default search too**, so a reload keeps the list) · `rt=1` back to start · `goal` = `profit` \| `short` · `leg` max minutes per leg · `same=1` one system · `diff=1` · `g` goods per stop · `ill=1` include illegal / unknown-legality cargo (default: legal only) · mixed-load keys `mix`, `at`, `fx`, `fill`, `dest`, `to`, `by`, `cg` |
| `missions` | `place` a place (game record name = star map object id; sent by the star map): only missions offered there, or that list it as a possible mission site · `m` contract id from `data/contracts/missions.json` (detail view) · `tab` = `list` \| `rank` \| `path` · `tab=rank&m=<id>` is still accepted as "calculator for this mission" | `cm` the calculator's mission id (what the screen itself writes) · `rep`, `pair` · `pp`, `prep`, `pto`, `psys` (rank path) · list: `q`, `view=table`, `sort` (leading `-` = descending), chips `type`, `sys`, `org`, `con`, `scope`, `ev`, `flag`, `scu` = `"min-max"`, `box` largest box, `rank`. `con` is a **name-based id** (e.g. `con=covalex`); old numeric `con` values are dropped with a message |
| `fabricator` | `bp` blueprint id from `data/crafting/blueprints.json` · `mat` material (resource) id, or an include / exclude chip set of them | `tab` = `list` \| `mats` \| `pools` \| `trades` \| `cart` · `q`, `cat`, `sub`, `sz`, `own`, `pool` · `list` shopping list `<blueprint id>.<count>,…` — when it differs from the saved list it is shown as a **view-only received list** and nothing is saved until the player chooses · `ql` material quality 0–1000 (only when not the default) · `tt` trade type = `ships` \| `items` |
| `mining` | `m` mineral id · `loc` location id from `data/mining/mining.json` · `tab` = `location` \| `sig` \| `ref` (refinery finder) | `q`, `mode`, `lay` = `table` \| `matrix`, chips `type`, `sys` · `sites=1` show the event / cave / facility tables · signal finder `sv`, `sm`, `st`, `sv2` · `ores` UEX mineral ids for the refinery finder |
| `hauling` | none (prefix reserved, the screen does not read values today) | |
| `starmap` | `sys` = `stanton` \| `pyro` \| `nyx` (optional; found from the places when left out) · `focus` one place (selects it and moves the camera) · `route` places in order, comma-separated (numbered stops, real distance per leg, a leg to another system is flagged with its jump point) · `mark` places to highlight, comma-separated · `area` mining area ids (`mining.json` / `helper.json` locations of `kind: "area"`) · `site` one mission site id (`missions.json` `locations[].id`). A **place** is a game record name (`world.json` `locations[].id` / `bodies[].id`, mining body and place ids, `missions.places` keys) **or a UEX terminal number** (commodity or refinery terminal) | `m` two places being measured `"a,b"` · `hid=1` also show places the in-game map hides · `off` map types switched off · `with` = `trade,refinery,mine,mission` (only places with that link). Build links with `VOLT_STARMAP.href({...})` or `VOLT_HELPER.buildHash('starmap', {...})`; inside another screen use `VOLT_STARMAP.links.button(params, opts)` — it returns the shared "지도에서 보기" link only when the place can be shown on the map (`data/starmap/links.json`), otherwise `''`; full description in `docs/starmap.md` (3.1) |

UEX ids are the `c` / `t` numbers of `/api/uex/market` and `/api/uex/terminals` (see `docs/uex-endpoints.md`).
Unknown keys and unknown ids must be ignored quietly (show the default view), never throw.

The router (`js/navigation.js`) accepts `?…` only on these sections (and `#gear`); `#routes?x=1` opens `#routes`.
A menu click always goes to the bare `#<section>`.

When only the values change and the same section stays open, the router does not hide and re-show the section. It still scrolls to the top
for a link or `go(...)`, but **not** for browser Back / Forward inside the section (browsers with the Navigation API; others behave as before
and scroll to the top) — the screen puts the player back where they were. A screen that restores its own scroll or focus after `onRoute` should
still do it one timer tick later, because the router's scroll runs after `onRoute`.

The navigation groups use `#routes` (round trip, tour, mixed cargo), `#market`, `#missions` (including hauling), `#mining` and `#fabricator`. Old `#tours` and `#hauling` links keep their parameters and open the corresponding tab. Links inside a result carry the commodity, terminal, ship, blueprint or mineral to its destination. The trade planner remains a separate screen.

The helper screens use the server-verified Discord fleet role, independent of the community tools switch. The middleware protects the helper datasets and their five UEX endpoints before the cache lookup. The service worker bypasses those paths. The legacy mining dataset used by the trade planner remains at `data/mining/mining.json`. The expanded mining records are generated at `data/mining/helper.json`.

## 4. `window.VOLT_HELPER` (js/helper-common.js)

Text and names

| Call | Result |
|---|---|
| `lang()` | `'ko'` or `'en'` |
| `translator(TEXT)` | `t(key, vars)` over your `{ ko, en }` table, `{name}` placeholders, falls back to `ko` |
| `text(key, vars)` | shared wording of this file (unknown values, ages, errors, chip states, `copied`, `copyFailed`) |
| `name({ en, ko? })` | display name for the current language |
| `esc(value)` | HTML-escaped string (`& < > " '`) |

Numbers. **A value our data marks unknown is shown as unknown, never as 0 and never estimated silently.**
Every formatter returns the unknown wording for `null`, `undefined`, `''` and non-numbers; `0` is a real value and prints as `0`.

| Call | Result |
|---|---|
| `isKnown(v)` | `true` for a finite number (including 0) |
| `unknown('game' \| 'uex')` | "게임 자료에 없음" / "Not in the game files", or "보고 없음" / "Not reported" for UEX values |
| `num(v, { digits, fixed, unknown })` | `1,234.5` |
| `price(v, { compact, unit, digits, unknown })` | `12,500 aUEC`; unknown defaults to the UEX wording |
| `scu(v)`, `percent(v, { digits })` | `46 SCU`, `12%` |
| `duration(seconds)` | `1시간 20분` / `1 h 20 min` |
| `age(atUnixSeconds)` | `3시간 전` / `3 h ago`; "보고 시각 모름" when missing — **show this next to every price** |
| `ageSeconds(at)` | seconds since the report, or `null` |
| `ageLevel(at, maxAgeDays)` | `'ok'` \| `'old'` \| `'unknown'` against the cut-off; default cut-off `DEFAULT_PRICE_AGE_DAYS` = 3 |
| `sourceLine(dataHeader, uexMeta)` | one line "자료: 게임 파일 · 게임 버전 … · 정리한 날 …" plus, when `uexMeta` is given, "가격·재고: UEX 이용자 보고 · … 받아 옴" (and a notice when the copy is stale). **Every screen shows this.** |

Price age rule (owner decision 2026-11-19): by default only reports up to 3 days old are used; the player can change the cut-off
(`VOLT_TRADE_ENGINE.state` field `maxAgeDays`); the age is always shown. Every estimate is labelled as an estimate together with what it assumes.

Include / exclude chips: `const chips = VOLT_HELPER.chips(encodedOrNothing)`

| Call | Result |
|---|---|
| `get(id)` | `'any'` \| `'include'` \| `'exclude'` |
| `cycle(id)` | any → include → exclude → any; returns the new state |
| `set(id, state)`, `clear()`, `isEmpty()`, `included()`, `excluded()` | |
| `test(values)` | `false` if any value is excluded; otherwise `true` when nothing is included or at least one value is included |
| `encode()` / `decode(string)` | the hash value, e.g. `nyx,stanton,-pyro` |
| `label(state)` | "상관없음 / 포함 / 제외" — use it in `aria-label` / visible state so the chip is not colour-only |

Hash and share links

| Call | Result |
|---|---|
| `readHash(section)` | `{ key: value }` when the address is on that section, otherwise `{}` |
| `writeHash(section, params, { push })` | puts your view state in the address without a new history entry (`push: true` adds one); does not trigger `onRoute` |
| `shareUrl(section, params)` | absolute link for a "copy link" button |
| `copyShareUrl(section, params)` | copies it; resolves `true` / `false` — show `text('copied')` or `text('copyFailed')` |
| `go(section, params)` | open another tool with values, e.g. `go('market', { c: 12 })`; for a plain link use `<a href="#market?c=12">` built with `buildHash` |
| `parseHash(hash)`, `buildHash(section, params)` | low-level |

Data

| Call | Result |
|---|---|
| `loadJson('/data/…/file.json')` | Promise of the parsed file. Adds the site cache version (`?v=YYYYMMDD-NN`, `VOLT_HELPER.CACHE_VERSION`) because `/data/*` is served `immutable` and cached by the service worker; the same file is fetched once per page load; a failed load is retried on the next call. Only `/data/**.json` paths. Do not call `fetch` on data files yourself. |
| `uex(path, { ttlMs, refresh, timeoutMs })` | Promise of `{ data, meta, stale, receivedAt }` from `/api/uex/<path>` — `market`, `terminals`, `refineries`, `vehicle-prices`, `price-history?terminal=<id>&commodity=<id>`, `commodities`, … (`docs/uex-endpoints.md`). Kept in memory for `ttlMs` (default 10 min); parallel calls share one request; `refresh: true` adds `?refresh=1`. `stale` is `meta.stale` (UEX down, older copy served) — say so on screen (`sourceLine` does). |
| `errorType(error)` | `login` (401, community gate, not logged in) · `member` (403, missing role) · `timeout` · `unavailable` (503) · `invalid` (502 or unreadable) · `network` · `data` (game data file) |
| `errorText(error)` | the sentence to show, in the current language |

Failure rule, the same as the existing mining screen: **game-file content stays on screen when prices fail.**
A UEX failure (including the community gate's 401 / 403) only replaces the price parts with `errorText(error)` and a retry button; it never blanks the screen, and your code does not call `console.error` for it (the browser's own "failed to load" line for a 4xx / 5xx answer is expected).
A failed game-data file shows `errorText` with a retry button in the mount.
Prices, stock and shop availability come from UEX only; a missing UEX field is "not reported", not 0 (`docs/uex-endpoints.md` lists what is and is not in the data — there is no demand figure).

DOM

| Call | Result |
|---|---|
| `el(tag, attrs, ...children)` | element built without `innerHTML` (`class`, `text`, any attribute; children are nodes or strings) |
| `comingSoon(mount, section)` | the placeholder the stub files draw; remove the call when your screen is real |

Called by the shell, not by builders: `onSectionShow`, `updateTitle`. Constants: `SECTIONS`, `HASH_SECTIONS`, `DEFAULT_PRICE_AGE_DAYS`, `CACHE_VERSION`.

## 5. Shared selections (`window.VOLT_TRADE_ENGINE.state`, js/trade-engine.js)

Selections several screens need live in `localStorage` under **one** key, `volt-helper-state-v1`, owned by the engine module. Screens never touch `localStorage` for these.

```js
const state = window.VOLT_TRADE_ENGINE.state;
state.get();                    // a copy: { v: 1, ship, budget, system, maxAgeDays, time }
state.set({ ship: 'hull-c' });  // merge, save, notify; returns the new copy
state.subscribe((next) => {});  // called after every set / reset and when another tab changes it; returns an unsubscribe function
state.reset();
state.defaults;                 // { v: 1, ship: null, budget: null, system: null, maxAgeDays: 3, time: {} }
```

| Field | Meaning | Not chosen |
|---|---|---|
| `ship` | my ship: ship id of `data/canonical` / `data/trade/cargo.json` `ships[].id` | `null` |
| `budget` | money I can spend, aUEC | `null` (not 0) |
| `system` | star system I am in, e.g. `'Stanton'` | `null` |
| `maxAgeDays` | price reports older than this are left out. Written by routes, market, tours and (since 2026-11-19) the mining price list | `3` |
| `time` | time settings (loading time and so on); the engine engineer defines the fields | `{}` |

Subscribe in `init`, redraw when it changes, and write through `set` when the player changes a selection on your screen, so the other screens follow.
A screen that needs another shared field reports it to the engine engineer; it does not add a second `localStorage` key for cross-screen data.
Screen-private preferences (a remembered tab, a collapsed panel) may use your own key `volt-<section>-…`.

The calculation functions of `js/trade-engine.js` are described in `docs/trade-engine.md`; the `state` API, key and defaults above stay.

The existing trade planner (`#trade-planner`, `js/journey.js`) does **not** read this store yet: it still uses the 60-minute rule of
`js/journey-calc.js`. The calculation accepts the cut-off since 2026-11-19 (`choices.maxAgeDays`), see `docs/connected-tools.md`.

## 6. Rules

1. Edit only the files in your row of the table in section 1 (plus your own test files). No `git commit`, `stash`, branch switch or push.
2. Needed a change in a shared file (a nav label, a heading, a new shared helper, a new shared state field, a baseline, a new data path in the service worker, a header)?
   **Report it in your final answer** with the exact file, the change, and why. Do not make it yourself, do not work around it by copying a shared helper into your file.
3. Game files are the truth. Unknown is shown as unknown ("게임 자료에 없음"), never 0, never silently estimated. Estimates are labelled with their assumptions.
4. Korean wording follows the in-game Korean patch names in the data; UI words are plain, non-technical Korean.
5. Show data source and game version on every screen (`sourceLine`), and the age of the report next to every price (`age`).
6. Before saying it works: `node scripts/check-syntax.mjs`, `node scripts/check-inner-html.mjs`, `node scripts/check-i18n.mjs`, `npx biome lint <your files>`,
   `node --test tests/functions`, your Playwright spec **and** `tests/smoke/helper-shells.spec.js` (it must stay green: every section opens from the menu in ko and en
   at 375 and 1440 px with no console error, no failed request and no CSP violation). In browser tests stub `/api/uex/*` with fixtures — the dev server has no Functions;
   `tests/smoke/helpers.js` `mockApi(page)` answers them with an empty list by default. Look at screenshots of your screen at both widths.

## 7. Integrated navigation and access

Trade has five menu entries: Routes, Prices, Trade Planner, Trade Hub and Trade Guide. Missions, Mining and Crafting have one entry each. The old tours and hauling links resolve to the corresponding tab, including parameters. The implementation mounts listed above remain separate so old shared links and browser Back keep working.

All integrated helper screens require the fleet role, even when community tools are public. The server checks protected helper data and UEX requests before reading the asset or a cached response. The service worker skips those paths. The base mining data used by the existing planner stays at its existing URL. The enhanced mining guide reads `/data/mining/helper.json`.

The star map (`#starmap`) is in the "임무 · 채광 · 제작" group (desktop menu, mobile menu, footer) and follows the public helper policy, including original planet pictures. When membership is required it uses the same fleet check: `data-fleet-helper` on the section, so a visitor without the role sees the shared notice and the screen's `init` never runs — no request goes to `/data/starmap/**`, `/assets/models/starmap/**`, `js/starmap-viewer.js` or three.js. The server protects the first two paths; the service worker skips them.

Routes and Prices share the user's ship, budget, system and maximum report age. The default is three days, including in the planner and AI journey context. Local previews of market data need a Functions server or the UEX proxy. Static preview alone only tests the layout.
