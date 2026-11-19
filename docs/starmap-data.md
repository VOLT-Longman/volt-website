# Star map data: the contract

Written 2026-11-19 for game build `4.10.200.58746`. This is what the star-map screen (`#starmap`, 성계지도) codes against.
Every number below was produced by running `scripts/starmap/build-starmap-data.mjs` and `tests/functions/starmap-data.test.mjs` on that date.
Planet pictures are a separate subject: see `docs/starmap-assets.md`.

The map exists to **show where the places of the trade, mission and mining screens are**. So the ids here are the ids those screens
already use, and section 6 says exactly how each of their keys lands on a map object.

## 1. Files

| File | Raw bytes | gzip bytes (level 9, Node zlib) | Holds |
|---|---|---|---|
| `data/starmap/index.json` | 32,927 | 7,171 | systems, counts, label tables, jump links, lookups, coverage |
| `data/starmap/stanton.json` | 331,153 | 56,295 | 805 objects |
| `data/starmap/pyro.json` | 138,998 | 19,249 | 315 objects |
| `data/starmap/nyx.json` | 88,461 | 14,275 | 116 objects |
| `data/starmap/links.json` | 72,591 | 12,123 | what the other screens may link to (see below); derived from the four files above |

Load `index.json` first, then **only the system being shown**. Only Stanton, Pyro and Nyx exist in the game files.

`links.json` is for the trade, mission and mining screens, which show a "지도에서 보기" link only when the map can show the place and must not
download the system files to find out. It is written by `scripts/starmap/build-link-index.mjs` (called by the main build; `node scripts/starmap/build-link-index.mjs [--check]`
rebuilds or checks it from the files on disk) and holds no new facts:
`places { system: [object id] }` (objects with `pos`), `guess { system: [object id] }` (no `pos` but a `guess`: the map marks them "추정"),
`uex { UEX terminal id: object id }` (commodity and refinery terminals), `areas` (= `index.regionSystems`),
`sites { mission site id: { at?: [n], near?: [n], spots?: count } }` where `n` indexes the flat list places.stanton + places.pyro + places.nyx + guess.stanton + guess.pyro + guess.nyx.
Objects with neither `pos` nor `guess` are left out, so nothing links to them. `tests/functions/starmap-data.test.mjs` checks the file against the system files.
The files hold no art and no secrets; they are ordinary data files like `data/trade/world.json`.

Build (read-only on the game; needs the same cache folder as the trade / mining / mission builds):

```powershell
node scripts/starmap/build-starmap-data.mjs --cache-dir <folder with Game2.dcb, global.ini, build.json> --ko-ini "<LIVE>\data\Localization\korean_(south_korea)\global.ini"
node scripts/starmap/build-starmap-data.mjs --cache-dir <...> --ko-ini <...> --check     # writes nothing, exit 1 when files differ
node --test tests/functions/starmap-data.test.mjs
```

- The walk over `Data.p4k` takes about 15 s and is cached as `<cache-dir>/starmap/walk-<build>.json`; `--rewalk` ignores the cache. A cached and a fresh walk gave identical files (`--rewalk --check`: all "same").
- **Build order:** `data/trade/world.json`, `data/mining/helper.json`, `data/mining/mining.json`, `data/contracts/missions.json` first. This script joins to them, refuses a different game build, and must be re-run after any of them changes.
- Never edit the JSON by hand. Wrong data is fixed in the script.

## 2. Rules the screen must keep

1. **Nothing moves.** The game files hold fixed positions only (no orbital speed is ever set). There are no speed, period or angle fields here. Do not animate orbits.
2. **A missing field means "게임 자료에 없음"**, never 0. `r`, `qt`, `phys`, `name`, `pos` can each be absent.
3. **Flags mean "we inferred this"**: `guess`, `derived`, `via`, `own`, `toName`. Show such things as "추정", or leave them out. Everything without a flag is a value read from the files.
4. **No position → no spot.** Objects with `nopos: 1` have no `pos`. List them under their `parent` as "위치 자료 없음". Never place them.
5. **Each system has its own frame.** There is no shared frame between systems; do not draw two systems in one coordinate space. `systems[].galactic` is three raw numbers with no unit.
6. **z matters.** Planets and moons lie at z = 0, but Stanton's jump points do not (the Nyx one is 20.2 Gm above the plane, the Pyro one 2.7 Gm below), and many asteroid points are off-plane.

## 3. `index.json`

```
schema            1
version           "4.10.0.13165946"        same string the other data files carry
gameVersion       "4.10.200.58746"
source            "game-files"
sourceHash        sha256 of Game2.dcb (equal to world.json / helper.json / missions.json sourceHash)
koSource          "korean-patch" (absent when built without --ko-ini)
builtAt           ISO time (only changes when the content changes)
joinedWith        { "data/trade/world.json": <its sourceHash>, ... }
assetVersion      null     PLACEHOLDER. The texture release id is `assetVersion` in data/starmap/textures.json; read it there.
texturesIndex     "data/starmap/textures.json"
units             short reminder of the units below
systems[]         see 3.1
kinds             { <kind>: { name: {en, ko}, own?: 1 } }
types             { <game type>: { kind, name?: {en, ko}, surface?: 1, qt?: 1, marker } }
amenities         { <code>: { name: {en, ko}, game } }       same codes as world.json `amenities`
laws              { <jurisdiction id>: { name: {en, ko?} } }
starColor         { linearRgb: [1, 0.491, 0.1683] }          the stars' star-map material colour (linear RGB); stars have no texture
links[]           the 3 working jump links, see 5.3
regionSystems     { <mining area id>: [system ids] }          which system file(s) hold that region
siteSystems       { <mission location id>: [system ids] }     which system file(s) hold that mission site (410 entries)
dropped           { <reason>: count }                         records left out, see 7
coverage          join results, see 6
checks            numbers from the build (walk statistics, missing containers, rest-stop rule test, texture summary)
```

### 3.1 `systems[]`

```json
{ "id": "pyro", "name": { "en": "Pyro", "ko": "파이로" }, "star": "PyroStar", "file": "data/starmap/pyro.json",
  "counts": { "objects": 315, "positioned": 287, "noPosition": 28, "hidden": 72, "noName": 14, "byKind": { "star": 1, "planet": 6, "...": 0 } },
  "reachM": 76318379357, "galactic": [40.1261, 8.4149, -17.2174],
  "frame": { "origin": "PyroStar", "rootRotation": [0.73592, 0, 0, -0.677068] },
  "bytes": { "raw": 138998, "gzip": 19249 } }
```

- `reachM`: distance in metres from the star to the farthest positioned object (camera fit). Stanton 69.6 Gm, Pyro 76.3 Gm, Nyx 48.0 Gm.
- `frame.rootRotation`: present only for Pyro. The Pyro star container is turned about z (quaternion w,x,y,z, about -85°) and this turn **is applied** to every Pyro position, the same as `world.json` does. Whether the game shows Pyro turned this way was not determined; distances inside Pyro do not depend on it.
- `galactic`: `SSolarSystem.galacticPosition`, raw, unit unknown.

Counts per system:

| System | Objects | With position | No position | Hidden in the game map (`h`) | No name |
|---|---|---|---|---|---|
| Stanton | 805 | 805 | 0 | 360 | 4 |
| Pyro | 315 | 287 | 28 | 72 | 14 |
| Nyx | 116 | 111 | 5 | 92 | 0 |

| Kind | Stanton | Pyro | Nyx |
|---|---|---|---|
| star | 1 | 1 | 1 |
| planet | 4 | 6 | 3 |
| moon | 12 | 6 | 1 |
| lagrange | 20 | 25 | 0 |
| jump | 3 | 7 | 6 |
| station | 47 | 25 | 20 |
| city | 4 | 5 | 0 |
| outpost | 473 | 106 | 8 |
| poi | 4 | 0 | 0 |
| nav | 2 | 0 | 0 |
| asteroid | 234 | 134 | 77 |
| anomaly | 1 | 0 | 0 |

### 3.2 Kinds and labels

`kind` is the map's own small set. `type` is the game's `StarMapObjectType` name, kept as it is.

| kind | Game types | Label en / ko | Label source |
|---|---|---|---|
| `star` | Star | Star / 항성 | game |
| `planet` | Planet | Planet / 행성 | game |
| `moon` | Moon | Moon / 위성 | game |
| `lagrange` | Asteroid whose id is `<System><n>_L<m>` | Lagrange Point / 라그랑주 점 | game |
| `jump` | Anomaly or JumpPoint whose id is `JumpPoint_<here>_<there>` | Jump point / 점프 포인트 | **ours** (`own: 1`) |
| `station` | Manmade, Manmade_VisibleOnInteraction | Manmade / 인공구조물 | game |
| `city` | LandingZone | Settlement / 정착지 | game |
| `outpost` | Outpost, Outpost_InvalidQT | Outpost / 전초기지 | game |
| `poi` | PointOfInterest | Point of interest / 관심 지점 | **ours** (`own: 1`) |
| `nav` | NavPoint | Nav. Point / 이동 지점 | game |
| `asteroid` | Asteroid, Asteroid_ValidQT | Asteroid / 소행성 | game |
| `anomaly` | Anomaly (not a jump point) | Anomaly / 이상현상 | game |

"game" labels are the Korean patch's own marker texts (`@Markers_Subtext_*`). The game has no text for jump points and points of interest, so those two are ours.
`station` covers rest stops, gateway stations, comm arrays, Levski, Grim HEX and the Nyx belt stations; the game calls all of them "인공구조물". The screen may choose a friendlier word; it is then the screen's wording, not the game's.

## 4. A system file

```
schema, version, gameVersion, source, sourceHash, koSource    as in index.json
system      "stanton" | "pyro" | "nyx"
name        { en, ko }
star        id of the star object
frame       as in index.systems[].frame
objects[]   section 4.1. Tree order: the star first, every object after its parent, siblings sorted by kind then id.
jumps[]     section 5.3
regions[]   section 5.4
sites{}     section 5.5
```

### 4.1 Object fields

`id`, `kind`, `type` are always present. Everything else is present only when it has a value.

| Field | Type | Meaning | Source |
|---|---|---|---|
| `id` | string | **StarMapObject record name.** Stable join key; unique across the three systems | DCB |
| `kind` | string | section 3.2 | derived from `type` and `id` |
| `type` | string | `StarMapObjectType` name; details in `index.types[type]` | DCB |
| `parent` | id | nearest kept ancestor in the game's own tree (`StarMapObject.parent`). Absent only on the star | DCB |
| `name` | `{en, ko?}` | resolved name. **No `ko` = the Korean patch text is identical to the English** (codes such as "PYR6 L1-C") | global.ini |
| `noName` | 1 | the record's name key is a placeholder or missing from global.ini. Show "이름 자료 없음"; do not invent a name | |
| `pos` | `[x,y,z]` | whole metres, system frame, star at 0,0,0 | Data.p4k containers |
| `nopos` | 1 | not placed in the system containers. Exactly one of `pos` / `nopos` is present | |
| `guess` | `{at, by}` | only with `nopos`: the object this place most likely sits at, from its record name. **추정.** See 5.2 | ours |
| `more` | `[[x,y,z],…]` | the same record is placed again at these points (belt segments, repeated bases) | Data.p4k |
| `in` | id | nearest object above it in the **container** tree, when that is not `parent` (a rest stop is `in` its Lagrange point, a gateway station `in` its jump point) | Data.p4k |
| `body` | id | the planet or moon whose container holds it, when it is within 3 body radii of the centre | Data.p4k |
| `rel` | `[x,y,z]` | whole metres from the centre of `body`, in the body's own (body-fixed) frame | Data.p4k |
| `geo` | `[lat, lon, alt]` | degrees, degrees, metres above the container radius (`phys.r`; falls back to the map radius `r` when absent). From `rel`: lat = asin(z/d), lon = atan2(y, x) | derived |
| `surf` | 1 | on the ground: the game type is a surface type and there is no station between it and the body | DCB |
| `r` | number | `StarMapObject.size` in metres: the body radius for stars, planets, moons. Left out when the game holds its placeholder 0.1 or 1 | DCB |
| `qt` | `[obstruction, arrival, adoption]` | quantum-travel radii in metres. Absent = the record has no such block | DCB |
| `icon` | string | `navIcon` when it is not `Default`: `Star`, `Planet`, `Moon`, `Station`, `Outpost`, `LandingZone` | DCB |
| `law` | id | jurisdiction of the object or its nearest ancestor that has one; names in `index.laws` | DCB |
| `am` | `[code,…]` | amenities, codes in `index.amenities` (same as `world.json`) | DCB |
| `h` | 1 | `hideInStarmap`: the game's own map does not list it. Not a reason to hide it here if a screen links to it | DCB |
| `sub` | 1 | `onlyShowWhenParentSelected`: the game shows it only when its parent is selected | DCB |
| `orbit` | 1 | `showOrbitLine`: the game draws an orbit ring for it (a drawn ring; nothing moves) | DCB |
| `rings` | `[{inner, outer, depth, density, size}]` | asteroid ring around this body, metres. Only `StantonStar` and `Stanton2c` have one | DCB |
| `tex` | string | texture key for the globe; files are listed in `data/starmap/textures.json` under the same key | Data.p4k material |
| `texNone` | string | why a star / planet / moon has no `tex`: `star` (the game has no star texture), `borrowed` (its material is another body's), `none` (no colour map) | |
| `phys` | `{r, rot, atmo, g, gas?}` | raw numbers from the body's own container: radius (m), rotation value, atmosphere height, gravity, gas giant flag. **Units of `rot`, `atmo`, `g` are not stated in the files. Unverified.** | Data.p4k |
| `jump` | `{usable, to?, toName?, peer?, station?}` | on `jump` objects, section 5.3 | Data.p4k |
| `gate` | id | on a station: the jump point it stands next to | derived (distance) |
| `trade` | 1 | it is a location in `data/trade/world.json` | join |
| `uex` | `[n,…]` | UEX commodity terminal ids mapped to it (`world.joins.terminals.map`) | join |
| `refinery` | 1 | it is in `helper.json` `refineries` | join |
| `uexRef` | `[n,…]` | UEX refinery terminal ids mapped to it (`world.joins.refineries.map`) | join |
| `mine` | 1 | it is a body-kind location of `mining.json` / `helper.json` | join |
| `areas` | `[id,…]` | mining area tables found at this object (section 5.4) | join |
| `mission` | 1 | it is a key of `missions.json` `places` | join |

Examples, copied from the generated files:

```json
{"id":"Stanton1_Lorville","kind":"city","type":"LandingZone","parent":"Stanton1","name":{"en":"Lorville","ko":"로어빌 [Lorville]"},
 "pos":[12850128104,-752435,572120],"body":"Stanton1","rel":[-328989,-752435,572120],"geo":[34.864,-113.6165,856],"surf":1,
 "qt":[0,20000,0],"icon":"LandingZone","law":"HurstonDynamics","am":["hXL","svc","gar","hosp","fe","wpn","shipitm","armor","cloth","vboth","food"],
 "sub":1,"trade":1,"uex":[18,51]}

{"id":"RR_HUR_L1","kind":"station","type":"Manmade_VisibleOnInteraction","parent":"StantonStar","name":{"en":"HUR-L1 Green Glade Station","ko":"HUR-L1 그린 글레이드 스테이션 [Green Glade]"},
 "pos":[11561412556,-262923,-484614],"in":"Stanton1_L1","r":1200,"qt":[8000,24000,25000],"icon":"Station","law":"UEE",
 "am":["hL","pM","svc","dock","clin","ref","fe","wpn","armor","cloth","vrent","food"],"trade":1,"uex":[44],"refinery":1,"uexRef":[248]}

{"id":"RR_P1_L2","kind":"station","type":"Manmade_VisibleOnInteraction","parent":"PyroStar","name":{"en":"PYAM-FARSTAT-1-2"},
 "nopos":1,"r":1200,"qt":[8000,24000,25000],"icon":"Station","law":"RoughAndReady","am":["…"],"trade":1,"refinery":1,"mission":1,"guess":{"at":"Pyro1_L2","by":"record-name"}}

{"id":"Pyro5","kind":"planet","type":"Planet","parent":"PyroStar","name":{"en":"Pyro V","ko":"파이로 V"},"pos":[-3912426189,-42758732445,0],
 "r":7812300,"qt":[7885000,8422615,400000000],"icon":"Planet","law":"UnclaimedSpace","orbit":1,"texNone":"borrowed",
 "phys":{"r":7812300,"rot":5.1,"atmo":800,"g":-9.81,"gas":1},"mission":1}
```

## 5. Details

### 5.1 Positions

- Source: `Data/ObjectContainers/PU/system/<sys>/<sys>system.socpak` and every container it references. A child's `pos` is relative to its parent and turned by the parent's rotation (`rot`, quaternion w,x,y,z).
- 198,184 placements read, 196,703 containers opened, greatest depth 10, 5,060 different container files loaded. Three referenced containers are not in the game archive (`apexsandvalakkarevent`, `newbab_iae_analytics`, `ow_entry_a18`).
- **The two gaps of the old trade-data walk are closed.**
  - No depth limit and no path filter: `Hospital_Stanton1_Lorville`, `Hospital_Stanton4_NewBabbage`, `Hospital_Nyx_Levski`, `Stanton2_housing_grimhex_clinic` now have positions.
  - ArcCorp `Area04`, `Area06`, `Area11`, `Area17`, `Area20` are static entities inside `stanton3.ale`. They are decoded (the script scans every `.soc` / `.ale` of every loaded container for such entities; these five and the six jump entities are all it finds).
- For every one of the 326 `world.json` locations and bodies that has a position there, this file's `pos` agrees within 1.5 km (`world.json` is in km).
- A record placed more than once uses the shallowest placement in its own system, then the first; the others are in `more`. Nine objects have `more` (one in Stanton, eight Nyx belt records with 4 to 89 extra placements each).
- One star-map id used by a container has no record in the database; it is ignored.

**Surface places.** `rel` is in the body-fixed frame, so it stays true while the planet spins; `pos` is the same point frozen in the system frame as the files hold it. 452 Stanton and 80 Pyro objects have `surf: 1` (altitudes between about -2 km and +88 km; the high ones are Orison's platforms above Crusader). Nyx has none: its planets point at a container that is not in the archive.

**Not known:** the zero meridian and sign of longitude in the game (ours: +x axis of the body container, lon = atan2(y, x)); the rotation direction and current angle of any body; whether stations in low orbit turn with the body. `body`/`rel`/`geo` are written only within 3 body radii of the centre; that cut-off is ours.

### 5.2 Places without a position (`nopos`)

| System | Objects | What to do |
|---|---|---|
| Pyro | 11 rest stops `RR_P1_L2`, `RR_P1_L3`, `RR_P1_L4`, `RR_P1_L5`, `RR_P2_L3`, `RR_P3_L2`, `RR_P3_L5`, `RR_P5_L1`, `RR_P5_L3`, `RR_P6_L1`, `RR_P6_L2`, the station `RR_P2_LEO`, and 10 clinic records inside them | list and search only; no map marker, trade link or refinery link |
| Pyro | `Pyro_AkiroCluster` (a mining location) | list only |
| Pyro | 5 jump points to systems that are not built (Cano, Castra, Hadrian, Oso, Terra) | list as not usable |
| Nyx | `Delamar` (moon record; its container exists but is not placed in the Nyx system) | list only |
| Nyx | 4 jump points to systems that are not built (Bremen, Odin, Tohil, Virgil) | list as not usable |

`guess` = `{ "at": "<object id>", "by": "record-name" }`: `RR_P<n>_L<m>` → `Pyro<n>_L<m>`, `RR_P<n>_LEO` → `Pyro<n>`, `<station>_CLINIC` → `<station>`.
The rule was tested on the 11 Pyro rest stops that **do** have a position: all 11 sit inside the container of the Lagrange point (or under the planet) their name gives, 448 km to 36,550 km from it. That supports the rule; it does not prove it for the unplaced ones. The current build does not publish a guessed location for any of these stations.

### 5.3 Jump points and links

Each system file: `jumps[]`

```json
{"id":"JumpPoint_Stanton_Magnus","usable":1,"to":"nyx","peer":"JumpPoint_Nyx_Castra","entry":[-62284325326,23467630877,20198402291],"station":"RR_JP_StantonMagnus"}
{"id":"JumpPoint_Stanton_Terra","usable":0,"toName":"Terra","station":"RR_JP_StantonTerra"}
```

| Field | Meaning |
|---|---|
| `id` | the jump point object (its `pos`, `name`, `h` are in `objects`) |
| `usable` | 1 = the container holds a `JumpPoint_Permanent` entity with a link to another built system. 0 = no such entity: **not usable in this build** |
| `to`, `peer` | usable only: destination system id and the jump point at the other end. Decoded from `jumpGateSuperGuid` |
| `entry` | usable only: position of the jump entity itself (system frame, metres), 26 to 65 km from the jump point's `pos` |
| `toName` | not usable only: the far system's name **taken from the record name** `JumpPoint_<here>_<there>` |
| `station` | the gateway station within 1,000 km, when there is one (the station carries `gate`) |

`index.links[]` lists each working link once:

```json
{"a":{"sys":"stanton","jump":"JumpPoint_Stanton_Pyro","station":"RR_JP_StantonPyro","pos":[3310491640,-27979408221,-2676285679],"entry":[3310467546,-27979435518,-2676339224]},
 "b":{"sys":"pyro","jump":"JumpPoint_Pyro_Stanton","station":"RR_JP_PyroStanton","pos":[34178643379,40591998389,0],"entry":[34178635853,40591980167,16472]}}
```

The three working links (each checked to be two-way in the files):

| Link | Jump point records | Gateway stations |
|---|---|---|
| Stanton ↔ Pyro | `JumpPoint_Stanton_Pyro` ↔ `JumpPoint_Pyro_Stanton` | `RR_JP_StantonPyro` ↔ `RR_JP_PyroStanton` |
| Stanton ↔ Nyx | `JumpPoint_Stanton_Magnus` ↔ `JumpPoint_Nyx_Castra` | `RR_JP_StantonMagnus` ↔ `RR_JP_NyxCastra` |
| Pyro ↔ Nyx | `JumpPoint_Pyro_Nyx` ↔ `JumpPoint_Nyx_Pyro` | `RR_JP_PyroNyx` ↔ `RR_JP_NyxPyro` |

Record names mislead: "Stanton_Magnus" leads to Nyx and "Nyx_Castra" to Stanton. Always use `to`, never the id. Display names are right ("닉스 게이트웨이 [Nyx Gateway]").
Not usable: Stanton→Terra (placed, has a station, no jump entity), Pyro→Cano/Castra/Hadrian/Oso/Terra and Nyx→Bremen/Odin/Tohil/Virgil (not placed at all).
All jump point objects have `h: 1` except the four unplaced Nyx ones; the visible things in the game map are the gateway stations.
Jump tunnel length and time are not in the files.

### 5.4 Rings, belts and mining regions

Ring numbers exist in the game for two bodies only (`objects[].rings`, metres):

| Body | inner | outer | depth |
|---|---|---|---|
| `StantonStar` (Aaron Halo) | 19,000,000,000 | 20,500,000,000 | 29,600,000 |
| `Stanton2c` (Yela) | 482,000 | 782,000 | 2,000 |

`regions[]` ties each **mining area table** (the `kind: "area"` locations of `mining.json` / `helper.json`, which are not points) to the map:

```json
{"id":"AaronHalo","type":"belt","name":{"en":"Aaron Halo","ko":"아론 헤일로"},"at":["AsteroidCluster_MiningBase_Stanton1_Medium_01","…","StantonStar"],
 "ring":{"of":"StantonStar","inner":19000000000,"outer":20500000000,"depth":29600000,"density":1,"size":50}}
{"id":"Nyx_KeegerBelt","type":"belt","name":{"en":"Keeger Belt","ko":"키거 소행성대"},"at":["…"],
 "band":{"derived":1,"n":129,"inner":47994997144,"outer":48000004589,"zMin":0,"zMax":397131}}
{"id":"Stanton2c_Belt","type":"belt","name":{"en":"Yela asteroid belt","ko":"옐라 소행성대"},"at":["Pyro6"],"noShape":1}
{"id":"Lagrange_A","type":"lagrange","name":{"en":"Lagrange asteroid field (type A)","ko":"라그랑주 소행성대 (A형)"},"at":["Stanton1_L1","Stanton1_L1_01","Stanton1_L4","Stanton1_L4_01"]}
```

| Field | Meaning |
|---|---|
| `id`, `type`, `name` | the mining location's id, type (`belt`, `lagrange`, `cluster`) and name, as in `helper.json` |
| `at` | map objects in this system where the table is found: the places `helper.json` lists (`usedBy`) plus the nearest map object of every placement of the table's containers. Each of these objects lists the region in `areas` |
| `ring` | game ring numbers of the body the belt sits on (`of`). Draw this |
| `band` | **measured, not stated by the game** (`derived: 1`): smallest and largest distance from the star, and z range, of the belt's own containers (`n` of them). Glaciem Ring is at 15.00 Gm, Keeger Belt at 48.00 Gm. A ring drawn from it is an inference: mark "추정" |
| `noShape` | a belt with neither: the game gives no ring for it (Terminus / `Pyro6`). Show the body, say "게임 자료에 없음" for the ring |

One table can be in two systems (`Stanton2c_Belt` in Stanton and Pyro, `Pyro_DeepSpaceAsteroids` in Pyro and Nyx); `index.regionSystems` tells which.
Pyro and Nyx have no ring records at all; their belts exist only as placed segments.

### 5.5 Mission sites

`missions.json` has two kinds of place keys:

- `places` (185 keys) are StarMapObject record names → they **are** object ids (`mission: 1`).
- `locations` (427 entries, used by `contracts[].sites[].at`) are mission-location templates, not map records. `sites` says where each is placed:

```json
"ASDFacility_WingA-Power": { "at": ["Stanton1a_ASD_Delve_Facility_001", "…"] }
"Outpost_Colonial_Ruin_Medium_Pyro_Occupied_Pyro1": { "at": ["Pyro1_Outpost_col_m_drlct_otpst_occ_002"],
        "spots": [["Pyro1", -7921261278, -2386797107, 144963, -207148, -324389, 144963]] }
"AsteroidClusters_Nyx_Keeger": { "at": ["AsteroidCluster_Nyx_Keeger"], "alt": [["AsteroidCluster_Nyx_Keeger", 0], ["AsteroidCluster_Nyx_Keeger", 1]] }
"AsteroidClusters_Nyx": { "near": ["NyxStar"], "via": "tag" }
```

| Field | Meaning |
|---|---|
| `at` | map objects the site is at (within 100 km of that object's `pos`, and the object is not a star, planet, moon or Lagrange point) |
| `alt` | `[objectId, n]`: at that object's `more[n]` placement |
| `spots` | `[objectId, x, y, z]` or `[objectId, x, y, z, rx, ry, rz]`: the site has its own point. `objectId` is the nearest map object above it (often a planet or the star); x,y,z are system-frame metres; rx,ry,rz are body-fixed metres when it is within 3 radii of that planet or moon |
| `near` + `via: "tag"` | **no placement was found.** The site's tags name these bodies. Body level only: show "… 근처 (정확한 위치 자료 없음)" |

A generic template can be placed in hundreds of spots (`MiningAsteroidBase_Pyro_Hangar` 460 times); `at` is then simply the list of bases. 3,542 placements were read for the 313 placed templates.

## 6. Joins: how each screen's key reaches the map

| Screen data | Key | How to resolve |
|---|---|---|
| `world.json` `locations[].id`, `bodies[].id` | record name | `objects[].id` in the system file of `location.system` (lower-cased) |
| UEX terminal id (`js/trade-engine.js`, `js/routes.js`, `js/market.js`) | number | `world.joins.terminals.map[id]` → object id; or search `objects[].uex` |
| UEX refinery terminal id | number | `world.joins.refineries.map[id]` → object id; or `objects[].uexRef` |
| `helper.json` `refineries[].id` | record name | object id (`refinery: 1`) |
| `mining.json` / `helper.json` `locations[]`, `kind: "body"` | record name | object id (`mine: 1`) |
| `mining.json` / `helper.json` `locations[]`, `kind: "area"` | table id | `index.regionSystems[id]` → `regions[]` in those files |
| `helper.json` `places[].id` | record name | object id; its `areas` contain the place's `tables` |
| `missions.json` `places` keys, `contracts[].at`, `localities[].members` | record name | object id; `StantonSolarSystem` / `PyroSolarSystem` / `NyxSolarSystem` → the star (`coverage.missionPlaces.alias`) |
| `missions.json` `locations[].id` | template id | `index.siteSystems[id]` → `sites[id]` in those files |

Suggested link in: `#starmap/<system>/<object id>`; link back: an object's `trade` / `uex` / `refinery` / `mine` / `areas` / `mission` say which screens know it.

### Coverage (from `index.coverage`, checked by the tests)

| Other screen's keys | Total | On the map | With a position | Not resolved |
|---|---|---|---|---|
| Trade locations (`world.locations`) | 254 | 254 | 245 | 0 |
| Trade bodies (`world.bodies`) | 81 | 81 | 81 | 0 |
| UEX commodity terminals matched by `world.json` | 158 ids → 132 objects | 132 | 132 | 0 (3 more UEX terminals are unmatched in `world.json` itself: 65 Port Olisar, 76 Shady Glen, 422 UEX Station; none is a live game place) |
| UEX refinery terminals | 20 | 20 | 20 | 0 |
| Refineries (`helper.refineries`) | 31 | 31 | 19 | 0 |
| Mining bodies | 26 | 26 | 25 | 0 |
| Mining places (`helper.places`) | 47 | 47 | 47 | 0 |
| Mining areas | 17 | 15 as regions | (see 5.4) | 2 |
| Mission places (`missions.places`) | 185 | 181 + 3 by alias | 159 | 1 |
| Mission sites (`missions.locations`) | 427 | 313 placed + 97 by tag | 313 | 17 |

Everything that is on the map without a position, or not resolved:

- **Trade locations without a position (9):** `RR_P1_L2`, `RR_P1_L3`, `RR_P1_L5`, `RR_P2_L3`, `RR_P2_LEO`, `RR_P3_L5`, `RR_P5_L1`, `RR_P5_L3`, `RR_P6_L2`.
- **Refineries without a position (12):** the 9 above plus `RR_P1_L4`, `RR_P3_L2`, `RR_P6_L1`.
- **Mining body without a position (1):** `Pyro_AkiroCluster`.
- **Mining areas with no region (2):** `Lagrange_G`, `Lagrange_Occupied`. The mining data itself marks both "쓰는 곳 없음" (`unplaced`): no place in the game uses them.
- **Mission places without a position (22):** the 12 unplaced Pyro stations above and their 10 clinic records (`RR_P1_L2_CLINIC`, `RR_P1_L3_CLINIC`, `RR_P1_L5_CLINIC`, `RR_P2_L3_CLINIC`, `RR_P2_LEO_CLINIC`, `RR_P3_L2_CLINIC`, `RR_P3_L5_CLINIC`, `RR_P5_L1_CLINIC`, `RR_P5_L3_CLINIC`, `RR_P6_L2_CLINIC`).
- **Mission place not on the map (1):** `Nyx` (a parentless record that belongs to no system tree).
- **Mission sites not resolved (17):** `Hospital_Grimhex`, `Kaboos_CargoDeck3_Temp`, `Kaboos_Derelict`, `Outpost_Abandoned`, `Outpost_Abandoned_Stanton2`, `Outpost_Abandoned_Stanton2a`, `Outpost_Abandoned_Stanton2a_001`, `Outpost_Abandoned_Stanton2b`, `Outpost_Abandoned_Stanton2b_001`, `Outpost_ASD_MonorailCompound`, `Outpost_ASD_ResearchFacility`, `Outpost_Col_Bunker_Layout012_CFP`, `Outpost_Col_Bunker_Layout014_CFP`, `Outpost_Col_XS_Central002_CFP`, `Outpost_Col_XS_Central006_CFP`, `Prison`, `TheCollectorsAsteriod`. They are not placed in any system container and their tags name no body.
- **Mission sites resolved by tag only (97):** generic ones such as `Planet_Stanton1_Hurston`, `RestStop_Stanton_1`, `LandingZone_Stanton_3`, `JumpPoint_Pyro-Oso`. Body level, `via: "tag"`.

## 7. What is left out, and why

2,133 StarMapObject records in the database; 1,236 kept. The rule is `dropReason()` in the build script, tested first match first:

| Reason | Count | Rule |
|---|---|---|
| `template` | 28 | record name contains `TEMPLATE` or ends with `_Template` |
| `beacon` | 30 | name starts with `MISSION_`, `PLAYER_`, `PARTY_`, `UNATTENDED_`, or ends with `MissionLocation` |
| `uiMarker` | 7 | `YouAreHereMarker`, `CardinalPoint`, `QuantumTracePointStarMapRecord`, `PlaceholderStarMapRecord`, `SpecialEvent*`, or type YouAreHere / CardinalPoint / QuantumTracePoint |
| `solarSystemRecord` | 3 | type SolarSystem (the star record is the real root) |
| `noSystem` | 28 | no Stanton / Pyro / Nyx star above it in the tree |
| `foreignBody` | 1 | `Ellis3` ("Green"): a planet record of the unbuilt Ellis system hung under `StantonStar`, not placed in Stanton |
| `hiddenUnplaced` | 630 | hidden in the game map **and** not placed in any container **and** no other screen's data refers to it (305 `Nyx_Kaboos_###`, 200 `Pyro#_L#_##` cluster records, …). These look like records the game spawns at run time; that reading is not verified |
| `visibleUnplaced` | 170 | not hidden, but not placed and not referred to (84 `IasiPlatform` event points, generic records such as `CryAstroService`, `Orbital_Relay`) |

Kept regardless of placement: stars, planets, moons, jump points, and anything another screen's data refers to. Kept hidden records (`h: 1`, 524 of them) include 27 of the 45 Lagrange points, 158 mining claims, 120 Onyx facilities and the clinics inside stations: they have real positions and other screens link to them.

## 8. Textures

`tex` is the key rule shared with `scripts/starmap/export-textures.mjs`: material file of the body → its `TexSlot4` texture → file name without extension, lower case. The test compares the 30 keys in the system files with the keys of `data/starmap/textures.json`: identical.

| Body | `tex` / `texNone` | Note |
|---|---|---|
| 16 Stanton, 11 Pyro, 3 Nyx planets and moons | `tex` | one texture each, e.g. `ui_sm_stanton_1_hurston` |
| `StantonStar`, `PyroStar`, `NyxStar` | `texNone: "star"` | flat colour only (`index.starColor`); draw the star yourself |
| `Pyro5` (Pyro V) | `texNone: "borrowed"` | the game points it at the moon Ignis's material; it has no picture of its own. Do not show Ignis's surface on it |
| `Delamar` | `texNone: "none"` | 128 px hologram map only, and no position |

## 9. Not verified

Nothing here was compared with the running game. Specifically:

- Positions, distances and lat/long come from files only. Longitude origin and sign are our convention.
- The orientation of the Pyro system (the -85° turn is applied, as in `world.json`).
- `phys.rot`, `phys.atmo`, `phys.g`: bare numbers. They read as hours per turn, km and m/s², but the files do not say so.
- `r` for `Nyx1`, `Nyx2`, `Nyx3` is exactly 1,000,000 and they have no `qt` or `phys`; `PyroStar` and `NyxStar` share one radius (57,072,000). These look like placeholder values in the game data. They are passed through as they are.
- That the three decoded links are the complete live set, and that Stanton–Terra is closed (inferred from the missing jump entity).
- That unplaced hidden records are run-time spawns.
- `gate` / `station` pairing is by distance (within 1,000 km); it agrees with the gateway names in `world.json` for all 7 gateway stations.
- Jurisdiction inheritance (`law` from the nearest ancestor) is how the trade data reads it too; the game's own rule was not confirmed.
